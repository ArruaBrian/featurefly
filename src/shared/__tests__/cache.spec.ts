import { InMemoryCache } from '../cache';

describe('InMemoryCache', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should create a cache with default TTL', () => {
      const cache = new InMemoryCache();
      const stats = cache.getStats();
      expect(stats.enabled).toBe(true);
      expect(stats.size).toBe(0);
      cache.destroy();
    });

    it('should create a disabled cache when TTL is 0', () => {
      const cache = new InMemoryCache(0);
      expect(cache.getStats().enabled).toBe(false);
      cache.destroy();
    });
  });

  describe('set/get', () => {
    it('should store and retrieve a value', () => {
      const cache = new InMemoryCache(60_000);
      cache.set('key1', 'value1');
      const result = cache.get<string>('key1');
      expect(result).toEqual({ hit: true, value: 'value1' });
      cache.destroy();
    });

    it('should correctly handle false boolean values', () => {
      const cache = new InMemoryCache(60_000);
      cache.set('flag', false);
      const result = cache.get<boolean>('flag');
      expect(result).toEqual({ hit: true, value: false });
      cache.destroy();
    });

    it('should correctly handle zero numeric values', () => {
      const cache = new InMemoryCache(60_000);
      cache.set('count', 0);
      const result = cache.get<number>('count');
      expect(result).toEqual({ hit: true, value: 0 });
      cache.destroy();
    });

    it('should correctly handle empty string values', () => {
      const cache = new InMemoryCache(60_000);
      cache.set('name', '');
      const result = cache.get<string>('name');
      expect(result).toEqual({ hit: true, value: '' });
      cache.destroy();
    });

    it('should return { hit: false } for missing keys', () => {
      const cache = new InMemoryCache(60_000);
      const result = cache.get('nonexistent');
      expect(result).toEqual({ hit: false });
      cache.destroy();
    });

    it('should not store values when disabled', () => {
      const cache = new InMemoryCache(0);
      cache.set('key', 'value');
      const result = cache.get('key');
      expect(result).toEqual({ hit: false });
      cache.destroy();
    });

    it('should expire entries after TTL', () => {
      jest.useFakeTimers();
      const cache = new InMemoryCache(1000);

      cache.set('key', 'value');
      expect(cache.get('key')).toEqual({ hit: true, value: 'value' });

      jest.advanceTimersByTime(1001);
      expect(cache.get('key')).toEqual({ hit: false });
      cache.destroy();
    });
  });

  describe('has', () => {
    it('should return true for existing non-expired keys', () => {
      const cache = new InMemoryCache(60_000);
      cache.set('key', 'value');
      expect(cache.has('key')).toBe(true);
      cache.destroy();
    });

    it('should return false for expired keys', () => {
      jest.useFakeTimers();
      const cache = new InMemoryCache(1000);
      cache.set('key', 'value');
      jest.advanceTimersByTime(1001);
      expect(cache.has('key')).toBe(false);
      cache.destroy();
    });

    it('should return false for missing keys', () => {
      const cache = new InMemoryCache(60_000);
      expect(cache.has('missing')).toBe(false);
      cache.destroy();
    });
  });

  describe('delete', () => {
    it('should delete an existing key', () => {
      const cache = new InMemoryCache(60_000);
      cache.set('key', 'value');
      expect(cache.delete('key')).toBe(true);
      expect(cache.get('key')).toEqual({ hit: false });
      cache.destroy();
    });

    it('should return false for non-existent keys', () => {
      const cache = new InMemoryCache(60_000);
      expect(cache.delete('nonexistent')).toBe(false);
      cache.destroy();
    });
  });

  describe('clear', () => {
    it('should remove all entries', () => {
      const cache = new InMemoryCache(60_000);
      cache.set('a', 1);
      cache.set('b', 2);
      cache.set('c', 3);
      cache.clear();
      expect(cache.getStats().size).toBe(0);
      cache.destroy();
    });
  });

  describe('getStats', () => {
    it('should return correct stats', () => {
      const cache = new InMemoryCache(60_000);
      cache.set('a', 1);
      cache.set('b', 2);
      const stats = cache.getStats();
      expect(stats.size).toBe(2);
      expect(stats.keys).toEqual(expect.arrayContaining(['a', 'b']));
      expect(stats.enabled).toBe(true);
      cache.destroy();
    });
  });

  describe('destroy', () => {
    it('should clear all entries and stop cleanup timer', () => {
      const cache = new InMemoryCache(60_000);
      cache.set('key', 'value');
      cache.destroy();
      expect(cache.getStats().size).toBe(0);
    });
  });
});
