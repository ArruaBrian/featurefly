import { EdgeEvaluator } from '../edge-evaluator';
import { FlagDocument, FeatureFlag } from '../types';

describe('Edge Evaluator', () => {
  const mockFlag: FeatureFlag = {
    id: 'f1',
    slug: 'my-flag',
    name: 'My Flag',
    category: 'both',
    defaultValue: true,
    valueType: 'boolean',
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const document: FlagDocument = {
    flags: [mockFlag],
    version: 1,
    fetchedAt: new Date().toISOString()
  };

  it('evaluates base default value', () => {
    const evaluator = new EdgeEvaluator(document);
    const result = evaluator.evaluate('my-flag', {});
    expect(result.value).toBe(true);
    expect(result.reason).toBe('DEFAULT');
  });

  it('evaluates to false if flag is not in document and no fallback', () => {
    const evaluator = new EdgeEvaluator(document);
    const result = evaluator.evaluate('missing-flag', {});
    expect(result.value).toBe(false);
    expect(result.reason).toBe('DEFAULT');
  });

  it('uses fallback defaults if flag missing', () => {
    const evaluator = new EdgeEvaluator(document, { 'missing-flag': 'blue' });
    const result = evaluator.evaluate('missing-flag', {});
    expect(result.value).toBe('blue');
  });

  it('local overrides win against everything', () => {
    const evaluator = new EdgeEvaluator(document);
    const result = evaluator.evaluate('my-flag', {}, { 'my-flag': false });
    expect(result.value).toBe(false);
    expect(result.reason).toBe('LOCAL_OVERRIDE');
  });

  it('evaluates targeting rules with priority', () => {
    const flagWithRules: FeatureFlag = {
      ...mockFlag,
      targetingRules: [
        {
          id: 'rule1', priority: 1, value: false,
          conditions: [{ attribute: 'beta', operator: 'equals', value: true }]
        }
      ]
    };
    const evaluator = new EdgeEvaluator({ ...document, flags: [flagWithRules] });

    // Match rule
    const res1 = evaluator.evaluate('my-flag', { attributes: { beta: true } });
    expect(res1.value).toBe(false);
    expect(res1.reason).toBe('TARGETING_MATCH');

    // Miss rule, fall to default
    const res2 = evaluator.evaluate('my-flag', { attributes: { beta: false } });
    expect(res2.value).toBe(true);
    expect(res2.reason).toBe('DEFAULT');
  });

  it('evaluates rollout percentage on rules', () => {
    const flagWithRules: FeatureFlag = {
      ...mockFlag,
      targetingRules: [
        {
          id: 'rule1', priority: 1, value: false, rolloutPercentage: 0, // 0% rollout -> never hits
          conditions: [{ attribute: 'beta', operator: 'equals', value: true }]
        }
      ]
    };
    const evaluator = new EdgeEvaluator({ ...document, flags: [flagWithRules] });

    // Matches condition but fails rollout, falls through to default
    const res1 = evaluator.evaluate('my-flag', { userId: 'u1', attributes: { beta: true } });
    expect(res1.value).toBe(true); // Default
  });

  it('evaluates A/B experiments', () => {
    const flagWithExp: FeatureFlag = {
      ...mockFlag,
      experiment: {
        id: 'exp1',
        variations: [
          { id: 'v1', weight: 100, value: 'variant-A' }
        ]
      }
    };
    const trackingCb = jest.fn();
    const evaluator = new EdgeEvaluator({ ...document, flags: [flagWithExp] }, {}, trackingCb);

    const res = evaluator.evaluate('my-flag', { userId: 'u123' });
    expect(res.value).toBe('variant-A');
    expect(res.reason).toBe('EXPERIMENT_ASSIGNMENT');
    expect(trackingCb).toHaveBeenCalledWith(expect.objectContaining({
      experimentId: 'exp1',
      variationId: 'v1',
      value: 'variant-A'
    }));
  });

  it('evaluates base rollout', () => {
    const flagWithRollout: FeatureFlag = {
      ...mockFlag,
      defaultValue: 'green',
      valueType: 'string',
      rollout: { percentage: 0 } // No one gets the feature
    };
    const evaluator = new EdgeEvaluator({ ...document, flags: [flagWithRollout] });

    // Misses rollout, returns false
    const res = evaluator.evaluate('my-flag', { userId: 'u1' });
    expect(res.value).toBe(false);
    expect(res.reason).toBe('DEFAULT');
  });

  it('handles batch evaluation (evaluateAll)', () => {
    const evaluator = new EdgeEvaluator(document, { fallback: 'x' });
    const localOverrides = { local: 'y' };
    
    const res = evaluator.evaluateAll({}, localOverrides);
    
    expect(res).toEqual({
      'my-flag': true, // from doc
      'fallback': 'x', // from fallbacks
      'local': 'y',    // from overrides
    });
  });

  it('supports updating the document dynamically', () => {
    const evaluator = new EdgeEvaluator(document);
    expect(evaluator.evaluate('my-flag', {}).value).toBe(true);

    const updatedDoc: FlagDocument = {
      ...document,
      flags: [{ ...mockFlag, defaultValue: false }]
    };
    evaluator.updateDocument(updatedDoc);

    expect(evaluator.evaluate('my-flag', {}).value).toBe(false);
  });
});
