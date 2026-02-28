import { evaluateRule, evaluateRules } from '../targeting';
import { TargetingRule } from '../types';

describe('Targeting Engine', () => {
  describe('evaluateRule (Single Rule)', () => {
    it('matches when conditions are empty', () => {
      const rule: TargetingRule = { id: '1', priority: 1, value: true, conditions: [] };
      expect(evaluateRule(rule, {})).toBe(true);
    });

    it('matches exact strings', () => {
      const rule: TargetingRule = {
        id: '1', priority: 1, value: true,
        conditions: [{ attribute: 'country', operator: 'equals', value: 'AR' }]
      };
      expect(evaluateRule(rule, { attributes: { country: 'AR' } })).toBe(true);
      expect(evaluateRule(rule, { attributes: { country: 'BR' } })).toBe(false);
    });

    it('handles top-level context attributes (userId, workspaceId)', () => {
      const ruleWithUser: TargetingRule = {
        id: '1', priority: 1, value: true,
        conditions: [{ attribute: 'userId', operator: 'equals', value: 'u123' }]
      };
      expect(evaluateRule(ruleWithUser, { userId: 'u123' })).toBe(true);
      expect(evaluateRule(ruleWithUser, { userId: 'u999' })).toBe(false);
    });

    it('evaluates AND logic across multiple conditions', () => {
      const rule: TargetingRule = {
        id: '1', priority: 1, value: true,
        conditions: [
          { attribute: 'country', operator: 'equals', value: 'AR' },
          { attribute: 'plan', operator: 'equals', value: 'pro' }
        ]
      };
      // Matches both
      expect(evaluateRule(rule, { attributes: { country: 'AR', plan: 'pro' } })).toBe(true);
      // Fails one
      expect(evaluateRule(rule, { attributes: { country: 'BR', plan: 'pro' } })).toBe(false);
      // Fails both
      expect(evaluateRule(rule, { attributes: { country: 'BR', plan: 'free' } })).toBe(false);
    });

    describe('Operators', () => {
      it('supports contains / not_contains', () => {
        const containsRule: TargetingRule = {
          id: '1', priority: 1, value: true,
          conditions: [{ attribute: 'email', operator: 'contains', value: '@acme.com' }]
        };
        expect(evaluateRule(containsRule, { attributes: { email: 'john@acme.com' } })).toBe(true);
        expect(evaluateRule(containsRule, { attributes: { email: 'john@gmail.com' } })).toBe(false);

        const notContainsRule: TargetingRule = {
          id: '2', priority: 1, value: true,
          conditions: [{ attribute: 'email', operator: 'not_contains', value: '@acme.com' }]
        };
        expect(evaluateRule(notContainsRule, { attributes: { email: 'john@gmail.com' } })).toBe(true);
      });

      it('supports in / not_in', () => {
        const inRule: TargetingRule = {
          id: '1', priority: 1, value: true,
          conditions: [{ attribute: 'role', operator: 'in', value: ['admin', 'manager'] }]
        };
        expect(evaluateRule(inRule, { attributes: { role: 'admin' } })).toBe(true);
        expect(evaluateRule(inRule, { attributes: { role: 'user' } })).toBe(false);
      });

      it('supports numeric comparisons (gt, gte, lt, lte)', () => {
        const gtRule: TargetingRule = {
          id: '1', priority: 1, value: true,
          conditions: [{ attribute: 'age', operator: 'gt', value: 18 }]
        };
        expect(evaluateRule(gtRule, { attributes: { age: 19 } })).toBe(true);
        expect(evaluateRule(gtRule, { attributes: { age: 18 } })).toBe(false);
        expect(evaluateRule(gtRule, { attributes: { age: '20' } })).toBe(true); // Works with string numbers
      });

      it('supports regex', () => {
        const regexRule: TargetingRule = {
          id: '1', priority: 1, value: true,
          conditions: [{ attribute: 'version', operator: 'regex', value: '^v2\\..*' }]
        };
        expect(evaluateRule(regexRule, { attributes: { version: 'v2.1.0' } })).toBe(true);
        expect(evaluateRule(regexRule, { attributes: { version: 'v3.0.0' } })).toBe(false);
      });

      it('safely handles invalid regex', () => {
        const invalidRegexRule: TargetingRule = {
          id: '1', priority: 1, value: true,
          conditions: [{ attribute: 'text', operator: 'regex', value: '*invalid[' }]
        };
        expect(evaluateRule(invalidRegexRule, { attributes: { text: 'anything' } })).toBe(false);
      });

      it('supports basic semver comparisons', () => {
        const semverRule: TargetingRule = {
          id: '1', priority: 1, value: true,
          conditions: [{ attribute: 'version', operator: 'semver_gte' as 'equals', value: '1.2.0' }] // 'semver_gte' is unsupported operator falls to default
        };
        expect(evaluateRule(semverRule, { attributes: { version: '1.3.0' } })).toBe(false);

        const gtSemverRule: TargetingRule = {
          id: '2', priority: 1, value: true,
          conditions: [{ attribute: 'version', operator: 'semver_gt', value: '1.2' }]
        };
        expect(evaluateRule(gtSemverRule, { attributes: { version: '1.3.0' } })).toBe(true);
        expect(evaluateRule(gtSemverRule, { attributes: { version: '1.2.0' } })).toBe(false);
        
        const eqSemverRule: TargetingRule = {
          id: '3', priority: 1, value: true,
          conditions: [{ attribute: 'version', operator: 'semver_eq', value: '2.0.0' }]
        };
        expect(evaluateRule(eqSemverRule, { attributes: { version: '2.0.0' } })).toBe(true);
        expect(evaluateRule(eqSemverRule, { attributes: { version: '2.0' } })).toBe(true); // Now supports padding correctly
        expect(evaluateRule(eqSemverRule, { attributes: { version: '2.0.1' } })).toBe(false);
      });
    });
  });

  describe('evaluateRules (Rule List)', () => {
    it('returns null if no rules provided', () => {
      expect(evaluateRules([], {})).toBeNull();
      expect(evaluateRules(undefined, {})).toBeNull();
    });

    it('returns value of first matching rule based on priority (lower number wins)', () => {
      const rules: TargetingRule[] = [
        {
          id: 'rule2', priority: 2, value: 'silver',
          conditions: [{ attribute: 'tier', operator: 'equals', value: 'premium' }]
        },
        {
          id: 'rule1', priority: 1, value: 'gold', // Should be evaluated first
          conditions: [{ attribute: 'tier', operator: 'equals', value: 'premium' }]
        }
      ];

      expect(evaluateRules(rules, { attributes: { tier: 'premium' } })).toBe('gold');
    });

    it('falls through to next rule if first fails', () => {
      const rules: TargetingRule[] = [
        {
          id: 'rule1', priority: 1, value: 'gold',
          conditions: [{ attribute: 'tier', operator: 'equals', value: 'vip' }]
        },
        {
          id: 'rule2', priority: 2, value: 'silver',
          conditions: [{ attribute: 'domain', operator: 'ends_with', value: '.io' }]
        }
      ];

      // VIP matches rule 1
      expect(evaluateRules(rules, { attributes: { tier: 'vip', domain: 'test.com' } })).toBe('gold');
      
      // .io matches rule 2
      expect(evaluateRules(rules, { attributes: { tier: 'free', domain: 'startup.io' } })).toBe('silver');
      
      // Matches neither
      expect(evaluateRules(rules, { attributes: { tier: 'free', domain: 'test.com' } })).toBeNull();
    });
  });
});
