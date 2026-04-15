/**
 * Serializes an object to a stable (deterministic) JSON string.
 * Keys are sorted alphabetically to ensure consistent ordering.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(value, Object.keys(value as object).sort());
}
