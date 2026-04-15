# Edge / Offline Evaluation Example

Demonstrates zero-latency flag evaluation using a pre-fetched `FlagDocument`.

## What it shows

- Creating a `FlagDocument` with flag definitions and rollout config
- Initializing the client with `edgeDocument` for offline mode
- Evaluating flags without any HTTP calls (pure in-memory)
- Useful for edge runtimes (Cloudflare Workers, Vercel Edge, Deno Deploy)

## Try it

```bash
npx tsx examples/edge-evaluation/index.ts
```

> In production, fetch the `FlagDocument` once from your API and cache it at the edge.
