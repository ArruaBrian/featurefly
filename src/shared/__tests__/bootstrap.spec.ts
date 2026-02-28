import { FeatureFlagsClient } from '../client';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('SSR Bootstrapping', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should evaluate flags from bootstrap cache without HTTP requests', async () => {
    const mockGet = jest.fn();
    mockedAxios.create.mockReturnValue({
      get: mockGet,
      interceptors: { request: { use: jest.fn() } },
    } as any);

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
    expect(mockGet).not.toHaveBeenCalled(); // 0 network calls!
  });
});
