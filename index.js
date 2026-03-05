// index.js — StudyBot v2
// ══════════════════════════════════════════════════════════════════════════════
// COMANDOS PÚBLICOS:
//   !ayuda                      — Ver comandos
//   !recordatorios              — Ver fechas próximas
//   !tareas                     — Ver tareas aprobadas
//   !buscar-tarea [q]           — Buscar tarea por materia/palabra
//   !proponer-tarea             — Proponer una tarea para revisión
//   !proponer-recordatorio      — Proponer una tarea para revisión
//   !pregunta [texto]           — Enviar pregunta anónima al grupo (desde privado)
//   !faq                        — Ver preguntas frecuentes
//   !tabla                      — Ver leaderboard
//   !puntos                     — Ver tus propias estadísticas
//   !premio                     — Ver el premio actual del leaderboard
//   !responder [texto]          — Registrar respuesta a una pregunta anónima
//   !admins                     — Ver administradores
//
// COMANDOS ADMIN:
//   !recordatorio "T" YYYY-MM-DD [desc]  — Agregar recordatorio
//   !borrar-r [id]                        — Borrar recordatorio
//   !pendientes                           — Ver tareas esperando revisión
//   !aprobar [id]                         — Aprobar tarea propuesta
//   !rechazar [id] [motivo]               — Rechazar tarea propuesta
//   !borrar-tarea [id]                    — Borrar tarea aprobada
//   !add-faq [keyword1,keyword2] | [q] | [a]  — Agregar FAQ
//   !del-faq [id]                         — Borrar FAQ
//   !conf-premio premio | puntos | patrocinador  — Configurar premio del leaderboard
//   !mutear [@mention o número] [min] [motivo]  — Mutear usuario
//   !desmutear [@mention o número]        — Desmutear usuario
//   !muteados                             — Ver usuarios muteados
//   !resumen-semanal                      — Forzar resumen semanal
//   !test-recordatorios                   — Forzar revisión recordatorios
//   !test-actividad                       — Forzar revisión de inactividad
//   !inactivos                            — Ver usuarios inactivos
// ══════════════════════════════════════════════════════════════════════════════

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const config = require('./config.json');

const storage    = require('./handlers/storage');
const { startCrons, checkAndSendReminders, sendWeeklySummary, parseReminderCommand, formatDate, daysDiff } = require('./handlers/reminders');
const { runModeration, formatTime } = require('./handlers/moderation');
const { buildLeaderboard, buildUserStats }  = require('./handlers/stats');
const { publishQuestion, processAnswer, buildQuestionsList } = require('./handlers/questions');
const { checkInactivity } = require('./handlers/activity');

// ─── Client setup ─────────────────────────────────────────────────────────────

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
 * Extrae el número de un mention (@tag) o lo usa directo.
 * whatsapp-web.js incluye mentions en msg.mentionedIds
 */
function extractTarget(args, mentionedIds) {
  if (mentionedIds && mentionedIds.length > 0) {
    return mentionedIds[0].replace('@c.us', '');
  }
  // fallback: número escrito directamente
  const num = args.trim().replace(/\D/g, '');
  return num || null;
}

// ─── Textos de ayuda ──────────────────────────────────────────────────────────

const HELP_PUBLIC = `
📚 *===== COMANDOS =====*

📅 *Recordatorios*
• \`!recordatorios\` — Ver entregas próximas
• \`!proponer-recordatorio "Título" YYYY-MM-DD [desc]\` — Proponer un recordatorio

📂 *Tareas resueltas*
• \`!tareas\` — Ver todas las tareas resueltas
• \`!buscar-tarea [materia]\` — Buscar por materia
• \`!proponer-tarea materia | título | desc | link\` — Proponer una tarea para que la revise un admin

❓ *Preguntas*
• \`!pregunta [texto]\` — Enviar pregunta anónima al grupo _(solo desde privado)_
• \`!responder [texto]\` — Responder citando el mensaje de la pregunta en el grupo
• \`!preguntas\` — Ver preguntas recientes con sus respuestas

🏆 *Estadísticas*
• \`!tabla\` — Leaderboard del grupo
• \`!puntos\` — Tu puntaje personal
• \`!premio\` — Ver el premio actual del leaderboard
`.trim();

