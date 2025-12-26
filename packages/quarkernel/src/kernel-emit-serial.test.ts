/**
 * Tests for Kernel.emitSerial() (T119)
 *
 * Tests sequential listener execution where listeners are awaited
 * one after another instead of executing in parallel.
 */

import { describe, it, expect, vi } from 'vitest';
import { createKernel } from './kernel.js';

interface TestEvents {
  'test:serial': { value: number };
  'test:error': undefined;
  'test:pipeline': { data: string };
}

describe('Kernel.emitSerial() - Sequential execution (T119)', () => {
  describe('Sequential execution order', () => {
    it('should execute listeners sequentially, not in parallel', async () => {
      const kernel = createKernel<TestEvents>();
      const order: number[] = [];
      const timestamps: number[] = [];

      kernel.on('test:serial', async () => {
        const start = Date.now();
        await new Promise((resolve) => setTimeout(resolve, 50));
        timestamps.push(Date.now() - start);
        order.push(1);
      });

      kernel.on('test:serial', async () => {
        const start = Date.now();
        await new Promise((resolve) => setTimeout(resolve, 50));
        timestamps.push(Date.now() - start);
        order.push(2);
      });

      kernel.on('test:serial', async () => {
        const start = Date.now();
        await new Promise((resolve) => setTimeout(resolve, 50));
        timestamps.push(Date.now() - start);
        order.push(3);
      });

      const totalStart = Date.now();
      await kernel.emitSerial('test:serial', { value: 1 });
      const totalTime = Date.now() - totalStart;

      // Should execute in order
      expect(order).toEqual([1, 2, 3]);

      // Total time should be approximately sum of all delays (sequential)
      // 3 * 50ms = ~150ms
      expect(totalTime).toBeGreaterThanOrEqual(140);
    });

    it('should execute listeners in correct order each time', async () => {
      const kernel = createKernel<TestEvents>();
      const execution: string[] = [];

      kernel.on('test:serial', async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        execution.push('A');
      });

      kernel.on('test:serial', async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        execution.push('B');
      });

      kernel.on('test:serial', async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        execution.push('C');
      });

      await kernel.emitSerial('test:serial', { value: 1 });

      expect(execution).toEqual(['A', 'B', 'C']);
    });

    it('should allow next listener to access previous listener context', async () => {
      const kernel = createKernel<TestEvents>();

      kernel.on('test:pipeline', async (event) => {
        event.context.step1 = 'processed';
      });

      kernel.on('test:pipeline', async (event) => {
        expect(event.context.step1).toBe('processed');
        event.context.step2 = 'transformed';
      });

      kernel.on('test:pipeline', async (event) => {
        expect(event.context.step1).toBe('processed');
        expect(event.context.step2).toBe('transformed');
        event.context.step3 = 'completed';
      });

      await kernel.emitSerial('test:pipeline', { data: 'test' });
    });
  });

  describe('Priority and dependency ordering', () => {
    it('should respect priority ordering within serial execution', async () => {
      const kernel = createKernel<TestEvents>();
      const order: number[] = [];

      kernel.on('test:serial', async () => {
        order.push(1);
      }, { priority: 10 });

      kernel.on('test:serial', async () => {
        order.push(2);
      }, { priority: 50 });

      kernel.on('test:serial', async () => {
        order.push(3);
      }, { priority: 30 });

      await kernel.emitSerial('test:serial', { value: 1 });

      // Should execute in priority order: 50, 30, 10
      expect(order).toEqual([2, 3, 1]);
    });

    it('should respect dependency ordering in serial execution', async () => {
      const kernel = createKernel<TestEvents>();
      const order: string[] = [];

      kernel.on('test:serial', async () => {
        order.push('B');
      }, { id: 'B', after: ['A'] });

      kernel.on('test:serial', async () => {
        order.push('A');
      }, { id: 'A' });

      kernel.on('test:serial', async () => {
        order.push('C');
      }, { id: 'C', after: ['A', 'B'] });

      await kernel.emitSerial('test:serial', { value: 1 });

      // Should execute in dependency order: A, B, C
      expect(order).toEqual(['A', 'B', 'C']);
    });

    it('should respect both priority and dependencies', async () => {
      const kernel = createKernel<TestEvents>();
      const order: string[] = [];

      kernel.on('test:serial', async () => {
        order.push('A');
      }, { id: 'A', priority: 100 });

      kernel.on('test:serial', async () => {
        order.push('B');
      }, { id: 'B', priority: 50 });

      kernel.on('test:serial', async () => {
        order.push('C');
      }, { id: 'C', after: ['B'], priority: 200 });

      await kernel.emitSerial('test:serial', { value: 1 });

      // A (priority 100) and B (priority 50) have no dependencies
      // C depends on B, so must come after B
      // Within no-dependency group: A before B (higher priority)
      expect(order).toEqual(['A', 'B', 'C']);
    });
  });

  describe('Error handling', () => {
    it('should stop on first error when errorBoundary is false', async () => {
      const kernel = createKernel<TestEvents>({ errorBoundary: false });
      const order: number[] = [];

      kernel.on('test:error', async () => {
        order.push(1);
      });

      kernel.on('test:error', async () => {
        order.push(2);
        throw new Error('Test error');
      });

      kernel.on('test:error', async () => {
        order.push(3);
      });

      await expect(kernel.emitSerial('test:error')).rejects.toThrow('Test error');

      // Should stop after listener 2
      expect(order).toEqual([1, 2]);
    });

    it('should continue on error when errorBoundary is true', async () => {
      const onError = vi.fn();
      const kernel = createKernel<TestEvents>({ errorBoundary: true, onError });
      const order: number[] = [];

      kernel.on('test:error', async () => {
        order.push(1);
      });

      kernel.on('test:error', async () => {
        order.push(2);
        throw new Error('Test error 1');
      });

      kernel.on('test:error', async () => {
        order.push(3);
      });

      kernel.on('test:error', async () => {
        order.push(4);
        throw new Error('Test error 2');
      });

      await kernel.emitSerial('test:error');

      // Should execute all listeners despite errors
      expect(order).toEqual([1, 2, 3, 4]);

      // onError should be called for each error
      expect(onError).toHaveBeenCalledTimes(2);
    });

    it('should collect execution errors in errorBoundary mode', async () => {
      const kernel = createKernel<TestEvents>({ errorBoundary: true });

      kernel.on('test:error', async () => {
        throw new Error('Error 1');
      }, { id: 'listener1' });

      kernel.on('test:error', async () => {
        throw new Error('Error 2');
      }, { id: 'listener2' });

      await kernel.emitSerial('test:error');

      const errors = kernel.getExecutionErrors();
      expect(errors).toHaveLength(2);
      expect(errors[0].listenerId).toBe('listener1');
      expect(errors[0].error.message).toBe('Error 1');
      expect(errors[1].listenerId).toBe('listener2');
      expect(errors[1].error.message).toBe('Error 2');
    });
  });

  describe('Once listeners', () => {
    it('should remove once listeners after execution', async () => {
      const kernel = createKernel<TestEvents>();
      const listener = vi.fn();

      kernel.on('test:serial', listener, { once: true });

      expect(kernel.listenerCount('test:serial')).toBe(1);

      await kernel.emitSerial('test:serial', { value: 1 });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(kernel.listenerCount('test:serial')).toBe(0);
    });

    it('should remove predicate once listeners correctly', async () => {
      const kernel = createKernel<TestEvents>();
      const listener = vi.fn();

      kernel.on('test:serial', listener, {
        once: (event) => event.data.value === 2,
      });

      await kernel.emitSerial('test:serial', { value: 1 });
      expect(kernel.listenerCount('test:serial')).toBe(1);

      await kernel.emitSerial('test:serial', { value: 2 });
      expect(kernel.listenerCount('test:serial')).toBe(0);

      expect(listener).toHaveBeenCalledTimes(2);
    });
  });

  describe('Propagation control', () => {
    it('should respect stopPropagation in serial execution', async () => {
      const kernel = createKernel<TestEvents>();
      const order: number[] = [];

      kernel.on('test:serial', async (event) => {
        order.push(1);
      });

      kernel.on('test:serial', async (event) => {
        order.push(2);
        event.stopPropagation();
      });

      kernel.on('test:serial', async () => {
        order.push(3);
      });

      await kernel.emitSerial('test:serial', { value: 1 });

      // Should stop after listener 2
      expect(order).toEqual([1, 2]);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty listener list', async () => {
      const kernel = createKernel<TestEvents>();

      await expect(
        kernel.emitSerial('test:serial', { value: 1 })
      ).resolves.toBeUndefined();
    });

    it('should handle single listener', async () => {
      const kernel = createKernel<TestEvents>();
      const listener = vi.fn();

      kernel.on('test:serial', listener);

      await kernel.emitSerial('test:serial', { value: 1 });

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should handle synchronous listeners', async () => {
      const kernel = createKernel<TestEvents>();
      const order: number[] = [];

      kernel.on('test:serial', () => {
        order.push(1);
      });

      kernel.on('test:serial', () => {
        order.push(2);
      });

      kernel.on('test:serial', () => {
        order.push(3);
      });

      await kernel.emitSerial('test:serial', { value: 1 });

      expect(order).toEqual([1, 2, 3]);
    });

    it('should handle wildcard patterns in serial execution', async () => {
      const kernel = createKernel<TestEvents>({ wildcard: true });
      const order: string[] = [];

      kernel.on('test:*', async () => {
        order.push('wildcard');
      });

      kernel.on('test:serial', async () => {
        order.push('exact');
      });

      await kernel.emitSerial('test:serial', { value: 1 });

      // Both listeners should execute
      expect(order).toContain('wildcard');
      expect(order).toContain('exact');
      expect(order.length).toBe(2);
    });
  });

  describe('Debug mode', () => {
    it('should log serial execution in debug mode', async () => {
      const consoleDebug = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const kernel = createKernel<TestEvents>({ debug: true });

      kernel.on('test:serial', async () => {});

      await kernel.emitSerial('test:serial', { value: 1 });

      expect(consoleDebug).toHaveBeenCalledWith(
        expect.stringContaining('[QuarKernel]'),
        expect.objectContaining({ event: 'test:serial' })
      );

      consoleDebug.mockRestore();
    });
  });

  describe('Comparison with parallel emit()', () => {
    it('should take longer than parallel emit() for same listeners', async () => {
      const kernel = createKernel<TestEvents>();

      const delay = 30;

      // Add three listeners with delays
      kernel.on('test:serial', async () => {
        await new Promise((resolve) => setTimeout(resolve, delay));
      });

      kernel.on('test:serial', async () => {
        await new Promise((resolve) => setTimeout(resolve, delay));
      });

      kernel.on('test:serial', async () => {
        await new Promise((resolve) => setTimeout(resolve, delay));
      });

      // Test serial execution time
      const serialStart = Date.now();
      await kernel.emitSerial('test:serial', { value: 1 });
      const serialTime = Date.now() - serialStart;

      // Clear listeners and re-add
      kernel.offAll('test:serial');
      kernel.on('test:serial', async () => {
        await new Promise((resolve) => setTimeout(resolve, delay));
      });
      kernel.on('test:serial', async () => {
        await new Promise((resolve) => setTimeout(resolve, delay));
      });
      kernel.on('test:serial', async () => {
        await new Promise((resolve) => setTimeout(resolve, delay));
      });

      // Test parallel execution time
      const parallelStart = Date.now();
      await kernel.emit('test:serial', { value: 1 });
      const parallelTime = Date.now() - parallelStart;

      // Serial should be approximately 3x delay
      // Parallel should be approximately 1x delay
      expect(serialTime).toBeGreaterThanOrEqual(delay * 2.5);
      expect(parallelTime).toBeLessThan(delay * 2);
    });
  });
});
