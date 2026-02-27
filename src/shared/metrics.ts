import { EventEmitter } from './event-emitter';

// ═══════════════════════════════════════════════════════════════════════════════
// IMPACT METRICS — Passive client-side telemetry collector
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Per-flag metrics summary.
 */
export interface FlagMetric {
  evaluations: number;
  cacheHits: number;
  cacheMisses: number;
  changes: number;
  lastEvaluatedAt: number;
  latencies: number[];
}

/**
 * Experiment exposure summary.
 */
export interface ExperimentMetric {
  experimentId: string;
  exposures: number;
  variationCounts: Record<string, number>;
}

/**
 * Full metrics snapshot returned by `getSnapshot()`.
 */
export interface MetricsSnapshot {
  totalEvaluations: number;
  totalCacheHits: number;
  totalCacheMisses: number;
  cacheHitRate: number;
  flags: Record<string, FlagMetric>;
  experiments: Record<string, ExperimentMetric>;
  latency: {
    p50: number;
    p95: number;
    p99: number;
    avg: number;
  };
  collectedSince: number;
}

const MAX_LATENCY_SAMPLES = 1000;

/**
 * Passive impact metrics collector.
 *
 * Subscribes to SDK events and aggregates per-flag evaluation counts,
 * cache hit/miss ratios, latency percentiles, change frequency,
 * and experiment exposure counts. No network calls, no external dependencies.
 *
 * @example
 * ```ts
 * const metrics = client.getImpactMetrics();
 * console.log(metrics.cacheHitRate);         // 0.87
 * console.log(metrics.latency.p95);          // 12ms
 * console.log(metrics.flags['my-flag'].evaluations); // 42
 * ```
 */
export class ImpactMetrics {
  private totalEvaluations = 0;
  private totalCacheHits = 0;
  private totalCacheMisses = 0;
  private readonly flags = new Map<string, FlagMetric>();
  private readonly experiments = new Map<string, ExperimentMetric>();
  private readonly latencies: number[] = [];
  private readonly collectedSince = Date.now();

  private readonly unsubscribers: Array<() => void> = [];

  constructor(events: EventEmitter) {
    this.unsubscribers.push(
      events.on('flagEvaluated', (payload) => {
        this.totalEvaluations++;

        // Per-flag tracking
        const metric = this.getOrCreateFlag(payload.slug);
        metric.evaluations++;
        metric.lastEvaluatedAt = Date.now();

        // Latency tracking (ring buffer)
        if (payload.durationMs !== undefined) {
          metric.latencies.push(payload.durationMs);
          if (metric.latencies.length > MAX_LATENCY_SAMPLES) {
            metric.latencies.shift();
          }
          this.latencies.push(payload.durationMs);
          if (this.latencies.length > MAX_LATENCY_SAMPLES) {
            this.latencies.shift();
          }
        }
      }),
    );

    this.unsubscribers.push(
      events.on('cacheHit', () => {
        this.totalCacheHits++;
      }),
    );

    this.unsubscribers.push(
      events.on('cacheMiss', () => {
        this.totalCacheMisses++;
      }),
    );

    this.unsubscribers.push(
      events.on('flagChanged', (payload) => {
        const metric = this.getOrCreateFlag(payload.slug);
        metric.changes++;
      }),
    );

    this.unsubscribers.push(
      events.on('experimentAssigned', (payload) => {
        const exp = this.getOrCreateExperiment(payload.experimentId);
        exp.exposures++;
        exp.variationCounts[payload.variationId] =
          (exp.variationCounts[payload.variationId] || 0) + 1;
      }),
    );
  }

  /**
   * Returns a full immutable snapshot of all collected metrics.
   */
  getSnapshot(): MetricsSnapshot {
    const flagsRecord: Record<string, FlagMetric> = {};
    for (const [slug, metric] of this.flags) {
      flagsRecord[slug] = { ...metric, latencies: [...metric.latencies] };
    }

    const experimentsRecord: Record<string, ExperimentMetric> = {};
    for (const [id, metric] of this.experiments) {
      experimentsRecord[id] = { ...metric, variationCounts: { ...metric.variationCounts } };
    }

    const totalCacheOps = this.totalCacheHits + this.totalCacheMisses;

    return {
      totalEvaluations: this.totalEvaluations,
      totalCacheHits: this.totalCacheHits,
      totalCacheMisses: this.totalCacheMisses,
      cacheHitRate: totalCacheOps > 0 ? this.totalCacheHits / totalCacheOps : 0,
      flags: flagsRecord,
      experiments: experimentsRecord,
      latency: this.computeLatencyPercentiles(),
      collectedSince: this.collectedSince,
    };
  }

  /**
   * Reset all collected metrics.
   */
  reset(): void {
    this.totalEvaluations = 0;
    this.totalCacheHits = 0;
    this.totalCacheMisses = 0;
    this.flags.clear();
    this.experiments.clear();
    this.latencies.length = 0;
  }

  /**
   * Unsubscribe from all events. Called on client dispose.
   */
  destroy(): void {
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers.length = 0;
  }

  // ─── Internal ────────────────────────────────────────────────────────────────

  private getOrCreateFlag(slug: string): FlagMetric {
    let metric = this.flags.get(slug);
    if (!metric) {
      metric = {
        evaluations: 0,
        cacheHits: 0,
        cacheMisses: 0,
        changes: 0,
        lastEvaluatedAt: 0,
        latencies: [],
      };
      this.flags.set(slug, metric);
    }
    return metric;
  }

  private getOrCreateExperiment(experimentId: string): ExperimentMetric {
    let metric = this.experiments.get(experimentId);
    if (!metric) {
      metric = {
        experimentId,
        exposures: 0,
        variationCounts: {},
      };
      this.experiments.set(experimentId, metric);
    }
    return metric;
  }

  private computeLatencyPercentiles(): MetricsSnapshot['latency'] {
    if (this.latencies.length === 0) {
      return { p50: 0, p95: 0, p99: 0, avg: 0 };
    }

    const sorted = [...this.latencies].sort((a, b) => a - b);
    const len = sorted.length;

    return {
      p50: sorted[Math.floor(len * 0.5)],
      p95: sorted[Math.floor(len * 0.95)],
      p99: sorted[Math.floor(len * 0.99)],
      avg: Math.round(sorted.reduce((a, b) => a + b, 0) / len * 100) / 100,
    };
  }
}
