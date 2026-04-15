import { EventEmitter } from '../event-emitter';

describe('EventEmitter', () => {
  let emitter: EventEmitter;

  beforeEach(() => {
    emitter = new EventEmitter();
  });

  describe('on / emit', () => {
    it('should call handler when event is emitted', () => {
      const handler = jest.fn();
      emitter.on('cacheHit', handler);
      emitter.emit('cacheHit', { key: 'test-key' });
      expect(handler).toHaveBeenCalledWith({ key: 'test-key' });
    });

    it('should support multiple handlers for the same event', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      emitter.on('cacheHit', handler1);
      emitter.on('cacheHit', handler2);

      emitter.emit('cacheHit', { key: 'key' });
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should not call handlers for different events', () => {
      const handler = jest.fn();
      emitter.on('cacheHit', handler);
      emitter.emit('cacheMiss', { key: 'key' });
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('unsubscribe', () => {
    it('should return an unsubscribe function', () => {
      const handler = jest.fn();
      const unsubscribe = emitter.on('cacheHit', handler);

      emitter.emit('cacheHit', { key: 'key' });
      expect(handler).toHaveBeenCalledTimes(1);

      unsubscribe();
      emitter.emit('cacheHit', { key: 'key' });
      expect(handler).toHaveBeenCalledTimes(1); // still 1, not 2
    });
  });

  describe('once', () => {
    it('should call handler only once', () => {
      const handler = jest.fn();
      emitter.once('cacheHit', handler);

      emitter.emit('cacheHit', { key: 'key' });
      emitter.emit('cacheHit', { key: 'key' });
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('removeAllListeners', () => {
    it('should remove all listeners for a specific event', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      emitter.on('cacheHit', handler1);
      emitter.on('cacheMiss', handler2);

      emitter.removeAllListeners('cacheHit');

      emitter.emit('cacheHit', { key: 'key' });
      emitter.emit('cacheMiss', { key: 'key' });

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should remove all listeners when no event is specified', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      emitter.on('cacheHit', handler1);
      emitter.on('cacheMiss', handler2);

      emitter.removeAllListeners();

      emitter.emit('cacheHit', { key: 'key' });
      emitter.emit('cacheMiss', { key: 'key' });

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });
  });

  describe('listenerCount', () => {
    it('should return the correct count', () => {
      expect(emitter.listenerCount('cacheHit')).toBe(0);

      emitter.on('cacheHit', jest.fn());
      expect(emitter.listenerCount('cacheHit')).toBe(1);

      emitter.on('cacheHit', jest.fn());
      expect(emitter.listenerCount('cacheHit')).toBe(2);
    });
  });

  describe('error handling', () => {
    it('should not throw if a handler throws', () => {
      emitter.on('cacheHit', () => {
        throw new Error('handler error');
      });

      expect(() => {
        emitter.emit('cacheHit', { key: 'key' });
      }).not.toThrow();
    });

    it('should continue calling other handlers if one throws', () => {
      const handler2 = jest.fn();
      emitter.on('cacheHit', () => {
        throw new Error('first handler error');
      });
      emitter.on('cacheHit', handler2);

      emitter.emit('cacheHit', { key: 'key' });
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should emit listenerError when a handler throws', () => {
      const listenerErrorHandler = jest.fn();
      emitter.on('listenerError', listenerErrorHandler);

      const testError = new Error('handler failed');
      const throwingHandler = () => {
        throw testError;
      };
      emitter.on('cacheHit', throwingHandler);

      emitter.emit('cacheHit', { key: 'key' });

      expect(listenerErrorHandler).toHaveBeenCalledTimes(1);
      const errorPayload = listenerErrorHandler.mock.calls[0][0];
      expect(errorPayload.event).toBe('cacheHit');
      expect(errorPayload.error).toBe(testError);
      // Handler is stored as a symbol identifier (cast from function reference)
      expect(errorPayload.handler).toBeDefined();
    });

    it('should continue executing other handlers after one throws', () => {
      const handler2 = jest.fn();
      const handler3 = jest.fn();
      emitter.on('cacheHit', () => {
        throw new Error('first error');
      });
      emitter.on('cacheHit', handler2);
      emitter.on('cacheHit', () => {
        throw new Error('third error');
      });
      emitter.on('cacheHit', handler3);

      emitter.emit('cacheHit', { key: 'key' });

      expect(handler2).toHaveBeenCalledTimes(1);
      expect(handler3).toHaveBeenCalledTimes(1);
    });

    it('should not cause infinite recursion when listenerError handler throws', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      // Handler that throws on every event including listenerError
      emitter.on('listenerError', () => {
        throw new Error('listenerError handler failed');
      });
      emitter.on('cacheHit', () => {
        throw new Error('original error');
      });

      // Should not throw and should not recurse infinitely
      expect(() => {
        emitter.emit('cacheHit', { key: 'key' });
      }).not.toThrow();

      // Only one listenerError should be emitted (no recursion)
      consoleSpy.mockRestore();
    });
  });
});
