interface CacheEntry<T> {
  value: T;
  expiresAt: number;
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
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(ttlMs: number = 60_000) {
    this.ttlMs = ttlMs;

    if (ttlMs > 0) {
      this.cleanupTimer = setInterval(() => this.cleanup(), Math.max(ttlMs, 30_000));
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
