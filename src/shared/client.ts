import axios, { AxiosInstance, AxiosResponse } from 'axios';
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
import { FlagStreamClient } from './streaming';
import { EdgeEvaluator } from './edge-evaluator';
import { ImpactMetrics, MetricsSnapshot } from './metrics';

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
 * const isEnabled = await client.evaluateFlag('new-feature', { workspaceId: '123' });
 * ```
 */
export class FeatureFlagsClient {
  private readonly http: AxiosInstance;
  private readonly cache: InMemoryCache;
  private readonly circuitBreaker: CircuitBreaker;
  private readonly events: EventEmitter;
  private readonly logger: ILogger;
  private readonly retryConfig: RetryConfig;
  private readonly localOverrides: Record<string, FlagValue>;
  private readonly fallbackDefaults: Record<string, FlagValue>;
  private readonly previousValues = new Map<string, FlagValue>();
  private streamClient?: FlagStreamClient;
  private edgeEvaluator?: EdgeEvaluator;
  private readonly metrics: ImpactMetrics;
  private disposed = false;

  constructor(config: FeatureFlagsConfig) {
    // Logger
    this.logger = config.logger ?? new ConsoleLogger(config.logLevel ?? 'warn');

    // Cache
    const cacheTtl = config.cacheEnabled === false ? 0 : (config.cacheTtlMs ?? DEFAULT_CACHE_TTL);
    this.cache = new InMemoryCache(cacheTtl);

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

    // HTTP client
    this.http = axios.create({
      baseURL: config.baseUrl,
      timeout: config.timeout ?? DEFAULT_TIMEOUT,
      withCredentials: config.withCredentials ?? false,
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey && { Authorization: `Bearer ${config.apiKey}` }),
        ...config.headers,
      },
    });

    // Request interceptor for dynamic headers (e.g. JWT tokens that rotate)
    if (config.requestInterceptor) {
      const interceptor = config.requestInterceptor;
      this.http.interceptors.request.use(async (reqConfig) => {
        try {
          const dynamicHeaders = await interceptor();
          Object.assign(reqConfig.headers, dynamicHeaders);
        } catch (e) {
          this.logger.warn('requestInterceptor threw — request proceeds without dynamic headers', e);
        }
        return reqConfig;
      });
    }

    // Edge Evaluator Initialization
    if (config.edgeDocument) {
      this.edgeEvaluator = new EdgeEvaluator(
        config.edgeDocument,
        this.fallbackDefaults,
        config.trackingCallback
      );
      this.logger.info('Edge evaluator initialized from provided document');
    }

    // Streaming Initialization
    if (config.streaming) {
      const streamConfig = typeof config.streaming === 'object' ? config.streaming : {};
      this.streamClient = new FlagStreamClient(
        config.baseUrl,
        config.apiKey,
        streamConfig,
        this.logger,
        this.events
      );
      
      // Auto-connect stream on boot
      this.streamClient.connect();
      
      // When stream notifies of updates, we should refresh the edge document if in edge mode
      // or simply clear the cache if in remote mode
      this.events.on('flagsUpdated', () => {
        if (this.edgeEvaluator) {
          this.refreshEdgeDocument().catch(e => this.logger.error('Failed to refresh edge doc on stream update', e));
        } else {
          this.cache.clear();
        }
      });
    }

    // Impact Metrics
    this.metrics = new ImpactMetrics(this.events);

    this.logger.debug(`Initialized with baseUrl=${config.baseUrl}, cache=${cacheTtl}ms, retry=${this.retryConfig.maxAttempts}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STREAMING & EDGE MANAGERS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Start or resume the SSE streaming connection.
   */
  startStreaming(): void {
    this.assertNotDisposed();
    if (!this.streamClient) {
      this.logger.warn('Streaming was not configured. Use startStreaming(config) to enable it.');
      return;
    }
    this.streamClient.connect();
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
      const response = await this.http.get<FlagDocument>('/feature-flags/document');
      return response.data;
    });
    
    if (this.edgeEvaluator) {
      this.edgeEvaluator.updateDocument(doc);
    } else {
      this.edgeEvaluator = new EdgeEvaluator(doc, this.fallbackDefaults);
    }
    this.logger.info('Edge document loaded. Client is now in offline evaluation mode.');
  }

  private async refreshEdgeDocument(): Promise<void> {
    if (!this.edgeEvaluator) return;
    try {
      const response = await this.http.get<FlagDocument>('/feature-flags/document');
      this.edgeEvaluator.updateDocument(response.data);
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
  // FLAG EVALUATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Evaluate a single flag. Returns the flag value.
   *
   * Resolution order:
   * 1. Local overrides (dev/testing)
   * 2. Cache hit
   * 3. Remote API call
   * 4. Fallback defaults
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

    // 2. Edge Evaluation (zero HTTP, done purely in memory)
    if (this.edgeEvaluator) {
      const { value, reason } = this.edgeEvaluator.evaluate<T>(slug, context || {}, this.localOverrides);
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
        const params = context ?? {};
        const response: AxiosResponse<{ value: T }> = await this.http.get(
          `/feature-flags/${slug}/evaluate`,
          { params },
        );
        return response.data.value;
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

    // 1. Edge Evaluation Batch
    if (this.edgeEvaluator) {
      return this.edgeEvaluator.evaluateAll(context || {}, this.localOverrides);
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
        const params = context ?? {};
        const response: AxiosResponse<Record<string, FlagValue>> = await this.http.get(
          '/feature-flags/batch/evaluate',
          { params },
        );
        return response.data;
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
    const response: AxiosResponse<FeatureFlag> = await this.fetchWithResiliency(
      () => this.http.post('/feature-flags', data),
    );
    this.cache.clear();
    this.events.emit('cacheCleared', undefined as never);
    return response.data;
  }

  async getAllFlags(): Promise<FeatureFlag[]> {
    this.assertNotDisposed();
    const cacheKey = 'all-flags';
    const cached = this.cache.get<FeatureFlag[]>(cacheKey);
    if (cached.hit) return cached.value;

    const response: AxiosResponse<FeatureFlag[]> = await this.fetchWithResiliency(
      () => this.http.get('/feature-flags'),
    );
    this.cache.set(cacheKey, response.data);
    return response.data;
  }

  async getFlagById(id: string): Promise<FeatureFlag | null> {
    this.assertNotDisposed();
    const cacheKey = `flag-${id}`;
    const cached = this.cache.get<FeatureFlag>(cacheKey);
    if (cached.hit) return cached.value;

    try {
      const response: AxiosResponse<FeatureFlag> = await this.fetchWithResiliency(
        () => this.http.get(`/feature-flags/${id}`),
      );
      this.cache.set(cacheKey, response.data);
      return response.data;
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response?.status === 404) return null;
      throw error;
    }
  }

  async getFlagBySlug(slug: string): Promise<FeatureFlag | null> {
    this.assertNotDisposed();
    const cacheKey = `flag-slug-${slug}`;
    const cached = this.cache.get<FeatureFlag>(cacheKey);
    if (cached.hit) return cached.value;

    try {
      const response: AxiosResponse<FeatureFlag> = await this.fetchWithResiliency(
        () => this.http.get(`/feature-flags/slug/${slug}`),
      );
      this.cache.set(cacheKey, response.data);
      return response.data;
    } catch (error: unknown) {
      if (axios.isAxiosError(error) && error.response?.status === 404) return null;
      throw error;
    }
  }

  async updateFlag(id: string, data: UpdateFlagData): Promise<FeatureFlag> {
    this.assertNotDisposed();
    const response: AxiosResponse<FeatureFlag> = await this.fetchWithResiliency(
      () => this.http.patch(`/feature-flags/${id}`, data),
    );
    this.cache.clear();
    this.events.emit('cacheCleared', undefined as never);
    return response.data;
  }

  async deleteFlag(id: string): Promise<void> {
    this.assertNotDisposed();
    await this.fetchWithResiliency(() => this.http.delete(`/feature-flags/${id}`));
    this.cache.clear();
    this.events.emit('cacheCleared', undefined as never);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // WORKSPACE FLAGS
  // ═══════════════════════════════════════════════════════════════════════════

  async setWorkspaceFlag(slug: string, workspaceId: string, value: FlagValue): Promise<WorkspaceFeatureFlag> {
    this.assertNotDisposed();
    const data: SetWorkspaceFlagData = { value };
    const response: AxiosResponse<WorkspaceFeatureFlag> = await this.fetchWithResiliency(
      () => this.http.post(`/feature-flags/${slug}/workspaces/${workspaceId}`, data),
    );

    // Invalidate relevant cache entries
    this.cache.delete(this.buildCacheKey('evaluate', slug, { workspaceId }));
    this.cache.delete(this.buildCacheKey('batch-evaluate', undefined, { workspaceId }));
    this.cache.delete(`workspace-flags-${workspaceId}`);

    return response.data;
  }

  async removeWorkspaceFlag(slug: string, workspaceId: string): Promise<void> {
    this.assertNotDisposed();
    await this.fetchWithResiliency(
      () => this.http.delete(`/feature-flags/${slug}/workspaces/${workspaceId}`),
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

    const response: AxiosResponse<WorkspaceFeatureFlag[]> = await this.fetchWithResiliency(
      () => this.http.get(`/feature-flags/workspaces/${workspaceId}/flags`),
    );
    this.cache.set(cacheKey, response.data);
    return response.data;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ANALYTICS
  // ═══════════════════════════════════════════════════════════════════════════

  async getFlagStats(): Promise<FeatureFlagStats> {
    this.assertNotDisposed();
    const cacheKey = 'flag-stats';
    const cached = this.cache.get<FeatureFlagStats>(cacheKey);
    if (cached.hit) return cached.value;

    const response: AxiosResponse<FeatureFlagStats> = await this.fetchWithResiliency(
      () => this.http.get('/feature-flags/stats/overview'),
    );
    this.cache.set(cacheKey, response.data);
    return response.data;
  }

  async getFlagsByCategory(category: 'frontend' | 'backend' | 'both'): Promise<FeatureFlag[]> {
    this.assertNotDisposed();
    const cacheKey = `flags-by-category-${category}`;
    const cached = this.cache.get<FeatureFlag[]>(cacheKey);
    if (cached.hit) return cached.value;

    const response: AxiosResponse<FeatureFlag[]> = await this.fetchWithResiliency(
      () => this.http.get(`/feature-flags/category/${category}`),
    );
    this.cache.set(cacheKey, response.data);
    return response.data;
  }

  async getFlagsByTargetService(serviceName: string): Promise<FeatureFlag[]> {
    this.assertNotDisposed();
    const cacheKey = `flags-by-service-${serviceName}`;
    const cached = this.cache.get<FeatureFlag[]>(cacheKey);
    if (cached.hit) return cached.value;

    const response: AxiosResponse<FeatureFlag[]> = await this.fetchWithResiliency(
      () => this.http.get(`/feature-flags/service/${serviceName}`),
    );
    this.cache.set(cacheKey, response.data);
    return response.data;
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
  getImpactMetrics(): MetricsSnapshot {
    return this.metrics.getSnapshot();
  }

  /**
   * Reset all collected impact metrics counters.
   */
  resetMetrics(): void {
    this.metrics.reset();
  }

  /**
   * Dispose the client, releasing all resources (timers, listeners, metrics).
   * After calling dispose, the client cannot be used again.
   */
  dispose(): void {
    this.disposed = true;
    this.cache.destroy();
    this.metrics.destroy();
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
      const sorted = Object.keys(context.attributes).sort();
      for (const k of sorted) {
        parts.push(`${k}:${context.attributes[k]}`);
      }
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
