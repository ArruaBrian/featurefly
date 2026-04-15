import { FeatureFlagsClient } from 'featurefly';

const client = new FeatureFlagsClient({
  baseUrl: 'https://api.example.com',
  apiKey: 'your-api-key',
  logLevel: 'info',
  logPrefix: '[MyApp]',
});

async function main() {
  // Evaluate a boolean flag
  const isEnabled = await client.evaluateFlag('new-checkout', false, {
    workspaceId: 'ws-123',
    userId: 'user-456',
  });

  console.log('new-checkout enabled:', isEnabled);

  // Evaluate all flags
  const allFlags = await client.evaluateAllFlags({ workspaceId: 'ws-123' });
  console.log('All flags:', allFlags);

  // Listen for real-time changes
  client.on('flagChanged', ({ slug, previousValue, newValue }) => {
    console.log(`Flag "${slug}" changed: ${previousValue} → ${newValue}`);
  });

  // Clean up when done
  client.dispose();
}

main().catch(console.error);
