// handlers/storage.js — capa de persistencia unificada en JSON

const fs   = require('fs');
const path = require('path');

const FILES = {
  reminders:        path.join(__dirname, '../data/reminders.json'),
  pendingReminders: path.join(__dirname, '../data/pending-reminders.json'),
  homework:         path.join(__dirname, '../data/homework.json'),
  pending:          path.join(__dirname, '../data/pending.json'),
  notes:            path.join(__dirname, '../data/notes.json'),
  pendingNotes:     path.join(__dirname, '../data/pending-notes.json'),
  faqs:             path.join(__dirname, '../data/faqs.json'),
  stats:            path.join(__dirname, '../data/stats.json'),
  muted:            path.join(__dirname, '../data/muted.json'),
  questions:        path.join(__dirname, '../data/questions.json'),
  logs:             path.join(__dirname, '../data/logs.json'),
  activity:         path.join(__dirname, '../data/activity.json'),
  prize:            path.join(__dirname, '../data/prize.json'),
};

// ─── Core helpers ─────────────────────────────────────────────────────────────

function read(key) {
  const file = FILES[key];
  if (!fs.existsSync(file)) {
    const def = (key === 'stats' || key === 'activity' || key === 'prize') ? {} : [];
    fs.writeFileSync(file, JSON.stringify(def, null, 2));
    return def;
  }
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); }
  catch { return (key === 'stats' || key === 'prize') ? {} : []; }
}

function write(key, data) {
  fs.writeFileSync(FILES[key], JSON.stringify(data, null, 2));
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

// ─── Reminders ────────────────────────────────────────────────────────────────

const getReminders     = ()       => read('reminders');
const deleteReminder   = (id)     => write('reminders', getReminders().filter(r => r.id !== id));
const getActiveReminders = ()     => {
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  return getReminders().filter(r => r.date >= todayStr);
};
function saveReminder(data) {
  const list = getReminders();
  const entry = { id: genId(), ...data, createdAt: new Date().toISOString() };
  list.push(entry);
  write('reminders', list);
  return entry;
}

// ─── Pending reminders (sugerencias esperando aprobación) ─────────────────────

const getPendingReminders    = ()    => read('pendingReminders');
const deletePendingReminder  = (id)  => write('pendingReminders', getPendingReminders().filter(p => p.id !== id));
function savePendingReminder(data) {
  const list = getPendingReminders();
  const entry = { id: genId(), ...data, suggestedAt: new Date().toISOString() };
  list.push(entry);
  write('pendingReminders', list);
  return entry;
}



const getHomework    = ()       => read('homework');
const deleteHomework = (id)     => write('homework', getHomework().filter(h => h.id !== id));
const searchHomework = (query)  => {
  const q = query.toLowerCase();
  return getHomework().filter(h =>
    h.subject.toLowerCase().includes(q) ||
    h.title.toLowerCase().includes(q) ||
    (h.description||'').toLowerCase().includes(q)
  );
};
function saveHomework(data) {
  const list = getHomework();
  const entry = { id: genId(), ...data, savedAt: new Date().toISOString() };
  list.push(entry);
  write('homework', list);
  return entry;
}

// ─── Pending (propuestas esperando aprobación) ────────────────────────────────

const getPending    = ()    => read('pending');
const deletePending = (id)  => write('pending', getPending().filter(p => p.id !== id));
function savePending(data) {
  const list = getPending();
  const entry = { id: genId(), ...data, proposedAt: new Date().toISOString(), status: 'pending' };
  list.push(entry);
  write('pending', list);
  return entry;
}

// ─── Notes (apuntes aprobados) ────────────────────────────────────────────────

const getNotes    = ()       => read('notes');
const deleteNote  = (id)     => write('notes', getNotes().filter(n => n.id !== id));
const searchNotes = (query)  => {
  const q = query.toLowerCase();
  return getNotes().filter(n =>
    n.subject.toLowerCase().includes(q) ||
    n.title.toLowerCase().includes(q) ||
    (n.description || '').toLowerCase().includes(q)
  );
};
function saveNote(data) {
  const list = getNotes();
  const entry = { id: genId(), ...data, savedAt: new Date().toISOString() };
  list.push(entry);
  write('notes', list);
  return entry;
}

// ─── Pending notes (apuntes propuestos esperando aprobación) ──────────────────

const getPendingNotes    = ()    => read('pendingNotes');
const deletePendingNote  = (id)  => write('pendingNotes', getPendingNotes().filter(p => p.id !== id));
function savePendingNote(data) {
  const list = getPendingNotes();
  const entry = { id: genId(), ...data, proposedAt: new Date().toISOString(), status: 'pending' };
  list.push(entry);
  write('pendingNotes', list);
  return entry;
}

// ─── FAQs ─────────────────────────────────────────────────────────────────────

const STOP_WORDS = new Set([
  'el','la','los','las','un','una','unos','unas','de','del','en','a','al',
  'por','para','con','sin','sobre','y','o','que','se','es','son','hay',
  'no','si','su','sus','este','esta','estos','estas','ese','esa','esos','esas',
  'mi','tu','le','les','me','te','lo','fue','ser','estar','tiene','tengo',
  'han','has','he','ver','ir','da','dar','hace','hacer','del','las','los',
]);

function extractKeywords(title, description) {
  const text = `${title || ''} ${description || ''}`.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ');
  const words = text.split(/\s+/).filter(w => w.length >= 3 && !STOP_WORDS.has(w));
  return [...new Set(words)].slice(0, 8);
}

const getFaqs    = ()    => read('faqs');
const deleteFaq  = (id)  => write('faqs', getFaqs().filter(f => f.id !== id));

/** Returns only FAQs that are currently relevant:
 *  - Admin-added FAQs (no reminderId) are always included.
 *  - Reminder-generated FAQs are included only while expiresAt >= today. */
function getActiveFaqs() {
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  return getFaqs().filter(f => {
    if (f.reminderId) return f.expiresAt >= todayStr;
    return true;
  });
}

function saveFaq(data) {
  const list = getFaqs();
  const entry = { id: genId(), ...data, createdAt: new Date().toISOString() };
  list.push(entry);
  write('faqs', list);
  return entry;
}

/** Auto-generates and saves a FAQ entry linked to a reminder. */
function saveFaqForReminder(reminder) {
  let keywords = extractKeywords(reminder.title, reminder.description);
  if (keywords.length < 2) {
    const fallback = reminder.title.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/).filter(w => w.length >= 2);
    keywords = [...new Set([...keywords, ...fallback])];
  }
  keywords = keywords.slice(0, 8);

  const [y, m, d] = reminder.date.split('-');
  const formattedDate = `${d}/${m}/${y}`;
  const question = `¿Cuándo es la entrega de "${reminder.title}"?`;
  const answer = `La fecha límite es el *${formattedDate}*.${reminder.description ? `\n\n📝 ${reminder.description}` : ''}`;

  const list = getFaqs();
  const entry = {
    id: genId(),
    keywords,
    question,
    answer,
    reminderId: reminder.id,
    expiresAt: reminder.date,
    addedBy: 'system',
    createdAt: new Date().toISOString(),
  };
  list.push(entry);
  write('faqs', list);
  return entry;
}

