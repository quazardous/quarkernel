/**
 * Tests for Kernel core methods (T115)
 *
 * Tests basic on(), off(), emit() functionality with Map-based storage
 * and priority-based sorting.
 */

import { describe, it, expect, vi } from 'vitest';
import { Kernel, createKernel } from './kernel.js';
import { KernelEvent } from './kernel-event.js';

interface TestEvents {
  'test:simple': { value: number };
  'test:string': string;
  'test:empty': undefined;
}

describe('Kernel - Basic on/off/emit (T115)', () => {
  describe('createKernel factory', () => {
    it('should create a Kernel instance', () => {
      const kernel = createKernel();
      expect(kernel).toBeInstanceOf(Kernel);
    });

    it('should create a typed Kernel instance', () => {
      const kernel = createKernel<TestEvents>();
      expect(kernel).toBeInstanceOf(Kernel);
    });
  });

  describe('on() - Register listeners', () => {
    it('should register a listener and return unbind function', () => {
      const kernel = createKernel<TestEvents>();
      const listener = vi.fn();

      const off = kernel.on('test:simple', listener);

      expect(typeof off).toBe('function');
      expect(kernel.listenerCount('test:simple')).toBe(1);
    });

    it('should register multiple listeners for same event', () => {
      const kernel = createKernel<TestEvents>();
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      kernel.on('test:simple', listener1);
      kernel.on('test:simple', listener2);

      expect(kernel.listenerCount('test:simple')).toBe(2);
    });

    it('should sort listeners by priority (higher first)', async () => {
      const kernel = createKernel<TestEvents>();
      const order: number[] = [];

      kernel.on('test:simple', async () => {
        order.push(1);
      }, { priority: 10 });

      kernel.on('test:simple', async () => {
        order.push(2);
      }, { priority: 50 });

      kernel.on('test:simple', async () => {
        order.push(3);
      }, { priority: 30 });

      await kernel.emit('test:simple', { value: 1 });

      // Should execute in order: 50, 30, 10
      expect(order).toEqual([2, 3, 1]);
    });

    it('should assign auto-generated ID if not provided', () => {
      const kernel = createKernel<TestEvents>();

      kernel.on('test:simple', vi.fn());
      kernel.on('test:simple', vi.fn());

      expect(kernel.listenerCount('test:simple')).toBe(2);
    });

    it('should accept custom ID', () => {
      const kernel = createKernel<TestEvents>();

      kernel.on('test:simple', vi.fn(), { id: 'custom-id' });

      expect(kernel.listenerCount('test:simple')).toBe(1);
    });
  });

  describe('off() - Remove listeners', () => {
    it('should remove specific listener by reference', () => {
      const kernel = createKernel<TestEvents>();
      const listener = vi.fn();

      kernel.on('test:simple', listener);
      expect(kernel.listenerCount('test:simple')).toBe(1);

      kernel.off('test:simple', listener);
      expect(kernel.listenerCount('test:simple')).toBe(0);
    });

    it('should remove all listeners when no listener specified', () => {
      const kernel = createKernel<TestEvents>();

      kernel.on('test:simple', vi.fn());
      kernel.on('test:simple', vi.fn());
      expect(kernel.listenerCount('test:simple')).toBe(2);

      kernel.off('test:simple');
      expect(kernel.listenerCount('test:simple')).toBe(0);
    });

    it('should not error when removing non-existent listener', () => {
      const kernel = createKernel<TestEvents>();

      expect(() => {
        kernel.off('test:simple', vi.fn());
      }).not.toThrow();
    });

    it('should work via unbind function', () => {
      const kernel = createKernel<TestEvents>();
      const listener = vi.fn();

      const unbind = kernel.on('test:simple', listener);
      expect(kernel.listenerCount('test:simple')).toBe(1);

      unbind();
      expect(kernel.listenerCount('test:simple')).toBe(0);
    });
  });

  describe('emit() - Trigger events', () => {
    it('should call registered listeners with correct event data', async () => {
      const kernel = createKernel<TestEvents>();
      const listener = vi.fn();

      kernel.on('test:simple', listener);
      await kernel.emit('test:simple', { value: 42 });

      expect(listener).toHaveBeenCalledTimes(1);

      const event = listener.mock.calls[0][0];
      expect(event).toBeInstanceOf(KernelEvent);
      expect(event.data).toEqual({ value: 42 });
      expect(event.name).toBe('test:simple');
    });

    it('should pass ListenerContext as second parameter', async () => {
      const kernel = createKernel<TestEvents>();
      const listener = vi.fn();

      kernel.on('test:simple', listener, { id: 'test-listener' });
      await kernel.emit('test:simple', { value: 1 });

      expect(listener).toHaveBeenCalledTimes(1);

      const ctx = listener.mock.calls[0][1];
      expect(ctx).toBeDefined();
      expect(ctx.id).toBe('test-listener');
      expect(typeof ctx.off).toBe('function');
      expect(typeof ctx.emit).toBe('function');
    });

    it('should execute listeners in parallel', async () => {
      const kernel = createKernel<TestEvents>();
      const delays: number[] = [];
      const start = Date.now();

      kernel.on('test:simple', async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        delays.push(Date.now() - start);
      });

      kernel.on('test:simple', async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        delays.push(Date.now() - start);
      });

      await kernel.emit('test:simple', { value: 1 });

      // Both should complete around same time (parallel execution)
      // Use 45ms threshold to account for timing variance on CI
      expect(delays[0]).toBeGreaterThanOrEqual(45);
      expect(delays[1]).toBeGreaterThanOrEqual(45);
      expect(Math.abs(delays[0] - delays[1])).toBeLessThan(30);
    });

    it('should not error when emitting event with no listeners', async () => {
      const kernel = createKernel<TestEvents>();

      await expect(
        kernel.emit('test:simple', { value: 1 })
      ).resolves.toBeUndefined();
    });

    it('should provide shared context object', async () => {
      const kernel = createKernel<TestEvents>();

      kernel.on('test:simple', async (e) => {
        e.context.step1 = 'done';
      });

      kernel.on('test:simple', async (e) => {
        expect(e.context.step1).toBe('done');
        e.context.step2 = 'done';
      });

      await kernel.emit('test:simple', { value: 1 });
    });
  });

  describe('Error handling', () => {
    it('should catch listener errors and continue with other listeners', async () => {
      const kernel = createKernel<TestEvents>();
      const listener1 = vi.fn(async () => {
        throw new Error('Listener 1 error');
      });
      const listener2 = vi.fn();

      kernel.on('test:simple', listener1);
      kernel.on('test:simple', listener2);

      await kernel.emit('test:simple', { value: 1 });

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    it('should call onError handler for listener errors', async () => {
      const onError = vi.fn();
      const kernel = createKernel<TestEvents>({ onError });

      kernel.on('test:simple', async () => {
        throw new Error('Test error');
      });

      await kernel.emit('test:simple', { value: 1 });

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    });

    it('should throw AggregateError when errorBoundary is false and listener fails', async () => {
      const kernel = createKernel<TestEvents>({ errorBoundary: false });

      kernel.on('test:simple', async () => {
        throw new Error('Test error');
      });

      await expect(
        kernel.emit('test:simple', { value: 1 })
      ).rejects.toThrow(AggregateError);
    });

    it('should collect all errors in AggregateError when multiple listeners fail', async () => {
      const kernel = createKernel<TestEvents>({ errorBoundary: false });

      kernel.on('test:simple', async () => {
        throw new Error('Error 1');
      });

      kernel.on('test:simple', async () => {
        throw new Error('Error 2');
      });

      kernel.on('test:simple', async () => {
        throw new Error('Error 3');
      });

      try {
        await kernel.emit('test:simple', { value: 1 });
        expect.fail('Should have thrown AggregateError');
      } catch (error) {
        expect(error).toBeInstanceOf(AggregateError);
        const aggError = error as AggregateError;
        expect(aggError.errors).toHaveLength(3);
        expect(aggError.message).toContain('3 listener(s) failed');
      }
    });

    it('should execute all listeners even when some fail (parallel execution)', async () => {
      const kernel = createKernel<TestEvents>({ errorBoundary: false });
      const successListener = vi.fn();

      kernel.on('test:simple', async () => {
        throw new Error('Failing listener');
      });

      kernel.on('test:simple', successListener);

      try {
        await kernel.emit('test:simple', { value: 1 });
      } catch (error) {
        // Expected to throw
      }

      // Success listener should have been called despite other listener failing
      expect(successListener).toHaveBeenCalledTimes(1);
    });
  });

  describe('once option', () => {
    it('should remove listener after first execution', async () => {
      const kernel = createKernel<TestEvents>();
      const listener = vi.fn();

      kernel.on('test:simple', listener, { once: true });
      expect(kernel.listenerCount('test:simple')).toBe(1);

      await kernel.emit('test:simple', { value: 1 });
      expect(listener).toHaveBeenCalledTimes(1);

      // Listener should be removed
      expect(kernel.listenerCount('test:simple')).toBe(0);

      // Second emit should not call listener
      await kernel.emit('test:simple', { value: 2 });
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should remove listener only when predicate returns true', async () => {
      const kernel = createKernel<TestEvents>();
      const listener = vi.fn();
      const predicate = vi.fn((event: any) => event.data.value >= 3);

      kernel.on('test:simple', listener, { once: predicate });
      expect(kernel.listenerCount('test:simple')).toBe(1);

      // First emit: predicate returns false (value=1), listener not removed
      await kernel.emit('test:simple', { value: 1 });
      expect(listener).toHaveBeenCalledTimes(1);
      expect(predicate).toHaveBeenCalledTimes(1);
      expect(kernel.listenerCount('test:simple')).toBe(1);

      // Second emit: predicate returns false (value=2), listener not removed
      await kernel.emit('test:simple', { value: 2 });
      expect(listener).toHaveBeenCalledTimes(2);
      expect(predicate).toHaveBeenCalledTimes(2);
      expect(kernel.listenerCount('test:simple')).toBe(1);

      // Third emit: predicate returns true (value=3), listener removed
      await kernel.emit('test:simple', { value: 3 });
      expect(listener).toHaveBeenCalledTimes(3);
      expect(predicate).toHaveBeenCalledTimes(3);
      expect(kernel.listenerCount('test:simple')).toBe(0);

      // Fourth emit: listener not called (already removed)
      await kernel.emit('test:simple', { value: 4 });
      expect(listener).toHaveBeenCalledTimes(3);
      expect(predicate).toHaveBeenCalledTimes(3);
    });

    it('should evaluate predicate with correct event data', async () => {
      const kernel = createKernel<TestEvents>();
      const listener = vi.fn();
      const receivedEvents: any[] = [];
      const predicate = (event: any) => {
        receivedEvents.push(event);
        return event.data.value === 2;
      };

      kernel.on('test:simple', listener, { once: predicate });

      await kernel.emit('test:simple', { value: 1 });
      await kernel.emit('test:simple', { value: 2 });

      // Check predicate received correct events
      expect(receivedEvents).toHaveLength(2);
      expect(receivedEvents[0].data).toEqual({ value: 1 });
      expect(receivedEvents[1].data).toEqual({ value: 2 });
      expect(kernel.listenerCount('test:simple')).toBe(0);
    });

    it('should handle multiple listeners with different predicates', async () => {
      const kernel = createKernel<TestEvents>();
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const predicate1 = (event: any) => event.data.value >= 2;
      const predicate2 = (event: any) => event.data.value >= 3;

      kernel.on('test:simple', listener1, { once: predicate1 });
      kernel.on('test:simple', listener2, { once: predicate2 });
      expect(kernel.listenerCount('test:simple')).toBe(2);

      // First emit: both stay
      await kernel.emit('test:simple', { value: 1 });
      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
      expect(kernel.listenerCount('test:simple')).toBe(2);

      // Second emit: listener1 removed, listener2 stays
      await kernel.emit('test:simple', { value: 2 });
      expect(listener1).toHaveBeenCalledTimes(2);
      expect(listener2).toHaveBeenCalledTimes(2);
      expect(kernel.listenerCount('test:simple')).toBe(1);

      // Third emit: listener2 removed
      await kernel.emit('test:simple', { value: 3 });
      expect(listener1).toHaveBeenCalledTimes(2);
      expect(listener2).toHaveBeenCalledTimes(3);
      expect(kernel.listenerCount('test:simple')).toBe(0);
    });

    it('should mix once:true and once:predicate listeners', async () => {
      const kernel = createKernel<TestEvents>();
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const predicate = (event: any) => event.data.value >= 3;

      kernel.on('test:simple', listener1, { once: true });
      kernel.on('test:simple', listener2, { once: predicate });
      expect(kernel.listenerCount('test:simple')).toBe(2);

      // First emit: listener1 removed, listener2 stays
      await kernel.emit('test:simple', { value: 1 });
      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
      expect(kernel.listenerCount('test:simple')).toBe(1);

      // Second emit: only listener2 called
      await kernel.emit('test:simple', { value: 2 });
      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(2);
      expect(kernel.listenerCount('test:simple')).toBe(1);

      // Third emit: listener2 removed
      await kernel.emit('test:simple', { value: 3 });
      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(3);
      expect(kernel.listenerCount('test:simple')).toBe(0);
    });
  });

  describe('AbortSignal support', () => {
    it('should remove listener when signal is aborted', async () => {
      const kernel = createKernel<TestEvents>();
      const controller = new AbortController();
      const listener = vi.fn();

      kernel.on('test:simple', listener, { signal: controller.signal });
      expect(kernel.listenerCount('test:simple')).toBe(1);

      controller.abort();

      // Wait for async cleanup
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(kernel.listenerCount('test:simple')).toBe(0);
    });

    it('should not register listener if signal already aborted', async () => {
      const kernel = createKernel<TestEvents>();
      const controller = new AbortController();
      controller.abort();

      const listener = vi.fn();
      kernel.on('test:simple', listener, { signal: controller.signal });

      // Should register then immediately remove
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(kernel.listenerCount('test:simple')).toBe(0);
    });

    it('should cleanup abort listener when manually removing listener', async () => {
      const kernel = createKernel<TestEvents>();
      const controller = new AbortController();
      const listener = vi.fn();

      // Register listener with abort signal
      kernel.on('test:simple', listener, { signal: controller.signal });
      expect(kernel.listenerCount('test:simple')).toBe(1);

      // Manually remove listener
      kernel.off('test:simple', listener);
      expect(kernel.listenerCount('test:simple')).toBe(0);

      // Abort signal should not cause any issues
      controller.abort();
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Still no listeners (abort was cleaned up)
      expect(kernel.listenerCount('test:simple')).toBe(0);
    });

    it('should cleanup abort listeners when using offAll', async () => {
      const kernel = createKernel<TestEvents>();
      const controller1 = new AbortController();
      const controller2 = new AbortController();

      kernel.on('test:simple', vi.fn(), { signal: controller1.signal });
      kernel.on('test:simple', vi.fn(), { signal: controller2.signal });
      expect(kernel.listenerCount('test:simple')).toBe(2);

      // Remove all listeners
      kernel.offAll('test:simple');
      expect(kernel.listenerCount('test:simple')).toBe(0);

      // Abort signals should not cause any issues
      controller1.abort();
      controller2.abort();
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Still no listeners
      expect(kernel.listenerCount('test:simple')).toBe(0);
    });
  });

  describe('Utility methods', () => {
    it('listenerCount() should return total count when no event specified', () => {
      const kernel = createKernel<TestEvents>();

      kernel.on('test:simple', vi.fn());
      kernel.on('test:simple', vi.fn());
      kernel.on('test:string', vi.fn());

      expect(kernel.listenerCount()).toBe(3);
    });

    it('eventNames() should return all events with listeners', () => {
      const kernel = createKernel<TestEvents>();

      kernel.on('test:simple', vi.fn());
      kernel.on('test:string', vi.fn());

      const names = kernel.eventNames();
      expect(names).toHaveLength(2);
      expect(names).toContain('test:simple');
      expect(names).toContain('test:string');
    });

    it('offAll() should remove all listeners', () => {
      const kernel = createKernel<TestEvents>();

      kernel.on('test:simple', vi.fn());
      kernel.on('test:string', vi.fn());
      expect(kernel.listenerCount()).toBe(2);

      kernel.offAll();
      expect(kernel.listenerCount()).toBe(0);
    });

    it('offAll(event) should remove all listeners for specific event', () => {
      const kernel = createKernel<TestEvents>();

      kernel.on('test:simple', vi.fn());
      kernel.on('test:string', vi.fn());

      kernel.offAll('test:simple');

      expect(kernel.listenerCount('test:simple')).toBe(0);
      expect(kernel.listenerCount('test:string')).toBe(1);
    });
  });

  describe('maxListeners option', () => {
    it('should warn when maxListeners exceeded', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const kernel = createKernel<TestEvents>({ maxListeners: 2 });

      kernel.on('test:simple', vi.fn());
      kernel.on('test:simple', vi.fn());
      kernel.on('test:simple', vi.fn());

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('MaxListenersExceeded')
      );

      warnSpy.mockRestore();
    });
  });

  describe('debug option', () => {
    it('should enable debug mode', () => {
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const kernel = createKernel<TestEvents>();

      kernel.debug(true);

      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('Debug mode enabled')
      );

      debugSpy.mockRestore();
    });
  });
});

