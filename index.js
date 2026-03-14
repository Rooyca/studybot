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
//   !ntabla                     — Ver usuarios con puntos negativos (deudores)
//   !puntos [@mention o id]         — Ver estadísticas propias o de otro usuario
//   !donar-puntos [@mention o id] N  — Donar N puntos propios a otro usuario
//   !atacar [ID] N                   — Gastar N puntos para restar N/3 a otro usuario (solo IDs)
//   !premio                     — Ver el premio actual del leaderboard
//   (responde citando la pregunta del día para ganar puntos)
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
//   !dado                                 — Lanzar dados (1-10), ganar/perder puntos
//   !blackjack [apuesta] | !bj [apuesta]  — Jugar blackjack contra el crupier
// ══════════════════════════════════════════════════════════════════════════════

require('dotenv').config();

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const config = require('./config.json');

const { initializeSchema, closeDb } = require('./handlers/db');
const { migrateData } = require('./handlers/migrate');
const storage    = require('./handlers/storage');
const { startCrons, checkAndSendReminders, checkAndSendTodayReminders, sendWeeklySummary, parseReminderCommand, formatDate, daysDiff, todayBogota, getDayOfWeek } = require('./handlers/reminders');
const { runModeration, formatTime } = require('./handlers/moderation');
const { buildLeaderboard, buildUserStats, buildNegativePointsLeaderboard }  = require('./handlers/stats');
const { sendScheduledQuestion, processAnswer, buildQuestionsList, parseDifficulty, DIFFICULTY_POINTS, DIFFICULTY_LABELS } = require('./handlers/questions');
const { checkInactivity } = require('./handlers/activity');
const { playBlackjack, playerHit, playerStand, dealerPlay, calculateHandValue, formatHand, formatGameResult } = require('./handlers/blackjack');

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

// ─── Blackjack game state ─────────────────────────────────────────────────────
const blackjackGames = {}; // userId => { game, bet, timestamp }

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

📅 *Horario y Recordatorios*
• \`!hoy\` — Ver el horario de hoy + tareas para hoy
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
• \`!ntabla\` — Ver usuarios con puntos negativos (deudores del premio)
• \`!puntos\` — Tu puntaje personal
• \`!puntos @usuario\` — Ver puntaje de otro usuario
• \`!donar-puntos @usuario N\` — Donar N de tus puntos a otro usuario
• \`!atacar ID N\` — Gastar N puntos para restar N/3 a otro usuario (solo IDs)
• \`!premio\` — Ver el premio actual

🎲 *Diversión*
• \`!dado\` — ¡Lanza los dados! Gana +2 puntos si sacas 10 y -1 punto si sacas 1
`.trim();

const HELP_ADMIN = `
👮 *Comandos de Admin*

📅 *Horario*
\`!editar-horario "subject" [start] [end] [YYYY-MM-DD] [professor] [room]\` — Cambiar tiempo de clase
\`!editar-horario "subject" cancel [YYYY-MM-DD]\` — Cancelar clase para un día
\`!editar-horario "subject" room [YYYY-MM-DD] "new-room"\` — Cambiar solo la sala
_Ej 1: \`!editar-horario "Algoritmos I" 19:00 21:00 2025-03-15 "Dr. García" "Aula 101"\`_
_Ej 2: \`!editar-horario "Algoritmos I" cancel 2025-03-15\`_
_Ej 3: \`!editar-horario "Algoritmos I" room 2025-03-15 "Aula 205"\`_

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
\`!publicar-pregunta\` / \`!pq\` — Publicar una pregunta aleatoria ahora (cuenta en el límite diario)

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
\`!dado-conf\` — Ver configuración del comando !dado
\`!ccd\` — Activar/Desactivar el comando !dado

🔧 *Pruebas*
\`!test-recordatorios\`
\`!resumen-semanal\`
\`!test-actividad\`
\`!inactivos\`

📢 *Difusión*
\`!todos [mensaje]\` — Enviar mensaje privado a todos los miembros del grupo
\`!msg [mensaje]\` — Enviar mensaje al grupo como el bot _(solo desde privado)_
`.trim();

// ─── Command Metadata ─────────────────────────────────────────────────────────