/** Removes all FAQ entries associated with a reminder. */
const deleteFaqsByReminderId = (reminderId) =>
  write('faqs', getFaqs().filter(f => f.reminderId !== reminderId));

function matchFaq(text) {
  const lower = text.toLowerCase();
  return getActiveFaqs().find(f =>
    (f.keywords || []).some(k => lower.includes(k.toLowerCase()))
  );
}

// ─── Stats ────────────────────────────────────────────────────────────────────

function getStats() { return read('stats'); }

/**
 * Incrementa una métrica para un usuario.
 * @param {string} number  — número de teléfono
 * @param {string} name    — nombre para mostrar
 * @param {string} metric  — 'tasksProposed' | 'tasksApproved' | 'questionsAnswered' | 'questionsAsked'
 * @param {number} amount
 */
function incrementStat(number, name, metric, amount = 1) {
  const stats = getStats();
  if (!stats[number]) {
    stats[number] = {
      name,
      tasksProposed: 0,
      tasksApproved: 0,
      notesProposed: 0,
      notesApproved: 0,
      questionsAnswered: 0,
      questionsAsked: 0,
      remindersApproved: 0,
      totalPoints: 0,
    };
  }
  stats[number].name = name; // actualiza nombre si cambió
  if (!stats[number].remindersApproved) stats[number].remindersApproved = 0;
  if (!stats[number].notesProposed) stats[number].notesProposed = 0;
  if (!stats[number].notesApproved) stats[number].notesApproved = 0;
  stats[number][metric] = (stats[number][metric] || 0) + amount;

  // Recalcular puntos:
  // Tarea/apunte aprobado = 7 pts (+3 de propuesta = 10 total), Propuesta = 3 pts,
  // Respuesta = 3 pts, Pregunta = 1 pt, Recordatorio aprobado = 1 pt
  const s = stats[number];
  s.totalPoints =
    (s.tasksApproved     * 7) +
    (s.tasksProposed     * 3) +
    (s.notesApproved     * 5) +
    (s.notesProposed     * 2) +
    (s.questionsAnswered * 2) +
    (s.questionsAsked    * 1) +
    (s.remindersApproved * 1);

  write('stats', stats);
  return stats[number];
}

