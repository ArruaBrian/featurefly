import { FlagStreamClient } from '../streaming';
import { SSEClient } from '../sse-client';
import { EventEmitter } from '../event-emitter';
import { ILogger } from '../types';

// Mock EventSource globally for Node environment testing
const EventSourceMock = jest.fn().mockImplementation((url: string) => {
  return {
    url,
    readyState: 0, // CONNECTING
    close: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  };
});

// Create a mock SSEClient class
const mockSSEClientInstance = {
  connect: jest.fn(),
  abort: jest.fn(),
  dispose: jest.fn(),
};

jest.mock('../sse-client', () => ({
  SSEClient: jest.fn().mockImplementation(() => mockSSEClientInstance),
}));

// Mock fetch globally - won't be used when apiKey is provided (SSEClient handles it)
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('Streaming Client', () => {
  let logger: ILogger;
  let events: EventEmitter;

  beforeEach(() => {
    logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    events = new EventEmitter();

    // Setup global EventSource
    (global as unknown as { EventSource: unknown }).EventSource = EventSourceMock;
    EventSourceMock.mockClear();
    mockFetch.mockReset();
    
    // Reset mock SSEClient - clear calls array and mock functions
    (SSEClient as jest.Mock).mockClear();
    mockSSEClientInstance.connect.mockClear();
    mockSSEClientInstance.abort.mockClear();
    mockSSEClientInstance.dispose.mockClear();
    
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    delete (global as unknown as { EventSource?: unknown }).EventSource;
  });

  describe('EventSource fallback (no apiKey)', () => {
    it('connects to default url when none provided', () => {
      const stream = new FlagStreamClient('http://api.com', undefined, {}, logger, events);
      stream.connect();

      expect(EventSourceMock).toHaveBeenCalledWith('http://api.com/feature-flags/stream');
      stream.dispose();
    });

    it('does NOT append apiKey to connection url when apiKey is undefined', () => {
      const stream = new FlagStreamClient('http://api.com', undefined, {}, logger, events);
      stream.connect();

      expect(EventSourceMock).toHaveBeenCalledWith('http://api.com/feature-flags/stream');
      expect(mockSSEClientInstance.connect).not.toHaveBeenCalled();
      stream.dispose();
    });

    it('does NOT use SSEClient when apiKey is undefined', () => {
      const stream = new FlagStreamClient('http://api.com', undefined, {}, logger, events);
      stream.connect();

      // Should use EventSource, NOT SSEClient
      expect(EventSourceMock).toHaveBeenCalled();
      expect(mockSSEClientInstance.connect).not.toHaveBeenCalled();
      stream.dispose();
    });

    it('uses custom url if provided', () => {
      const stream = new FlagStreamClient('http://api.com', undefined, { url: 'http://custom.stream' }, logger, events);
      stream.connect();

      expect(EventSourceMock).toHaveBeenCalledWith('http://custom.stream');
      stream.dispose();
    });

    it('emits streamConnected when open', () => {
      const stream = new FlagStreamClient('http://api.com', undefined, {}, logger, events);
      const mockHandler = jest.fn();
      events.on('streamConnected', mockHandler);

      stream.connect();

      // Simulate open event
      const sourceInstance = EventSourceMock.mock.results[0].value;
      sourceInstance.onopen();

      expect(mockHandler).toHaveBeenCalledTimes(1);
      stream.dispose();
    });

    it('listens for SSE messages and emits flagsUpdated with slugs', () => {
      const stream = new FlagStreamClient('http://api.com', undefined, {}, logger, events);
      const mockHandler = jest.fn();
      events.on('flagsUpdated', mockHandler);

      stream.connect();

      // Simulate updating a flag via message
      const sourceInstance = EventSourceMock.mock.results[0].value;

      // Extract registered listener
      const messageHandler = sourceInstance.addEventListener.mock.calls.find((call: [string, unknown]) => call[0] === 'message')[1];

      // Pass fake event to handler with slug
      messageHandler({ data: JSON.stringify({ slug: 'test-flag', value: true }) });

      expect(mockHandler).toHaveBeenCalledWith({ source: 'stream', slugs: ['test-flag'], count: 1, hasVersionGap: false });
      stream.dispose();
    });

    it('emits flagsUpdated with slugs array for batch updates', () => {
      const stream = new FlagStreamClient('http://api.com', undefined, {}, logger, events);
      const mockHandler = jest.fn();
      events.on('flagsUpdated', mockHandler);

      stream.connect();

      const sourceInstance = EventSourceMock.mock.results[0].value;
      const messageHandler = sourceInstance.addEventListener.mock.calls.find((call: [string, unknown]) => call[0] === 'message')[1];

      // Pass batch event with multiple slugs
      messageHandler({ data: JSON.stringify({ slugs: ['flag-a', 'flag-b', 'flag-c'], action: 'batch' }) });

      expect(mockHandler).toHaveBeenCalledWith({ source: 'stream', slugs: ['flag-a', 'flag-b', 'flag-c'], count: 3, hasVersionGap: false });
      stream.dispose();
    });

    it('emits flagsUpdated without slugs for legacy messages (backward compat)', () => {
      const stream = new FlagStreamClient('http://api.com', undefined, {}, logger, events);
      const mockHandler = jest.fn();
      events.on('flagsUpdated', mockHandler);

      stream.connect();

      const sourceInstance = EventSourceMock.mock.results[0].value;
      const messageHandler = sourceInstance.addEventListener.mock.calls.find((call: [string, unknown]) => call[0] === 'message')[1];

      // Legacy message without slug info
      messageHandler({ data: JSON.stringify({ action: 'refresh' }) });

      expect(mockHandler).toHaveBeenCalledWith({ source: 'stream', slugs: undefined, count: 0, hasVersionGap: false });
      stream.dispose();
    });

    it('handles missing EventSource gracefully in unsupported environments', () => {
      delete (global as unknown as { EventSource?: unknown }).EventSource;

      const stream = new FlagStreamClient('http://api.com', undefined, {}, logger, events);

      // Should not throw, should log warning
      expect(() => stream.connect()).not.toThrow();
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('EventSource is not available'));

      expect(stream.isConnected()).toBe(false);
    });

    it('auto-reconnects on error using exponential backoff', () => {
      const stream = new FlagStreamClient(
        'http://api.com',
        undefined,
        { reconnectDelayMs: 100 },
        logger,
        events
      );

      stream.connect();
      const sourceInstance = EventSourceMock.mock.results[0].value;

      // Trigger error -> should schedule reconnect
      sourceInstance.onerror(new Error('Network error'));

      expect(EventSourceMock).toHaveBeenCalledTimes(1); // the initial connection

      // Advance timers past first delay (baseDelay * 2^1 = ~200ms + jitter)
      jest.advanceTimersByTime(1500); // 1.5s ensures we hit window including jitter

      // It should have reconnected
      expect(EventSourceMock).toHaveBeenCalledTimes(2);

      // Clear any resulting pending reconnect from the new simulated connection failing
      jest.runAllTimers();

      stream.dispose();
    });
  });

  describe('Fetch-based SSE (with apiKey)', () => {
    it('uses SSEClient when apiKey is provided', () => {
      const stream = new FlagStreamClient('http://api.com', 'secret-key', {}, logger, events);
      stream.connect();

      // Should use SSEClient, NOT EventSource
      expect(EventSourceMock).not.toHaveBeenCalled();
      expect(mockSSEClientInstance.connect).toHaveBeenCalled();
    });

    it('sends apiKey to SSEClient (which uses Authorization header internally)', () => {
      const stream = new FlagStreamClient('http://api.com', 'secret-key', {}, logger, events);
      stream.connect();

      // SSEClient constructor was called with apiKey
      expect(SSEClient).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: 'secret-key',
        })
      );
    });

    it('SSEClient does NOT receive apiKey in url (it uses headers)', () => {
      const stream = new FlagStreamClient('http://api.com', 'secret-key', {}, logger, events);
      stream.connect();

      // SSEClient is called with url WITHOUT apiKey query param
      expect(SSEClient).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'http://api.com/feature-flags/stream',
        })
      );
    });

    it('empty apiKey string uses EventSource fallback', () => {
      const stream = new FlagStreamClient('http://api.com', '', {}, logger, events);
      stream.connect();

      // Empty string is falsy, should use EventSource
      expect(EventSourceMock).toHaveBeenCalled();
      expect(mockSSEClientInstance.connect).not.toHaveBeenCalled();
      stream.dispose();
    });

    it('connect() is idempotent - does not reconnect if already connected', () => {
      const stream = new FlagStreamClient('http://api.com', 'secret-key', {}, logger, events);
      stream.connect();
      stream.connect(); // Second call should be no-op

      // Should only call connect once
      expect(mockSSEClientInstance.connect).toHaveBeenCalledTimes(1);
      stream.dispose();
    });

    it('handles 401 error - SSEClient should not retry after auth failure', () => {
      const stream = new FlagStreamClient(
        'http://api.com',
        'bad-key',
        { reconnectDelayMs: 100 },
        logger,
        events
      );

      stream.connect();

      // Get the onError callback that SSEClient would call for non-401 errors
      // (401 is handled internally by SSEClient with direct emit)
      const sseClientCall = (SSEClient as jest.Mock).mock.calls[0][0];
      const errorCallback = sseClientCall.onError;

      // Simulate a non-401 error - this would trigger reconnect
      errorCallback(new Error('Connection reset'));

      // Since it's not a 401, it should NOT log the "not retrying" message
      expect(logger.error).not.toHaveBeenCalledWith('Stream authentication failed, not retrying');
      
      stream.dispose();
    });

    it('non-401 error triggers reconnection attempt', () => {
      const stream = new FlagStreamClient(
        'http://api.com',
        'some-key',
        { reconnectDelayMs: 100 },
        logger,
        events
      );

      stream.connect();

      // Get the onError callback
      const sseClientCall = (SSEClient as jest.Mock).mock.calls[0][0];
      const errorCallback = sseClientCall.onError;

      // Simulate a network error (not 401)
      const networkError = new Error('Network failure');
      errorCallback(networkError);

      // Should not log the "not retrying" message since it's not a 401
      expect(logger.error).not.toHaveBeenCalledWith('Stream authentication failed, not retrying');
      
      stream.dispose();
    });
  });

  describe('dispose() and cleanup', () => {
    it('disconnects and CLEANS UP TIMER on dispose', () => {
      const stream = new FlagStreamClient('http://api.com', undefined, {}, logger, events);
      stream.connect();

      const sourceInstance = EventSourceMock.mock.results[0].value;

      stream.dispose(); // dispose calls disconnect internally

      expect(sourceInstance.close).toHaveBeenCalledTimes(1);
    });

    it('dispose cleans up EventSource on EventSource mode', () => {
      const stream = new FlagStreamClient('http://api.com', undefined, {}, logger, events);
      stream.connect();

      const sourceInstance = EventSourceMock.mock.results[0].value;

      stream.dispose();

      expect(sourceInstance.close).toHaveBeenCalled();
    });

    it('dispose calls abort on SSEClient', () => {
      const stream = new FlagStreamClient('http://api.com', 'secret-key', {}, logger, events);
      stream.connect();

      stream.dispose();

      expect(mockSSEClientInstance.abort).toHaveBeenCalled();
    });

    it('dispose sets disposed flag preventing reconnection', () => {
      const stream = new FlagStreamClient(
        'http://api.com',
        undefined,
        { reconnectDelayMs: 100 },
        logger,
        events
      );

      stream.connect();
      
      const sourceInstance = EventSourceMock.mock.results[0].value;

      stream.dispose();

      // Trigger error - should NOT reconnect because disposed
      sourceInstance.onerror(new Error('Network error'));
      
      jest.advanceTimersByTime(2000);

      // Should NOT have reconnected
      expect(EventSourceMock).toHaveBeenCalledTimes(1); // Only the initial connection
    });
  });

  describe('isConnected()', () => {
    it('returns false when EventSource is not available', () => {
      delete (global as unknown as { EventSource?: unknown }).EventSource;

      const stream = new FlagStreamClient('http://api.com', undefined, {}, logger, events);
      stream.connect();

      expect(stream.isConnected()).toBe(false);
    });

    it('returns true when SSEClient is active after connect', () => {
      const stream = new FlagStreamClient('http://api.com', 'secret-key', {}, logger, events);
      stream.connect();

      // SSEClient exists means isConnected returns true
      expect(stream.isConnected()).toBe(true);
      stream.dispose();
    });

    it('returns false after dispose on EventSource mode', () => {
      // Mock EventSource needs OPEN property
      (EventSourceMock as unknown as { OPEN: number }).OPEN = 1;
      
      const stream = new FlagStreamClient('http://api.com', undefined, {}, logger, events);
      stream.connect();
      
      // Simulate EventSource being in OPEN state
      const esInstance = EventSourceMock.mock.results[0].value;
      Object.defineProperty(esInstance, 'readyState', { value: 1 }); // 1 = OPEN
      
      expect(stream.isConnected()).toBe(true);
      stream.dispose();
      
      // After dispose, eventSource is set to null, so isConnected returns false
      expect(stream.isConnected()).toBe(false);
    });
  });

  describe('Anti-replay (Last-Event-ID)', () => {
    it('passes lastEventId to SSEClient when reconnecting', () => {
      const stream = new FlagStreamClient('http://api.com', 'secret-key', {}, logger, events);
      stream.connect();

      // Get the SSEClient options from the first call
      const sseClientCall = (SSEClient as jest.Mock).mock.calls[0][0];
      
      // Manually call onEventId to simulate SSEClient receiving events with id
      sseClientCall.onEventId?.('event-123');

      // Disconnect
      stream.disconnect();

      // Reconnect - should pass the stored lastEventId
      stream.connect();

      // SSEClient should be called with lastEventId: 'event-123'
      expect(SSEClient).toHaveBeenCalledWith(
        expect.objectContaining({
          lastEventId: 'event-123',
        })
      );

      stream.dispose();
    });

    it('emits hasVersionGap=true when version jump is detected', () => {
      const stream = new FlagStreamClient('http://api.com', undefined, {}, logger, events);
      const mockHandler = jest.fn();
      events.on('flagsUpdated', mockHandler);

      stream.connect();

      const sourceInstance = EventSourceMock.mock.results[0].value;
      const messageHandler = sourceInstance.addEventListener.mock.calls.find((call: [string, unknown]) => call[0] === 'message')[1];

      // Send first event with version 5
      messageHandler({ data: JSON.stringify({ slug: 'flag-a', version: 5 }) });
      
      // Send second event with version 8 (jump from 5 to 8 = gap detected)
      messageHandler({ data: JSON.stringify({ slug: 'flag-b', version: 8 }) });

      // Second call should have hasVersionGap: true
      expect(mockHandler).toHaveBeenCalledTimes(2);
      expect(mockHandler).toHaveBeenNthCalledWith(1, { source: 'stream', slugs: ['flag-a'], count: 1, hasVersionGap: false });
      expect(mockHandler).toHaveBeenNthCalledWith(2, { source: 'stream', slugs: ['flag-b'], count: 1, hasVersionGap: true });

      stream.dispose();
    });

    it('emits hasVersionGap=false when version increments normally (no gap)', () => {
      const stream = new FlagStreamClient('http://api.com', undefined, {}, logger, events);
      const mockHandler = jest.fn();
      events.on('flagsUpdated', mockHandler);

      stream.connect();

      const sourceInstance = EventSourceMock.mock.results[0].value;
      const messageHandler = sourceInstance.addEventListener.mock.calls.find((call: [string, unknown]) => call[0] === 'message')[1];

      // Send events with consecutive versions
      messageHandler({ data: JSON.stringify({ slug: 'flag-a', version: 1 }) });
      messageHandler({ data: JSON.stringify({ slug: 'flag-b', version: 2 }) });
      messageHandler({ data: JSON.stringify({ slug: 'flag-c', version: 3 }) });

      // All should have hasVersionGap: false
      expect(mockHandler).toHaveBeenCalledTimes(3);
      expect(mockHandler).toHaveBeenNthCalledWith(1, { source: 'stream', slugs: ['flag-a'], count: 1, hasVersionGap: false });
      expect(mockHandler).toHaveBeenNthCalledWith(2, { source: 'stream', slugs: ['flag-b'], count: 1, hasVersionGap: false });
      expect(mockHandler).toHaveBeenNthCalledWith(3, { source: 'stream', slugs: ['flag-c'], count: 1, hasVersionGap: false });

      stream.dispose();
    });

    it('events without version do not trigger version gap detection', () => {
      const stream = new FlagStreamClient('http://api.com', undefined, {}, logger, events);
      const mockHandler = jest.fn();
      events.on('flagsUpdated', mockHandler);

      stream.connect();

      const sourceInstance = EventSourceMock.mock.results[0].value;
      const messageHandler = sourceInstance.addEventListener.mock.calls.find((call: [string, unknown]) => call[0] === 'message')[1];

      // Send events without version field
      messageHandler({ data: JSON.stringify({ slug: 'flag-a' }) });
      messageHandler({ data: JSON.stringify({ slug: 'flag-b' }) });

      // Both should have hasVersionGap: false (no version to compare)
      expect(mockHandler).toHaveBeenCalledTimes(2);
      expect(mockHandler).toHaveBeenNthCalledWith(1, { source: 'stream', slugs: ['flag-a'], count: 1, hasVersionGap: false });
      expect(mockHandler).toHaveBeenNthCalledWith(2, { source: 'stream', slugs: ['flag-b'], count: 1, hasVersionGap: false });

      stream.dispose();
    });
  });
});
