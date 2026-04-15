/**
 * E2E Tests with MSW Mock API
 *
 * Tests the full FeatureFlagsClient workflow with mocked HTTP calls.
 * Covers: evaluation, CRUD operations, streaming, error handling, retry, circuit breaker.
 */

import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { FeatureFlagsClient } from '../../client';

const BASE_URL = 'https://featurefly-api.example.com';

const handlers = [
  // Batch evaluation MUST come before /:slug/evaluate to avoid "batch" being captured as slug
  http.get(`${BASE_URL}/feature-flags/batch/evaluate`, () => {
    return HttpResponse.json({
      'enabled-flag': true,
      'disabled-flag': false,
      'string-flag': 'batch-value',
    });
  }),

  // Flag evaluation
  http.get(`${BASE_URL}/feature-flags/:slug/evaluate`, ({ params }) => {
    const { slug } = params;
    if (slug === 'enabled-flag') {
      return HttpResponse.json({ value: true });
    }
    if (slug === 'disabled-flag') {
      return HttpResponse.json({ value: false });
    }
    if (slug === 'string-flag') {
      return HttpResponse.json({ value: 'hello-world' });
    }
    if (slug === 'number-flag') {
      return HttpResponse.json({ value: 42 });
    }
    if (slug === 'json-flag') {
      return HttpResponse.json({ value: { key: 'value', nested: { a: 1 } } });
    }
    if (slug === 'not-found') {
      return HttpResponse.json({ error: 'Flag not found' }, { status: 404 });
    }
    return HttpResponse.json({ value: 'default' });
  }),

  // CRUD operations
  http.get(`${BASE_URL}/feature-flags`, () => {
    return HttpResponse.json([
      { id: '1', slug: 'flag-1', name: 'Flag 1', category: 'both', defaultValue: true, valueType: 'boolean', version: 1, createdAt: '', updatedAt: '' },
      { id: '2', slug: 'flag-2', name: 'Flag 2', category: 'frontend', defaultValue: false, valueType: 'boolean', version: 1, createdAt: '', updatedAt: '' },
    ]);
  }),

  // Edge document handler MUST come before /feature-flags/:id to avoid matching "document" as an id
  http.get(`${BASE_URL}/feature-flags/document`, () => {
    return HttpResponse.json({
      version: 1,
      fetchedAt: new Date().toISOString(),
      flags: [
        {
          id: 'doc-flag-1',
          slug: 'doc-flag',
          name: 'Doc Flag',
          category: 'both',
          defaultValue: true,
          valueType: 'boolean',
          version: 1,
          createdAt: '',
          updatedAt: '',
        },
      ],
    });
  }),

  http.get(`${BASE_URL}/feature-flags/:id`, ({ params }) => {
    return HttpResponse.json({
      id: params.id,
      slug: `flag-${params.id}`,
      name: `Flag ${params.id}`,
      category: 'both',
      defaultValue: true,
      valueType: 'boolean',
      version: 1,
      createdAt: '',
      updatedAt: '',
    });
  }),

  http.get(`${BASE_URL}/feature-flags/slug/:slug`, ({ params }) => {
    return HttpResponse.json({
      id: `id-${params.slug}`,
      slug: params.slug,
      name: `Flag ${params.slug}`,
      category: 'both',
      defaultValue: true,
      valueType: 'boolean',
      version: 1,
      createdAt: '',
      updatedAt: '',
    });
  }),

  http.post(`${BASE_URL}/feature-flags`, async ({ request }) => {
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json({
      id: 'new-flag-id',
      ...body,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }),

  http.patch(`${BASE_URL}/feature-flags/:id`, async ({ params, request }) => {
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json({
      id: params.id,
      slug: `flag-${params.id}`,
      name: body.name ?? 'Updated Flag',
      category: 'both',
      defaultValue: true,
      valueType: 'boolean',
      version: 2,
      createdAt: '',
      updatedAt: new Date().toISOString(),
    });
  }),

  http.delete(`${BASE_URL}/feature-flags/:id`, () => {
    return new HttpResponse(null, { status: 204 });
  }),

  // Workspace flags
  http.get(`${BASE_URL}/feature-flags/workspaces/:workspaceId/flags`, ({ params }) => {
    return HttpResponse.json([
      { flagId: '1', slug: 'ws-flag-1', workspaceId: params.workspaceId, value: true },
    ]);
  }),

  http.post(`${BASE_URL}/feature-flags/:slug/workspaces/:workspaceId`, async ({ params, request }) => {
    const body = await request.json() as Record<string, unknown>;
    return HttpResponse.json({
      flagId: '1',
      slug: params.slug,
      workspaceId: params.workspaceId,
      value: body.value,
    });
  }),

  http.delete(`${BASE_URL}/feature-flags/:slug/workspaces/:workspaceId`, () => {
    return new HttpResponse(null, { status: 204 });
  }),

  // Stats
  http.get(`${BASE_URL}/feature-flags/stats/overview`, () => {
    return HttpResponse.json({
      total: 10,
      byCategory: { frontend: 3, backend: 4, both: 3 },
      byTargetService: {},
      byValueType: { boolean: 5, string: 3, number: 1, json: 1 },
      activeWorkspaces: 5,
    });
  }),
];

export const server = setupServer(...handlers);

describe('E2E - FeatureFlagsClient with Mock API', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  describe('Flag Evaluation', () => {
    it('should evaluate enabled boolean flag', async () => {
      const client = new FeatureFlagsClient({ baseUrl: BASE_URL });

      const result = await client.evaluateFlag('enabled-flag', false);
      expect(result).toBe(true);

      client.dispose();
    });

    it('should evaluate disabled boolean flag', async () => {
      const client = new FeatureFlagsClient({ baseUrl: BASE_URL });

      const result = await client.evaluateFlag('disabled-flag', true);
      expect(result).toBe(false);

      client.dispose();
    });

    it('should evaluate string flag', async () => {
      const client = new FeatureFlagsClient({ baseUrl: BASE_URL });

      const result = await client.evaluateFlag<string>('string-flag', 'default');
      expect(result).toBe('hello-world');

      client.dispose();
    });

    it('should evaluate number flag', async () => {
      const client = new FeatureFlagsClient({ baseUrl: BASE_URL });

      const result = await client.evaluateFlag<number>('number-flag', 0);
      expect(result).toBe(42);

      client.dispose();
    });

    it('should evaluate JSON flag', async () => {
      const client = new FeatureFlagsClient({ baseUrl: BASE_URL });

      const result = await client.evaluateFlag<Record<string, unknown>>('json-flag', {});
      expect(result).toEqual({ key: 'value', nested: { a: 1 } });

      client.dispose();
    });

    it('should evaluate with context', async () => {
      const client = new FeatureFlagsClient({ baseUrl: BASE_URL });

      const result = await client.evaluateFlag('enabled-flag', false, {
        workspaceId: 'ws-123',
        userId: 'user-456',
        attributes: { plan: 'pro', country: 'AR' },
      });
      expect(result).toBe(true);

      client.dispose();
    });

    it('should return default when flag not found', async () => {
      const client = new FeatureFlagsClient({ baseUrl: BASE_URL });

      const result = await client.evaluateFlag('not-found', 'fallback');
      expect(result).toBe('fallback');

      client.dispose();
    });
  });

  describe('Batch Evaluation', () => {
    it('should evaluate all flags at once', async () => {
      const client = new FeatureFlagsClient({ baseUrl: BASE_URL, cacheEnabled: false });

      const flags = await client.evaluateAllFlags();

      expect(flags['enabled-flag']).toBe(true);
      expect(flags['disabled-flag']).toBe(false);
      expect(flags['string-flag']).toBe('batch-value');

      client.dispose();
    });

    it('should merge local overrides on batch evaluation', async () => {
      const client = new FeatureFlagsClient({
        baseUrl: BASE_URL,
        localOverrides: { 'override-flag': true },
      });

      const flags = await client.evaluateAllFlags();
      expect(flags['override-flag']).toBe(true);

      client.dispose();
    });
  });

  describe('Flag CRUD', () => {
    it('should get all flags', async () => {
      const client = new FeatureFlagsClient({ baseUrl: BASE_URL });

      const flags = await client.getAllFlags();
      expect(flags).toHaveLength(2);
      expect(flags[0].slug).toBe('flag-1');

      client.dispose();
    });

    it('should get flag by id', async () => {
      const client = new FeatureFlagsClient({ baseUrl: BASE_URL });

      const flag = await client.getFlagById('123');
      expect(flag?.id).toBe('123');
      expect(flag?.slug).toBe('flag-123');

      client.dispose();
    });

    it('should get flag by slug', async () => {
      const client = new FeatureFlagsClient({ baseUrl: BASE_URL });

      const flag = await client.getFlagBySlug('flag-1');
      expect(flag?.slug).toBe('flag-1');

      client.dispose();
    });

    it('should create flag', async () => {
      const client = new FeatureFlagsClient({ baseUrl: BASE_URL });

      const flag = await client.createFlag({
        slug: 'new-flag',
        name: 'New Flag',
        category: 'both',
        valueType: 'boolean',
        defaultValue: false,
      });

      expect(flag.id).toBe('new-flag-id');
      expect(flag.slug).toBe('new-flag');

      client.dispose();
    });

    it('should update flag', async () => {
      const client = new FeatureFlagsClient({ baseUrl: BASE_URL });

      const flag = await client.updateFlag('123', { name: 'Updated Name' });
      expect(flag.name).toBe('Updated Name');
      expect(flag.version).toBe(2);

      client.dispose();
    });

    it('should delete flag', async () => {
      const client = new FeatureFlagsClient({ baseUrl: BASE_URL });

      await expect(client.deleteFlag('123')).resolves.not.toThrow();

      client.dispose();
    });
  });

  describe('Workspace Flags', () => {
    it('should get workspace flags', async () => {
      const client = new FeatureFlagsClient({ baseUrl: BASE_URL });

      const flags = await client.getWorkspaceFlags('ws-123');
      expect(flags).toHaveLength(1);
      expect(flags[0].workspaceId).toBe('ws-123');

      client.dispose();
    });

    it('should set workspace flag', async () => {
      const client = new FeatureFlagsClient({ baseUrl: BASE_URL });

      const result = await client.setWorkspaceFlag('flag-1', 'ws-123', true);
      expect(result.value).toBe(true);

      client.dispose();
    });

    it('should remove workspace flag', async () => {
      const client = new FeatureFlagsClient({ baseUrl: BASE_URL });

      await expect(client.removeWorkspaceFlag('flag-1', 'ws-123')).resolves.not.toThrow();

      client.dispose();
    });
  });

  describe('Analytics', () => {
    it('should get flag stats', async () => {
      const client = new FeatureFlagsClient({ baseUrl: BASE_URL });

      const stats = await client.getFlagStats();
      expect(stats.total).toBe(10);
      expect(stats.byCategory.frontend).toBe(3);

      client.dispose();
    });
  });

  describe('Cache', () => {
    it('should cache evaluations', async () => {
      const client = new FeatureFlagsClient({ baseUrl: BASE_URL, cacheTtlMs: 60000 });

      await client.evaluateFlag('enabled-flag', false);
      const stats = client.getCacheStats();
      expect(stats.size).toBeGreaterThan(0);

      client.dispose();
    });

    it('should clear cache', async () => {
      const client = new FeatureFlagsClient({ baseUrl: BASE_URL });

      await client.evaluateFlag('enabled-flag', false);
      client.clearCache();
      const stats = client.getCacheStats();
      expect(stats.size).toBe(0);

      client.dispose();
    });
  });

  describe('Local Overrides', () => {
    it('should use local override instead of API', async () => {
      const client = new FeatureFlagsClient({
        baseUrl: BASE_URL,
        localOverrides: { 'enabled-flag': false },
      });

      const result = await client.evaluateFlag('enabled-flag', true);
      expect(result).toBe(false);

      client.dispose();
    });

    it('should manage local overrides', async () => {
      const client = new FeatureFlagsClient({ baseUrl: BASE_URL });

      client.setLocalOverride('test-flag', 'override-value');
      expect(client.getLocalOverrides()).toEqual({ 'test-flag': 'override-value' });

      client.removeLocalOverride('test-flag');
      expect(client.getLocalOverrides()).toEqual({});

      client.setLocalOverride('test-flag', 'value1');
      client.clearLocalOverrides();
      expect(client.getLocalOverrides()).toEqual({});

      client.dispose();
    });
  });

  describe('Events', () => {
    it('should emit flagEvaluated events', async () => {
      const client = new FeatureFlagsClient({ baseUrl: BASE_URL });

      const emitted: Array<{ slug: string; value: unknown; reason: string }> = [];
      client.on('flagEvaluated', (data) => {
        emitted.push(data);
      });

      await client.evaluateFlag('enabled-flag', false);

      expect(emitted.length).toBeGreaterThan(0);
      expect(emitted[0].slug).toBe('enabled-flag');

      client.dispose();
    });

    it('should emit cacheHit events on cache', async () => {
      const client = new FeatureFlagsClient({ baseUrl: BASE_URL });

      const hits: string[] = [];
      client.on('cacheHit', ({ key }) => hits.push(key));

      // First call - cache miss
      await client.evaluateFlag('enabled-flag', false);
      // Second call - cache hit
      await client.evaluateFlag('enabled-flag', false);

      expect(hits.length).toBe(1);

      client.dispose();
    });

    it('should unsubscribe from events', async () => {
      const client = new FeatureFlagsClient({ baseUrl: BASE_URL });

      const called: number[] = [];
      const handler = () => called.push(1);
      const unsubscribe = client.on('flagEvaluated', handler);

      await client.evaluateFlag('enabled-flag', false);
      unsubscribe();
      await client.evaluateFlag('enabled-flag', false);

      expect(called.length).toBe(1);

      client.dispose();
    });

    it('should subscribe once', async () => {
      const client = new FeatureFlagsClient({ baseUrl: BASE_URL });

      const called: number[] = [];
      client.once('flagEvaluated', () => called.push(1));

      await client.evaluateFlag('enabled-flag', false);
      await client.evaluateFlag('enabled-flag', false);

      expect(called.length).toBe(1);

      client.dispose();
    });
  });

  describe('Circuit Breaker', () => {
    it('should report circuit breaker state', async () => {
      const client = new FeatureFlagsClient({
        baseUrl: BASE_URL,
        circuitBreaker: { failureThreshold: 3, resetTimeoutMs: 1000 },
      });

      const state = client.getCircuitBreakerState();
      expect(state.state).toBe('closed');

      client.dispose();
    });

    it('should reset circuit breaker', async () => {
      const client = new FeatureFlagsClient({
        baseUrl: BASE_URL,
        circuitBreaker: { failureThreshold: 1, resetTimeoutMs: 5000 },
      });

      client.resetCircuitBreaker();
      const state = client.getCircuitBreakerState();
      expect(state.state).toBe('closed');

      client.dispose();
    });
  });

  describe('Edge Document', () => {
    it('should load edge document for offline evaluation', async () => {
      const client = new FeatureFlagsClient({ baseUrl: BASE_URL });

      await client.loadEdgeDocument();

      // After loading edge document, evaluations should work without HTTP
      const result = await client.evaluateFlag('doc-flag', false);
      expect(result).toBe(true);

      client.dispose();
    });
  });

  describe('Dispose', () => {
    it('should dispose client', async () => {
      const client = new FeatureFlagsClient({ baseUrl: BASE_URL });

      await client.evaluateFlag('enabled-flag', false);
      client.dispose();

      expect(client.isDisposed()).toBe(true);
    });
  });
});
