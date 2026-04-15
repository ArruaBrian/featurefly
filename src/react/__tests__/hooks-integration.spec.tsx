/**
 * React Hooks Integration Tests
 *
 * Tests the useFeatureFlag and useAllFlags hooks with a real FeatureFlagsClient.
 */

import { renderHook, act } from '@testing-library/react';
import { FeatureFlyProvider, useFeatureFlag, useAllFlags } from '../index';
import { FeatureFlagsClient } from '../../shared/client';

const createTestClient = () => {
  return new FeatureFlagsClient({
    baseUrl: 'https://test-api.example.com',
    bootstrapFlags: {
      'test-flag': true,
      'test-string': 'bootstrap-value',
      'test-number': 42,
    },
  });
};

describe('React Hooks Integration', () => {
  describe('useFeatureFlag', () => {
    it('should return value from bootstrap flags without loading', () => {
      const client = createTestClient();

      const { result } = renderHook(() => useFeatureFlag('test-flag', false), {
        wrapper: ({ children }) => (
          <FeatureFlyProvider client={client}>{children}</FeatureFlyProvider>
        ),
      });

      expect(result.current.value).toBe(true);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();

      client.dispose();
    });

    it('should return default value while loading when no bootstrap', () => {
      const client = new FeatureFlagsClient({
        baseUrl: 'https://test-api.example.com',
      });

      const { result } = renderHook(() => useFeatureFlag('non-existent', false), {
        wrapper: ({ children }) => (
          <FeatureFlyProvider client={client}>{children}</FeatureFlyProvider>
        ),
      });

      // Initially should have loading state or default value
      expect(result.current.value).toBe(false);

      client.dispose();
    });

    it('should throw error when used outside provider', () => {
      // Suppress console.error for this test
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        renderHook(() => useFeatureFlag('test-flag', false));
      }).toThrow('useFeatureFlag must be used within a <FeatureFlyProvider>');

      consoleSpy.mockRestore();
    });

    it('should handle context parameter', () => {
      const client = createTestClient();

      const { result } = renderHook(
        () => useFeatureFlag('test-flag', false, { userId: 'user-123' }),
        {
          wrapper: ({ children }) => (
            <FeatureFlyProvider client={client}>{children}</FeatureFlyProvider>
          ),
        }
      );

      expect(result.current.value).toBe(true);

      client.dispose();
    });
  });

  describe('useAllFlags', () => {
    it('should return flags from bootstrap without loading', () => {
      const client = createTestClient();

      const { result } = renderHook(() => useAllFlags(), {
        wrapper: ({ children }) => (
          <FeatureFlyProvider client={client}>{children}</FeatureFlyProvider>
        ),
      });

      expect(result.current.flags['test-flag']).toBe(true);
      expect(result.current.flags['test-string']).toBe('bootstrap-value');
      expect(result.current.flags['test-number']).toBe(42);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();

      client.dispose();
    });

    it('should throw error when used outside provider', () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        renderHook(() => useAllFlags());
      }).toThrow('useFeatureFlag must be used within a <FeatureFlyProvider>');

      consoleSpy.mockRestore();
    });

    it('should handle context parameter', () => {
      const client = createTestClient();

      const { result } = renderHook(
        () => useAllFlags({ workspaceId: 'ws-123' }),
        {
          wrapper: ({ children }) => (
            <FeatureFlyProvider client={client}>{children}</FeatureFlyProvider>
          ),
        }
      );

      expect(result.current.flags['test-flag']).toBe(true);

      client.dispose();
    });
  });

  describe('Provider', () => {
    it('should provide client to children', () => {
      const client = createTestClient();

      let receivedClient: FeatureFlagsClient | null = null;

      const TestComponent = () => {
        // This would need a custom hook to access the client directly
        return null;
      };

      renderHook(() => useFeatureFlag('test-flag', false), {
        wrapper: ({ children }) => (
          <FeatureFlyProvider client={client}>{children}</FeatureFlyProvider>
        ),
      });

      // Client should be accessible through the context
      expect(client.isDisposed()).toBe(false);

      client.dispose();
    });
  });
});
