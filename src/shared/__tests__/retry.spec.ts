import { withRetry } from '../retry';
import { ILogger } from '../types';

const createMockLogger = (): ILogger => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
});

describe('withRetry', () => {
  let logger: ILogger;

  beforeEach(() => {
    logger = createMockLogger();
    jest.useRealTimers();
  });

  it('should return result on first success', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 100 }, logger);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and succeed', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockResolvedValue('ok');

    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 100 }, logger);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should throw after exhausting all attempts', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('always fails'));

    await expect(
      withRetry(fn, { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 100 }, logger),
    ).rejects.toThrow('always fails');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should call onRetry callback on each retry', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('ok');

    const onRetry = jest.fn();
    await withRetry(fn, { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 100 }, logger, onRetry);

    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error));
    expect(onRetry).toHaveBeenCalledWith(2, expect.any(Error));
  });

  it('should log warnings on retry', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValue('ok');

    await withRetry(fn, { maxAttempts: 2, baseDelayMs: 10, maxDelayMs: 100 }, logger);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('should work with 1 max attempt (no retries)', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('no retry'));

    await expect(
      withRetry(fn, { maxAttempts: 1, baseDelayMs: 10, maxDelayMs: 100 }, logger),
    ).rejects.toThrow('no retry');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
