import { FlagDocument, EvaluationContext, FlagValue, FeatureFlag, ExperimentAssignment, TrackingCallback } from './types';
import { evaluateRules } from './targeting';
import { isInRollout } from './rollout';
import { assignVariation } from './experiment';

/**
 * Result of an edge evaluation for a single flag.
 */
export interface EdgeEvaluationResult {
  value: FlagValue;
  reason: 'TARGETING_MATCH' | 'PERCENTAGE_ROLLOUT' | 'EXPERIMENT_ASSIGNMENT' | 'DEFAULT' | 'LOCAL_OVERRIDE';
  assignment?: ExperimentAssignment;
}

/**
 * Extracts the stickiness value from a context for a given key name.
 */
function getStickinessValue(context: EvaluationContext, key?: string): string | undefined {
  if (!key) return context.userId || context.workspaceId;
  if (key === 'userId') return context.userId;
  if (key === 'workspaceId') return context.workspaceId;
  const attr = context.attributes?.[key];
  return attr !== undefined ? String(attr) : undefined;
}

/**
 * Offline / Local Evaluator Engine.
 * Takes a pre-fetched `FlagDocument` and evaluates flags entirely in-memory
 * without making any HTTP calls. Perfect for edge workers or serverless.
 */
export class EdgeEvaluator {
  private document: FlagDocument;
  private flagIndex = new Map<string, FeatureFlag>();
  private readonly fallbackDefaults: Record<string, FlagValue>;
  private readonly trackingCallback?: TrackingCallback;

  constructor(
    document: FlagDocument,
    fallbackDefaults: Record<string, FlagValue> = {},
    trackingCallback?: TrackingCallback
  ) {
    this.document = document;
    this.fallbackDefaults = fallbackDefaults;
    this.trackingCallback = trackingCallback;
    this.rebuildIndex();
  }

  /**
   * Update the internal document with a fresh one.
   */
  updateDocument(document: FlagDocument): void {
    this.document = document;
    this.rebuildIndex();
  }

  private rebuildIndex(): void {
    this.flagIndex.clear();
    for (const flag of this.document.flags) {
      this.flagIndex.set(flag.slug, flag);
    }
  }

  /**
   * Evaluate a single flag against a context.
   */
  evaluate<T extends FlagValue = boolean>(
    slug: string,
    context: EvaluationContext,
    localOverrides: Record<string, FlagValue> = {}
  ): EdgeEvaluationResult {
    // 1. Local overrides always win
    if (slug in localOverrides) {
      return { value: localOverrides[slug] as T, reason: 'LOCAL_OVERRIDE' };
    }

    const flag = this.flagIndex.get(slug);

    // If flag doesn't exist in document, return fallback or false
    if (!flag) {
      if (slug in this.fallbackDefaults) {
        return { value: this.fallbackDefaults[slug] as T, reason: 'DEFAULT' };
      }
      return { value: false as T, reason: 'DEFAULT' };
    }

    // Evaluate the flag based on rules, rollout, and experiments
    return this.evaluateInner(flag, context);
  }

  /**
   * Evaluate all flags in the document at once.
   */
  evaluateAll(context: EvaluationContext, localOverrides: Record<string, FlagValue> = {}): Record<string, FlagValue> {
    const results: Record<string, FlagValue> = {};

    for (const flag of this.document.flags) {
      const result = this.evaluateInner(flag, context);
      results[flag.slug] = result.value;
    }

    // Merge in any local overrides and fallbacks
    return { ...this.fallbackDefaults, ...results, ...localOverrides };
  }

  private evaluateInner(flag: FeatureFlag, context: EvaluationContext): EdgeEvaluationResult {
    // 2. Targeting rules
    if (flag.targetingRules && flag.targetingRules.length > 0) {
      // Return the value of the first matching rule
      const ruleValue = evaluateRules(flag.targetingRules, context);
      if (ruleValue !== null) {
        // If the rule has a rollout percentage, evaluate it before accepting the value
        const rule = flag.targetingRules.find(r => r.value === ruleValue);
        if (rule && rule.rolloutPercentage !== undefined) {
          const key = context.userId || context.workspaceId;
          // Use rule ID as salt to prevent hash overlap
          if (isInRollout(key, { percentage: rule.rolloutPercentage, salt: rule.id })) {
            return { value: ruleValue, reason: 'TARGETING_MATCH' };
          }
          // If the rollout fails, we don't return the rule value. We fall through.
        } else {
          // No rule rollout, just standard targeting match
          return { value: ruleValue, reason: 'TARGETING_MATCH' };
        }
      }
    }

    // 3. Experiment Assignment (A/B testing)
    if (flag.experiment) {
      const assignment = assignVariation(flag.experiment, context);
      if (assignment) {
        // Trigger analytics callback synchronously if provided
        if (this.trackingCallback) {
          try {
            this.trackingCallback(assignment);
          } catch (e) {
            // Ignore callback errors during evaluation
          }
        }
        return { value: assignment.value, reason: 'EXPERIMENT_ASSIGNMENT', assignment };
      }
    }

    // 4. Base Gradual Rollout
    if (flag.rollout) {
      const key = getStickinessValue(context, flag.rollout.stickinessKey);

      if (isInRollout(key || '', { ...flag.rollout, salt: flag.rollout.salt || flag.slug })) {
        return { value: flag.defaultValue, reason: 'PERCENTAGE_ROLLOUT' };
      }
      
      // If flag HAS a rollout config, and user is NOT in it, they get false
      // regardless of defaultValue (which applies to those IN the rollout).
      // If we're returning boolean, return false. Otherwise, we can't safely 
      // return a non-boolean default for "off". We return false as unmanaged value.
      return { value: false, reason: 'DEFAULT' };
    }

    // 5. Default Base Value (if no targeting, no experiment, no rollout matched)
    return { value: flag.defaultValue, reason: 'DEFAULT' };
  }
}
