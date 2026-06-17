import Database from 'better-sqlite3';
import type { Database as DB } from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import config from '../config.ts';
import { LOG_PREFIX } from '../preferences.ts';

let db: DB | null = null;

export function initDb(path: string = config.dbPath): DB {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  db = new Database(path);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS bot_state (
      key   TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      telegram_id  INTEGER PRIMARY KEY,
      display_name TEXT,
      locale       TEXT,
      created_at   TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      admin_id    INTEGER NOT NULL,
      invite_code TEXT NOT NULL UNIQUE,
      status      TEXT NOT NULL DEFAULT 'active',
      created_at  TEXT DEFAULT (datetime('now')),
      closed_at   TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_rooms_invite ON rooms(invite_code)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS room_members (
      room_id     INTEGER NOT NULL,
      telegram_id INTEGER NOT NULL,
      role        TEXT NOT NULL DEFAULT 'member',
      joined_at   TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (room_id, telegram_id)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_members_user ON room_members(telegram_id)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS topics (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      room_id     INTEGER NOT NULL,
      owner_id    INTEGER NOT NULL,
      kind        TEXT NOT NULL,
      text        TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'active',
      answer_note TEXT,
      created_at  TEXT DEFAULT (datetime('now')),
      answered_at TEXT
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_topics_room ON topics(room_id, status)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS topic_updates (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      topic_id   INTEGER NOT NULL,
      author_id  INTEGER NOT NULL,
      text       TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_assignment (
      date              TEXT NOT NULL,
      room_id           INTEGER NOT NULL,
      telegram_id       INTEGER NOT NULL,
      shared_topic_id   INTEGER,
      personal_topic_id INTEGER,
      created_at        TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (date, room_id, telegram_id)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_assign_user_date ON daily_assignment(telegram_id, date)`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS prayer_log (
      telegram_id INTEGER NOT NULL,
      room_id     INTEGER NOT NULL,
      topic_id    INTEGER NOT NULL,
      prayed_date TEXT NOT NULL,
      prayed_at   TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (telegram_id, topic_id, prayed_date)
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_prayer_room_date ON prayer_log(room_id, prayed_date)`);

  runMigrations(db);
  reconcile(db);
  console.log(`${LOG_PREFIX.db} initialized at ${path}`);
  return db;
}

// Additive, PRAGMA-guarded migrations.
function runMigrations(db: DB): void {
  const cols = (db.prepare(`PRAGMA table_info(users)`).all() as { name: string }[]).map((c) => c.name);
  if (!cols.includes('timezone')) db.exec(`ALTER TABLE users ADD COLUMN timezone TEXT`);
  if (!cols.includes('reminder_time')) db.exec(`ALTER TABLE users ADD COLUMN reminder_time TEXT`);
  if (!cols.includes('reminder_enabled')) db.exec(`ALTER TABLE users ADD COLUMN reminder_enabled INTEGER DEFAULT 1`);
}

// Recover transient state after a restart. No-op until the domain adds rows
// (e.g. UPDATE reminders SET status='pending' WHERE status='sending'); the hook
// exists so reconcile-on-boot has a home.
function reconcile(_db: DB): void {}

export function getDb(): DB {
  if (!db) throw new Error('DB not initialized — call initDb() first');
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
