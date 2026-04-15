// ═══════════════════════════════════════════════════════════════════════════════
// FeatureFly - Advanced Features
// ═══════════════════════════════════════════════════════════════════════════════
//
// Advanced features: Edge Evaluation, Streaming, Metrics, Targeting, Rollouts.
// Use 'featurefly/core' for the minimal SDK.
//
// Usage:
//   import { EdgeEvaluator, FlagStreamClient } from 'featurefly/advanced';
//
// ═══════════════════════════════════════════════════════════════════════════════

export { EdgeEvaluator } from '../shared/edge-evaluator';
export { FlagStreamClient } from '../shared/streaming';
export { evaluateRules, evaluateRule } from '../shared/targeting';
export { isInRollout, getHashBucket } from '../shared/rollout';
export { assignVariation } from '../shared/experiment';
export { ImpactMetrics } from '../shared/metrics';

export type { MetricsSnapshot, FlagMetric, ExperimentMetric } from '../shared/metrics';
