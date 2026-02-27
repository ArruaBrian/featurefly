import { FeatureFlyEvent, EventHandler, EventPayloadMap } from './types';

/**
 * Typed event emitter for FeatureFly SDK.
 * Allows consumers to subscribe to internal SDK events like flag changes,
 * cache hits/misses, circuit breaker state changes, etc.
 */
export class EventEmitter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly listeners = new Map<FeatureFlyEvent, Set<EventHandler<any>>>();

  /**
   * Subscribe to an event. Returns an unsubscribe function.
   */
  on<E extends FeatureFlyEvent>(event: E, handler: EventHandler<E>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.listeners.get(event)?.delete(handler);
    };
  }

  /**
   * Subscribe to an event once (auto-unsubscribes after first invocation).
   */
  once<E extends FeatureFlyEvent>(event: E, handler: EventHandler<E>): () => void {
    const wrappedHandler: EventHandler<E> = (payload) => {
      unsubscribe();
      handler(payload);
    };
    const unsubscribe = this.on(event, wrappedHandler);
    return unsubscribe;
  }

  /**
   * Emit an event to all registered listeners.
   */
  emit<E extends FeatureFlyEvent>(event: E, payload: EventPayloadMap[E]): void {
    const handlers = this.listeners.get(event);
    if (!handlers || handlers.size === 0) return;

    for (const handler of handlers) {
      try {
        handler(payload);
      } catch {
        // Swallow listener errors — SDK should never crash from user callbacks
      }
    }
  }

  /**
   * Remove all listeners for a specific event, or all events if no event is specified.
   */
  removeAllListeners(event?: FeatureFlyEvent): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Get the count of listeners for a given event.
   */
  listenerCount(event: FeatureFlyEvent): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}
