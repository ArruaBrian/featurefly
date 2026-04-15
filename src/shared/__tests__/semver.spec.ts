import { compareSemverStrict } from '../semver';

describe('compareSemverStrict', () => {
  it('should evaluate semver_eq correctly', () => {
    expect(compareSemverStrict('1.0.0', '1.0.0', 'semver_eq')).toBe(true);
    expect(compareSemverStrict('1.0', '1.0.0', 'semver_eq')).toBe(true);
    expect(compareSemverStrict('1.0.0-beta.1', '1.0.0-beta.1', 'semver_eq')).toBe(true);
    expect(compareSemverStrict('1.0.0', '1.0.1', 'semver_eq')).toBe(false);
  });

  it('should evaluate semver_gt correctly', () => {
    expect(compareSemverStrict('2.0.0', '1.0.0', 'semver_gt')).toBe(true);
    expect(compareSemverStrict('1.1.0', '1.0.9', 'semver_gt')).toBe(true);
    expect(compareSemverStrict('1.0.1', '1.0.0', 'semver_gt')).toBe(true);
    expect(compareSemverStrict('1.0.0', '1.0.0-beta', 'semver_gt')).toBe(true);
    expect(compareSemverStrict('1.0.0-rc', '1.0.0-beta', 'semver_gt')).toBe(true);
    expect(compareSemverStrict('1.0.0', '2.0.0', 'semver_gt')).toBe(false);
  });

  it('should evaluate semver_lt correctly', () => {
    expect(compareSemverStrict('1.0.0', '2.0.0', 'semver_lt')).toBe(true);
    expect(compareSemverStrict('1.0.9', '1.1.0', 'semver_lt')).toBe(true);
    expect(compareSemverStrict('1.0.0', '1.0.1', 'semver_lt')).toBe(true);
    expect(compareSemverStrict('1.0.0-beta', '1.0.0', 'semver_lt')).toBe(true);
    expect(compareSemverStrict('1.0.0-alpha', '1.0.0-beta', 'semver_lt')).toBe(true);
    expect(compareSemverStrict('2.0.0', '1.0.0', 'semver_lt')).toBe(false);
  });

  it('should strip build metadata (+)', () => {
    expect(compareSemverStrict('1.0.0+build.123', '1.0.0', 'semver_eq')).toBe(true);
    expect(compareSemverStrict('1.0.0+build.123', '1.0.0+build.456', 'semver_eq')).toBe(true);
  });

  it('should handle malformed versions gracefully', () => {
    expect(compareSemverStrict('invalid', '1.0.0', 'semver_eq')).toBe(false);
    expect(compareSemverStrict('invalid', '1.0.0', 'semver_lt')).toBe(true); // 0.0.0 < 1.0.0
  });

  // SemVer 2.0.0 Section 11: Numeric identifiers compared numerically, others lexicially
  describe('pre-release token comparison (SemVer 2.0.0 Section 11)', () => {
    it('should compare numeric tokens numerically (alpha.10 > alpha.9)', () => {
      expect(compareSemverStrict('1.0.0-alpha.10', '1.0.0-alpha.9', 'semver_gt')).toBe(true);
      expect(compareSemverStrict('1.0.0-alpha.10', '1.0.0-alpha.9', 'semver_lt')).toBe(false);
    });

    it('should compare string tokens lexically (alpha < beta)', () => {
      expect(compareSemverStrict('1.0.0-alpha', '1.0.0-beta', 'semver_lt')).toBe(true);
      expect(compareSemverStrict('1.0.0-alpha', '1.0.0-beta', 'semver_gt')).toBe(false);
    });

    it('should compare numeric tokens within same string prefix (alpha.1 < alpha.2)', () => {
      expect(compareSemverStrict('1.0.0-alpha.1', '1.0.0-alpha.2', 'semver_lt')).toBe(true);
      expect(compareSemverStrict('1.0.0-alpha.2', '1.0.0-alpha.1', 'semver_gt')).toBe(true);
    });

    it('should compare alpha < beta lexically in pre-release context', () => {
      expect(compareSemverStrict('1.0.0-alpha.1', '1.0.0-beta', 'semver_lt')).toBe(true);
    });

    it('should compare pure numeric pre-release tokens numerically (1 < 2)', () => {
      expect(compareSemverStrict('1.0.0-1', '1.0.0-2', 'semver_lt')).toBe(true);
      expect(compareSemverStrict('1.0.0-2', '1.0.0-1', 'semver_gt')).toBe(true);
    });

    it('should treat fewer tokens as lower (alpha < alpha.1)', () => {
      expect(compareSemverStrict('1.0.0-alpha', '1.0.0-alpha.1', 'semver_lt')).toBe(true);
      expect(compareSemverStrict('1.0.0-alpha.1', '1.0.0-alpha', 'semver_gt')).toBe(true);
    });
  });
});
