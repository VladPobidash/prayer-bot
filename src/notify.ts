import { Markup } from 'telegraf';
import { TELEGRAM_MAX_LENGTH } from './preferences.ts';

const ELLIPSIS = '\n… (truncated)';

export function truncate(text: string, max: number = TELEGRAM_MAX_LENGTH): string {
  if (text.length <= max) return text;
  return text.slice(0, max - ELLIPSIS.length) + ELLIPSIS;
}

export function lines(items: Array<string | null | undefined>): string {
  return items.filter((x): x is string => typeof x === 'string').join('\n');
}

// One keyboard-builder example (single convention: Telegraf Markup).
export function confirmKeyboard(yesData: string, noData: string) {
  return Markup.inlineKeyboard([
    [Markup.button.callback('✅', yesData), Markup.button.callback('❌', noData)],
  ]);
}
