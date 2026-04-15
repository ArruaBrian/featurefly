// ═══════════════════════════════════════════════════════════════════════════════
// FeatureFly - Complete SDK
// ═══════════════════════════════════════════════════════════════════════════════
//
// Re-exports from all entry points for backwards compatibility.
// For smaller bundles, import from specific entry points:
//   import from 'featurefly/core'  (vanilla JS, Node.js)
//   import from 'featurefly/react' (React)
//   import from 'featurefly/vue'   (Vue)
//
// Note: React and Vue hooks have conflicting names (useFeatureFlag, useAllFlags).
// The main entry exports them with 'React'/'Vue' suffix for disambiguation.
//
// ═══════════════════════════════════════════════════════════════════════════════

export * from './core';

export { FeatureFlyProvider, useFeatureFlag as useFeatureFlagReact, useAllFlags as useAllFlagsReact } from './react';
export type { UseFeatureFlagResult, UseAllFlagsResult } from './react';

export { FeatureFlyPlugin, useFeatureFlag as useFeatureFlagVue, useAllFlags as useAllFlagsVue } from './vue';

export * from './advanced';
