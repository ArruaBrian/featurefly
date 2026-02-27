import { RolloutConfig } from './types';

/**
 * Deterministically checks if a given key falls within a rollout percentage.
 *
 * @param key The stickiness key (e.g. userId)
 * @param config Rollout configuration including percentage, salt, and bucket max
 * @returns true if the key hashes to a bucket < percentage
 */
export function isInRollout(key: string | undefined, config: RolloutConfig | undefined): boolean {
  if (!config) return false;
  
  if (config.percentage <= 0) return false;
  if (config.percentage >= 100) return true;
  if (!key) return false; // Anonymous users cannot be deterministically bucketed

  const bucket = getHashBucket(key, config.salt, config.buckets);
  
  // Example: percentage 20 means buckets 0-19 are true, 20-99 are false
  // For buckets=1000, percentage 20.5 means buckets 0-204 are true
  const maxBucket = (config.percentage / 100) * (config.buckets || 100);
  
  return bucket < maxBucket;
}

/**
 * Returns a deterministic bucket number (default 0-99) for a given key and salt.
 * Uses MurmurHash3 (32-bit).
 */
export function getHashBucket(key: string, salt = '', buckets = 100): number {
  const hash = murmurhash3(`${salt}:${key}`);
  return hash % buckets;
}

/**
 * Fast, pure-TypeScript implementation of MurmurHash3 (32-bit).
 * Standard algorithm for deterministic feature flag bucket distribution.
 */
function murmurhash3(key: string, seed = 0): number {
  let h1b, k1;
  let h1;

  const remainder = key.length & 3; 
  const bytes = key.length - remainder;
  h1 = seed;

  const c1 = 0xcc9e2d51;
  const c2 = 0x1b873593;

  let i = 0;

  while (i < bytes) {
    k1 =
      ((key.charCodeAt(i) & 0xff)) |
      ((key.charCodeAt(++i) & 0xff) << 8) |
      ((key.charCodeAt(++i) & 0xff) << 16) |
      ((key.charCodeAt(++i) & 0xff) << 24);
    ++i;

    k1 = ((((k1 & 0xffff) * c1) + ((((k1 >>> 16) * c1) & 0xffff) << 16))) & 0xffffffff;
    k1 = (k1 << 15) | (k1 >>> 17);
    k1 = ((((k1 & 0xffff) * c2) + ((((k1 >>> 16) * c2) & 0xffff) << 16))) & 0xffffffff;

    h1 ^= k1;
    h1 = (h1 << 13) | (h1 >>> 19);
    h1b = ((((h1 & 0xffff) * 5) + ((((h1 >>> 16) * 5) & 0xffff) << 16))) & 0xffffffff;
    h1 = (((h1b & 0xffff) + 0x6b64) + ((((h1b >>> 16) + 0xe654) & 0xffff) << 16));
  }

  k1 = 0;

  switch (remainder) {
    case 3: k1 ^= (key.charCodeAt(i + 2) & 0xff) << 16;
    case 2: k1 ^= (key.charCodeAt(i + 1) & 0xff) << 8;
    case 1:
      k1 ^= (key.charCodeAt(i) & 0xff);
      k1 = (((k1 & 0xffff) * c1) + ((((k1 >>> 16) * c1) & 0xffff) << 16)) & 0xffffffff;
      k1 = (k1 << 15) | (k1 >>> 17);
      k1 = (((k1 & 0xffff) * c2) + ((((k1 >>> 16) * c2) & 0xffff) << 16)) & 0xffffffff;
      h1 ^= k1;
  }

  h1 ^= key.length;

  h1 ^= h1 >>> 16;
  h1 = (((h1 & 0xffff) * 0x85ebca6b) + ((((h1 >>> 16) * 0x85ebca6b) & 0xffff) << 16)) & 0xffffffff;
  h1 ^= h1 >>> 13;
  h1 = (((h1 & 0xffff) * 0xc2b2ae35) + ((((h1 >>> 16) * 0xc2b2ae35) & 0xffff) << 16)) & 0xffffffff;
  h1 ^= h1 >>> 16;

  return h1 >>> 0;
}
