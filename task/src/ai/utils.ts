/**
 * Retries an async function on 429 rate-limit errors with exponential backoff.
 *
 * @param fn         The async operation to run
 * @param maxRetries Maximum number of retry attempts (default: 3)
 * @param baseDelayMs Starting delay in ms; doubles each attempt (default: 15 000)
 */
export async function callWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 15_000,
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      const isRateLimit =
        error?.status === 429 ||
        error?.statusCode === 429 ||
        error?.error?.type === 'rate_limit_error';

      if (!isRateLimit || attempt === maxRetries) {
        throw error;
      }

      // Exponential backoff with ±20 % jitter
      const delay = baseDelayMs * Math.pow(2, attempt) * (0.8 + Math.random() * 0.4);
      console.log(
        `⏳ Rate limit hit — retrying in ${Math.round(delay / 1000)}s ` +
        `(attempt ${attempt + 1}/${maxRetries})...`,
      );
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  // Never reached, but satisfies the compiler
  throw new Error('callWithRetry: exceeded retries');
}
