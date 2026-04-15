/**
 * Edge Mode Integration Tests
 * 
 * Tests offline evaluation with FlagDocument.
 * Uses edgeDocument constructor option to initialize without HTTP.
 */

import { FeatureFlagsClient } from '../../client';
import { FlagDocument } from '../../types';

describe('Edge Mode Integration Tests', () => {
  describe('Edge document initialization via constructor', () => {
    it('should evaluate flags from edge document without HTTP', async () => {
      const edgeDocument: FlagDocument = {
        version: 1,
        fetchedAt: new Date().toISOString(),
        flags: [
          {
            id: 'edge-1',
            slug: 'edge-flag',
            name: 'Edge Flag',
            category: 'both',
            defaultValue: true,
            valueType: 'boolean',
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      };

      const client = new FeatureFlagsClient({
        baseUrl: 'http://localhost',
        edgeDocument,
      });

      // Should immediately evaluate from document (async but fast in edge mode)
      const result = await client.evaluateFlag('edge-flag', false);
      expect(result).toBe(true);

      // Cache should be empty since edge mode doesn't use cache for evaluations
      const stats = client.getCacheStats();
      expect(stats.size).toBe(0);

      client.dispose();
    });

    it('should evaluate targeting rules correctly', async () => {
      const edgeDocument: FlagDocument = {
        version: 1,
        fetchedAt: new Date().toISOString(),
        flags: [
          {
            id: 'edge-1',
            slug: 'target-flag',
            name: 'Target Flag',
            category: 'both',
            defaultValue: true,
            valueType: 'boolean',
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            targetingRules: [
              {
                id: 'rule-1',
                priority: 1,
                value: false,
                conditions: [
                  { attribute: 'plan', operator: 'equals', value: 'enterprise' },
                ],
              },
            ],
          },
        ],
      };

      const client = new FeatureFlagsClient({
        baseUrl: 'http://localhost',
        edgeDocument,
      });

      // Without matching context, should return default (true)
      const defaultResult = await client.evaluateFlag('target-flag', false);
      expect(defaultResult).toBe(true);

      // With matching targeting context (plan = enterprise), should return rule value (false)
      const targetedResult = await client.evaluateFlag('target-flag', true, {
        attributes: { plan: 'enterprise' },
      });
      expect(targetedResult).toBe(false);

      client.dispose();
    });

    it('should evaluate A/B experiments with tracking', async () => {
      const edgeDocument: FlagDocument = {
        version: 1,
        fetchedAt: new Date().toISOString(),
        flags: [
          {
            id: 'exp-1',
            slug: 'ab-experiment',
            name: 'A/B Experiment',
            category: 'both',
            defaultValue: 'control',
            valueType: 'string',
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            experiment: {
              id: 'exp-1',
              variations: [
                { id: 'ctrl', weight: 50, value: 'control' },
                { id: 'treat-a', weight: 50, value: 'treatment-A' },
              ],
            },
          },
        ],
      };

      const exposures: Array<{ experimentId: string; variationId: string }> = [];
      const client = new FeatureFlagsClient({
        baseUrl: 'http://localhost',
        edgeDocument,
        trackingCallback: (data) => {
          exposures.push({ experimentId: data.experimentId, variationId: data.variationId });
        },
      });

      // Evaluate with different users
      await client.evaluateFlag('ab-experiment', 'control', { userId: 'user-A' });
      await client.evaluateFlag('ab-experiment', 'control', { userId: 'user-B' });

      // Each evaluation should have triggered tracking
      expect(exposures.length).toBe(2);

      client.dispose();
    });
  });

  describe('Edge mode with fallback defaults', () => {
    it('should use fallback defaults for missing flags', async () => {
      const edgeDocument: FlagDocument = {
        version: 1,
        fetchedAt: new Date().toISOString(),
        flags: [],
      };

      const client = new FeatureFlagsClient({
        baseUrl: 'http://localhost',
        edgeDocument,
        fallbackDefaults: { 'missing': 'fallback-value' },
      });

      const result = await client.evaluateFlag('missing', 'default');
      expect(result).toBe('fallback-value');

      client.dispose();
    });
  });

  describe('Edge mode with local overrides', () => {
    it('should apply local overrides over edge evaluation', async () => {
      const edgeDocument: FlagDocument = {
        version: 1,
        fetchedAt: new Date().toISOString(),
        flags: [
          {
            id: 'override-test',
            slug: 'override-flag',
            name: 'Override Test',
            category: 'both',
            defaultValue: false,
            valueType: 'boolean',
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      };

      const client = new FeatureFlagsClient({
        baseUrl: 'http://localhost',
        edgeDocument,
        localOverrides: { 'override-flag': true },
      });

      const result = await client.evaluateFlag('override-flag', false);
      expect(result).toBe(true); // Local override wins

      client.dispose();
    });
  });

  describe('Edge mode batch evaluation', () => {
    it('should evaluate all flags from edge document', async () => {
      const edgeDocument: FlagDocument = {
        version: 1,
        fetchedAt: new Date().toISOString(),
        flags: [
          {
            id: 'flag-1',
            slug: 'edge-flag-1',
            name: 'Edge Flag 1',
            category: 'both',
            defaultValue: true,
            valueType: 'boolean',
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: 'flag-2',
            slug: 'edge-flag-2',
            name: 'Edge Flag 2',
            category: 'both',
            defaultValue: 'value',
            valueType: 'string',
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      };

      const client = new FeatureFlagsClient({
        baseUrl: 'http://localhost',
        edgeDocument,
        localOverrides: { 'local-override': 'local-only' },
        fallbackDefaults: { 'fallback-flag': 'fallback' },
      });

      const all = await client.evaluateAllFlags();

      expect(all['edge-flag-1']).toBe(true);
      expect(all['edge-flag-2']).toBe('value');
      expect(all['local-override']).toBe('local-only');
      expect(all['fallback-flag']).toBe('fallback');

      client.dispose();
    });
  });
});
