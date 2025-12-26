/**
 * Comprehensive error handling tests for Kernel (T129)
 *
 * Tests error boundaries, error aggregation, debug mode, and AbortSignal cancellation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Kernel, createKernel } from '../src/kernel.js';
import { KernelEvent } from '../src/kernel-event.js';

interface TestEvents {
  'test:simple': { value: number };
  'test:error': { shouldFail: boolean };
  'test:async': { delay: number };
  'test:empty': undefined;
}

describe('Kernel - Error Handling (T129)', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let consoleDebugSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleDebugSpy.mockRestore();
  });

  describe('Error boundaries - Parallel execution', () => {
    it('should prevent one failing listener from stopping others (errorBoundary: true)', async () => {
      const kernel = createKernel<TestEvents>({ errorBoundary: true });
      const listener1 = vi.fn();
      const listener2 = vi.fn(async () => {
        throw new Error('Listener 2 failed');
      });
      const listener3 = vi.fn();

      kernel.on('test:simple', listener1, { priority: 30 });
      kernel.on('test:simple', listener2, { priority: 20 });
      kernel.on('test:simple', listener3, { priority: 10 });

      // Should not throw despite listener2 failing
      await expect(
        kernel.emit('test:simple', { value: 1 })
      ).resolves.toBeUndefined();

      // All listeners should have been called
      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
      expect(listener3).toHaveBeenCalledTimes(1);
    });

    it('should call onError handler for each failing listener', async () => {
      const onError = vi.fn();
      const kernel = createKernel<TestEvents>({
        errorBoundary: true,
        onError,
      });

      const error1 = new Error('Error 1');
      const error2 = new Error('Error 2');

      kernel.on('test:simple', async () => {
        throw error1;
      }, { priority: 30 });

      kernel.on('test:simple', async () => {
        throw error2;
      }, { priority: 20 });

      kernel.on('test:simple', vi.fn(), { priority: 10 });

      await kernel.emit('test:simple', { value: 1 });

      // onError should be called twice with the errors
      expect(onError).toHaveBeenCalledTimes(2);
      expect(onError).toHaveBeenCalledWith(error1, expect.any(KernelEvent));
      expect(onError).toHaveBeenCalledWith(error2, expect.any(KernelEvent));
    });

    it('should collect execution errors when errorBoundary is true', async () => {
      const kernel = createKernel<TestEvents>({ errorBoundary: true });

      const error1 = new Error('First error');
      const error2 = new Error('Second error');

      kernel.on('test:simple', async () => {
        throw error1;
      }, { id: 'listener1' });

      kernel.on('test:simple', async () => {
        throw error2;
      }, { id: 'listener2' });

      await kernel.emit('test:simple', { value: 1 });

      const errors = kernel.getExecutionErrors();
      expect(errors).toHaveLength(2);
      expect(errors[0].listenerId).toBe('listener1');
      expect(errors[0].error).toBe(error1);
      expect(errors[0].eventName).toBe('test:simple');
      expect(errors[1].listenerId).toBe('listener2');
      expect(errors[1].error).toBe(error2);
    });

    it('should allow successful listeners to modify context despite other failures', async () => {
      const kernel = createKernel<TestEvents>({ errorBoundary: true });
      let finalContext: any;

      kernel.on('test:simple', async (event) => {
        event.context.step1 = 'done';
      }, { priority: 40 });

      kernel.on('test:simple', async () => {
        throw new Error('Middle listener failed');
      }, { priority: 30 });

      kernel.on('test:simple', async (event) => {
        event.context.step2 = 'done';
      }, { priority: 20 });

      kernel.on('test:simple', async (event) => {
        finalContext = { ...event.context };
      }, { priority: 10 });

      await kernel.emit('test:simple', { value: 1 });

      expect(finalContext.step1).toBe('done');
      expect(finalContext.step2).toBe('done');
    });

    it('should throw AggregateError when errorBoundary is false', async () => {
      const kernel = createKernel<TestEvents>({ errorBoundary: false });

      const error1 = new Error('Error 1');
      const error2 = new Error('Error 2');

      kernel.on('test:simple', async () => {
        throw error1;
      });

      kernel.on('test:simple', async () => {
        throw error2;
      });

      await expect(
        kernel.emit('test:simple', { value: 1 })
      ).rejects.toThrow(AggregateError);

      try {
        await kernel.emit('test:simple', { value: 1 });
      } catch (err) {
        expect(err).toBeInstanceOf(AggregateError);
        const aggregateError = err as AggregateError;
        expect(aggregateError.errors).toHaveLength(2);
        expect(aggregateError.errors).toContain(error1);
        expect(aggregateError.errors).toContain(error2);
        expect(aggregateError.message).toContain('2 listener(s) failed');
      }
    });

    it('should not call onError when errorBoundary is false', async () => {
      const onError = vi.fn();
      const kernel = createKernel<TestEvents>({
        errorBoundary: false,
        onError,
      });

      kernel.on('test:simple', async () => {
        throw new Error('Test error');
      });

      await expect(
        kernel.emit('test:simple', { value: 1 })
      ).rejects.toThrow();

      // onError should not be called when errorBoundary is false
      expect(onError).not.toHaveBeenCalled();
    });
  });

  describe('Error boundaries - Serial execution', () => {
    it('should prevent cascading failures in serial execution (errorBoundary: true)', async () => {
      const kernel = createKernel<TestEvents>({ errorBoundary: true });
      const order: string[] = [];

      kernel.on('test:simple', async () => {
        order.push('first');
      }, { priority: 30 });

      kernel.on('test:simple', async () => {
        order.push('second-error');
        throw new Error('Second failed');
      }, { priority: 20 });

      kernel.on('test:simple', async () => {
        order.push('third');
      }, { priority: 10 });

      await kernel.emitSerial('test:simple', { value: 1 });

      // All should execute in order despite the error
      expect(order).toEqual(['first', 'second-error', 'third']);
    });

    it('should stop serial execution on first error when errorBoundary is false', async () => {
      const kernel = createKernel<TestEvents>({ errorBoundary: false });
      const order: string[] = [];

      kernel.on('test:simple', async () => {
        order.push('first');
      }, { priority: 30 });

      kernel.on('test:simple', async () => {
        order.push('second-error');
        throw new Error('Second failed');
      }, { priority: 20 });

      kernel.on('test:simple', async () => {
        order.push('third');
      }, { priority: 10 });

      await expect(
        kernel.emitSerial('test:simple', { value: 1 })
      ).rejects.toThrow('Second failed');

      // Only first and second should execute
      expect(order).toEqual(['first', 'second-error']);
    });

    it('should collect all errors in serial mode with errorBoundary true', async () => {
      const kernel = createKernel<TestEvents>({ errorBoundary: true });

      kernel.on('test:simple', async () => {
        throw new Error('Error 1');
      }, { id: 'listener1', priority: 30 });

      kernel.on('test:simple', async () => {
        throw new Error('Error 2');
      }, { id: 'listener2', priority: 20 });

      kernel.on('test:simple', async () => {
        throw new Error('Error 3');
      }, { id: 'listener3', priority: 10 });

      await kernel.emitSerial('test:simple', { value: 1 });

      const errors = kernel.getExecutionErrors();
      expect(errors).toHaveLength(3);
      expect(errors.map(e => e.listenerId)).toEqual(['listener1', 'listener2', 'listener3']);
    });
  });

  describe('AggregateError with multiple failures', () => {
    it('should include all errors in AggregateError', async () => {
      const kernel = createKernel<TestEvents>({ errorBoundary: false });

      const errors = [
        new Error('Error 1'),
        new Error('Error 2'),
        new Error('Error 3'),
      ];

      kernel.on('test:simple', async () => { throw errors[0]; });
      kernel.on('test:simple', async () => { throw errors[1]; });
      kernel.on('test:simple', async () => { throw errors[2]; });

      try {
        await kernel.emit('test:simple', { value: 1 });
        expect.fail('Should have thrown AggregateError');
      } catch (err) {
        expect(err).toBeInstanceOf(AggregateError);
        const aggregateError = err as AggregateError;
        expect(aggregateError.errors).toEqual(errors);
        expect(aggregateError.message).toMatch(/3 listener\(s\) failed/);
      }
    });

    it('should provide meaningful error message with event name', async () => {
      const kernel = createKernel<TestEvents>({ errorBoundary: false });

      kernel.on('test:error', async () => {
        throw new Error('Failed');
      });

      try {
        await kernel.emit('test:error', { shouldFail: true });
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AggregateError);
        expect((err as AggregateError).message).toContain('test:error');
      }
    });

    it('should include error details in collected execution errors', async () => {
      const kernel = createKernel<TestEvents>({ errorBoundary: true });

      kernel.on('test:simple', async () => {
        throw new TypeError('Type error occurred');
      }, { id: 'typeErrorListener' });

      kernel.on('test:simple', async () => {
        throw new RangeError('Range error occurred');
      }, { id: 'rangeErrorListener' });

      const beforeTimestamp = Date.now();
      await kernel.emit('test:simple', { value: 1 });
      const afterTimestamp = Date.now();

      const errors = kernel.getExecutionErrors();
      expect(errors).toHaveLength(2);

      // Check first error
      expect(errors[0].listenerId).toBe('typeErrorListener');
      expect(errors[0].error).toBeInstanceOf(TypeError);
      expect(errors[0].error.message).toBe('Type error occurred');
      expect(errors[0].eventName).toBe('test:simple');
      expect(errors[0].timestamp).toBeGreaterThanOrEqual(beforeTimestamp);
      expect(errors[0].timestamp).toBeLessThanOrEqual(afterTimestamp);

      // Check second error
      expect(errors[1].listenerId).toBe('rangeErrorListener');
      expect(errors[1].error).toBeInstanceOf(RangeError);
      expect(errors[1].error.message).toBe('Range error occurred');
    });
  });

  describe('Debug mode logging', () => {
    it('should log listener execution with debug mode enabled', async () => {
      const kernel = createKernel<TestEvents>({ debug: true });

      kernel.on('test:simple', async () => {
        // Simple listener
      }, { id: 'debugListener', priority: 50 });

      await kernel.emit('test:simple', { value: 1 });

      // Check that debug logs were called
      expect(consoleDebugSpy).toHaveBeenCalledWith(
        '[QuarKernel] Listener added',
        expect.objectContaining({
          event: 'test:simple',
          listenerId: 'debugListener',
          priority: 50,
        })
      );

      expect(consoleDebugSpy).toHaveBeenCalledWith(
        '[QuarKernel] Event emitted',
        expect.objectContaining({
          event: 'test:simple',
          listenerCount: 1,
        })
      );

      expect(consoleDebugSpy).toHaveBeenCalledWith(
        '[QuarKernel] Listener executing',
        expect.objectContaining({
          listenerId: 'debugListener',
          event: 'test:simple',
          priority: 50,
        })
      );

      expect(consoleDebugSpy).toHaveBeenCalledWith(
        '[QuarKernel] Listener completed',
        expect.objectContaining({
          listenerId: 'debugListener',
        })
      );
    });

    it('should log errors with debug mode enabled', async () => {
      const kernel = createKernel<TestEvents>({
        debug: true,
        errorBoundary: true,
      });

      kernel.on('test:simple', async () => {
        throw new Error('Debug test error');
      }, { id: 'errorListener' });

      await kernel.emit('test:simple', { value: 1 });

      expect(consoleDebugSpy).toHaveBeenCalledWith(
        '[QuarKernel] Listener error',
        expect.objectContaining({
          listenerId: 'errorListener',
          error: 'Debug test error',
        })
      );
    });

    it('should log propagation stopped with debug mode', async () => {
      const kernel = createKernel<TestEvents>({ debug: true });

      kernel.on('test:simple', async (event) => {
        event.stopPropagation();
      }, { id: 'stopper', priority: 30 });

      kernel.on('test:simple', async () => {
        // Should be skipped
      }, { id: 'skipped', priority: 20 });

      await kernel.emit('test:simple', { value: 1 });

      expect(consoleDebugSpy).toHaveBeenCalledWith(
        '[QuarKernel] Listener skipped (propagation stopped)',
        expect.objectContaining({
          listenerId: 'skipped',
        })
      );
    });

    it('should include timestamps in debug logs', async () => {
      const kernel = createKernel<TestEvents>({ debug: true });

      kernel.on('test:async', async (event) => {
        await new Promise(resolve => setTimeout(resolve, event.data.delay));
      }, { id: 'timedListener' });

      await kernel.emit('test:async', { delay: 10 });

      // Find the completion log
      const completionCall = consoleDebugSpy.mock.calls.find(
        call => call[0] === '[QuarKernel] Listener completed'
      );

      expect(completionCall).toBeDefined();
      expect(completionCall![1]).toHaveProperty('duration');
      expect(completionCall![1].duration).toMatch(/\d+ms/);
    });

    it('should log listener removal with debug mode', async () => {
      const kernel = createKernel<TestEvents>({ debug: true });
      const listener = vi.fn();

      consoleDebugSpy.mockClear();
      kernel.on('test:simple', listener, { id: 'removable' });

      consoleDebugSpy.mockClear();
      kernel.off('test:simple', listener);

      expect(consoleDebugSpy).toHaveBeenCalledWith(
        '[QuarKernel] Listener removed',
        expect.objectContaining({
          event: 'test:simple',
          removed: 1,
          remaining: 0,
        })
      );
    });

    it('should log once listener removal with debug mode', async () => {
      const kernel = createKernel<TestEvents>({ debug: true });

      kernel.on('test:simple', vi.fn(), { id: 'onceListener', once: true });

      consoleDebugSpy.mockClear();
      await kernel.emit('test:simple', { value: 1 });

      expect(consoleDebugSpy).toHaveBeenCalledWith(
        '[QuarKernel] Removing once listeners',
        expect.objectContaining({
          event: 'test:simple',
          count: 1,
        })
      );
    });

    it('should not log when debug mode is disabled', async () => {
      const kernel = createKernel<TestEvents>({ debug: false });

      kernel.on('test:simple', vi.fn());
      await kernel.emit('test:simple', { value: 1 });

      // Should have no debug logs
      const debugCalls = consoleDebugSpy.mock.calls.filter(
        call => call[0]?.includes?.('[QuarKernel]')
      );
      expect(debugCalls.length).toBe(0);
    });

    it('should allow toggling debug mode at runtime', async () => {
      const kernel = createKernel<TestEvents>({ debug: false });

      kernel.on('test:simple', vi.fn(), { id: 'toggleTest' });

      consoleDebugSpy.mockClear();
      await kernel.emit('test:simple', { value: 1 });

      // No debug logs initially
      expect(consoleDebugSpy).not.toHaveBeenCalled();

      // Enable debug mode
      consoleDebugSpy.mockClear();
      kernel.debug(true);

      expect(consoleDebugSpy).toHaveBeenCalledWith('[QuarKernel] Debug mode enabled');

      consoleDebugSpy.mockClear();
      await kernel.emit('test:simple', { value: 2 });

      // Should now have debug logs
      expect(consoleDebugSpy).toHaveBeenCalledWith(
        '[QuarKernel] Event emitted',
        expect.any(Object)
      );
    });
  });

  describe('AbortSignal cancellation', () => {
    it('should remove listener immediately if signal is already aborted', async () => {
      const kernel = createKernel<TestEvents>();
      const controller = new AbortController();
      const listener = vi.fn();

      // Abort before registering
      controller.abort();

      kernel.on('test:simple', listener, { signal: controller.signal });

      // Give time for async removal
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(kernel.listenerCount('test:simple')).toBe(0);

      await kernel.emit('test:simple', { value: 1 });
      expect(listener).not.toHaveBeenCalled();
    });

    it('should remove listener when signal is aborted after registration', async () => {
      const kernel = createKernel<TestEvents>();
      const controller = new AbortController();
      const listener = vi.fn();

      kernel.on('test:simple', listener, { signal: controller.signal });
      expect(kernel.listenerCount('test:simple')).toBe(1);

      // Abort after registration
      controller.abort();

      // Give time for abort handler
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(kernel.listenerCount('test:simple')).toBe(0);

      await kernel.emit('test:simple', { value: 1 });
      expect(listener).not.toHaveBeenCalled();
    });

    it('should remove listener before emit when aborted', async () => {
      const kernel = createKernel<TestEvents>();
      const controller = new AbortController();
      const listener = vi.fn();

      kernel.on('test:simple', listener, { signal: controller.signal });

      // Abort and wait for cleanup
      controller.abort();
      await new Promise(resolve => setTimeout(resolve, 10));

      await kernel.emit('test:simple', { value: 1 });

      // Listener should not execute
      expect(listener).not.toHaveBeenCalled();
    });

    it('should handle multiple listeners with different signals', async () => {
      const kernel = createKernel<TestEvents>();
      const controller1 = new AbortController();
      const controller2 = new AbortController();
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const listener3 = vi.fn();

      kernel.on('test:simple', listener1, { signal: controller1.signal });
      kernel.on('test:simple', listener2, { signal: controller2.signal });
      kernel.on('test:simple', listener3); // No signal

      expect(kernel.listenerCount('test:simple')).toBe(3);

      // Abort first controller
      controller1.abort();
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(kernel.listenerCount('test:simple')).toBe(2);

      await kernel.emit('test:simple', { value: 1 });

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).toHaveBeenCalledTimes(1);
      expect(listener3).toHaveBeenCalledTimes(1);

      // Abort second controller
      controller2.abort();
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(kernel.listenerCount('test:simple')).toBe(1);

      await kernel.emit('test:simple', { value: 2 });

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).toHaveBeenCalledTimes(1);
      expect(listener3).toHaveBeenCalledTimes(2);
    });

    it('should cleanup abort listener when listener is manually removed', async () => {
      const kernel = createKernel<TestEvents>();
      const controller = new AbortController();
      const listener = vi.fn();

      kernel.on('test:simple', listener, { signal: controller.signal });

      // Manually remove listener
      kernel.off('test:simple', listener);

      expect(kernel.listenerCount('test:simple')).toBe(0);

      // Aborting should not cause issues
      controller.abort();
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should still be 0
      expect(kernel.listenerCount('test:simple')).toBe(0);
    });

    it('should cleanup abort listeners when offAll is called', async () => {
      const kernel = createKernel<TestEvents>();
      const controller = new AbortController();

      kernel.on('test:simple', vi.fn(), { signal: controller.signal });
      kernel.on('test:simple', vi.fn(), { signal: controller.signal });

      kernel.offAll('test:simple');

      // Aborting should not cause issues after cleanup
      controller.abort();
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(kernel.listenerCount('test:simple')).toBe(0);
    });

    it('should work with once listeners and AbortSignal', async () => {
      const kernel = createKernel<TestEvents>();
      const controller = new AbortController();
      const listener = vi.fn();

      kernel.on('test:simple', listener, {
        once: true,
        signal: controller.signal,
      });

      await kernel.emit('test:simple', { value: 1 });

      // Listener auto-removed by once
      expect(kernel.listenerCount('test:simple')).toBe(0);
      expect(listener).toHaveBeenCalledTimes(1);

      // Aborting should not cause issues
      controller.abort();
      await new Promise(resolve => setTimeout(resolve, 10));
    });
  });

  describe('Error clearing and aggregation', () => {
    it('should clear execution errors between emits', async () => {
      const kernel = createKernel<TestEvents>({ errorBoundary: true });

      kernel.on('test:simple', async () => {
        throw new Error('Error 1');
      });

      await kernel.emit('test:simple', { value: 1 });
      expect(kernel.getExecutionErrors()).toHaveLength(1);

      // Second emit should clear previous errors
      await kernel.emit('test:simple', { value: 2 });
      expect(kernel.getExecutionErrors()).toHaveLength(1);
    });

    it('should allow manual clearing of execution errors', async () => {
      const kernel = createKernel<TestEvents>({ errorBoundary: true });

      kernel.on('test:simple', async () => {
        throw new Error('Test error');
      });

      await kernel.emit('test:simple', { value: 1 });
      expect(kernel.getExecutionErrors()).toHaveLength(1);

      kernel.clearExecutionErrors();
      expect(kernel.getExecutionErrors()).toHaveLength(0);
    });

    it('should return readonly array of execution errors', async () => {
      const kernel = createKernel<TestEvents>({ errorBoundary: true });

      kernel.on('test:simple', async () => {
        throw new Error('Test error');
      });

      await kernel.emit('test:simple', { value: 1 });

      const errors = kernel.getExecutionErrors();
      expect(errors).toHaveLength(1);

      // Type check - should be ReadonlyArray
      expect(Array.isArray(errors)).toBe(true);
    });

    it('should collect errors across different events', async () => {
      const kernel = createKernel<TestEvents>({ errorBoundary: true });

      kernel.on('test:simple', async () => {
        throw new Error('Simple error');
      });

      kernel.on('test:error', async () => {
        throw new Error('Error event error');
      });

      await kernel.emit('test:simple', { value: 1 });
      const errors1 = kernel.getExecutionErrors();
      expect(errors1).toHaveLength(1);
      expect(errors1[0].eventName).toBe('test:simple');

      // New emit clears previous errors
      await kernel.emit('test:error', { shouldFail: true });
      const errors2 = kernel.getExecutionErrors();
      expect(errors2).toHaveLength(1);
      expect(errors2[0].eventName).toBe('test:error');
    });
  });

  describe('Error handling edge cases', () => {
    it('should handle listener throwing non-Error object', async () => {
      const kernel = createKernel<TestEvents>({ errorBoundary: true });

      kernel.on('test:simple', async () => {
        throw 'String error';
      }, { id: 'stringThrower' });

      kernel.on('test:simple', async () => {
        throw { custom: 'error' };
      }, { id: 'objectThrower' });

      await kernel.emit('test:simple', { value: 1 });

      const errors = kernel.getExecutionErrors();
      expect(errors).toHaveLength(2);
    });

    it('should handle async errors properly', async () => {
      const kernel = createKernel<TestEvents>({ errorBoundary: true });

      kernel.on('test:async', async (event) => {
        await new Promise(resolve => setTimeout(resolve, event.data.delay));
        throw new Error('Async error');
      }, { id: 'asyncError' });

      await kernel.emit('test:async', { delay: 10 });

      const errors = kernel.getExecutionErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0].error.message).toBe('Async error');
    });

    it('should handle errors in context emit', async () => {
      const kernel = createKernel<TestEvents>({ errorBoundary: true });

      kernel.on('test:simple', async (event, ctx) => {
        await ctx.emit('test:error', { shouldFail: true });
      });

      kernel.on('test:error', async () => {
        throw new Error('Nested error');
      });

      // First emit should succeed
      await kernel.emit('test:simple', { value: 1 });

      // Error should be from nested emit
      const errors = kernel.getExecutionErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0].eventName).toBe('test:error');
    });

    it('should handle errors with dependency ordering', async () => {
      const kernel = createKernel<TestEvents>({ errorBoundary: true });
      const order: string[] = [];

      kernel.on('test:simple', async () => {
        order.push('first');
      }, { id: 'first', priority: 100 });

      kernel.on('test:simple', async () => {
        order.push('second-error');
        throw new Error('Second failed');
      }, { id: 'second', priority: 90, after: ['first'] });

      kernel.on('test:simple', async () => {
        order.push('third');
      }, { id: 'third', priority: 80, after: ['second'] });

      await kernel.emit('test:simple', { value: 1 });

      // All should execute in dependency order
      expect(order).toEqual(['first', 'second-error', 'third']);

      const errors = kernel.getExecutionErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0].listenerId).toBe('second');
    });
  });
});
