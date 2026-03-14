// handlers/storage.js — SQLite-based persistent storage for StudyBot
// Maintains backward compatible API with old JSON-based system

const { getDb } = require('./db');

// ─── Utility ───────────────────────────────────────────────────────────────────

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

// Stub functions for backward compatibility (no-op in SQLite mode)
function initializeCache() {
  return Promise.resolve();
}
function flush() {
  // SQLite handles persistence automatically
}

// ─── Reminders ─────────────────────────────────────────────────────────────────

const getReminders = () => {
  const db = getDb();
  return db.prepare('SELECT * FROM reminders ORDER BY date ASC').all();
};

function deleteReminder(id) {
  const db = getDb();
  const result = db.prepare('DELETE FROM reminders WHERE id = ?').run(id);
  if (result.changes > 0) {
    deleteFaqsByReminderId(id);
  }
  return result.changes > 0;
}

const getActiveReminders = () => {
  const db = getDb();
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  return db.prepare('SELECT * FROM reminders WHERE date >= ? ORDER BY date ASC').all(todayStr);
};

function saveReminder(data) {
  const db = getDb();
  const id = genId();
  const createdAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO reminders (id, title, date, description, addedBy, approvedBy, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.title, data.date, data.description || null, data.addedBy || null, data.approvedBy || null, createdAt);
  return { id, ...data, createdAt };
}

// ─── Pending Reminders ─────────────────────────────────────────────────────────

const getPendingReminders = () => {
  const db = getDb();
  return db.prepare('SELECT * FROM pending_reminders ORDER BY suggestedAt DESC').all();
};

function deletePendingReminder(id) {
  const db = getDb();
  const result = db.prepare('DELETE FROM pending_reminders WHERE id = ?').run(id);
  return result.changes > 0;
}

function savePendingReminder(data) {
  const db = getDb();
  const id = genId();
  const suggestedAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO pending_reminders (id, title, date, description, proposedBy, suggestedAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, data.title, data.date, data.description || null, data.proposedBy || null, suggestedAt);
  return { id, ...data, suggestedAt };
}

// ─── Tasks/Homework ───────────────────────────────────────────────────────────

const getHomework = () => {
  const db = getDb();
  return db.prepare('SELECT * FROM tasks ORDER BY date ASC').all();
};

function deleteHomework(id) {
  const db = getDb();
  const result = db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  return result.changes > 0;
}

function saveHomework(data) {
  const db = getDb();
  const id = genId();
  const createdAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO tasks (id, title, date, description, addedBy, approvedBy, createdAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.title, data.date, data.description || null, data.addedBy || null, data.approvedBy || null, createdAt);
  return { id, ...data, createdAt };
}

// ─── Pending Tasks ────────────────────────────────────────────────────────────

const getPending = () => {
  const db = getDb();
  return db.prepare('SELECT * FROM pending_tasks ORDER BY proposedAt DESC').all();
};

function deletePending(id) {
  const db = getDb();
  const result = db.prepare('DELETE FROM pending_tasks WHERE id = ?').run(id);
  return result.changes > 0;
}

function savePending(data) {
  const db = getDb();
  const id = genId();
  const proposedAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO pending_tasks (id, title, description, subject, proposedBy, proposedAt, status, link)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.title, data.description || null, data.subject || null, data.proposedBy || null, proposedAt, 'pending', data.link || null);
  return { id, ...data, proposedAt, status: 'pending' };
}

// ─── Resources ────────────────────────────────────────────────────────────────

const getResources = () => {
  const db = getDb();
  return db.prepare('SELECT * FROM resources ORDER BY savedAt DESC').all();
};

function deleteResource(id) {
  const db = getDb();
  const result = db.prepare('DELETE FROM resources WHERE id = ?').run(id);
  return result.changes > 0;
}

function saveResource(data) {
  const db = getDb();
  const id = genId();
  const savedAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO resources (id, type, title, description, link, proposedBy, approvedBy, savedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.type || null, data.title, data.description || null, data.link || null, data.proposedBy || null, data.approvedBy || null, savedAt);
  return { id, ...data, savedAt };
}

// ─── Pending Resources ────────────────────────────────────────────────────────

