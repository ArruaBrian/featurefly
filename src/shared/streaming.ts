import { StreamingConfig, ILogger } from './types';
import { EventEmitter } from './event-emitter';
import { SSEClient } from './sse-client';

/**
 * Server-Sent Events (SSE) client for real-time feature flag updates.
 * Uses fetch-based SSE when apiKey is present (secure), falls back to
 * native EventSource when no apiKey (performance).
 */
export class FlagStreamClient {
  private eventSource: EventSource | null = null;
  private sseClient: SSEClient | null = null;
  private readonly config: StreamingConfig;
  private readonly logger: ILogger;
  private readonly events: EventEmitter;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private lastEventId: string | undefined;
  /** Tracks the last document version received to detect gaps */
  private lastReceivedVersion: number | undefined;
  private apiKey: string | undefined;

  constructor(
    private readonly baseUrl: string,
    apiKey: string | undefined,
    config: StreamingConfig,
    logger: ILogger,
    events: EventEmitter
  ) {
    const safeApiKey = apiKey?.trim() || undefined;
    this.apiKey = safeApiKey;
    this.config = {
      reconnectDelayMs: 1000,
      maxReconnectDelayMs: 30000,
      ...config,
    };
    this.logger = logger;
    this.events = events;
  }

  /**
   * Connect to the SSE endpoint.
   * Uses SSEClient (fetch-based) when apiKey is present for secure auth.
   * Falls back to native EventSource when no apiKey for better performance.
   */
  connect(): void {
    if (this.disposed) return;
    if (this.eventSource || this.sseClient) return; // Already connected

    const url = this.config.url || `${this.baseUrl}/feature-flags/stream`;

    // Use secure fetch-based SSE when apiKey is provided
    if (this.apiKey) {
      this.connectWithFetch(url);
    } else {
      this.connectWithEventSource(url);
    }
  }

  /**
   * Connect using fetch-based SSE client (secure, supports custom headers).
   * Used when apiKey is present to avoid sending credentials in URL.
   */
  private connectWithFetch(url: string): void {
    try {
      this.sseClient = new SSEClient({
        url,
        apiKey: this.apiKey,
        lastEventId: this.lastEventId,
        logger: this.logger,
        events: this.events,
        onEventId: (id) => {
          this.lastEventId = id;
        },
        onError: (error) => {
          // Check if it's a 401 by examining error message
          if (error.message.includes('Unauthorized') || error.message.includes('401')) {
            // Terminal error - do not reconnect
            this.logger.error('Stream authentication failed, not retrying');
            this.events.emit('streamDisconnected', { error });
            return;
          }
          this.scheduleReconnect();
        },
      });

      this.sseClient.connect();
    } catch (error) {
      this.logger.error('Failed to initialize SSE client:', error);
      this.scheduleReconnect();
    }
  }

  /**
   * Connect using native EventSource.
   * Used when no apiKey is present for better performance.
   */
  private connectWithEventSource(url: string): void {
    try {
      // In browser or Node with EventSource polyfill
      if (typeof EventSource !== 'undefined') {
        this.eventSource = new EventSource(url);

        this.eventSource.onopen = () => {
          this.logger.info(`Stream connected to ${url}`);
          this.reconnectAttempts = 0; // Reset backoff
          this.events.emit('streamConnected', undefined as unknown as void);
        };

        this.eventSource.onerror = (err) => {
          this.logger.warn(`Stream error, reconnecting...`, err);
          this.scheduleReconnect();
        };

        // Listen for specific SSE events (requires type assertion due to DOM lib typings missing in some envs)
        /* eslint-disable @typescript-eslint/no-explicit-any */
        this.eventSource.addEventListener('flag.updated', this.handleUpdateEvent as any);
        this.eventSource.addEventListener('flag.created', this.handleUpdateEvent as any);
        this.eventSource.addEventListener('flag.deleted', this.handleUpdateEvent as any);
        this.eventSource.addEventListener('message', this.handleUpdateEvent as any); // Fallback generic message
        /* eslint-enable @typescript-eslint/no-explicit-any */
      } else {
        this.logger.warn('EventSource is not available in this environment, streaming disabled.');
      }
    } catch (error) {
      this.logger.error('Failed to initialize EventSource:', error);
      this.scheduleReconnect();
    }
  }

