import { FeatureFlagsClient } from 'featurefly';
import type { FlagDocument } from 'featurefly';

// Pre-fetched flag document — evaluate entirely offline, zero HTTP
const flagDocument: FlagDocument = {
  flags: [
    {
      id: '1',
      slug: 'dark-mode',
      name: 'Dark Mode',
      category: 'frontend',
      defaultValue: false,
      valueType: 'boolean',
      version: 1,
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
      rollout: { percentage: 50, stickinessKey: 'userId' },
    },
  ],
  version: 1,
  fetchedAt: new Date().toISOString(),
};

const client = new FeatureFlagsClient({
  baseUrl: 'https://api.example.com', // Not used in edge mode
  edgeDocument: flagDocument,
});

// Zero-latency evaluation — no network calls
const darkMode = await client.evaluateFlag('dark-mode', false, {
  userId: 'user-789',
});

console.log('Dark mode:', darkMode);

// You can also update the document later without recreating the client
// client.updateEdgeDocument(newDocument);

client.dispose();