const HELP_ADMIN = `
👮 *Comandos de Admin*

📌 *Recordatorios*
\`!recordatorio "Título" YYYY-MM-DD [desc]\` — Agregar directo
\`!recordatorios-pendientes\` — Ver sugerencias esperando aprobación
\`!aprobar-r [id]\`
\`!rechazar-r [id] [motivo]\`
\`!borrar-r [id]\`

📂 *Tareas*
\`!pendientes\` — Ver propuestas en revisión
\`!aprobar [id]\`
\`!rechazar [id] [motivo]\`
\`!borrar-tarea [id]\`

❓ *FAQ*
\`!add-faq keyword1,keyword2 | Pregunta | Respuesta\`
\`!del-faq [id]\`

🎁 *Premio*
\`!conf-premio Premio | Puntos | Patrocinador\`

🔇 *Moderación*
\`!mutear [@usuario] [minutos] [motivo]\`
\`!desmutear [@usuario]\`
\`!muteados\`

🔧 *Pruebas*
\`!test-recordatorios\`
\`!resumen-semanal\`
\`!test-actividad\`
\`!inactivos\`
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
    const pfx     = config.prefix || '!';

    // ── Track activity (solo en grupos) ─────────────────────────────────────
    if (isGroup) storage.updateLastSeen(number, name);

    // ── Moderación (solo en grupos) ──────────────────────────────────────────
    if (isGroup && !body.startsWith(pfx)) {
      await runModeration(msg, config);
      return;
    }

    if (!body.startsWith(pfx)) return;

    // ── Parse comando ────────────────────────────────────────────────────────
    const spaceIdx = body.indexOf(' ');
    const rawCmd = spaceIdx === -1 ? body.slice(pfx.length) : body.slice(pfx.length, spaceIdx);
    const cmd  = rawCmd.toLowerCase();
    const args = spaceIdx === -1 ? '' : body.slice(spaceIdx + 1).trim();

    // También moderamos comandos de usuarios muteados en grupos
    if (isGroup) {
      const intercepted = await runModeration(msg, config);
      if (intercepted) return;
    }

    console.log(`[CMD] ${number} (${name}) → ${cmd}`);

    // ══════════════════════════════════════════════════════════════════════════
    // !ayuda
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'ayuda') {
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
    if (cmd === 'recordatorios') {
      const list = storage.getActiveReminders()
        .sort((a, b) => new Date(a.date) - new Date(b.date));
      if (!list.length) { await reply(msg, '📭 No hay recordatorios pendientes.'); return; }
      const lines = list.map(r => {
        const diff = daysDiff(r.date);
        const when = diff === 0 ? '🚨 HOY' : diff === 1 ? '⚠️ Mañana' : diff <= 3 ? `⏰ ${diff} días` : `📅 ${diff} días`;
        return `${when} — *${r.title}*\n   📅 ${formatDate(r.date)}\n   📝 ${r.description || '—'}\n   🆔 \`${r.id}\``;
      });
      await reply(msg, `📋 *Recordatorios (${list.length}):*\n\n${lines.join('\n\n')}`);
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !proponer-recordatorio  (cualquiera)
    // Formato: !proponer-recordatorio "Título" YYYY-MM-DD descripción opcional
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'proponer-recordatorio') {
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
            `Aprueba con: \`!aprobar-r ${saved.id}\`\n` +
            `Rechaza con: \`!rechazar-r ${saved.id} [motivo]\``
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
      const diff = daysDiff(saved.date);
      await reply(msg,
        `✅ *Recordatorio guardado*\n\n📌 ${saved.title}\n🗓️ ${formatDate(saved.date)} (${diff === 0 ? 'HOY' : `${diff} días`})\n📝 ${saved.description || '—'}\n🆔 \`${saved.id}\``
      );
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !recordatorios-pendientes (ADMIN)
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'recordatorios-pendientes') {
      if (!isAdmin(number)) { await reply(msg, '🚫 Solo admins.'); return; }
      const list = storage.getPendingReminders();
      if (!list.length) { await reply(msg, '✅ No hay sugerencias de recordatorio pendientes.'); return; }
      const lines = list.map(p => {
        const diff = daysDiff(p.date);
        return `📌 *${p.title}*\n   🗓️ ${formatDate(p.date)} (en ${diff} días)\n   📝 ${p.description || '—'}\n   👤 ${p.suggestedByName || p.suggestedBy}\n   🆔 \`${p.id}\``;
      });
      await reply(msg,
        `📋 *Sugerencias pendientes (${list.length}):*\n\n${lines.join('\n\n')}\n\n` +
        `Aprueba: \`!aprobar-r [id]\`\nRechaza: \`!rechazar-r [id] [motivo]\``
      );
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !aprobar-r [id] (ADMIN)
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'aprobar-r') {
      if (!isAdmin(number)) { await reply(msg, '🚫 Solo admins.'); return; }
      if (!args) { await reply(msg, '❌ Uso: `!aprobar-r [id]`'); return; }

      const pending = storage.getPendingReminders().find(p => p.id === args.trim());
      if (!pending) { await reply(msg, `❌ No encontré la sugerencia \`${args.trim()}\``); return; }

      const saved = storage.saveReminder({
        title: pending.title,
        date: pending.date,
        description: pending.description,
        addedBy: pending.suggestedBy,
        approvedBy: number,
      });
      storage.deletePendingReminder(pending.id);
      storage.incrementStat(pending.suggestedBy, pending.suggestedByName, 'remindersApproved');

      const diff = daysDiff(saved.date);
      await reply(msg,
        `✅ Recordatorio *"${saved.title}"* aprobado.\n🗓️ ${formatDate(saved.date)} (en ${diff} días)`
      );

      // Avisar al grupo
      try {
        await client.sendMessage(config.groupId,
          `📌 *Nuevo recordatorio agregado*\n\n*${saved.title}*\n🗓️ ${formatDate(saved.date)}\n📝 ${saved.description || '—'}\n\n_Sugerido por ${pending.suggestedByName || pending.suggestedBy}_ 🙌`
        );
      } catch (e) {}

      // Avisar al que sugirió
      try {
        await client.sendMessage(`${pending.suggestedBy}@c.us`,
          `🎉 Tu sugerencia *"${pending.title}"* fue aprobada y ya está en el grupo.\n\n+1 punto en el leaderboard 🏆`
        );
      } catch (e) {}
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !rechazar-r [id] [motivo] (ADMIN)
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'rechazar-r') {
      if (!isAdmin(number)) { await reply(msg, '🚫 Solo admins.'); return; }
      const [id, ...motivoParts] = args.split(' ');
      const motivo = motivoParts.join(' ') || 'Sin motivo especificado';
      if (!id) { await reply(msg, '❌ Uso: `!rechazar-r [id] [motivo opcional]`'); return; }

      const pending = storage.getPendingReminders().find(p => p.id === id.trim());
      if (!pending) { await reply(msg, `❌ No encontré la sugerencia \`${id}\``); return; }

      storage.deletePendingReminder(pending.id);
      await reply(msg, `🗑️ Sugerencia *"${pending.title}"* rechazada.`);

      try {
        await client.sendMessage(`${pending.suggestedBy}@c.us`,
          `❌ Tu sugerencia de recordatorio *"${pending.title}"* fue rechazada.\n📝 Motivo: ${motivo}`
        );
      } catch (e) {}
      return;
    }


    // ══════════════════════════════════════════════════════════════════════════
    // !borrar-r (ADMIN)
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'borrar-r') {
      if (!isAdmin(number)) { await reply(msg, '🚫 Solo admins.'); return; }
      if (!args) { await reply(msg, '❌ Uso: `!borrar-r [id]`'); return; }
      const before = storage.getReminders().length;
      storage.deleteReminder(args.trim());
      await reply(msg, before > storage.getReminders().length
        ? `🗑️ Recordatorio eliminado.`
        : `❌ No encontré el ID \`${args.trim()}\``
      );
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !tareas
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'tareas') {
      const list = storage.getHomework();
      if (!list.length) { await reply(msg, '📭 No hay tareas guardadas aún.'); return; }
      const bySubject = list.reduce((acc, hw) => {
        if (!acc[hw.subject]) acc[hw.subject] = [];
        acc[hw.subject].push(hw);
        return acc;
      }, {});
      const sections = Object.entries(bySubject).map(([s, hws]) =>
        `📚 *${s}* (${hws.length})\n${hws.map(h => `   • ${h.title}`).join('\n')}`
      );
      await reply(msg, `📋 *Tareas disponibles:*\n\n${sections.join('\n\n')}\n\n_Usa \`!buscar-tarea [materia]\` para ver links y detalles_`);
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !buscar-tarea
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'buscar-tarea') {
      if (!args) { await reply(msg, '🔍 Uso: `!buscar-tarea [materia o palabra]`'); return; }
      const results = storage.searchHomework(args);
      if (!results.length) { await reply(msg, `🔍 No encontré tareas para *"${args}"*.`); return; }
      const lines = results.slice(0, 5).map(hw =>
        `📚 *${hw.subject}* — ${hw.title}\n   📝 ${hw.description}\n   🔗 ${hw.link || 'Sin link'}\n   👤 Por: ${hw.proposedBy || 'Admin'}\n   🆔 \`${hw.id}\``
      );
      const extra = results.length > 5 ? `\n\n_...y ${results.length - 5} más. Sé más específico._` : '';
      await reply(msg, `🔍 *"${args}" — ${results.length} resultado(s):*\n\n${lines.join('\n\n')}${extra}`);
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !proponer-tarea  (cualquiera)
    // Formato: materia | título | descripción | link
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'proponer-tarea') {
      if (!args) {
        await reply(msg, '📥 Uso:\n`!proponer-tarea materia | título | descripción | link (opcional)`\n\nEjemplo:\n`!proponer-tarea Álgebra | TP Matrices | Resuelto con Gauss-Jordan | https://drive.google.com/...`');
        return;
      }
      const parts = args.split('|').map(p => p.trim());
      if (parts.length < 3) { await reply(msg, '❌ Faltan campos. Mínimo: `materia | título | descripción`'); return; }
      const [subject, title, description, link] = parts;
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
      const list = storage.getPending();
      if (!list.length) { await reply(msg, '✅ No hay propuestas pendientes de revisión.'); return; }
      const lines = list.map(p =>
        `📚 *${p.subject}* — ${p.title}\n   📝 ${p.description}\n   🔗 ${p.link || '—'}\n   👤 ${p.proposedByName || p.proposedBy}\n   🆔 \`${p.id}\``
      );
      await reply(msg, `📥 *Propuestas pendientes (${list.length}):*\n\n${lines.join('\n\n')}\n\nAprueba: \`!aprobar [id]\`\nRechaza: \`!rechazar [id] [motivo]\``);
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !aprobar [id] (ADMIN)
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'aprobar') {
      if (!isAdmin(number)) { await reply(msg, '🚫 Solo admins.'); return; }
      if (!args) { await reply(msg, '❌ Uso: `!aprobar [id]`'); return; }
      const pending = storage.getPending().find(p => p.id === args.trim());
      if (!pending) { await reply(msg, `❌ No encontré la propuesta \`${args.trim()}\``); return; }

      storage.saveHomework({
        subject: pending.subject, title: pending.title,
        description: pending.description, link: pending.link,
        proposedBy: pending.proposedByName || pending.proposedBy,
        approvedBy: name,
      });
      storage.deletePending(pending.id);
      storage.incrementStat(pending.proposedBy, pending.proposedByName, 'tasksApproved');

      await reply(msg, `✅ Tarea *"${pending.title}"* aprobada y publicada.`);

      // Avisar al grupo
      try {
        await client.sendMessage(config.groupId,
          `📚 *Nueva tarea disponible*\n\n*${pending.subject}* — ${pending.title}\n📝 ${pending.description}\n🔗 ${pending.link || '—'}\n\n¡Gracias @${pending.proposedBy} por compartir! 🙌`
        );
      } catch (e) {}

      // Avisar al que propuso
      try {
        await client.sendMessage(`${pending.proposedBy}@c.us`,
          `🎉 ¡Tu tarea *"${pending.title}"* fue aprobada y ya está disponible en el grupo!\n\n+7 puntos en el leaderboard 🏆`
        );
      } catch (e) {}
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
      const pending = storage.getPending().find(p => p.id === id.trim());
      if (!pending) { await reply(msg, `❌ No encontré la propuesta \`${id}\``); return; }

      storage.deletePending(pending.id);
      await reply(msg, `🗑️ Propuesta *"${pending.title}"* rechazada.`);

      try {
        await client.sendMessage(`${pending.proposedBy}@c.us`,
          `❌ Tu propuesta *"${pending.title}"* fue rechazada.\n\n📝 Motivo: ${motivo}\n\nSi tienes dudas, contacta a un admin.`
        );
      } catch (e) {}
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !borrar-tarea [id] (ADMIN)
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'borrar-tarea') {
      if (!isAdmin(number)) { await reply(msg, '🚫 Solo admins.'); return; }
      if (!args) { await reply(msg, '❌ Uso: `!borrar-tarea [id]`'); return; }
      const before = storage.getHomework().length;
      storage.deleteHomework(args.trim());
      await reply(msg, before > storage.getHomework().length
        ? '🗑️ Tarea eliminada.'
        : `❌ No encontré el ID \`${args.trim()}\``
      );
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !pregunta [texto]  — Solo desde privado
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'pregunta') {
      if (isGroup) {
        await reply(msg, '🙈 Las preguntas anónimas se envían en *privado* (chat directo conmigo), no en el grupo.\n\nEscríbeme: `!pregunta [tu pregunta]`');
        return;
      }
      if (!config.anonymous.enabled) { await reply(msg, '❌ Las preguntas anónimas están desactivadas.'); return; }
      if (!args) {
        await reply(msg, '🙋 Uso: `!pregunta [tu pregunta aquí]`\n\nEjemplo:\n`!pregunta ¿Cómo se resuelven las integrales por partes?`');
        return;
      }
      try {
        await publishQuestion(client, config, number, name, args);
        await reply(msg, config.anonymous.confirmMessage +
          '\n\n_Alguien que sepa puede responder citando el mensaje en el grupo con_ `!responder [respuesta]`.');
      } catch (err) {
        await reply(msg, '❌ Error al publicar en el grupo. Contacta a un admin.');
        console.error('[ANON QUESTION ERROR]', err);
      }
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !responder [respuesta]
    // DEBE usarse citando (reply) el mensaje de la pregunta anónima en el grupo.
    // Solo la primera respuesta válida gana puntos. 
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'responder') {
      if (!isGroup) {
        await reply(msg, '💬 Este comando úsalo en el grupo, citando el mensaje de la pregunta anónima.');
        return;
      }
      if (!args) {
        await reply(msg, '💬 Uso: cita el mensaje de la pregunta y escribe `!responder [tu respuesta]`');
        return;
      }

      const result = await processAnswer(msg, number, name, args);

      switch (result.status) {
        case 'no_quote':
          await reply(msg,
            '❌ Para responder, debes *citar* el mensaje de la pregunta anónima.\n\n' +
            '_Mantén presionado el mensaje de la pregunta → Responder, y luego escribe_ `!responder [tu respuesta]`'
          );
          break;

        case 'not_a_question':
          await reply(msg, '❌ El mensaje que estás citando no corresponde a ninguna pregunta anónima registrada.');
          break;

        case 'incoherent':
          await reply(msg,
            `🤔 Tu respuesta no parece estar relacionada con la pregunta.\n\n` +
            `📌 Pregunta: _"${result.question}"_\n` +
            `💡 ${result.reason}\n\n` +
            `_Intenta con una respuesta más específica para ganar puntos._`
          );
          break;

        case 'already_answered':
          await reply(msg,
            `✅ Esta pregunta ya fue respondida por *${result.firstAnswerer}*.\n\n` +
            `Tu respuesta igual quedó guardada como aporte adicional, pero los puntos son del primero. 👍\n\n` +
            `_Usa \`!preguntas\` para ver las respuestas guardadas._`
          );
          break;

        case 'accepted':
          await reply(msg,
            `🎉 *¡Respuesta aceptada!*\n\n` +
            `📌 Pregunta: _"${result.question}"_\n` +
            `💬 Tu respuesta quedó guardada y vinculada.\n\n` +
            `⭐ *+3 puntos* en el leaderboard. ¡Gracias por ayudar!`
          );
          break;

        case 'api_error':
          // Fallback: aceptar igual pero sin puntos confirmados
          await reply(msg, '⚠️ No se pudo validar la respuesta automáticamente. Un admin la revisará.');
          break;
      }
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !preguntas — Ver historial de preguntas anónimas con respuestas
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'preguntas') {
      await reply(msg, buildQuestionsList());
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !faq
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'faq') {
      const faqs = storage.getFaqs();
      if (!faqs.length) { await reply(msg, '❓ No hay FAQs configuradas todavía.\n\n_Los admins pueden agregar con \`!add-faq\`_'); return; }
      const lines = faqs.map((f, i) => `*${i+1}. ${f.question}*\n   ${f.answer}`);
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
      const before = storage.getFaqs().length;
      storage.deleteFaq(args.trim());
      await reply(msg, before > storage.getFaqs().length ? '🗑️ FAQ eliminada.' : `❌ No encontré el ID \`${args.trim()}\``);
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
      await reply(msg, text || '📊 Aún no tienes estadísticas. ¡Empieza a proponer tareas y responder preguntas!');
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !premio — Ver el premio actual del leaderboard
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'premio') {
      const prize = storage.getPrize();
      if (!prize) {
        await reply(msg, '🎁 *Premio del leaderboard*\n\nAún no hay un premio configurado.\n\n_Los admins pueden configurarlo con_ `!conf-premio`');
      } else {
        await reply(msg,
          `🎁 *Premio del leaderboard*\n\n` +
          `🏆 Premio: *${prize.prize}*\n` +
          `🎯 Meta: *${prize.points} puntos*\n` +
          `🤝 Patrocinado por: *${prize.sponsor}*\n\n` +
          `_¡Acumula puntos proponiendo tareas y respondiendo preguntas!_`
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
        await reply(msg, '❌ Uso:\n`!conf-premio Premio | Puntos | Patrocinador`\n\nEjemplo:\n`!conf-premio Audífonos Sony | 100 | Librería Central`');
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
    // !mutear [@usuario] [minutos] [motivo]  (ADMIN)
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'mutear') {
      if (!isAdmin(number)) { await reply(msg, '🚫 Solo admins.'); return; }
      if (!isGroup) { await reply(msg, '⚠️ Este comando solo funciona en grupos.'); return; }

      const mentionedIds = msg.mentionedIds || [];
      const targetNum = extractTarget(args, mentionedIds);

      if (!targetNum) {
        await reply(msg, '❌ Uso: `!mutear @usuario [minutos] [motivo]`\n\nEjemplo: `!mutear @Juan 60 Spam repetitivo`');
        return;
      }
      if (isAdmin(targetNum)) {
        await reply(msg, '🚫 No puedes mutear a un administrador.');
        return;
      }

      // Parsear minutos y motivo del resto del args (sin el @mention)
      const argsWithoutMention = args.replace(/@\w+/g, '').trim().split(/\s+/);
      let minutes = parseInt(argsWithoutMention[0]);
      if (isNaN(minutes) || minutes <= 0) minutes = config.mute.defaultMinutes;
      if (minutes > config.mute.maxMinutes) minutes = config.mute.maxMinutes;
      const reason = argsWithoutMention.slice(1).join(' ') || 'Sin motivo especificado';

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
      const targetNum = extractTarget(args, mentionedIds);
      if (!targetNum) { await reply(msg, '❌ Uso: `!desmutear @usuario`'); return; }

      storage.unmuteUser(targetNum);
      const unmuteMsg = config.mute.unmuteMessage.replace('{user}', targetNum);
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
    // Comando desconocido
    // ══════════════════════════════════════════════════════════════════════════
    await reply(msg, `❓ Comando desconocido: \`${pfx}${cmd}\`\nEscribe \`!ayuda\` para ver los comandos disponibles.`);

  } catch (err) {
    console.error('[ERROR]', err);
  }
});

// ─── FAQ auto-responder (mensajes normales en grupo) ──────────────────────────

client.on('message', async msg => {
  try {
    const body = msg.body?.trim() || '';
    const chat = await msg.getChat();
    if (!chat.isGroup || body.startsWith(config.prefix)) return;

    // const faq = storage.matchFaq(body);
    // if (faq) {
    //   await msg.reply(`❓ *${faq.question}*\n\n${faq.answer}\n\n_Respuesta automática. Usa \`!faq\` para ver todas las preguntas frecuentes._`);
    // }
  } catch (e) {
    // Ignorar errores del auto-responder
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

client.initialize();
