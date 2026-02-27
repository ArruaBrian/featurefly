import { isInRollout, getHashBucket } from '../rollout';

describe('Rollout Engine', () => {
  describe('MurmurHash3 Distribution', () => {
    it('returns consistent answers for the same key + salt', () => {
      expect(getHashBucket('user1', 'salt-A')).toBe(getHashBucket('user1', 'salt-A'));
      expect(getHashBucket('user2', 'salt-B')).toBe(getHashBucket('user2', 'salt-B'));
    });

    it('returns different answers for different keys', () => {
      expect(getHashBucket('user1', 'salt')).not.toBe(getHashBucket('user2', 'salt'));
    });

    it('returns different answers for different salts', () => {
      expect(getHashBucket('user1', 'salt1')).not.toBe(getHashBucket('user1', 'salt2'));
    });
  });

  describe('isInRollout', () => {
    it('returns false if percentage is 0', () => {
      expect(isInRollout('user', { percentage: 0 })).toBe(false);
      expect(isInRollout('user', { percentage: -10 })).toBe(false);
    });

    it('returns true if percentage is 100', () => {
      expect(isInRollout('user', { percentage: 100 })).toBe(true);
      expect(isInRollout('user', { percentage: 150 })).toBe(true);
    });

    it('returns false if key is missing (anonymous) and percentage < 100', () => {
      expect(isInRollout('', { percentage: 50 })).toBe(false);
      expect(isInRollout(undefined, { percentage: 99 })).toBe(false);
    });

    it('evaluates bucket < percentage threshold', () => {
      // Buckets range from 0 to 99 by default.
      
      // Assume getHashBucket('userA', 'salt-1') === 42
      // 42 < 50 => true
      // 42 < 30 => false
      
      const bucket = getHashBucket('userA', 'salt-1');
      
      expect(isInRollout('userA', { percentage: bucket + 1, salt: 'salt-1' })).toBe(true);
      expect(isInRollout('userA', { percentage: bucket, salt: 'salt-1' })).toBe(false);
    });
    
    it('supports granular precision with buckets=1000', () => {
      // 0.5% rollout with 1000 buckets means bucket < 5
      expect(isInRollout('user', { percentage: 0.5, buckets: 100, salt: 'a' })).toBe(false); // Can't do < 1 on 100 buckets without decimals 
      
      const hash1000 = getHashBucket('user', 'b', 1000); // Between 0-999
      
      expect(isInRollout('user', { percentage: (hash1000 + 1) / 10, buckets: 1000, salt: 'b' })).toBe(true);
      expect(isInRollout('user', { percentage: hash1000 / 10, buckets: 1000, salt: 'b' })).toBe(false);
    });
  });
});
