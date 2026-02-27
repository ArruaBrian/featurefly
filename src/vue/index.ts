// ═══════════════════════════════════════════════════════════════════════════════
// FeatureFly — Vue Composables
// ═══════════════════════════════════════════════════════════════════════════════
//
// Thin wrapper providing Vue 3 composables for FeatureFly SDK.
// Requires Vue 3.x (Composition API).
//
// Usage:
//   import { FeatureFlyPlugin, useFeatureFlag, useAllFlags } from 'featurefly/vue';
//
// ═══════════════════════════════════════════════════════════════════════════════

import {
  inject,
  ref,
  onMounted,
  onUnmounted,
  watch,
  type Ref,
  type InjectionKey,
  type App,
} from 'vue';
import type { FeatureFlagsClient } from '../shared/client';
import type { EvaluationContext, FlagValue, FlagChangedPayload } from '../shared/types';

// ─── Plugin & Injection Key ─────────────────────────────────────────────────────

const FEATUREFLY_KEY: InjectionKey<FeatureFlagsClient> = Symbol('featurefly');

/**
 * Vue Plugin that provides the FeatureFlagsClient to the entire app.
 *
 * @example
 * ```ts
 * import { createApp } from 'vue';
 * import { FeatureFlyPlugin } from 'featurefly/vue';
 *
 * const app = createApp(App);
 * app.use(FeatureFlyPlugin, { client: featureFlyClient });
 * ```
 */
export const FeatureFlyPlugin = {
  install(app: App, options: { client: FeatureFlagsClient }) {
    app.provide(FEATUREFLY_KEY, options.client);
  },
};

function useClient(): FeatureFlagsClient {
  const client = inject(FEATUREFLY_KEY);
  if (!client) {
    throw new Error(
      'useFeatureFlag must be called inside a component where FeatureFlyPlugin is installed. ' +
      'Use app.use(FeatureFlyPlugin, { client }) in your main.ts.',
    );
  }
  return client;
}

// ─── useFeatureFlag ─────────────────────────────────────────────────────────────

/**
 * Vue composable for evaluating a single feature flag.
 * Returns a reactive `Ref` that auto-updates on flag changes.
 *
 * @param slug Flag slug identifier
 * @param defaultValue Default value while loading
 * @param context Optional reactive evaluation context
 *
 * @example
 * ```vue
 * <script setup>
 * import { useFeatureFlag } from 'featurefly/vue';
 *
 * const darkMode = useFeatureFlag('dark-mode', false);
 * </script>
 *
 * <template>
 *   <div :class="{ dark: darkMode.value }">...</div>
 * </template>
 * ```
 */
export function useFeatureFlag<T extends FlagValue = boolean>(
  slug: string,
  defaultValue: T,
  context?: Ref<EvaluationContext> | EvaluationContext,
): Ref<T> {
  const client = useClient();
  const value = ref<T>(defaultValue) as Ref<T>;
  const unsubs: Array<() => void> = [];

  const evaluate = async () => {
    try {
      const ctx = context && 'value' in context ? context.value : context;
      const result = await client.evaluateFlag<T>(slug, ctx);
      value.value = result;
    } catch {
      // Keep current value on error
    }
  };

  onMounted(() => {
    evaluate();

    unsubs.push(
      client.on('flagsUpdated', () => evaluate()),
    );
    unsubs.push(
      client.on('flagChanged', (payload: FlagChangedPayload) => {
        if (payload.slug === slug) evaluate();
      }),
    );

    // If context is reactive, re-evaluate when it changes
    if (context && 'value' in context) {
      watch(context, () => evaluate(), { deep: true });
    }
  });

  onUnmounted(() => {
    unsubs.forEach((u) => u());
  });

  return value;
}

// ─── useAllFlags ────────────────────────────────────────────────────────────────

/**
 * Vue composable for batch-evaluating all feature flags.
 * Returns a reactive `Ref<Record<string, FlagValue>>` that auto-updates.
 *
 * @example
 * ```vue
 * <script setup>
 * import { useAllFlags } from 'featurefly/vue';
 *
 * const flags = useAllFlags({ workspaceId: 'ws-123' });
 * </script>
 *
 * <template>
 *   <NewFeature v-if="flags['new-feature']" />
 * </template>
 * ```
 */
export function useAllFlags(
  context?: Ref<EvaluationContext> | EvaluationContext,
): Ref<Record<string, FlagValue>> {
  const client = useClient();
  const flags = ref<Record<string, FlagValue>>({});
  const unsubs: Array<() => void> = [];

  const evaluate = async () => {
    try {
      const ctx = context && 'value' in context ? context.value : context;
      const result = await client.evaluateAllFlags(ctx);
      flags.value = result;
    } catch {
      // Keep current value on error
    }
  };

  onMounted(() => {
    evaluate();

    unsubs.push(
      client.on('flagsUpdated', () => evaluate()),
    );

    if (context && 'value' in context) {
      watch(context, () => evaluate(), { deep: true });
    }
  });

  onUnmounted(() => {
    unsubs.forEach((u) => u());
  });

  return flags;
}
