import { ILogger } from './types';
import { EventEmitter } from './event-emitter';

/**
 * SSE event types supported by FlagStreamClient
 */
export interface SSEvent {
  type: string;
  data: unknown;
  id?: string;
}

/**
 * Options for creating an SSE client
 */
export interface SSEClientOptions {
  url: string;
  apiKey?: string;
  headers?: Record<string, string>;
  lastEventId?: string;
  logger: ILogger;
  events: EventEmitter;
  onConnected?: () => void;
  onError?: (error: Error) => void;
  onMessage?: (data: unknown) => void;
  /** Called when an SSE event with an id field is received, passing the id value */
  onEventId?: (id: string) => void;
}

/**
 * Result of starting an SSE connection
 */
export interface SSEResult {
  abort: () => void;
}

/**
 * Parses a single SSE message from text
 * Handles multi-line data fields per SSE spec
 */
function parseSSEMessage(lines: string[]): SSEvent | null {
  let type = 'message';
  const data: string[] = [];
  let id: string | undefined;

  for (const line of lines) {
    if (line.startsWith('event:')) {
      type = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      data.push(line.slice(5).trim());
    } else if (line.startsWith('id:')) {
      id = line.slice(3).trim();
    }
  }

  if (data.length === 0) {
    return null;
  }

  return {
    type,
    data: data.join('\n'), // Multi-line data joined with newlines
    id,
  };
}

/**
 * Converts an iterable ReadableStream into an async generator
 */
async function* streamAsyncIterable(
  stream: ReadableStream<Uint8Array>
): AsyncIterable<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        yield decoder.decode(value, { stream: true });
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * SSE Client that uses fetch with ReadableStream for authentication.
 * This avoids sending credentials in the URL.
 */
export class SSEClient {
  private abortController: AbortController | null = null;
  private disposed = false;

  constructor(private readonly options: SSEClientOptions) {}

  /**
   * Start the SSE connection using fetch
   */
  connect(): SSEResult | null {
    if (this.disposed) return null;

    this.abortController = new AbortController();

    const { url, apiKey, headers = {}, lastEventId } = this.options;

    // Build headers
    const requestHeaders: Record<string, string> = {
      Accept: 'text/event-stream',
      'Cache-Control': 'no-cache',
      ...headers,
    };

    // Add auth header if apiKey provided
    if (apiKey) {
      requestHeaders['Authorization'] = `Bearer ${apiKey}`;
    }

    // Add Last-Event-ID for anti-replay if available
    if (lastEventId) {
      requestHeaders['Last-Event-ID'] = lastEventId;
    }

    // Start fetch
    this.startFetch(url, requestHeaders);

    return {
      abort: () => this.abort(),
    };
  }

  private async startFetch(
    url: string,
    headers: Record<string, string>
  ): Promise<void> {
    const { logger, events } = this.options;

    try {
      const response = await fetch(url, {
        headers,
        signal: this.abortController?.signal,
      });

      if (this.disposed || !this.abortController) return;

      if (!response.ok) {
        if (response.status === 401) {
          logger.error('Stream authentication failed (401)');
          events.emit('streamDisconnected', {
            error: new Error('Unauthorized: Invalid or missing API key'),
          });
          // Terminal error — do not reconnect
          return;
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/event-stream')) {
        throw new Error(`Expected text/event-stream, got ${contentType}`);
      }

      logger.info(`Stream connected to ${url}`);
      events.emit('streamConnected', undefined as unknown as void);

      // Process SSE stream
      await this.processStream(response.body!);
    } catch (error) {
      if (this.disposed) return;

      const err = error instanceof Error ? error : new Error(String(error));
      
      // Check if this was an abort (dispose)
      if (err.name === 'AbortError') {
        logger.info('Stream connection aborted');
        return;
      }

      logger.warn(`Stream error: ${err.message}`);
      
      // Let the stream handle reconnection via scheduleReconnect callback
      this.options.onError?.(err);
    }
  }

  private async processStream(
    body: ReadableStream<Uint8Array>
  ): Promise<void> {
    const { onMessage } = this.options;
    let buffer = '';

    for await (const chunk of streamAsyncIterable(body)) {
      if (this.disposed) break;

      buffer += chunk;

      // Process complete lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      // Process each complete SSE message
      const sseEvents: string[] = [];
      for (const line of lines) {
        if (line.trim() === '') {
          // Empty line marks end of message
          if (sseEvents.length > 0) {
            const event = parseSSEMessage(sseEvents);
            if (event) {
              this.handleSSEvent(event, onMessage);
            }
            sseEvents.length = 0;
          }
        } else {
          sseEvents.push(line);
        }
      }
    }
  }

  private handleSSEvent(
    event: SSEvent,
    onMessage?: (data: unknown) => void
  ): void {
    const { logger, events, onEventId } = this.options;

    // Notify the last event id for anti-replay tracking
    if (event.id) {
      onEventId?.(event.id);
    }

    // Handle only flag-related events or generic message
    const relevantTypes = ['flag.updated', 'flag.created', 'flag.deleted', 'message'];
    if (!relevantTypes.includes(event.type)) {
      return;
    }

    try {
      const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
      logger.debug('Received stream update', data);

      // Extract slugs from SSE message - supports single slug or batch
      const slugs = this.extractSlugsFromMessage(data);

      events.emit('flagsUpdated', { source: 'stream', slugs, count: slugs?.length ?? 0 });
      onMessage?.(data);
    } catch {
      logger.error('Failed to parse SSE message', String(event.data));
    }
  }

  /**
   * Extract slugs from SSE message data.
   * Supports formats:
   * - { slug: 'checkout-v2', action: 'updated' } → ['checkout-v2']
   * - { slugs: ['a', 'b'], action: 'batch' } → ['a', 'b']
   * - Legacy messages without slug info → undefined (triggers full cache clear)
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

  /**
   * Abort the current connection
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * Mark as disposed — prevents reconnection
   */
  dispose(): void {
    this.disposed = true;
    this.abort();
  }
}
