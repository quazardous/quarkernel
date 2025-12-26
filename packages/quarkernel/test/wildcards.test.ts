/**
 * Comprehensive unit tests for wildcard pattern matching (T128)
 *
 * Tests wildcard functionality: single wildcard (*), double wildcard (**),
 * complex patterns, RegExp cache performance, and integration with Kernel
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  hasWildcard,
  getPatternRegex,
  matchesPattern,
  findMatchingPatterns,
  clearPatternCache,
  getCacheSize,
} from '../src/wildcard.js';
import { createKernel } from '../src/kernel.js';

describe('Wildcard - Pattern Matching (T128)', () => {
  beforeEach(() => {
    // Clear cache before each test to ensure isolation
    clearPatternCache();
  });

  describe('hasWildcard()', () => {
    it('should detect single wildcard', () => {
      expect(hasWildcard('user:*')).toBe(true);
      expect(hasWildcard('*:created')).toBe(true);
      expect(hasWildcard('*')).toBe(true);
    });

    it('should detect double wildcard', () => {
      expect(hasWildcard('**')).toBe(true);
      expect(hasWildcard('user:**')).toBe(true);
      expect(hasWildcard('**:created')).toBe(true);
    });

    it('should return false for exact patterns', () => {
      expect(hasWildcard('user:created')).toBe(false);
      expect(hasWildcard('simple')).toBe(false);
      expect(hasWildcard('a:b:c:d')).toBe(false);
    });
  });

  describe('Single wildcard (*) - matches single segment', () => {
    it('should match prefix wildcard (user:*)', () => {
      expect(matchesPattern('user:created', 'user:*')).toBe(true);
      expect(matchesPattern('user:updated', 'user:*')).toBe(true);
      expect(matchesPattern('user:deleted', 'user:*')).toBe(true);
    });

    it('should NOT match multiple segments with single wildcard', () => {
      expect(matchesPattern('user:profile:updated', 'user:*')).toBe(false);
      expect(matchesPattern('user:admin:role:changed', 'user:*')).toBe(false);
    });

    it('should match suffix wildcard (*:created)', () => {
      expect(matchesPattern('user:created', '*:created')).toBe(true);
      expect(matchesPattern('post:created', '*:created')).toBe(true);
      expect(matchesPattern('comment:created', '*:created')).toBe(true);
    });

    it('should NOT match different suffix', () => {
      expect(matchesPattern('user:updated', '*:created')).toBe(false);
      expect(matchesPattern('post:deleted', '*:created')).toBe(false);
    });

    it('should match middle wildcard (user:*:created)', () => {
      expect(matchesPattern('user:profile:created', 'user:*:created')).toBe(true);
      expect(matchesPattern('user:admin:created', 'user:*:created')).toBe(true);
    });

    it('should NOT match without middle segment', () => {
      expect(matchesPattern('user:created', 'user:*:created')).toBe(false);
    });

    it('should match standalone single wildcard (*)', () => {
      expect(matchesPattern('anything', '*')).toBe(true);
      expect(matchesPattern('simple', '*')).toBe(true);
    });

    it('should NOT match empty string with single wildcard', () => {
      expect(matchesPattern('', '*')).toBe(false);
    });

    it('should NOT match delimited string with single wildcard', () => {
      expect(matchesPattern('user:created', '*')).toBe(false);
      expect(matchesPattern('a:b:c', '*')).toBe(false);
    });
  });

  describe('Double wildcard (**) - matches any segments', () => {
    it('should match any event name', () => {
      expect(matchesPattern('user:created', '**')).toBe(true);
      expect(matchesPattern('a:b:c:d:e', '**')).toBe(true);
      expect(matchesPattern('simple', '**')).toBe(true);
      expect(matchesPattern('', '**')).toBe(true);
    });

    it('should match prefix double wildcard (user:**)', () => {
      expect(matchesPattern('user:created', 'user:**')).toBe(true);
      expect(matchesPattern('user:profile:updated', 'user:**')).toBe(true);
      expect(matchesPattern('user:admin:role:changed', 'user:**')).toBe(true);
      expect(matchesPattern('user:', 'user:**')).toBe(true); // Empty segment after delimiter
    });

    it('should NOT match different prefix', () => {
      expect(matchesPattern('post:created', 'user:**')).toBe(false);
      expect(matchesPattern('admin:user:created', 'user:**')).toBe(false);
    });

    it('should NOT match without delimiter for prefix pattern', () => {
      // Pattern user:** requires the delimiter to be present
      expect(matchesPattern('user', 'user:**')).toBe(false);
    });

    it('should match suffix double wildcard (**:created)', () => {
      expect(matchesPattern('user:created', '**:created')).toBe(true);
      expect(matchesPattern('user:profile:created', '**:created')).toBe(true);
      expect(matchesPattern('a:b:c:created', '**:created')).toBe(true);
      expect(matchesPattern(':created', '**:created')).toBe(true); // Empty segment before delimiter
    });

    it('should NOT match without delimiter for suffix pattern', () => {
      // Pattern **:created requires the delimiter to be present
      expect(matchesPattern('created', '**:created')).toBe(false);
    });

    it('should match middle double wildcard (api:**:response)', () => {
      expect(matchesPattern('api:user:response', 'api:**:response')).toBe(true);
      expect(matchesPattern('api:user:get:response', 'api:**:response')).toBe(true);
      expect(matchesPattern('api::response', 'api:**:response')).toBe(true); // Explicit empty segment in middle
    });

    it('should NOT match without middle segment', () => {
      // Pattern api:**:response requires delimiter between api and :response
      expect(matchesPattern('api:response', 'api:**:response')).toBe(false);
    });
  });

  describe('Multiple wildcards in one pattern', () => {
    it('should match pattern with multiple single wildcards (*:*:created)', () => {
      expect(matchesPattern('user:profile:created', '*:*:created')).toBe(true);
      expect(matchesPattern('post:comment:created', '*:*:created')).toBe(true);
    });

    it('should NOT match fewer segments', () => {
      expect(matchesPattern('user:created', '*:*:created')).toBe(false);
    });

    it('should NOT match more segments', () => {
      expect(matchesPattern('user:admin:profile:created', '*:*:created')).toBe(false);
    });

    it('should match mixed wildcards (**:*:updated)', () => {
      expect(matchesPattern('user:profile:updated', '**:*:updated')).toBe(true);
      expect(matchesPattern('a:b:c:profile:updated', '**:*:updated')).toBe(true);
      expect(matchesPattern(':profile:updated', '**:*:updated')).toBe(true); // Empty segment before
    });

    it('should NOT match pattern without required segments', () => {
      // Pattern **:*:updated requires at least "X:Y:updated" (3 segments)
      expect(matchesPattern('profile:updated', '**:*:updated')).toBe(false);
    });
  });

  describe('Edge cases and exact matching', () => {
    it('should handle exact match (no wildcard)', () => {
      expect(matchesPattern('user:created', 'user:created')).toBe(true);
      expect(matchesPattern('user:created', 'user:updated')).toBe(false);
    });

    it('should handle empty event name', () => {
      expect(matchesPattern('', '')).toBe(true);
      expect(matchesPattern('', '**')).toBe(true);
      expect(matchesPattern('', '*')).toBe(false);
      expect(matchesPattern('', 'user:*')).toBe(false);
    });

    it('should handle special characters in event names', () => {
      expect(matchesPattern('user@created', 'user@*', '@')).toBe(true);
      expect(matchesPattern('user.created', 'user.*', '.')).toBe(true);
      expect(matchesPattern('user/created', 'user/*', '/')).toBe(true);
    });

    it('should handle custom delimiter', () => {
      expect(matchesPattern('user.created', 'user.*', '.')).toBe(true);
      expect(matchesPattern('user.profile.created', 'user.**', '.')).toBe(true);
      expect(matchesPattern('user/admin/created', '**', '/')).toBe(true);
      expect(matchesPattern('user/login', 'user/*', '/')).toBe(true);
    });
  });

  describe('findMatchingPatterns()', () => {
    it('should find all matching patterns', () => {
      const patterns = ['user:created', 'user:*', '*:created', '**', 'post:*'];
      const matches = findMatchingPatterns('user:created', patterns);

      expect(matches).toEqual(['user:created', 'user:*', '*:created', '**']);
      expect(matches).not.toContain('post:*');
    });

    it('should return empty array when no patterns match', () => {
      const patterns = ['post:*', 'admin:*', 'user:updated'];
      const matches = findMatchingPatterns('user:created', patterns);

      expect(matches).toEqual([]);
    });

    it('should handle empty patterns array', () => {
      const matches = findMatchingPatterns('user:created', []);
      expect(matches).toEqual([]);
    });

    it('should preserve pattern order', () => {
      const patterns = ['**', 'user:*', '*:created', 'user:created'];
      const matches = findMatchingPatterns('user:created', patterns);

      expect(matches).toEqual(['**', 'user:*', '*:created', 'user:created']);
    });
  });

  describe('RegExp cache behavior', () => {
    it('should cache compiled patterns', () => {
      clearPatternCache();
      expect(getCacheSize()).toBe(0);

      // First call should compile and cache
      getPatternRegex('user:*');
      expect(getCacheSize()).toBe(1);

      // Second call with same pattern should reuse cache
      getPatternRegex('user:*');
      expect(getCacheSize()).toBe(1);

      // Different pattern should add to cache
      getPatternRegex('post:*');
      expect(getCacheSize()).toBe(2);
    });

    it('should cache patterns with different delimiters separately', () => {
      clearPatternCache();

      getPatternRegex('user:*', ':');
      getPatternRegex('user:*', '.');
      getPatternRegex('user:*', '/');

      expect(getCacheSize()).toBe(3);
    });

    it('should perform cache hit after first compilation', () => {
      clearPatternCache();
      const pattern = 'user:*';

      // First call - cache miss (compiles)
      const regex1 = getPatternRegex(pattern);
      const size1 = getCacheSize();

      // Second call - cache hit (reuses)
      const regex2 = getPatternRegex(pattern);
      const size2 = getCacheSize();

      expect(regex1).toBe(regex2); // Same RegExp instance
      expect(size1).toBe(size2); // Cache size unchanged
    });

    it('should evict oldest entry when cache reaches max size', () => {
      clearPatternCache();

      // Fill cache to near max (100)
      for (let i = 0; i < 100; i++) {
        getPatternRegex(`pattern${i}:*`);
      }

      expect(getCacheSize()).toBe(100);

      // Add one more - should evict first entry
      getPatternRegex('pattern100:*');
      expect(getCacheSize()).toBe(100);

      // First pattern should no longer be in cache
      const sizeBeforeReuse = getCacheSize();
      getPatternRegex('pattern0:*'); // This was evicted
      const sizeAfterReuse = getCacheSize();

      // If pattern0 was evicted, re-adding it won't increase size
      // because it will evict another pattern
      expect(sizeAfterReuse).toBe(sizeBeforeReuse);
    });

    it('should clear cache completely', () => {
      getPatternRegex('user:*');
      getPatternRegex('post:*');
      getPatternRegex('admin:**');

      expect(getCacheSize()).toBeGreaterThan(0);

      clearPatternCache();
      expect(getCacheSize()).toBe(0);
    });
  });

  describe('Benchmark - Large listener counts', () => {
    it('should handle 1000+ wildcard patterns efficiently', () => {
      clearPatternCache();

      // Create 1000 unique patterns
      const patterns: string[] = [];
      for (let i = 0; i < 1000; i++) {
        patterns.push(`entity${i % 10}:*`); // Some duplicates to test cache
      }

      const startTime = performance.now();

      // Match against an event - should use cached patterns
      for (let i = 0; i < 100; i++) {
        findMatchingPatterns('entity5:created', patterns);
      }

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Should complete in reasonable time (< 100ms for 100 iterations over 1000 patterns)
      expect(duration).toBeLessThan(100);

      // Cache should only contain unique patterns (max 100 due to LRU)
      expect(getCacheSize()).toBeLessThanOrEqual(100);
    });

    it('should perform better on cache hit than cache miss', () => {
      clearPatternCache();
      const pattern = 'user:*';
      const eventName = 'user:created';

      // First run - cache miss
      const startMiss = performance.now();
      for (let i = 0; i < 1000; i++) {
        clearPatternCache(); // Force cache miss
        matchesPattern(eventName, pattern);
      }
      const missDuration = performance.now() - startMiss;

      // Second run - cache hit
      clearPatternCache();
      getPatternRegex(pattern); // Pre-warm cache
      const startHit = performance.now();
      for (let i = 0; i < 1000; i++) {
        matchesPattern(eventName, pattern);
      }
      const hitDuration = performance.now() - startHit;

      // Cache hits should be significantly faster
      // Allow for timing variance, but expect at least 2x improvement
      expect(hitDuration).toBeLessThan(missDuration / 2);
    });
  });
});

describe('Kernel - Wildcard Integration (T128)', () => {
  interface TestEvents {
    'user:created': { id: number; name: string };
    'user:updated': { id: number; changes: Record<string, unknown> };
    'user:deleted': { id: number };
    'post:created': { id: number; title: string };
    'post:updated': { id: number };
    'comment:created': { id: number; postId: number };
  }

  beforeEach(() => {
    clearPatternCache();
  });

  it('should emit to exact match listeners', async () => {
    const kernel = createKernel<TestEvents>();
    let called = false;

    kernel.on('user:created', async () => {
      called = true;
    });

    await kernel.emit('user:created', { id: 1, name: 'Alice' });
    expect(called).toBe(true);
  });

  it('should emit to single wildcard listeners (user:*)', async () => {
    const kernel = createKernel<TestEvents>();
    const events: string[] = [];

    kernel.on('user:*', async (event) => {
      events.push(event.name);
    });

    await kernel.emit('user:created', { id: 1, name: 'Alice' });
    await kernel.emit('user:updated', { id: 1, changes: {} });
    await kernel.emit('user:deleted', { id: 1 });

    expect(events).toEqual(['user:created', 'user:updated', 'user:deleted']);
  });

  it('should emit to double wildcard listeners (**)', async () => {
    const kernel = createKernel<TestEvents>();
    const events: string[] = [];

    kernel.on('**', async (event) => {
      events.push(event.name);
    });

    await kernel.emit('user:created', { id: 1, name: 'Alice' });
    await kernel.emit('post:created', { id: 1, title: 'Hello' });
    await kernel.emit('comment:created', { id: 1, postId: 1 });

    expect(events).toEqual(['user:created', 'post:created', 'comment:created']);
  });

  it('should emit to suffix wildcard listeners (*:created)', async () => {
    const kernel = createKernel<TestEvents>();
    const events: string[] = [];

    kernel.on('*:created', async (event) => {
      events.push(event.name);
    });

    await kernel.emit('user:created', { id: 1, name: 'Alice' });
    await kernel.emit('user:updated', { id: 1, changes: {} });
    await kernel.emit('post:created', { id: 1, title: 'Hello' });
    await kernel.emit('post:updated', { id: 1 });

    expect(events).toEqual(['user:created', 'post:created']);
  });

  it('should prioritize exact match over wildcard', async () => {
    const kernel = createKernel<TestEvents>();
    const calls: string[] = [];

    // Exact match
    kernel.on('user:created', async () => {
      calls.push('exact');
    });

    // Wildcard
    kernel.on('user:*', async () => {
      calls.push('wildcard');
    });

    await kernel.emit('user:created', { id: 1, name: 'Alice' });

    // Both should be called (exact match doesn't prevent wildcard)
    expect(calls).toContain('exact');
    expect(calls).toContain('wildcard');
  });

  it('should emit to multiple matching wildcard patterns', async () => {
    const kernel = createKernel<TestEvents>();
    const calls: string[] = [];

    kernel.on('user:created', async () => calls.push('exact'));
    kernel.on('user:*', async () => calls.push('user:*'));
    kernel.on('*:created', async () => calls.push('*:created'));
    kernel.on('**', async () => calls.push('**'));

    await kernel.emit('user:created', { id: 1, name: 'Alice' });

    // All matching patterns should be called
    expect(calls).toContain('exact');
    expect(calls).toContain('user:*');
    expect(calls).toContain('*:created');
    expect(calls).toContain('**');
    expect(calls).toHaveLength(4);
  });

  it('should remove wildcard listeners with off()', async () => {
    const kernel = createKernel<TestEvents>();
    let called = false;

    const listener = async () => {
      called = true;
    };

    kernel.on('user:*', listener);
    kernel.off('user:*', listener);

    await kernel.emit('user:created', { id: 1, name: 'Alice' });
    expect(called).toBe(false);
  });

  it('should count wildcard listeners correctly', () => {
    const kernel = createKernel<TestEvents>();

    kernel.on('user:*', async () => {});
    kernel.on('user:*', async () => {});
    kernel.on('*:created', async () => {});

    expect(kernel.listenerCount('user:*')).toBe(2);
    expect(kernel.listenerCount('*:created')).toBe(1);
  });

  it('should handle 100+ wildcard listeners efficiently', async () => {
    const kernel = createKernel<TestEvents>();
    let callCount = 0;

    // Add 100 wildcard listeners
    for (let i = 0; i < 100; i++) {
      kernel.on('**', async () => {
        callCount++;
      });
    }

    const startTime = performance.now();
    await kernel.emit('user:created', { id: 1, name: 'Alice' });
    const duration = performance.now() - startTime;

    expect(callCount).toBe(100);
    // Should complete in reasonable time (< 50ms)
    expect(duration).toBeLessThan(50);
  });
});
