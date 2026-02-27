import { StreamingConfig, ILogger } from './types';
import { EventEmitter } from './event-emitter';

/**
 * Server-Sent Events (SSE) client for real-time feature flag updates.
 */
export class FlagStreamClient {
  private eventSource: EventSource | null = null;
  private readonly config: StreamingConfig;
  private readonly logger: ILogger;
  private readonly events: EventEmitter;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string | undefined,
    config: StreamingConfig,
    logger: ILogger,
    events: EventEmitter
  ) {
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
   */
  connect(): void {
    if (this.disposed) return;
    if (this.eventSource) return; // Already connected

    const url = this.config.url || `${this.baseUrl}/feature-flags/stream`;
    
    try {
      // In browser or Node with EventSource polyfill
      if (typeof EventSource !== 'undefined') {
        const urlWithAuth = this.apiKey ? `${url}?apiKey=${this.apiKey}` : url;
        
        this.eventSource = new EventSource(urlWithAuth);
        
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
      
      // Invalidate cache natively inside the client via events
      this.events.emit('flagsUpdated', { source: 'stream', count: 1 });
    } catch (e) {
      this.logger.error('Failed to parse SSE message', event.data);
    }
  };

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
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
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
