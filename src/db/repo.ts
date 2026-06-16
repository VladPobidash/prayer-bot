import { getDb } from './connection.ts';

export interface BotState {
  key: string;
  value: string;
}

export function getState(key: string): string | null {
  const row = getDb()
    .prepare('SELECT value FROM bot_state WHERE key = ?')
    .get(key) as { value: string } | undefined;
  return row ? row.value : null;
}

export function setState(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO bot_state (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(key, value);
}

// ───────────────────────────────────────────────────────────────────────────
// Prayer-domain repo functions go here (added with the domain). Keep ALL SQL in
// this module so a future Postgres swap touches only connection.ts + repo.ts.
// ───────────────────────────────────────────────────────────────────────────
