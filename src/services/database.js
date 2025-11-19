const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

// Use /volume for Railway persistent storage, fallback to local data folder
const DB_PATH = process.env.NODE_ENV === 'production'
  ? '/volume/resume_tracker.db'
  : path.join(__dirname, '../../data/resume_tracker.db');

async function initDatabase() {
  const SQL = await initSqlJs();

  let db;

  // Try to load existing database
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
    console.log('Loaded existing database');
  } else {
    db = new SQL.Database();
    console.log('Created new database');
  }

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company TEXT NOT NULL,
      job_title TEXT NOT NULL,
      job_url TEXT,
      date_applied TEXT NOT NULL,
      interview_date TEXT,
      interview_type TEXT,
      last_communication TEXT,
      status TEXT DEFAULT 'applied',
      salary_range TEXT,
      location TEXT,
      remote_type TEXT,
      contact_name TEXT,
      contact_email TEXT,
      contact_phone TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS job_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      link_type TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS resumes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_data BLOB NOT NULL,
      content_text TEXT,
      is_default INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS job_postings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      file_data BLOB NOT NULL,
      content_text TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS ai_conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER,
      resume_id INTEGER,
      messages TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE SET NULL,
      FOREIGN KEY (resume_id) REFERENCES resumes(id) ON DELETE SET NULL
    )
  `);

  // Save database periodically
  setInterval(() => {
    saveDatabase(db);
  }, 60000); // Save every minute

  return db;
}

function saveDatabase(db) {
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
    console.log('Database saved automatically');
  } catch (error) {
    console.error('Error saving database:', error);
  }
}

module.exports = { initDatabase, saveDatabase };