function getLeaderboard(limit = 5) {
  const stats = getStats();
  return Object.entries(stats)
    .map(([number, data]) => ({ number, ...data }))
    .sort((a, b) => b.totalPoints - a.totalPoints)
    .slice(0, limit);
}

// ─── Mute ─────────────────────────────────────────────────────────────────────

function getMuted() { return read('muted'); }

function muteUser(number, name, minutes, reason, mutedBy) {
  const list = getMuted().filter(m => m.number !== number); // evita duplicados
  const until = new Date(Date.now() + minutes * 60 * 1000).toISOString();
  const entry = { number, name, until, reason, mutedBy, mutedAt: new Date().toISOString() };
  list.push(entry);
  write('muted', list);
  return entry;
}

function unmuteUser(number) {
  const before = getMuted().length;
  write('muted', getMuted().filter(m => m.number !== number));
  return before > getMuted().length + before - getMuted().length; // siempre true si había
}

function isMuted(number) {
  const now = new Date();
  const entry = getMuted().find(m => m.number === number);
  if (!entry) return null;
  if (new Date(entry.until) <= now) {
    // Expiró: limpiar automáticamente
    write('muted', getMuted().filter(m => m.number !== number));
    return null;
  }
  return entry;
}

function cleanExpiredMutes() {
  const now = new Date();
  write('muted', getMuted().filter(m => new Date(m.until) > now));
}

// ─── Anonymous questions ──────────────────────────────────────────────────────

function getQuestions() { return read('questions'); }

function saveQuestion(data) {
  const list = getQuestions();
  const entry = {
    id: genId(),
    ...data,
    askedAt: new Date().toISOString(),
    groupMsgId: null,       // se rellena después de publicar en el grupo
    acceptedAnswer: null,   // { by, byName, text, at }
    extraAnswers: [],       // respuestas válidas adicionales (sin puntos)
  };
  list.push(entry);
  write('questions', list);
  return entry;
}

/** Actualiza campos específicos de una pregunta por id */
function updateQuestion(id, fields) {
  const list = getQuestions().map(q => q.id === id ? { ...q, ...fields } : q);
  write('questions', list);
}

function markAnswered(id) {
  updateQuestion(id, { answered: true });
}

// ─── Activity tracking ────────────────────────────────────────────────────────

function getActivity() { return read('activity'); }

/** Records the last time a user sent a message in the group. Clears any pending warning. */
function updateLastSeen(number, name) {
  const data = getActivity();
  data[number] = { name, lastSeen: new Date().toISOString(), warnedAt: null };
  write('activity', data);
}

/** Marks the moment a warning was sent to the user. */
function setWarnedAt(number) {
  const data = getActivity();
  if (data[number]) {
    data[number].warnedAt = new Date().toISOString();
    write('activity', data);
  }
}

// ─── Prize ────────────────────────────────────────────────────────────────────

/** Returns the current prize config, or null if not set. */
function getPrize() {
  const data = read('prize');
  return data && data.prize ? data : null;
}

/**
 * Saves prize configuration.
 * @param {string} prize       — prize description
 * @param {number} points      — points needed to win
 * @param {string} sponsor     — who is sponsoring the prize
 */
function setPrize(prize, points, sponsor) {
  write('prize', { prize, points, sponsor, updatedAt: new Date().toISOString() });
}

// ─── Logs ─────────────────────────────────────────────────────────────────────

function log(type, data) {
  const list = read('logs');
  list.push({ type, ...data, ts: new Date().toISOString() });
  if (list.length > 1000) list.splice(0, list.length - 1000);
  write('logs', list);
}

module.exports = {
  // reminders
  getReminders, saveReminder, deleteReminder, getActiveReminders,
  // pending reminders
  getPendingReminders, savePendingReminder, deletePendingReminder,
  // homework
  getHomework, saveHomework, deleteHomework, searchHomework,
  // pending homework
  getPending, savePending, deletePending,
  // notes
  getNotes, saveNote, deleteNote, searchNotes,
  // pending notes
  getPendingNotes, savePendingNote, deletePendingNote,
  // faq
  getFaqs, getActiveFaqs, saveFaq, saveFaqForReminder, deleteFaq, deleteFaqsByReminderId, matchFaq,
  // stats
  getStats, incrementStat, getLeaderboard,
  // mute
  getMuted, muteUser, unmuteUser, isMuted, cleanExpiredMutes,
  // questions
  getQuestions, saveQuestion, updateQuestion, markAnswered,
  // activity
  getActivity, updateLastSeen, setWarnedAt,
  // prize
  getPrize, setPrize,
  // logs
  log,
};
