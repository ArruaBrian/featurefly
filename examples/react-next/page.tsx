'use client';

import { FeatureFlyProvider, useFeatureFlag, useAllFlags } from 'featurefly/react';
import { FeatureFlagsClient } from 'featurefly';

// Create client outside component to avoid re-creation
const client = new FeatureFlagsClient({
  baseUrl: process.env.NEXT_PUBLIC_FF_URL!,
  apiKey: process.env.NEXT_PUBLIC_FF_KEY,
  streaming: true,
  bootstrapFlags: {}, // Populate from SSR if available
});

function NewFeatureBanner() {
  const { value: showBanner, loading } = useFeatureFlag('promo-banner', false, {
    workspaceId: 'ws-123',
  });

  if (loading) return <div>Loading...</div>;
  if (!showBanner) return null;

  return <div className="banner">New feature available!</div>;
}

function FlagDashboard() {
  const { flags, loading } = useAllFlags({ workspaceId: 'ws-123' });

  if (loading) return <div>Loading flags...</div>;

  return (
    <ul>
      {Object.entries(flags).map(([slug, value]) => (
        <li key={slug}>
          {slug}: {String(value)}
        </li>
      ))}
    </ul>
  );
}

export default function Page() {
  return (
    <FeatureFlyProvider client={client}>
      <NewFeatureBanner />
      <FlagDashboard />
    </FeatureFlyProvider>
  );
}
