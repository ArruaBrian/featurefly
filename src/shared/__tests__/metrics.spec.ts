import { ImpactMetrics } from '../metrics';
import { EventEmitter } from '../event-emitter';

describe('ImpactMetrics', () => {
  let events: EventEmitter;
  let metrics: ImpactMetrics;

  beforeEach(() => {
    events = new EventEmitter();
    metrics = new ImpactMetrics(events);
  });

  afterEach(() => {
    metrics.destroy();
  });

  it('starts with zeroed counters', () => {
    const snapshot = metrics.getSnapshot();
    expect(snapshot.totalEvaluations).toBe(0);
    expect(snapshot.totalCacheHits).toBe(0);
    expect(snapshot.totalCacheMisses).toBe(0);
    expect(snapshot.cacheHitRate).toBe(0);
    expect(Object.keys(snapshot.flags)).toHaveLength(0);
    expect(Object.keys(snapshot.experiments)).toHaveLength(0);
  });

  it('counts flag evaluations per slug', () => {
    events.emit('flagEvaluated', { slug: 'feat-a', value: true, reason: 'DEFAULT', durationMs: 5 });
    events.emit('flagEvaluated', { slug: 'feat-a', value: true, reason: 'CACHE_HIT', durationMs: 1 });
    events.emit('flagEvaluated', { slug: 'feat-b', value: false, reason: 'DEFAULT', durationMs: 10 });

    const snapshot = metrics.getSnapshot();
    expect(snapshot.totalEvaluations).toBe(3);
    expect(snapshot.flags['feat-a'].evaluations).toBe(2);
    expect(snapshot.flags['feat-b'].evaluations).toBe(1);
  });

  it('computes cache hit rate', () => {
    events.emit('cacheHit', { key: 'a' });
    events.emit('cacheHit', { key: 'b' });
    events.emit('cacheMiss', { key: 'c' });

    const snapshot = metrics.getSnapshot();
    expect(snapshot.totalCacheHits).toBe(2);
    expect(snapshot.totalCacheMisses).toBe(1);
    expect(snapshot.cacheHitRate).toBeCloseTo(2 / 3, 2);
  });

  it('tracks flag changes', () => {
    events.emit('flagChanged', { slug: 'feat-a', previousValue: true, newValue: false });
    events.emit('flagChanged', { slug: 'feat-a', previousValue: false, newValue: true });

    const snapshot = metrics.getSnapshot();
    expect(snapshot.flags['feat-a'].changes).toBe(2);
  });

  it('tracks experiment exposures per variation', () => {
    events.emit('experimentAssigned', {
      experimentId: 'exp-1',
      variationId: 'var-a',
      value: 'blue',
      context: { userId: 'u1' },
    });
    events.emit('experimentAssigned', {
      experimentId: 'exp-1',
      variationId: 'var-b',
      value: 'red',
      context: { userId: 'u2' },
    });
    events.emit('experimentAssigned', {
      experimentId: 'exp-1',
      variationId: 'var-a',
      value: 'blue',
      context: { userId: 'u3' },
    });

    const snapshot = metrics.getSnapshot();
    expect(snapshot.experiments['exp-1'].exposures).toBe(3);
    expect(snapshot.experiments['exp-1'].variationCounts['var-a']).toBe(2);
    expect(snapshot.experiments['exp-1'].variationCounts['var-b']).toBe(1);
  });

  it('computes latency percentiles', () => {
    // Emit 100 evaluations with known latencies
    for (let i = 1; i <= 100; i++) {
      events.emit('flagEvaluated', { slug: 'perf', value: true, reason: 'DEFAULT', durationMs: i });
    }

    const snapshot = metrics.getSnapshot();
    expect(snapshot.latency.p50).toBe(51);  // index 50 in sorted [1..100] = 51
    expect(snapshot.latency.p95).toBe(96);  // index 95 = 96
    expect(snapshot.latency.p99).toBe(100); // index 99 = 100
    expect(snapshot.latency.avg).toBeCloseTo(50.5, 0);
  });

  it('resets all counters', () => {
    events.emit('flagEvaluated', { slug: 'x', value: true, reason: 'DEFAULT', durationMs: 1 });
    events.emit('cacheHit', { key: 'x' });
    events.emit('experimentAssigned', { experimentId: 'e', variationId: 'v', value: 'a', context: {} });

    metrics.reset();

    const snapshot = metrics.getSnapshot();
    expect(snapshot.totalEvaluations).toBe(0);
    expect(snapshot.totalCacheHits).toBe(0);
    expect(Object.keys(snapshot.flags)).toHaveLength(0);
    expect(Object.keys(snapshot.experiments)).toHaveLength(0);
  });

  it('unsubscribes from events on destroy', () => {
    metrics.destroy();

    // After destroy, events should no longer affect counters
    events.emit('flagEvaluated', { slug: 'x', value: true, reason: 'DEFAULT', durationMs: 1 });

    const snapshot = metrics.getSnapshot();
    expect(snapshot.totalEvaluations).toBe(0);
  });
});
