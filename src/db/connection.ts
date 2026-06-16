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

  runMigrations(db);
  reconcile(db);
  console.log(`${LOG_PREFIX.db} initialized at ${path}`);
  return db;
}

// Additive, PRAGMA-guarded migrations. None yet — worked-example pattern:
//   const cols = db.prepare(`PRAGMA table_info(bot_state)`).all();
//   if (!cols.some((c) => (c as { name: string }).name === 'updated_at')) {
//     db.exec(`ALTER TABLE bot_state ADD COLUMN updated_at TEXT`);
//   }
function runMigrations(_db: DB): void {}

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
