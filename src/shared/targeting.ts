import { EvaluationContext, FlagValue, TargetingRule, TargetingCondition } from './types';

/**
 * Evaluates a set of targeting rules against an evaluation context.
 * Returns the value of the first matching rule, or null if no rules match.
 */
export function evaluateRules(rules: TargetingRule[] | undefined, context: EvaluationContext | undefined): FlagValue | null {
  if (!rules || rules.length === 0) return null;

  // Sort by priority (lower number = higher priority / evaluated first)
  const sortedRules = [...rules].sort((a, b) => a.priority - b.priority);

  for (const rule of sortedRules) {
    if (evaluateRule(rule, context)) {
      // NOTE: Rollout percentage within a rule is evaluated separately by the rollout engine.
      // If a rule matches, its value is the candidate. 
      return rule.value;
    }
  }

  return null;
}

/**
 * Evaluates a single rule. A rule matches if ALL its conditions match (AND logic).
 */
export function evaluateRule(rule: TargetingRule, context: EvaluationContext | undefined): boolean {
  if (!rule.conditions || rule.conditions.length === 0) {
    return true; // Empty conditions match everyone
  }

  for (const condition of rule.conditions) {
    if (!evaluateCondition(condition, context)) {
      return false; // ANY condition fails -> rule fails
    }
  }

  return true; // ALL conditions matched
}

/**
 * Evaluates a single condition against the context.
 */
function evaluateCondition(condition: TargetingCondition, context: EvaluationContext | undefined): boolean {
  const { attribute, operator, value: targetValue } = condition;
  const contextValue = getContextAttribute(attribute, context);

  if (contextValue === undefined && operator !== 'not_equals' && operator !== 'not_contains' && operator !== 'not_in') {
    return false; // Missing attribute fails most checks
  }

  switch (operator) {
    case 'equals':
      return String(contextValue) === String(targetValue);
    case 'not_equals':
      return String(contextValue) !== String(targetValue);
    case 'contains':
      return typeof contextValue === 'string' && String(targetValue) !== '' && contextValue.includes(String(targetValue));
    case 'not_contains':
      return typeof contextValue !== 'string' || String(targetValue) === '' || !contextValue.includes(String(targetValue));
    case 'starts_with':
      return typeof contextValue === 'string' && String(targetValue) !== '' && contextValue.startsWith(String(targetValue));
    case 'ends_with':
      return typeof contextValue === 'string' && String(targetValue) !== '' && contextValue.endsWith(String(targetValue));
    case 'in':
      return Array.isArray(targetValue) && targetValue.map(String).includes(String(contextValue));
    case 'not_in':
      return !Array.isArray(targetValue) || !targetValue.map(String).includes(String(contextValue));
    case 'gt':
      return isNumeric(contextValue) && isNumeric(targetValue) && Number(contextValue) > Number(targetValue);
    case 'gte':
      return isNumeric(contextValue) && isNumeric(targetValue) && Number(contextValue) >= Number(targetValue);
    case 'lt':
      return isNumeric(contextValue) && isNumeric(targetValue) && Number(contextValue) < Number(targetValue);
    case 'lte':
      return isNumeric(contextValue) && isNumeric(targetValue) && Number(contextValue) <= Number(targetValue);
    case 'regex':
      try {
        const regex = new RegExp(String(targetValue));
        return typeof contextValue === 'string' && regex.test(contextValue);
      } catch (e) {
        return false; // Invalid regex fails
      }
    case 'semver_eq':
    case 'semver_gt':
    case 'semver_lt':
      return compareSemver(String(contextValue), String(targetValue), operator);
    default:
      return false; // Unknown operator fails
  }
}

/**
 * Extracts an attribute from the context.
 * Supports special top-level attributes like 'userId' and 'workspaceId'.
 */
function getContextAttribute(attribute: string, context: EvaluationContext | undefined): string | number | boolean | undefined {
  if (!context) return undefined;

  if (attribute === 'userId') return context.userId;
  if (attribute === 'workspaceId') return context.workspaceId;

  return context.attributes?.[attribute];
}

/**
 * Checks if a value is numeric.
 */
function isNumeric(value: unknown): boolean {
  if (typeof value === 'number') return true;
  if (typeof value === 'string') return value.trim() !== '' && !Number.isNaN(Number(value));
  return false;
}

/**
 * Basic semantic version comparison.
 * Note: Assumes standard x.y.z format without prerelease tags for simplicity in this lightweight implementation.
 */
function compareSemver(v1: string, v2: string, operator: 'semver_eq' | 'semver_gt' | 'semver_lt'): boolean {
  if (typeof v1 !== 'string' || typeof v2 !== 'string') return false;

  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  // Pad arrays to same length
  const maxLength = Math.max(parts1.length, parts2.length);
  for (let i = 0; i < maxLength; i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;

    if (p1 > p2) return operator === 'semver_gt';
    if (p1 < p2) return operator === 'semver_lt';
  }

  // All parts equal numerically up to maxLength
  // For exact match, strictly require identical structures or 0-padding equivalence
  // We'll consider 2.0.0 and 2.0 NOT equal for strictness in rule targeting, 
  // users should specify full versions.
  if (operator === 'semver_eq') {
    return parts1.length === parts2.length;
  }

  return false;
}
