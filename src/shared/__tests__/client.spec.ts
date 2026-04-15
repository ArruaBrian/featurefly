import { FeatureFlagsClient } from '../client';
import { stableStringify } from '../utils';

describe('FeatureFlagsClient', () => {
  let mockFetch: jest.Mock;

  beforeEach(() => {
    mockFetch = jest.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const createMockResponse = (data: unknown, status = 200, ok = true) => ({
    ok,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  });

  describe('Initialization', () => {
    it('should initialize with default config', () => {
      const client = new FeatureFlagsClient({ baseUrl: 'http://test.com' });
      expect(client).toBeDefined();
      expect(client.isDisposed()).toBe(false);
    });

    it('should NOT send Authorization header when apiKey is empty string', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ value: true }));

      const client = new FeatureFlagsClient({
        baseUrl: 'http://test.com',
        apiKey: '',
      });

      await client.evaluateFlag('test-flag', false);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://test.com/feature-flags/test-flag/evaluate',
        expect.objectContaining({
          headers: expect.not.objectContaining({ Authorization: expect.anything() }),
        })
      );
    });

    it('should NOT send Authorization header when apiKey is only whitespace', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ value: true }));

      const client = new FeatureFlagsClient({
        baseUrl: 'http://test.com',
        apiKey: '   ',
      });

      await client.evaluateFlag('test-flag', false);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://test.com/feature-flags/test-flag/evaluate',
        expect.objectContaining({
          headers: expect.not.objectContaining({ Authorization: expect.anything() }),
        })
      );
    });

    it('should send Authorization header with correct Bearer token when apiKey is valid', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ value: true }));

      const client = new FeatureFlagsClient({
        baseUrl: 'http://test.com',
        apiKey: 'valid-key',
      });

      await client.evaluateFlag('test-flag', false);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://test.com/feature-flags/test-flag/evaluate',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer valid-key' }),
        })
      );
    });
  });

  describe('evaluateFlag', () => {
    it('should return value from HTTP and cache it', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ value: true }));

      const client = new FeatureFlagsClient({
        baseUrl: 'http://test.com',
      });

      const result1 = await client.evaluateFlag('my-flag', false);
      const result2 = await client.evaluateFlag('my-flag', false);

      expect(result1).toBe(true);
      expect(result2).toBe(true); // Should be from cache
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://test.com/feature-flags/my-flag/evaluate',
        expect.any(Object)
      );
    });

    it('should pass context as query parameters', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ value: true }));
      const client = new FeatureFlagsClient({ baseUrl: 'http://test.com' });

      await client.evaluateFlag('ctx-flag', false, {
        userId: 'u1',
        workspaceId: 'w1',
        attributes: { plan: 'pro' }
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('http://test.com/feature-flags/ctx-flag/evaluate?'),
        expect.any(Object)
      );
      
      const calledUrl = mockFetch.mock.calls[0][0];
      expect(calledUrl).toContain('userId=u1');
      expect(calledUrl).toContain('workspaceId=w1');
      expect(calledUrl).toContain('attributes%5Bplan%5D=pro');
    });

    it('should fallback to local override', async () => {
      const client = new FeatureFlagsClient({
        baseUrl: 'http://test.com',
        localOverrides: { 'my-flag': true }
      });

      const result = await client.evaluateFlag('my-flag', false);
      expect(result).toBe(true);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should fallback to default value on failure', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({}, 500, false));

      const client = new FeatureFlagsClient({
        baseUrl: 'http://test.com',
        retry: { maxAttempts: 0 } // Fail fast
      });

      const result = await client.evaluateFlag('my-flag', false);
      expect(result).toBe(false); // The defaultValue we passed
    });
  });

  describe('evaluateAllFlags', () => {
    it('should fetch all flags', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ 'f1': true, 'f2': 'blue' }));

      const client = new FeatureFlagsClient({ baseUrl: 'http://test.com' });
      const result = await client.evaluateAllFlags();

      expect(result).toEqual({ 'f1': true, 'f2': 'blue' });
      expect(mockFetch).toHaveBeenCalledWith(
        'http://test.com/feature-flags/batch/evaluate',
        expect.any(Object)
      );
    });
  });

  describe('stableStringify', () => {
    it('should produce same string for objects with different key order', () => {
      const obj1 = { b: 1, a: 2 };
      const obj2 = { a: 2, b: 1 };
      expect(stableStringify(obj1)).toBe(stableStringify(obj2));
    });

    it('should produce stable cache keys regardless of attribute order', async () => {
      mockFetch.mockResolvedValue(createMockResponse({ value: true }));

      const client = new FeatureFlagsClient({ baseUrl: 'http://test.com' });

      // Evaluate with attributes in one order
      await client.evaluateFlag('test-flag', false, {
        attributes: { b: 1, a: 2 }
      });

      // Evaluate with same attributes in different order - should hit cache
      await client.evaluateFlag('test-flag', false, {
        attributes: { a: 2, b: 1 }
      });

      // Should only have called fetch once (second call hit cache)
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('CRUD operations', () => {
    it('createFlag should send POST', async () => {
      const mockFlag = { id: '1', slug: 'f1', name: 'F1', category: 'both' as const, defaultValue: true, version: 1, valueType: 'boolean' as const, createdAt: '', updatedAt: '' };
      mockFetch.mockResolvedValueOnce(createMockResponse(mockFlag));

      const client = new FeatureFlagsClient({ baseUrl: 'http://test.com' });
      const result = await client.createFlag({ slug: 'f1', name: 'F1', category: 'both' });

      expect(result).toEqual(mockFlag);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://test.com/feature-flags',
        expect.objectContaining({ method: 'POST' })
      );
    });
  });

  describe('getCachedFlag / getCachedFlags', () => {
    it('should return undefined when flag is not cached', () => {
      const client = new FeatureFlagsClient({ baseUrl: 'http://test.com' });
      expect(client.getCachedFlag('non-existent')).toBeUndefined();
    });

    it('should return cached value after evaluation', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ value: true }));
      const client = new FeatureFlagsClient({ baseUrl: 'http://test.com' });

      await client.evaluateFlag('my-flag', false);
      expect(client.getCachedFlag<boolean>('my-flag')).toBe(true);
    });

    it('should return bootstrap flags from cache synchronously', () => {
      const client = new FeatureFlagsClient({
        baseUrl: 'http://test.com',
        bootstrapFlags: { 'dark-mode': true, 'new-ui': false },
      });

      expect(client.getCachedFlag<boolean>('dark-mode')).toBe(true);
      expect(client.getCachedFlag<boolean>('new-ui')).toBe(false);
      expect(client.getCachedFlag('unknown')).toBeUndefined();
    });

    it('should return bootstrap batch flags from getCachedFlags', () => {
      const bootstrap = { 'dark-mode': true, 'new-ui': false };
      const client = new FeatureFlagsClient({
        baseUrl: 'http://test.com',
        bootstrapFlags: bootstrap,
      });

      expect(client.getCachedFlags()).toEqual(bootstrap);
    });

    it('should return undefined from getCachedFlags when no batch was cached', () => {
      const client = new FeatureFlagsClient({ baseUrl: 'http://test.com' });
      expect(client.getCachedFlags()).toBeUndefined();
    });

    it('should scope cached values by context', async () => {
      mockFetch.mockResolvedValueOnce(createMockResponse({ value: 'variant-a' }));
      const client = new FeatureFlagsClient({ baseUrl: 'http://test.com' });

      const ctx = { workspaceId: 'ws-1' };
      await client.evaluateFlag('ab-flag', 'control', ctx);

      // Same context → should find it
      expect(client.getCachedFlag('ab-flag', ctx)).toBe('variant-a');
      // Different context → not cached
      expect(client.getCachedFlag('ab-flag', { workspaceId: 'ws-2' })).toBeUndefined();
      // No context → not cached
      expect(client.getCachedFlag('ab-flag')).toBeUndefined();
    });
  });
});
