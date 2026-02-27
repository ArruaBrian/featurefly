import { getHashBucket } from './rollout';
import { Experiment, EvaluationContext, ExperimentAssignment } from './types';

/**
 * Deterministically assigns a user to an experiment variation based on weights.
 *
 * @param experiment The experiment definition with variations and weights
 * @param context The evaluation context (to extract stickiness key)
 * @returns The assigned variation details, or null if assignment fails
 */
export function assignVariation(
  experiment: Experiment | undefined,
  context: EvaluationContext | undefined
): ExperimentAssignment | null {
  if (!experiment || !experiment.variations || experiment.variations.length === 0) {
    return null;
  }

  // Determine stickiness key. Default to userId, then workspaceId.
  let key: string | undefined;
  
  if (experiment.stickinessKey) {
    if (experiment.stickinessKey === 'userId') key = context?.userId;
    else if (experiment.stickinessKey === 'workspaceId') key = context?.workspaceId;
    else key = context?.attributes?.[experiment.stickinessKey] as string;
  } else {
    key = context?.userId || context?.workspaceId;
  }

  // Anonymous users (no key) cannot be deterministically assigned to A/B tests.
  if (!key) {
    return null;
  }

  // Get a bucket from 0 to 9999 (for 0.01% precision in weights)
  const bucket = getHashBucket(key, experiment.salt || experiment.id, 10000);
  
  // Find which variation range this bucket falls into.
  // Variations have weights from 0 to 100.
  // We scale weights to 0-10000 for matching the bucket.
  let cumulativeWeight = 0;
  
  for (const variation of experiment.variations) {
    const scaledWeight = variation.weight * 100; // e.g., 50.5% -> 5050
    cumulativeWeight += scaledWeight;
    
    if (bucket < cumulativeWeight) {
      return {
        experimentId: experiment.id,
        variationId: variation.id,
        value: variation.value,
        context: context || {}
      };
    }
  }

  // Fallback: This only happens if variations sum to < 100% and the bucket
  // falls into the unassigned remaining percentage. If so, they are not in the experiment.
  return null;
}
