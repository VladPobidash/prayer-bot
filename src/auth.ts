import { createHmac } from 'node:crypto';

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
}

export interface AuthResult {
  valid: boolean;
  user?: TelegramUser;
  error?: string;
}

/**
 * Validates Telegram WebApp initData string against the bot token.
 * Telegram WebApp Auth specification:
 * 1. Parse query string and extract `hash`.
 * 2. Sort remaining key=value pairs lexicographically and join with \n.
 * 3. Secret key = HMAC-SHA256(key="WebAppData", msg=botToken).
 * 4. Calculated hash = HMAC-SHA256(key=secretKey, msg=dataCheckString).hex().
 */
export function validateInitData(initDataRaw: string, botToken: string, maxAgeSeconds: number = 86400): AuthResult {
  if (!initDataRaw) {
    return { valid: false, error: 'missing initData' };
  }

  try {
    const params = new URLSearchParams(initDataRaw);
    const hash = params.get('hash');
    if (!hash) {
      return { valid: false, error: 'missing hash' };
    }

    const dataPairs: string[] = [];
    params.forEach((val, key) => {
      if (key !== 'hash') {
        dataPairs.push(`${key}=${val}`);
      }
    });

    dataPairs.sort();
    const dataCheckString = dataPairs.join('\n');

    const secretKey = createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    const calculatedHash = createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    if (calculatedHash !== hash) {
      return { valid: false, error: 'invalid hash signature' };
    }

    const authDateStr = params.get('auth_date');
    if (authDateStr) {
      const authDate = parseInt(authDateStr, 10);
      const now = Math.floor(Date.now() / 1000);
      if (maxAgeSeconds > 0 && now - authDate > maxAgeSeconds) {
        return { valid: false, error: 'initData expired' };
      }
    }

    const userJson = params.get('user');
    let user: TelegramUser | undefined;
    if (userJson) {
      user = JSON.parse(userJson);
    }

    return { valid: true, user };
  } catch (err) {
    return { valid: false, error: (err as Error).message };
  }
}

/**
 * Helper to construct a valid Telegram initData string for testing.
 */
export function generateTestInitData(user: TelegramUser, botToken: string, authDate: number = Math.floor(Date.now() / 1000)): string {
  const userStr = JSON.stringify(user);
  const params = new URLSearchParams();
  params.set('auth_date', authDate.toString());
  params.set('query_id', 'AAEAAAAAAA');
  params.set('user', userStr);

  const dataPairs: string[] = [];
  params.forEach((val, key) => {
    dataPairs.push(`${key}=${val}`);
  });
  dataPairs.sort();
  const dataCheckString = dataPairs.join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  params.set('hash', hash);
  return params.toString();
}
