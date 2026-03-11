// index.js — StudyBot v2
// ══════════════════════════════════════════════════════════════════════════════
// COMANDOS PÚBLICOS:
//   !ayuda                      — Ver comandos
//   !recordatorios              — Ver fechas próximas
//   !tareas                     — Ver tareas aprobadas (con ID numérico)
//   !ver-tarea [n]              — Ver detalle de una tarea por su número
//   !buscar-tarea [consulta]    — Buscar tareas por materia, título o descripción
//   !proponer-tarea             — Proponer una tarea para revisión
//   !proponer-recordatorio      — Proponer un recordatorio para revisión
//   !apuntes                    — Ver apuntes aprobados (con ID numérico)
//   !ver-apuntes [n]            — Ver detalle de un apunte por su número
//   !buscar-apuntes [consulta]  — Buscar apuntes por materia, título o descripción
//   !proponer-apuntes           — Proponer apuntes para revisión
//   !recursos                   — Ver recursos del semestre (con ID numérico)
//   !ver-recurso [n]            — Ver detalle de un recurso por su número
//   !buscar-recurso [consulta]  — Buscar recursos por tipo, título o descripción
//   !proponer-recurso           — Proponer un recurso para revisión
//   !faq                        — Ver preguntas frecuentes
//   !tabla                      — Ver leaderboard
//   !puntos                     — Ver tus propias estadísticas
//   !premio                     — Ver el premio actual del leaderboard
//   (responde citando la pregunta del día para ganar puntos)
//   !admins                     — Ver administradores
//   !recordatorio "T" YYYY-MM-DD [desc]   — Agregar recordatorio
//   !borrar-recordatorio [id]             — Borrar recordatorio
//   !pendientes                           — Ver todas las propuestas esperando revisión (tareas, apuntes, recursos, recordatorios)
//   !aprobar [id]                         — Aprobar tarea, apuntes, recurso o recordatorio propuesto
//   !rechazar [id] [motivo]               — Rechazar tarea, apuntes, recurso o recordatorio propuesto
//   !borrar-tarea [id]                    — Borrar tarea aprobada
//   !borrar-apuntes [id]                  — Borrar apuntes aprobados
//   !borrar-recurso [id]                  — Borrar recurso aprobado
//   !add-faq [keyword1,keyword2] | [q] | [a]  — Agregar FAQ
//   !del-faq [id]                         — Borrar FAQ
//   !add-pregunta fácil|normal|difícil | [pregunta] | [respuesta]  — Agregar pregunta al banco
//   !conf-premio premio | puntos | patrocinador  — Configurar premio del leaderboard
//   !dar-puntos [@mention o número] N [motivo]  — Sumar N puntos manualmente a un usuario
//   !mutear [@mention o número] [min] [motivo]  — Mutear usuario
//   !desmutear [@mention o número]        — Desmutear usuario
//   !muteados                             — Ver usuarios muteados
//   !resumen-semanal                      — Forzar resumen semanal
//   !test-recordatorios                   — Forzar revisión recordatorios
//   !test-actividad                       — Forzar revisión de inactividad
//   !inactivos                            — Ver usuarios inactivos
//   !todos [mensaje]                        — Enviar mensaje privado a todos los miembros del grupo
//   !msg [mensaje]                          — Enviar mensaje al grupo como el bot (solo desde privado)
// ══════════════════════════════════════════════════════════════════════════════

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const config = require('./config.json');

const storage    = require('./handlers/storage');
const { startCrons, checkAndSendReminders, checkAndSendTodayReminders, sendWeeklySummary, parseReminderCommand, formatDate, daysDiff } = require('./handlers/reminders');
const { runModeration, formatTime } = require('./handlers/moderation');
const { buildLeaderboard, buildUserStats }  = require('./handlers/stats');
const { sendScheduledQuestion, processAnswer, buildQuestionsList, parseDifficulty, DIFFICULTY_POINTS, DIFFICULTY_LABELS } = require('./handlers/questions');
const { checkInactivity } = require('./handlers/activity');

// ─── Client setup ─────────────────────────────────────────────────────────────

/**
 * Matches a user-supplied subject string against the configured subjects list.
 * Comparison is case-insensitive and ignores extra whitespace.
 * Returns { name, driveFolder } of the matched subject, or null if not found.
 */
function resolveSubject(input) {
  const subjects = config.subjects || [];
  const norm = s => s.toLowerCase().trim().replace(/\s+/g, ' ');
  const needle = norm(input);
  for (const subj of subjects) {
    const candidates = [subj.name, ...(subj.aliases || [])];
    if (candidates.some(c => norm(c) === needle)) {
      return { name: subj.name, driveFolder: subj.driveFolder || null, notesFolder: subj.notesFolder || null };
    }
  }
  return null;
}

const pfx = config.prefix || '!';

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] },
});

