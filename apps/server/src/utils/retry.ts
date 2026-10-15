import { logger } from '../observability/logger.js';

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function retryWithBackoff<T>(
  operation: string,
  task: () => Promise<T>,
  options: { attempts: number; baseDelayMs: number; maximumDelayMs?: number },
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= options.attempts; attempt += 1) {
    try { return await task(); }
    catch (error) {
      lastError = error;
      if (attempt >= options.attempts) break;
      const exponential = Math.min(options.maximumDelayMs || 30_000, options.baseDelayMs * (2 ** (attempt - 1)));
      const jitter = Math.floor(exponential * 0.2 * Math.random());
      const delayMs = exponential + jitter;
      logger.warn('dependency_retry_scheduled', { operation, attempt, maximumAttempts: options.attempts, delayMs, error });
      await wait(delayMs);
    }
  }
  throw lastError;
}
