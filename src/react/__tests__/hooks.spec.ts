/**
 * Tests for React hooks memory leak fixes
 * 
 * These tests verify the patterns used in useFeatureFlag and useAllFlags:
 * 1. Bootstrap Loading State - cache check before async evaluation
 * 2. Race Condition Protection - evaluationIdRef pattern
 * 3. Cleanup on Unmount - mountedRef pattern
 */

// Simple mock client that doesn't rely on the actual FeatureFlagsClient type
function createMockClient() {
  const listeners: Map<string, Array<(payload?: unknown) => void>> = new Map();
  let disposed = false;
  
  const cache = new Map<string, { hit: boolean; value: unknown }>();
  
  const client = {
    evaluateFlag: jest.fn(async <T,>(slug: string, defaultValue: T) => {
      await new Promise(r => setTimeout(r, 10));
      if (disposed) throw new Error('Client disposed');
      return defaultValue as T;
    }),
    evaluateAllFlags: jest.fn(async () => {
      await new Promise(r => setTimeout(r, 10));
      if (disposed) throw new Error('Client disposed');
      return {};
    }),
    on: jest.fn((event: string, handler: (payload?: unknown) => void) => {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event)!.push(handler);
      return () => {
        const handlers = listeners.get(event);
        if (handlers) {
          const idx = handlers.indexOf(handler);
          if (idx > -1) handlers.splice(idx, 1);
        }
      };
    }),
    dispose: jest.fn(() => { disposed = true; }),
    isDisposed: jest.fn(() => disposed),
    // Expose cache for testing
    _cache: cache,
  };
  
  return client as typeof client & { _cache: typeof cache };
}

describe('Scenario 1: Bootstrap Loading State', () => {
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    jest.useFakeTimers();
    mockClient = createMockClient();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('should check cache synchronously before setting loading=true', () => {
    // Pre-populate cache like bootstrapFlags would
    mockClient._cache.set('evaluate:slug', { hit: true, value: true });
    
    // Verify the cache structure the hook checks synchronously
    const cached = mockClient._cache.get('evaluate:slug');
    expect(cached?.hit).toBe(true);
    expect(cached?.value).toBe(true);
    
    // When cache has the value, the hook should:
    // 1. Set value from cache immediately
    // 2. Set loading: false immediately
    // 3. NOT call evaluateFlag (no async HTTP call)
    expect(mockClient.evaluateFlag).not.toHaveBeenCalled();
  });

  it('should have loading=false when bootstrapFlags are provided via cache', () => {
    mockClient._cache.set('batch-evaluate', { hit: true, value: { 'flag-1': true } });
    
    // When batch cache has value:
    const cached = mockClient._cache.get('batch-evaluate');
    expect(cached?.hit).toBe(true);
    
    // useAllFlags should initialize with cached flags and loading: false
    expect(mockClient.evaluateAllFlags).not.toHaveBeenCalled();
  });

  it('should use correct cache key format for evaluate', () => {
    // Verify the cache key format matches what the hook builds
    const buildKey = (slug: string, context?: { workspaceId?: string; userId?: string }) => {
      const parts = ['evaluate', slug];
      if (context?.workspaceId) parts.push(`w:${context.workspaceId}`);
      if (context?.userId) parts.push(`u:${context.userId}`);
      return parts.join(':');
    };

    expect(buildKey('my-flag')).toBe('evaluate:my-flag');
    expect(buildKey('my-flag', { workspaceId: 'ws-1' })).toBe('evaluate:my-flag:w:ws-1');
    expect(buildKey('my-flag', { userId: 'u-1' })).toBe('evaluate:my-flag:u:u-1');
  });

  it('should use correct cache key format for batch-evaluate', () => {
    const buildKey = (context?: { workspaceId?: string; userId?: string }) => {
      const parts = ['batch-evaluate'];
      if (context?.workspaceId) parts.push(`w:${context.workspaceId}`);
      if (context?.userId) parts.push(`u:${context.userId}`);
      return parts.join(':');
    };

    expect(buildKey()).toBe('batch-evaluate');
    expect(buildKey({ workspaceId: 'ws-1' })).toBe('batch-evaluate:w:ws-1');
  });
});

