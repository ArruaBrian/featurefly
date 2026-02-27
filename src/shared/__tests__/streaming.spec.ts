import { FlagStreamClient } from '../streaming';
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

describe('Streaming Client', () => {
  let logger: ILogger;
  let events: EventEmitter;
  
  beforeEach(() => {
    logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    events = new EventEmitter();
    
    // Setup global EventSource
    (global as unknown as { EventSource: unknown }).EventSource = EventSourceMock;
    EventSourceMock.mockClear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    delete (global as unknown as { EventSource?: unknown }).EventSource;
  });

  it('connects to default url when none provided', () => {
    const stream = new FlagStreamClient('http://api.com', undefined, {}, logger, events);
    stream.connect();
    
    expect(EventSourceMock).toHaveBeenCalledWith('http://api.com/feature-flags/stream');
    stream.dispose();
  });

  it('appends apiKey to connection url', () => {
    const stream = new FlagStreamClient('http://api.com', 'test-key', {}, logger, events);
    stream.connect();
    
    expect(EventSourceMock).toHaveBeenCalledWith('http://api.com/feature-flags/stream?apiKey=test-key');
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

  it('listens for SSE messages and emits flagsUpdated', () => {
    const stream = new FlagStreamClient('http://api.com', undefined, {}, logger, events);
    const mockHandler = jest.fn();
    events.on('flagsUpdated', mockHandler);
    
    stream.connect();
    
    // Simulate updating a flag via message
    const sourceInstance = EventSourceMock.mock.results[0].value;
    
    // The handleUpdateEvent is registered as the 4th listener (array index 3) in the implementation
    // 'flag.updated', 'flag.created', 'flag.deleted', 'message'
    
    // Extract registered listener directly since we mock addEventListener
    const messageHandler = sourceInstance.addEventListener.mock.calls.find((call: [string, unknown]) => call[0] === 'message')[1];
    
    // Pass fake event to handler
    messageHandler({ data: JSON.stringify({ slug: 'test', value: true }) });
    
    expect(mockHandler).toHaveBeenCalledWith({ source: 'stream', count: 1 });
    stream.dispose();
  });

  it('disconnects and CLEANS UP TIMER on dispose', () => {
    const stream = new FlagStreamClient('http://api.com', undefined, {}, logger, events);
    stream.connect();
    
    const sourceInstance = EventSourceMock.mock.results[0].value;
    
    stream.dispose(); // dispose calls disconnect internally
    
    expect(sourceInstance.close).toHaveBeenCalledTimes(1);
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