const getPendingResources = () => {
  const db = getDb();
  return db.prepare('SELECT * FROM pending_resources ORDER BY suggestedAt DESC').all();
};

function deletePendingResource(id) {
  const db = getDb();
  const result = db.prepare('DELETE FROM pending_resources WHERE id = ?').run(id);
  return result.changes > 0;
}

function savePendingResource(data) {
  const db = getDb();
  const id = genId();
  const suggestedAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO pending_resources (id, type, title, description, link, proposedBy, suggestedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.type || null, data.title, data.description || null, data.link || null, data.proposedBy || null, suggestedAt);
  return { id, ...data, suggestedAt };
}

// ─── Notes ────────────────────────────────────────────────────────────────────

const getNotes = () => {
  const db = getDb();
  return db.prepare('SELECT * FROM notes ORDER BY savedAt DESC').all();
};

function deleteNote(id) {
  const db = getDb();
  const result = db.prepare('DELETE FROM notes WHERE id = ?').run(id);
  return result.changes > 0;
}

function saveNote(data) {
  const db = getDb();
  const id = genId();
  const savedAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO notes (id, subject, title, description, link, proposedBy, approvedBy, savedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.subject, data.title, data.description || null, data.link || null, data.proposedBy || null, data.approvedBy || null, savedAt);
  return { id, ...data, savedAt };
}

// ─── Pending Notes ────────────────────────────────────────────────────────────

const getPendingNotes = () => {
  const db = getDb();
  return db.prepare('SELECT * FROM pending_notes ORDER BY suggestedAt DESC').all();
};

function deletePendingNote(id) {
  const db = getDb();
  const result = db.prepare('DELETE FROM pending_notes WHERE id = ?').run(id);
  return result.changes > 0;
}

function savePendingNote(data) {
  const db = getDb();
  const id = genId();
  const suggestedAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO pending_notes (id, subject, title, description, link, proposedBy, suggestedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, data.subject, data.title, data.description || null, data.link || null, data.proposedBy || null, suggestedAt);
  return { id, ...data, suggestedAt };
}

// ─── FAQs ──────────────────────────────────────────────────────────────────────

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

const getFaqs = () => {
  const db = getDb();
  return db.prepare('SELECT * FROM faqs ORDER BY addedAt DESC').all();
};

function deleteFaq(id) {
  const db = getDb();
  const result = db.prepare('DELETE FROM faqs WHERE id = ?').run(id);
  return result.changes > 0;
}

function getActiveFaqs() {
  const db = getDb();
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' });
  return db.prepare(`
    SELECT * FROM faqs 
    WHERE reminderId IS NULL 
       OR (SELECT date FROM reminders WHERE id = reminderId) >= ?
    ORDER BY addedAt DESC
  `).all(todayStr);
}

function saveFaq(data) {
  const db = getDb();
  const id = genId();
  const keywords = extractKeywords(data.keywords, '').join(' ');
  const addedAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO faqs (id, keywords, question, answer, addedAt, reminderId)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, keywords, data.question || null, data.answer || null, addedAt, data.reminderId || null);
  return { id, ...data, addedAt };
}

function saveFaqForReminder(reminder) {
  const db = getDb();
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

  const id = genId();
  const addedAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO faqs (id, keywords, question, answer, addedAt, reminderId)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, keywords.join(' '), question, answer, addedAt, reminder.id);
  return { id, keywords, question, answer, reminderId: reminder.id, addedAt };
}

const deleteFaqsByReminderId = (reminderId) => {
  const db = getDb();
  db.prepare('DELETE FROM faqs WHERE reminderId = ?').run(reminderId);
};

function matchFaq(text) {
  if (!text.includes('?')) return null;
  const db = getDb();
  const faqs = getActiveFaqs();
  const lower = text.toLowerCase();
  
  return faqs.find(f => {
    const keywords = (f.keywords || '').split(' ').filter(k => k.length > 0);
    const matched = keywords.filter(k => lower.includes(k.toLowerCase()));
    return matched.length >= 2;
  });
}

// ─── Stats ────────────────────────────────────────────────────────────────────

function getStats() {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM stats').all();
  const stats = {};
  for (const row of rows) {
    stats[row.userId] = row;
  }
  return stats;
}

