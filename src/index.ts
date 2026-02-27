// ═══════════════════════════════════════════════════════════════════════════════
// FeatureFly - Framework-Agnostic Feature Flags SDK
// ═══════════════════════════════════════════════════════════════════════════════

// Core client
export { FeatureFlagsClient } from './shared/client';

// Cache
export { InMemoryCache } from './shared/cache';

// Logger
export { ConsoleLogger } from './shared/logger';

// Circuit Breaker
export { CircuitBreaker, CircuitOpenError } from './shared/circuit-breaker';

// Event Emitter
export { EventEmitter } from './shared/event-emitter';

// Retry
export { withRetry } from './shared/retry';

// New Advanced Modules
export { EdgeEvaluator } from './shared/edge-evaluator';
export { FlagStreamClient } from './shared/streaming';
export { evaluateRules, evaluateRule } from './shared/targeting';
export { isInRollout, getHashBucket } from './shared/rollout';
export { assignVariation } from './shared/experiment';
export { ImpactMetrics } from './shared/metrics';

// Types
export type {
  // Core
  FeatureFlag,
  WorkspaceFeatureFlag,
  FlagValue,
  FlagValueType,

  // CRUD
  CreateFlagData,
  UpdateFlagData,
  SetWorkspaceFlagData,

  // Evaluation
  EvaluationContext,
  EvaluationReason,
  FeatureFlagEvaluation,
  BatchEvaluation,

  // Stats
  FeatureFlagStats,

  // Config
  FeatureFlagsConfig,
  RequestInterceptor,
  RetryConfig,
  CircuitBreakerConfig,
  LogLevel,
  ILogger,

  // Events
  FeatureFlyEvent,
  EventHandler,
  EventPayloadMap,
  FlagEvaluatedPayload,
  FlagChangedPayload,
  RequestFailedPayload,
  CircuitStatePayload,

  // Advanced Types
  TargetingOperator,
  TargetingCondition,
  TargetingRule,
  RolloutConfig,
  Variation,
  Experiment,
  ExperimentAssignment,
  TrackingCallback,
  StreamingConfig,
  FlagDocument,
} from './shared/types';

export type {
  MetricsSnapshot,
  FlagMetric,
  ExperimentMetric,
} from './shared/metrics';
