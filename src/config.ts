import 'dotenv/config';

export const SUPPORTED_LOCALES = ['uk', 'en', 'ru'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export interface Config {
  telegramBotToken: string;
  botUsername: string;
  dbPath: string;
  port: number;
  defaultLocale: Locale;
  adminUserIds: Set<number>;
  adminChatId: number | null;
  webAppUrl: string;
}

const REQUIRED = ['TELEGRAM_BOT_TOKEN'] as const;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const read = (v: string | undefined): string | undefined =>
    v !== undefined && v !== '' ? v : undefined;

  for (const key of REQUIRED) {
    if (!env[key]) throw new Error(`Missing required env var: ${key}`);
  }

  const localeRaw = read(env.DEFAULT_LOCALE) ?? 'uk';
  const defaultLocale: Locale =
    (SUPPORTED_LOCALES as readonly string[]).includes(localeRaw)
      ? (localeRaw as Locale)
      : 'uk';

  const adminUserIds = new Set(
    (read(env.ADMIN_USER_IDS) ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((s) => Number(s))
      .filter((n) => Number.isFinite(n)),
  );

  const portStr = read(env.PORT);
  const port = portStr !== undefined ? Number(portStr) : 3000;
  const adminChatStr = read(env.ADMIN_CHAT_ID);
  const webAppUrl = read(env.WEBAPP_URL) ?? `http://localhost:${port}`;
  const botUsername = read(env.BOT_USERNAME) ?? 'prayer_me_bot';

  return Object.freeze({
    telegramBotToken: env.TELEGRAM_BOT_TOKEN as string,
    botUsername,
    dbPath: read(env.DB_PATH) ?? './data/prayer-bot.db',
    port,
    defaultLocale,
    adminUserIds,
    adminChatId: adminChatStr !== undefined ? Number(adminChatStr) : null,
    webAppUrl,
  });
}

// Eager load = fail-fast at boot (a missing var crashes with a one-line log).
const config = loadConfig();
export default config;
