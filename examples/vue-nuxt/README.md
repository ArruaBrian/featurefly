# Vue / Nuxt Example

Demonstrates featurefly Vue composables with the Composition API.

## What it shows

- Installing `FeatureFlyPlugin` in `main.ts` (or as a Nuxt plugin)
- `useFeatureFlag` composable returning a reactive `Ref`
- `useAllFlags` composable for batch evaluation
- Reactive context — composables re-evaluate when context changes
- Streaming for real-time updates

## Try it

1. Install: `npm install featurefly vue`
2. Register the plugin in your app entry point (see comments in `composable.ts`)
3. Use `useMyFeatureFlags()` in any component's `<script setup>`
