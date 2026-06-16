import config, { type Locale } from './config.ts';

export const LOCALES = {
  uk: {
    start: 'Вітаю! Я бот-помічник для молитви. Напишіть /help, щоб побачити команди.',
    help: 'Команди:\n/start — почати\n/help — довідка\n/ping — перевірка зв’язку',
    ping: 'pong',
    greeting: 'Вітаю, {name}!',
    unknownCommand: 'Невідома команда. Спробуйте /help.',
  },
  en: {
    start: 'Hi! I’m a prayer helper bot. Send /help to see the commands.',
    help: 'Commands:\n/start — get started\n/help — this help\n/ping — connectivity check',
    ping: 'pong',
    greeting: 'Hello, {name}!',
    unknownCommand: 'Unknown command. Try /help.',
  },
  ru: {
    start: 'Привет! Я бот-помощник для молитвы. Напишите /help, чтобы увидеть команды.',
    help: 'Команды:\n/start — начать\n/help — справка\n/ping — проверка связи',
    ping: 'pong',
    greeting: 'Здравствуйте, {name}!',
    unknownCommand: 'Неизвестная команда. Попробуйте /help.',
  },
} as const;

export type LocaleKey = keyof (typeof LOCALES)['uk'];

type Dict = Record<LocaleKey, string>;

export function t(
  locale: string,
  key: LocaleKey,
  vars: Record<string, string | number> = {},
): string {
  const table = LOCALES as Record<string, Dict>;
  const dict = table[locale] ?? table[config.defaultLocale];
  const template = dict[key] ?? table[config.defaultLocale][key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_match, name: string) =>
    name in vars ? String(vars[name]) : `{${name}}`,
  );
}

// TODO: once groups/users carry a locale in the DB, resolve it per-chat here.
export function resolveLocale(_ctx: unknown): Locale {
  return config.defaultLocale;
}