const COMMANDS = {
  'proponer-recordatorio': {
    aliases: ['pr'],
    category: 'Recordatorios',
    description: 'Proponer un recordatorio para que lo revisen los admins',
    usage: '"Título" YYYY-MM-DD [descripción]',
    examples: [
      '!proponer-recordatorio "Entrega TP3" 2025-12-20',
      '!proponer-recordatorio "Examen final" 2025-12-25 Prepararse con los apuntes de noviembre',
      '!pr "Presentación grupal" 2025-12-10 A las 14:00 en el aula 101'
    ],
    adminOnly: false
  },
  'recordatorio': {
    aliases: [],
    category: 'Recordatorios',
    description: 'Agregar un recordatorio directamente (solo admins)',
    usage: '"Título" YYYY-MM-DD [descripción]',
    examples: [
      '!recordatorio "Publicación semanal" 2025-12-01',
      '!recordatorio "Cumpleaños de Juan" 2026-01-15 No olvides saludar'
    ],
    adminOnly: true
  },
  'recordatorios': {
    aliases: ['r'],
    category: 'Recordatorios',
    description: 'Ver todos los recordatorios próximos',
    usage: '',
    examples: [
      '!recordatorios',
      '!r'
    ],
    adminOnly: false
  },
  'borrar-recordatorio': {
    aliases: [],
    category: 'Recordatorios',
    description: 'Borrar un recordatorio por su ID (solo admins)',
    usage: '[id]',
    examples: [
      '!borrar-recordatorio abc123',
      '!borrar-recordatorio def456'
    ],
    adminOnly: true
  },
  'hoy': {
    aliases: [],
    category: 'Horario',
    description: 'Ver el horario de hoy y las tareas/recordatorios del día',
    usage: '',
    examples: [
      '!hoy'
    ],
    adminOnly: false
  },
  'editar-horario': {
    aliases: ['edit-schedule'],
    category: 'Horario',
    description: 'Editar el horario de una materia (solo admins)',
    usage: '"materia" [hora_inicio] [hora_fin] [YYYY-MM-DD] [profesor] [aula]',
    examples: [
      '!editar-horario "Algoritmos I" 19:00 21:00 2025-03-15 "Dr. García" "Aula 101"',
      '!editar-horario "Algoritmos I" cancel 2025-03-15',
      '!editar-horario "Algoritmos I" room 2025-03-15 "Aula 205"'
    ],
    adminOnly: true
  },
  'tareas': {
    aliases: ['t'],
    category: 'Tareas',
    description: 'Ver todas las tareas aprobadas',
    usage: '',
    examples: [
      '!tareas',
      '!t'
    ],
    adminOnly: false
  },
  'ver-tarea': {
    aliases: ['vt'],
    category: 'Tareas',
    description: 'Ver los detalles completos de una tarea específica',
    usage: '[número]',
    examples: [
      '!ver-tarea 1',
      '!vt 5'
    ],
    adminOnly: false
  },
  'buscar-tarea': {
    aliases: ['bt'],
    category: 'Tareas',
    description: 'Buscar tareas por materia, título o descripción',
    usage: '[consulta]',
    examples: [
      '!buscar-tarea Algoritmos',
      '!bt TP entrega'
    ],
    adminOnly: false
  },
  'proponer-tarea': {
    aliases: ['pt'],
    category: 'Tareas',
    description: 'Proponer una tarea para que la revisen los admins',
    usage: 'materia | título | descripción | link',
    examples: [
      '!proponer-tarea "Algoritmos I" | "TP 3" | "Implementar árbol binario" | https://ejemplo.com',
      '!pt "Cálculo" | "Ejercicios 1-10" | "Del capítulo 2 del libro" | link-opcional'
    ],
    adminOnly: false
  },
  'borrar-tarea': {
    aliases: [],
    category: 'Tareas',
    description: 'Borrar una tarea aprobada (solo admins)',
    usage: '[id]',
    examples: [
      '!borrar-tarea abc123'
    ],
    adminOnly: true
  },
  'apuntes': {
    aliases: ['a'],
    category: 'Apuntes',
    description: 'Ver todos los apuntes disponibles',
    usage: '',
    examples: [
      '!apuntes',
      '!a'
    ],
    adminOnly: false
  },
  'ver-apuntes': {
    aliases: ['va'],
    category: 'Apuntes',
    description: 'Ver los detalles completos de unos apuntes específicos',
    usage: '[número]',
    examples: [
      '!ver-apuntes 1',
      '!va 3'
    ],
    adminOnly: false
  },
  'buscar-apuntes': {
    aliases: ['ba'],
    category: 'Apuntes',
    description: 'Buscar apuntes por materia, título o descripción',
    usage: '[consulta]',
    examples: [
      '!buscar-apuntes Física',
      '!ba termodinámica'
    ],
    adminOnly: false
  },
  'proponer-apuntes': {
    aliases: ['pa'],
    category: 'Apuntes',
    description: 'Compartir tus apuntes para que los revisen los admins',
    usage: 'materia | título | descripción | link',
    examples: [
      '!proponer-apuntes "Física II" | "Termodinámica" | "Resumen de leyes" | https://drive.google.com/...',
      '!pa "Cálculo" | "Integrales" | "Notas de la clase" | link'
    ],
    adminOnly: false
  },
  'borrar-apuntes': {
    aliases: [],
    category: 'Apuntes',
    description: 'Borrar apuntes aprobados (solo admins)',
    usage: '[id]',
    examples: [
      '!borrar-apuntes abc123'
    ],
    adminOnly: true
  },
  'recursos': {
    aliases: ['rc'],
    category: 'Recursos',
    description: 'Ver todos los recursos disponibles',
    usage: '',
    examples: [
      '!recursos',
      '!rc'
    ],
    adminOnly: false
  },
  'ver-recurso': {
    aliases: ['vrc'],
    category: 'Recursos',
    description: 'Ver los detalles completos de un recurso específico',
    usage: '[número]',
    examples: [
      '!ver-recurso 1',
      '!vrc 2'
    ],
    adminOnly: false
  },
  'buscar-recurso': {
    aliases: ['brc'],
    category: 'Recursos',
    description: 'Buscar recursos por tipo, título o descripción',
    usage: '[consulta]',
    examples: [
      '!buscar-recurso calculadora',
      '!brc video tutorial'
    ],
    adminOnly: false
  },
  'proponer-recurso': {
    aliases: ['prc'],
    category: 'Recursos',
    description: 'Compartir un recurso útil para que lo revisen los admins',
    usage: 'tipo | título | descripción | link',
    examples: [
      '!proponer-recurso "Video" | "Cálculo integral" | "Excelente explicación" | https://youtube.com/...',
      '!prc "Libro" | "Álgebra lineal" | "Referencia completa" | link'
    ],
    adminOnly: false
  },
  'borrar-recurso': {
    aliases: [],
    category: 'Recursos',
    description: 'Borrar un recurso aprobado (solo admins)',
    usage: '[id]',
    examples: [
      '!borrar-recurso abc123'
    ],
    adminOnly: true
  },
  'tabla': {
    aliases: [],
    category: 'Estadísticas',
    description: 'Ver la tabla de puntos (leaderboard) del grupo',
    usage: '',
    examples: [
      '!tabla'
    ],
    adminOnly: false
  },
  'ntabla': {
    aliases: [],
    category: 'Estadísticas',
    description: 'Ver usuarios con puntos negativos (deben dar el premio)',
    usage: '',
    examples: [
      '!ntabla'
    ],
    adminOnly: false
  },
  'puntos': {
    aliases: [],
    category: 'Estadísticas',
    description: 'Ver tu puntaje o el de otro usuario',
    usage: '[@usuario] o [número]',
    examples: [
      '!puntos',
      '!puntos @Juan',
      '!puntos 5493123456'
    ],
    adminOnly: false
  },
  'donar-puntos': {
    aliases: [],
    category: 'Estadísticas',
    description: 'Donar puntos tuyos a otro usuario',
    usage: '@usuario N o número N',
    examples: [
      '!donar-puntos @Maria 10',
      '!donar-puntos 5493654321 5'
    ],
    adminOnly: false
  },
  'atacar': {
    aliases: [],
    category: 'Estadísticas',
    description: 'Gastar puntos para restar puntos a otro usuario (solo con IDs)',
    usage: 'ID PUNTOS',
    examples: [
      '!atacar 5 9',
      '!atacar 12 6'
    ],
    adminOnly: false
  },
  'premio': {
    aliases: [],
    category: 'Estadísticas',
    description: 'Ver el premio actual del leaderboard',
    usage: '',
    examples: [
      '!premio'
    ],
    adminOnly: false
  },
  'conf-premio': {
    aliases: [],
    category: 'Estadísticas',
    description: 'Configurar el premio del leaderboard (solo admins)',
    usage: 'nombre | puntos | patrocinador',
    examples: [
      '!conf-premio "Pizza party" | 500 | "Pizzería Gino"'
    ],
    adminOnly: true
  },
  'preguntas': {
    aliases: [],
    category: 'Preguntas',
    description: 'Ver preguntas recientes con sus respuestas',
    usage: '',
    examples: [
      '!preguntas'
    ],
    adminOnly: false
  },
  'faq': {
    aliases: [],
    category: 'Preguntas',
    description: 'Ver preguntas frecuentes (FAQ)',
    usage: '',
    examples: [
      '!faq'
    ],
    adminOnly: false
  },
  'add-faq': {
    aliases: [],
    category: 'Preguntas',
    description: 'Agregar una pregunta frecuente (solo admins)',
    usage: 'palabra1,palabra2 | pregunta | respuesta',
    examples: [
      '!add-faq horario,clase | ¿A qué hora es la clase? | Es a las 19:00',
      '!add-faq examen,fecha | ¿Cuándo es el examen? | El 25 de diciembre'
    ],
    adminOnly: true
  },
  'del-faq': {
    aliases: [],
    category: 'Preguntas',
    description: 'Borrar una pregunta frecuente (solo admins)',
    usage: '[id]',
    examples: [
      '!del-faq abc123'
    ],
    adminOnly: true
  },
  'add-pregunta': {
    aliases: [],
    category: 'Preguntas',
    description: 'Agregar una pregunta al banco de preguntas diarias (solo admins)',
    usage: 'fácil|normal|difícil | pregunta | respuesta',
    examples: [
      '!add-pregunta fácil | ¿Cuál es la capital de Francia? | París',
      '!add-pregunta difícil | ¿Cuál es la integral de x² ? | x³/3 + C'
    ],
    adminOnly: true
  },
  'publicar-pregunta': {
    aliases: ['pq'],
    category: 'Preguntas',
    description: 'Publicar una pregunta aleatoria ahora (solo admins)',
    usage: '',
    examples: [
      '!publicar-pregunta',
      '!pq'
    ],
    adminOnly: true
  },
  'pendientes': {
    aliases: [],
    category: 'Moderación',
    description: 'Ver todas las propuestas esperando aprobación (solo admins)',
    usage: '',
    examples: [
      '!pendientes'
    ],
    adminOnly: true
  },
  'aprobar': {
    aliases: [],
    category: 'Moderación',
    description: 'Aprobar una propuesta (solo admins)',
    usage: '[id]',
    examples: [
      '!aprobar abc123',
      '!aprobar xyz789'
    ],
    adminOnly: true
  },
  'rechazar': {
    aliases: [],
    category: 'Moderación',
    description: 'Rechazar una propuesta con motivo (solo admins)',
    usage: '[id] [motivo]',
    examples: [
      '!rechazar abc123 Enlace roto',
      '!rechazar xyz789 Ya existe una tarea similar'
    ],
    adminOnly: true
  },
  'usuarios': {
    aliases: [],
    category: 'Configuración',
    description: 'Ver lista de usuarios con sus IDs (solo admins)',
    usage: '',
    examples: [
      '!usuarios'
    ],
    adminOnly: true
  },
  'dar-puntos': {
    aliases: [],
    category: 'Configuración',
    description: 'Sumar puntos manualmente a un usuario (solo admins)',
    usage: '@usuario N [motivo] o número N [motivo]',
    examples: [
      '!dar-puntos @Juan 10 Excelente presentación',
      '!dar-puntos 5493123456 5'
    ],
    adminOnly: true
  },
  'mutear': {
    aliases: [],
    category: 'Moderación',
    description: 'Mutear a un usuario (solo admins)',
    usage: '@usuario [minutos] [motivo]',
    examples: [
      '!mutear @Carlos 10 Spam',
      '!mutear 5493654321 Spam persistente'
    ],
    adminOnly: true
  },
  'desmutear': {
    aliases: [],
    category: 'Moderación',
    description: 'Desmutear a un usuario (solo admins)',
    usage: '@usuario o número',
    examples: [
      '!desmutear @Carlos',
      '!desmutear 5493654321'
    ],
    adminOnly: true
  },
  'muteados': {
    aliases: [],
    category: 'Moderación',
    description: 'Ver lista de usuarios muteados (solo admins)',
    usage: '',
    examples: [
      '!muteados'
    ],
    adminOnly: true
  },
  'conf': {
    aliases: [],
    category: 'Configuración',
    description: 'Ver la configuración actual del bot (solo admins)',
    usage: '',
    examples: [
      '!conf'
    ],
    adminOnly: true
  },
  'ccd': {
    aliases: [],
    category: 'Configuración',
    description: 'Activar/desactivar el comando !dado (solo admins)',
    usage: '',
    examples: [
      '!ccd'
    ],
    adminOnly: true
  },
  'test-recordatorios': {
    aliases: [],
    category: 'Pruebas',
    description: 'Forzar revisión de recordatorios (solo admins)',
    usage: '',
    examples: [
      '!test-recordatorios'
    ],
    adminOnly: true
  },
  'test-actividad': {
    aliases: [],
    category: 'Pruebas',
    description: 'Forzar revisión de inactividad (solo admins)',
    usage: '',
    examples: [
      '!test-actividad'
    ],
    adminOnly: true
  },
  'resumen-semanal': {
    aliases: [],
    category: 'Pruebas',
    description: 'Forzar envío del resumen semanal (solo admins)',
    usage: '',
    examples: [
      '!resumen-semanal'
    ],
    adminOnly: true
  },
  'inactivos': {
    aliases: [],
    category: 'Pruebas',
    description: 'Ver usuarios inactivos (solo admins)',
    usage: '',
    examples: [
      '!inactivos'
    ],
    adminOnly: true
  },
  'todos': {
    aliases: [],
    category: 'Difusión',
    description: 'Enviar mensaje privado a todos los miembros del grupo (solo admins)',
    usage: '[mensaje]',
    examples: [
      '!todos Se adelanta la clase de mañana a las 18:00'
    ],
    adminOnly: true
  },
  'msg': {
    aliases: [],
    category: 'Difusión',
    description: 'Enviar mensaje al grupo como el bot (solo desde privado, solo admins)',
    usage: '[mensaje]',
    examples: [
      '!msg Recordatorio: Mañana es la entrega final'
    ],
    adminOnly: true
  },
  'admins': {
    aliases: [],
    category: 'Información',
    description: 'Ver los admins del bot',
    usage: '',
    examples: [
      '!admins'
    ],
    adminOnly: false
  },
  'dado': {
    aliases: [],
    category: 'Diversión',
    description: 'Lanzar los dados. ¡Si sacas 10 ganas 2 puntos, pero si sacas 1 pierdes 1 punto!',
    usage: '',
    examples: [
      '!dado'
    ],
    adminOnly: false
  },
  'dado-conf': {
    aliases: ['dcf'],
    category: 'Configuración',
    description: 'Ver la configuración actual del comando !dado',
    usage: '',
    examples: [
      '!dado-conf',
      '!dcf'
    ],
    adminOnly: false
  },
  'ayuda': {
    aliases: ['help'],
    category: 'Información',
    description: 'Ver ayuda de todos los comandos o de uno específico',
    usage: '[comando opcional]',
    examples: [
      '!ayuda',
      '!ayuda proponer-recordatorio',
      '!help tareas',
      '!ayuda pr'
    ],
    adminOnly: false
  }
};

