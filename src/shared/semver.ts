type StringToken = { type: 'string'; value: string };
type NumberToken = { type: 'number'; value: number };
type PreToken = StringToken | NumberToken;

/**
 * Parse pre-release string into tokens per SemVer 2.0.0 Section 11.
 * "alpha.10" → [{ type: 'string', value: 'alpha' }, { type: 'number', value: 10 }]
 */
function parsePreRelease(pre: string): PreToken[] {
  return pre.split('.').map((token) => {
    const num = Number(token);
    if (Number.isInteger(num) && num >= 0) {
      return { type: 'number', value: num } as NumberToken;
    }
    return { type: 'string', value: token } as StringToken;
  });
}

/**
 * Compare two pre-release tokens per SemVer 2.0.0 Section 11.
 * - number vs number: numeric comparison
 * - string vs string: lexicographic comparison
 * - string vs number: string < number (per spec)
 */
function compareTokens(t1: PreToken, t2: PreToken): number {
  // Same type: compare directly
  if (t1.type === 'number' && t2.type === 'number') {
    return t1.value - t2.value;
  }
  if (t1.type === 'string' && t2.type === 'string') {
    return t1.value.localeCompare(t2.value);
  }
  // Different types: string < number per spec
  return t1.type === 'string' ? -1 : 1;
}

/**
 * Compare pre-release strings per SemVer 2.0.0 Section 11.
 * - Identifiers consisting of digits only are compared numerically
 * - Identifiers with letters/hyphens are compared lexically
 * - When comparing different types in same position: string < number
 * - Fewer tokens is lower than more specific (e.g., alpha < alpha.1)
 */
function comparePreRelease(pre1: string, pre2: string): number {
  const tokens1 = parsePreRelease(pre1);
  const tokens2 = parsePreRelease(pre2);

  const maxLen = Math.max(tokens1.length, tokens2.length);

  for (let i = 0; i < maxLen; i++) {
    // Missing token means the shorter one is lower (per spec point 1)
    if (i >= tokens1.length) return -1;
    if (i >= tokens2.length) return 1;

    const cmp = compareTokens(tokens1[i], tokens2[i]);
    if (cmp !== 0) return cmp;
  }

  return 0;
}

export function compareSemverStrict(v1: string, v2: string, operator: 'semver_eq' | 'semver_gt' | 'semver_lt'): boolean {
  if (typeof v1 !== 'string' || typeof v2 !== 'string') return false;

  // Extremely lightweight, naive parser for x.y.z-beta.1+build.123
  // Drops build metadata (+...) completely for comparison
  const cleanV1 = v1.split('+')[0] || '';
  const cleanV2 = v2.split('+')[0] || '';

  const [core1, pre1] = cleanV1.split('-');
  const [core2, pre2] = cleanV2.split('-');

  const parts1 = core1.split('.').map(Number);
  const parts2 = core2.split('.').map(Number);

  // Pad arrays to 3 items (major.minor.patch)
  for (let i = 0; i < 3; i++) {
    if (isNaN(parts1[i])) parts1[i] = 0;
    if (isNaN(parts2[i])) parts2[i] = 0;
  }

  for (let i = 0; i < 3; i++) {
    if (parts1[i] > parts2[i]) return operator === 'semver_gt';
    if (parts1[i] < parts2[i]) return operator === 'semver_lt';
  }

  // Cores are equal. Check prerelease tags.
  // A version with a prerelease tag is strictly lower than a version without one.
  // e.g. 1.0.0-beta < 1.0.0
  if (pre1 && !pre2) return operator === 'semver_lt';
  if (!pre1 && pre2) return operator === 'semver_gt';

  if (pre1 && pre2) {
    const cmp = comparePreRelease(pre1, pre2);
    if (cmp > 0) return operator === 'semver_gt';
    if (cmp < 0) return operator === 'semver_lt';
    return operator === 'semver_eq';
  }

  return operator === 'semver_eq';
}
