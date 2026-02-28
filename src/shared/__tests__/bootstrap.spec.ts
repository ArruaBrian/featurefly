import { FeatureFlagsClient } from '../client';

describe('SSR Bootstrapping', () => {
  let mockFetch: jest.Mock;

  beforeEach(() => {
    mockFetch = jest.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should evaluate flags from bootstrap cache without HTTP requests', async () => {
    const client = new FeatureFlagsClient({
      baseUrl: 'http://test.com',
      bootstrapFlags: {
        'hero-v2': true,
        'btn-color': 'blue'
      }
    });

    const hero = await client.evaluateFlag('hero-v2', false);
    const color = await client.evaluateFlag('btn-color', 'red');
    const all = await client.evaluateAllFlags();

    expect(hero).toBe(true);
    expect(color).toBe('blue');
    expect(all).toEqual({ 'hero-v2': true, 'btn-color': 'blue' });
    expect(mockFetch).not.toHaveBeenCalled(); // 0 network calls!
  });
});
