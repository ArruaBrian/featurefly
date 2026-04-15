# FeatureFly 🚀

**Lightweight, universal Feature Flags SDK for Node.js and the browser.**
One package. Backend and frontend. Zero config to start.

[![CI](https://github.com/ArruaBrian/featurefly/actions/workflows/ci.yml/badge.svg)](https://github.com/ArruaBrian/featurefly/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/featurefly.svg)](https://www.npmjs.com/package/featurefly)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Bundle Size](https://img.shields.io/badge/gzipped-~11KB-green.svg)](#-feature-comparison)

---

## 📑 Table of Contents

- [Installation](#-installation)
- [Quick Start](#-quick-start)
- [Usage by Environment](#-usage-by-environment)
  - [Backend (Node.js / NestJS / Express)](#-backend-nodejs--nestjs--express)
  - [Frontend (Vanilla JS / Any bundler)](#-frontend-vanilla-js--any-bundler)
  - [React](#%EF%B8%8F-react)
  - [Vue 3](#-vue-3)
- [Configuration](#-configuration)
- [API Reference](#-api-reference)
  - [Flag Evaluation](#flag-evaluation)
  - [Flag Management (CRUD)](#flag-management-crud)
  - [Workspace Flags](#workspace-flags)
  - [Real-time Streaming (SSE)](#real-time-streaming-sse)
  - [Edge Evaluation (Offline)](#edge-evaluation-offline-mode)
  - [Impact Metrics](#impact-metrics)
  - [Event System](#event-system)
  - [Local Overrides](#local-overrides)
  - [Utilities](#utilities)
- [Considerations](#-considerations)
- [Evaluation Flow](#-evaluation-flow)
- [Resilience](#-resilience)
- [Feature Comparison](#-feature-comparison)
- [Changelog](#-changelog)
- [Roadmap](#-roadmap)
- [Contributing](#-contributing)
- [License](#-license)

---

## 📦 Installation

```bash
npm install featurefly
```

> **Zero runtime dependencies!** FeatureFly has no runtime dependencies. Only install your framework if you want to use the framework-specific hooks:
>
> ```bash
> # React projects (optional - only if you want hooks)
> npm install featurefly react
>
> # Vue 3 projects
> npm install featurefly vue
> ```

### Tree-Shakeable Entry Points

FeatureFly supports granular imports for optimal bundle size:

| Entry Point | Bundle (est.) | Use Case |
|-------------|---------------|----------|
| `featurefly` | Full (~22KB) | Complete SDK, backwards compatible |
| `featurefly/core` | Minimal (~8KB) | Vanilla JS, Node.js, Serverless |
| `featurefly/react` | Core + React (~12KB) | React 18+ applications |
| `featurefly/vue` | Core + Vue (~12KB) | Vue 3 applications |
| `featurefly/advanced` | Edge/Streaming/Metrics (~11KB) | Advanced features only |

```typescript
// Minimal - tree-shakeable
import { FeatureFlagsClient } from 'featurefly/core';

// React - hooks included
import { FeatureFlyProvider, useFeatureFlag } from 'featurefly/react';

// Advanced features only (Edge evaluation, Streaming, Metrics)
import { EdgeEvaluator, FlagStreamClient } from 'featurefly/advanced';
```

---

## 🚀 Quick Start

```typescript
import { FeatureFlagsClient } from "featurefly";

const client = new FeatureFlagsClient({
  baseUrl: "https://your-api.com",
  apiKey: "your-api-key",
});

const isEnabled = await client.evaluateFlag("new-checkout-flow");

if (isEnabled) {
  // New checkout
} else {
  // Legacy checkout
}

// Always dispose when done (servers: on shutdown, SPAs: on unmount)
client.dispose();
```

That's it. The same code works in a NestJS service, an Express middleware, a Vite frontend, or a Next.js API route.

---

## 🌍 Usage by Environment

FeatureFly is **universal** — the same npm package runs on the server and in the browser. The only difference is _how_ you integrate it.

### 🖥️ Backend (Node.js / NestJS / Express)

Use the client directly to evaluate flags on the server side, typically in middleware, guards, or services.

```typescript
// services/feature-flags.service.ts
import { FeatureFlagsClient } from "featurefly";

const client = new FeatureFlagsClient({
  baseUrl: process.env.FEATURE_FLAGS_API_URL,
  apiKey: process.env.FEATURE_FLAGS_API_KEY,
  cacheTtlMs: 30_000, // Cache flags for 30s on the server
});

export async function isFeatureEnabled(
  slug: string,
  userId?: string,
  workspaceId?: string,
): Promise<boolean> {
  return client.evaluateFlag(slug, { userId, workspaceId });
}
```

```typescript
// Example: Express middleware
app.get("/dashboard", async (req, res) => {
  const showNewDashboard = await isFeatureEnabled(
    "new-dashboard",
    req.user.id,
    req.user.workspaceId,
  );

  if (showNewDashboard) {
    return res.render("dashboard-v2");
  }
  return res.render("dashboard");
});
```

```typescript
// Example: NestJS guard
@Injectable()
export class FeatureFlagGuard implements CanActivate {
  constructor(private readonly flags: FeatureFlagsClient) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    return this.flags.evaluateFlag("beta-api", {
      userId: request.user.id,
    });
  }
}
```

> 💡 **Tip:** On the server, create a **single instance** of `FeatureFlagsClient` and reuse it across requests. Call `client.dispose()` during graceful shutdown.

---

### 🌐 Frontend (Vanilla JS / Any bundler)

Works with any bundler (Vite, Webpack, esbuild, Rollup) or even a plain `<script>` tag.

```typescript
import { FeatureFlagsClient } from "featurefly";

const client = new FeatureFlagsClient({
  baseUrl: "https://your-api.com",
  apiKey: "pk_live_xxx", // Use a public/client key
  streaming: true, // Auto-receive flag updates via SSE
});

// Evaluate and render
const showBanner = await client.evaluateFlag("promo-banner", {
  userId: currentUser.id,
  attributes: { plan: currentUser.plan, country: "AR" },
});

if (showBanner) {
  document.getElementById("promo")!.style.display = "block";
}

// React to live flag changes
client.on("flagsUpdated", async () => {
  const updated = await client.evaluateFlag("promo-banner");
  document.getElementById("promo")!.style.display = updated ? "block" : "none";
});
```

---

### ⚛️ React

> **Note:** Requires React 16.8+ (hooks support).

Import from `featurefly/react`. Hooks auto-re-evaluate when flags change via streaming.

```tsx
import { FeatureFlagsClient } from "featurefly";
import {
  FeatureFlyProvider,
  useFeatureFlag,
  useAllFlags,
} from "featurefly/react";

// Create your client (once, outside the component tree)
const client = new FeatureFlagsClient({
  baseUrl: "https://your-api.com",
  apiKey: "pk_live_xxx",
  streaming: true,
});

// 1. Wrap your app
function App() {
  return (
    <FeatureFlyProvider client={client}>
      <MyComponent />
    </FeatureFlyProvider>
  );
}

// 2. Use hooks
function MyComponent() {
  const { value: darkMode, loading } = useFeatureFlag("dark-mode", false);
  const { flags } = useAllFlags({ workspaceId: "ws-123" });

  if (loading) return <Spinner />;

  return (
    <div className={darkMode ? "dark" : "light"}>
      {flags["new-feature"] && <NewFeature />}
    </div>
  );
}
```

| Hook                                           | Returns              | Description                                     |
| ---------------------------------------------- | -------------------- | ----------------------------------------------- |
| `useFeatureFlag(slug, defaultValue, context?)` | `{ value, loading }` | Evaluates a single flag. Re-renders on changes. |
| `useAllFlags(context?)`                        | `{ flags, loading }` | Returns all flags as a key-value object.        |

---

### 💚 Vue 3

> **Note:** Requires Vue 3.0+ (Composition API support).

Import from `featurefly/vue`. Composables return reactive `Ref` values that update automatically.

```typescript
// main.ts
import { createApp } from "vue";
import { FeatureFlagsClient } from "featurefly";
import { FeatureFlyPlugin } from "featurefly/vue";

const client = new FeatureFlagsClient({
  baseUrl: "https://your-api.com",
  apiKey: "pk_live_xxx",
  streaming: true,
});

const app = createApp(App);
app.use(FeatureFlyPlugin, { client });
app.mount("#app");
```

```vue
<!-- MyComponent.vue -->
<script setup>
import { useFeatureFlag, useAllFlags } from "featurefly/vue";

const darkMode = useFeatureFlag("dark-mode", false);
const flags = useAllFlags({ workspaceId: "ws-123" });
</script>

<template>
  <div :class="{ dark: darkMode }">
    <NewFeature v-if="flags['new-feature']" />
  </div>
</template>
```

| Composable                                     | Returns                          | Description                                |
| ---------------------------------------------- | -------------------------------- | ------------------------------------------ |
| `useFeatureFlag(slug, defaultValue, context?)` | `Ref<T>`                         | Reactive ref that updates on flag changes. |
| `useAllFlags(context?)`                        | `Ref<Record<string, FlagValue>>` | Reactive ref with all flags.               |

---

## 🔧 Configuration

All options are optional except `baseUrl`.

```typescript
const client = new FeatureFlagsClient({
  // Required — your feature flags API endpoint
  baseUrl: "https://your-api.com",

  // Authentication
  apiKey: "your-api-key",

  // HTTP timeout (default: 10000ms)
  timeout: 10_000,

  // Cache (default: enabled, 60s TTL)
  cacheEnabled: true,
  cacheTtlMs: 60_000,

  // Retry (default: 3 attempts, 1s base delay)
  retry: {
    maxAttempts: 3,
    baseDelayMs: 1_000,
    maxDelayMs: 10_000,
  },

  // Circuit Breaker (default: 5 failures, 30s reset)
  circuitBreaker: {
    failureThreshold: 5,
    resetTimeoutMs: 30_000,
  },

  // Logging — 'debug' | 'info' | 'warn' | 'error' | 'silent' (default: 'warn')
  logLevel: "warn",

  // Or provide your own logger (pino, winston, etc.)
  logger: myLogger,

  // Local overrides — flags evaluated instantly without HTTP
  localOverrides: {
    "feature-x": true,
    "variant-test": "blue",
  },

  // Pre-evaluated flags to hydrate the client instantly (e.g. injected by Next.js/SSR)
  bootstrapFlags: {
    "new-checkout": true
  },

  // Fallback defaults when the API is unreachable
  fallbackDefaults: {
    "critical-feature": false,
  },

  // Custom static headers merged into every request
  headers: {
    "x-workspace-id": "ws-123",
    "x-custom-header": "value",
  },

  // Dynamic request interceptor — invoked before every HTTP call
  // Perfect for JWT auth where tokens rotate over time
  requestInterceptor: () => ({
    Authorization: `Bearer ${getAccessToken()}`,
    "x-user-id": getUserId(),
  }),

  // Send cookies with cross-origin requests (default: false)
  withCredentials: true,

  // Real-time updates via SSE (default: false)
  streaming: true, // or { reconnectDelayMs: 2000 }

  // A/B testing callback
  trackingCallback: (assignment) => {
    analytics.track("Experiment Viewed", assignment);
  },

  // Edge evaluation — pass a pre-fetched document for fully offline mode
  // edgeDocument: myPreFetchedDoc,
});
```

---

## 📚 API Reference

### Flag Evaluation

```typescript
// Boolean flag
const isEnabled = await client.evaluateFlag("my-flag");

// With user context (targeting, rollout, experiments)
const isEnabled = await client.evaluateFlag("my-flag", {
  workspaceId: "ws-123",
  userId: "user-456",
  attributes: { plan: "pro", country: "AR" },
});

// Typed flag values
const variant = await client.evaluateFlag<string>("ab-test");
const limit = await client.evaluateFlag<number>("rate-limit");
const config = await client.evaluateFlag<Record<string, unknown>>("ui-config");

// All flags at once (single HTTP request)
const allFlags = await client.evaluateAllFlags({ workspaceId: "ws-123" });
```

### Flag Management (CRUD)

```typescript
// Create
const flag = await client.createFlag({
  slug: "new-feature",
  name: "New Feature",
  category: "both",
  valueType: "boolean",
  defaultValue: false,
  tags: ["v2", "beta"],
});

// Read
const allFlags = await client.getAllFlags();
const byId = await client.getFlagById("flag-id");
const bySlug = await client.getFlagBySlug("my-flag");

// Update
await client.updateFlag("flag-id", { name: "Updated Name" });

// Delete
await client.deleteFlag("flag-id");
```

### Workspace Flags

```typescript
// Set a workspace-level override
await client.setWorkspaceFlag("feature-x", "workspace-123", true);

// Get all flags for a workspace
const flags = await client.getWorkspaceFlags("workspace-123");

// Remove an override
await client.removeWorkspaceFlag("feature-x", "workspace-123");
```

### Real-time Streaming (SSE)

```typescript
// Option A: Auto-start via config
const client = new FeatureFlagsClient({
  baseUrl: "https://your-api.com",
  streaming: true,
});

// Option B: Manual control
client.startStreaming();
client.stopStreaming();

// React to flag updates (cache is auto-invalidated)
client.on("flagsUpdated", () => {
  console.log("Flags refreshed from server!");
});
```

### Edge Evaluation (Offline Mode)

Evaluate flags with 0ms latency by pre-fetching the entire flag document.

```typescript
// 1. Fetch the document (e.g., at server startup or on app boot)
const doc = await fetch("https://your-api.com/feature-flags/document").then(
  (r) => r.json(),
);

// 2. Create a fully offline client
const edgeClient = new FeatureFlagsClient({
  baseUrl: "https://your-api.com",
  edgeDocument: doc,
});

// 3. Evaluate — zero network calls, zero latency
const value = await edgeClient.evaluateFlag("my-flag", {
  userId: "user-123",
});
```

### SSR & Bootstrapping (Zero-Flicker)

For Server-Side Rendering (Next.js, Nuxt, Remix), you can inject pre-evaluated flags from the server to the client. This hydrates the client cache instantly, ensuring `loading` is `false` on the first render and avoiding any UI flickering.

```tsx
// 1. Server evaluates flags and injects them into the HTML
const serverFlags = await serverClient.evaluateAllFlags({ userId });
window.__FEATURE_FLAGS__ = serverFlags;

// 2. Client initializes with bootstrap flags (no initial HTTP request made)
const client = new FeatureFlagsClient({
  baseUrl: "https://your-api.com",
  apiKey: "pk_live_xxx",
  bootstrapFlags: window.__FEATURE_FLAGS__,
});
```

### Impact Metrics

Client-side telemetry collected passively, no external calls.

```typescript
const metrics = client.getImpactMetrics();

console.log(metrics.totalEvaluations); // 1523
console.log(metrics.cacheHitRate); // 0.87
console.log(metrics.latency.p50); // 2ms
console.log(metrics.latency.p95); // 12ms
console.log(metrics.latency.p99); // 45ms

// Per-flag detail
console.log(metrics.flags["my-flag"].evaluations); // 42

// Experiment exposures
console.log(metrics.experiments["checkout-exp"].exposures); // 300

// Reset all counters
client.resetMetrics();
```

### Event System

```typescript
// Flag evaluated (with timing)
client.on("flagEvaluated", ({ slug, value, reason, durationMs }) => {
  analytics.track("flag_check", { slug, value, reason, durationMs });
});

// Flag value changed (detect drift)
client.on("flagChanged", ({ slug, previousValue, newValue }) => {
  console.log(`${slug}: ${previousValue} → ${newValue}`);
});

// Circuit breaker
client.on("circuitOpen", ({ state, failures }) => {
  alerting.send(`Circuit opened after ${failures} failures`);
});

// Cache
client.on("cacheHit", ({ key }) => monitor.increment("cache.hit"));
client.on("cacheMiss", ({ key }) => monitor.increment("cache.miss"));

// Streaming
client.on("streamConnected", () => console.log("SSE connected"));
client.on("streamDisconnected", () => console.log("SSE lost"));

// Unsubscribe
const unsubscribe = client.on("flagEvaluated", handler);
unsubscribe();
```

### Local Overrides

Useful for development and testing — evaluated instantly, no HTTP.

```typescript
client.setLocalOverride("experimental-ui", true);
client.setLocalOverride("theme", "dark");

const overrides = client.getLocalOverrides();

client.removeLocalOverride("experimental-ui");
client.clearLocalOverrides();
```

### Utilities

```typescript
// Cache
client.clearCache();
client.getCacheStats(); // { size, keys, enabled }

// Circuit breaker
client.getCircuitBreakerState(); // { state, failures }
client.resetCircuitBreaker();

// Lifecycle
client.dispose(); // Release timers, listeners, metrics, SSE
client.isDisposed(); // true
```

---

## ⚠️ Considerations

### Universal Package (Backend + Frontend)

FeatureFly ships as a **single universal package** that works on both the server and the browser:

| Concern                   | How it's handled                                                                                                                                            |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **HTTP client**           | Uses native `fetch`, which auto-detects the environment (Node.js `http` module vs browser `XMLHttpRequest`).                                                       |
| **Hashing (MurmurHash3)** | Implemented in pure TypeScript — no dependency on Node.js `crypto`.                                                                                         |
| **SSE Streaming**         | Uses the native browser `EventSource` API. On Node.js < 22, streaming is disabled unless you provide a polyfill. Node.js 22+ includes native `EventSource`. |
| **Build format**          | Ships both CJS (`require()`) and ESM (`import`). Your bundler picks the right one.                                                                          |

### API Key Security

- On the **backend**, use a secret API key stored in environment variables.
- On the **frontend**, use a **public/read-only** key that only has permission to evaluate flags, not manage them. Never expose your secret key in client-side code.

### Single Instance Pattern

Create **one** `FeatureFlagsClient` instance and share it:

- **Backend:** Create at app startup, dispose on `SIGTERM` / `SIGINT`.
- **React:** Create outside the component tree, pass via `<FeatureFlyProvider>`.
- **Vue:** Create before `app.mount()`, install via `app.use(FeatureFlyPlugin, { client })`.

### Cache Strategy

| Environment       | Recommended `cacheTtlMs` | Why                                                                        |
| ----------------- | ------------------------ | -------------------------------------------------------------------------- |
| Backend (API)     | `30_000` – `60_000`      | Flags change infrequently; caching reduces load on the flags API.          |
| Frontend (SPA)    | `60_000` – `120_000`     | Combined with `streaming: true`, the cache is auto-invalidated on changes. |
| Edge / Serverless | `0` (disabled)           | Use `edgeDocument` for fully offline evaluation instead.                   |

### Disposing Resources

Always call `client.dispose()` when you're done. This cleans up:

- SSE connections
- Cache timers
- Metrics collectors
- Event listeners

```typescript
// Express / NestJS
process.on("SIGTERM", () => client.dispose());

// React
useEffect(() => () => client.dispose(), []);

// Vue
onUnmounted(() => client.dispose());
```

### Node.js Version

Requires **Node.js >= 18**. For SSE streaming on the server, Node.js 22+ is recommended (native `EventSource`), or install a polyfill like `eventsource` for older versions.

---

## ⚙️ Evaluation Flow

When you call `evaluateFlag()`, the SDK follows this priority chain:

```
evaluateFlag('slug', context)
  │
  ├─ 1. Local Overrides   → instant return (no HTTP)
  ├─ 2. Edge Evaluator    → offline return if document loaded
  ├─ 3. Cache hit          → instant return (no HTTP)
  ├─ 4. Circuit Breaker    → reject if circuit is open
  ├─ 5. Retry w/ Backoff   → exponential backoff + jitter
  ├─ 6. HTTP Request       → GET /feature-flags/:slug/evaluate
  ├─ 7. Cache store        → persist result with TTL
  └─ 8. Fallback           → predefined defaults if everything fails
```

---

## 🔒 Resilience

Built-in, zero-config resilience. No plugins needed.

| Layer                 | What it does                                                            |
| --------------------- | ----------------------------------------------------------------------- |
| **Retry**             | Retries failed requests with exponential backoff + jitter               |
| **Circuit Breaker**   | Stops calling a failing API after N consecutive failures, auto-recovers |
| **Cache**             | Serves stale data while the API is down                                 |
| **Fallback Defaults** | Returns predefined safe values when nothing else works                  |
| **Local Overrides**   | Flags work completely offline                                           |
| **Edge Evaluator**    | Full offline evaluation using a pre-fetched document                    |

---

## 📊 Feature Comparison

| Capability                               | FeatureFly | LaunchDarkly  |    Unleash    | GrowthBook | Flagsmith |
| ---------------------------------------- | :--------: | :-----------: | :-----------: | :--------: | :-------: |
| Boolean flags                            |     ✅     |      ✅       |      ✅       |     ✅     |    ✅     |
| Multi-type values (string, number, JSON) |     ✅     |      ✅       |      ✅       |     ✅     |    ✅     |
| In-memory cache                          |     ✅     |      ✅       |      ✅       |     ✅     |    ✅     |
| Retry with backoff                       |     ✅     |      ✅       |      ✅       |     ✅     |    ✅     |
| Circuit breaker                          |     ✅     |      ✅       |      ❌       |     ❌     |    ❌     |
| Typed event system                       |     ✅     |      ⚠️       |      ❌       |     ❌     |    ❌     |
| Local overrides                          |     ✅     |      ⚠️       |      ✅       |     ✅     |    ❌     |
| Fallback defaults                        |     ✅     |      ✅       |      ✅       |     ✅     |    ✅     |
| Injectable logger                        |     ✅     |      ✅       |      ✅       |     ❌     |    ❌     |
| Dispose / cleanup                        |     ✅     |      ✅       |      ✅       |     ❌     |    ❌     |
| Workspace-level overrides                |     ✅     |      ⚠️       |      ❌       |     ❌     |    ✅     |
| Streaming (SSE)                          |     ✅     |      ✅       |      ✅       |     ✅     |    ✅     |
| Targeting / segmentation                 |     ✅     |      ✅       |      ✅       |     ✅     |    ✅     |
| Percentage rollout                       |     ✅     |      ✅       |      ✅       |     ✅     |    ✅     |
| A/B testing                              |     ✅     |      ✅       |      ❌       |     ✅     |    ✅     |
| Edge evaluation (offline)                |     ✅     |      ✅       |      ✅       |     ✅     |    ❌     |
| Impact metrics                           |     ✅     |      ✅       |      ✅       |     ✅     |    ❌     |
| React hooks                              |     ✅     |      ✅       |      ✅       |     ✅     |    ✅     |
| Vue composables                          |     ✅     |      ❌       |      ❌       |     ❌     |    ❌     |
| Self-hosted                              |     ✅     |      ❌       |      ✅       |     ✅     |    ✅     |
| TypeScript first                         |     ✅     |      ✅       |      ⚠️       |     ✅     |    ⚠️     |
| Open source                              |   ✅ MIT   | ✅ Apache 2.0 | ✅ Apache 2.0 |   ✅ MIT   | ✅ BSD-3  |
|                                          |            |               |               |            |           |
| **Bundle size (gzipped)**                | **~11 KB** |   ~100 KB+    |    ~336 KB    |   ~9 KB    |  ~50 KB+  |
| **Runtime dependencies**                 |   **0**    |      3+       |      5+       |   **0**    |    2+     |
| **Pricing**                              |  **Free**  |     Paid      |   Free/Paid   |  **Free**  | Free/Paid |

> ✅ Supported · ⚠️ Partial · ❌ Not available

---

## � Changelog

All notable changes to this project are documented in [CHANGELOG.md](./CHANGELOG.md).

---

## ��️ Roadmap

| Feature             | Status       | Description                                  |
| ------------------- | ------------ | -------------------------------------------- |
| Multi-language SDKs | 🔜 Planned   | Go, Python, Ruby, PHP server-side SDKs       |
| Encrypted payloads  | 💡 Exploring | End-to-end encryption of flag configurations |
| Audit log           | 💡 Exploring | Track who changed what and when              |

---

## 🧪 Testing

```bash
npm test           # Run tests with coverage
npm run test:watch # Watch mode
```

---

## 🤝 Contributing

1. Clone the repo
2. `npm install`
3. `npm test`
4. `npm run build`

---

## 📄 License

MIT © Arrua Platform Team


All notable changes to this project are documented in [CHANGELOG.md](./CHANGELOG.md).