function incrementStat(number, name, metric, amount = 1) {
  const db = getDb();
  let stat = db.prepare('SELECT * FROM stats WHERE userId = ?').get(number);
  
  if (!stat) {
    stat = {
      userId: number,
      userName: name,
      points: 0,
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
      bonusPoints: 0,
      createdAt: new Date().toISOString(),
    };
    db.prepare(`
      INSERT INTO stats (userId, userName, points, tasksProposed, tasksApproved, notesProposed, 
                         notesApproved, resourcesProposed, resourcesApproved, questionsAnswered,
                         questionsAsked, questionPoints, remindersApproved, bonusPoints, createdAt, updatedAt)
      VALUES (?, ?, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ?, ?)
    `).run(number, name, stat.createdAt, new Date().toISOString());
  }

  stat.userName = name;
  stat[metric] = (stat[metric] || 0) + amount;
  
  const s = stat;
  const totalPoints =
    (s.tasksApproved * 7) +
    (s.tasksProposed * 3) +
    (s.notesApproved * 5) +
    (s.notesProposed * 2) +
    (s.resourcesApproved * 2) +
    (s.resourcesProposed * 1) +
    (s.questionPoints || 0) +
    (s.questionsAsked * 1) +
    (s.remindersApproved * 1) +
    (s.bonusPoints || 0);

  db.prepare(`
    UPDATE stats SET userName = ?, tasksProposed = ?, tasksApproved = ?, notesProposed = ?,
                     notesApproved = ?, resourcesProposed = ?, resourcesApproved = ?,
                     questionsAnswered = ?, questionsAsked = ?, questionPoints = ?,
                     remindersApproved = ?, bonusPoints = ?, points = ?, updatedAt = ?
    WHERE userId = ?
  `).run(name, s.tasksProposed, s.tasksApproved, s.notesProposed, s.notesApproved,
         s.resourcesProposed, s.resourcesApproved, s.questionsAnswered, s.questionsAsked,
         s.questionPoints, s.remindersApproved, s.bonusPoints, totalPoints, new Date().toISOString(), number);

  return { userId: number, userName: name, ...stat, points: totalPoints };
}

function getLeaderboard(limit = 5) {
  const db = getDb();
  return db.prepare('SELECT userId as number, * FROM stats ORDER BY points DESC LIMIT ?').all(limit);
}

function transferPoints(fromNumber, fromName, toNumber, toName, amount) {
  const db = getDb();
  const donor = db.prepare('SELECT * FROM stats WHERE userId = ?').get(fromNumber);
  
  if (!donor || (donor.points || 0) < amount) return null;

  donor.bonusPoints = (donor.bonusPoints || 0) - amount;
  donor.userName = fromName;
  const donorTotalPoints =
    (donor.tasksApproved * 7) +
    (donor.tasksProposed * 3) +
    (donor.notesApproved * 5) +
    (donor.notesProposed * 2) +
    (donor.resourcesApproved * 2) +
    (donor.resourcesProposed * 1) +
    (donor.questionPoints || 0) +
    (donor.questionsAsked * 1) +
    (donor.remindersApproved * 1) +
    (donor.bonusPoints);

  db.prepare(`
    UPDATE stats SET userName = ?, bonusPoints = ?, points = ?, updatedAt = ? WHERE userId = ?
  `).run(fromName, donor.bonusPoints, donorTotalPoints, new Date().toISOString(), fromNumber);

  let recipient = db.prepare('SELECT * FROM stats WHERE userId = ?').get(toNumber);
  if (!recipient) {
    db.prepare(`
      INSERT INTO stats (userId, userName, bonusPoints, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?)
    `).run(toNumber, toName, amount, new Date().toISOString(), new Date().toISOString());
    recipient = { userId: toNumber, userName: toName, bonusPoints: amount, points: amount };
  } else {
    recipient.bonusPoints = (recipient.bonusPoints || 0) + amount;
    recipient.userName = toName;
    const recipientTotalPoints =
      (recipient.tasksApproved * 7) +
      (recipient.tasksProposed * 3) +
      (recipient.notesApproved * 5) +
      (recipient.notesProposed * 2) +
      (recipient.resourcesApproved * 2) +
      (recipient.resourcesProposed * 1) +
      (recipient.questionPoints || 0) +
      (recipient.questionsAsked * 1) +
      (recipient.remindersApproved * 1) +
      (recipient.bonusPoints);

    db.prepare(`
      UPDATE stats SET userName = ?, bonusPoints = ?, points = ?, updatedAt = ? WHERE userId = ?
    `).run(toName, recipient.bonusPoints, recipientTotalPoints, new Date().toISOString(), toNumber);
    recipient.points = recipientTotalPoints;
  }

  return { donor: { userId: fromNumber, ...donor, points: donorTotalPoints }, recipient };
}

