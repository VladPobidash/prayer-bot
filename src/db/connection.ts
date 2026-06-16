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