// ─── Helper functions for command help ──────────────────────────────────────

function getCommandByNameOrAlias(query) {
  const lowerQuery = query.toLowerCase();
  
  // Direct match
  if (COMMANDS[lowerQuery]) {
    return { name: lowerQuery, ...COMMANDS[lowerQuery] };
  }
  
  // Alias match
  for (const [cmdName, cmdData] of Object.entries(COMMANDS)) {
    if (cmdData.aliases.includes(lowerQuery)) {
      return { name: cmdName, ...cmdData };
    }
  }
  
  return null;
}

function formatCommandHelp(cmdName, cmdData) {
  const title = `*${cmdName}*`;
  const aliasText = cmdData.aliases.length > 0 ? `Alias: ${cmdData.aliases.map(a => `\`${a}\``).join(', ')}\n` : '';
  const descText = `${cmdData.description}\n`;
  const usageText = cmdData.usage ? `Uso: \`${cmdName} ${cmdData.usage}\`\n` : '';
  const examplesText = cmdData.examples.length > 0 
    ? `Ejemplos:\n${cmdData.examples.map(ex => `  • \`${ex}\``).join('\n')}\n`
    : '';
  const restrictionText = cmdData.adminOnly ? '_Solo administradores_\n' : '';
  
  return `${title}\n${aliasText}${descText}${usageText}${examplesText}${restrictionText}`.trim();
}

function groupCommandsByCategory() {
  const grouped = {};
  
  for (const [cmdName, cmdData] of Object.entries(COMMANDS)) {
    const category = cmdData.category || 'Otros';
    if (!grouped[category]) {
      grouped[category] = [];
    }
    grouped[category].push({ name: cmdName, ...cmdData });
  }
  
  return grouped;
}

function formatAllCommandsHelp(showAdmin = false) {
  const grouped = groupCommandsByCategory();
  const categories = Object.keys(grouped).sort();
  
  let text = '📚 *COMANDOS* 📚\n\n';
  
  for (const category of categories) {
    // Skip admin commands if user is not admin
    if (!showAdmin && grouped[category].some(c => c.adminOnly)) {
      const publicCmds = grouped[category].filter(c => !c.adminOnly);
      if (publicCmds.length === 0) continue;
      
      text += `*${category}*\n`;
      for (const cmd of publicCmds) {
        const aliases = cmd.aliases.length > 0 ? ` / ${cmd.aliases.map(a => `\`${a}\``).join(', ')}` : '';
        text += `• \`${cmd.name}\`${aliases} — ${cmd.description}\n`;
      }
      text += '\n';
    } else if (showAdmin) {
      text += `*${category}*\n`;
      for (const cmd of grouped[category]) {
        const restriction = cmd.adminOnly ? ' 👮' : '';
        const aliases = cmd.aliases.length > 0 ? ` / ${cmd.aliases.map(a => `\`${a}\``).join(', ')}` : '';
        text += `• \`${cmd.name}\`${aliases} — ${cmd.description}${restriction}\n`;
      }
      text += '\n';
    }
  }
  
  return text.trim();
}