function attackUser(attackerNumber, attackerName, targetNumber, targetName, pointsSpent) {
  const db = getDb();
  const attacker = db.prepare('SELECT * FROM stats WHERE userId = ?').get(attackerNumber);
  
  if (!attacker || (attacker.points || 0) < pointsSpent) return null;

  const damage = Math.floor(pointsSpent / 3);
  
  // Attacker spends points from bonusPoints
  attacker.bonusPoints = (attacker.bonusPoints || 0) - pointsSpent;
  attacker.userName = attackerName;
  const attackerTotalPoints =
    (attacker.tasksApproved * 7) +
    (attacker.tasksProposed * 3) +
    (attacker.notesApproved * 5) +
    (attacker.notesProposed * 2) +
    (attacker.resourcesApproved * 2) +
    (attacker.resourcesProposed * 1) +
    (attacker.questionPoints || 0) +
    (attacker.questionsAsked * 1) +
    (attacker.remindersApproved * 1) +
    (attacker.bonusPoints);

  db.prepare(`
    UPDATE stats SET userName = ?, bonusPoints = ?, points = ?, updatedAt = ? WHERE userId = ?
  `).run(attackerName, attacker.bonusPoints, attackerTotalPoints, new Date().toISOString(), attackerNumber);

  let target = db.prepare('SELECT * FROM stats WHERE userId = ?').get(targetNumber);

  if (!target) {
    // Target doesn't exist yet - create with only bonus damage
    target = { userId: targetNumber, userName: targetName, bonusPoints: -damage, points: -damage };
    db.prepare(`
      INSERT INTO stats (userId, userName, bonusPoints, points, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(targetNumber, targetName, -damage, -damage, new Date().toISOString(), new Date().toISOString());
  } else {
    // Only subtract from bonusPoints; earned points are protected
    target.bonusPoints = (target.bonusPoints || 0) - damage;
    target.userName = targetName;
    const targetTotalPoints =
      (target.tasksApproved * 7) +
      (target.tasksProposed * 3) +
      (target.notesApproved * 5) +
      (target.notesProposed * 2) +
      (target.resourcesApproved * 2) +
      (target.resourcesProposed * 1) +
      (target.questionPoints || 0) +
      (target.questionsAsked * 1) +
      (target.remindersApproved * 1) +
      (target.bonusPoints);

    db.prepare(`
      UPDATE stats SET userName = ?, bonusPoints = ?, points = ?, updatedAt = ? WHERE userId = ?
    `).run(targetName, target.bonusPoints, targetTotalPoints, new Date().toISOString(), targetNumber);
    target.points = targetTotalPoints;
  }

  return {
    attacker: { userId: attackerNumber, ...attacker, points: attackerTotalPoints },
    target,
    damage,
  };
}

function addBonusPoints(number, name, amount, reason = '') {
  return incrementStat(number, name, 'bonusPoints', amount);
}

// ─── Muted Users ──────────────────────────────────────────────────────────────

function getMuted() {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM muted_users').all();
  const muted = {};
  for (const row of rows) {
    muted[row.userId] = row;
  }
  return muted;
}

function muteUser(number, name, minutes, reason, mutedBy) {
  const db = getDb();
  const mutedAt = new Date().toISOString();
  const unmutedAt = new Date(Date.now() + minutes * 60000).toISOString();
  db.prepare(`
    INSERT OR REPLACE INTO muted_users (userId, mutedAt, unmutedAt, reason)
    VALUES (?, ?, ?, ?)
  `).run(number, mutedAt, unmutedAt, reason);
}

function unmuteUser(number) {
  const db = getDb();
  db.prepare('DELETE FROM muted_users WHERE userId = ?').run(number);
}

function isMuted(number) {
  const db = getDb();
  const muted = db.prepare('SELECT * FROM muted_users WHERE userId = ?').get(number);
  if (!muted) return false;
  
  const now = new Date().getTime();
  const unmutedTime = new Date(muted.unmutedAt).getTime();
  return now < unmutedTime;
}

function cleanExpiredMutes() {
  const db = getDb();
  db.prepare('DELETE FROM muted_users WHERE datetime(unmutedAt) <= datetime("now")').run();
}

// ─── Questions ────────────────────────────────────────────────────────────────

function getQuestions() {
  const db = getDb();
  return db.prepare('SELECT * FROM questions').all();
}

function saveQuestion(data) {
  const db = getDb();
  const id = genId();
  const addedAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO questions (id, question, answer, difficulty, addedAt)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, data.question, data.answer, data.difficulty, addedAt);
  return { id, ...data, addedAt };
}

function updateQuestion(id, fields) {
  const db = getDb();
  const updates = Object.entries(fields).map(([key]) => `${key} = ?`).join(', ');
  const values = Object.values(fields);
  db.prepare(`UPDATE questions SET ${updates} WHERE id = ?`).run(...values, id);
}

function markAnswered(id) {
  const db = getDb();
  db.prepare('UPDATE daily_questions SET askedAt = ? WHERE question_id = ?').run(new Date().toISOString(), id);
}

// ─── Daily Questions ──────────────────────────────────────────────────────────

function getDailyQuestions() {
  const db = getDb();
  return db.prepare('SELECT * FROM daily_questions').all();
}

function saveDailyQuestions(list) {
  const db = getDb();
  db.prepare('DELETE FROM daily_questions').run();
  const stmt = db.prepare(`
    INSERT INTO daily_questions (id, date, question_id, askedAt)
    VALUES (?, ?, ?, ?)
  `);
  for (const item of list) {
    stmt.run(item.id || genId(), item.date, item.question_id || null, item.askedAt || null);
  }
}

// ─── Activity ──────────────────────────────────────────────────────────────────

function getActivity() {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM users').all();
  const activity = {};
  for (const row of rows) {
    activity[row.phone] = {
      id: row.id,
      name: row.name,
      lastSeen: row.lastSeen,
      warnedAt: row.warnedAt,
    };
  }
  return activity;
}

function getNextActivityId() {
  const db = getDb();
  const result = db.prepare('SELECT MAX(id) as maxId FROM users').get();
  return (result?.maxId || 0) + 1;
}

function updateLastSeen(number, name) {
  const db = getDb();
  const lastSeen = new Date().toISOString();
  const id = getNextActivityId();
  db.prepare(`
    INSERT OR REPLACE INTO users (phone, id, name, lastSeen)
    VALUES (?, ?, ?, ?)
  `).run(number, id, name, lastSeen);
  
  db.prepare(`
    INSERT OR REPLACE INTO activity_log (userId, lastSeen)
    VALUES (?, ?)
  `).run(String(id), lastSeen);
}

function setWarnedAt(number) {
  const db = getDb();
  const warnedAt = new Date().toISOString();
  db.prepare(`
    UPDATE users SET warnedAt = ? WHERE phone = ?
  `).run(warnedAt, number);
  
  const user = db.prepare('SELECT id FROM users WHERE phone = ?').get(number);
  if (user) {
    db.prepare(`
      UPDATE activity_log SET warnedAt = ? WHERE userId = ?
    `).run(warnedAt, String(user.id));
  }
}

function getUserByActivityId(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

// ─── Prize ────────────────────────────────────────────────────────────────────

function getPrize() {
  const db = getDb();
  const row = db.prepare('SELECT * FROM prize WHERE id = ?').get('current');
  return row ? { prize: row.prize, points: row.points, sponsor: row.sponsor } : {};
}

function setPrize(prize, points, sponsor) {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO prize (id, prize, points, sponsor)
    VALUES (?, ?, ?, ?)
  `).run('current', prize, points, sponsor);
}

// ─── Logs ──────────────────────────────────────────────────────────────────────

function log(type, data) {
  const db = getDb();
  const message = JSON.stringify({ type, data });
  const timestamp = new Date().toISOString();
  db.prepare('INSERT INTO logs (message, timestamp) VALUES (?, ?)').run(message, timestamp);
}

// ─── Schedule Overrides ────────────────────────────────────────────────────────

function getScheduleOverrides() {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM schedule_overrides').all();
  const overrides = {};
  for (const row of rows) {
    try {
      overrides[row.date] = JSON.parse(row.override_data);
    } catch (e) {
      overrides[row.date] = [];
    }
  }
  return overrides;
}

function getOverrideForDate(date) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM schedule_overrides WHERE date = ?').get(date);
  try {
    return row ? JSON.parse(row.override_data) : null;
  } catch (e) {
    return null;
  }
}

