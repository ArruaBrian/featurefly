// ── Plugin setup (main.ts or Nuxt plugin) ──────────────────────────────────
//
// import { createApp } from 'vue';
// import { FeatureFlyPlugin } from 'featurefly/vue';
// import { FeatureFlagsClient } from 'featurefly';
// import App from './App.vue';
//
// const client = new FeatureFlagsClient({
//   baseUrl: 'https://api.example.com',
//   apiKey: 'your-api-key',
//   streaming: true,
// });
//
// const app = createApp(App);
// app.use(FeatureFlyPlugin, { client });
// app.mount('#app');

// ── Composable for use inside components ────────────────────────────────────

import { useFeatureFlag, useAllFlags } from 'featurefly/vue';
import { ref } from 'vue';

/**
 * Custom composable wrapping featurefly hooks.
 * Must be called inside a component where FeatureFlyPlugin is installed.
 */
export function useMyFeatureFlags() {
  const context = ref({ workspaceId: 'ws-123' });

  // Single flag — returns a reactive Ref<boolean>
  const darkMode = useFeatureFlag('dark-mode', false, context);

  // All flags — returns Ref<Record<string, FlagValue>>
  const allFlags = useAllFlags(context);

  return { darkMode, allFlags };
}

// ── Usage in a component ────────────────────────────────────────────────────
//
// <script setup>
// import { useMyFeatureFlags } from './composable';
//
// const { darkMode, allFlags } = useMyFeatureFlags();
// </script>
//
// <template>
//   <div :class="{ dark: darkMode }">
//     <p v-if="allFlags['promo-banner']">Special offer!</p>
//   </div>
// </template>
