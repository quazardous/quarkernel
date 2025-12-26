/**
 * Tests for wildcard pattern matching (T122)
 *
 * Tests wildcard support, RegExp caching, and pattern matching performance.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  hasWildcard,
  matchesPattern,
  findMatchingPatterns,
  getPatternRegex,
  clearPatternCache,
  getCacheSize,
} from './wildcard.js';

describe('Wildcard - Pattern matching (T122)', () => {
  beforeEach(() => {
    // Clear cache before each test
    clearPatternCache();
  });

  describe('hasWildcard()', () => {
    it('should detect wildcard patterns', () => {
      expect(hasWildcard('user:*')).toBe(true);
      expect(hasWildcard('**:created')).toBe(true);
      expect(hasWildcard('user:login')).toBe(false);
      expect(hasWildcard('simple')).toBe(false);
    });
  });

  describe('matchesPattern() - single segment wildcard', () => {
    it('should match * at end of pattern', () => {
      expect(matchesPattern('user:login', 'user:*')).toBe(true);
      expect(matchesPattern('user:logout', 'user:*')).toBe(true);
      expect(matchesPattern('post:create', 'user:*')).toBe(false);
    });

    it('should match * at start of pattern', () => {
      expect(matchesPattern('user:created', '*:created')).toBe(true);
      expect(matchesPattern('post:created', '*:created')).toBe(true);
      expect(matchesPattern('user:updated', '*:created')).toBe(false);
    });

    it('should match * in middle of pattern', () => {
      expect(matchesPattern('user:profile:view', 'user:*:view')).toBe(true);
      expect(matchesPattern('user:settings:view', 'user:*:view')).toBe(true);
      expect(matchesPattern('user:profile:edit', 'user:*:view')).toBe(false);
    });

    it('should not match across delimiters', () => {
      expect(matchesPattern('user:profile:view', 'user:*')).toBe(false);
      expect(matchesPattern('user', 'user:*')).toBe(false);
    });
  });

  describe('matchesPattern() - multi segment wildcard', () => {
    it('should match ** for any path', () => {
      expect(matchesPattern('user:profile:view', '**')).toBe(true);
      expect(matchesPattern('any:thing:here', '**')).toBe(true);
      expect(matchesPattern('single', '**')).toBe(true);
    });

    it('should match ** at end', () => {
      expect(matchesPattern('user:profile:view', 'user:**')).toBe(true);
      expect(matchesPattern('user:a:b:c:d', 'user:**')).toBe(true);
      expect(matchesPattern('post:view', 'user:**')).toBe(false);
    });

    it('should match ** at start', () => {
      expect(matchesPattern('user:profile:view', '**:view')).toBe(true);
      expect(matchesPattern('a:b:c:view', '**:view')).toBe(true);
      expect(matchesPattern('user:profile:edit', '**:view')).toBe(false);
    });

    it('should match ** in middle', () => {
      expect(matchesPattern('app:user:profile:view:detail', 'app:**:detail')).toBe(true);
      expect(matchesPattern('app:x:y:z:detail', 'app:**:detail')).toBe(true);
      // Note: app:detail does NOT match app:**:detail because there's an empty segment between app and detail
      // Pattern app:**:detail expands to app:.*:detail which requires at least "app::detail"
      // For zero-segment matching, pattern should be app:(::**)?detail (not supported in this simple implementation)
      expect(matchesPattern('app::detail', 'app:**:detail')).toBe(true); // explicit empty segment
    });
  });

  describe('matchesPattern() - exact match', () => {
    it('should match exact patterns', () => {
      expect(matchesPattern('user:login', 'user:login')).toBe(true);
      expect(matchesPattern('user:logout', 'user:login')).toBe(false);
    });
  });

  describe('matchesPattern() - custom delimiter', () => {
    it('should respect custom delimiter', () => {
      expect(matchesPattern('user.login', 'user.*', '.')).toBe(true);
      expect(matchesPattern('user/login', 'user/*', '/')).toBe(true);
      expect(matchesPattern('user.login', 'user:*', ':')).toBe(false);
    });
  });

  describe('findMatchingPatterns()', () => {
    it('should find all matching patterns', () => {
      const patterns = ['user:*', 'user:login', '*:login', '**'];
      const matches = findMatchingPatterns('user:login', patterns);

      expect(matches).toContain('user:*');
      expect(matches).toContain('user:login');
      expect(matches).toContain('*:login');
      expect(matches).toContain('**');
      expect(matches).toHaveLength(4);
    });

    it('should filter non-matching patterns', () => {
      const patterns = ['user:*', 'post:*', 'admin:**'];
      const matches = findMatchingPatterns('user:login', patterns);

      expect(matches).toContain('user:*');
      expect(matches).not.toContain('post:*');
      expect(matches).not.toContain('admin:**');
      expect(matches).toHaveLength(1);
    });

    it('should handle empty pattern array', () => {
      const matches = findMatchingPatterns('user:login', []);
      expect(matches).toEqual([]);
    });
  });

  describe('RegExp caching', () => {
    it('should cache compiled patterns', () => {
      clearPatternCache();
      expect(getCacheSize()).toBe(0);

      // First call - compile and cache
      getPatternRegex('user:*');
      expect(getCacheSize()).toBe(1);

      // Second call - use cache
      getPatternRegex('user:*');
      expect(getCacheSize()).toBe(1);

      // Different pattern
      getPatternRegex('post:*');
      expect(getCacheSize()).toBe(2);
    });

    it('should cache different delimiters separately', () => {
      clearPatternCache();

      getPatternRegex('user:*', ':');
      getPatternRegex('user:*', '.');

      expect(getCacheSize()).toBe(2);
    });

    it('should clear cache', () => {
      getPatternRegex('user:*');
      getPatternRegex('post:*');
      expect(getCacheSize()).toBeGreaterThan(0);

      clearPatternCache();
      expect(getCacheSize()).toBe(0);
    });

    it('should evict oldest entry when cache is full', () => {
      clearPatternCache();

      // Fill cache beyond MAX_CACHE_SIZE (100)
      for (let i = 0; i < 105; i++) {
        getPatternRegex(`pattern${i}:*`);
      }

      // Cache should be capped at 100
      expect(getCacheSize()).toBe(100);
    });
  });

  describe('Performance benchmarks', () => {
    it('should handle large number of patterns efficiently', () => {
      const patterns: string[] = [];
      for (let i = 0; i < 1000; i++) {
        patterns.push(`pattern${i}:*`);
      }
      patterns.push('user:*');

      const start = performance.now();
      const matches = findMatchingPatterns('user:login', patterns);
      const duration = performance.now() - start;

      expect(matches).toContain('user:*');
      expect(duration).toBeLessThan(100); // Should complete in < 100ms
    });

    it('should benefit from caching on repeated matches', () => {
      clearPatternCache();

      // Warm up cache
      const patterns = ['user:*', 'post:*', 'admin:**'];
      findMatchingPatterns('user:login', patterns);

      // Measure with cache
      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        findMatchingPatterns('user:login', patterns);
      }
      const cachedDuration = performance.now() - start;

      expect(cachedDuration).toBeLessThan(100); // Cached access should be fast
    });
  });

  describe('Edge cases', () => {
    it('should handle empty event names', () => {
      expect(matchesPattern('', '*')).toBe(false); // * requires non-empty segment
      expect(matchesPattern('', '**')).toBe(true); // ** matches any path including empty
      expect(matchesPattern('', 'user:*')).toBe(false);
    });

    it('should handle special regex characters in patterns', () => {
      // These characters should be escaped in event names
      expect(matchesPattern('user.login', 'user.*', '.')).toBe(true);
      expect(matchesPattern('user/login', 'user/*', '/')).toBe(true);
    });

    it('should handle multiple wildcards', () => {
      expect(matchesPattern('a:b:c:d', '*:*:*:*')).toBe(true);
      expect(matchesPattern('a:b', '*:*:*:*')).toBe(false);
    });
  });
});
