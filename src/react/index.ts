// ═══════════════════════════════════════════════════════════════════════════════
// FeatureFly — React Hooks
// ═══════════════════════════════════════════════════════════════════════════════
//
// Thin wrapper providing React hooks for FeatureFly SDK.
// Requires React 18+ (useSyncExternalStore).
//
// Usage:
//   import { FeatureFlyProvider, useFeatureFlag, useAllFlags } from 'featurefly/react';
//
// ═══════════════════════════════════════════════════════════════════════════════

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  createElement,
  type ReactNode,
} from 'react';
import type { FeatureFlagsClient } from '../shared/client';
import type { EvaluationContext, FlagValue, FlagChangedPayload } from '../shared/types';
import { stableStringify } from '../shared/utils';

// ─── Context ────────────────────────────────────────────────────────────────────

const FeatureFlyContext = createContext<FeatureFlagsClient | null>(null);

/**
 * Provider component that makes the FeatureFlagsClient available to all hooks.
 *
 * @example
 * ```tsx
 * <FeatureFlyProvider client={client}>
 *   <App />
 * </FeatureFlyProvider>
 * ```
 */
export function FeatureFlyProvider({
  client,
  children,
}: {
  client: FeatureFlagsClient;
  children: ReactNode;
}) {
  return createElement(FeatureFlyContext.Provider, { value: client }, children);
}

function useClient(): FeatureFlagsClient {
  const client = useContext(FeatureFlyContext);
  if (!client) {
    throw new Error(
      'useFeatureFlag must be used within a <FeatureFlyProvider>. ' +
      'Wrap your component tree with <FeatureFlyProvider client={client}>.',
    );
  }
  return client;
}

// ─── useFeatureFlag ─────────────────────────────────────────────────────────────

export interface UseFeatureFlagResult<T> {
  value: T;
  loading: boolean;
  error: Error | null;
}

/**
 * React hook for evaluating a single feature flag.
 * Automatically re-evaluates when the flag changes via streaming or cache invalidation.
 *
 * @param slug Flag slug identifier
 * @param defaultValue Default value while loading
 * @param context Optional evaluation context
 *
 * @example
 * ```tsx
 * const { value, loading } = useFeatureFlag('new-checkout', false);
 *
 * if (loading) return <Spinner />;
 * return value ? <NewCheckout /> : <LegacyCheckout />;
 * ```
 */
export function useFeatureFlag<T extends FlagValue = boolean>(
  slug: string,
  defaultValue: T,
  context?: EvaluationContext,
): UseFeatureFlagResult<T> {
  const client = useClient();
  
  // Track mounted state to prevent setState after unmount
  const mountedRef = useRef(true);
  // Track current evaluation request to handle race conditions
  const evaluationIdRef = useRef(0);
  
  const [value, setValue] = useState<T>(defaultValue);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Memoize context to avoid infinite re-renders
  const contextKey = useMemo(
    () => stableStringify(context ?? {}),
    [context?.userId, context?.workspaceId, context?.attributes],
  );

  // Stable evaluate function that handles race conditions and unmount protection
  const evaluate = useCallback(async (evaluationId: number): Promise<void> => {
    // Skip if this evaluation is stale (another evaluation started)
    if (evaluationId !== evaluationIdRef.current) return;
    
    try {
      setLoading(true);
      const result = await client.evaluateFlag<T>(slug, defaultValue, context);
      
      // Double-check mounted state AND evaluationId after async op
      if (!mountedRef.current || evaluationId !== evaluationIdRef.current) return;
      
      setValue(result);
      setError(null);
    } catch (e) {
      if (!mountedRef.current || evaluationId !== evaluationIdRef.current) return;
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      // Only update loading if still mounted and this is still the current evaluation
      if (mountedRef.current && evaluationId === evaluationIdRef.current) {
        setLoading(false);
      }
    }
  }, [client, slug, defaultValue, contextKey]);

  useEffect(() => {
    mountedRef.current = true;
    evaluationIdRef.current = 0;
    
    // Initial synchronous cache check
    // If bootstrapFlags was provided, the cache already has the value
    const cached = client.getCachedFlag<T>(slug, context);
    if (cached !== undefined) {
      setValue(cached);
      setLoading(false);
      // Still set up listeners for future updates
    } else {
      // Start async evaluation
      evaluationIdRef.current = 1;
      evaluate(1);
    }

    // Unified effect: event subscriptions + cleanup
    const unsubs: Array<() => void> = [];

    unsubs.push(
      client.on('flagsUpdated', () => {
        evaluationIdRef.current++;
        evaluate(evaluationIdRef.current);
      }),
    );
    
    unsubs.push(
      client.on('flagChanged', (payload: FlagChangedPayload) => {
        if (payload.slug === slug) {
          evaluationIdRef.current++;
          evaluate(evaluationIdRef.current);
        }
      }),
    );

    return () => {
      mountedRef.current = false;
      unsubs.forEach((u) => u());
    };
  }, [client, slug, contextKey, evaluate]);

  return { value, loading, error };
}

// ─── useAllFlags ────────────────────────────────────────────────────────────────

export interface UseAllFlagsResult {
  flags: Record<string, FlagValue>;
  loading: boolean;
  error: Error | null;
}

/**
 * React hook for batch-evaluating all feature flags.
 *
 * @example
 * ```tsx
 * const { flags, loading } = useAllFlags({ workspaceId: 'ws-123' });
 * if (flags['dark-mode']) { ... }
 * ```
 */
export function useAllFlags(context?: EvaluationContext): UseAllFlagsResult {
  const client = useClient();
  
  // Track mounted state to prevent setState after unmount
  const mountedRef = useRef(true);
  // Track current evaluation request to handle race conditions
  const evaluationIdRef = useRef(0);
  
  const [flags, setFlags] = useState<Record<string, FlagValue>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const contextKey = useMemo(
    () => stableStringify(context ?? {}),
    [context?.userId, context?.workspaceId, context?.attributes],
  );

  // Stable evaluate function that handles race conditions and unmount protection
  const evaluate = useCallback(async (evaluationId: number): Promise<void> => {
    // Skip if this evaluation is stale (another evaluation started)
    if (evaluationId !== evaluationIdRef.current) return;
    
    try {
      setLoading(true);
      const result = await client.evaluateAllFlags(context);
      
      // Double-check mounted state AND evaluationId after async op
      if (!mountedRef.current || evaluationId !== evaluationIdRef.current) return;
      
      setFlags(result);
      setError(null);
    } catch (e) {
      if (!mountedRef.current || evaluationId !== evaluationIdRef.current) return;
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      // Only update loading if still mounted and this is still the current evaluation
      if (mountedRef.current && evaluationId === evaluationIdRef.current) {
        setLoading(false);
      }
    }
  }, [client, contextKey]);

  useEffect(() => {
    mountedRef.current = true;
    evaluationIdRef.current = 0;
    
    // Initial synchronous cache check
    const cached = client.getCachedFlags(context);
    if (cached !== undefined) {
      setFlags(cached);
      setLoading(false);
    } else {
      // Start async evaluation
      evaluationIdRef.current = 1;
      evaluate(1);
    }

    // Unified effect: event subscriptions + cleanup
    const unsub = client.on('flagsUpdated', () => {
      evaluationIdRef.current++;
      evaluate(evaluationIdRef.current);
    });

    return () => {
      mountedRef.current = false;
      unsub();
    };
  }, [client, contextKey, evaluate]);

  return { flags, loading, error };
}
