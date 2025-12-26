/**
 * Tests for Kernel wildcard integration (T122)
 *
 * Tests wildcard event matching in the kernel with on() and emit().
 */

import { describe, it, expect, vi } from 'vitest';
import { createKernel } from './kernel.js';

interface TestEvents {
  'user:login': { userId: string };
  'user:logout': { userId: string };
  'user:profile:view': { userId: string; profileId: string };
  'post:create': { postId: string };
  'post:delete': { postId: string };
}

describe('Kernel - Wildcard integration (T122)', () => {
  describe('Single segment wildcard (*)', () => {
    it('should match prefix patterns', async () => {
      const kernel = createKernel<TestEvents>();
      const calls: string[] = [];

      kernel.on('user:*' as any, async (event) => {
        calls.push(event.name);
      });

      await kernel.emit('user:login', { userId: '123' });
      await kernel.emit('user:logout', { userId: '123' });
      await kernel.emit('post:create', { postId: '456' });

      expect(calls).toEqual(['user:login', 'user:logout']);
    });

    it('should match suffix patterns', async () => {
      const kernel = createKernel<TestEvents>();
      const calls: string[] = [];

      kernel.on('*:create' as any, async (event) => {
        calls.push(event.name);
      });

      await kernel.emit('post:create', { postId: '456' });
      await kernel.emit('post:delete', { postId: '456' });

      expect(calls).toEqual(['post:create']);
    });

    it('should match middle segment patterns', async () => {
      const kernel = createKernel<TestEvents>();
      const calls: string[] = [];

      kernel.on('user:*:view' as any, async (event) => {
        calls.push(event.name);
      });

      await kernel.emit('user:profile:view', { userId: '123', profileId: '789' });

      expect(calls).toEqual(['user:profile:view']);
    });
  });

  describe('Multi-segment wildcard (**)', () => {
    it('should match all events with **', async () => {
      const kernel = createKernel<TestEvents>();
      const calls: string[] = [];

      kernel.on('**' as any, async (event) => {
        calls.push(event.name);
      });

      await kernel.emit('user:login', { userId: '123' });
      await kernel.emit('post:create', { postId: '456' });

      expect(calls).toEqual(['user:login', 'post:create']);
    });

    it('should match paths with ** at end', async () => {
      const kernel = createKernel<TestEvents>();
      const calls: string[] = [];

      kernel.on('user:**' as any, async (event) => {
        calls.push(event.name);
      });

      await kernel.emit('user:login', { userId: '123' });
      await kernel.emit('user:profile:view', { userId: '123', profileId: '789' });
      await kernel.emit('post:create', { postId: '456' });

      expect(calls).toEqual(['user:login', 'user:profile:view']);
    });

    it('should match paths with ** at start', async () => {
      const kernel = createKernel<TestEvents>();
      const calls: string[] = [];

      kernel.on('**:view' as any, async (event) => {
        calls.push(event.name);
      });

      await kernel.emit('user:profile:view', { userId: '123', profileId: '789' });
      await kernel.emit('user:login', { userId: '123' });

      expect(calls).toEqual(['user:profile:view']);
    });
  });

  describe('Multiple patterns', () => {
    it('should trigger all matching patterns', async () => {
      const kernel = createKernel<TestEvents>();
      const calls: string[] = [];

      // Register multiple patterns
      kernel.on('user:*' as any, async () => { calls.push('user:*'); });
      kernel.on('user:login', async () => { calls.push('user:login'); });
      kernel.on('**' as any, async () => { calls.push('**'); });

      await kernel.emit('user:login', { userId: '123' });

      expect(calls).toContain('user:*');
      expect(calls).toContain('user:login');
      expect(calls).toContain('**');
      expect(calls).toHaveLength(3);
    });

    it('should not trigger non-matching patterns', async () => {
      const kernel = createKernel<TestEvents>();
      const userCalls: string[] = [];
      const postCalls: string[] = [];

      kernel.on('user:*' as any, async () => { userCalls.push('user'); });
      kernel.on('post:*' as any, async () => { postCalls.push('post'); });

      await kernel.emit('user:login', { userId: '123' });

      expect(userCalls).toHaveLength(1);
      expect(postCalls).toHaveLength(0);
    });
  });

  describe('Wildcard with priority', () => {
    it('should respect priority with wildcard patterns', async () => {
      const kernel = createKernel<TestEvents>();
      const order: number[] = [];

      kernel.on('user:*' as any, async () => { order.push(1); }, { priority: 10 });
      kernel.on('user:login', async () => { order.push(2); }, { priority: 50 });
      kernel.on('**' as any, async () => { order.push(3); }, { priority: 30 });

      await kernel.emit('user:login', { userId: '123' });

      // Should execute in order: 50, 30, 10
      expect(order).toEqual([2, 3, 1]);
    });
  });

  describe('Wildcard with once', () => {
    it('should remove wildcard listeners after once', async () => {
      const kernel = createKernel<TestEvents>();
      const calls: string[] = [];

      kernel.on('user:*' as any, async (event) => {
        calls.push(event.name);
      }, { once: true });

      await kernel.emit('user:login', { userId: '123' });
      await kernel.emit('user:logout', { userId: '123' });

      expect(calls).toEqual(['user:login']);
    });
  });

  describe('Wildcard with context', () => {
    it('should pass event data to wildcard listeners', async () => {
      const kernel = createKernel<TestEvents>();
      let receivedUserId: string | undefined;

      kernel.on('user:*' as any, async (event) => {
        receivedUserId = (event.data as any).userId;
      });

      await kernel.emit('user:login', { userId: '123' });

      expect(receivedUserId).toBe('123');
    });
  });

  describe('Wildcard disabled', () => {
    it('should not match wildcards when disabled', async () => {
      const kernel = createKernel<TestEvents>({ wildcard: false });
      const calls: string[] = [];

      kernel.on('user:*' as any, async () => { calls.push('wildcard'); });

      await kernel.emit('user:login', { userId: '123' });

      expect(calls).toHaveLength(0);
    });

    it('should still match exact patterns when wildcard disabled', async () => {
      const kernel = createKernel<TestEvents>({ wildcard: false });
      const calls: string[] = [];

      kernel.on('user:login', async () => { calls.push('exact'); });

      await kernel.emit('user:login', { userId: '123' });

      expect(calls).toEqual(['exact']);
    });
  });

  describe('Wildcard with off()', () => {
    it('should remove wildcard listeners with off()', () => {
      const kernel = createKernel<TestEvents>();
      const listener = vi.fn();

      kernel.on('user:*' as any, listener);
      expect(kernel.listenerCount('user:*' as any)).toBe(1);

      kernel.off('user:*' as any, listener);
      expect(kernel.listenerCount('user:*' as any)).toBe(0);
    });

    it('should return unbind function for wildcard listeners', async () => {
      const kernel = createKernel<TestEvents>();
      const calls: string[] = [];

      const off = kernel.on('user:*' as any, async () => { calls.push('called'); });

      await kernel.emit('user:login', { userId: '123' });
      expect(calls).toHaveLength(1);

      off();

      await kernel.emit('user:logout', { userId: '123' });
      expect(calls).toHaveLength(1);
    });
  });

  describe('Custom delimiter', () => {
    it('should respect custom delimiter with wildcards', async () => {
      const kernel = createKernel<TestEvents>({ delimiter: '.' });
      const calls: string[] = [];

      kernel.on('user.*' as any, async (event) => {
        calls.push(event.name);
      });

      await kernel.emit('user.login' as any, { userId: '123' } as any);
      await kernel.emit('user.logout' as any, { userId: '123' } as any);

      expect(calls).toEqual(['user.login', 'user.logout']);
    });
  });

  describe('Performance', () => {
    it('should handle many wildcard patterns efficiently', async () => {
      const kernel = createKernel<TestEvents>();
      let callCount = 0;

      // Register 100 wildcard patterns
      for (let i = 0; i < 100; i++) {
        kernel.on(`pattern${i}:*` as any, async () => { callCount++; });
      }
      kernel.on('user:*' as any, async () => { callCount++; });

      const start = performance.now();
      await kernel.emit('user:login', { userId: '123' });
      const duration = performance.now() - start;

      expect(callCount).toBe(1); // Only user:* should match
      expect(duration).toBeLessThan(100); // Should be fast
    });
  });
});
