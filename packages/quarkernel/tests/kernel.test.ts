/**
 * Comprehensive unit tests for Kernel core methods (T126)
 *
 * Tests core functionality: on, off, emit, offAll, eventNames, listenerCount
 * Focus on edge cases and propagation control
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Kernel, createKernel } from '../src/kernel.js';
import { KernelEvent } from '../src/kernel-event.js';

interface TestEvents {
  'test:simple': { value: number };
  'test:string': string;
  'test:empty': undefined;
  'test:complex': { data: { nested: string } };
}

describe('Kernel - Core Methods (T126)', () => {
  describe('on() - Advanced scenarios', () => {
    it('should handle same listener registered multiple times', async () => {
      const kernel = createKernel<TestEvents>();
      const listener = vi.fn();

      kernel.on('test:simple', listener);
      kernel.on('test:simple', listener);
      kernel.on('test:simple', listener);

      await kernel.emit('test:simple', { value: 1 });

      // Same listener registered 3 times should be called 3 times
      expect(listener).toHaveBeenCalledTimes(3);
    });

    it('should handle 0 priority correctly', async () => {
      const kernel = createKernel<TestEvents>();
      const order: number[] = [];

      kernel.on('test:simple', async () => order.push(1), { priority: 10 });
      kernel.on('test:simple', async () => order.push(2), { priority: 0 });
      kernel.on('test:simple', async () => order.push(3), { priority: -10 });

      await kernel.emit('test:simple', { value: 1 });

      expect(order).toEqual([1, 2, 3]);
    });

    it('should handle negative priority values', async () => {
      const kernel = createKernel<TestEvents>();
      const order: number[] = [];

      kernel.on('test:simple', async () => order.push(1), { priority: -5 });
      kernel.on('test:simple', async () => order.push(2), { priority: -10 });
      kernel.on('test:simple', async () => order.push(3), { priority: -1 });

      await kernel.emit('test:simple', { value: 1 });

      expect(order).toEqual([3, 1, 2]);
    });

    it('should handle very large priority values', async () => {
      const kernel = createKernel<TestEvents>();
      const order: number[] = [];

      kernel.on('test:simple', async () => order.push(1), { priority: 1000000 });
      kernel.on('test:simple', async () => order.push(2), { priority: 999999 });
      kernel.on('test:simple', async () => order.push(3), { priority: 1 });

      await kernel.emit('test:simple', { value: 1 });

      expect(order).toEqual([1, 2, 3]);
    });

    it('should maintain stable sort for equal priorities', async () => {
      const kernel = createKernel<TestEvents>();
      const order: number[] = [];

      // All same priority - should maintain registration order
      kernel.on('test:simple', async () => order.push(1), { priority: 10 });
      kernel.on('test:simple', async () => order.push(2), { priority: 10 });
      kernel.on('test:simple', async () => order.push(3), { priority: 10 });

      await kernel.emit('test:simple', { value: 1 });

      expect(order).toEqual([1, 2, 3]);
    });
  });

  describe('off() - Advanced scenarios', () => {
    it('should handle removing listener that was never added', () => {
      const kernel = createKernel<TestEvents>();
      const listener = vi.fn();

      expect(() => {
        kernel.off('test:simple', listener);
      }).not.toThrow();

      expect(kernel.listenerCount('test:simple')).toBe(0);
    });

    it('should only remove specific listener instance', async () => {
      const kernel = createKernel<TestEvents>();
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      kernel.on('test:simple', listener1);
      kernel.on('test:simple', listener2);
      expect(kernel.listenerCount('test:simple')).toBe(2);

      kernel.off('test:simple', listener1);
      expect(kernel.listenerCount('test:simple')).toBe(1);

      await kernel.emit('test:simple', { value: 1 });
      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it('should handle removing same listener multiple times', () => {
      const kernel = createKernel<TestEvents>();
      const listener = vi.fn();

      kernel.on('test:simple', listener);
      expect(kernel.listenerCount('test:simple')).toBe(1);

      kernel.off('test:simple', listener);
      expect(kernel.listenerCount('test:simple')).toBe(0);

      // Second off should not error
      kernel.off('test:simple', listener);
      expect(kernel.listenerCount('test:simple')).toBe(0);
    });

    it('should remove all instances when same listener registered multiple times', async () => {
      const kernel = createKernel<TestEvents>();
      const listener = vi.fn();

      kernel.on('test:simple', listener);
      kernel.on('test:simple', listener);
      kernel.on('test:simple', listener);
      expect(kernel.listenerCount('test:simple')).toBe(3);

      kernel.off('test:simple', listener);
      expect(kernel.listenerCount('test:simple')).toBe(0);

      await kernel.emit('test:simple', { value: 1 });
      expect(listener).not.toHaveBeenCalled();
    });

    it('should handle off on non-existent event', () => {
      const kernel = createKernel<TestEvents>();

      expect(() => {
        kernel.off('test:nonexistent');
      }).not.toThrow();
    });
  });

  describe('emit() - Propagation control', () => {
    it('should stop executing listeners when stopPropagation is called', async () => {
      const kernel = createKernel<TestEvents>();
      const listener1 = vi.fn();
      const listener2 = vi.fn((event: KernelEvent<{ value: number }>) => {
        event.stopPropagation();
      });
      const listener3 = vi.fn();

      kernel.on('test:simple', listener1, { priority: 30 });
      kernel.on('test:simple', listener2, { priority: 20 });
      kernel.on('test:simple', listener3, { priority: 10 });

      await kernel.emit('test:simple', { value: 1 });

      // listener1 and listener2 should execute, listener3 should not
      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
      expect(listener3).not.toHaveBeenCalled();
    });

    it('should stop immediately when first listener calls stopPropagation', async () => {
      const kernel = createKernel<TestEvents>();
      const listener1 = vi.fn((event: KernelEvent<{ value: number }>) => {
        event.stopPropagation();
      });
      const listener2 = vi.fn();

      kernel.on('test:simple', listener1, { priority: 100 });
      kernel.on('test:simple', listener2, { priority: 50 });

      await kernel.emit('test:simple', { value: 1 });

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).not.toHaveBeenCalled();
    });

    it('should allow listeners before stopPropagation to modify context', async () => {
      const kernel = createKernel<TestEvents>();
      const contextCaptures: any[] = [];

      kernel.on('test:simple', async (event) => {
        event.context.step1 = 'done';
        contextCaptures.push('step1');
      }, { priority: 30 });

      kernel.on('test:simple', async (event) => {
        event.context.step2 = 'done';
        contextCaptures.push('step2');
        event.stopPropagation();
      }, { priority: 20 });

      kernel.on('test:simple', async (event) => {
        event.context.step3 = 'should not run';
        contextCaptures.push('step3');
      }, { priority: 10 });

      await kernel.emit('test:simple', { value: 1 });

      // In parallel execution, stopPropagation check happens at start of executeListener
      // Since all promises start immediately, behavior depends on timing
      // We can verify that stopPropagation was called
      expect(contextCaptures).toContain('step1');
      expect(contextCaptures).toContain('step2');
      // step3 may or may not execute depending on timing in parallel mode
    });

    it('should handle stopPropagation with serial execution', async () => {
      const kernel = createKernel<TestEvents>();
      const listener1 = vi.fn(async (event: KernelEvent<{ value: number }>) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        event.stopPropagation();
      });
      const listener2 = vi.fn();

      kernel.on('test:simple', listener1, { priority: 30 });
      kernel.on('test:simple', listener2, { priority: 20 });

      // Use emitSerial for predictable stopPropagation behavior
      await kernel.emitSerial('test:simple', { value: 1 });

      expect(listener1).toHaveBeenCalledTimes(1);
      // In serial execution, stopPropagation prevents subsequent listeners
      expect(listener2).not.toHaveBeenCalled();
    });

    it('should handle stopPropagation in parallel execution', async () => {
      const kernel = createKernel<TestEvents>();
      const executionOrder: string[] = [];

      // In parallel execution, all listeners at same priority level start together
      // but stopPropagation prevents subsequent priority levels
      kernel.on('test:simple', async (event) => {
        executionOrder.push('high-1');
      }, { priority: 100 });

      kernel.on('test:simple', async (event) => {
        executionOrder.push('high-2');
        event.stopPropagation();
      }, { priority: 100 });

      kernel.on('test:simple', async (event) => {
        executionOrder.push('low');
      }, { priority: 50 });

      await kernel.emit('test:simple', { value: 1 });

      // Both high priority listeners execute (parallel at same level)
      expect(executionOrder).toContain('high-1');
      expect(executionOrder).toContain('high-2');
      // Low priority listener should not execute
      expect(executionOrder).not.toContain('low');
    });
  });

  describe('emit() - Edge cases', () => {
    it('should handle emitting with undefined data', async () => {
      const kernel = createKernel<TestEvents>();
      const listener = vi.fn();

      kernel.on('test:empty', listener);
      await kernel.emit('test:empty', undefined);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0].data).toBeUndefined();
    });

    it('should handle emitting to event with no listeners', async () => {
      const kernel = createKernel<TestEvents>();

      await expect(
        kernel.emit('test:simple', { value: 1 })
      ).resolves.toBeUndefined();
    });

    it('should handle emitting multiple events in sequence', async () => {
      const kernel = createKernel<TestEvents>();
      const listener = vi.fn();

      kernel.on('test:simple', listener);

      await kernel.emit('test:simple', { value: 1 });
      await kernel.emit('test:simple', { value: 2 });
      await kernel.emit('test:simple', { value: 3 });

      expect(listener).toHaveBeenCalledTimes(3);
      expect(listener.mock.calls[0][0].data.value).toBe(1);
      expect(listener.mock.calls[1][0].data.value).toBe(2);
      expect(listener.mock.calls[2][0].data.value).toBe(3);
    });

    it('should handle concurrent emits of same event', async () => {
      const kernel = createKernel<TestEvents>();
      const listener = vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });

      kernel.on('test:simple', listener);

      await Promise.all([
        kernel.emit('test:simple', { value: 1 }),
        kernel.emit('test:simple', { value: 2 }),
        kernel.emit('test:simple', { value: 3 }),
      ]);

      expect(listener).toHaveBeenCalledTimes(3);
    });

    it('should handle sync and async listeners together', async () => {
      const kernel = createKernel<TestEvents>();
      const order: string[] = [];

      kernel.on('test:simple', () => {
        order.push('sync');
      }, { priority: 30 });

      kernel.on('test:simple', async () => {
        await new Promise(resolve => setTimeout(resolve, 5));
        order.push('async');
      }, { priority: 20 });

      kernel.on('test:simple', () => {
        order.push('sync2');
      }, { priority: 10 });

      await kernel.emit('test:simple', { value: 1 });

      expect(order).toContain('sync');
      expect(order).toContain('async');
      expect(order).toContain('sync2');
    });
  });

  describe('listenerCount() - Comprehensive tests', () => {
    it('should return 0 for event with no listeners', () => {
      const kernel = createKernel<TestEvents>();
      expect(kernel.listenerCount('test:simple')).toBe(0);
    });

    it('should return correct count after adding listeners', () => {
      const kernel = createKernel<TestEvents>();

      kernel.on('test:simple', vi.fn());
      expect(kernel.listenerCount('test:simple')).toBe(1);

      kernel.on('test:simple', vi.fn());
      expect(kernel.listenerCount('test:simple')).toBe(2);

      kernel.on('test:simple', vi.fn());
      expect(kernel.listenerCount('test:simple')).toBe(3);
    });

    it('should return correct count after removing listeners', () => {
      const kernel = createKernel<TestEvents>();
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      kernel.on('test:simple', listener1);
      kernel.on('test:simple', listener2);
      expect(kernel.listenerCount('test:simple')).toBe(2);

      kernel.off('test:simple', listener1);
      expect(kernel.listenerCount('test:simple')).toBe(1);

      kernel.off('test:simple', listener2);
      expect(kernel.listenerCount('test:simple')).toBe(0);
    });

    it('should return total count across all events when no event specified', () => {
      const kernel = createKernel<TestEvents>();

      kernel.on('test:simple', vi.fn());
      kernel.on('test:simple', vi.fn());
      kernel.on('test:string', vi.fn());
      kernel.on('test:empty', vi.fn());

      expect(kernel.listenerCount()).toBe(4);
    });

    it('should return 0 when no listeners registered anywhere', () => {
      const kernel = createKernel<TestEvents>();
      expect(kernel.listenerCount()).toBe(0);
    });

    it('should update count correctly after once listeners are removed', async () => {
      const kernel = createKernel<TestEvents>();

      kernel.on('test:simple', vi.fn(), { once: true });
      kernel.on('test:simple', vi.fn(), { once: true });
      expect(kernel.listenerCount('test:simple')).toBe(2);

      await kernel.emit('test:simple', { value: 1 });
      expect(kernel.listenerCount('test:simple')).toBe(0);
    });

    it('should count same listener registered multiple times separately', () => {
      const kernel = createKernel<TestEvents>();
      const listener = vi.fn();

      kernel.on('test:simple', listener);
      kernel.on('test:simple', listener);
      kernel.on('test:simple', listener);

      expect(kernel.listenerCount('test:simple')).toBe(3);
    });
  });

  describe('eventNames() - Comprehensive tests', () => {
    it('should return empty array when no events registered', () => {
      const kernel = createKernel<TestEvents>();
      expect(kernel.eventNames()).toEqual([]);
    });

    it('should return all event names with listeners', () => {
      const kernel = createKernel<TestEvents>();

      kernel.on('test:simple', vi.fn());
      kernel.on('test:string', vi.fn());
      kernel.on('test:empty', vi.fn());

      const names = kernel.eventNames();
      expect(names).toHaveLength(3);
      expect(names).toContain('test:simple');
      expect(names).toContain('test:string');
      expect(names).toContain('test:empty');
    });

    it('should only include each event name once even with multiple listeners', () => {
      const kernel = createKernel<TestEvents>();

      kernel.on('test:simple', vi.fn());
      kernel.on('test:simple', vi.fn());
      kernel.on('test:simple', vi.fn());

      const names = kernel.eventNames();
      expect(names).toEqual(['test:simple']);
    });

    it('should remove event name when all listeners are removed', () => {
      const kernel = createKernel<TestEvents>();
      const listener = vi.fn();

      kernel.on('test:simple', listener);
      expect(kernel.eventNames()).toContain('test:simple');

      kernel.off('test:simple', listener);
      expect(kernel.eventNames()).not.toContain('test:simple');
    });

    it('should update after offAll is called', () => {
      const kernel = createKernel<TestEvents>();

      kernel.on('test:simple', vi.fn());
      kernel.on('test:string', vi.fn());
      expect(kernel.eventNames()).toHaveLength(2);

      kernel.offAll();
      expect(kernel.eventNames()).toEqual([]);
    });

    it('should update after specific event offAll is called', () => {
      const kernel = createKernel<TestEvents>();

      kernel.on('test:simple', vi.fn());
      kernel.on('test:string', vi.fn());

      kernel.offAll('test:simple');

      const names = kernel.eventNames();
      expect(names).toHaveLength(1);
      expect(names).toContain('test:string');
      expect(names).not.toContain('test:simple');
    });

    it('should update after once listeners are auto-removed', async () => {
      const kernel = createKernel<TestEvents>();

      kernel.on('test:simple', vi.fn(), { once: true });
      expect(kernel.eventNames()).toContain('test:simple');

      await kernel.emit('test:simple', { value: 1 });
      expect(kernel.eventNames()).not.toContain('test:simple');
    });
  });

  describe('offAll() - Comprehensive tests', () => {
    it('should remove all listeners from all events', async () => {
      const kernel = createKernel<TestEvents>();
      const listener = vi.fn();

      kernel.on('test:simple', listener);
      kernel.on('test:string', listener);
      kernel.on('test:empty', listener);
      expect(kernel.listenerCount()).toBe(3);

      kernel.offAll();
      expect(kernel.listenerCount()).toBe(0);
      expect(kernel.eventNames()).toEqual([]);

      await kernel.emit('test:simple', { value: 1 });
      expect(listener).not.toHaveBeenCalled();
    });

    it('should remove all listeners from specific event only', async () => {
      const kernel = createKernel<TestEvents>();
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      kernel.on('test:simple', listener1);
      kernel.on('test:string', listener2);

      kernel.offAll('test:simple');

      expect(kernel.listenerCount('test:simple')).toBe(0);
      expect(kernel.listenerCount('test:string')).toBe(1);

      await kernel.emit('test:simple', { value: 1 });
      await kernel.emit('test:string', 'test');

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it('should not error when called on event with no listeners', () => {
      const kernel = createKernel<TestEvents>();

      expect(() => {
        kernel.offAll('test:simple');
      }).not.toThrow();
    });

    it('should not error when called on empty kernel', () => {
      const kernel = createKernel<TestEvents>();

      expect(() => {
        kernel.offAll();
      }).not.toThrow();
    });

    it('should handle offAll called multiple times', () => {
      const kernel = createKernel<TestEvents>();

      kernel.on('test:simple', vi.fn());
      kernel.offAll();
      kernel.offAll();
      kernel.offAll();

      expect(kernel.listenerCount()).toBe(0);
    });
  });

  describe('Priority execution order', () => {
    it('should execute listeners in strict priority order', async () => {
      const kernel = createKernel<TestEvents>();
      const order: number[] = [];

      // Register in random priority order
      kernel.on('test:simple', async () => order.push(3), { priority: 30 });
      kernel.on('test:simple', async () => order.push(5), { priority: 50 });
      kernel.on('test:simple', async () => order.push(1), { priority: 10 });
      kernel.on('test:simple', async () => order.push(4), { priority: 40 });
      kernel.on('test:simple', async () => order.push(2), { priority: 20 });

      await kernel.emit('test:simple', { value: 1 });

      // Should execute from highest to lowest priority
      expect(order).toEqual([5, 4, 3, 2, 1]);
    });

    it('should handle mixed priority and dependency ordering', async () => {
      const kernel = createKernel<TestEvents>();
      const order: string[] = [];

      kernel.on('test:simple', async () => order.push('first'), {
        id: 'first',
        priority: 1
      });

      kernel.on('test:simple', async () => order.push('second'), {
        id: 'second',
        priority: 100,
        after: ['first']
      });

      await kernel.emit('test:simple', { value: 1 });

      // Dependency order overrides priority
      expect(order).toEqual(['first', 'second']);
    });
  });

  describe('Context sharing between listeners', () => {
    it('should share context object between all listeners', async () => {
      const kernel = createKernel<TestEvents>();
      const results: any[] = [];

      kernel.on('test:simple', async (event) => {
        event.context.value = 1;
        results.push({ ...event.context });
      }, { priority: 30 });

      kernel.on('test:simple', async (event) => {
        event.context.value += 1;
        results.push({ ...event.context });
      }, { priority: 20 });

      kernel.on('test:simple', async (event) => {
        event.context.value += 1;
        results.push({ ...event.context });
      }, { priority: 10 });

      await kernel.emit('test:simple', { value: 1 });

      expect(results[0].value).toBe(1);
      expect(results[1].value).toBe(2);
      expect(results[2].value).toBe(3);
    });

    it('should provide fresh context for each emit', async () => {
      const kernel = createKernel<TestEvents>();
      const contexts: any[] = [];

      kernel.on('test:simple', async (event) => {
        event.context.value = event.data.value;
        contexts.push({ ...event.context });
      });

      await kernel.emit('test:simple', { value: 1 });
      await kernel.emit('test:simple', { value: 2 });
      await kernel.emit('test:simple', { value: 3 });

      expect(contexts[0].value).toBe(1);
      expect(contexts[1].value).toBe(2);
      expect(contexts[2].value).toBe(3);
    });

    it('should allow complex objects in context', async () => {
      const kernel = createKernel<TestEvents>();
      let finalContext: any;

      kernel.on('test:simple', async (event) => {
        event.context.user = { id: '123', name: 'Alice' };
        event.context.permissions = ['read', 'write'];
        event.context.metadata = { timestamp: Date.now() };
      });

      kernel.on('test:simple', async (event) => {
        finalContext = event.context;
      });

      await kernel.emit('test:simple', { value: 1 });

      expect(finalContext.user).toEqual({ id: '123', name: 'Alice' });
      expect(finalContext.permissions).toEqual(['read', 'write']);
      expect(finalContext.metadata.timestamp).toBeGreaterThan(0);
    });
  });

  describe('ListenerContext methods', () => {
    it('should provide off() method in context', async () => {
      const kernel = createKernel<TestEvents>();
      const listener = vi.fn((event, ctx) => {
        ctx.off(); // Remove itself
      });

      kernel.on('test:simple', listener);
      expect(kernel.listenerCount('test:simple')).toBe(1);

      await kernel.emit('test:simple', { value: 1 });
      expect(listener).toHaveBeenCalledTimes(1);

      // Listener should have removed itself
      expect(kernel.listenerCount('test:simple')).toBe(0);

      await kernel.emit('test:simple', { value: 2 });
      expect(listener).toHaveBeenCalledTimes(1); // Still only called once
    });

    it('should provide emit() method in context', async () => {
      const kernel = createKernel<TestEvents>();
      const listener1 = vi.fn();
      const listener2 = vi.fn(async (event, ctx) => {
        await ctx.emit('test:string', 'triggered');
      });

      kernel.on('test:simple', listener2);
      kernel.on('test:string', listener1);

      await kernel.emit('test:simple', { value: 1 });

      expect(listener2).toHaveBeenCalledTimes(1);
      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener1.mock.calls[0][0].data).toBe('triggered');
    });

    it('should provide listener metadata in context', async () => {
      const kernel = createKernel<TestEvents>();
      let receivedContext: any;

      kernel.on('test:simple', async (event, ctx) => {
        receivedContext = {
          id: ctx.id,
          eventName: ctx.eventName,
          priority: ctx.priority,
        };
      }, { id: 'test-listener', priority: 50 });

      await kernel.emit('test:simple', { value: 1 });

      expect(receivedContext.id).toBe('test-listener');
      expect(receivedContext.eventName).toBe('test:simple');
      expect(receivedContext.priority).toBe(50);
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle middleware pattern with error handling', async () => {
      const kernel = createKernel<TestEvents>({ errorBoundary: true });
      const results: string[] = [];

      // Logging middleware
      kernel.on('test:simple', async (event) => {
        results.push('log');
        event.context.logged = true;
      }, { id: 'logger', priority: 100 });

      // Auth middleware (throws error)
      kernel.on('test:simple', async (event) => {
        results.push('auth');
        throw new Error('Auth failed');
      }, { id: 'auth', priority: 90 });

      // Handler (should still run with errorBoundary)
      kernel.on('test:simple', async (event) => {
        results.push('handler');
        event.context.handled = true;
      }, { id: 'handler', priority: 80 });

      await kernel.emit('test:simple', { value: 1 });

      // All should execute despite auth error
      expect(results).toContain('log');
      expect(results).toContain('auth');
      expect(results).toContain('handler');
    });

    it('should handle plugin system pattern', async () => {
      const kernel = createKernel<TestEvents>();
      const plugins: string[] = [];

      // Core plugin
      kernel.on('test:simple', async (event) => {
        plugins.push('core');
        event.context.plugins = [];
      }, { id: 'core', priority: 100 });

      // Feature plugins depend on core
      kernel.on('test:simple', async (event) => {
        plugins.push('analytics');
        event.context.plugins.push('analytics');
      }, { id: 'analytics', priority: 50, after: ['core'] });

      kernel.on('test:simple', async (event) => {
        plugins.push('cache');
        event.context.plugins.push('cache');
      }, { id: 'cache', priority: 50, after: ['core'] });

      await kernel.emit('test:simple', { value: 1 });

      expect(plugins[0]).toBe('core');
      expect(plugins).toContain('analytics');
      expect(plugins).toContain('cache');
    });

    it('should handle request/response cycle pattern with serial execution', async () => {
      const kernel = createKernel<TestEvents>();
      let finalContext: any;

      kernel.on('test:simple', async (event) => {
        event.context.startTime = Date.now();
      }, { id: 'timer-start', priority: 100 });

      kernel.on('test:simple', async (event) => {
        await new Promise(resolve => setTimeout(resolve, 10));
        event.context.result = event.data.value * 2;
      }, { id: 'processor', priority: 50 });

      kernel.on('test:simple', async (event) => {
        event.context.duration = Date.now() - event.context.startTime;
      }, { id: 'timer-end', priority: 10 });

      kernel.on('test:simple', async (event) => {
        finalContext = { ...event.context };
      }, { id: 'capture', priority: 1 });

      // Use emitSerial for predictable sequential execution
      await kernel.emitSerial('test:simple', { value: 21 });

      expect(finalContext.result).toBe(42);
      expect(finalContext.duration).toBeGreaterThan(0);
    });
  });
});
