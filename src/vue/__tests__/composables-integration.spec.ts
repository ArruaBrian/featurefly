/**
 * Vue Composables Integration Tests
 *
 * Tests the useFeatureFlag and useAllFlags composables with a real FeatureFlagsClient.
 * Uses Vitest + @testing-library/vue for Vue 3 testing.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ref } from 'vue';
import { renderHook, cleanup } from '@testing-library/vue';
import { FeatureFlyPlugin, useFeatureFlag, useAllFlags } from '../index';
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

describe('Vue Composables Integration', () => {
  let client: FeatureFlagsClient;

  beforeEach(() => {
    client = createTestClient();
  });

  afterEach(() => {
    client.dispose();
  });

  describe('useFeatureFlag', () => {
    it('should return reactive ref with bootstrap value', async () => {
      const { result } = renderHook(() => useFeatureFlag('test-flag', false), {
        global: {
          plugins: [
            [FeatureFlyPlugin, { client }],
          ],
        },
      });

      expect(result.value.value).toBe(true);

      await cleanup();
    });

    it('should return default value when flag not in bootstrap', async () => {
      const { result } = renderHook(() => useFeatureFlag('non-existent', false), {
        global: {
          plugins: [
            [FeatureFlyPlugin, { client }],
          ],
        },
      });

      // Initially should be the default value
      expect(result.value.value).toBe(false);

      await cleanup();
    });

    it('should throw error when plugin not installed', () => {
      expect(() => {
        renderHook(() => useFeatureFlag('test-flag', false));
      }).toThrow();
    });

    it('should handle context', async () => {
      const context = ref({ userId: 'user-123' });

      const { result } = renderHook(
        () => useFeatureFlag('test-flag', false, context),
        {
          global: {
            plugins: [
              [FeatureFlyPlugin, { client }],
            ],
          },
        }
      );

      expect(result.value.value).toBe(true);

      await cleanup();
    });
  });

  describe('useAllFlags', () => {
    it('should return reactive ref with all bootstrap flags', async () => {
      const { result } = renderHook(() => useAllFlags(), {
        global: {
          plugins: [
            [FeatureFlyPlugin, { client }],
          ],
        },
      });

      expect(result.value.value['test-flag']).toBe(true);
      expect(result.value.value['test-string']).toBe('bootstrap-value');
      expect(result.value.value['test-number']).toBe(42);

      await cleanup();
    });

    it('should throw error when plugin not installed', () => {
      expect(() => {
        renderHook(() => useAllFlags());
      }).toThrow();
    });
  });
});