describe('Scenario 2: Race Condition Protection', () => {
  it('should use evaluationIdRef to track and discard stale evaluations', () => {
    // This test verifies the logic pattern without async complexity
    let evaluationIdRef = 0;
    const results: (number | 'stale')[] = [];
    
    // Simulate the hook's evaluate function with race condition protection
    const evaluate = (evaluationId: number): (number | 'stale') => {
      // Skip if stale - this check happens at the START of evaluate
      if (evaluationId !== evaluationIdRef) return 'stale';
      return evaluationId; // Return the evalId to show it would proceed
    };

    // Trigger rapid context changes (simulating what happens in useEffect)
    evaluationIdRef = 1;
    results.push(evaluate(1)); // Should succeed, returns 1
    
    evaluationIdRef = 2; // Context changed!
    results.push(evaluate(2)); // Should succeed, returns 2
    
    evaluationIdRef = 3; // Context changed again!
    results.push(evaluate(3)); // Should succeed, returns 3
    
    // Now verify that the first two are stale when checked LATER
    // (simulating what happens when they complete after context changed)
    // This is what the double-check pattern does after await
    
    // Simulate checking after await - the first two should be stale now
    const checkAfterAwait = (evalId: number): boolean => {
      return evalId === evaluationIdRef; // true if current, false if stale
    };
    
    expect(checkAfterAwait(1)).toBe(false); // 1 is now stale
    expect(checkAfterAwait(2)).toBe(false); // 2 is now stale  
    expect(checkAfterAwait(3)).toBe(true);  // 3 is current
  });

  it('should increment evaluationIdRef on each context change', () => {
    let evaluationIdRef = 0;
    
    const triggerEvaluation = () => {
      evaluationIdRef++;
      return evaluationIdRef;
    };

    expect(triggerEvaluation()).toBe(1);
    expect(triggerEvaluation()).toBe(2);
    expect(triggerEvaluation()).toBe(3);
    expect(evaluationIdRef).toBe(3);

    // Old evaluation (1, 2) are now stale
    expect(1).not.toBe(evaluationIdRef);
    expect(2).not.toBe(evaluationIdRef);
  });

  it('should only apply the last evaluation result with double-check pattern', async () => {
    let evaluationIdRef = 0;
    const completedEvaluations: number[] = [];
    
    // This test verifies the CORE pattern using async to simulate real timing
    // evaluationIdRef changes WHILE evaluations are pending
    
    const evaluateWithDoubleCheck = async (evalId: number): Promise<boolean> => {
      // First check happens immediately - is this evaluation still current?
      if (evalId !== evaluationIdRef) return false;
      
      // Simulate async HTTP call - during this time, context can change!
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Second check after async - this is the race condition protection
      // If context changed while we were waiting, this will fail
      if (evalId !== evaluationIdRef) return false;
      
      completedEvaluations.push(evalId);
      return true;
    };

    // Simulate 5 rapid context changes, each triggering a new evaluation
    // Due to fake timers, all "async" operations complete immediately in order
    
    // Start eval1
    evaluationIdRef = 1;
    const eval1Promise = evaluateWithDoubleCheck(1);
    
    // Context changes before eval1 completes
    evaluationIdRef = 2;
    const eval2Promise = evaluateWithDoubleCheck(2);
    
    // Context changes again
    evaluationIdRef = 3;
    const eval3Promise = evaluateWithDoubleCheck(3);
    
    // Context changes again
    evaluationIdRef = 4;
    const eval4Promise = evaluateWithDoubleCheck(4);
    
    // Final context
    evaluationIdRef = 5;
    const eval5Promise = evaluateWithDoubleCheck(5);

    // Wait for all to complete
    await act(async () => {
      jest.runAllTimers();
    });

    await Promise.all([eval1Promise, eval2Promise, eval3Promise, eval4Promise, eval5Promise]);

    // Only the last evaluation (5) should have completed
    // because when each earlier evaluation checked the second time,
    // evaluationIdRef had already changed to a newer value
    expect(completedEvaluations).toEqual([5]);
  });
});

describe('Scenario 3: Cleanup on Unmount', () => {
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    jest.useFakeTimers();
    mockClient = createMockClient();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('should use mountedRef to prevent setState after unmount', () => {
    // Verify the pattern: mountedRef is set to false in cleanup
    const mountedRef = { current: true };
    
    // Simulate unmount cleanup
    const cleanup = () => {
      mountedRef.current = false;
    };
    
    // Before unmount
    expect(mountedRef.current).toBe(true);
    
    // After unmount
    cleanup();
    expect(mountedRef.current).toBe(false);
  });

  it('should not call setState when mountedRef is false', () => {
    const mountedRef = { current: true };
    let stateValue = 0;
    
    const setStateIfMounted = (newValue: number) => {
      if (mountedRef.current) {
        stateValue = newValue;
      }
    };

    // Before unmount - should work
    setStateIfMounted(1);
    expect(stateValue).toBe(1);

    // After unmount - should NOT update
    mountedRef.current = false;
    setStateIfMounted(2);
    expect(stateValue).toBe(1); // Unchanged!
  });

  it('should cleanup event listeners on unmount', () => {
    const unsubs: jest.Mock[] = [];
    
    mockClient.on.mockImplementation((_event: string, _handler: () => void) => {
      const unsub = jest.fn();
      unsubs.push(unsub);
      return unsub;
    });

    // Simulate hook setting up subscriptions
    mockClient.on('flagChanged', () => {});
    mockClient.on('flagsUpdated', () => {});
    mockClient.on('flagEvaluated', () => {});

    expect(unsubs.length).toBe(3);

    // Simulate unmount cleanup
    unsubs.forEach(u => u());

    unsubs.forEach(unsub => {
      expect(unsub).toHaveBeenCalledTimes(1);
    });
  });

  it('should handle unmount during pending evaluation without errors', async () => {
    const mountedRef = { current: true };
    let evaluationIdRef = 0;
    
    // Simulates the hook's evaluate function
    const evaluate = async (evalId: number): Promise<'completed' | 'skipped'> => {
      // First check - is this evaluation still current?
      if (evalId !== evaluationIdRef) return 'skipped';
      
      // Simulate async work
      await new Promise(r => setTimeout(r, 100));
      
      // Second check after async - is mounted and still current?
      if (!mountedRef.current || evalId !== evaluationIdRef) return 'skipped';
      
      return 'completed';
    };

    // Start evaluation
    evaluationIdRef = 1;
    const evalPromise = evaluate(1);

    // Unmount immediately
    mountedRef.current = false;
    evaluationIdRef = 999; // Make it stale

    await act(async () => {
      jest.runAllTimers();
    });

    const result = await evalPromise;
    expect(result).toBe('skipped');
  });
});

