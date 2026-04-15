import { ILogger } from './types';

const DEFAULT_CACHE_TTL = 60_000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Options for configuring the InMemoryCache instance.
 */
export interface CacheOptions {
  /**
   * Logger instance for warnings. If not provided, no warnings will be logged.
   */
  logger?: ILogger;
}

/**
 * In-memory cache with TTL expiration and automatic cleanup.
 *
 * Uses a wrapper object `{ hit: true, value: T }` pattern internally
 * to correctly handle falsy values (false, 0, '', null).
 */
export class InMemoryCache {
  private readonly store = new Map<string, CacheEntry<unknown>>();
  private readonly ttlMs: number;
  private readonly logger?: ILogger;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(ttlMs: number = DEFAULT_CACHE_TTL, options?: CacheOptions) {
    this.logger = options?.logger;

    // Validate TTL
    if (isNaN(ttlMs) || ttlMs < 0) {
      this.logger?.warn(
        `Invalid cache TTL ${ttlMs}ms. Using default ${DEFAULT_CACHE_TTL}ms.`,
      );
      this.ttlMs = DEFAULT_CACHE_TTL;
    } else {
      this.ttlMs = ttlMs;
    }

    // Warn if TTL is too low (cleanup runs every max(ttlMs, 30000)ms)
    if (this.ttlMs > 0 && this.ttlMs < 1000) {
      this.logger?.warn(
        `Cache TTL ${this.ttlMs}ms is below 1000ms. Cleanup runs every max(${this.ttlMs}, 30000)ms.`,
      );
    }

    if (this.ttlMs > 0) {
      this.cleanupTimer = setInterval(() => this.cleanup(), Math.max(this.ttlMs, 30_000));
      // In Node.js, we don't want this timer to keep the process alive
      if (typeof this.cleanupTimer === 'object' && typeof this.cleanupTimer.unref === 'function') {
        this.cleanupTimer.unref();
      }
    }
  }

  // ─── Read ────────────────────────────────────────────────────────────────────

  /**
   * Get a cached value. Returns `{ hit: true, value }` if found and not expired,
   * or `{ hit: false }` otherwise. This avoids ambiguity with falsy values.
   */
  get<T>(key: string): { hit: true; value: T } | { hit: false } {
    if (this.ttlMs <= 0) return { hit: false };

    const entry = this.store.get(key);
    if (!entry) return { hit: false };

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return { hit: false };
    }

    return { hit: true, value: entry.value as T };
  }

  /**
   * Check if a key exists AND is not expired.
   */
  has(key: string): boolean {
    return this.get(key).hit;
  }

  // ─── Write ───────────────────────────────────────────────────────────────────

  set<T>(key: string, value: T): void {
    if (this.ttlMs <= 0) return;
    this.store.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  delete(key: string): boolean {
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  // ─── Stats ───────────────────────────────────────────────────────────────────

  getStats(): { size: number; keys: string[]; enabled: boolean } {
    return {
      size: this.store.size,
      keys: Array.from(this.store.keys()),
      enabled: this.ttlMs > 0,
    };
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  /**
   * Release the cleanup timer. Call this when the client is being disposed
   * to prevent memory leaks and dangling timers.
   * Idempotent: safe to call multiple times.
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.store.clear();
  }

  // ─── Internal ────────────────────────────────────────────────────────────────

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
      }
    }
  }
}
