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
  resources:        path.join(__dirname, '../data/resources.json'),
  pendingResources: path.join(__dirname, '../data/pending-resources.json'),
  faqs:             path.join(__dirname, '../data/faqs.json'),
  stats:            path.join(__dirname, '../data/stats.json'),
  muted:            path.join(__dirname, '../data/muted.json'),
  questions:        path.join(__dirname, '../data/questions.json'),
  dailyQuestions:   path.join(__dirname, '../data/daily-questions.json'),
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
  catch { return (key === 'stats' || key === 'activity' || key === 'prize') ? {} : []; }
}

function write(key, data) {
  fs.writeFileSync(FILES[key], JSON.stringify(data, null, 2));
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

// ─── Reminders ────────────────────────────────────────────────────────────────

const getReminders     = ()       => read('reminders');
function deleteReminder(id) {
  const list = getReminders();
  const filtered = list.filter(r => r.id !== id);
  write('reminders', filtered);
  return filtered.length < list.length;
}
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
function deletePendingReminder(id) {
  const list = getPendingReminders();
  const filtered = list.filter(p => p.id !== id);
  write('pendingReminders', filtered);
  return filtered.length < list.length;
}
function savePendingReminder(data) {
  const list = getPendingReminders();
  const entry = { id: genId(), ...data, suggestedAt: new Date().toISOString() };
  list.push(entry);
  write('pendingReminders', list);
  return entry;
}



const getHomework    = ()       => read('homework');
function deleteHomework(id) {
  const list = getHomework();
  const filtered = list.filter(h => h.id !== id);
  write('homework', filtered);
  return filtered.length < list.length;
}
function saveHomework(data) {
  const list = getHomework();
  const entry = { id: genId(), ...data, savedAt: new Date().toISOString() };
  list.push(entry);
  write('homework', list);
  return entry;
}

// ─── Pending (propuestas esperando aprobación) ────────────────────────────────

const getPending    = ()    => read('pending');
function deletePending(id) {
  const list = getPending();
  const filtered = list.filter(p => p.id !== id);
  write('pending', filtered);
  return filtered.length < list.length;
}
function savePending(data) {
  const list = getPending();
  const entry = { id: genId(), ...data, proposedAt: new Date().toISOString(), status: 'pending' };
  list.push(entry);
  write('pending', list);
  return entry;
}

// ─── Resources (recursos aprobados) ──────────────────────────────────────────

const getResources    = ()       => read('resources');
function deleteResource(id) {
  const list = getResources();
  const filtered = list.filter(r => r.id !== id);
  write('resources', filtered);
  return filtered.length < list.length;
}
function saveResource(data) {
  const list = getResources();
  const entry = { id: genId(), ...data, savedAt: new Date().toISOString() };
  list.push(entry);
  write('resources', list);
  return entry;
}

// ─── Pending resources (recursos propuestos esperando aprobación) ─────────────

const getPendingResources    = ()    => read('pendingResources');
function deletePendingResource(id) {
  const list = getPendingResources();
  const filtered = list.filter(p => p.id !== id);
  write('pendingResources', filtered);
  return filtered.length < list.length;
}
function savePendingResource(data) {
  const list = getPendingResources();
  const entry = { id: genId(), ...data, proposedAt: new Date().toISOString(), status: 'pending' };
  list.push(entry);
  write('pendingResources', list);
  return entry;
}

// ─── Notes (apuntes aprobados) ────────────────────────────────────────────────

const getNotes    = ()       => read('notes');
function deleteNote(id) {
  const list = getNotes();
  const filtered = list.filter(n => n.id !== id);
  write('notes', filtered);
  return filtered.length < list.length;
}
function saveNote(data) {
  const list = getNotes();
  const entry = { id: genId(), ...data, savedAt: new Date().toISOString() };
  list.push(entry);
  write('notes', list);
  return entry;
}

// ─── Pending notes (apuntes propuestos esperando aprobación) ──────────────────

const getPendingNotes    = ()    => read('pendingNotes');
function deletePendingNote(id) {
  const list = getPendingNotes();
  const filtered = list.filter(p => p.id !== id);
  write('pendingNotes', filtered);
  return filtered.length < list.length;
}
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
function deleteFaq(id) {
  const list = getFaqs();
  const filtered = list.filter(f => f.id !== id);
  write('faqs', filtered);
  return filtered.length < list.length;
}

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
  if (!text.includes('?')) return null;
  const lower = text.toLowerCase();
  return getActiveFaqs().find(f => {
    const matched = (f.keywords || []).filter(k => lower.includes(k.toLowerCase()));
    return matched.length >= 2;
  });
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
      resourcesProposed: 0,
      resourcesApproved: 0,
      questionsAnswered: 0,
      questionsAsked: 0,
      questionPoints: 0,
      remindersApproved: 0,
      totalPoints: 0,
    };
  }
  stats[number].name = name; // actualiza nombre si cambió
  if (!stats[number].remindersApproved) stats[number].remindersApproved = 0;
  if (!stats[number].notesProposed)     stats[number].notesProposed     = 0;
  if (!stats[number].notesApproved)     stats[number].notesApproved     = 0;
  if (!stats[number].resourcesProposed) stats[number].resourcesProposed = 0;
  if (!stats[number].resourcesApproved) stats[number].resourcesApproved = 0;
  if (!stats[number].questionPoints)    stats[number].questionPoints    = 0;
  stats[number][metric] = (stats[number][metric] || 0) + amount;

  // Recalcular puntos totales.
  // Los puntos por preguntas son variables (2 fácil / 3 normal / 4 difícil)
  // y se acumulan en questionPoints en lugar de calcularse desde el conteo.
  const s = stats[number];
  s.totalPoints =
    (s.tasksApproved     * 7) +
    (s.tasksProposed     * 3) +
    (s.notesApproved     * 5) +
    (s.notesProposed     * 2) +
    (s.resourcesApproved * 2) +
    (s.resourcesProposed * 1) +
    (s.questionPoints    || 0) +
    (s.questionsAsked    * 1) +
    (s.remindersApproved * 1) +
    (s.bonusPoints       || 0);

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