client.on('qr', qr => {
  console.log('\n📱 Escanea este QR con WhatsApp:\n');
  qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => console.log('✅ Autenticado'));

client.on('ready', () => {
  console.log('🤖 StudyBot listo!');
  startCrons(client, config);
});

client.on('auth_failure', () => {
  console.error('❌ Error de autenticación. Borra .wwebjs_auth/ y reintenta.');
});

// ─── Welcome new members ───────────────────────────────────────────────────────

client.on('group_join', async notification => {
  try {
    if (!config.welcome?.enabled) return;
    const chat = await notification.getChat();
    if (chat.id._serialized !== config.groupId) return;

    for (const participantId of notification.recipientIds) {
      try {
        const contact = await client.getContactById(participantId);
        const name = contact.pushname || contact.number;
        const text = config.welcome.message.replace('{name}', name);
        await new Promise(res => setTimeout(res, 5000)); // esperar 5 segundos para que el usuario pueda ver el mensaje de bienvenida
        await chat.sendMessage(text, { mentions: [contact] });
        console.log(`[WELCOME] Nuevo miembro: ${name} (${contact.number})`);
      } catch (err) {
        console.error('[WELCOME ERROR]', err.message);
      }
    }
  } catch (err) {
    console.error('[GROUP_JOIN ERROR]', err.message);
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isAdmin(number) {
  const n = number.replace('@c.us', '').replace(/\D/g, '');
  return config.admins.some(a => a.replace(/\D/g, '') === n);
}

function reply(msg, text) { return msg.reply(text); }

/**
 * Resolves a target user's phone number from:
 *   1. A real WhatsApp @mention (msg.mentionedIds)
 *   2. A short numeric ID (1–4 digits) assigned in activity.json
 *   3. A direct phone number (10+ digits)
 * Returns the phone number string (no @c.us suffix) or null.
 */
function resolveTarget(args, mentionedIds) {
  if (mentionedIds && mentionedIds.length > 0) {
    return mentionedIds[0].replace('@c.us', '');
  }
  const firstToken = args.trim().split(/\s+/)[0];
  if (!firstToken) return null;

  // Short ID: 1–4 digits → look up in activity.json
  if (/^\d{1,4}$/.test(firstToken)) {
    const user = storage.getUserByActivityId(parseInt(firstToken));
    return user ? user.number : null;
  }

  // Direct phone number: strip non-digits and require at least 10
  const num = firstToken.replace(/\D/g, '');
  return num.length >= 10 ? num : null;
}

/**
 * Strips the target identifier (first token or @mention) from args,
 * returning only the remaining text (amount + reason, etc.)
 */
function argsAfterTarget(args, mentionedIds) {
  if (mentionedIds && mentionedIds.length > 0) {
    return args.replace(/@\S+/g, '').trim();
  }
  return args.trim().split(/\s+/).slice(1).join(' ');
}

// ─── Textos de ayuda ──────────────────────────────────────────────────────────

const HELP_PUBLIC = `
📚 *COMANDOS* 📚

📅 *Recordatorios*
• \`!recordatorios\` / \`!r\` — Ver recordatorios
• \`!proponer-recordatorio / !pr "Título" YYYY-MM-DD [desc]\` — Proponer un recordatorio

📂 *Tareas resueltas*
• \`!tareas / !t\` — Ver tareas resueltas
• \`!ver-tarea / !vt [n]\` — Ver detalles de una tarea por número
• \`!buscar-tarea / !bt [consulta]\` — Buscar tareas
• \`!proponer-tarea / !pt materia | título | desc | link / !pt \` — Proponer una tarea para que la revisen

📝 *Apuntes*
• \`!apuntes / !a\` — Ver apuntes disponibles
• \`!ver-apuntes / !va [n]\` — Ver detalle de un apunte por número
• \`!buscar-apuntes / !ba [consulta]\` — Buscar apuntes 
• \`!proponer-apuntes / !pa materia | título | desc | link\` — Compartir tus apuntes 

📦 *Recursos del semestre*
• \`!recursos / !rc\` — Ver recursos disponibles
• \`!ver-recurso / !vrc [n]\` — Ver detalle de un recurso por número
• \`!buscar-recurso / !brc [consulta]\` — Buscar recursos
• \`!proponer-recurso / !prc tipo | título | desc | link\` — Compartir un recurso útil

❓ *Preguntas del día*
• El bot publica preguntas automáticamente a lo largo del día
• _Responde citando la pregunta para ganar puntos (🟢 fácil +2 / 🟡 normal +3 / 🔴 difícil +4)_
• \`!preguntas\` — Ver preguntas recientes con sus respuestas

🏆 *Estadísticas*
• \`!tabla\` — Tabla de puntos del grupo
• \`!puntos\` — Tu puntaje personal
• \`!premio\` — Ver el premio actual
`.trim();

const HELP_ADMIN = `
👮 *Comandos de Admin*

📌 *Recordatorios*
\`!recordatorio "Título" YYYY-MM-DD [desc]\`
\`!borrar-recordatorio [id]\`

📋 *Propuestas (tareas, apuntes, recursos y recordatorios)*
\`!pendientes\` — Ver todas las propuestas esperando aprobación
\`!aprobar [id]\` — Aprobar cualquier propuesta
\`!rechazar [id] [motivo]\` — Rechazar cualquier propuesta
\`!borrar-tarea [id]\`
\`!borrar-apuntes [id]\`
\`!borrar-recurso [id]\`

❓ *FAQ*
\`!add-faq keyword1,keyword2 | Pregunta | Respuesta\`
\`!del-faq [id]\`

🤔 *Banco de preguntas del día*
\`!add-pregunta fácil|normal|difícil | Pregunta | Respuesta\`
_(agrega al banco; se publicará automáticamente según el horario configurado)_

🎁 *Premio*
\`!conf-premio Premio | Puntos | Patrocinador\`

⭐ *Puntos manuales*
\`!usuarios\` — Ver lista de usuarios con su ID
\`!dar-puntos <id|número> N [motivo]\` — Sumar N puntos a un usuario

🔇 *Moderación*
\`!mutear <id|número> [minutos] [motivo]\`
\`!desmutear <id|número>\`
\`!muteados\`

⚙️ *Configuración*
\`!conf\` — Ver configuración actual del bot

🔧 *Pruebas*
\`!test-recordatorios\`
\`!resumen-semanal\`
\`!test-actividad\`
\`!inactivos\`

📢 *Difusión*
\`!todos [mensaje]\` — Enviar mensaje privado a todos los miembros del grupo
\`!msg [mensaje]\` — Enviar mensaje al grupo como el bot _(solo desde privado)_
`.trim();

// ─── Message handler ──────────────────────────────────────────────────────────

client.on('message', async msg => {
  try {
    const contact = await msg.getContact();
    const number  = contact.number;
    const name    = contact.pushname || contact.number;
    const body    = msg.body?.trim() || '';
    const chat    = await msg.getChat();
    const isGroup = chat.isGroup;

    // ── Track activity (solo en grupos) ─────────────────────────────────────
    if (isGroup) storage.updateLastSeen(number, name);

    // ── Moderación (solo en grupos) ──────────────────────────────────────────
    if (isGroup && !body.startsWith(pfx)) {
      const wasMuted = await runModeration(msg, config);
      if (wasMuted) return;

      // ── Respuesta a pregunta del día (reply sin comando) ─────────────────────
      if (msg.hasQuotedMsg && body.length > 5) {
        const result = await processAnswer(msg, number, name, body);
        switch (result.status) {
          case 'not_a_question':
            break; // no es una pregunta del día, ignorar silenciosamente

          case 'incoherent':
            await reply(msg,
              `🤔 Tu respuesta es muy corta.\n\n` +
              `📌 Pregunta: _"${result.question}"_\n\n` +
              `_Escribe algo más elaborado para ganar puntos._`
            );
            break;

          case 'wrong_answer':
            await reply(msg,
              `❌ *Tu respuesta no coincide lo suficiente con la respuesta esperada.*\n\n` +
              `📌 Pregunta: _"${result.question}"_\n\n` +
              `_Intenta incluir los conceptos clave en tu respuesta._`
            );
            break;

          case 'already_answered':
            await reply(msg,
              `✅ Esta pregunta ya fue respondida por *${result.firstAnswerer}*.\n\n` +
              `Tu respuesta igual quedó guardada como aporte adicional, pero los puntos son del primero. 👍`
            );
            break;

          case 'accepted':
            await reply(msg,
              `🎉 *¡Respuesta correcta!*\n\n` +
              `📌 Pregunta: _"${result.question}"_\n` +
              `💬 Tu respuesta quedó guardada.\n\n` +
              `⭐ *+${result.points} puntos* en el leaderboard. ¡Bien hecho!`
            );
            break;
        }
        if (result.status !== 'not_a_question') return;
      }

      // ── FAQ auto-responder ───────────────────────────────────────────────────
      const faq = storage.matchFaq(body);
      if (faq) {
        await msg.reply(`❓ *${faq.question}*\n\n${faq.answer}\n\n_Respuesta automática. Usa \`!faq\` para ver todas las preguntas frecuentes._`);
      }

      return;
    }

    if (!body.startsWith(pfx)) return;

    // ── Parse comando ────────────────────────────────────────────────────────
    // Normalize: treat "! tareas" the same as "!tareas"
    const normalized = pfx + body.slice(pfx.length).trimStart();
    const spaceIdx = normalized.indexOf(' ');
    const rawCmd = spaceIdx === -1 ? normalized.slice(pfx.length) : normalized.slice(pfx.length, spaceIdx);
    const cmd  = rawCmd.toLowerCase();
    const args = spaceIdx === -1 ? '' : normalized.slice(spaceIdx + 1).trim();

    // También moderamos comandos de usuarios muteados en grupos
    if (isGroup) {
      const intercepted = await runModeration(msg, config);
      if (intercepted) return;
    }

    console.log(`[CMD] ${number} (${name}) → ${cmd}`);

    // ══════════════════════════════════════════════════════════════════════════
    // !ayuda
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'ayuda' || cmd === 'help') {
      const text = isAdmin(number)
        ? HELP_PUBLIC + '\n\n' + HELP_ADMIN
        : HELP_PUBLIC;
      await reply(msg, text);
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !admins
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'admins') {
      await reply(msg, `👮 *Administradores:*\n${config.admins.map((n,i) => `${i+1}. +${n}`).join('\n')}`);
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !recordatorios
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'recordatorios' || cmd === 'r') {
      const list = storage.getActiveReminders()
        .sort((a, b) => new Date(a.date) - new Date(b.date));
      if (!list.length) { await reply(msg, '📭 No hay recordatorios pendientes.'); return; }
      const lines = list.map(r => {
        const diff = daysDiff(r.date);
        const when = diff === 0 ? '🚨 HOY' : diff === 1 ? '⚠️ Mañana' : diff <= 3 ? `⏰ ${diff} días` : `• ${diff} días`;
        return `${when} — *${r.title}*\n   📅 ${formatDate(r.date)}\n   📝 ${r.description || '—'}`;
      });
      await reply(msg, `📋 *Recordatorios (${list.length}):*\n\n${lines.join('\n\n')}`);
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !proponer-recordatorio  (cualquiera)
    // Formato: !proponer-recordatorio "Título" YYYY-MM-DD descripción opcional
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'proponer-recordatorio' || cmd === 'pr') {
      if (!args) {
        await reply(msg, '📌 Uso: `!proponer-recordatorio "Título" YYYY-MM-DD descripción opcional`\n\nEjemplo:\n`!proponer-recordatorio "Entrega TP3" 2025-12-20 Subir al campus antes de las 23:59`');
        return;
      }
      const parsed = parseReminderCommand(args);
      if (parsed.error) { await reply(msg, `❌ ${parsed.error}`); return; }

      const saved = storage.savePendingReminder({
        ...parsed,
        suggestedBy: number,
        suggestedByName: name,
      });
      const diff = daysDiff(saved.date);

      await reply(msg,
        `✅ *Sugerencia enviada para revisión*\n\n📌 ${saved.title}\n🗓️ ${formatDate(saved.date)} (${diff === 0 ? 'HOY' : `en ${diff} días`})\n📝 ${saved.description || '—'}\n\n_Un admin la revisará pronto. ¡Gracias!_ 🙏`
      );

      // Notificar a admins en privado
      for (const adminNum of config.admins) {
        try {
          await client.sendMessage(`${adminNum}@c.us`,
            `📌 *Nueva sugerencia de recordatorio*\n\n` +
            `👤 ${name}\n` +
            `📌 ${saved.title}\n` +
            `🗓️ ${formatDate(saved.date)}\n` +
            `📝 ${saved.description || '—'}\n` +
            `🆔 \`${saved.id}\`\n\n` +
            `Aprueba con: \`!aprobar ${saved.id}\`\n` +
            `Rechaza con: \`!rechazar ${saved.id} [motivo]\``
          );
        } catch (e) {}
      }
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !recordatorio (ADMIN) — agrega directamente sin revisión
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'recordatorio') {
      if (!isAdmin(number)) {
        await reply(msg, '🚫 Solo admins pueden agregar recordatorios directamente.\n\n_Usa `!proponer-recordatorio` para proponer uno._');
        return;
      }
      if (!args) {
        await reply(msg, '📌 Uso: `!recordatorio "Título" YYYY-MM-DD descripción opcional`');
        return;
      }
      const parsed = parseReminderCommand(args);
      if (parsed.error) { await reply(msg, `❌ ${parsed.error}`); return; }
      const saved = storage.saveReminder({ ...parsed, addedBy: number });
      storage.saveFaqForReminder(saved);
      const diff = daysDiff(saved.date);
      await reply(msg,
        `✅ *Recordatorio guardado*\n\n📌 ${saved.title}\n🗓️ ${formatDate(saved.date)} (${diff === 0 ? 'HOY' : `${diff} días`})\n📝 ${saved.description || '—'}\n🆔 \`${saved.id}\``
      );
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !borrar-recordatorio (ADMIN)
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'borrar-recordatorio') {
      if (!isAdmin(number)) { await reply(msg, '🚫 Solo admins.'); return; }
      if (!args) { await reply(msg, '❌ Uso: `!borrar-recordatorio [id]`'); return; }
      const remId = args.trim();
      const deleted = storage.deleteReminder(remId);
      storage.deleteFaqsByReminderId(remId);
      await reply(msg, deleted
        ? `🗑️ Recordatorio eliminado.`
        : `❌ No encontré el ID \`${remId}\``
      );
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !tareas
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'tareas' || cmd === 't') {
      const list = storage.getHomework();
      if (!list.length) { await reply(msg, '📭 No hay tareas guardadas aún.'); return; }
      const lines = list.map((hw, i) =>
        `*${i + 1}.* [${hw.subject}] ${hw.title}`
      );
      await reply(msg, `📋 *Tareas disponibles (${list.length}):*\n\n${lines.join('\n')}\n\n_Usa \`!ver-tarea [número]\` para ver los detalles_`);
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !ver-tarea [n]
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'ver-tarea' || cmd === 'vt') {
      if (!args) { await reply(msg, '🔍 Uso: `!ver-tarea [número]`\n\nEjemplo: `!ver-tarea 3`\n\nUsa `!tareas` para ver la lista con números.'); return; }
      const list = storage.getHomework();
      const n = parseInt(args.trim(), 10);
      if (isNaN(n) || n < 1 || n > list.length) {
        await reply(msg, `❌ Número inválido. Hay ${list.length} tarea(s). Usa \`!tareas\` para ver la lista.`);
        return;
      }
      const hw = list[n - 1];
      await reply(msg,
        `📚 *Tarea #${n}*\n\n📖 *Materia:* ${hw.subject}\n📌 *Título:* ${hw.title}\n📝 *Descripción:* ${hw.description}\n🔗 *Link:* ${hw.link || 'Sin link'}\n👤 *Por:* ${hw.proposedBy || 'Admin'}`
      );
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !buscar-tarea [consulta]
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'buscar-tarea' || cmd === 'bt') {
      if (!args) { await reply(msg, '🔍 Uso: `!buscar-tarea [consulta]`\n\nEjemplo: `!buscar-tarea algoritmos`\n\nBusca por materia, título o descripción.'); return; }
      const allHomework = storage.getHomework();
      const query = args.trim().toLowerCase();
      const results = allHomework
        .map((hw, i) => ({ hw, n: i + 1 }))
        .filter(({ hw }) =>
          hw.subject.toLowerCase().includes(query) ||
          hw.title.toLowerCase().includes(query) ||
          (hw.description || '').toLowerCase().includes(query)
        );
      if (!results.length) {
        await reply(msg, `🔍 No se encontraron tareas para *"${args.trim()}"*.\n\nUsa \`!tareas\` para ver todas las disponibles.`);
        return;
      }
      const lines = results.map(({ hw, n }) => `*${n}.* [${hw.subject}] ${hw.title}`);
      await reply(msg, `🔍 *Resultados para "${args.trim()}" (${results.length}):*\n\n${lines.join('\n')}\n\n_Usa \`!ver-tarea [número]\` para ver los detalles_`);
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !proponer-tarea  (cualquiera)
    // Formato: materia | título | descripción | link
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'proponer-tarea' || cmd === 'pt') {
      if (!args) {
        const subjectList = (config.subjects || []).map(s => `• ${s.name}`).join('\n');
        const subjectHint = subjectList ? `\n\n📚 *Materias disponibles:*\n${subjectList}` : '';
        await reply(msg, `📥 Uso:\n\`!proponer-tarea materia | título | descripción | link (opcional)\`\n\nEjemplo:\n\`!proponer-tarea Algoritmos I | TP1 | Resuelto con recursión\`${subjectHint}`);
        return;
      }
      const parts = args.split('|').map(p => p.trim());
      if (parts.length < 3) { await reply(msg, '❌ Faltan campos. Mínimo: `materia | título | descripción`'); return; }
      let [subjectInput, title, description, link] = parts;

      // Resolve subject against configured list (normalizes name + auto-fills drive link)
      const resolved = resolveSubject(subjectInput);
      const subject = resolved ? resolved.name : subjectInput;
      if (!link && resolved?.driveFolder) link = resolved.driveFolder;

      const saved = storage.savePending({ subject, title, description, link: link || null, proposedBy: number, proposedByName: name });
      storage.incrementStat(number, name, 'tasksProposed');
      await reply(msg,
        `✅ *Propuesta enviada para revisión*\n\n📚 ${subject} — ${title}\n📝 ${description}\n🔗 ${link || '—'}\n\n_Un admin la revisará pronto. ¡Gracias por contribuir!_ 🙏`
      );
      // Notificar a admins en privado
      for (const adminNum of config.admins) {
        try {
          await client.sendMessage(`${adminNum}@c.us`,
            `📥 *Nueva tarea propuesta para revisión*\n\n👤 ${name}\n📚 ${subject} — ${title}\n📝 ${description}\n🔗 ${link || '—'}\n🆔 \`${saved.id}\`\n\nAprueba con: \`!aprobar ${saved.id}\`\nRechaza con: \`!rechazar ${saved.id} [motivo]\``
          );
        } catch (e) { /* admin puede no tener chat abierto */ }
      }
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !pendientes (ADMIN)
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'pendientes') {
      if (!isAdmin(number)) { await reply(msg, '🚫 Solo admins.'); return; }
      const tasks = storage.getPending();
      const notes = storage.getPendingNotes();
      const resources = storage.getPendingResources();
      const reminders = storage.getPendingReminders();
      if (!tasks.length && !notes.length && !resources.length && !reminders.length) { await reply(msg, '✅ No hay propuestas pendientes de revisión.'); return; }
      const parts = [];
      if (reminders.length) {
        const reminderLines = reminders.map(p => {
          const diff = daysDiff(p.date);
          return `📌 *[RECORDATORIO]* ${p.title}\n   🗓️ ${formatDate(p.date)} (en ${diff} días)\n   📝 ${p.description || '—'}\n   👤 ${p.suggestedByName || p.suggestedBy}\n   🆔 \`${p.id}\``;
        });
        parts.push(`📌 *Recordatorios (${reminders.length}):*\n\n${reminderLines.join('\n\n')}`);
      }
      if (tasks.length) {
        const taskLines = tasks.map(p =>
          `📂 *[TAREA]* ${p.subject} — ${p.title}\n   📝 ${p.description}\n   🔗 ${p.link || '—'}\n   👤 ${p.proposedByName || p.proposedBy}\n   🆔 \`${p.id}\``
        );
        parts.push(`📂 *Tareas (${tasks.length}):*\n\n${taskLines.join('\n\n')}`);
      }
      if (notes.length) {
        const noteLines = notes.map(p =>
          `📝 *[APUNTES]* ${p.subject} — ${p.title}\n   📝 ${p.description}\n   🔗 ${p.link || '—'}\n   👤 ${p.proposedByName || p.proposedBy}\n   🆔 \`${p.id}\``
        );
        parts.push(`📝 *Apuntes (${notes.length}):*\n\n${noteLines.join('\n\n')}`);
      }
      if (resources.length) {
        const resourceLines = resources.map(p =>
          `📦 *[RECURSO]* [${p.type}] ${p.title}\n   📝 ${p.description || '—'}\n   🔗 ${p.link || '—'}\n   👤 ${p.proposedByName || p.proposedBy}\n   🆔 \`${p.id}\``
        );
        parts.push(`📦 *Recursos (${resources.length}):*\n\n${resourceLines.join('\n\n')}`);
      }
      const total = tasks.length + notes.length + resources.length + reminders.length;
      await reply(msg, `📥 *Propuestas pendientes (${total}):*\n\n${parts.join('\n\n')}\n\nAprueba: \`!aprobar [id]\`\nRechaza: \`!rechazar [id] [motivo]\``);
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !aprobar [id] (ADMIN)
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'aprobar') {
      if (!isAdmin(number)) { await reply(msg, '🚫 Solo admins.'); return; }
      if (!args) { await reply(msg, '❌ Uso: `!aprobar [id]`'); return; }
      const trimmedId = args.trim();

      // Check pending tasks first
      const pendingTask = storage.getPending().find(p => p.id === trimmedId);
      if (pendingTask) {
        storage.saveHomework({
          subject: pendingTask.subject, title: pendingTask.title,
          description: pendingTask.description, link: pendingTask.link,
          proposedBy: pendingTask.proposedByName || pendingTask.proposedBy,
          approvedBy: name,
        });
        storage.deletePending(pendingTask.id);
        storage.incrementStat(pendingTask.proposedBy, pendingTask.proposedByName, 'tasksApproved');

        await reply(msg, `✅ Tarea *"${pendingTask.title}"* aprobada y publicada.`);

        try {
          await client.sendMessage(config.groupId,
            `📚 *Nueva tarea disponible*\n\n*${pendingTask.subject}* — ${pendingTask.title}\n📝 ${pendingTask.description}\n🔗 ${pendingTask.link || '—'}\n\n¡Gracias @${pendingTask.proposedBy} por compartir! 🙌`
          );
        } catch (e) {}

        try {
          await client.sendMessage(`${pendingTask.proposedBy}@c.us`,
            `🎉 ¡Tu tarea *"${pendingTask.title}"* fue aprobada y ya está disponible en el grupo!\n\n+7 puntos en el leaderboard 🏆`
          );
        } catch (e) {}
        return;
      }

      // Check pending notes
      const pendingNote = storage.getPendingNotes().find(p => p.id === trimmedId);
      if (pendingNote) {
        storage.saveNote({
          subject: pendingNote.subject, title: pendingNote.title,
          description: pendingNote.description, link: pendingNote.link,
          proposedBy: pendingNote.proposedByName || pendingNote.proposedBy,
          approvedBy: name,
        });
        storage.deletePendingNote(pendingNote.id);
        storage.incrementStat(pendingNote.proposedBy, pendingNote.proposedByName, 'notesApproved');

        await reply(msg, `✅ Apuntes *"${pendingNote.title}"* aprobados y publicados.`);

        try {
          await client.sendMessage(config.groupId,
            `📝 *Nuevos apuntes disponibles*\n\n*${pendingNote.subject}* — ${pendingNote.title}\n📝 ${pendingNote.description}\n🔗 ${pendingNote.link || '—'}\n\n¡Gracias @${pendingNote.proposedBy} por compartir! 🙌`
          );
        } catch (e) {}

        try {
          await client.sendMessage(`${pendingNote.proposedBy}@c.us`,
            `🎉 ¡Tus apuntes *"${pendingNote.title}"* fueron aprobados y ya están disponibles en el grupo!\n\n+5 puntos en el leaderboard 🏆`
          );
        } catch (e) {}
        return;
      }

      // Check pending resources
      const pendingResource = storage.getPendingResources().find(p => p.id === trimmedId);
      if (pendingResource) {
        storage.saveResource({
          type: pendingResource.type, title: pendingResource.title,
          description: pendingResource.description, link: pendingResource.link,
          proposedBy: pendingResource.proposedByName || pendingResource.proposedBy,
          approvedBy: name,
        });
        storage.deletePendingResource(pendingResource.id);
        storage.incrementStat(pendingResource.proposedBy, pendingResource.proposedByName, 'resourcesApproved');

        await reply(msg, `✅ Recurso *"${pendingResource.title}"* aprobado y publicado.`);

        try {
          await client.sendMessage(config.groupId,
            `📦 *Nuevo recurso disponible*\n\n🏷️ [${pendingResource.type}] ${pendingResource.title}\n📝 ${pendingResource.description || '—'}\n🔗 ${pendingResource.link || '—'}\n\n¡Gracias @${pendingResource.proposedBy} por compartir! 🙌`
          );
        } catch (e) {}

        try {
          await client.sendMessage(`${pendingResource.proposedBy}@c.us`,
            `🎉 ¡Tu recurso *"${pendingResource.title}"* fue aprobado y ya está disponible en el grupo!\n\n+2 puntos en el leaderboard 🏆`
          );
        } catch (e) {}
        return;
      }

      // Check pending reminders
      const pendingReminder = storage.getPendingReminders().find(p => p.id === trimmedId);
      if (pendingReminder) {
        const saved = storage.saveReminder({
          title: pendingReminder.title,
          date: pendingReminder.date,
          description: pendingReminder.description,
          addedBy: pendingReminder.suggestedBy,
          approvedBy: number,
        });
        storage.deletePendingReminder(pendingReminder.id);
        storage.saveFaqForReminder(saved);
        storage.incrementStat(pendingReminder.suggestedBy, pendingReminder.suggestedByName, 'remindersApproved');

        const diff = daysDiff(saved.date);
        await reply(msg, `✅ Recordatorio *"${saved.title}"* aprobado.\n🗓️ ${formatDate(saved.date)} (en ${diff} días)`);

        try {
          await client.sendMessage(config.groupId,
            `📌 *Nuevo recordatorio agregado*\n\n*${saved.title}*\n🗓️ ${formatDate(saved.date)}\n📝 ${saved.description || '—'}\n\n_Sugerido por ${pendingReminder.suggestedByName || pendingReminder.suggestedBy}_ 🙌`
          );
        } catch (e) {}

        try {
          await client.sendMessage(`${pendingReminder.suggestedBy}@c.us`,
            `🎉 Tu sugerencia *"${pendingReminder.title}"* fue aprobada y ya está en el grupo.\n\n+1 punto en el leaderboard 🏆`
          );
        } catch (e) {}
        return;
      }

      await reply(msg, `❌ No encontré la propuesta \`${trimmedId}\``);
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !rechazar [id] [motivo] (ADMIN)
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'rechazar') {
      if (!isAdmin(number)) { await reply(msg, '🚫 Solo admins.'); return; }
      const [id, ...motivoParts] = args.split(' ');
      const motivo = motivoParts.join(' ') || 'Sin motivo especificado';
      if (!id) { await reply(msg, '❌ Uso: `!rechazar [id] [motivo opcional]`'); return; }

      // Check pending tasks first
      const pendingTask = storage.getPending().find(p => p.id === id.trim());
      if (pendingTask) {
        storage.deletePending(pendingTask.id);
        await reply(msg, `🗑️ Tarea *"${pendingTask.title}"* rechazada.`);
        try {
          await client.sendMessage(`${pendingTask.proposedBy}@c.us`,
            `❌ Tu propuesta de tarea *"${pendingTask.title}"* fue rechazada.\n\n📝 Motivo: ${motivo}\n\nSi tienes dudas, contacta a un admin.`
          );
        } catch (e) {}
        return;
      }

      // Check pending notes
      const pendingNote = storage.getPendingNotes().find(p => p.id === id.trim());
      if (pendingNote) {
        storage.deletePendingNote(pendingNote.id);
        await reply(msg, `🗑️ Apuntes *"${pendingNote.title}"* rechazados.`);
        try {
          await client.sendMessage(`${pendingNote.proposedBy}@c.us`,
            `❌ Tu propuesta de apuntes *"${pendingNote.title}"* fue rechazada.\n\n📝 Motivo: ${motivo}\n\nSi tienes dudas, contacta a un admin.`
          );
        } catch (e) {}
        return;
      }

      // Check pending resources
      const pendingResource = storage.getPendingResources().find(p => p.id === id.trim());
      if (pendingResource) {
        storage.deletePendingResource(pendingResource.id);
        await reply(msg, `🗑️ Recurso *"${pendingResource.title}"* rechazado.`);
        try {
          await client.sendMessage(`${pendingResource.proposedBy}@c.us`,
            `❌ Tu propuesta de recurso *"${pendingResource.title}"* fue rechazada.\n\n📝 Motivo: ${motivo}\n\nSi tienes dudas, contacta a un admin.`
          );
        } catch (e) {}
        return;
      }

      // Check pending reminders
      const pendingReminder = storage.getPendingReminders().find(p => p.id === id.trim());
      if (pendingReminder) {
        storage.deletePendingReminder(pendingReminder.id);
        await reply(msg, `🗑️ Sugerencia de recordatorio *"${pendingReminder.title}"* rechazada.`);
        try {
          await client.sendMessage(`${pendingReminder.suggestedBy}@c.us`,
            `❌ Tu sugerencia de recordatorio *"${pendingReminder.title}"* fue rechazada.\n📝 Motivo: ${motivo}`
          );
        } catch (e) {}
        return;
      }

      await reply(msg, `❌ No encontré la propuesta \`${id}\``);
      return;
    }
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'borrar-tarea') {
      if (!isAdmin(number)) { await reply(msg, '🚫 Solo admins.'); return; }
      if (!args) { await reply(msg, '❌ Uso: `!borrar-tarea [id]`'); return; }
      const deleted = storage.deleteHomework(args.trim());
      await reply(msg, deleted
        ? '🗑️ Tarea eliminada.'
        : `❌ No encontré el ID \`${args.trim()}\``
      );
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !apuntes
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'apuntes' || cmd === 'a') {
      const list = storage.getNotes();
      if (!list.length) { await reply(msg, '📭 No hay apuntes guardados aún.'); return; }
      const lines = list.map((n, i) =>
        `*${i + 1}.* [${n.subject}] ${n.title}`
      );
      await reply(msg, `📝 *Apuntes disponibles (${list.length}):*\n\n${lines.join('\n')}\n\n_Usa \`!ver-apuntes [número]\` para ver los detalles_`);
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !ver-apuntes [n]
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'ver-apuntes' || cmd === 'va') {
      if (!args) { await reply(msg, '🔍 Uso: `!ver-apuntes [número]`\n\nEjemplo: `!ver-apuntes 2`\n\nUsa `!apuntes` para ver la lista con números.'); return; }
      const list = storage.getNotes();
      const n = parseInt(args.trim(), 10);
      if (isNaN(n) || n < 1 || n > list.length) {
        await reply(msg, `❌ Número inválido. Hay ${list.length} apunte(s). Usa \`!apuntes\` para ver la lista.`);
        return;
      }
      const note = list[n - 1];
      await reply(msg,
        `📝 *Apuntes #${n}*\n\n📖 *Materia:* ${note.subject}\n📌 *Título:* ${note.title}\n📝 *Descripción:* ${note.description}\n🔗 *Link:* ${note.link || 'Sin link'}\n👤 *Por:* ${note.proposedBy || 'Admin'}`
      );
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !buscar-apuntes [consulta]
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'buscar-apuntes' || cmd === 'ba') {
      if (!args) { await reply(msg, '🔍 Uso: `!buscar-apuntes [consulta]`\n\nEjemplo: `!buscar-apuntes cálculo`\n\nBusca por materia, título o descripción.'); return; }
      const allNotes = storage.getNotes();
      const query = args.trim().toLowerCase();
      const results = allNotes
        .map((note, i) => ({ note, n: i + 1 }))
        .filter(({ note }) =>
          note.subject.toLowerCase().includes(query) ||
          note.title.toLowerCase().includes(query) ||
          (note.description || '').toLowerCase().includes(query)
        );
      if (!results.length) {
        await reply(msg, `🔍 No se encontraron apuntes para *"${args.trim()}"*.\n\nUsa \`!apuntes\` para ver todos los disponibles.`);
        return;
      }
      const lines = results.map(({ note, n }) => `*${n}.* [${note.subject}] ${note.title}`);
      await reply(msg, `🔍 *Resultados para "${args.trim()}" (${results.length}):*\n\n${lines.join('\n')}\n\n_Usa \`!ver-apuntes [número]\` para ver los detalles_`);
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !proponer-apuntes  (cualquiera)
    // Formato: materia | título | descripción | link (opcional)
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'proponer-apuntes' || cmd === 'pa') {
      if (!args) {
        const subjectList = (config.subjects || []).map(s => `• ${s.name}`).join('\n');
        const subjectHint = subjectList ? `\n\n📚 *Materias disponibles:*\n${subjectList}` : '';
        await reply(msg, `📥 Uso:\n\`!proponer-apuntes materia | título | descripción | link (opcional)\`\n\nEjemplo:\n\`!proponer-apuntes Cálculo I | Parcial 1 | Apuntes del primer parcial con teoremas\`\n\nSi no incluyes link, se usará la carpeta de apuntes de la materia.${subjectHint}`);
        return;
      }
      const parts = args.split('|').map(p => p.trim());
      if (parts.length < 3) { await reply(msg, '❌ Faltan campos. Mínimo: `materia | título | descripción`'); return; }
      let [subjectInput, title, description, link] = parts;

      const resolved = resolveSubject(subjectInput);
      const subject = resolved ? resolved.name : subjectInput;
      if (!link && resolved?.notesFolder) link = resolved.notesFolder;

      const saved = storage.savePendingNote({ subject, title, description, link: link || null, proposedBy: number, proposedByName: name });
      storage.incrementStat(number, name, 'notesProposed');
      await reply(msg,
        `✅ *Apuntes enviados para revisión*\n\n📚 ${subject} — ${title}\n📝 ${description}\n🔗 ${link || '—'}\n\n_Un admin los revisará pronto. ¡Gracias por compartir!_ 🙏`
      );
      for (const adminNum of config.admins) {
        try {
          await client.sendMessage(`${adminNum}@c.us`,
            `📥 *Nuevos apuntes propuestos para revisión*\n\n👤 ${name}\n📚 ${subject} — ${title}\n📝 ${description}\n🔗 ${link || '—'}\n🆔 \`${saved.id}\`\n\nAprueba con: \`!aprobar ${saved.id}\`\nRechaza con: \`!rechazar ${saved.id} [motivo]\``
          );
        } catch (e) { /* admin puede no tener chat abierto */ }
      }
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !borrar-apuntes [id] (ADMIN)
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'borrar-apuntes') {
      if (!isAdmin(number)) { await reply(msg, '🚫 Solo admins.'); return; }
      if (!args) { await reply(msg, '❌ Uso: `!borrar-apuntes [id]`'); return; }
      const deleted = storage.deleteNote(args.trim());
      await reply(msg, deleted
        ? '🗑️ Apuntes eliminados.'
        : `❌ No encontré el ID \`${args.trim()}\``
      );
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !recursos
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'recursos' || cmd === 'rc') {
      const list = storage.getResources();
      if (!list.length) { await reply(msg, '📭 No hay recursos guardados aún.'); return; }
      const lines = list.map((r, i) =>
        `*${i + 1}.* [${r.type}] ${r.title}`
      );
      await reply(msg, `📦 *Recursos disponibles (${list.length}):*\n\n${lines.join('\n')}\n\n_Usa \`!ver-recurso [número]\` para ver los detalles_`);
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !ver-recurso [n]
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'ver-recurso' || cmd === 'vrc') {
      if (!args) { await reply(msg, '🔍 Uso: `!ver-recurso [número]`\n\nEjemplo: `!ver-recurso 2`\n\nUsa `!recursos` para ver la lista con números.'); return; }
      const list = storage.getResources();
      const n = parseInt(args.trim(), 10);
      if (isNaN(n) || n < 1 || n > list.length) {
        await reply(msg, `❌ Número inválido. Hay ${list.length} recurso(s). Usa \`!recursos\` para ver la lista.`);
        return;
      }
      const res = list[n - 1];
      await reply(msg,
        `📦 *Recurso #${n}*\n\n🏷️ *Tipo:* ${res.type}\n📌 *Título:* ${res.title}\n📝 *Descripción:* ${res.description || '—'}\n🔗 *Link:* ${res.link || 'Sin link'}\n👤 *Por:* ${res.proposedBy || 'Admin'}`
      );
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !buscar-recurso [consulta]
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'buscar-recurso' || cmd === 'brc') {
      if (!args) { await reply(msg, '🔍 Uso: `!buscar-recurso [consulta]`\n\nEjemplo: `!buscar-recurso algoritmos`\n\nBusca por tipo, título o descripción.'); return; }
      const allResources = storage.getResources();
      const query = args.trim().toLowerCase();
      const results = allResources
        .map((res, i) => ({ res, n: i + 1 }))
        .filter(({ res }) =>
          res.type.toLowerCase().includes(query) ||
          res.title.toLowerCase().includes(query) ||
          (res.description || '').toLowerCase().includes(query)
        );
      if (!results.length) {
        await reply(msg, `🔍 No se encontraron recursos para *"${args.trim()}"*.\n\nUsa \`!recursos\` para ver todos los disponibles.`);
        return;
      }
      const lines = results.map(({ res, n }) => `*${n}.* [${res.type}] ${res.title}`);
      await reply(msg, `🔍 *Resultados para "${args.trim()}" (${results.length}):*\n\n${lines.join('\n')}\n\n_Usa \`!ver-recurso [número]\` para ver los detalles_`);
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !proponer-recurso  (cualquiera)
    // Formato: tipo | título | descripción | link
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'proponer-recurso' || cmd === 'prc') {
      if (!args) {
        await reply(msg,
          `📥 Uso:\n\`!proponer-recurso tipo | título | descripción | link\`\n\n` +
          `Ejemplo:\n\`!proponer-recurso video | Introducción a recursión | Video de YouTube muy claro | https://youtu.be/...\`\n\n` +
          `📌 *Tipos sugeridos:* video, pdf, libro, herramienta, guía, enlace, ejercicios, otro`
        );
        return;
      }
      const parts = args.split('|').map(p => p.trim());
      if (parts.length < 3) { await reply(msg, '❌ Faltan campos. Mínimo: `tipo | título | descripción`'); return; }
      const [type, title, description, link] = parts;
      if (!type || !title) { await reply(msg, '❌ El tipo y el título son obligatorios.'); return; }

      const saved = storage.savePendingResource({
        type, title, description: description || '', link: link || null,
        proposedBy: number, proposedByName: name,
      });
      storage.incrementStat(number, name, 'resourcesProposed');
      await reply(msg,
        `✅ *Recurso enviado para revisión*\n\n🏷️ ${type} — ${title}\n📝 ${description || '—'}\n🔗 ${link || '—'}\n\n_Un admin lo revisará pronto. ¡Gracias por compartir!_ 🙏`
      );
      for (const adminNum of config.admins) {
        try {
          await client.sendMessage(`${adminNum}@c.us`,
            `📦 *Nuevo recurso propuesto para revisión*\n\n👤 ${name}\n🏷️ ${type} — ${title}\n📝 ${description || '—'}\n🔗 ${link || '—'}\n🆔 \`${saved.id}\`\n\nAprueba con: \`!aprobar ${saved.id}\`\nRechaza con: \`!rechazar ${saved.id} [motivo]\``
          );
        } catch (e) {}
      }
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !borrar-recurso [id] (ADMIN)
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'borrar-recurso') {
      if (!isAdmin(number)) { await reply(msg, '🚫 Solo admins.'); return; }
      if (!args) { await reply(msg, '❌ Uso: `!borrar-recurso [id]`'); return; }
      const deleted = storage.deleteResource(args.trim());
      await reply(msg, deleted
        ? '🗑️ Recurso eliminado.'
        : `❌ No encontré el ID \`${args.trim()}\``
      );
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !preguntas — Ver historial de preguntas del día con respuestas
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'preguntas') {
      await reply(msg, buildQuestionsList());
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !faq
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'faq') {
      const faqs = storage.getActiveFaqs();
      if (!faqs.length) { await reply(msg, '❓ No hay FAQs activas todavía.\n\n_Se generan automáticamente con los recordatorios, o los admins pueden agregar con \`!add-faq\`_'); return; }
      const lines = faqs.map((f, i) => {
        const label = f.reminderId ? '📌' : '❓';
        return `*${i+1}. ${label} ${f.question}*\n   ${f.answer}`;
      });
      await reply(msg, `❓ *Preguntas Frecuentes:*\n\n${lines.join('\n\n')}`);
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !add-faq [keywords] | [pregunta] | [respuesta]  (ADMIN)
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'add-faq') {
      if (!isAdmin(number)) { await reply(msg, '🚫 Solo admins.'); return; }
      if (!args) {
        await reply(msg, '❓ Uso:\n`!add-faq keyword1,keyword2 | Pregunta | Respuesta`\n\nEjemplo:\n`!add-faq horario,clase,cuando | ¿Cuándo son las clases? | Los lunes y miércoles de 18 a 20hs.`');
        return;
      }
      const parts = args.split('|').map(p => p.trim());
      if (parts.length < 3) { await reply(msg, '❌ Faltan campos: `keywords | pregunta | respuesta`'); return; }
      const [kwStr, question, answer] = parts;
      const keywords = kwStr.split(',').map(k => k.trim()).filter(Boolean);
      if (keywords.length < 2) {
        await reply(msg, '❌ Se requieren al menos *2 keywords* para que la FAQ se active por cualquiera de ellas.\n\nEjemplo:\n`!add-faq algoritmos,quiz | ¿Hay quiz de algoritmos? | Sí, cada semana.`');
        return;
      }
      const saved = storage.saveFaq({ keywords, question, answer, addedBy: number });
      await reply(msg, `✅ *FAQ agregada*\n\n❓ ${question}\n💬 ${answer}\n🔑 Keywords: ${keywords.join(', ')}\n🆔 \`${saved.id}\``);
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !del-faq [id] (ADMIN)
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'del-faq') {
      if (!isAdmin(number)) { await reply(msg, '🚫 Solo admins.'); return; }
      if (!args) { await reply(msg, '❌ Uso: `!del-faq [id]`'); return; }
      const deleted = storage.deleteFaq(args.trim());
      await reply(msg, deleted ? '🗑️ FAQ eliminada.' : `❌ No encontré el ID \`${args.trim()}\``);
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !add-pregunta dificultad | Pregunta | Respuesta  (ADMIN)
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'add-pregunta') {
      if (!isAdmin(number)) { await reply(msg, '🚫 Solo admins.'); return; }
      if (!args) {
        await reply(msg,
          `❓ *Uso:*\n\`!add-pregunta dificultad | Pregunta | Respuesta\`\n\n` +
          `*Dificultades:*\n` +
          `🟢 \`fácil\` — ${DIFFICULTY_POINTS.easy} pts\n` +
          `🟡 \`normal\` — ${DIFFICULTY_POINTS.normal} pts\n` +
          `🔴 \`difícil\` — ${DIFFICULTY_POINTS.hard} pts\n\n` +
          `*Ejemplo:*\n\`!add-pregunta normal | ¿Qué es la recursión? | Una función que se llama a sí misma hasta un caso base.\``
        );
        return;
      }

      const parts = args.split('|').map(p => p.trim());
      if (parts.length < 3) {
        await reply(msg, '❌ Faltan campos. Formato: `dificultad | pregunta | respuesta`');
        return;
      }

      const [diffRaw, questionText, answerText] = parts;
      const difficulty = parseDifficulty(diffRaw);
      if (!difficulty) {
        await reply(msg, `❌ Dificultad inválida: *"${diffRaw}"*\n\nUsa \`fácil\`, \`normal\` o \`difícil\`.`);
        return;
      }
      if (!questionText) { await reply(msg, '❌ La pregunta no puede estar vacía.'); return; }
      if (!answerText)   { await reply(msg, '❌ La respuesta no puede estar vacía.'); return; }

      const points = DIFFICULTY_POINTS[difficulty];
      const pool   = storage.getDailyQuestions();
      pool.push({ question: questionText, answer: answerText, difficulty });
      storage.saveDailyQuestions(pool);

      const diffLabel = DIFFICULTY_LABELS[difficulty];
      await reply(msg,
        `✅ *Pregunta agregada al banco* (${pool.length} en total)\n\n` +
        `${diffLabel} — *${points} pts*\n` +
        `❓ *Pregunta:* ${questionText}\n` +
        `📖 *Respuesta:* ${answerText}`
      );
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !tabla — Leaderboard
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'tabla') {
      await reply(msg, buildLeaderboard());
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !puntos — Puntaje personal
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'puntos') {
      const text = buildUserStats(number);
      await reply(msg, text || '📊 Aún no tienes estadísticas. ¡Empieza a proponer tareas/apuntes/recordatorios y responder preguntas!');
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !premio — Ver el premio actual del leaderboard
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'premio') {
      const prize = storage.getPrize();
      if (!prize) {
        await reply(msg, '🎁 *Premio al líder de la tabla*\n\nAún no hay un premio configurado.\n\n_Los admins pueden configurarlo con_ `!conf-premio`');
      } else {
        await reply(msg,
          `🎁 *Premio al líder de la tabla*\n\n` +
          `🏆 Premio: *${prize.prize}*\n` +
          `🎯 Meta: *${prize.points} puntos*\n` +
          `🤝 Patrocinado por: *${prize.sponsor}*\n\n` +
          `_¡Acumula puntos proponiendo tareas/recordatorios/apuntes y respondiendo preguntas!_`
        );
      }
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !conf-premio Premio | Puntos | Patrocinador  (ADMIN)
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'conf-premio') {
      if (!isAdmin(number)) { await reply(msg, '🚫 Solo admins.'); return; }
      const parts = args.split('|').map(s => s.trim());
      if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) {
        await reply(msg, '❌ Uso:\n`!conf-premio Premio | Puntos | Patrocinador`\n\nEjemplo:\n`!conf-premio Salchipapa | 100 | Librería Central`');
        return;
      }
      const pts = parseInt(parts[1]);
      if (isNaN(pts) || pts <= 0) {
        await reply(msg, '❌ Los puntos deben ser un número mayor a 0.');
        return;
      }
      storage.setPrize(parts[0], pts, parts[2]);
      await reply(msg,
        `✅ *Premio configurado*\n\n` +
        `🏆 Premio: *${parts[0]}*\n` +
        `🎯 Meta: *${pts} puntos*\n` +
        `🤝 Patrocinado por: *${parts[2]}*`
      );
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !dar-puntos <id|número|@mention> N [motivo]  (ADMIN)
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'dar-puntos') {
      if (!isAdmin(number)) { await reply(msg, '🚫 Solo admins.'); return; }

      const mentionedIds = msg.mentionedIds || [];
      const targetNum = resolveTarget(args, mentionedIds);
      if (!targetNum) {
        await reply(msg, '❌ Uso: `!dar-puntos <id|número> N [motivo]`\n\nEjemplo: `!dar-puntos 3 5 Ganó la dinámica`\nUsa `!usuarios` para ver los IDs.');
        return;
      }

      // Strip target from args then extract amount + reason
      const rest = argsAfterTarget(args, mentionedIds);
      const parts = rest.trim().split(/\s+/);
      const amount = parseInt(parts[0]);
      if (isNaN(amount) || amount <= 0) {
        await reply(msg, '❌ La cantidad de puntos debe ser un número mayor a 0.\n\nEjemplo: `!dar-puntos 3 5 Ganó la dinámica`');
        return;
      }
      const reason = parts.slice(1).join(' ') || 'Dinámica manual';

      // Resolve target name from activity or WhatsApp contact
      let targetName = targetNum;
      const activityData = storage.getActivity();
      if (activityData[targetNum] && activityData[targetNum].name) {
        targetName = activityData[targetNum].name;
      } else {
        try {
          const targetContact = await client.getContactById(`${targetNum}@c.us`);
          targetName = targetContact.pushname || targetContact.name || targetNum;
        } catch (_) {}
      }

      const updated = storage.addBonusPoints(targetNum, targetName, amount, reason);
      storage.log('bonus_points', { target: targetNum, name: targetName, amount, reason, by: number });

      await reply(msg,
        `⭐ *Puntos otorgados*\n\n` +
        `👤 ${targetName}\n` +
        `➕ ${amount} pts — _${reason}_\n` +
        `🏆 Total: ${updated.totalPoints} pts`
      );
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !mutear [@usuario] [minutos] [motivo]  (ADMIN)
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'mutear') {
      if (!isAdmin(number)) { await reply(msg, '🚫 Solo admins.'); return; }
      if (!isGroup) { await reply(msg, '⚠️ Este comando solo funciona en grupos.'); return; }

      const mentionedIds = msg.mentionedIds || [];
      const targetNum = resolveTarget(args, mentionedIds);

      if (!targetNum) {
        await reply(msg, '❌ Uso: `!mutear <id|número> [minutos] [motivo]`\n\nEjemplo: `!mutear 3 60 Spam`\nUsa `!usuarios` para ver los IDs.');
        return;
      }
      if (isAdmin(targetNum)) {
        await reply(msg, '🚫 No puedes mutear a un administrador.');
        return;
      }

      // Parsear minutos y motivo del resto del args (sin el identificador de usuario)
      const muteRest = argsAfterTarget(args, mentionedIds).trim().split(/\s+/);
      let minutes = parseInt(muteRest[0]);
      if (isNaN(minutes) || minutes <= 0) minutes = config.mute.defaultMinutes;
      if (minutes > config.mute.maxMinutes) minutes = config.mute.maxMinutes;
      const reason = muteRest.slice(1).join(' ') || 'Sin motivo especificado';

      const entry = storage.muteUser(targetNum, '', minutes, reason, number);
      const until = formatTime(entry.until);

      const muteMsg = config.mute.muteMessage
        .replace('{user}', targetNum)
        .replace('{minutes}', minutes)
        .replace('{reason}', reason);

      await reply(msg, `🔇 *Usuario muteado*\n\n👤 +${targetNum}\n⏱️ Duración: ${minutes} min (hasta las ${until})\n📝 Motivo: ${reason}\n\n_Sus mensajes serán eliminados automáticamente._`);
      storage.log('mute', { target: targetNum, minutes, reason, by: number });

      // Notificar en el chat del grupo también
      try { await chat.sendMessage(muteMsg); } catch (e) {}

      // Avisar al usuario en privado
      try {
        await client.sendMessage(`${targetNum}@c.us`,
          `🔇 Has sido silenciado en el grupo por ${minutes} minutos.\n📝 Motivo: ${reason}\nHasta las ${until}.\n\nSi crees que es un error, contacta a un admin.`
        );
      } catch (e) {}
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !desmutear [@usuario]  (ADMIN)
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'desmutear') {
      if (!isAdmin(number)) { await reply(msg, '🚫 Solo admins.'); return; }
      const mentionedIds = msg.mentionedIds || [];
      const targetNum = resolveTarget(args, mentionedIds);
      if (!targetNum) { await reply(msg, '❌ Uso: `!desmutear <id|número>`\n\nUsa `!usuarios` para ver los IDs.'); return; }

      storage.unmuteUser(targetNum);
      await reply(msg, `🔊 *Usuario desmuteado*\n\n👤 +${targetNum} puede volver a escribir en el grupo.`);

      try {
        await client.sendMessage(`${targetNum}@c.us`,
          `🔊 Tu silencio en el grupo ha sido levantado. ¡Ya puedes volver a participar!`
        );
      } catch (e) {}
      storage.log('unmute', { target: targetNum, by: number });
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !usuarios  (ADMIN)
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'usuarios') {
      if (!isAdmin(number)) { await reply(msg, '🚫 Solo admins.'); return; }
      const activityData = storage.getActivity();
      const entries = Object.entries(activityData)
        .sort(([, a], [, b]) => (a.id || 0) - (b.id || 0));
      if (!entries.length) { await reply(msg, '📭 No hay usuarios registrados.'); return; }
      const lines = entries.map(([num, u]) => {
        const lastSeen = u.lastSeen
          ? new Date(u.lastSeen).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: '2-digit' })
          : '—';
        return `*#${u.id}* ${u.name} _(visto: ${lastSeen})_`;
      });
      await reply(msg, `👥 *Usuarios registrados*\n\n${lines.join('\n')}\n\n_Usa el ID con !dar-puntos, !mutear, etc._`);
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !muteados  (ADMIN)
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'muteados') {
      if (!isAdmin(number)) { await reply(msg, '🚫 Solo admins.'); return; }
      const list = storage.getMuted();
      if (!list.length) { await reply(msg, '✅ No hay usuarios muteados actualmente.'); return; }
      const lines = list.map(m =>
        `👤 +${m.number}\n   ⏱️ Hasta: ${formatTime(m.until)}\n   📝 ${m.reason}`
      );
      await reply(msg, `🔇 *Usuarios muteados (${list.length}):*\n\n${lines.join('\n\n')}`);
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !test-recordatorios (ADMIN)
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'test-recordatorios') {
      if (!isAdmin(number)) { await reply(msg, '🚫 Solo admins.'); return; }
      await reply(msg, '🔄 Revisando recordatorios...');
      await checkAndSendReminders(client, config);
      await checkAndSendTodayReminders(client, config);
      await reply(msg, '✅ Revisión completada.');
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !resumen-semanal (ADMIN)
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'resumen-semanal') {
      if (!isAdmin(number)) { await reply(msg, '🚫 Solo admins.'); return; }
      await reply(msg, '📅 Enviando resumen semanal al grupo...');
      await sendWeeklySummary(client, config);
      await reply(msg, '✅ Resumen enviado.');
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !test-actividad (ADMIN) — fuerza revisión de inactividad ahora
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'test-actividad') {
      if (!isAdmin(number)) { await reply(msg, '🚫 Solo admins.'); return; }
      await reply(msg, '🔄 Revisando inactividad...');
      await checkInactivity(client, config);
      await reply(msg, '✅ Revisión de inactividad completada.');
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !inactivos (ADMIN) — muestra usuarios con más de X días sin escribir
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'inactivos') {
      if (!isAdmin(number)) { await reply(msg, '🚫 Solo admins.'); return; }
      const cfg = config.activityCheck;
      if (!cfg || !cfg.enabled) { await reply(msg, '⚠️ El control de actividad está deshabilitado.'); return; }
      const warnDays = cfg.warnAfterDays || 30;
      const now = Date.now();
      const activity = storage.getActivity();
      const inactive = Object.entries(activity)
        .map(([num, e]) => ({ num, ...e, days: Math.floor((now - new Date(e.lastSeen).getTime()) / 86400000) }))
        .filter(e => e.days >= warnDays)
        .sort((a, b) => b.days - a.days);
      if (!inactive.length) {
        await reply(msg, `✅ No hay usuarios inactivos (umbral: ${warnDays} días).`);
        return;
      }
      const lines = inactive.map(e => `• ${e.name} (+${e.num}): ${e.days} días${e.warnedAt ? ' ⚠️ advertido' : ''}`);
      await reply(msg, `😴 *Usuarios inactivos (≥${warnDays} días)*\n\n${lines.join('\n')}`);
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !msg [mensaje] (ADMIN) — Enviar mensaje al grupo como el bot
    // Solo se puede usar desde el chat privado con el bot
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'msg') {
      if (!isAdmin(number)) { await reply(msg, '🚫 Solo admins.'); return; }
      if (isGroup) { await reply(msg, '⚠️ Este comando solo se puede usar en el chat privado con el bot.'); return; }
      if (!args) { await reply(msg, '❌ Uso: `!msg [mensaje]`\n\nEjemplo: `!msg Hola a todos, mañana hay clase extra.`'); return; }

      try {
        await client.sendMessage(config.groupId, args);
        await reply(msg, '✅ Mensaje enviado al grupo.');
        storage.log('msg_to_group', { by: number, message: args });
      } catch (err) {
        console.error('[MSG ERROR]', err.message);
        await reply(msg, '❌ No se pudo enviar el mensaje al grupo. Verifica que el bot siga en el grupo.');
      }
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !todos [mensaje] (ADMIN) — Enviar mensaje privado a todos los miembros
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'todos') {
      if (!isAdmin(number)) { await reply(msg, '🚫 Solo admins.'); return; }
      if (!args) { await reply(msg, '❌ Uso: `!todos [mensaje]`\n\nEjemplo: `!todos Recuerden entregar el TP antes del viernes.`'); return; }
      if (!isGroup) { await reply(msg, '⚠️ Este comando solo funciona desde el grupo.'); return; }

      const participants = chat.participants || [];
      const nonAdminParticipants = participants.filter(p => {
        const pNum = p.id.user;
        return !isAdmin(pNum) && pNum !== client.info.wid.user;
      });

      await reply(msg, `📤 Enviando mensaje privado a ${nonAdminParticipants.length} miembro(s)...`);

      let sent = 0;
      let failed = 0;
      for (const participant of nonAdminParticipants) {
        try {
          await client.sendMessage(`${participant.id.user}@c.us`, `📢 *Mensaje del grupo:*\n\n${args}`);
          sent++;
        } catch (e) {
          failed++;
        }
      }

      await reply(msg, `✅ Mensaje enviado a ${sent} miembro(s)${failed > 0 ? ` (${failed} fallaron — pueden tener el chat privado cerrado)` : ''}.`);
      storage.log('broadcast', { by: number, message: args, sent, failed });
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !conf (ADMIN) — Muestra la configuración actual del bot
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'conf') {
      if (!isAdmin(number)) { await reply(msg, '🚫 Solo admins.'); return; }

      const dq = config.dailyQuestions || {};
      const rem = config.reminderTodayRepeat || {};
      const ws = config.weeklySummary || {};
      const ww = config.wordWarnings || {};
      const mute = config.mute || {};
      const ac = config.activityCheck || {};
      const welcome = config.welcome || {};

      const lines = [
        `⚙️ *Configuración del bot*`,
        ``,
        `👥 *Admins:* ${(config.admins || []).map(a => `+${a}`).join(', ') || '—'}`,
        `🔑 *Prefijo:* \`${config.prefix || '!'}\``,
        ``,
        `🤔 *Preguntas del día*`,
        `• Habilitadas: ${dq.enabled ? '✅' : '❌'}`,
        `• Por día: ${dq.questionsPerDay ?? '—'}`,
        `• Horario: ${dq.startHour ?? '—'}:00 – ${dq.endHour ?? '—'}:00`,
        ``,
        `📅 *Recordatorios*`,
        `• Días de anticipación: ${(config.reminderDays || []).join(', ')}`,
        `• Repetición en el día: ${rem.enabled ? `✅ (${rem.times}x, ${rem.startHour}:00–${rem.endHour}:00)` : '❌'}`,
        ``,
        `📋 *Resumen semanal*`,
        `• Habilitado: ${ws.enabled ? '✅' : '❌'}`,
        `• Día: ${ws.dayOfWeek ?? '—'} (0=dom … 6=sáb)  Hora: ${ws.hour ?? '—'}:00`,
        ``,
        `🔇 *Moderación / Mute*`,
        `• Duración por defecto: ${mute.defaultMinutes ?? '—'} min`,
        `• Duración máxima: ${mute.maxMinutes ?? '—'} min`,
        ``,
        `🚨 *Palabras monitoreadas*`,
        `• Habilitadas: ${ww.enabled ? '✅' : '❌'}`,
        `• Palabras: ${(ww.words || []).length ? (ww.words || []).join(', ') : '—'}`,
        ``,
        `📊 *Revisión de inactividad*`,
        `• Habilitada: ${ac.enabled ? '✅' : '❌'}`,
        `• Advertencia tras: ${ac.warnAfterDays ?? '—'} días`,
        `• Remoción tras: ${ac.removeAfterDays ?? '—'} días`,
        ``,
        `👋 *Bienvenida*`,
        `• Habilitada: ${welcome.enabled ? '✅' : '❌'}`,
        ``,
        `📚 *Materias configuradas:* ${(config.subjects || []).length}`,
        `❓ *FAQs activas:* ${(config.faq || []).length}`,
      ];

      await reply(msg, lines.join('\n'));
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Comando desconocido
    // ══════════════════════════════════════════════════════════════════════════
    await reply(msg, `❓ Comando desconocido: \`${pfx}${cmd}\`\nEscribe \`!ayuda\` para ver los comandos disponibles.`);

  } catch (err) {
    console.error('[ERROR]', err);
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

client.initialize();
