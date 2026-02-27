import { assignVariation } from '../experiment';
import { Experiment } from '../types';

describe('Experiment Engine (A/B Testing)', () => {
  const baseExperiment: Experiment = {
    id: 'exp-1',
    variations: [
      { id: 'v1', weight: 50, value: 'A' },
      { id: 'v2', weight: 50, value: 'B' },
    ]
  };

  it('assigns user to a deterministic variation based on weight', () => {
    const assignment1 = assignVariation(baseExperiment, { userId: 'u123' });
    expect(assignment1).not.toBeNull();
    // Deterministic test: u123 always hashes to the same bucket
    const expectedValue = assignment1!.value;

    const assignment2 = assignVariation(baseExperiment, { userId: 'u123' });
    expect(assignment2?.value).toBe(expectedValue);
  });

  it('assigns different users to different variations evenly (statistical check)', () => {
    let countA = 0;
    let countB = 0;

    for (let i = 0; i < 1000; i++) {
      const assignment = assignVariation(baseExperiment, { userId: `user-${i}` });
      if (assignment?.value === 'A') countA++;
      else if (assignment?.value === 'B') countB++;
    }

    // With 1000 users and 50/50 split, it should be roughly 500 each.
    // Allow a 10% variance for hash distribution at this sample size.
    expect(countA).toBeGreaterThan(400);
    expect(countA).toBeLessThan(600);
    expect(countB).toBeGreaterThan(400);
    expect(countB).toBeLessThan(600);
    expect(countA + countB).toBe(1000); // 100% assigned
  });

  it('returns null if user has no stickiness key', () => {
    // Missing userId, workspaceId, or custom stickiness attribute
    expect(assignVariation(baseExperiment, {})).toBeNull();
    expect(assignVariation(baseExperiment, undefined)).toBeNull();
  });

  it('supports custom stickiness keys from context attributes', () => {
    const expWithCustomKey: Experiment = {
      ...baseExperiment,
      stickinessKey: 'companyId'
    };

    // Fails because companyId is missing
    expect(assignVariation(expWithCustomKey, { userId: 'u1' })).toBeNull();

    // Succeeds with companyId
    const res = assignVariation(expWithCustomKey, { attributes: { companyId: 'c1' } });
    expect(res).not.toBeNull();
    
    // Test deterministic assignment across different users but same company
    const val1 = assignVariation(expWithCustomKey, { userId: 'u1', attributes: { companyId: 'c1' } })?.value;
    const val2 = assignVariation(expWithCustomKey, { userId: 'u2', attributes: { companyId: 'c1' } })?.value;
    
    expect(val1).toBe(val2);
  });

  it('respects variation weights with uneven distribution', () => {
    const skewedExperiment: Experiment = {
      id: 'skewed-1',
      variations: [
        { id: 'v1', weight: 90, value: 'A' },
        { id: 'v2', weight: 10, value: 'B' },
      ]
    };

    let countA = 0;
    let countB = 0;

    for (let i = 0; i < 1000; i++) {
      const assignment = assignVariation(skewedExperiment, { userId: `test-${i}` });
      if (assignment?.value === 'A') countA++;
      else if (assignment?.value === 'B') countB++;
    }

    // Should be around ~900 A and ~100 B
    expect(countA).toBeGreaterThan(800);
    expect(countB).toBeLessThan(200);
  });

  it('returns null if the total weight < 100 and user falls outside', () => {
    const smallExperiment: Experiment = {
      id: 'small',
      variations: [
        { id: 'v1', weight: 10, value: 'A' } // 90% unassigned
      ]
    };

    let assigned = 0;
    let unassigned = 0;

    for (let i = 0; i < 100; i++) {
      const res = assignVariation(smallExperiment, { userId: `u-${i}` });
      if (res) assigned++;
      else unassigned++;
    }

    // Roughly 10 assigned, 90 unassigned
    expect(assigned).toBeGreaterThan(0);
    expect(unassigned).toBeGreaterThan(50);
  });
});
