# Node.js Basic Example

Demonstrates core featurefly SDK usage in a Node.js environment.

## What it shows

- Creating a `FeatureFlagsClient` with API key and logging
- Evaluating a single boolean flag with context (`workspaceId`, `userId`)
- Batch-evaluating all flags for a workspace
- Subscribing to real-time flag change events
- Cleaning up with `client.dispose()`

## Try it

```bash
npx tsx examples/node-basic/index.ts
```

> Replace `baseUrl` and `apiKey` with your actual values.