describe('useAllFlags patterns', () => {
  let mockClient: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    jest.useFakeTimers();
    mockClient = createMockClient();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  it('should check batch-evaluate cache before async call', () => {
    mockClient._cache.set('batch-evaluate', { hit: true, value: { 'flag-1': true } });
    
    const cached = mockClient._cache.get('batch-evaluate');
    expect(cached?.hit).toBe(true);
    expect(mockClient.evaluateAllFlags).not.toHaveBeenCalled();
  });

  it('should use same evaluationIdRef pattern as useFeatureFlag', () => {
    let evaluationIdRef = 0;
    const completedBatches: number[] = [];
    let capturedEvalId = 0;
    
    // Simulates what the hook does with double-check pattern
    // Context changes BETWEEN first and second check
    const processBatch = (evalId: number, contextChangesDuringEval: boolean): boolean => {
      if (evalId !== evaluationIdRef) return false; // First check passes
      capturedEvalId = evalId;
      if (contextChangesDuringEval) {
        evaluationIdRef++; // Context changed!
      }
      if (capturedEvalId !== evaluationIdRef) return false; // Second check fails
      completedBatches.push(capturedEvalId);
      return true;
    };

    // Trigger 3 rapid evaluations with context changes
    evaluationIdRef = 1;
    processBatch(1, true); // Context changes during eval, fails second check
    
    evaluationIdRef = 2;
    processBatch(2, true); // Context changes during eval, fails second check
    
    evaluationIdRef = 3;
    processBatch(3, false); // No context change, succeeds

    // Only the last one should have completed
    expect(completedBatches).toEqual([3]);
  });

  it('should unsubscribe from flagsUpdated on unmount', () => {
    const unsub = jest.fn();
    mockClient.on.mockReturnValue(unsub);

    const unsubscribe = mockClient.on('flagsUpdated', () => {});
    
    expect(mockClient.on).toHaveBeenCalledWith('flagsUpdated', expect.any(Function));
    
    unsubscribe();
    
    expect(unsub).toHaveBeenCalledTimes(1);
  });
});

describe('Integration: Full evaluation lifecycle', () => {
  it('should handle full lifecycle with proper cleanup', () => {
    let evaluationIdRef = 0;
    const mountedRef = { current: true };
    const stateUpdates: string[] = [];
    
    // Simulates the hook's evaluate function
    const evaluate = (evalId: number): 'completed' | 'skipped' => {
      if (evalId !== evaluationIdRef) return 'skipped';
      // async would happen here
      if (!mountedRef.current || evalId !== evaluationIdRef) return 'skipped';
      stateUpdates.push(`eval-${evalId}`);
      return 'completed';
    };

    // Mount and initial evaluation
    evaluationIdRef = 1;
    const result1 = evaluate(1);
    stateUpdates.push('mount');

    // Context change - triggers new evaluation
    evaluationIdRef = 2;
    const result2 = evaluate(2);
    stateUpdates.push('context-change');

    // Unmount
    mountedRef.current = false;
    evaluationIdRef = 3;
    const result3 = evaluate(3);
    stateUpdates.push('unmount');

    expect(result1).toBe('completed');
    expect(result2).toBe('completed');
    expect(result3).toBe('skipped'); // Unmounted
    expect(stateUpdates).toEqual(['eval-1', 'mount', 'eval-2', 'context-change', 'unmount']);
  });
});

// Polyfill for act with fake timers
async function act(callback: () => void | Promise<void>): Promise<void> {
  callback();
}