function saveScheduleOverride(date, classes) {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO schedule_overrides (date, override_data)
    VALUES (?, ?)
  `).run(date, JSON.stringify(classes));
}

function deleteScheduleOverride(date) {
  const db = getDb();
  db.prepare('DELETE FROM schedule_overrides WHERE date = ?').run(date);
}

// ─── Dado (Dice Rolls) ─────────────────────────────────────────────────────────

function getDado() {
  const db = getDb();
  const row = db.prepare('SELECT * FROM dado WHERE id = ?').get('current');
  try {
    return row ? JSON.parse(row.data) : {};
  } catch (e) {
    return {};
  }
}

function saveDadoRoll(userId, number) {
  const db = getDb();
  let dado = getDado();
  if (!dado[userId]) {
    dado[userId] = [];
  }
  dado[userId].push({
    number,
    timestamp: new Date().toISOString(),
  });
  db.prepare(`
    INSERT OR REPLACE INTO dado (id, data)
    VALUES (?, ?)
  `).run('current', JSON.stringify(dado));
}

function checkDadoCooldown(userId, cooldownSeconds = 30) {
  const dado = getDado();
  if (!dado[userId] || dado[userId].length === 0) return true;
  
  const lastRoll = dado[userId][dado[userId].length - 1];
  const lastTime = new Date(lastRoll.timestamp).getTime();
  const now = Date.now();
  const elapsedSeconds = Math.floor((now - lastTime) / 1000);
  
  return elapsedSeconds >= cooldownSeconds;
}

function getDadoCooldownRemaining(userId, cooldownSeconds = 30) {
  const dado = getDado();
  if (!dado[userId] || dado[userId].length === 0) return 0;
  
  const lastRoll = dado[userId][dado[userId].length - 1];
  const lastTime = new Date(lastRoll.timestamp).getTime();
  const now = Date.now();
  const elapsedSeconds = Math.floor((now - lastTime) / 1000);
  
  return Math.max(0, cooldownSeconds - elapsedSeconds);
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  initializeCache, flush,
  getReminders, saveReminder, deleteReminder, getActiveReminders,
  getPendingReminders, savePendingReminder, deletePendingReminder,
  getHomework, saveHomework, deleteHomework,
  getPending, savePending, deletePending,
  getNotes, saveNote, deleteNote,
  getPendingNotes, savePendingNote, deletePendingNote,
  getResources, saveResource, deleteResource,
  getPendingResources, savePendingResource, deletePendingResource,
  getFaqs, getActiveFaqs, saveFaq, saveFaqForReminder, deleteFaq, deleteFaqsByReminderId, matchFaq,
  getStats, incrementStat, getLeaderboard, addBonusPoints, transferPoints, attackUser,
  getMuted, muteUser, unmuteUser, isMuted, cleanExpiredMutes,
  getQuestions, saveQuestion, updateQuestion, markAnswered,
  getDailyQuestions, saveDailyQuestions,
  getActivity, updateLastSeen, setWarnedAt, getUserByActivityId,
  getPrize, setPrize,
  log,
  getScheduleOverrides, getOverrideForDate, saveScheduleOverride, deleteScheduleOverride,
  getDado, saveDadoRoll, checkDadoCooldown, getDadoCooldownRemaining,
};