/**
 * Adds bonus points manually to a user (e.g. for unscheduled dynamics).
 * @param {string} number  — phone number
 * @param {string} name    — display name
 * @param {number} amount  — points to add (positive integer)
 * @param {string} reason  — optional reason for the log
 */
function addBonusPoints(number, name, amount, reason = '') {
  const stats = getStats();
  if (!stats[number]) {
    stats[number] = {
      name,
      tasksProposed: 0, tasksApproved: 0,
      notesProposed: 0, notesApproved: 0,
      resourcesProposed: 0, resourcesApproved: 0,
      questionsAnswered: 0, questionsAsked: 0,
      questionPoints: 0, remindersApproved: 0,
      bonusPoints: 0, totalPoints: 0,
    };
  }
  stats[number].name = name;
  if (!stats[number].bonusPoints) stats[number].bonusPoints = 0;
  stats[number].bonusPoints += amount;

  const s = stats[number];
  s.totalPoints =
    (s.tasksApproved     * 7) +
    (s.tasksProposed     * 3) +
    (s.notesApproved     * 5) +
    (s.notesProposed     * 2) +
    (s.resourcesApproved * 2) +
    (s.resourcesProposed * 1) +
    (s.questionPoints    || 0) +
    (s.questionsAsked    * 1) +
    (s.remindersApproved * 1) +
    (s.bonusPoints       || 0);

  write('stats', stats);
  return stats[number];
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
  const list = getMuted();
  const filtered = list.filter(m => m.number !== number);
  write('muted', filtered);
  return filtered.length < list.length;
}

function isMuted(number) {
  const now = new Date();
  const list = getMuted();
  const entry = list.find(m => m.number === number);
  if (!entry) return null;
  if (new Date(entry.until) <= now) {
    write('muted', list.filter(m => m.number !== number));
    return null;
  }
  return entry;
}

function cleanExpiredMutes() {
  const now = new Date();
  write('muted', getMuted().filter(m => new Date(m.until) > now));
}

// ─── Daily questions (programmed by the bot) ─────────────────────────────────

/** Returns the pending daily questions pool (array of { question, answer } objects). */
function getDailyQuestions() { return read('dailyQuestions'); }

/** Persists the updated daily questions pool. */
function saveDailyQuestions(list) { write('dailyQuestions', list); }

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

function getNextActivityId() {
  const data = getActivity();
  const ids = Object.values(data).map(u => u.id || 0);
  return ids.length ? Math.max(...ids) + 1 : 1;
}

/** Records the last time a user sent a message in the group. Clears any pending warning.
 *  Assigns a new sequential id to first-time users. */
function updateLastSeen(number, name) {
  const data = getActivity();
  const existing = data[number];
  data[number] = {
    id: (existing && existing.id) ? existing.id : getNextActivityId(),
    name,
    lastSeen: new Date().toISOString(),
    warnedAt: null,
  };
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

/** Looks up a user by their short numeric id in activity.json.
 *  Returns { number, id, name, lastSeen, warnedAt } or null. */
function getUserByActivityId(id) {
  const data = getActivity();
  const entry = Object.entries(data).find(([, u]) => u.id === id);
  if (!entry) return null;
  return { number: entry[0], ...entry[1] };
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
  getHomework, saveHomework, deleteHomework,
  // pending homework
  getPending, savePending, deletePending,
  // notes
  getNotes, saveNote, deleteNote,
  // pending notes
  getPendingNotes, savePendingNote, deletePendingNote,
  // resources
  getResources, saveResource, deleteResource,
  // pending resources
  getPendingResources, savePendingResource, deletePendingResource,
  // faq
  getFaqs, getActiveFaqs, saveFaq, saveFaqForReminder, deleteFaq, deleteFaqsByReminderId, matchFaq,
  // stats
  getStats, incrementStat, getLeaderboard, addBonusPoints,
  // mute
  getMuted, muteUser, unmuteUser, isMuted, cleanExpiredMutes,
  // questions
  getQuestions, saveQuestion, updateQuestion, markAnswered,
  // daily questions
  getDailyQuestions, saveDailyQuestions,
  // activity
  getActivity, updateLastSeen, setWarnedAt, getUserByActivityId,
  // prize
  getPrize, setPrize,
  // logs
  log,
};
