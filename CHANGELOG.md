# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

> This is the initial pre-release. All features listed below are shipping together as part of the first public version.

### Core

- **FeatureFlagsClient** — single entry point for all SDK operations
- **Multi-type flag values** — `boolean`, `string`, `number`, and `JSON` flag values
- **Flag evaluation** — single flag and batch evaluation with context support
- **Flag management (CRUD)** — create, read, update, delete flags via HTTP
- **Workspace-level overrides** — set / remove / get per-workspace flag values
- **Local overrides** — skip HTTP entirely for dev/testing with in-memory overrides
- **Fallback defaults** — graceful degradation when the API is unreachable
- **Evaluation context** — pass `workspaceId`, `userId`, and custom `attributes` for targeting

### Resilience

- **In-memory cache** — TTL-based cache with automatic cleanup and falsy value handling
- **Retry with exponential backoff + jitter** — configurable retry for transient failures
- **Circuit breaker** — automatic protection against cascading failures (closed → open → half-open)

### Targeting & Rollouts

- **Targeting rules engine** — 16+ operators (equals, regex, semver, in, contains, etc.) with priority-based evaluation
- **Percentage rollouts** — deterministic MurmurHash3 bucketing for gradual feature rollout
- **A/B testing (experiments)** — weighted variation assignment with custom `trackingCallback` for analytics integration

### Real-Time & Edge

- **SSE streaming** — Server-Sent Events client for instant flag updates with auto-reconnect and exponential backoff
- **Edge evaluator** — zero-latency offline evaluation using a pre-fetched `FlagDocument`, perfect for CDN edge workers and serverless

### Observability

- **Impact Metrics** — passive client-side telemetry: per-flag evaluation counts, cache hit rates, latency percentiles (p50/p95/p99), experiment exposure counts
- **Typed event system** — subscribe to `flagEvaluated`, `flagChanged`, `cacheHit`, `cacheMiss`, `circuitOpen`, `flagsUpdated`, `experimentAssigned`, etc.

### Framework Integrations

- **React hooks** — `useFeatureFlag()`, `useAllFlags()` with `<FeatureFlyProvider>`
- **Vue composables** — `useFeatureFlag()`, `useAllFlags()` with `FeatureFlyPlugin`

### Developer Experience

- **Injectable logger** — replace console logging with any `ILogger` implementation (pino, winston, etc.)
- **`dispose()` pattern** — release all resources (timers, listeners, metrics) when done
- **TypeScript first** — full type safety with exported types
- **Dual build** — CJS + ESM with tree-shaking support
- **Framework sub-paths** — `featurefly/react` and `featurefly/vue` via package.json `exports`
