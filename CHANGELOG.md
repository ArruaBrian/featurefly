# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.2] - 2026-02-28

### Changed
- **Documentation**: Updated README to highlight the new "Zero runtime dependencies" architecture and corrected the bundle size comparison table (~11KB).
- **Documentation**: Added explicitly the React 16.8+ version requirement for hooks usage.
- **Documentation**: Updated the Changelog to properly reflect all recent releases.

## [0.2.1] - 2026-02-28

### Added
- **SSR Bootstrapping**: Added `bootstrapFlags` to `FeatureFlagsConfig` for zero-flicker hydration on Server-Side Rendering (Next.js, Nuxt, Remix).
- **Strict SemVer**: Added a robust and strict semantic versioning comparator (`compareSemverStrict`) for the targeting engine, fully supporting pre-release tags and padding.

### Changed
- **Zero Dependencies**: Removed `axios` completely and replaced it with a custom native `fetch` implementation. Reduced bundle size from ~21KB to **~11KB**.
- **Type Safety**: Made `defaultValue` a required parameter in `evaluateFlag()` to guarantee predictable typing on network or cache failures.
- **Dual Build**: Fixed Dual Package Hazard. Now fully supports both CommonJS (`require`) and ES Modules (`import`) seamlessly via `exports` in `package.json`.

### Fixed
- **Memory Leaks**: Added `.unref()` to the cache cleanup timer to prevent the SDK from keeping Node.js processes alive indefinitely in SSR environments.

## [0.2.0] - 2026-02-28

### Added
- **HTTP Customization**: Added `headers`, `requestInterceptor`, and `withCredentials` to the SDK config to support advanced authentication flows (like rotating JWTs) and custom request behaviors.

## [0.1.1] - 2026-02-26

### Fixed
- Fixed ESM exports configuration in `package.json`.
- Updated `package.json` URLs to point to the correct GitHub account.

## [0.1.0] - 2026-02-26

### Added
> Initial public release of FeatureFly SDK.

- **Core**: `FeatureFlagsClient` with support for multi-type flags (`boolean`, `string`, `number`, `JSON`), flag management (CRUD), and evaluation contexts (`workspaceId`, `userId`, `attributes`).
- **Resilience**: In-memory cache with TTL, retry with exponential backoff + jitter, and circuit breaker.
- **Targeting & Rollouts**: Rules engine with 16+ operators, deterministic MurmurHash3 bucketing for percentage rollouts, and A/B testing.
- **Real-Time & Edge**: SSE streaming client and zero-latency Edge evaluator.
- **Observability**: Impact metrics and typed event system.
- **Frameworks**: React hooks and Vue 3 composables included.
