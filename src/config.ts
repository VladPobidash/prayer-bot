import 'dotenv/config';

export const SUPPORTED_LOCALES = ['uk', 'en', 'ru'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export interface Config {
  telegramBotToken: string;
  dbPath: string;
  port: number;
  tz: string;
  defaultLocale: Locale;
  adminUserIds: Set<number>;
  adminChatId: number | null;
  heartbeatCron: string;
}

const REQUIRED = ['TELEGRAM_BOT_TOKEN'] as const;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  for (const key of REQUIRED) {
    if (!env[key]) throw new Error(`Missing required env var: ${key}`);
  }

  const localeRaw = env.DEFAULT_LOCALE ?? 'uk';
  const defaultLocale: Locale =
    (SUPPORTED_LOCALES as readonly string[]).includes(localeRaw)
      ? (localeRaw as Locale)
      : 'uk';

  const adminUserIds = new Set(
    (env.ADMIN_USER_IDS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n)),
  );

  return Object.freeze({
    telegramBotToken: env.TELEGRAM_BOT_TOKEN as string,
    dbPath: env.DB_PATH ?? './data/prayer-bot.db',
    port: env.PORT !== undefined && env.PORT !== '' ? Number(env.PORT) : 3000,
    tz: env.TZ ?? 'UTC',
    defaultLocale,
    adminUserIds,
    adminChatId:
      env.ADMIN_CHAT_ID !== undefined && env.ADMIN_CHAT_ID !== ''
        ? Number(env.ADMIN_CHAT_ID)
        : null,
    heartbeatCron: env.HEARTBEAT_CRON ?? '0 * * * *',
  });
}

// Eager load = fail-fast at boot (a missing var crashes with a one-line log).
const config = loadConfig();
export default config;