// ─── Message handler ──────────────────────────────────────────────────────────

client.on('message', async msg => {
  const handlerTimeout = setTimeout(() => {
    console.warn(`[TIMEOUT] Message handler exceeded 30 seconds for msg ${msg.id}`);
  }, 30000);

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
      if (args) {
        // Specific command help
        const cmdInfo = getCommandByNameOrAlias(args);
        if (cmdInfo) {
          // Check if user has access to this command
          if (cmdInfo.adminOnly && !isAdmin(number)) {
            await reply(msg, `❌ El comando \`${args}\` es solo para administradores.`);
            return;
          }
          const helpText = formatCommandHelp(cmdInfo.name, cmdInfo);
          await reply(msg, helpText);
        } else {
          await reply(msg, `❌ No encontré el comando \`${args}\`. Usa \`!ayuda\` para ver todos los comandos disponibles.`);
        }
      } else {
        // All commands help
        const allCommandsText = formatAllCommandsHelp(isAdmin(number));
        await reply(msg, allCommandsText);
      }
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
    // !hoy — Mostrar horario y tareas de hoy
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'hoy') {
      const today = todayBogota();
      const dayName = getDayOfWeek(today);
      
      // Get schedule from config or schedule overrides
      const override = storage.getOverrideForDate(today);
      const normalSchedule = config.schedule && config.schedule[dayName] ? config.schedule[dayName] : [];
      
      let response = `📅 *Horario de hoy (${formatDate(today)})*\n`;
      
      // Check if there's an override
      if (override !== null) {
        response += `_(⚠️ MODIFICADO POR ADMIN)_\n`;
        // If override is empty array, it means class was cancelled
        if (override.length === 0) {
          response += '\n🚫 *SIN CLASES HOY — Clase cancelada por el profesor*';
        } else {
          response += '\n';
          const lines = override.map(c => 
            `⏰ ${c.start} - ${c.end}\n   📚 ${c.subject}\n   👨‍🏫 ${c.professor}\n   🏫 ${c.room || '—'}`
          );
          response += lines.join('\n\n');
        }
      } else if (normalSchedule.length > 0) {
        response += '\n';
        const lines = normalSchedule.map(c => 
          `⏰ ${c.start} - ${c.end}\n   📚 ${c.subject}\n   👨‍🏫 ${c.professor}\n   🏫 ${c.room || '—'}`
        );
        response += lines.join('\n\n');
      } else {
        response += '\n✅ No hay clases hoy\n';
      }
      
      // Add today's reminders/tasks
      const todayReminders = storage.getReminders().filter(r => r.date === today);
      if (todayReminders.length > 0) {
        response += '\n\n📋 *Tareas para hoy:*\n';
        const taskLines = todayReminders.map(r => 
          `🚨 *${r.title}*\n   📝 ${r.description || '—'}`
        );
        response += taskLines.join('\n\n');
      }
      
      await reply(msg, response);
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !editar-horario — Cambiar horario para un día (cambios de tiempo, cancelar, cambiar aula)
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'editar-horario' || cmd === 'edit-schedule') {
      if (!isAdmin(number)) {
        await reply(msg, '🚫 Solo admins pueden editar el horario.');
        return;
      }
      
      if (!args) {
        await reply(msg, 
          `📝 *Uso del comando !editar-horario:*\n\n` +
          `1️⃣ *Cambiar tiempo de clase:*\n` +
          `\`!editar-horario "Algoritmos I" 19:00 21:00 2025-03-15 "Dr. García" "Aula 101"\`\n\n` +
          `2️⃣ *Cancelar clase (sin clase ese día):*\n` +
          `\`!editar-horario "Algoritmos I" cancel 2025-03-15\`\n\n` +
          `3️⃣ *Cambiar solo la sala:*\n` +
          `\`!editar-horario "Algoritmos I" room 2025-03-15 "Aula 205"\``
        );
        return;
      }
      
      // Extract subject (first quoted string)
      const subjMatch = args.match(/"([^"]+)"/);
      if (!subjMatch) {
        await reply(msg, '❌ Pon el nombre de la materia entre comillas. Ej: "Algoritmos I"');
        return;
      }
      
      const subject = subjMatch[1].trim();
      const restArgs = args.replace(`"${subject}"`, '').trim();
      const parts = restArgs.split(/\s+/);
      
      // ──── CASE 1: Cancel class ────
      if (parts[0] && parts[0].toLowerCase() === 'cancel') {
        const dateStr = parts[1];
        
        // Validate date
        if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          await reply(msg, '❌ Formato de fecha inválido. Usa YYYY-MM-DD (ej: 2025-03-15)');
          return;
        }
        
        if (isNaN(new Date(dateStr).getTime())) {
          await reply(msg, '❌ Fecha no válida.');
          return;
        }
        
        if (daysDiff(dateStr) < 0) {
          await reply(msg, '❌ No puedes editar el horario de un día pasado.');
          return;
        }
        
        // Save override with empty array (no classes)
        storage.saveScheduleOverride(dateStr, []);
        
        await reply(msg,
          `✅ *Clase cancelada para ${formatDate(dateStr)}*\n\n` +
          `📚 ${subject}\n` +
          `🚫 Sin clase (cancelada)`
        );
        return;
      }
      
      // ──── CASE 2: Change only room ────
      if (parts[0] && parts[0].toLowerCase() === 'room') {
        const dateStr = parts[1];
        const newRoomMatch = restArgs.match(/"([^"]+)"(?!.*")/);
        const newRoom = newRoomMatch ? newRoomMatch[1].trim() : parts[2];
        
        // Validate date
        if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          await reply(msg, '❌ Formato de fecha inválido. Usa YYYY-MM-DD (ej: 2025-03-15)');
          return;
        }
        
        if (isNaN(new Date(dateStr).getTime())) {
          await reply(msg, '❌ Fecha no válida.');
          return;
        }
        
        if (daysDiff(dateStr) < 0) {
          await reply(msg, '❌ No puedes editar el horario de un día pasado.');
          return;
        }
        
        if (!newRoom) {
          await reply(msg, '❌ Especifica la nueva sala. Ej: `!editar-horario "Algoritmos I" room 2025-03-15 "Aula 205"`');
          return;
        }
        
        // Get the current schedule for that day
        const override = storage.getOverrideForDate(dateStr);
        const dayName = getDayOfWeek(dateStr);
        const normalSchedule = config.schedule && config.schedule[dayName] ? config.schedule[dayName] : [];
        const currentSchedule = override || normalSchedule;
        
        // Find and update the class
        const classToChange = currentSchedule.find(c => c.subject.toLowerCase() === subject.toLowerCase());
        if (!classToChange) {
          await reply(msg, `❌ No encontré la clase "${subject}" en el horario de ${formatDate(dateStr)}`);
          return;
        }
        
        // Update the class with new room
        const updatedSchedule = currentSchedule.map(c => 
          c.subject.toLowerCase() === subject.toLowerCase() 
            ? { ...c, room: newRoom }
            : c
        );
        
        storage.saveScheduleOverride(dateStr, updatedSchedule);
        
        await reply(msg,
          `✅ *Sala modificada para ${formatDate(dateStr)}*\n\n` +
          `📚 ${subject}\n` +
          `⏰ ${classToChange.start} - ${classToChange.end}\n` +
          `👨‍🏫 ${classToChange.professor}\n` +
          `🏫 ${newRoom} _(cambio de ${classToChange.room})_`
        );
        return;
      }
      
      // ──── CASE 3: Full schedule change (time + professor + room) ────
      const start = parts[0];
      const end = parts[1];
      const dateStr = parts[2];
      const profMatch = restArgs.match(/"([^"]*)"(?!.*")/);
      const professor = profMatch ? profMatch[1].trim() : parts[4] || '—';
      const room = parts[5] || '—';
      
      // Validate time format (HH:MM)
      if (!start || !/^\d{1,2}:\d{2}$/.test(start) || !end || !/^\d{1,2}:\d{2}$/.test(end)) {
        await reply(msg, '❌ Formato de hora inválido. Usa HH:MM (ej: 19:00)');
        return;
      }
      
      // Validate date format
      if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        await reply(msg, '❌ Formato de fecha inválido. Usa YYYY-MM-DD (ej: 2025-03-15)');
        return;
      }
      
      if (isNaN(new Date(dateStr).getTime())) {
        await reply(msg, '❌ Fecha no válida.');
        return;
      }
      
      if (daysDiff(dateStr) < 0) {
        await reply(msg, '❌ No puedes editar el horario de un día pasado.');
        return;
      }
      
      // Save override (replace the entire schedule for this day with this class)
      storage.saveScheduleOverride(dateStr, [{
        subject,
        start,
        end,
        professor,
        room
      }]);
      
      await reply(msg,
        `✅ *Horario modificado para ${formatDate(dateStr)}*\n\n` +
        `⏰ ${start} - ${end}\n` +
        `📚 ${subject}\n` +
        `👨‍🏫 ${professor}\n` +
        `🏫 ${room}`
      );
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
    // !publicar-pregunta | !pq  — Publica una pregunta aleatoria ahora (ADMIN)
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'publicar-pregunta' || cmd === 'pq') {
      if (!isAdmin(number)) { await reply(msg, '🚫 Solo admins.'); return; }

      const pool = storage.getDailyQuestions();
      if (!pool.length) {
        await reply(msg, '❌ El banco de preguntas está vacío. Agrega preguntas con `!add-pregunta`.');
        return;
      }

      const questionsPerDay = config.dailyQuestions?.questionsPerDay ?? 3;
      const bogotaToday = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
      const sentToday = storage.getQuestions().filter(q => {
        if (!q.askedAt) return false;
        return new Date(q.askedAt).toLocaleDateString('en-CA', { timeZone: 'America/Bogota' }) === bogotaToday;
      }).length;

      if (sentToday >= questionsPerDay) {
        await reply(msg, `⚠️ Ya se alcanzó el límite de preguntas del día (*${sentToday}/${questionsPerDay}*). Puedes cambiar \`questionsPerDay\` en la configuración.`);
        return;
      }

      const sent = await sendScheduledQuestion(client, config);
      if (sent) {
        const remaining = questionsPerDay - sentToday - 1;
        await reply(msg, `✅ *Pregunta publicada.* Quedan *${remaining}* pregunta(s) programada(s) para hoy.`);
      } else {
        await reply(msg, '❌ No se pudo publicar la pregunta.');
      }
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
    // !ntabla — Usuarios con puntos negativos
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'ntabla') {
      await reply(msg, buildNegativePointsLeaderboard());
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !puntos [@mention o id] — Puntaje personal o de otro usuario
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'puntos') {
      const mentionedIds = msg.mentionedIds || [];
      const targetNum = args.trim() ? resolveTarget(args, mentionedIds) : null;
      if (targetNum) {
        const text = buildUserStats(targetNum, false);
        await reply(msg, text || '📊 Ese usuario aún no tiene estadísticas registradas.');
      } else {
        const text = buildUserStats(number, true);
        await reply(msg, text || '📊 Aún no tienes estadísticas. ¡Empieza a proponer tareas/apuntes/recordatorios y responder preguntas!');
      }
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !donar-puntos <@mention o id> N — Transferir puntos propios a otro usuario
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'donar-puntos') {
      const mentionedIds = msg.mentionedIds || [];
      const targetNum = resolveTarget(args, mentionedIds);
      if (!targetNum) {
        await reply(msg, '❌ Uso: `!donar-puntos <@mention o id> N`\n\nEjemplo: `!donar-puntos @Juan 10`');
        return;
      }
      if (targetNum === number) {
        await reply(msg, '❌ No puedes donarte puntos a ti mismo.');
        return;
      }

      const rest = argsAfterTarget(args, mentionedIds);
      const amount = parseInt(rest.trim().split(/\s+/)[0]);
      if (isNaN(amount) || amount <= 0) {
        await reply(msg, '❌ La cantidad de puntos debe ser un número mayor a 0.\n\nEjemplo: `!donar-puntos @Juan 10`');
        return;
      }

      // Resolve names
      const activityData = storage.getActivity();
      let senderName = activityData[number]?.name || number;
      let targetName = activityData[targetNum]?.name || targetNum;
      if (!activityData[targetNum]?.name) {
        try {
          const c = await client.getContactById(`${targetNum}@c.us`);
          targetName = c.pushname || c.name || targetNum;
        } catch (_) {}
      }

      const result = storage.transferPoints(number, senderName, targetNum, targetName, amount);
      if (!result) {
        const senderStats = storage.getStats()[number];
        const available = senderStats?.totalPoints || 0;
        await reply(msg, `❌ No tienes suficientes puntos. Tu saldo actual: *${available} pts*.`);
        return;
      }

      storage.log('donate_points', { from: number, to: targetNum, amount });

      await reply(msg,
        `🎁 *Puntos donados con éxito*\n\n` +
        `👤 Para: *${targetName}*\n` +
        `⭐ Cantidad: *${amount} pts*\n\n` +
        `Tu nuevo saldo: *${result.donor.totalPoints} pts*`
      );

      try {
        await client.sendMessage(`${targetNum}@c.us`,
          `🎁 *¡Recibiste una donación de puntos!*\n\n` +
          `👤 De: *${senderName}*\n` +
          `⭐ Cantidad: *+${amount} pts*\n\n` +
          `Tu nuevo saldo: *${result.recipient.totalPoints} pts*`
        );
      } catch (_) {}
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !atacar <ID> <PUNTOS> — Gastar puntos para restar puntos a otro usuario
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'atacar') {
      const tokens = args.trim().split(/\s+/);
      const targetIdStr = tokens[0];
      const pointsStr = tokens[1];

      if (!targetIdStr || !pointsStr) {
        await reply(msg, '❌ Uso: `!atacar <ID> <PUNTOS>`\n\nEjemplo: `!atacar 5 9`\n_(Gastarás 9 puntos para restar 3 a la persona con ID 5)_');
        return;
      }

      // Parse target ID (activity ID only, no mentions or phone numbers)
      const targetId = parseInt(targetIdStr);
      if (isNaN(targetId) || targetId <= 0) {
        await reply(msg, '❌ El ID debe ser un número positivo.');
        return;
      }

      const targetUser = storage.getUserByActivityId(targetId);
      if (!targetUser) {
        await reply(msg, '❌ Usuario con ID ' + targetId + ' no encontrado.');
        return;
      }

      const targetNum = targetUser.number;
      if (targetNum === number) {
        await reply(msg, '❌ No puedes atacarte a ti mismo.');
        return;
      }

      const pointsToSpend = parseInt(pointsStr);
      if (isNaN(pointsToSpend) || pointsToSpend < 3) {
        await reply(msg, '❌ Debes gastar al menos 3 puntos para atacar.\n\nEjemplo: `!atacar 5 9`');
        return;
      }

      // Check if attacker has enough points
      const attackerStats = storage.getStats()[number];
      if (!attackerStats || (attackerStats.totalPoints || 0) < pointsToSpend) {
        const available = attackerStats?.totalPoints || 0;
        await reply(msg, `❌ No tienes suficientes puntos. Tu saldo actual: *${available} pts*.`);
        return;
      }

      // Get names
      const activityData = storage.getActivity();
      let attackerName = activityData[number]?.name || number;
      let targetName = activityData[targetNum]?.name || targetNum;

      // Perform attack
      const result = storage.attackUser(number, attackerName, targetNum, targetName, pointsToSpend);
      if (!result) {
        await reply(msg, '❌ Error al procesar el ataque.');
        return;
      }

      storage.log('attack', { attacker: number, target: targetNum, pointsSpent: pointsToSpend, damage: result.damage });

      const damageDealt = result.actualDamage || result.damage;
      await reply(msg,
        `⚔️ *¡Ataque exitoso!*\n\n` +
        `👤 Objetivo: *${targetName}*\n` +
        `⭐ Puntos gastados: *${pointsToSpend} pts*\n` +
        `💥 Daño infligido: *${damageDealt} pts*\n\n` +
        `Tu nuevo saldo: *${result.attacker.totalPoints} pts*`
      );

      try {
        await client.sendMessage(`${targetNum}@c.us`,
          `⚔️ *¡Fuiste atacado!*\n\n` +
          `👤 Atacante: *${attackerName}*\n` +
          `💥 Daño recibido: *-${damageDealt} pts*\n\n` +
          `Tu nuevo saldo: *${result.target.totalPoints} pts*`
        );
      } catch (_) {}
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
    // !dado — Lanzar dados (1-100), guardar resultado y premiar si saca 100
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'dado') {
      const dado = config.dado || { enabled: false };
      if (!dado.enabled) { await reply(msg, '🚫 El comando !dado está deshabilitado.'); return; }
      
      // Check cooldown - use dynamic cooldown from config, default to 10 seconds
      const COOLDOWN_SECONDS = dado.cooldown || 10;
      if (!storage.checkDadoCooldown(number, COOLDOWN_SECONDS)) {
        const remainingSeconds = storage.getDadoCooldownRemaining(number, COOLDOWN_SECONDS);
        // const remainingMinutes = Math.ceil(remainingSeconds / 60);
        await reply(msg, `⏱️ Intenta nuevamente en ${remainingSeconds} segundo${remainingSeconds !== 1 ? 's' : ''}.`);
        return;
      }
      
      // Generate random number with user ID and timestamp for better entropy
      const seed = parseInt(number.slice(-4)) + Date.now() % 10000;
      const diceRoll = Math.floor((Math.random() + (seed % 1)) * 10) % 10 + 1;
      
      storage.saveDadoRoll(number, diceRoll);
      
      const stats = storage.getStats()[number] || {};
      const currentPoints = stats.totalPoints || 0;
      
      if (diceRoll === 10) {
        // WINNING: Add configured points
        const pointsWon = dado.pointsWin || 2;
        storage.addBonusPoints(number, name, pointsWon, 'Ganó !dado (10)');
        
        const winMsg = (dado.winningMessage || '🎉 *¡GANADOR!* 🎉\n\n✨ @{name} ha sacado un {number} en el !dado 🎰\n\n¡Felicitaciones! 🏆 Has ganado {points} puntos.')
          .replace('{name}', name)
          .replace('{number}', diceRoll)
          .replace('{points}', pointsWon);
        
        await reply(msg, winMsg);
        
        // Deactivate the game after someone wins
        // config.dado.enabled = false;
        // const deactivateMsg = `⛔ *¡JUEGO FINALIZADO!* ⛔\n\n🎰 El comando !dado se ha desactivado automáticamente.\n\n🏆 @${name} fue el ganador y se llevó los puntos.\n\n¡Felicitaciones! 🎊`;
        // await reply(msg, deactivateMsg);
        
      } else if (diceRoll === 1) {
        // LOSING: Lose configured points
        const pointsLost = -(dado.pointsLose || 1);
        storage.addBonusPoints(number, name, pointsLost, 'Perdió !dado (1)');
        
        const loseMsg = `💔 *¡PERDISTE!* 💔\n\n@${name} sacó un ${diceRoll} y perdió ${dado.pointsLose || 1} punto${(dado.pointsLose || 1) !== 1 ? 's' : ''}. 😢`;
        await reply(msg, loseMsg);
      } else {
        // Regular roll
        const rollMsg = (dado.rollMessage || '🎲 *{number}*')
          .replace('{name}', name)
          .replace('{number}', diceRoll);
        
        await reply(msg, rollMsg);
      }
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !dado-conf — Show !dado configuration
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'dado-conf' || cmd === 'dcf') {
      const dado = config.dado || { enabled: false };
      
      const statusText = dado.enabled ? '✅ *ACTIVO*' : '❌ *DESACTIVO*';
      const cooldown = dado.cooldown || 10;
      const pointsWin = dado.pointsWin || 2;
      const pointsLose = dado.pointsLose || 1;
      
      const confMsg = `🎲 *Configuración del comando !dado*\n\n` +
        `📊 *Estado:* ${statusText}\n` +
        `⏱️ *Cooldown entre lanzamientos:* ${cooldown} segundo${cooldown !== 1 ? 's' : ''}\n` +
        `🏆 *Puntos por ganar (sacar 10):* +${pointsWin}\n` +
        `💔 *Puntos por perder (sacar 1):* -${pointsLose}`;
      
      await reply(msg, confMsg);
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !ccd — Toggle !dado command on/off (ADMIN)
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'ccd') {
      if (!isAdmin(number)) { await reply(msg, '🚫 Solo admins.'); return; }
      
      if (!config.dado) { config.dado = { enabled: true }; }
      
      const isCurrentlyEnabled = config.dado.enabled;
      config.dado.enabled = !isCurrentlyEnabled;
      
      let statusMsg;
      if (config.dado.enabled) {
        statusMsg = `🎲 *Comando !dado ACTIVADO* ✅\n\n` +
          `📋 *REGLAS DEL JUEGO:*\n\n` +
          `🎰 *¿Cómo funciona?*\n` +
          `• Escribe \`!dado\` para lanzar los dados\n` +
          `• Obtendrás un número del 1 al 10\n` +
          `• Espera 60 segundos entre cada lanzamiento\n\n` +
          `🏆 *Puntuaciones:*\n` +
          `• *10* → ¡GANAS! +2 Puntos 🎉\n` +
          `• *1* → ¡PIERDES! -1 Punto 💔\n` +
          `⏱️ *Cooldown:* 60 segundos entre lanzamientos para evitar spam\n\n` +
          `¡Que comience la diversión! 🎊`;
      } else {
        statusMsg = `🎲 *Comando !dado DESACTIVADO* ❌\n\n` +
          `El juego de dados no está disponible en este momento.\n` +
          `Los usuarios no podrán usar \`!dado\` hasta que sea reactivado.`;
      }
      
      await reply(msg, statusMsg);
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !ccdt — Set !dado cooldown seconds (ADMIN)
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'ccdt') {
      if (!isAdmin(number)) { await reply(msg, '🚫 Solo admins.'); return; }
      
      if (!args[0]) {
        await reply(msg, '⚠️ Uso: `!ccdt <segundos>`\nEjemplo: `!ccdt 60` (establece el cooldown a 60 segundos)');
        return;
      }
      
      const seconds = parseInt(args);
      
      if (isNaN(seconds) || seconds <= 0) {
        await reply(msg, '⚠️ Debes especificar un número válido de segundos (mayor a 0).');
        return;
      }
      
      if (!config.dado) { config.dado = { enabled: false }; }
      const oldCooldown = config.dado.cooldown || 10;
      config.dado.cooldown = seconds;
      
      const statusMsg = `⏱️ *Cooldown del !dado actualizado* ✅\n\n` +
        `El tiempo de espera entre lanzamientos cambió de *${oldCooldown}s* a *${seconds}s*.`;
      
      await reply(msg, statusMsg);
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !ccpt — Set !dado winning/losing points (ADMIN)
    // ══════════════════════════════════════════════════════════════════════════
    if (cmd === 'ccpt') {
      if (!isAdmin(number)) { await reply(msg, '🚫 Solo admins.'); return; }
      
      if (!args) {
        await reply(msg, '⚠️ Uso: `!ccpt w <puntos>` o `!ccpt l <puntos>`\n' +
          'Ejemplo: `!ccpt w 5` (ganar 5 puntos en 10) o `!ccpt l 2` (perder 2 puntos en 1)');
        return;
      }
      
      const parts = args.trim().split(/\s+/);
      const type = parts[0]?.toLowerCase();
      const points = parseInt(parts[1]);
      
      if (!['w', 'l'].includes(type)) {
        await reply(msg, '⚠️ Tipo inválido. Usa `w` para ganar o `l` para perder.\n' +
          'Ejemplo: `!ccpt w 5` o `!ccpt l 2`');
        return;
      }
      
      if (isNaN(points) || points <= 0) {
        await reply(msg, '⚠️ Debes especificar un número válido de puntos (mayor a 0).');
        return;
      }
      
      if (!config.dado) { config.dado = { enabled: false }; }
      
      if (type === 'w') {
        const oldWinPoints = config.dado.pointsWin || 2;
        config.dado.pointsWin = points;
        const statusMsg = `🎉 *Puntos de victoria actualizados* ✅\n\n` +
          `Al sacar *10* en el !dado, ahora se ganan *${points} puntos* (antes eran ${oldWinPoints})`;
        await reply(msg, statusMsg);
      } else {
        const oldLosePoints = config.dado.pointsLose || 1;
        config.dado.pointsLose = points;
        const statusMsg = `💔 *Puntos de derrota actualizados* ✅\n\n` +
          `Al sacar *1* en el !dado, ahora se pierden *${points} puntos* (antes eran ${oldLosePoints})`;
        await reply(msg, statusMsg);
      }
      return;
    }

    // ══════════════════════════════════════════════════════════════════════════
    // !blackjack | !bj — Play blackjack with points
    // ══════════════════════════════════════════════════════════════════════════
    
    // Blackjack hit/stand/result — CHECK THIS FIRST
    if ((cmd === 'bj' || cmd === 'blackjack') && (args === 'hit' || args === 'stand' || args === 'h' || args === 's')) {
      const game = blackjackGames[number];
      if (!game) {
        await reply(msg, '❌ No hay una partida activa. Inicia una con `!bj <apuesta>`');
        return;
      }

      const action = args === 'hit' || args === 'h' ? 'hit' : 'stand';

      if (action === 'hit') {
        const result = playerHit(game.game);
        if (!result) {
          await reply(msg, '❌ Ya te plantaste. Espera el resultado.');
          return;
        }

        if (result.bust) {
          // Player busted
          const bank = storage.addToBlackjackBank(game.bet);
          storage.addBonusPoints(number, name, -game.bet, `Perdió blackjack (${game.bet} puntos)`);
          delete blackjackGames[number];

          let resultMsg = `💔 *¡REVENTASTE!* 💔\n\n`;
          resultMsg += `🎴 *Tu mano*: ${formatHand(game.game.playerHand)} = *${result.value}*\n`;
          resultMsg += `⚠️ Superaste 21 - ¡PERDISTE!\n\n`;
          resultMsg += `💰 *Apuesta perdida:* -${game.bet} puntos\n`;
          resultMsg += `🏦 *Banco del grupo:* +${game.bet} = *${bank}* puntos\n\n`;
          resultMsg += `El siguiente jugador podría ganar *${bank}* puntos 🎰`;

          await reply(msg, resultMsg);
          return;
        }

        const value = calculateHandValue(game.game.playerHand);
        let hitMsg = `🎴 *Nueva carta*\n\n`;
        hitMsg += `👤 *Tu mano*: ${formatHand(game.game.playerHand)} = *${value}*\n\n`;
        hitMsg += `Opciones:\n` +
          `• \`${pfx}bj hit\` - Pedir otra carta\n` +
          `• \`${pfx}bj stand\` - Plantarse`;

        await reply(msg, hitMsg);
        return;
      }

      // Player stands
      game.game.playerStand = true;
      dealerPlay(game.game);

      const { result: resultText, winner } = formatGameResult(game.game);
      const playerValue = calculateHandValue(game.game.playerHand);
      const dealerValue = calculateHandValue(game.game.dealerHand);

      let finalMsg = `${resultText}\n\n`;

      if (winner === 'player') {
        // Player wins - double the bet
        const winnings = game.bet * 2;
        const bank = storage.getBlackjackBank();
        let totalWin = winnings;

        if (bank > 0) {
          totalWin = winnings + bank;
          storage.resetBlackjackBank();
          finalMsg += `🏆 *¡GANASTE EL BANCO!*\n`;
          finalMsg += `💰 *Tu premio*: ${winnings} (apuesta) + ${bank} (banco) = *${totalWin}* puntos 💎`;
        } else {
          finalMsg += `🎉 *¡GANASTE!*\n`;
          finalMsg += `💰 *Tu premio*: ${winnings} puntos (apuesta duplicada)`;
        }

        storage.addBonusPoints(number, name, totalWin, `Ganó blackjack (${totalWin} puntos)`);
      } else if (winner === 'dealer') {
        // Player loses - bet goes to bank
        const bank = storage.addToBlackjackBank(game.bet);
        storage.addBonusPoints(number, name, -game.bet, `Perdió blackjack (${game.bet} puntos)`);
        finalMsg += `💔 *¡PERDISTE!*\n`;
        finalMsg += `💰 *Apuesta perdida:* -${game.bet} puntos\n`;
        finalMsg += `🏦 *Banco del grupo:* ${bank} puntos`;
      } else {
        // Push (tie)
        finalMsg += `🤝 *¡EMPATE!*\n`;
        finalMsg += `💰 *Tu apuesta se devuelve:* +${game.bet} puntos`;
        storage.addBonusPoints(number, name, game.bet, `Empate en blackjack`);
      }

      delete blackjackGames[number];
      await reply(msg, finalMsg);
      return;
    }

    // Start new blackjack game
    if (cmd === 'blackjack' || cmd === 'bj') {
      // Only proceed if there's a bet amount (i.e., not hit/stand)
      if (args === 'hit' || args === 'stand' || args === 'h' || args === 's') {
        await reply(msg, '❌ No hay una partida activa. Inicia una con `!bj <apuesta>`');
        return;
      }

      const stats = storage.getStats()[number] || {};
      const userPoints = stats.points || 0;

      // Check if user has enough points
      if (userPoints <= 0) {
        await reply(msg, '❌ Necesitas tener puntos positivos para jugar blackjack.');
        return;
      }

      // Parse bet amount
      const betStr = args.trim();
      if (!betStr) {
        await reply(msg, `♠️ *¡BIENVENIDO AL BLACKJACK!* ♠️\n\n` +
          `Uso: \`${pfx}blackjack <apuesta>\` o \`${pfx}bj <apuesta>\`\n\n` +
          `Ejemplos:\n` +
          `• \`${pfx}bj 5\` → Juega con 5 puntos\n` +
          `• \`${pfx}blackjack 10\` → Juega con 10 puntos\n\n` +
          `📊 *Tu saldo actual:* ${userPoints} puntos\n` +
          `🏦 *Banco del grupo:* ${storage.getBlackjackBank()} puntos\n\n` +
          `*Reglas:*\n` +
          `• Si ganas, duplicas tu apuesta\n` +
          `• Si pierdes, tu apuesta va al banco\n` +
          `• El siguiente jugador intenta ganar todo el banco\n` +
          `• ¡Buena suerte!`);
        return;
      }

      const bet = parseInt(betStr);
      if (isNaN(bet) || bet <= 0) {
        await reply(msg, '⚠️ La apuesta debe ser un número positivo.');
        return;
      }

      if (bet > userPoints) {
        await reply(msg, `⚠️ No tienes suficientes puntos. Tu saldo: ${userPoints}, apuesta: ${bet}`);
        return;
      }

      // Start game
      const gameState = playBlackjack();
      blackjackGames[number] = { game: gameState, bet, userName: name, timestamp: Date.now() };

      const playerValue = calculateHandValue(gameState.playerHand);
      const dealerValue = calculateHandValue([gameState.dealerHand[0]]);

      let gameMsg = `♠️ *BLACKJACK* ♠️\n\n`;
      gameMsg += `👤 *Jugador*: ${formatHand(gameState.playerHand)} = *${playerValue}*\n`;
      gameMsg += `🎴 *Crupier*: ${formatHand(gameState.dealerHand, true)} = *${dealerValue}*\n\n`;
      gameMsg += `💰 *Apuesta:* ${bet} puntos\n`;
      gameMsg += `🏦 *Banco:* ${storage.getBlackjackBank()} puntos\n\n`;

      if (playerValue === 21) {
        gameMsg += `🎉 *¡BLACKJACK NATURAL!*\n\n`;
        gameMsg += `Responde con \`${pfx}bj stand\` para reclamar tu premio 🏆`;
      } else {
        gameMsg += `Opciones:\n` +
          `• \`${pfx}bj hit\` - Pedir carta\n` +
          `• \`${pfx}bj stand\` - Plantarse`;
      }

      await reply(msg, gameMsg);
      return;
    }
    await reply(msg, `❓ Comando desconocido: \`${pfx}${cmd}\`\nEscribe \`!ayuda\` para ver los comandos disponibles.`);

  } catch (err) {
    console.error('[ERROR]', err);
  } finally {
    clearTimeout(handlerTimeout);
    msg = null;
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

// Initialize SQLite database
console.log('[INIT] Initializing SQLite database...');
initializeSchema();
migrateData();

// Initialize storage cache before starting client
storage.initializeCache();

client.initialize();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[SHUTDOWN] Closing database...');
  storage.flush();
  closeDb();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[SHUTDOWN] Flushing data to disk...');
  storage.flush();
  process.exit(0);
});
