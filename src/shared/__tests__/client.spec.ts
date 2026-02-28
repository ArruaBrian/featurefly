import { FeatureFlagsClient, FetchError } from '../client';
import { FeatureFlyEvent } from '../types';

describe('FeatureFlagsClient', () => {
  let mockFetch: jest.Mock;

  beforeEach(() => {
    mockFetch = jest.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const createMockResponse = (data: any, status = 200, ok = true) => ({
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
});
