import { ILogger, RetryConfig } from './types';

const DEFAULT_RETRY: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10_000,
};

/**
 * Retry a function with exponential backoff and jitter.
 *
 * @param fn        - The async function to retry
 * @param config    - Retry configuration
 * @param logger    - Logger for retry attempts
 * @param onRetry   - Optional callback invoked on each retry with (attempt, error)
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  logger: ILogger,
  onRetry?: (attempt: number, error: unknown) => void,
): Promise<T> {
  const { maxAttempts, baseDelayMs, maxDelayMs } = { ...DEFAULT_RETRY, ...config };

  // Normalize maxAttempts: NaN → default, <= 0 → 1 (with warning)
  const safeMaxAttempts = isNaN(maxAttempts) ? DEFAULT_RETRY.maxAttempts : Math.max(1, maxAttempts);
  if (maxAttempts <= 0) {
    logger.warn(`maxAttempts must be >= 1, treating as 1 (got ${maxAttempts})`);
  }

  let lastError: unknown;

  for (let attempt = 1; attempt <= safeMaxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error;

      if (attempt >= maxAttempts) break;

      // Exponential backoff with jitter
      const exponentialDelay = baseDelayMs * Math.pow(2, attempt - 1);
      const jitter = Math.random() * baseDelayMs * 0.5;
      const delay = Math.min(exponentialDelay + jitter, maxDelayMs);

      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(`Request failed (attempt ${attempt}/${safeMaxAttempts}): ${errorMessage}. Retrying in ${Math.round(delay)}ms...`);

      onRetry?.(attempt, error);

      await sleep(delay);
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
