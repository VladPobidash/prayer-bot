// Committed, code-reviewed tunables. No user-facing strings here (those live in i18n.ts).
export const TELEGRAM_MAX_LENGTH = 4096;
export const PAGE_SIZE = 10;

export const LOG_PREFIX = {
  bot: '[bot]',
  db: '[db]',
  scheduler: '[scheduler]',
  server: '[server]',
} as const;

// Prayer-room domain caps (committed, code-reviewed tunables).
export const MAX_ROOMS_PER_USER = 3;            // rooms a person can be in total (admin or member)
export const MAX_SHARED_TOPICS_PER_ROOM = 5;    // active shared topics an admin can have per room
export const MAX_PERSONAL_TOPICS_PER_MEMBER = 3; // active personal topics a member can have per room