describe('Dependency Resolution (T118)', () => {
  describe('Basic dependency ordering', () => {
    it('should execute listeners in dependency order', async () => {
      const kernel = createKernel<TestEvents>();
      const order: string[] = [];

      kernel.on('test:simple', async () => {
        order.push('a');
      }, { id: 'a' });

      kernel.on('test:simple', async () => {
        order.push('b');
      }, { id: 'b', after: ['a'] });

      kernel.on('test:simple', async () => {
        order.push('c');
      }, { id: 'c', after: ['b'] });

      await kernel.emit('test:simple', { value: 1 });

      expect(order).toEqual(['a', 'b', 'c']);
    });

    it('should handle multiple dependencies', async () => {
      const kernel = createKernel<TestEvents>();
      const order: string[] = [];

      kernel.on('test:simple', async () => {
        order.push('a');
      }, { id: 'a' });

      kernel.on('test:simple', async () => {
        order.push('b');
      }, { id: 'b' });

      kernel.on('test:simple', async () => {
        order.push('c');
      }, { id: 'c', after: ['a', 'b'] });

      await kernel.emit('test:simple', { value: 1 });

      // c must come after both a and b
      expect(order.indexOf('c')).toBeGreaterThan(order.indexOf('a'));
      expect(order.indexOf('c')).toBeGreaterThan(order.indexOf('b'));
    });

    it('should execute listeners without dependencies first', async () => {
      const kernel = createKernel<TestEvents>();
      const order: string[] = [];

      kernel.on('test:simple', async () => {
        order.push('dependent');
      }, { id: 'dependent', after: ['independent'] });

      kernel.on('test:simple', async () => {
        order.push('independent');
      }, { id: 'independent' });

      await kernel.emit('test:simple', { value: 1 });

      expect(order).toEqual(['independent', 'dependent']);
    });
  });

  describe('Priority with dependencies', () => {
    it('should respect priority within same dependency level', async () => {
      const kernel = createKernel<TestEvents>();
      const order: string[] = [];

      // All depend on 'first', so they're at the same level
      kernel.on('test:simple', async () => {
        order.push('first');
      }, { id: 'first' });

      kernel.on('test:simple', async () => {
        order.push('low');
      }, { id: 'low', after: ['first'], priority: 10 });

      kernel.on('test:simple', async () => {
        order.push('high');
      }, { id: 'high', after: ['first'], priority: 50 });

      kernel.on('test:simple', async () => {
        order.push('medium');
      }, { id: 'medium', after: ['first'], priority: 30 });

      await kernel.emit('test:simple', { value: 1 });

      // first should be first
      expect(order[0]).toBe('first');
      // Rest should be sorted by priority: high (50), medium (30), low (10)
      expect(order.slice(1)).toEqual(['high', 'medium', 'low']);
    });

    it('should prioritize dependency order over priority', async () => {
      const kernel = createKernel<TestEvents>();
      const order: string[] = [];

      kernel.on('test:simple', async () => {
        order.push('low-priority-first');
      }, { id: 'low-priority-first', priority: 1 });

      kernel.on('test:simple', async () => {
        order.push('high-priority-dependent');
      }, { id: 'high-priority-dependent', priority: 100, after: ['low-priority-first'] });

      await kernel.emit('test:simple', { value: 1 });

      // Dependency order takes precedence over priority
      expect(order).toEqual(['low-priority-first', 'high-priority-dependent']);
    });
  });

  describe('Error handling', () => {
    it('should throw MissingDependencyError for non-existent dependency', async () => {
      const kernel = createKernel<TestEvents>();

      kernel.on('test:simple', vi.fn(), { id: 'listener', after: ['nonexistent'] });

      await expect(
        kernel.emit('test:simple', { value: 1 })
      ).rejects.toThrow('Listener "listener" depends on missing listener "nonexistent"');
    });

    it('should throw CyclicDependencyError for circular dependencies', async () => {
      const kernel = createKernel<TestEvents>();

      kernel.on('test:simple', vi.fn(), { id: 'a', after: ['b'] });
      kernel.on('test:simple', vi.fn(), { id: 'b', after: ['a'] });

      await expect(
        kernel.emit('test:simple', { value: 1 })
      ).rejects.toThrow('Cyclic dependency detected');
    });

    it('should throw CyclicDependencyError for self-reference', async () => {
      const kernel = createKernel<TestEvents>();

      kernel.on('test:simple', vi.fn(), { id: 'self', after: ['self'] });

      await expect(
        kernel.emit('test:simple', { value: 1 })
      ).rejects.toThrow('Cyclic dependency detected');
    });

    it('should throw CyclicDependencyError for indirect circular dependencies', async () => {
      const kernel = createKernel<TestEvents>();

      kernel.on('test:simple', vi.fn(), { id: 'a', after: ['c'] });
      kernel.on('test:simple', vi.fn(), { id: 'b', after: ['a'] });
      kernel.on('test:simple', vi.fn(), { id: 'c', after: ['b'] });

      await expect(
        kernel.emit('test:simple', { value: 1 })
      ).rejects.toThrow('Cyclic dependency detected');
    });
  });

  describe('Complex dependency graphs', () => {
    it('should handle diamond dependency pattern', async () => {
      const kernel = createKernel<TestEvents>();
      const order: string[] = [];

      kernel.on('test:simple', async () => {
        order.push('a');
      }, { id: 'a' });

      kernel.on('test:simple', async () => {
        order.push('b');
      }, { id: 'b', after: ['a'] });

      kernel.on('test:simple', async () => {
        order.push('c');
      }, { id: 'c', after: ['a'] });

      kernel.on('test:simple', async () => {
        order.push('d');
      }, { id: 'd', after: ['b', 'c'] });

      await kernel.emit('test:simple', { value: 1 });

      // a must be first
      expect(order[0]).toBe('a');
      // d must be last
      expect(order[3]).toBe('d');
      // b and c must come after a and before d
      expect(order.indexOf('b')).toBeGreaterThan(order.indexOf('a'));
      expect(order.indexOf('c')).toBeGreaterThan(order.indexOf('a'));
      expect(order.indexOf('d')).toBeGreaterThan(order.indexOf('b'));
      expect(order.indexOf('d')).toBeGreaterThan(order.indexOf('c'));
    });

    it('should handle independent dependency chains', async () => {
      const kernel = createKernel<TestEvents>();
      const order: string[] = [];

      // Chain 1: a1 -> a2
      kernel.on('test:simple', async () => {
        order.push('a1');
      }, { id: 'a1' });

      kernel.on('test:simple', async () => {
        order.push('a2');
      }, { id: 'a2', after: ['a1'] });

      // Chain 2: b1 -> b2
      kernel.on('test:simple', async () => {
        order.push('b1');
      }, { id: 'b1' });

      kernel.on('test:simple', async () => {
        order.push('b2');
      }, { id: 'b2', after: ['b1'] });

      await kernel.emit('test:simple', { value: 1 });

      // Each chain must maintain order
      expect(order.indexOf('a2')).toBeGreaterThan(order.indexOf('a1'));
      expect(order.indexOf('b2')).toBeGreaterThan(order.indexOf('b1'));
      // But the chains are independent - all 4 should execute
      expect(order).toHaveLength(4);
    });

    it('should handle middleware-style pattern', async () => {
      const kernel = createKernel<TestEvents>();
      const order: string[] = [];

      kernel.on('test:simple', async () => {
        order.push('logging');
      }, { id: 'logging' });

      kernel.on('test:simple', async () => {
        order.push('auth');
      }, { id: 'auth', after: ['logging'] });

      kernel.on('test:simple', async () => {
        order.push('validation');
      }, { id: 'validation', after: ['logging'] });

      kernel.on('test:simple', async () => {
        order.push('handler');
      }, { id: 'handler', after: ['auth', 'validation'] });

      await kernel.emit('test:simple', { value: 1 });

      expect(order[0]).toBe('logging');
      expect(order[3]).toBe('handler');
      expect(order.indexOf('auth')).toBeGreaterThan(order.indexOf('logging'));
      expect(order.indexOf('validation')).toBeGreaterThan(order.indexOf('logging'));
      expect(order.indexOf('handler')).toBeGreaterThan(order.indexOf('auth'));
      expect(order.indexOf('handler')).toBeGreaterThan(order.indexOf('validation'));
    });
  });

  describe('No dependencies optimization', () => {
    it('should skip toposort when no dependencies exist', async () => {
      const kernel = createKernel<TestEvents>();
      const order: number[] = [];

      // Listeners without dependencies should execute in priority order
      kernel.on('test:simple', async () => {
        order.push(1);
      }, { id: 'l1', priority: 10 });

      kernel.on('test:simple', async () => {
        order.push(2);
      }, { id: 'l2', priority: 50 });

      kernel.on('test:simple', async () => {
        order.push(3);
      }, { id: 'l3', priority: 30 });

      await kernel.emit('test:simple', { value: 1 });

      // Should execute in priority order (highest first)
      expect(order).toEqual([2, 3, 1]);
    });
  });

  describe('String and array dependency formats', () => {
    it('should accept dependency as string', async () => {
      const kernel = createKernel<TestEvents>();
      const order: string[] = [];

      kernel.on('test:simple', async () => {
        order.push('first');
      }, { id: 'first' });

      kernel.on('test:simple', async () => {
        order.push('second');
      }, { id: 'second', after: 'first' });

      await kernel.emit('test:simple', { value: 1 });

      expect(order).toEqual(['first', 'second']);
    });

    it('should accept dependency as array', async () => {
      const kernel = createKernel<TestEvents>();
      const order: string[] = [];

      kernel.on('test:simple', async () => {
        order.push('a');
      }, { id: 'a' });

      kernel.on('test:simple', async () => {
        order.push('b');
      }, { id: 'b' });

      kernel.on('test:simple', async () => {
        order.push('c');
      }, { id: 'c', after: ['a', 'b'] });

      await kernel.emit('test:simple', { value: 1 });

      expect(order.indexOf('c')).toBeGreaterThan(order.indexOf('a'));
      expect(order.indexOf('c')).toBeGreaterThan(order.indexOf('b'));
    });
  });
});