  private handleUpdateEvent = (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      this.logger.debug('Received stream update', data);

      // Extract slugs from SSE message - supports single slug or batch
      const slugs = this.extractSlugsFromMessage(data);

      // Check for version gap (anti-replay)
      const hasVersionGap = this.checkVersionGap(data);

      // Invalidate cache natively inside the client via events
      this.events.emit('flagsUpdated', { source: 'stream', slugs, count: slugs?.length ?? 0, hasVersionGap });
    } catch (e) {
      this.logger.error('Failed to parse SSE message', event.data);
    }
  };

  /**
   * Check if the document version has a gap indicating lost events.
   * Returns true if a gap was detected (events were lost), false otherwise.
   */
  private checkVersionGap(data: unknown): boolean {
    if (!data || typeof data !== 'object') {
      return false;
    }

    const record = data as Record<string, unknown>;

    // Events may carry document version for gap detection
    if (typeof record.version === 'number') {
      const incomingVersion = record.version;

      if (this.lastReceivedVersion !== undefined) {
        // If version jumps by more than 1, we missed events
        if (incomingVersion > this.lastReceivedVersion + 1) {
          this.logger.warn(`Version gap detected: last=${this.lastReceivedVersion}, incoming=${incomingVersion}`);
          this.lastReceivedVersion = incomingVersion;
          return true;
        }
      }

      this.lastReceivedVersion = incomingVersion;
    }

    return false;
  }

  /**
   * Extract slugs from SSE message data.
   * Supports formats:
   * - { slug: 'checkout-v2', action: 'updated' } → ['checkout-v2']
   * - { slugs: ['a', 'b'], action: 'batch' } → ['a', 'b']
   * - Legacy messages without slug → undefined (triggers full cache clear)
   */
  private extractSlugsFromMessage(data: unknown): string[] | undefined {
    if (!data || typeof data !== 'object') {
      return undefined;
    }

    const record = data as Record<string, unknown>;

    // Single slug format: { slug: 'checkout-v2', action: 'updated' }
    if (typeof record.slug === 'string' && record.slug.length > 0) {
      return [record.slug];
    }

    // Batch format: { slugs: ['a', 'b'], action: 'batch' }
    if (Array.isArray(record.slugs) && record.slugs.length > 0) {
      return record.slugs.filter((s): s is string => typeof s === 'string' && s.length > 0);
    }

    // Legacy format without slug info - return undefined for backward compat
    return undefined;
  }

  private scheduleReconnect(): void {
    this.disconnect();
    
    if (this.disposed) return;

    this.reconnectAttempts++;
    const baseDelay = this.config.reconnectDelayMs || 1000;
    const maxDelay = this.config.maxReconnectDelayMs || 30000;
    
    // Exponential backoff with jitter
    const delay = Math.min(baseDelay * Math.pow(2, this.reconnectAttempts), maxDelay);
    const jitter = Math.random() * 1000;
    const actualDelay = delay + jitter;

    this.logger.info(`Scheduling stream reconnect in ${Math.round(actualDelay)}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, actualDelay);
  }

  /**
   * Disconnect the stream. Automatically reconnects won't trigger unless connect() is called again.
   */
  disconnect(): void {
    // Clean up EventSource if used
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
      this.events.emit('streamDisconnected', { error: undefined });
      this.logger.info('Stream disconnected');
    }

    // Clean up SSE client if used
    if (this.sseClient) {
      this.sseClient.abort();
      this.sseClient = null;
      this.events.emit('streamDisconnected', { error: undefined });
      this.logger.info('Stream disconnected');
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Checks if the stream is currently connected.
   */
  isConnected(): boolean {
    // If using SSE client, it's connected if it exists (simplified check)
    if (this.sseClient) return true;
    
    // If using EventSource
    if (typeof EventSource === 'undefined') return false;
    return this.eventSource?.readyState === EventSource.OPEN;
  }

  /**
   * Permanently dispose of the stream client.
   */
  dispose(): void {
    this.disposed = true;
    this.disconnect();
  }
}
