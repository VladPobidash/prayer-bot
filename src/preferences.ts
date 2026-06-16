// Committed, code-reviewed tunables. No user-facing strings here (those live in i18n.ts).
export const TELEGRAM_MAX_LENGTH = 4096;
export const PAGE_SIZE = 10;

export const LOG_PREFIX = {
  bot: '[bot]',
  db: '[db]',
  scheduler: '[scheduler]',
  server: '[server]',
} as const;
