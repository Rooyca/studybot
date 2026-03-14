// handlers/db.js — SQLite database management for StudyBot

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '../study-bot.db');
let db = null;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function initializeSchema() {
  const database = getDb();

  // Users table
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      phone TEXT PRIMARY KEY,
      id INTEGER UNIQUE,
      name TEXT NOT NULL,
      lastSeen TEXT,
      warnedAt TEXT
    );
  `);

  // Reminders (approved)
  database.exec(`
    CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      description TEXT,
      addedBy TEXT,
      approvedBy TEXT,
      createdAt TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_reminders_date ON reminders(date);
    CREATE INDEX IF NOT EXISTS idx_reminders_addedBy ON reminders(addedBy);
  `);

  // Pending reminders
  database.exec(`
    CREATE TABLE IF NOT EXISTS pending_reminders (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      description TEXT,
      proposedBy TEXT,
      suggestedAt TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_pending_reminders_proposedBy ON pending_reminders(proposedBy);
  `);

  // Tasks/Homework (approved)
  database.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      description TEXT,
      addedBy TEXT,
      approvedBy TEXT,
      createdAt TEXT,
      subject TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_date ON tasks(date);
    CREATE INDEX IF NOT EXISTS idx_tasks_subject ON tasks(subject);
    CREATE INDEX IF NOT EXISTS idx_tasks_addedBy ON tasks(addedBy);
  `);

  // Pending tasks
  database.exec(`
    CREATE TABLE IF NOT EXISTS pending_tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      subject TEXT,
      proposedBy TEXT,
      proposedAt TEXT,
      status TEXT DEFAULT 'pending',
      link TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_pending_tasks_subject ON pending_tasks(subject);
    CREATE INDEX IF NOT EXISTS idx_pending_tasks_proposedBy ON pending_tasks(proposedBy);
  `);

  // Notes (approved)
  database.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      subject TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      link TEXT,
      proposedBy TEXT,
      approvedBy TEXT,
      savedAt TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_notes_subject ON notes(subject);
    CREATE INDEX IF NOT EXISTS idx_notes_proposedBy ON notes(proposedBy);
  `);

  // Pending notes
  database.exec(`
    CREATE TABLE IF NOT EXISTS pending_notes (
      id TEXT PRIMARY KEY,
      subject TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      link TEXT,
      proposedBy TEXT,
      suggestedAt TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_pending_notes_subject ON pending_notes(subject);
    CREATE INDEX IF NOT EXISTS idx_pending_notes_proposedBy ON pending_notes(proposedBy);
  `);

  // Resources (approved)
  database.exec(`
    CREATE TABLE IF NOT EXISTS resources (
      id TEXT PRIMARY KEY,
      type TEXT,
      title TEXT NOT NULL,
      description TEXT,
      link TEXT,
      proposedBy TEXT,
      approvedBy TEXT,
      savedAt TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_resources_proposedBy ON resources(proposedBy);
  `);

  // Pending resources
  database.exec(`
    CREATE TABLE IF NOT EXISTS pending_resources (
      id TEXT PRIMARY KEY,
      type TEXT,
      title TEXT NOT NULL,
      description TEXT,
      link TEXT,
      proposedBy TEXT,
      suggestedAt TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_pending_resources_proposedBy ON pending_resources(proposedBy);
  `);

  // FAQs
  database.exec(`
    CREATE TABLE IF NOT EXISTS faqs (
      id TEXT PRIMARY KEY,
      keywords TEXT,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      addedAt TEXT,
      reminderId TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_faqs_keywords ON faqs(keywords);
  `);

  // Questions (question bank)
  database.exec(`
    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      difficulty TEXT,
      addedAt TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_questions_difficulty ON questions(difficulty);
  `);

  // Daily questions (scheduled)
  database.exec(`
    CREATE TABLE IF NOT EXISTS daily_questions (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL UNIQUE,
      question_id TEXT,
      askedAt TEXT,
      FOREIGN KEY (question_id) REFERENCES questions(id)
    );
    CREATE INDEX IF NOT EXISTS idx_daily_questions_date ON daily_questions(date);
  `);

  // User stats (leaderboard)
  database.exec(`
    CREATE TABLE IF NOT EXISTS stats (
      userId TEXT PRIMARY KEY,
      userName TEXT,
      points INTEGER DEFAULT 0,
      tasksProposed INTEGER DEFAULT 0,
      tasksApproved INTEGER DEFAULT 0,
      notesProposed INTEGER DEFAULT 0,
      notesApproved INTEGER DEFAULT 0,
      resourcesProposed INTEGER DEFAULT 0,
      resourcesApproved INTEGER DEFAULT 0,
      questionsAnswered INTEGER DEFAULT 0,
      questionsAsked INTEGER DEFAULT 0,
      questionPoints INTEGER DEFAULT 0,
      remindersApproved INTEGER DEFAULT 0,
      bonusPoints INTEGER DEFAULT 0,
      createdAt TEXT,
      updatedAt TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_stats_points ON stats(points DESC);
  `);

  // Muted users
  database.exec(`
    CREATE TABLE IF NOT EXISTS muted_users (
      userId TEXT PRIMARY KEY,
      mutedAt TEXT,
      unmutedAt TEXT,
      reason TEXT
    );
  `);

  // Activity log
  database.exec(`
    CREATE TABLE IF NOT EXISTS activity_log (
      userId TEXT PRIMARY KEY,
      lastSeen TEXT,
      warnedAt TEXT
    );
  `);

  // Prize (leaderboard prize as JSON)
  database.exec(`
    CREATE TABLE IF NOT EXISTS prize (
      id TEXT PRIMARY KEY DEFAULT 'current',
      prize TEXT,
      points INTEGER,
      sponsor TEXT
    );
  `);

  // Schedule overrides (date -> data JSON)
  database.exec(`
    CREATE TABLE IF NOT EXISTS schedule_overrides (
      date TEXT PRIMARY KEY,
      override_data TEXT
    );
  `);

  // Logs (event logs)
  database.exec(`
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message TEXT NOT NULL,
      timestamp TEXT
    );
  `);

  // Dado (dice game state as JSON)
  database.exec(`
    CREATE TABLE IF NOT EXISTS dado (
      id TEXT PRIMARY KEY DEFAULT 'current',
      data TEXT
    );
  `);

  // Blackjack bank (communal pot)
  database.exec(`
    CREATE TABLE IF NOT EXISTS blackjack_bank (
      id TEXT PRIMARY KEY DEFAULT 'current',
      bank_amount INTEGER DEFAULT 0,
      last_updated TEXT
    );
  `);

  console.log('✅ Database schema initialized');
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  getDb,
  initializeSchema,
  closeDb,
  DB_PATH
};
