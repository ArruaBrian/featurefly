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
  createElement,
  type ReactNode,
} from 'react';
import type { FeatureFlagsClient } from '../shared/client';
import type { EvaluationContext, FlagValue, FlagChangedPayload } from '../shared/types';

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
  const [value, setValue] = useState<T>(defaultValue);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Memoize context to avoid infinite re-renders
  const contextKey = useMemo(
    () => JSON.stringify(context ?? {}),
    [context?.userId, context?.workspaceId, context?.attributes],
  );

  const evaluate = useCallback(async () => {
    try {
      setLoading(true);
      const result = await client.evaluateFlag<T>(slug, context);
      setValue(result);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [client, slug, contextKey]);

  // Initial evaluation
  useEffect(() => {
    evaluate();
  }, [evaluate]);

  // Re-evaluate on stream updates or flag changes
  useEffect(() => {
    const unsubs: Array<() => void> = [];

    unsubs.push(
      client.on('flagsUpdated', () => evaluate()),
    );
    unsubs.push(
      client.on('flagChanged', (payload: FlagChangedPayload) => {
        if (payload.slug === slug) evaluate();
      }),
    );

    return () => unsubs.forEach((u) => u());
  }, [client, slug, evaluate]);

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
  const [flags, setFlags] = useState<Record<string, FlagValue>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const contextKey = useMemo(
    () => JSON.stringify(context ?? {}),
    [context?.userId, context?.workspaceId, context?.attributes],
  );

  const evaluate = useCallback(async () => {
    try {
      setLoading(true);
      const result = await client.evaluateAllFlags(context);
      setFlags(result);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [client, contextKey]);

  useEffect(() => {
    evaluate();
  }, [evaluate]);

  useEffect(() => {
    const unsub = client.on('flagsUpdated', () => evaluate());
    return () => unsub();
  }, [client, evaluate]);

  return { flags, loading, error };
}
