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
});
