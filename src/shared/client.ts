import {
  FeatureFlag,
  WorkspaceFeatureFlag,
  CreateFlagData,
  UpdateFlagData,
  SetWorkspaceFlagData,
  FeatureFlagStats,
  FeatureFlagsConfig,
  FlagValue,
  FlagDocument,
  EvaluationContext,
  EvaluationReason,
  FeatureFlyEvent,
  EventHandler,
  RetryConfig,
  CircuitBreakerConfig,
  ILogger,
} from './types';
import { InMemoryCache } from './cache';
import { ConsoleLogger } from './logger';
import { CircuitBreaker } from './circuit-breaker';
import { EventEmitter } from './event-emitter';
import { withRetry } from './retry';
import { stableStringify } from './utils';
import type { MetricsSnapshot } from './metrics';

// ═══════════════════════════════════════════════════════════════════════════════
// DEFAULTS
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_TIMEOUT = 10_000;
const DEFAULT_CACHE_TTL = 60_000;

const DEFAULT_RETRY: RetryConfig = {
  maxAttempts: 3,
  baseDelayMs: 1_000,
  maxDelayMs: 10_000,
};

const DEFAULT_CIRCUIT_BREAKER: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
};

// Custom Fetch Error class to mirror Axios minimal behavior
export class FetchError extends Error {
  response?: { status: number; data?: unknown };
  constructor(message: string, status?: number, data?: unknown) {
    super(message);
    this.name = 'FetchError';
    if (status) {
      this.response = { status, data };
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLIENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * FeatureFly SDK Client
 *
 * Framework-agnostic feature flags client with:
 * - In-memory caching with TTL
 * - Retry with exponential backoff + jitter
 * - Circuit breaker for resilience
 * - Typed event system
 * - Local overrides for dev/testing
 * - Fallback defaults for graceful degradation
 * - Multi-type flag values (boolean, string, number, JSON)
 *
 * @example
 * ```ts
 * const client = new FeatureFlagsClient({
 *   baseUrl: 'https://api.example.com',
 *   apiKey: 'your-key',
 * });
 *
 * const isEnabled = await client.evaluateFlag('new-feature', false, { workspaceId: '123' });
 * ```
 */
export class FeatureFlagsClient {
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly headers: Record<string, string>;
  private readonly requestInterceptor?: () => Record<string, string> | Promise<Record<string, string>>;
  private readonly withCredentials: boolean;

  private readonly cache: InMemoryCache;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly events: EventEmitter;
  private readonly logger: ILogger;
  private readonly retryConfig: RetryConfig;
  private readonly localOverrides: Record<string, FlagValue>;
  private readonly fallbackDefaults: Record<string, FlagValue>;
  private readonly previousValues = new Map<string, FlagValue>();
  private streamClient?: { connect(): void; disconnect(): void; dispose(): void };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private edgeEvaluator?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private metrics?: any;
  private disposed = false;

  constructor(config: FeatureFlagsConfig) {
    // Logger
    this.logger = config.logger ?? new ConsoleLogger(config.logLevel ?? 'warn', config.logPrefix);

    // Cache
    const cacheTtl = config.cacheEnabled === false ? 0 : (config.cacheTtlMs ?? DEFAULT_CACHE_TTL);
    this.cache = new InMemoryCache(cacheTtl);

    // Bootstrap Flags (SSR Hydration)
    if (config.bootstrapFlags) {
      // Seed individual flags
      for (const [slug, value] of Object.entries(config.bootstrapFlags)) {
        this.cache.set(this.buildCacheKey('evaluate', slug), value);
      }
      // Seed batch evaluation result
      this.cache.set(this.buildCacheKey('batch-evaluate'), config.bootstrapFlags);
    }

    // Retry
    this.retryConfig = { ...DEFAULT_RETRY, ...config.retry };

    // Event emitter
    this.events = new EventEmitter();

    // Circuit breaker
    const cbConfig = { ...DEFAULT_CIRCUIT_BREAKER, ...config.circuitBreaker };
    this.circuitBreaker = new CircuitBreaker({
      ...cbConfig,
      logger: this.logger,
      onStateChange: (state, failures) => {
        const eventMap: Record<string, FeatureFlyEvent> = {
          'open': 'circuitOpen',
          'closed': 'circuitClosed',
          'half-open': 'circuitHalfOpen',
        };
        const event = eventMap[state] as FeatureFlyEvent;
        if (event) {
          this.events.emit(event, { state, failures });
        }
      },
    });

    // Local overrides & fallbacks
    this.localOverrides = { ...config.localOverrides };
    this.fallbackDefaults = { ...config.fallbackDefaults };

    // HTTP client config
    this.baseUrl = config.baseUrl;
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT;
    this.withCredentials = config.withCredentials ?? false;
    this.safeApiKey = config.apiKey?.trim() || undefined;
    this.headers = {
      'Content-Type': 'application/json',
      ...(this.safeApiKey && { Authorization: `Bearer ${this.safeApiKey}` }),
      ...config.headers,
    };
    this.requestInterceptor = config.requestInterceptor;

    // LAZY: Store streaming config for lazy initialization
    this.streamingConfig = config.streaming;

    // LAZY: Store edgeDocument for lazy initialization
    this.edgeDocumentConfig = config.edgeDocument;
    this.trackingCallbackConfig = config.trackingCallback;

    // Impact Metrics (LAZY - store config for later)
    this.metricsConfig = true;

    this.logger.debug(`Initialized with baseUrl=${config.baseUrl}, cache=${cacheTtl}ms, retry=${this.retryConfig.maxAttempts}`);
  }

  private readonly safeApiKey: string | undefined;
  private readonly streamingConfig: unknown;
  private edgeDocumentConfig: FlagDocument | undefined;
  private readonly trackingCallbackConfig: unknown;
  private readonly metricsConfig: boolean;
  private metricsInitialized = false;

  // ─── LAZY LOADING GETTERS ────────────────────────────────────────────────────

  private async getEdgeEvaluator(): Promise<NonNullable<typeof this.edgeEvaluator>> {
    if (!this.edgeEvaluator) {
      const { EdgeEvaluator } = await import('./edge-evaluator');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.edgeEvaluator = new EdgeEvaluator(
        this.edgeDocumentConfig!,
        this.fallbackDefaults,
        this.trackingCallbackConfig as (assignment: import('./types').ExperimentAssignment) => void
      );
      this.logger.info('Edge evaluator initialized from provided document');
    }
    return this.edgeEvaluator as NonNullable<typeof this.edgeEvaluator>;
  }

  private async getMetrics(): Promise<NonNullable<typeof this.metrics>> {
    if (!this.metrics) {
      const { ImpactMetrics } = await import('./metrics');
      this.metrics = new ImpactMetrics(this.events);
      this.metricsInitialized = true;
    }
    return this.metrics as NonNullable<typeof this.metrics>;
  }

  private async ensureStreaming(): Promise<void> {
    if (this.streamClient) return;

    const { FlagStreamClient } = await import('./streaming');
    const streamConfig = typeof this.streamingConfig === 'object' ? this.streamingConfig : {};

    this.streamClient = new FlagStreamClient(
      this.baseUrl,
      this.safeApiKey,
      streamConfig as { reconnectDelayMs?: number; maxReconnectDelayMs?: number },
      this.logger,
      this.events
    );

    this.streamClient.connect();

    this.events.on('flagsUpdated', ({ slugs }) => {
      if (this.edgeEvaluator) {
        this.refreshEdgeDocument().catch(e => this.logger.error('Failed to refresh edge doc on stream update', e));
      } else if (slugs?.length) {
        for (const slug of slugs) {
          this.cache.delete(this.buildCacheKey('evaluate', slug));
        }
        this.cache.delete(this.buildCacheKey('batch-evaluate'));
      } else {
        this.cache.clear();
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HTTP FETCH ABSTRACTION
  // ═══════════════════════════════════════════════════════════════════════════
  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    let dynamicHeaders: Record<string, string> = {};
    if (this.requestInterceptor) {
      try {
        dynamicHeaders = await this.requestInterceptor();
      } catch (e) {
        this.logger.warn('requestInterceptor threw — request proceeds without dynamic headers', e);
      }
    }

    const url = new URL(path, this.baseUrl);
    const fetchOptions: RequestInit = {
      ...options,
      headers: {
        ...this.headers,
        ...options.headers,
        ...dynamicHeaders,
      },
    };

    if (this.withCredentials) {
      fetchOptions.credentials = 'include';
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    fetchOptions.signal = controller.signal as AbortSignal;

    try {
      const res = await fetch(url.toString(), fetchOptions);
      clearTimeout(timeoutId);

      if (!res.ok) {
        let errorData;
        try {
          errorData = await res.json();
        } catch {
          // ignore
        }
        throw new FetchError(`HTTP Error: ${res.status} ${res.statusText}`, res.status, errorData);
      }

      if (res.status === 204) {
        return null as unknown as T;
      }
      return await res.json() as T;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new FetchError(`Request timeout after ${this.timeout}ms`);
      }
      throw error;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STREAMING & EDGE MANAGERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Start or resume the SSE streaming connection.
   */
  startStreaming(): void {
    this.assertNotDisposed();
    if (!this.streamingConfig) {
      this.logger.warn('Streaming was not configured. Pass streaming: true in client config.');
      return;
    }
    this.ensureStreaming().catch(e => this.logger.error('Failed to initialize streaming', e));
  }

  /**
   * Stop the SSE streaming connection.
   */
  stopStreaming(): void {
    this.streamClient?.disconnect();
  }

  /**
   * Fetch a full FlagDocument from the API to initialize Edge Evaluation mode.
   * If streaming is enabled, updates will auto-refresh the document.
   */
  async loadEdgeDocument(): Promise<void> {
    this.assertNotDisposed();
    const doc = await this.fetchWithResiliency(async () => {
      return await this.request<FlagDocument>('/feature-flags/document');
    });

    this.edgeDocumentConfig = doc;

    const evaluator = await this.getEdgeEvaluator();
    evaluator.updateDocument(doc);
    this.logger.info('Edge document loaded. Client is now in offline evaluation mode.');
  }

  private async refreshEdgeDocument(): Promise<void> {
    if (!this.edgeEvaluator) return;
    try {
      const doc = await this.request<FlagDocument>('/feature-flags/document');
      this.edgeEvaluator.updateDocument(doc);
      this.logger.debug('Edge document refreshed from stream trigger');
    } catch (e) {
      this.logger.error('Failed to refresh edge document', e);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EVENT SYSTEM
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Subscribe to SDK events.
   * @returns Unsubscribe function
   */
  on<E extends FeatureFlyEvent>(event: E, handler: EventHandler<E>): () => void {
    return this.events.on(event, handler);
  }

  /**
   * Subscribe to an event once.
   */
  once<E extends FeatureFlyEvent>(event: E, handler: EventHandler<E>): () => void {
    return this.events.once(event, handler);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CACHE ACCESS (for framework integrations)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Synchronously read a cached flag value without triggering evaluation.
   * Returns `undefined` if the flag is not in cache.
   * Useful for React/Vue hooks to avoid loading states when `bootstrapFlags` was provided.
   */
  getCachedFlag<T extends FlagValue>(slug: string, context?: EvaluationContext): T | undefined {
    const cacheKey = this.buildCacheKey('evaluate', slug, context);
    const cached = this.cache.get<T>(cacheKey);
    return cached.hit ? cached.value : undefined;
  }

  /**
   * Synchronously read all cached batch-evaluated flags.
   * Returns `undefined` if no batch evaluation has been cached.
   */
  getCachedFlags(context?: EvaluationContext): Record<string, FlagValue> | undefined {
    const cacheKey = this.buildCacheKey('batch-evaluate', undefined, context);
    const cached = this.cache.get<Record<string, FlagValue>>(cacheKey);
    return cached.hit ? cached.value : undefined;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FLAG EVALUATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Evaluate a single flag. Returns the flag value.
   *
   * Resolution order:
   * 1. Local overrides (dev/testing)
   * 2. Edge evaluation (if edgeDocument configured)
   * 3. Cache hit
   * 4. Remote API call
   * 5. Fallback defaults
   */
  async evaluateFlag<T extends FlagValue>(
    slug: string,
    defaultValue: T,
    context?: EvaluationContext,
  ): Promise<T> {
    this.assertNotDisposed();
    const start = Date.now();

    // 1. Local overrides always skip HTTP & Edge processing
    if (slug in this.localOverrides) {
      const value = this.localOverrides[slug] as T;
      this.logger.debug(`Flag "${slug}" resolved from local override: ${String(value)}`);
      this.emitEvaluated(slug, value, 'LOCAL_OVERRIDE', start);
      return value;
    }

    // 2. Edge Evaluation (zero HTTP, done purely in memory) - LAZY
    if (this.edgeDocumentConfig || this.edgeEvaluator) {
      const evaluator = await this.getEdgeEvaluator();
      const { value, reason } = evaluator.evaluate(slug, context || {}, this.localOverrides) as { value: T; reason: string };
      this.detectChange(slug, value);
      this.emitEvaluated(slug, value, reason, start);
      return value as unknown as T;
    }

    // 3. Cache hit (Remote Evaluation mode)
    const cacheKey = this.buildCacheKey('evaluate', slug, context);
    const cached = this.cache.get<T>(cacheKey);
    if (cached.hit) {
      this.logger.debug(`Flag "${slug}" resolved from cache: ${String(cached.value)}`);
      this.events.emit('cacheHit', { key: cacheKey });
      this.emitEvaluated(slug, cached.value, 'CACHE_HIT', start);
      return cached.value;
    }

    this.events.emit('cacheMiss', { key: cacheKey });

    // 4. Remote call
    try {
      const value = await this.fetchWithResiliency<T>(async () => {
        let path = `/feature-flags/${slug}/evaluate`;
        if (context) {
          const searchParams = new URLSearchParams();
          if (context.workspaceId) searchParams.append('workspaceId', context.workspaceId);
          if (context.userId) searchParams.append('userId', context.userId);
          if (context.attributes) {
            for (const [k, v] of Object.entries(context.attributes)) {
              searchParams.append(`attributes[${k}]`, String(v));
            }
          }
          const qs = searchParams.toString();
          if (qs) path += `?${qs}`;
        }
        
        const response = await this.request<{ value: T }>(path);
        return response.value;
      });

      this.cache.set(cacheKey, value);
      this.detectChange(slug, value);
      this.emitEvaluated(slug, value, 'DEFAULT', start);
      return value;
    } catch (error) {
      // 5. Fallback
      if (slug in this.fallbackDefaults) {
        const value = this.fallbackDefaults[slug] as T;
        this.logger.warn(`Flag "${slug}" using fallback default: ${String(value)}`);
        this.emitEvaluated(slug, value, 'FALLBACK', start);
        return value;
      }

      this.logger.error(`Flag "${slug}" evaluation failed, using provided default`, error);
      this.emitEvaluated(slug, defaultValue, 'ERROR', start);
      return defaultValue;
    }
  }

  /**
   * Evaluate all flags in a single batch request.
   */
  async evaluateAllFlags(context?: EvaluationContext): Promise<Record<string, FlagValue>> {
    this.assertNotDisposed();

    // 1. Edge Evaluation Batch - LAZY
    if (this.edgeDocumentConfig || this.edgeEvaluator) {
      const evaluator = await this.getEdgeEvaluator();
      return evaluator.evaluateAll(context || {}, this.localOverrides);
    }

    // 2. Remote Evaluation
    const cacheKey = this.buildCacheKey('batch-evaluate', undefined, context);

    const cached = this.cache.get<Record<string, FlagValue>>(cacheKey);
    if (cached.hit) {
      this.events.emit('cacheHit', { key: cacheKey });
      return cached.value;
    }

    this.events.emit('cacheMiss', { key: cacheKey });

    try {
      const result = await this.fetchWithResiliency(async () => {
        let path = '/feature-flags/batch/evaluate';
        if (context) {
          const searchParams = new URLSearchParams();
          if (context.workspaceId) searchParams.append('workspaceId', context.workspaceId);
          if (context.userId) searchParams.append('userId', context.userId);
          if (context.attributes) {
            for (const [k, v] of Object.entries(context.attributes)) {
              searchParams.append(`attributes[${k}]`, String(v));
            }
          }
          const qs = searchParams.toString();
          if (qs) path += `?${qs}`;
        }
        
        return await this.request<Record<string, FlagValue>>(path);
      });

      // Merge local overrides on top
      const merged = { ...result, ...this.localOverrides };
      this.cache.set(cacheKey, merged);
      return merged;
    } catch (error) {
      this.logger.error('Batch evaluation failed, returning fallback defaults', error);
      return { ...this.fallbackDefaults, ...this.localOverrides };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FLAG MANAGEMENT (CRUD)
  // ═══════════════════════════════════════════════════════════════════════════

  async createFlag(data: CreateFlagData): Promise<FeatureFlag> {
    this.assertNotDisposed();
    const result = await this.fetchWithResiliency(
      () => this.request<FeatureFlag>('/feature-flags', {
        method: 'POST',
        body: JSON.stringify(data)
      }),
    );
    this.cache.clear();
    this.events.emit('cacheCleared', undefined as never);
    return result;
  }

  async getAllFlags(): Promise<FeatureFlag[]> {
    this.assertNotDisposed();
    const cacheKey = 'all-flags';
    const cached = this.cache.get<FeatureFlag[]>(cacheKey);
    if (cached.hit) return cached.value;

    const result = await this.fetchWithResiliency(
      () => this.request<FeatureFlag[]>('/feature-flags'),
    );
    this.cache.set(cacheKey, result);
    return result;
  }

  async getFlagById(id: string): Promise<FeatureFlag | null> {
    this.assertNotDisposed();
    const cacheKey = `flag-${id}`;
    const cached = this.cache.get<FeatureFlag>(cacheKey);
    if (cached.hit) return cached.value;

    try {
      const result = await this.fetchWithResiliency(
        () => this.request<FeatureFlag>(`/feature-flags/${id}`),
      );
      this.cache.set(cacheKey, result);
      return result;
    } catch (error: unknown) {
      if (error instanceof FetchError && error.response?.status === 404) return null;
      throw error;
    }
  }

  async getFlagBySlug(slug: string): Promise<FeatureFlag | null> {
    this.assertNotDisposed();
    const cacheKey = `flag-slug-${slug}`;
    const cached = this.cache.get<FeatureFlag>(cacheKey);
    if (cached.hit) return cached.value;

    try {
      const result = await this.fetchWithResiliency(
        () => this.request<FeatureFlag>(`/feature-flags/slug/${slug}`),
      );
      this.cache.set(cacheKey, result);
      return result;
    } catch (error: unknown) {
      if (error instanceof FetchError && error.response?.status === 404) return null;
      throw error;
    }
  }

  async updateFlag(id: string, data: UpdateFlagData): Promise<FeatureFlag> {
    this.assertNotDisposed();
    const result = await this.fetchWithResiliency(
      () => this.request<FeatureFlag>(`/feature-flags/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data)
      }),
    );
    this.cache.clear();
    this.events.emit('cacheCleared', undefined as never);
    return result;
  }

  async deleteFlag(id: string): Promise<void> {
    this.assertNotDisposed();
    await this.fetchWithResiliency(() => this.request(`/feature-flags/${id}`, { method: 'DELETE' }));
    this.cache.clear();
    this.events.emit('cacheCleared', undefined as never);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WORKSPACE FLAGS
  // ═══════════════════════════════════════════════════════════════════════════

  async setWorkspaceFlag(slug: string, workspaceId: string, value: FlagValue): Promise<WorkspaceFeatureFlag> {
    this.assertNotDisposed();
    const data: SetWorkspaceFlagData = { value };
    const result = await this.fetchWithResiliency(
      () => this.request<WorkspaceFeatureFlag>(`/feature-flags/${slug}/workspaces/${workspaceId}`, {
        method: 'POST',
        body: JSON.stringify(data)
      }),
    );

    // Invalidate relevant cache entries
    this.cache.delete(this.buildCacheKey('evaluate', slug, { workspaceId }));
    this.cache.delete(this.buildCacheKey('batch-evaluate', undefined, { workspaceId }));
    this.cache.delete(`workspace-flags-${workspaceId}`);

    return result;
  }

  async removeWorkspaceFlag(slug: string, workspaceId: string): Promise<void> {
    this.assertNotDisposed();
    await this.fetchWithResiliency(
      () => this.request(`/feature-flags/${slug}/workspaces/${workspaceId}`, { method: 'DELETE' }),
    );

    this.cache.delete(this.buildCacheKey('evaluate', slug, { workspaceId }));
    this.cache.delete(this.buildCacheKey('batch-evaluate', undefined, { workspaceId }));
    this.cache.delete(`workspace-flags-${workspaceId}`);
  }

  async getWorkspaceFlags(workspaceId: string): Promise<WorkspaceFeatureFlag[]> {
    this.assertNotDisposed();
    const cacheKey = `workspace-flags-${workspaceId}`;
    const cached = this.cache.get<WorkspaceFeatureFlag[]>(cacheKey);
    if (cached.hit) return cached.value;

    const result = await this.fetchWithResiliency(
      () => this.request<WorkspaceFeatureFlag[]>(`/feature-flags/workspaces/${workspaceId}/flags`),
    );
    this.cache.set(cacheKey, result);
    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ANALYTICS
  // ═══════════════════════════════════════════════════════════════════════════

  async getFlagStats(): Promise<FeatureFlagStats> {
    this.assertNotDisposed();
    const cacheKey = 'flag-stats';
    const cached = this.cache.get<FeatureFlagStats>(cacheKey);
    if (cached.hit) return cached.value;

    const result = await this.fetchWithResiliency(
      () => this.request<FeatureFlagStats>('/feature-flags/stats/overview'),
    );
    this.cache.set(cacheKey, result);
    return result;
  }

  async getFlagsByCategory(category: 'frontend' | 'backend' | 'both'): Promise<FeatureFlag[]> {
    this.assertNotDisposed();
    const cacheKey = `flags-by-category-${category}`;
    const cached = this.cache.get<FeatureFlag[]>(cacheKey);
    if (cached.hit) return cached.value;

    const result = await this.fetchWithResiliency(
      () => this.request<FeatureFlag[]>(`/feature-flags/category/${category}`),
    );
    this.cache.set(cacheKey, result);
    return result;
  }

  async getFlagsByTargetService(serviceName: string): Promise<FeatureFlag[]> {
    this.assertNotDisposed();
    const cacheKey = `flags-by-service-${serviceName}`;
    const cached = this.cache.get<FeatureFlag[]>(cacheKey);
    if (cached.hit) return cached.value;

    const result = await this.fetchWithResiliency(
      () => this.request<FeatureFlag[]>(`/feature-flags/service/${serviceName}`),
    );
    this.cache.set(cacheKey, result);
    return result;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LOCAL OVERRIDES (dev/testing)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Set a local override for a flag. Overrides skip HTTP entirely.
   * Useful for development and testing.
   */
  setLocalOverride(slug: string, value: FlagValue): void {
    this.localOverrides[slug] = value;
    this.logger.debug(`Local override set: "${slug}" = ${String(value)}`);
  }

  /**
   * Remove a local override.
   */
  removeLocalOverride(slug: string): void {
    delete this.localOverrides[slug];
    this.logger.debug(`Local override removed: "${slug}"`);
  }

  /**
   * Get all local overrides.
   */
  getLocalOverrides(): Record<string, FlagValue> {
    return { ...this.localOverrides };
  }

  /**
   * Clear all local overrides.
   */
  clearLocalOverrides(): void {
    Object.keys(this.localOverrides).forEach((key) => delete this.localOverrides[key]);
    this.logger.debug('All local overrides cleared');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // UTILITY
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Clear all cached data.
   */
  clearCache(): void {
    this.cache.clear();
    this.events.emit('cacheCleared', undefined as never);
    this.logger.debug('Cache cleared');
  }

  /**
   * Get cache statistics.
   */
  getCacheStats(): { size: number; keys: string[]; enabled: boolean } {
    return this.cache.getStats();
  }

  /**
   * Get current circuit breaker state.
   */
  getCircuitBreakerState(): { state: string; failures: number } {
    return {
      state: this.circuitBreaker.getState(),
      failures: this.circuitBreaker.getFailures(),
    };
  }

  /**
   * Reset the circuit breaker to closed state.
   */
  resetCircuitBreaker(): void {
    this.circuitBreaker.reset();
    this.logger.info('Circuit breaker manually reset');
  }

  /**
   * Check if the client has been disposed.
   */
  isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Get a snapshot of all collected impact metrics.
   * Includes per-flag evaluation counts, cache hit rates, latency percentiles,
   * and experiment exposure counts.
   */
  async getImpactMetrics(): Promise<MetricsSnapshot | null> {
    if (!this.metrics) {
      return null;
    }
    const m = await this.getMetrics();
    return m.getSnapshot() as MetricsSnapshot;
  }

  /**
   * Reset all collected impact metrics counters.
   */
  async resetMetrics(): Promise<void> {
    if (!this.metrics) return;
    const m = await this.getMetrics();
    m.reset();
  }

  /**
   * Dispose the client, releasing all resources (timers, listeners, metrics).
   * After calling dispose, the client cannot be used again.
   */
  dispose(): void {
    this.disposed = true;
    this.cache.destroy();
    this.metrics?.destroy();
    this.streamClient?.dispose();
    this.events.removeAllListeners();
    this.previousValues.clear();
    this.logger.debug('Client disposed');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // INTERNALS
  // ═══════════════════════════════════════════════════════════════════════════

  private async fetchWithResiliency<T>(fn: () => Promise<T>): Promise<T> {
    return this.circuitBreaker.execute(() =>
      withRetry(
        fn,
        this.retryConfig,
        this.logger,
        (attempt, error) => {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.events.emit('requestFailed', {
            endpoint: 'unknown',
            error: errorMessage,
            attempt,
          });
        },
      ),
    );
  }

  private buildCacheKey(prefix: string, slug?: string, context?: EvaluationContext): string {
    const parts = [prefix];
    if (slug) parts.push(slug);
    if (context?.workspaceId) parts.push(`w:${context.workspaceId}`);
    if (context?.userId) parts.push(`u:${context.userId}`);
    if (context?.attributes) {
      parts.push(stableStringify(context.attributes));
    }
    return parts.join(':');
  }

  private detectChange(slug: string, newValue: FlagValue): void {
    const previousValue = this.previousValues.get(slug);
    if (previousValue !== undefined && previousValue !== newValue) {
      this.events.emit('flagChanged', {
        slug,
        previousValue,
        newValue,
      });
    }
    this.previousValues.set(slug, newValue);
  }

  private emitEvaluated(slug: string, value: FlagValue, reason: EvaluationReason | string, startTime: number): void {
    this.events.emit('flagEvaluated', {
      slug,
      value,
      reason: reason as EvaluationReason,
      durationMs: Date.now() - startTime,
    });
  }

  private assertNotDisposed(): void {
    if (this.disposed) {
      throw new Error('FeatureFlagsClient has been disposed. Create a new instance.');
    }
  }
}
