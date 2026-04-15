// ═══════════════════════════════════════════════════════════════════════════════
// FeatureFly - Core SDK
// ═══════════════════════════════════════════════════════════════════════════════
//
// Minimal core SDK: FeatureFlagsClient + resilience primitives.
// Excludes: EdgeEvaluator, Streaming, SSE (use 'featurefly/react' or 'featurefly/vue')
//
// Usage:
//   import { FeatureFlagsClient } from 'featurefly/core';
//
// ═══════════════════════════════════════════════════════════════════════════════

export { FeatureFlagsClient } from '../shared/client';
export { InMemoryCache } from '../shared/cache';
export { ConsoleLogger } from '../shared/logger';
export { CircuitBreaker, CircuitOpenError } from '../shared/circuit-breaker';
export { EventEmitter } from '../shared/event-emitter';
export { withRetry } from '../shared/retry';
export { ImpactMetrics } from '../shared/metrics';
export { UUID_REGEX } from '../utils/uuid';

export type { FeatureFlag } from '../shared/types';
export type { WorkspaceFeatureFlag } from '../shared/types';
export type { FlagValue } from '../shared/types';
export type { FlagValueType } from '../shared/types';
export type { CreateFlagData } from '../shared/types';
export type { UpdateFlagData } from '../shared/types';
export type { SetWorkspaceFlagData } from '../shared/types';
export type { EvaluationContext } from '../shared/types';
export type { EvaluationReason } from '../shared/types';
export type { FeatureFlagEvaluation } from '../shared/types';
export type { BatchEvaluation } from '../shared/types';
export type { FeatureFlagStats } from '../shared/types';
export type { FeatureFlagsConfig } from '../shared/types';
export type { RequestInterceptor } from '../shared/types';
export type { RetryConfig } from '../shared/types';
export type { CircuitBreakerConfig } from '../shared/types';
export type { LogLevel } from '../shared/types';
export type { ILogger } from '../shared/types';
export type { FeatureFlyEvent } from '../shared/types';
export type { EventHandler } from '../shared/types';
export type { EventPayloadMap } from '../shared/types';
export type { FlagEvaluatedPayload } from '../shared/types';
export type { FlagChangedPayload } from '../shared/types';
export type { RequestFailedPayload } from '../shared/types';
export type { CircuitStatePayload } from '../shared/types';
export type { MetricsSnapshot } from '../shared/metrics';
export type { FlagMetric } from '../shared/metrics';
export type { ExperimentMetric } from '../shared/metrics';
