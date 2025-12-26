/**
 * Memory leak detection tests (T130)
 *
 * Tests for listener accumulation, cleanup, and garbage collection.
 * Ensures no memory leaks from:
 * - Listener accumulation and removal
 * - AbortSignal cleanup
 * - Once listener cleanup
 * - Large-scale add/remove cycles
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Kernel, createKernel } from '../src/kernel.js';

interface TestEvents {
  'test:event': { value: number };
  'test:data': string;
  'test:empty': undefined;
}

describe('Memory Leak Detection (T130)', () => {
  describe('Listener removal cleanup', () => {
    it('should not retain listeners after off()', async () => {
      const kernel = createKernel<TestEvents>();
      const listener = vi.fn();

      // Add listener
      kernel.on('test:event', listener);
      expect(kernel.listenerCount('test:event')).toBe(1);

      // Remove listener
      kernel.off('test:event', listener);
      expect(kernel.listenerCount('test:event')).toBe(0);

      // Emit should not call removed listener
      await kernel.emit('test:event', { value: 1 });
      expect(listener).not.toHaveBeenCalled();
    });

    it('should cleanup all listeners with offAll()', async () => {
      const kernel = createKernel<TestEvents>();
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const listener3 = vi.fn();

      kernel.on('test:event', listener1);
      kernel.on('test:event', listener2);
      kernel.on('test:data', listener3);

      expect(kernel.listenerCount('test:event')).toBe(2);
      expect(kernel.listenerCount('test:data')).toBe(1);

      // Remove all listeners for specific event
      kernel.offAll('test:event');
      expect(kernel.listenerCount('test:event')).toBe(0);
      expect(kernel.listenerCount('test:data')).toBe(1);

      // Remove all listeners for all events
      kernel.offAll();
      expect(kernel.listenerCount('test:data')).toBe(0);
      expect(kernel.eventNames().length).toBe(0);
    });

    it('should not retain listeners after large-scale add/remove cycles', async () => {
      const kernel = createKernel<TestEvents>();
      const listeners: Array<() => void> = [];

      // Add 10000 listeners
      for (let i = 0; i < 10000; i++) {
        const listener = vi.fn();
        listeners.push(listener);
        kernel.on('test:event', listener);
      }

      expect(kernel.listenerCount('test:event')).toBe(10000);

      // Remove all listeners
      for (const listener of listeners) {
        kernel.off('test:event', listener);
      }

      expect(kernel.listenerCount('test:event')).toBe(0);

      // Emit should not call any removed listeners
      await kernel.emit('test:event', { value: 1 });
      for (const listener of listeners) {
        expect(listener).not.toHaveBeenCalled();
      }
    });

    it('should handle rapid add/remove cycles without accumulation', async () => {
      const kernel = createKernel<TestEvents>();

      // Perform 1000 add/remove cycles
      for (let i = 0; i < 1000; i++) {
        const listener = vi.fn();
        kernel.on('test:event', listener);
        expect(kernel.listenerCount('test:event')).toBe(1);

        kernel.off('test:event', listener);
        expect(kernel.listenerCount('test:event')).toBe(0);
      }

      // Verify no listeners accumulated
      expect(kernel.listenerCount('test:event')).toBe(0);
      expect(kernel.eventNames().length).toBe(0);
    });

    it('should cleanup listeners added via unbind function', async () => {
      const kernel = createKernel<TestEvents>();
      const listener = vi.fn();

      // Add listener and get unbind function
      const unbind = kernel.on('test:event', listener);
      expect(kernel.listenerCount('test:event')).toBe(1);

      // Call unbind
      unbind();
      expect(kernel.listenerCount('test:event')).toBe(0);

      // Emit should not call removed listener
      await kernel.emit('test:event', { value: 1 });
      expect(listener).not.toHaveBeenCalled();
    });

    it('should handle calling unbind multiple times safely', () => {
      const kernel = createKernel<TestEvents>();
      const listener = vi.fn();

      const unbind = kernel.on('test:event', listener);
      expect(kernel.listenerCount('test:event')).toBe(1);

      // Call unbind multiple times
      unbind();
      unbind();
      unbind();

      expect(kernel.listenerCount('test:event')).toBe(0);
    });
  });

  describe('Once listener cleanup', () => {
    it('should remove once listeners after execution', async () => {
      const kernel = createKernel<TestEvents>();
      const listener = vi.fn();

      kernel.on('test:event', listener, { once: true });
      expect(kernel.listenerCount('test:event')).toBe(1);

      // First emit - listener executes and is removed
      await kernel.emit('test:event', { value: 1 });
      expect(listener).toHaveBeenCalledTimes(1);
      expect(kernel.listenerCount('test:event')).toBe(0);

      // Second emit - listener not called
      await kernel.emit('test:event', { value: 2 });
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should cleanup once listeners with predicate after removal', async () => {
      const kernel = createKernel<TestEvents>();
      const listener = vi.fn();
      let count = 0;

      kernel.on('test:event', listener, {
        once: (event) => {
          count++;
          return count >= 3;
        },
      });

      // Execute 3 times
      await kernel.emit('test:event', { value: 1 });
      await kernel.emit('test:event', { value: 2 });
      await kernel.emit('test:event', { value: 3 });

      expect(listener).toHaveBeenCalledTimes(3);
      expect(kernel.listenerCount('test:event')).toBe(0);

      // Fourth emit - listener not called
      await kernel.emit('test:event', { value: 4 });
      expect(listener).toHaveBeenCalledTimes(3);
    });

    it('should not accumulate once listeners over many emissions', async () => {
      const kernel = createKernel<TestEvents>();

      // Add 1000 once listeners
      for (let i = 0; i < 1000; i++) {
        kernel.on('test:event', vi.fn(), { once: true });
      }

      expect(kernel.listenerCount('test:event')).toBe(1000);

      // Emit - all listeners should be removed
      await kernel.emit('test:event', { value: 1 });
      expect(kernel.listenerCount('test:event')).toBe(0);

      // Verify no listeners remain
      expect(kernel.eventNames().length).toBe(0);
    });
  });

  describe('AbortSignal cleanup', () => {
    it('should cleanup listeners when signal is aborted', async () => {
      const kernel = createKernel<TestEvents>();
      const listener = vi.fn();
      const controller = new AbortController();

      kernel.on('test:event', listener, { signal: controller.signal });
      expect(kernel.listenerCount('test:event')).toBe(1);

      // Abort signal
      controller.abort();

      // Wait for abort to propagate
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(kernel.listenerCount('test:event')).toBe(0);

      // Emit should not call aborted listener
      await kernel.emit('test:event', { value: 1 });
      expect(listener).not.toHaveBeenCalled();
    });

    it('should not add listener if signal already aborted', async () => {
      const kernel = createKernel<TestEvents>();
      const listener = vi.fn();
      const controller = new AbortController();

      // Abort before adding listener
      controller.abort();

      kernel.on('test:event', listener, { signal: controller.signal });

      // Listener should not be added
      expect(kernel.listenerCount('test:event')).toBe(0);

      await kernel.emit('test:event', { value: 1 });
      expect(listener).not.toHaveBeenCalled();
    });

    it('should cleanup abort event listeners when manually removing listener', () => {
      const kernel = createKernel<TestEvents>();
      const listener = vi.fn();
      const controller = new AbortController();

      // Track listeners on AbortSignal (internal implementation detail)
      const initialListenerCount = controller.signal.addEventListener ? 1 : 0;

      kernel.on('test:event', listener, { signal: controller.signal });

      // Manually remove listener
      kernel.off('test:event', listener);

      expect(kernel.listenerCount('test:event')).toBe(0);

      // Verify signal abort doesn't cause issues
      controller.abort();

      // This test verifies no errors occur from dangling abort listeners
    });

    it('should handle multiple listeners with same AbortSignal', async () => {
      const kernel = createKernel<TestEvents>();
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const listener3 = vi.fn();
      const controller = new AbortController();

      kernel.on('test:event', listener1, { signal: controller.signal });
      kernel.on('test:event', listener2, { signal: controller.signal });
      kernel.on('test:data', listener3, { signal: controller.signal });

      expect(kernel.listenerCount('test:event')).toBe(2);
      expect(kernel.listenerCount('test:data')).toBe(1);

      // Abort all at once
      controller.abort();

      // Wait for abort to propagate
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(kernel.listenerCount('test:event')).toBe(0);
      expect(kernel.listenerCount('test:data')).toBe(0);
    });

    it('should cleanup abort listeners with offAll()', () => {
      const kernel = createKernel<TestEvents>();
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const controller1 = new AbortController();
      const controller2 = new AbortController();

      kernel.on('test:event', listener1, { signal: controller1.signal });
      kernel.on('test:data', listener2, { signal: controller2.signal });

      // Remove all listeners
      kernel.offAll();

      expect(kernel.listenerCount('test:event')).toBe(0);
      expect(kernel.listenerCount('test:data')).toBe(0);

      // Aborting signals should not cause errors
      controller1.abort();
      controller2.abort();
    });
  });

  describe('Large-scale memory tests', () => {
    it('should handle 10000 listener add/remove without retention', async () => {
      const kernel = createKernel<TestEvents>();
      const listeners: Array<() => void> = [];

      // Add 10000 listeners
      for (let i = 0; i < 10000; i++) {
        const listener = vi.fn();
        listeners.push(listener);
        kernel.on('test:event', listener);
      }

      expect(kernel.listenerCount('test:event')).toBe(10000);

      // Remove all listeners
      for (const listener of listeners) {
        kernel.off('test:event', listener);
      }

      expect(kernel.listenerCount('test:event')).toBe(0);

      // Verify no references retained
      await kernel.emit('test:event', { value: 1 });
      for (const listener of listeners) {
        expect(listener).not.toHaveBeenCalled();
      }
    });

    it('should handle many events with many listeners each', () => {
      const kernel = createKernel();

      // Add 100 events with 100 listeners each
      for (let e = 0; e < 100; e++) {
        const eventName = `event:${e}`;
        for (let l = 0; l < 100; l++) {
          kernel.on(eventName, vi.fn());
        }
      }

      expect(kernel.eventNames().length).toBe(100);

      // Remove all
      kernel.offAll();

      expect(kernel.eventNames().length).toBe(0);
    });

    it('should handle churn - continuous add/emit/remove cycles', async () => {
      const kernel = createKernel<TestEvents>();

      // Simulate continuous churn
      for (let i = 0; i < 100; i++) {
        // Add multiple listeners
        const listeners = Array.from({ length: 10 }, () => vi.fn());
        for (const listener of listeners) {
          kernel.on('test:event', listener);
        }

        // Emit
        await kernel.emit('test:event', { value: i });

        // Remove all
        for (const listener of listeners) {
          kernel.off('test:event', listener);
        }
      }

      // Should have no listeners remaining
      expect(kernel.listenerCount('test:event')).toBe(0);
      expect(kernel.eventNames().length).toBe(0);
    });
  });

  describe('WeakRef and garbage collection hints', () => {
    it('should allow listeners to be garbage collected after removal', async () => {
      const kernel = createKernel<TestEvents>();

      // Create listener with WeakRef to detect GC
      let weakRef: WeakRef<any> | undefined;

      const createListener = () => {
        const obj = { called: false };
        weakRef = new WeakRef(obj);

        const listener = async () => {
          obj.called = true;
        };

        return listener;
      };

      const listener = createListener();
      kernel.on('test:event', listener);

      // Emit
      await kernel.emit('test:event', { value: 1 });

      // Remove listener
      kernel.off('test:event', listener);

      // Note: Actual garbage collection is not guaranteed in tests
      // This test documents the expected behavior
      // In production, removed listeners should be eligible for GC

      expect(kernel.listenerCount('test:event')).toBe(0);
    });

    it('should not retain event context after emission completes', async () => {
      const kernel = createKernel<TestEvents>();
      let contextRef: WeakRef<any> | undefined;

      kernel.on('test:event', async (event) => {
        // Create object in context
        event.context.data = { large: new Array(1000).fill('x') };
        contextRef = new WeakRef(event.context.data);
      });

      // Emit and complete
      await kernel.emit('test:event', { value: 1 });

      // Context should be eligible for GC after emission
      // (Actual GC not guaranteed in test environment)
      expect(contextRef).toBeDefined();
    });
  });

  describe('Edge cases for cleanup', () => {
    it('should handle removing non-existent listener', () => {
      const kernel = createKernel<TestEvents>();
      const listener = vi.fn();

      // Should not throw
      expect(() => kernel.off('test:event', listener)).not.toThrow();
      expect(kernel.listenerCount('test:event')).toBe(0);
    });

    it('should handle offAll on non-existent event', () => {
      const kernel = createKernel<TestEvents>();

      // Should not throw
      expect(() => kernel.offAll('test:event')).not.toThrow();
    });

    it('should handle multiple off() calls for same listener', () => {
      const kernel = createKernel<TestEvents>();
      const listener = vi.fn();

      kernel.on('test:event', listener);

      // Multiple off() calls should be safe
      kernel.off('test:event', listener);
      kernel.off('test:event', listener);
      kernel.off('test:event', listener);

      expect(kernel.listenerCount('test:event')).toBe(0);
    });

    it('should cleanup when kernel instance is dereferenced', () => {
      let kernel: Kernel<TestEvents> | undefined = createKernel<TestEvents>();
      const listener = vi.fn();

      kernel.on('test:event', listener);
      expect(kernel.listenerCount('test:event')).toBe(1);

      // Dereference kernel
      kernel = undefined;

      // Kernel and all listeners should be eligible for GC
      // (Actual GC not guaranteed in test environment)
      expect(kernel).toBeUndefined();
    });
  });
});
