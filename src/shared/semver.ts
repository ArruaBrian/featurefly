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
    if (pre1 === pre2) return operator === 'semver_eq';
    // Simplified string comparison for prereleases (alpha < beta < rc)
    if (pre1 > pre2) return operator === 'semver_gt';
    if (pre1 < pre2) return operator === 'semver_lt';
  }

  return operator === 'semver_eq';
}
