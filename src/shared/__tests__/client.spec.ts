import axios, { AxiosInstance } from 'axios';
import { FeatureFlagsClient } from '../client';
import { FeatureFlagsConfig, ILogger } from '../types';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const createMockLogger = (): ILogger => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
});

const createClient = (overrides: Partial<FeatureFlagsConfig> = {}): FeatureFlagsClient => {
  const mockAxiosInstance = {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() },
    },
  };

  mockedAxios.create.mockReturnValue(mockAxiosInstance as unknown as AxiosInstance);
  mockedAxios.isAxiosError.mockImplementation((error: unknown) => (error as { isAxiosError?: boolean })?.isAxiosError === true);

  const client = new FeatureFlagsClient({
    baseUrl: 'http://localhost:3001',
    logger: createMockLogger(),
    logLevel: 'silent',
    cacheEnabled: true,
    cacheTtlMs: 60_000,
    retry: { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 10 },
    ...overrides,
  });

  return client;
};

const getMockHttp = () => {
  return (mockedAxios.create as jest.Mock).mock.results[
    (mockedAxios.create as jest.Mock).mock.results.length - 1
  ].value;
};

describe('FeatureFlagsClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('evaluateFlag', () => {
    it('should return the flag value from the API', async () => {
      const client = createClient();
      const http = getMockHttp();
      http.get.mockResolvedValue({ data: { value: true } });

      const result = await client.evaluateFlag('my-flag');
      expect(result).toBe(true);
      expect(http.get).toHaveBeenCalledWith('/feature-flags/my-flag/evaluate', { params: {} });

      client.dispose();
    });

    it('should pass context as params', async () => {
      const client = createClient();
      const http = getMockHttp();
      http.get.mockResolvedValue({ data: { value: true } });

      await client.evaluateFlag('my-flag', { workspaceId: 'ws-123' });
      expect(http.get).toHaveBeenCalledWith('/feature-flags/my-flag/evaluate', {
        params: { workspaceId: 'ws-123' },
      });

      client.dispose();
    });

    it('should return cached value on second call', async () => {
      const client = createClient();
      const http = getMockHttp();
      http.get.mockResolvedValue({ data: { value: true } });

      await client.evaluateFlag('my-flag');
      const cached = await client.evaluateFlag('my-flag');

      expect(cached).toBe(true);
      expect(http.get).toHaveBeenCalledTimes(1); // only 1 HTTP call
      client.dispose();
    });

    it('should return local override without HTTP call', async () => {
      const client = createClient({
        localOverrides: { 'override-flag': true },
      });
      const http = getMockHttp();

      const result = await client.evaluateFlag('override-flag');
      expect(result).toBe(true);
      expect(http.get).not.toHaveBeenCalled();
      client.dispose();
    });

    it('should return fallback default on API failure', async () => {
      const client = createClient({
        fallbackDefaults: { 'fallback-flag': false },
      });
      const http = getMockHttp();
      http.get.mockRejectedValue(new Error('network error'));

      const result = await client.evaluateFlag('fallback-flag');
      expect(result).toBe(false);
      client.dispose();
    });

    it('should return false when API fails and no fallback', async () => {
      const client = createClient();
      const http = getMockHttp();
      http.get.mockRejectedValue(new Error('network error'));

      const result = await client.evaluateFlag('no-fallback');
      expect(result).toBe(false);
      client.dispose();
    });

    it('should support non-boolean flag values', async () => {
      const client = createClient();
      const http = getMockHttp();
      http.get.mockResolvedValue({ data: { value: 'variant-B' } });

      const result = await client.evaluateFlag<string>('ab-test');
      expect(result).toBe('variant-B');
      client.dispose();
    });
  });

  describe('evaluateAllFlags', () => {
    it('should return batch evaluation from API', async () => {
      const client = createClient();
      const http = getMockHttp();
      http.get.mockResolvedValue({ data: { 'flag-a': true, 'flag-b': false } });

      const result = await client.evaluateAllFlags();
      expect(result).toEqual({ 'flag-a': true, 'flag-b': false });
      client.dispose();
    });

    it('should merge local overrides into batch result', async () => {
      const client = createClient({
        localOverrides: { 'flag-c': true },
      });
      const http = getMockHttp();
      http.get.mockResolvedValue({ data: { 'flag-a': true } });

      const result = await client.evaluateAllFlags();
      expect(result).toEqual({ 'flag-a': true, 'flag-c': true });
      client.dispose();
    });

    it('should return fallback + overrides on API failure', async () => {
      const client = createClient({
        fallbackDefaults: { 'flag-a': false },
        localOverrides: { 'flag-b': true },
      });
      const http = getMockHttp();
      http.get.mockRejectedValue(new Error('down'));

      const result = await client.evaluateAllFlags();
      expect(result).toEqual({ 'flag-a': false, 'flag-b': true });
      client.dispose();
    });
  });

  describe('CRUD operations', () => {
    it('should create a flag', async () => {
      const client = createClient();
      const http = getMockHttp();
      const flag = { id: '1', slug: 'new-flag', name: 'New Flag' };
      http.post.mockResolvedValue({ data: flag });

      const result = await client.createFlag({
        slug: 'new-flag',
        name: 'New Flag',
        category: 'both',
      });
      expect(result).toEqual(flag);
      client.dispose();
    });

    it('should get all flags', async () => {
      const client = createClient();
      const http = getMockHttp();
      const flags = [{ id: '1', slug: 'flag-1' }];
      http.get.mockResolvedValue({ data: flags });

      const result = await client.getAllFlags();
      expect(result).toEqual(flags);
      client.dispose();
    });

    it('should get flag by id', async () => {
      const client = createClient();
      const http = getMockHttp();
      const flag = { id: '1', slug: 'flag-1' };
      http.get.mockResolvedValue({ data: flag });

      const result = await client.getFlagById('1');
      expect(result).toEqual(flag);
      client.dispose();
    });

    it('should return null for 404 on getFlagById', async () => {
      const client = createClient();
      const http = getMockHttp();
      const error = { isAxiosError: true, response: { status: 404 } };
      http.get.mockRejectedValue(error);

      const result = await client.getFlagById('missing');
      expect(result).toBeNull();
      client.dispose();
    });

    it('should update a flag', async () => {
      const client = createClient();
      const http = getMockHttp();
      const flag = { id: '1', slug: 'flag-1', name: 'Updated' };
      http.patch.mockResolvedValue({ data: flag });

      const result = await client.updateFlag('1', { name: 'Updated' });
      expect(result).toEqual(flag);
      client.dispose();
    });

    it('should delete a flag', async () => {
      const client = createClient();
      const http = getMockHttp();
      http.delete.mockResolvedValue({});

      await expect(client.deleteFlag('1')).resolves.not.toThrow();
      client.dispose();
    });
  });

  describe('workspace flags', () => {
    it('should set a workspace flag', async () => {
      const client = createClient();
      const http = getMockHttp();
      const wsFlag = { id: '1', workspaceId: 'ws-1', flagId: '1', value: true };
      http.post.mockResolvedValue({ data: wsFlag });

      const result = await client.setWorkspaceFlag('flag-1', 'ws-1', true);
      expect(result).toEqual(wsFlag);
      client.dispose();
    });

    it('should remove a workspace flag', async () => {
      const client = createClient();
      const http = getMockHttp();
      http.delete.mockResolvedValue({});

      await expect(client.removeWorkspaceFlag('flag-1', 'ws-1')).resolves.not.toThrow();
      client.dispose();
    });

    it('should get workspace flags', async () => {
      const client = createClient();
      const http = getMockHttp();
      const flags = [{ id: '1', workspaceId: 'ws-1', flagId: '1', value: true }];
      http.get.mockResolvedValue({ data: flags });

      const result = await client.getWorkspaceFlags('ws-1');
      expect(result).toEqual(flags);
      client.dispose();
    });
  });

  describe('local overrides', () => {
    it('should set and get local overrides', () => {
      const client = createClient();
      client.setLocalOverride('flag-a', true);
      client.setLocalOverride('flag-b', 'variant');

      expect(client.getLocalOverrides()).toEqual({
        'flag-a': true,
        'flag-b': 'variant',
      });
      client.dispose();
    });

    it('should remove a local override', () => {
      const client = createClient({ localOverrides: { 'flag-a': true } });
      client.removeLocalOverride('flag-a');
      expect(client.getLocalOverrides()).toEqual({});
      client.dispose();
    });

    it('should clear all local overrides', () => {
      const client = createClient({
        localOverrides: { a: true, b: false },
      });
      client.clearLocalOverrides();
      expect(client.getLocalOverrides()).toEqual({});
      client.dispose();
    });
  });

  describe('events', () => {
    it('should emit flagEvaluated on evaluation', async () => {
      const client = createClient({ localOverrides: { 'flag': true } });
      const handler = jest.fn();
      client.on('flagEvaluated', handler);

      await client.evaluateFlag('flag');
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          slug: 'flag',
          value: true,
          reason: 'LOCAL_OVERRIDE',
        }),
      );
      client.dispose();
    });

    it('should emit cacheHit on cached evaluation', async () => {
      const client = createClient();
      const http = getMockHttp();
      http.get.mockResolvedValue({ data: { value: true } });

      const handler = jest.fn();
      client.on('cacheHit', handler);

      await client.evaluateFlag('flag');
      await client.evaluateFlag('flag'); // second call should be cached

      expect(handler).toHaveBeenCalledTimes(1);
      client.dispose();
    });

    it('should emit cacheMiss on first evaluation', async () => {
      const client = createClient();
      const http = getMockHttp();
      http.get.mockResolvedValue({ data: { value: true } });

      const handler = jest.fn();
      client.on('cacheMiss', handler);

      await client.evaluateFlag('flag');
      expect(handler).toHaveBeenCalledTimes(1);
      client.dispose();
    });
  });

  describe('dispose', () => {
    it('should prevent further operations after dispose', async () => {
      const client = createClient();
      client.dispose();

      await expect(client.evaluateFlag('flag')).rejects.toThrow('disposed');
      expect(client.isDisposed()).toBe(true);
    });
  });

  describe('cache utilities', () => {
    it('should clear cache', () => {
      const client = createClient();
      client.clearCache();
      expect(client.getCacheStats().size).toBe(0);
      client.dispose();
    });
  });

  describe('circuit breaker', () => {
    it('should expose circuit breaker state', () => {
      const client = createClient();
      const state = client.getCircuitBreakerState();
      expect(state.state).toBe('closed');
      expect(state.failures).toBe(0);
      client.dispose();
    });

    it('should allow manual circuit breaker reset', () => {
      const client = createClient();
      client.resetCircuitBreaker();
      expect(client.getCircuitBreakerState().state).toBe('closed');
      client.dispose();
    });
  });
});
