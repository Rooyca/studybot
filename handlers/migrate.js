// handlers/migrate.js — Migrate JSON data to SQLite

const fs = require('fs');
const path = require('path');
const { getDb, initializeSchema } = require('./db');

const DATA_DIR = path.join(__dirname, '../data');

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

function readJsonFile(filename) {
  const filepath = path.join(DATA_DIR, filename);
  try {
    if (fs.existsSync(filepath)) {
      return JSON.parse(fs.readFileSync(filepath, 'utf-8'));
    }
  } catch (err) {
    console.warn(`[MIGRATE] Error reading ${filename}:`, err.message);
  }
  return [];
}

function migrateData() {
  const db = getDb();
  initializeSchema();

  // Check if migration already done
  const migrationCheck = db.prepare("SELECT COUNT(*) as count FROM reminders").get();
  if (migrationCheck.count > 0) {
    console.log('✅ Database already populated, skipping migration');
    return;
  }

  console.log('📊 Starting migration from JSON to SQLite...\n');

  // Migrate activity.json → activity_log & users
  console.log('→ Migrating activity.json');
  const activity = readJsonFile('activity.json');
  if (activity && typeof activity === 'object') {
    Object.entries(activity).forEach(([phone, data]) => {
      const userId = data.id ? String(data.id) : phone;
      const stmtUser = db.prepare(`
        INSERT OR IGNORE INTO users (phone, id, name, lastSeen, warnedAt)
        VALUES (?, ?, ?, ?, ?)
      `);
      stmtUser.run(phone, data.id || null, data.name || '', data.lastSeen || null, data.warnedAt || null);

      const stmtActivity = db.prepare(`
        INSERT OR REPLACE INTO activity_log (userId, lastSeen, warnedAt)
        VALUES (?, ?, ?)
      `);
      stmtActivity.run(userId, data.lastSeen || null, data.warnedAt || null);
    });
  }

  // Migrate reminders.json
  console.log('→ Migrating reminders.json');
  const reminders = readJsonFile('reminders.json');
  if (Array.isArray(reminders)) {
    const stmt = db.prepare(`
      INSERT INTO reminders (id, title, date, description, addedBy, approvedBy, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertMany = db.transaction((items) => {
      for (const r of items) {
        stmt.run(r.id, r.title, r.date, r.description || null, r.addedBy || null, r.approvedBy || null, r.createdAt);
      }
    });
    insertMany(reminders);
  }

  // Migrate pending-reminders.json
  console.log('→ Migrating pending-reminders.json');
  const pendingReminders = readJsonFile('pending-reminders.json');
  if (Array.isArray(pendingReminders)) {
    const stmt = db.prepare(`
      INSERT INTO pending_reminders (id, title, date, description, proposedBy, suggestedAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insertMany = db.transaction((items) => {
      for (const r of items) {
        stmt.run(r.id, r.title, r.date, r.description || null, r.proposedBy || null, r.suggestedAt);
      }
    });
    insertMany(pendingReminders);
  }

  // Migrate homework.json → could be tasks or notes (check structure)
  console.log('→ Migrating homework.json');
  const homework = readJsonFile('homework.json');
  if (Array.isArray(homework)) {
    // Check if items have 'date' field (tasks) or 'savedAt' (notes)
    const taskStmt = db.prepare(`
      INSERT INTO tasks (id, title, date, description, addedBy, approvedBy, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const noteStmt = db.prepare(`
      INSERT INTO notes (id, subject, title, description, link, proposedBy, approvedBy, savedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertMany = db.transaction((items) => {
      for (const h of items) {
        if (h.date) {
          // It's a task
          taskStmt.run(h.id, h.title, h.date, h.description || null, h.addedBy || null, h.approvedBy || null, h.createdAt);
        } else if (h.savedAt) {
          // It's actually a note
          noteStmt.run(h.id, h.subject || null, h.title, h.description || null, h.link || null, h.proposedBy || null, h.approvedBy || null, h.savedAt);
        }
      }
    });
    insertMany(homework);
  }

  // Migrate pending.json → pending_tasks
  console.log('→ Migrating pending.json');
  const pending = readJsonFile('pending.json');
  if (Array.isArray(pending)) {
    const stmt = db.prepare(`
      INSERT INTO pending_tasks (id, title, description, subject, proposedBy, proposedAt, status, link)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertMany = db.transaction((items) => {
      for (const p of items) {
        stmt.run(p.id, p.title, p.description || null, p.subject || null, p.proposedBy || null, p.proposedAt, p.status || 'pending', p.link || null);
      }
    });
    insertMany(pending);
  }

  // Migrate notes.json
  console.log('→ Migrating notes.json');
  const notes = readJsonFile('notes.json');
  if (Array.isArray(notes)) {
    const stmt = db.prepare(`
      INSERT INTO notes (id, subject, title, description, link, proposedBy, approvedBy, savedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertMany = db.transaction((items) => {
      for (const n of items) {
        stmt.run(n.id, n.subject, n.title, n.description || null, n.link || null, n.proposedBy || null, n.approvedBy || null, n.savedAt);
      }
    });
    insertMany(notes);
  }

  // Migrate pending-notes.json
  console.log('→ Migrating pending-notes.json');
  const pendingNotes = readJsonFile('pending-notes.json');
  if (Array.isArray(pendingNotes)) {
    const stmt = db.prepare(`
      INSERT INTO pending_notes (id, subject, title, description, link, proposedBy, suggestedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertMany = db.transaction((items) => {
      for (const n of items) {
        stmt.run(n.id, n.subject, n.title, n.description || null, n.link || null, n.proposedBy || null, n.suggestedAt);
      }
    });
    insertMany(pendingNotes);
  }

  // Migrate resources.json
  console.log('→ Migrating resources.json');
  const resources = readJsonFile('resources.json');
  if (Array.isArray(resources)) {
    const stmt = db.prepare(`
      INSERT INTO resources (id, type, title, description, link, proposedBy, approvedBy, savedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertMany = db.transaction((items) => {
      for (const r of items) {
        stmt.run(r.id, r.type || null, r.title, r.description || null, r.link || null, r.proposedBy || null, r.approvedBy || null, r.savedAt);
      }
    });
    insertMany(resources);
  }

  // Migrate pending-resources.json
  console.log('→ Migrating pending-resources.json');
  const pendingResources = readJsonFile('pending-resources.json');
  if (Array.isArray(pendingResources)) {
    const stmt = db.prepare(`
      INSERT INTO pending_resources (id, type, title, description, link, proposedBy, suggestedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertMany = db.transaction((items) => {
      for (const r of items) {
        stmt.run(r.id, r.type || null, r.title, r.description || null, r.link || null, r.proposedBy || null, r.suggestedAt);
      }
    });
    insertMany(pendingResources);
  }

  // Migrate faqs.json
  console.log('→ Migrating faqs.json');
  const faqs = readJsonFile('faqs.json');
  if (Array.isArray(faqs)) {
    const stmt = db.prepare(`
      INSERT INTO faqs (id, keywords, question, answer, addedAt, reminderId)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insertMany = db.transaction((items) => {
      for (const f of items) {
        stmt.run(f.id, f.keywords || null, f.question || null, f.answer || null, f.addedAt, f.reminderId || null);
      }
    });
    insertMany(faqs);
  }

  // Migrate questions.json
  console.log('→ Migrating questions.json');
  const questions = readJsonFile('questions.json');
  if (Array.isArray(questions)) {
    const stmt = db.prepare(`
      INSERT INTO questions (id, question, answer, difficulty, addedAt)
      VALUES (?, ?, ?, ?, ?)
    `);
    const insertMany = db.transaction((items) => {
      for (const q of items) {
        stmt.run(q.id, q.question, q.answer, q.difficulty || null, q.addedAt);
      }
    });
    insertMany(questions);
  }

  // Migrate daily-questions.json (these are actually questions, not daily scheduled)
  console.log('→ Migrating daily-questions.json');
  const dailyQuestionsData = readJsonFile('daily-questions.json');
  if (Array.isArray(dailyQuestionsData)) {
    const stmt = db.prepare(`
      INSERT INTO questions (id, question, answer, difficulty, addedAt)
      VALUES (?, ?, ?, ?, ?)
    `);
    const insertMany = db.transaction((items) => {
      for (const dq of items) {
        const id = genId();
        stmt.run(id, dq.question, dq.answer, dq.difficulty || null, new Date().toISOString());
      }
    });
    insertMany(dailyQuestionsData);
  }

  // Migrate stats.json
  console.log('→ Migrating stats.json');
  const stats = readJsonFile('stats.json');
  if (stats && typeof stats === 'object') {
    const stmt = db.prepare(`
      INSERT INTO stats (userId, userName, points, tasksProposed, tasksApproved, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertMany = db.transaction((items) => {
      for (const [userId, s] of items) {
        stmt.run(userId, s.userName || null, s.points || 0, s.tasksProposed || 0, s.tasksApproved || 0, s.createdAt, s.updatedAt);
      }
    });
    insertMany(Object.entries(stats));
  }

  // Migrate muted.json
  console.log('→ Migrating muted.json');
  const muted = readJsonFile('muted.json');
  if (muted && typeof muted === 'object') {
    const stmt = db.prepare(`
      INSERT INTO muted_users (userId, mutedAt, unmutedAt, reason)
      VALUES (?, ?, ?, ?)
    `);
    const insertMany = db.transaction((items) => {
      for (const [userId, m] of items) {
        stmt.run(userId, m.mutedAt || null, m.unmutedAt || null, m.reason || null);
      }
    });
    insertMany(Object.entries(muted));
  }

  // Migrate prize.json
  console.log('→ Migrating prize.json');
  const prize = readJsonFile('prize.json');
  if (prize) {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO prize (id, prize, points, sponsor)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run('current', prize.prize || null, prize.points || null, prize.sponsor || null);
  }

  // Migrate schedule-overrides.json
  console.log('→ Migrating schedule-overrides.json');
  const overrides = readJsonFile('schedule-overrides.json');
  if (overrides && typeof overrides === 'object') {
    const stmt = db.prepare(`
      INSERT INTO schedule_overrides (date, override_data)
      VALUES (?, ?)
    `);
    const insertMany = db.transaction((items) => {
      for (const [date, override] of items) {
        stmt.run(date, JSON.stringify(override));
      }
    });
    insertMany(Object.entries(overrides));
  }

  // Migrate dado.json
  console.log('→ Migrating dado.json');
  const dado = readJsonFile('dado.json');
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO dado (id, data)
    VALUES (?, ?)
  `);
  // If dado is an array or empty, initialize with object
  if (Array.isArray(dado) || !dado || Object.keys(dado).length === 0) {
    stmt.run('current', JSON.stringify({}));
  } else {
    stmt.run('current', JSON.stringify(dado));
  }

  console.log('\n✅ Migration complete!\n');
}

module.exports = { migrateData };
