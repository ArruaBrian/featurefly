import { ILogger } from './types';

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeoutMs: number;
  logger: ILogger;
  onStateChange?: (state: CircuitState, failures: number) => void;
}

/**
 * Circuit breaker to prevent cascading failures when the feature flag API is down.
 *
 * States:
 *  - CLOSED: Requests pass through. Failures increment counter.
 *  - OPEN:   Requests are rejected immediately. After resetTimeoutMs, transitions to HALF-OPEN.
 *  - HALF-OPEN: One probe request is allowed. Success → CLOSED, failure → OPEN.
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private lastFailureTime = 0;
  private readonly options: CircuitBreakerOptions;

  constructor(options: CircuitBreakerOptions) {
    this.options = options;
  }

  getState(): CircuitState {
    return this.state;
  }

  getFailures(): number {
    return this.failures;
  }

  /**
   * Execute a function through the circuit breaker.
   * If the circuit is open, throws immediately.
   * If the circuit is half-open, allows one probe request.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (this.shouldAttemptReset()) {
        this.transitionTo('half-open');
      } else {
        throw new CircuitOpenError(
          `Circuit breaker is OPEN. ${this.failures} consecutive failures. ` +
          `Will retry after ${new Date(this.lastFailureTime + this.options.resetTimeoutMs).toISOString()}`
        );
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Manually reset the circuit to closed state.
   */
  reset(): void {
    this.transitionTo('closed');
    this.failures = 0;
    this.lastFailureTime = 0;
  }

  // ─── Internal ────────────────────────────────────────────────────────────────

  private onSuccess(): void {
    if (this.state === 'half-open' || this.failures > 0) {
      this.failures = 0;
      this.transitionTo('closed');
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.options.failureThreshold) {
      this.transitionTo('open');
    }
  }

  private shouldAttemptReset(): boolean {
    return Date.now() - this.lastFailureTime >= this.options.resetTimeoutMs;
  }

  private transitionTo(newState: CircuitState): void {
    if (this.state === newState) return;

    const oldState = this.state;
    this.state = newState;
    this.options.logger.info(`Circuit breaker: ${oldState} → ${newState} (failures: ${this.failures})`);
    this.options.onStateChange?.(newState, this.failures);
  }
}

/**
 * Error thrown when the circuit breaker is open and rejecting requests.
 */
export class CircuitOpenError extends Error {
  readonly name = 'CircuitOpenError';
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, CircuitOpenError.prototype);
  }
}
