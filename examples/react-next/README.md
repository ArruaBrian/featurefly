# React / Next.js App Router Example

Demonstrates featurefly React hooks in a Next.js App Router page.

## What it shows

- `FeatureFlyProvider` wrapping the component tree
- `useFeatureFlag` hook for single flag evaluation with loading state
- `useAllFlags` hook for batch evaluation
- Client-side streaming for real-time updates
- `bootstrapFlags` for instant hydration from SSR

## Try it

1. Set `NEXT_PUBLIC_FF_URL` and `NEXT_PUBLIC_FF_KEY` in your `.env.local`
2. Copy `page.tsx` into your Next.js `app/` directory
3. Install: `npm install featurefly`
