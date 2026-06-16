// Cyrillic-safe normalizer: lowercase, replace any run of non-letter/non-number
// with a single space, trim. \p{L}\p{N} with /u keeps uk/ru scripts intact.
export function normalize(input: string): string {
  return input.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout after ${ms}ms`)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; delayMs?: number } = {},
): Promise<T> {
  const retries = opts.retries ?? 3;
  const delayMs = opts.delayMs ?? 200;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise<void>((r) => setTimeout(r, delayMs));
      }
    }
  }
  throw lastErr;
}
