import { CircuitBreaker, CircuitOpenError } from '../circuit-breaker';
import { ILogger } from '../types';

const createMockLogger = (): ILogger => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
});

describe('CircuitBreaker', () => {
  let logger: ILogger;

  beforeEach(() => {
    logger = createMockLogger();
    jest.useRealTimers();
  });

  describe('closed state', () => {
    it('should start in closed state', () => {
      const cb = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 1000, logger });
      expect(cb.getState()).toBe('closed');
    });

    it('should allow successful requests', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 1000, logger });
      const result = await cb.execute(() => Promise.resolve('ok'));
      expect(result).toBe('ok');
      expect(cb.getState()).toBe('closed');
    });

    it('should count failures', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 1000, logger });

      await expect(cb.execute(() => Promise.reject(new Error('fail 1')))).rejects.toThrow();
      expect(cb.getFailures()).toBe(1);
      expect(cb.getState()).toBe('closed');

      await expect(cb.execute(() => Promise.reject(new Error('fail 2')))).rejects.toThrow();
      expect(cb.getFailures()).toBe(2);
      expect(cb.getState()).toBe('closed');
    });

    it('should reset failure count on success', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 1000, logger });

      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      expect(cb.getFailures()).toBe(1);

      await cb.execute(() => Promise.resolve('ok'));
      expect(cb.getFailures()).toBe(0);
    });
  });

  describe('open state', () => {
    it('should open after reaching failure threshold', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 1000, logger });

      await expect(cb.execute(() => Promise.reject(new Error('fail 1')))).rejects.toThrow();
      await expect(cb.execute(() => Promise.reject(new Error('fail 2')))).rejects.toThrow();

      expect(cb.getState()).toBe('open');
    });

    it('should reject requests immediately when open', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 60000, logger });

      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      expect(cb.getState()).toBe('open');

      await expect(cb.execute(() => Promise.resolve('ok'))).rejects.toThrow(CircuitOpenError);
    });

    it('should call onStateChange when opening', async () => {
      const onStateChange = jest.fn();
      const cb = new CircuitBreaker({
        failureThreshold: 1,
        resetTimeoutMs: 1000,
        logger,
        onStateChange,
      });

      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      expect(onStateChange).toHaveBeenCalledWith('open', 1);
    });
  });

  describe('half-open state', () => {
    it('should transition to half-open after reset timeout', async () => {
      jest.useFakeTimers();
      const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 1000, logger });

      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      expect(cb.getState()).toBe('open');

      jest.advanceTimersByTime(1001);

      // The next execute will transition to half-open before attempting
      const result = await cb.execute(() => Promise.resolve('recovered'));
      expect(result).toBe('recovered');
      expect(cb.getState()).toBe('closed');
    });

    it('should go back to open if probe fails', async () => {
      jest.useFakeTimers();
      const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 1000, logger });

      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      jest.advanceTimersByTime(1001);

      await expect(cb.execute(() => Promise.reject(new Error('still failing')))).rejects.toThrow();
      expect(cb.getState()).toBe('open');
    });
  });

  describe('manual reset', () => {
    it('should reset to closed state', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 60000, logger });

      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow();
      expect(cb.getState()).toBe('open');

      cb.reset();
      expect(cb.getState()).toBe('closed');
      expect(cb.getFailures()).toBe(0);
    });
  });
});
