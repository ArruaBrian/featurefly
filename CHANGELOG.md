# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0] - 2026-04-15

### Security
- **SSE Authentication**: API keys are no longer exposed in SSE URL query parameters. Streaming now uses a custom fetch-based SSE client (`sse-client.ts`) that sends credentials via `Authorization` header. (#1)

### Added
- **`getCachedFlag()` / `getCachedFlags()`**: Public synchronous cache access methods on `FeatureFlagsClient`. React/Vue hooks now use these instead of accessing internal cache directly. (#19)
- **`logPrefix` config option**: Configurable prefix for `ConsoleLogger` messages (default: `[FeatureFly]`). Useful for multi-SDK apps. (#20)
- **`NOT_FOUND` evaluation reason**: Returned when a flag slug doesn't exist in the edge document. (#11)
- **`listenerError` event**: Emitted when an event listener throws, with anti-recursion protection. (#12)
- **`flagsUpdated` slugs**: The `flagsUpdated` event now includes an optional `slugs` array for selective cache invalidation. (#9)
- **SSE anti-replay**: `Last-Event-ID` header tracking and version gap detection on SSE reconnect. (#10)
- **Stable cache keys**: `stableStringify()` utility ensures deterministic key ordering in cache keys. (#13)
- **apiKey validation**: Empty/whitespace-only API keys are normalized to `undefined`. (#15)
- **Examples**: Added `examples/` directory with Node.js, React/Next.js, Vue/Nuxt, and Edge evaluation examples. (#14)
- **CI/CD**: GitHub Actions workflows for CI (Node 18/20/22) and Release (npm publish with provenance). (#16)
- **TypeDoc config**: Added `typedoc.json` and `docs` npm script for API documentation generation. (#17)
- **README badges**: CI, npm version, TypeScript, and License badges. (#18)
- **PR template**: `.github/PULL_REQUEST_TEMPLATE.md`. (#16)

### Fixed
- **Retry `maxAttempts=0`**: Values <= 0 are now normalized to 1 (with warning). NaN uses default of 3. (#2)
- **Cache timer validation**: TTL values are validated; `CacheOptions` supports `logger`; `destroy()` is idempotent. (#3)
- **React hooks memory leaks**: Refactored with `mountedRef`, `evaluationIdRef`, race condition protection, and bootstrap sync check. (#4)
- **Vue `useAllFlags` cleanup**: Added `onScopeDispose` and unified cleanup pattern. (#5)
- **SemVer parser**: Rewritten with token-based parsing, spec-compliant with SemVer 2.0.0 Section 11. (#6)
- **Edge evaluator diffing**: Version-aware `diffIndex()` for selective re-evaluation with early exit. (#7)

### Changed
- **React hooks**: Removed internal `buildCacheKey` helper; hooks now use public `getCachedFlag()`/`getCachedFlags()` API.

## [0.2.4] - 2026-03-01

### Fixed
- **CJS Build**: Fixed critical bug where CommonJS output files were emitted with ESM `import/export` syntax instead of `require/module.exports`, causing `ERR_MODULE_NOT_FOUND` errors in Node.js CJS environments (NestJS, Express, etc.).
- **tsconfig.json**: Set `"module": "CommonJS"` for the CJS build target. The ESM build continues to use `"module": "ESNext"` via `tsconfig.esm.json`.

## [0.2.3] - 2026-02-28

### Added
- **Dual Build announcement**: Published with intended dual CJS/ESM support via `exports` in `package.json`. (Note: CJS output had a build bug fixed in 0.2.4.)

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
