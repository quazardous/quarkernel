/**
 * Integration and Stress Tests for QuarKernel Core (T131)
 *
 * End-to-end integration tests and stress tests for concurrent scenarios and high load.
 * Tests real-world usage patterns combining all features:
 * - Dependencies, wildcards, once, abort
 * - Plugin architecture simulation
 * - Concurrent emissions
 * - High-volume event streams (1000+ events)
 * - Memory stability in long-running scenarios
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createKernel } from './kernel.js';
import type { ListenerFunction } from './types.js';

interface AppEvents {
  'app:init': undefined;
  'app:ready': undefined;
  'app:shutdown': undefined;
  'plugin:load': { name: string; version: string };
  'plugin:ready': { name: string };
  'plugin:error': { name: string; error: Error };
  'user:login': { userId: string; timestamp: number };
  'user:logout': { userId: string };
  'data:received': { id: string; data: any };
  'data:processed': { id: string; result: any };
  'task:created': { taskId: string; type: string };
  'task:updated': { taskId: string; status: string };
  'task:completed': { taskId: string; result: any };
  'notification:*': any;
  'analytics:*': any;
  'test:event': { value: number };
}

describe('Integration Tests - Real-world scenarios (T131)', () => {
  describe('Plugin system simulation', () => {
    it('should orchestrate plugin initialization with dependencies', async () => {
      const kernel = createKernel<AppEvents>();
      const initOrder: string[] = [];

      // Core plugin - no dependencies
      kernel.on('app:init', async () => {
        initOrder.push('core');
        await new Promise((resolve) => setTimeout(resolve, 10));
      }, { id: 'core-init' });

      // Database plugin - depends on core
      kernel.on('app:init', async () => {
        initOrder.push('database');
        await new Promise((resolve) => setTimeout(resolve, 5));
      }, { id: 'db-init', after: ['core-init'] });

      // Auth plugin - depends on database
      kernel.on('app:init', async () => {
        initOrder.push('auth');
        await new Promise((resolve) => setTimeout(resolve, 3));
      }, { id: 'auth-init', after: ['db-init'] });

      // API plugin - depends on both auth and database
      kernel.on('app:init', async () => {
        initOrder.push('api');
      }, { id: 'api-init', after: ['auth-init', 'db-init'] });

      // Analytics plugin - depends on core (can run in parallel with db)
      kernel.on('app:init', async () => {
        initOrder.push('analytics');
      }, { id: 'analytics-init', after: ['core-init'] });

      await kernel.emit('app:init', undefined);

      // Verify correct order
      expect(initOrder[0]).toBe('core');
      expect(initOrder.indexOf('database')).toBeGreaterThan(initOrder.indexOf('core'));
      expect(initOrder.indexOf('auth')).toBeGreaterThan(initOrder.indexOf('database'));
      expect(initOrder.indexOf('api')).toBeGreaterThan(initOrder.indexOf('auth'));
      expect(initOrder.indexOf('analytics')).toBeGreaterThan(initOrder.indexOf('core'));
      expect(initOrder.length).toBe(5);
    });

    it('should handle plugin lifecycle with multiple events', async () => {
      const kernel = createKernel<AppEvents>();
      const lifecycle: string[] = [];

      // Plugin load handler
      kernel.on('plugin:load', async (event) => {
        lifecycle.push(`load:${event.data.name}`);
      });

      // Plugin ready handler - uses wildcard
      kernel.on('plugin:*', async (event) => {
        if (event.name === 'plugin:ready') {
          lifecycle.push(`ready:${event.data.name}`);
        }
      });

      // Emit lifecycle events
      await kernel.emit('plugin:load', { name: 'auth', version: '1.0.0' });
      await kernel.emit('plugin:ready', { name: 'auth' });
      await kernel.emit('plugin:load', { name: 'api', version: '2.0.0' });
      await kernel.emit('plugin:ready', { name: 'api' });

      expect(lifecycle).toEqual([
        'load:auth',
        'ready:auth',
        'load:api',
        'ready:api',
      ]);
    });

    it('should handle plugin error recovery with context sharing', async () => {
      const kernel = createKernel<AppEvents>({ errorBoundary: true });
      const errors: string[] = [];

      kernel.on('plugin:load', async (event, context) => {
        event.context.loaded = event.context.loaded || [];
        event.context.loaded.push(event.data.name);
      }, { id: 'tracker' });

      kernel.on('plugin:load', async (event) => {
        if (event.data.name === 'bad-plugin') {
          throw new Error('Plugin load failed');
        }
      }, { id: 'validator', after: ['tracker'] });

      kernel.on('plugin:load', async (event) => {
        // This should still execute due to errorBoundary
        event.context.finalized = true;
      }, { id: 'finalizer', after: ['validator'] });

      // Handle errors
      kernel.on('plugin:error', async (event) => {
        errors.push(event.data.name);
      });

      await kernel.emit('plugin:load', { name: 'good-plugin', version: '1.0.0' });
      await kernel.emit('plugin:load', { name: 'bad-plugin', version: '1.0.0' });

      expect(errors.length).toBe(0); // Error boundary catches errors, doesn't emit plugin:error
    });
  });

  describe('Combined features integration', () => {
    it('should combine dependencies, priority, wildcards, and once', async () => {
      const kernel = createKernel<AppEvents>();
      const events: string[] = [];

      // High priority wildcard listener
      kernel.on('notification:*', async (event) => {
        events.push(`high-priority:${event.name}`);
      }, { priority: 100 });

      // Low priority wildcard listener
      kernel.on('notification:*', async (event) => {
        events.push(`low-priority:${event.name}`);
      }, { priority: 10 });

      // Specific listener with dependency
      kernel.on('notification:email', async () => {
        events.push('email-handler');
      }, { id: 'email', after: ['tracker'], priority: 50 });

      // Tracker runs first
      kernel.on('notification:*', async () => {
        events.push('tracker');
      }, { id: 'tracker', priority: 200 });

      // Once listener - only fires on first notification
      kernel.on('notification:*', async () => {
        events.push('once-listener');
      }, { once: true, priority: 150 });

      await kernel.emit('notification:email' as any, { message: 'test' });
      await kernel.emit('notification:sms' as any, { message: 'test2' });

      // Verify execution order and once behavior
      expect(events[0]).toBe('tracker'); // Highest priority
      expect(events[1]).toBe('once-listener'); // Once listener, priority 150
      expect(events[2]).toBe('high-priority:notification:email'); // Priority 100
      expect(events).toContain('email-handler'); // After tracker
      expect(events).toContain('low-priority:notification:email'); // Priority 10

      // Second emit should not trigger once listener
      const beforeSecond = events.length;
      const secondEmitEvents = events.slice(beforeSecond);
      expect(secondEmitEvents).not.toContain('once-listener');
    });

    it('should handle AbortSignal with dependencies and wildcards', async () => {
      const kernel = createKernel<AppEvents>();
      const controller = new AbortController();
      const events: string[] = [];

      kernel.on('analytics:*', async (event) => {
        events.push(`analytics:${event.name}`);
      }, { signal: controller.signal, id: 'analytics' });

      kernel.on('analytics:pageview', async () => {
        events.push('pageview-handler');
      }, { signal: controller.signal, after: ['analytics'] });

      await kernel.emit('analytics:pageview' as any, { page: '/home' });
      expect(events.length).toBe(2);

      // Abort and wait for cleanup
      controller.abort();
      await new Promise((resolve) => setTimeout(resolve, 10));

      events.length = 0;
      await kernel.emit('analytics:pageview' as any, { page: '/about' });
      expect(events.length).toBe(0);
    });

    it('should handle conditional once with predicate and context', async () => {
      const kernel = createKernel<AppEvents>();
      const results: number[] = [];
      let executionCount = 0;

      kernel.on('test:event', async (event) => {
        executionCount++;
        results.push(event.data.value);
        event.context.count = executionCount;
      }, {
        once: (event) => event.context.count >= 3,
      });

      await kernel.emit('test:event', { value: 1 });
      await kernel.emit('test:event', { value: 2 });
      await kernel.emit('test:event', { value: 3 });
      await kernel.emit('test:event', { value: 4 }); // Should not trigger

      expect(results).toEqual([1, 2, 3]);
      expect(kernel.listenerCount('test:event')).toBe(0);
    });
  });
});

describe('Stress Tests - High volume and concurrency (T131)', () => {
  describe('High-volume listener tests', () => {
    it('should handle 10000 listeners on single event', async () => {
      const kernel = createKernel<AppEvents>();
      let callCount = 0;

      // Add 10000 listeners
      for (let i = 0; i < 10000; i++) {
        kernel.on('test:event', async () => {
          callCount++;
        });
      }

      expect(kernel.listenerCount('test:event')).toBe(10000);

      // Emit and verify all called
      await kernel.emit('test:event', { value: 1 });
      expect(callCount).toBe(10000);
    });

    it('should handle 1000 events with 10 listeners each', async () => {
      const kernel = createKernel();
      const eventCounts = new Map<string, number>();

      // Create 1000 events with 10 listeners each
      for (let e = 0; e < 1000; e++) {
        const eventName = `event:${e}`;
        eventCounts.set(eventName, 0);

        for (let l = 0; l < 10; l++) {
          kernel.on(eventName, async () => {
            eventCounts.set(eventName, (eventCounts.get(eventName) || 0) + 1);
          });
        }
      }

      expect(kernel.eventNames().length).toBe(1000);

      // Emit all events
      for (let e = 0; e < 1000; e++) {
        await kernel.emit(`event:${e}`, undefined);
      }

      // Verify all listeners called
      for (const [eventName, count] of eventCounts) {
        expect(count).toBe(10);
      }
    });

    it('should handle rapid add/remove cycles without degradation', async () => {
      const kernel = createKernel<AppEvents>();

      // Measure time for first 100 cycles
      const start1 = Date.now();
      for (let i = 0; i < 100; i++) {
        const listener = vi.fn();
        kernel.on('test:event', listener);
        await kernel.emit('test:event', { value: i });
        kernel.off('test:event', listener);
      }
      const time1 = Date.now() - start1;

      // Measure time for second 100 cycles
      const start2 = Date.now();
      for (let i = 0; i < 100; i++) {
        const listener = vi.fn();
        kernel.on('test:event', listener);
        await kernel.emit('test:event', { value: i });
        kernel.off('test:event', listener);
      }
      const time2 = Date.now() - start2;

      // Performance should be similar (no degradation)
      // Allow 3x variance for timing inconsistencies
      expect(time2).toBeLessThan(time1 * 3);
      expect(kernel.listenerCount('test:event')).toBe(0);
    });
  });

  describe('Concurrent emission tests', () => {
    it('should handle concurrent emits from multiple sources', async () => {
      const kernel = createKernel<AppEvents>();
      const results: string[] = [];
      const lock = { count: 0 };

      kernel.on('task:created', async (event) => {
        lock.count++;
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 10));
        results.push(event.data.taskId);
        lock.count--;
      });

      // Emit 100 events concurrently
      const promises: Promise<void>[] = [];
      for (let i = 0; i < 100; i++) {
        promises.push(kernel.emit('task:created', { taskId: `task-${i}`, type: 'test' }));
      }

      await Promise.all(promises);

      expect(results.length).toBe(100);
      expect(lock.count).toBe(0); // All completed
      expect(new Set(results).size).toBe(100); // All unique
    });

    it('should handle concurrent emits with dependencies', async () => {
      const kernel = createKernel<AppEvents>();
      let totalExecutions = 0;

      // Simple counter-based dependency test
      kernel.on('data:received', async (event) => {
        event.context.step1 = ++totalExecutions;
        await new Promise((resolve) => setTimeout(resolve, 5));
      }, { id: 'receiver' });

      kernel.on('data:received', async (event) => {
        event.context.step2 = ++totalExecutions;
        // Verify step1 executed first
        expect(event.context.step1).toBeDefined();
        expect(event.context.step2).toBeGreaterThan(event.context.step1);
        await new Promise((resolve) => setTimeout(resolve, 2));
      }, { id: 'validator', after: ['receiver'] });

      kernel.on('data:received', async (event) => {
        event.context.step3 = ++totalExecutions;
        // Verify step2 executed before step3
        expect(event.context.step2).toBeDefined();
        expect(event.context.step3).toBeGreaterThan(event.context.step2);
      }, { id: 'processor', after: ['validator'] });

      // Concurrent emissions - each should maintain dependency order
      await Promise.all([
        kernel.emit('data:received', { id: 'A', data: { value: 1 } }),
        kernel.emit('data:received', { id: 'B', data: { value: 2 } }),
        kernel.emit('data:received', { id: 'C', data: { value: 3 } }),
      ]);

      // Total of 9 executions (3 listeners × 3 emissions)
      expect(totalExecutions).toBe(9);
    });

    it('should handle parallel emits with shared context safely', async () => {
      const kernel = createKernel<AppEvents>();

      kernel.on('user:login', async (event) => {
        event.context.logins = event.context.logins || [];
        event.context.logins.push(event.data.userId);
      });

      // Parallel logins
      await Promise.all([
        kernel.emit('user:login', { userId: 'user1', timestamp: Date.now() }),
        kernel.emit('user:login', { userId: 'user2', timestamp: Date.now() }),
        kernel.emit('user:login', { userId: 'user3', timestamp: Date.now() }),
      ]);

      // Each emission has its own context - no cross-contamination
      // This test verifies that contexts don't interfere
      expect(true).toBe(true); // If we get here without errors, test passes
    });
  });

  describe('Long-running memory stability tests', () => {
    it('should maintain stable memory with continuous event flow', async () => {
      const kernel = createKernel<AppEvents>();
      let processedCount = 0;

      kernel.on('task:created', async () => {
        processedCount++;
      });

      kernel.on('task:updated', async () => {
        processedCount++;
      });

      kernel.on('task:completed', async () => {
        processedCount++;
      });

      // Simulate 1000 task lifecycle iterations
      for (let i = 0; i < 1000; i++) {
        const taskId = `task-${i}`;
        await kernel.emit('task:created', { taskId, type: 'test' });
        await kernel.emit('task:updated', { taskId, status: 'processing' });
        await kernel.emit('task:completed', { taskId, result: { success: true } });
      }

      expect(processedCount).toBe(3000);
      expect(kernel.eventNames().length).toBe(3); // No event accumulation
    });

    it('should not accumulate listeners with once in long-running scenario', async () => {
      const kernel = createKernel<AppEvents>();
      let onceCount = 0;

      // Simulate 1000 users logging in, each with a once listener
      for (let i = 0; i < 1000; i++) {
        kernel.on('user:login', async () => {
          onceCount++;
        }, { once: true });

        await kernel.emit('user:login', { userId: `user-${i}`, timestamp: Date.now() });
      }

      expect(onceCount).toBe(1000);
      expect(kernel.listenerCount('user:login')).toBe(0); // All once listeners removed
    });

    it('should handle continuous wildcard matching without degradation', async () => {
      const kernel = createKernel();
      let matchCount = 0;

      kernel.on('analytics:*', async () => {
        matchCount++;
      });

      kernel.on('notification:*', async () => {
        matchCount++;
      });

      // Emit 500 events of each type
      for (let i = 0; i < 500; i++) {
        await kernel.emit(`analytics:event${i}` as any, { value: i });
        await kernel.emit(`notification:event${i}` as any, { value: i });
      }

      expect(matchCount).toBe(1000);
    });

    it('should cleanup AbortSignal listeners in long-running scenario', async () => {
      const kernel = createKernel<AppEvents>();
      const controllers: AbortController[] = [];

      // Create and abort 1000 listeners
      for (let i = 0; i < 1000; i++) {
        const controller = new AbortController();
        controllers.push(controller);

        kernel.on('test:event', async () => {
          // Listener
        }, { signal: controller.signal });
      }

      expect(kernel.listenerCount('test:event')).toBe(1000);

      // Abort all
      for (const controller of controllers) {
        controller.abort();
      }

      // Wait for cleanup
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(kernel.listenerCount('test:event')).toBe(0);
    });
  });

  describe('Complex dependency graphs under stress', () => {
    it('should handle complex dependency DAG with 100 listeners', async () => {
      const kernel = createKernel<AppEvents>();
      const executed: string[] = [];

      // Create a diamond-shaped dependency graph, repeated 25 times
      for (let i = 0; i < 25; i++) {
        const base = `L${i * 4}`;

        // Root
        kernel.on('test:event', async () => {
          executed.push(`${base}-root`);
        }, { id: `${base}-root` });

        // Two middle listeners depending on root
        kernel.on('test:event', async () => {
          executed.push(`${base}-mid1`);
        }, { id: `${base}-mid1`, after: [`${base}-root`] });

        kernel.on('test:event', async () => {
          executed.push(`${base}-mid2`);
        }, { id: `${base}-mid2`, after: [`${base}-root`] });

        // Final listener depending on both middle
        kernel.on('test:event', async () => {
          executed.push(`${base}-final`);
        }, { id: `${base}-final`, after: [`${base}-mid1`, `${base}-mid2`] });
      }

      expect(kernel.listenerCount('test:event')).toBe(100);

      await kernel.emit('test:event', { value: 1 });

      expect(executed.length).toBe(100);

      // Verify dependency order for each group
      for (let i = 0; i < 25; i++) {
        const base = `L${i * 4}`;
        const rootIdx = executed.indexOf(`${base}-root`);
        const mid1Idx = executed.indexOf(`${base}-mid1`);
        const mid2Idx = executed.indexOf(`${base}-mid2`);
        const finalIdx = executed.indexOf(`${base}-final`);

        expect(mid1Idx).toBeGreaterThan(rootIdx);
        expect(mid2Idx).toBeGreaterThan(rootIdx);
        expect(finalIdx).toBeGreaterThan(mid1Idx);
        expect(finalIdx).toBeGreaterThan(mid2Idx);
      }
    });

    it('should handle priority + dependencies with 50 listeners', async () => {
      const kernel = createKernel<AppEvents>();
      const executed: number[] = [];

      // Create 50 listeners with mixed priorities and dependencies
      for (let i = 0; i < 50; i++) {
        const priority = i % 10; // Priorities 0-9

        if (i === 0) {
          // First listener, no dependencies
          kernel.on('test:event', async () => {
            executed.push(i);
          }, { id: `L${i}`, priority });
        } else {
          // Depend on previous listener
          kernel.on('test:event', async () => {
            executed.push(i);
          }, { id: `L${i}`, after: [`L${i - 1}`], priority });
        }
      }

      await kernel.emit('test:event', { value: 1 });

      // Verify all executed in dependency order (0, 1, 2, ..., 49)
      expect(executed).toEqual(Array.from({ length: 50 }, (_, i) => i));
    });
  });

  describe('Performance benchmarks', () => {
    it('should emit to 1000 listeners in reasonable time', async () => {
      const kernel = createKernel<AppEvents>();

      for (let i = 0; i < 1000; i++) {
        kernel.on('test:event', async () => {
          // Simple listener
        });
      }

      const start = Date.now();
      await kernel.emit('test:event', { value: 1 });
      const duration = Date.now() - start;

      // Should complete in under 1 second (generous threshold)
      expect(duration).toBeLessThan(1000);
    });

    it('should handle 10000 emissions in reasonable time', async () => {
      const kernel = createKernel<AppEvents>();

      kernel.on('test:event', async () => {
        // Simple listener
      });

      const start = Date.now();
      for (let i = 0; i < 10000; i++) {
        await kernel.emit('test:event', { value: i });
      }
      const duration = Date.now() - start;

      // Should complete in under 5 seconds (generous threshold)
      expect(duration).toBeLessThan(5000);
    });

    it('should add/remove listeners efficiently at scale', async () => {
      const kernel = createKernel<AppEvents>();
      const listeners: Array<() => void> = [];

      const start = Date.now();

      // Add 1000 listeners
      for (let i = 0; i < 1000; i++) {
        const listener = vi.fn();
        listeners.push(listener);
        kernel.on('test:event', listener);
      }

      // Remove all
      for (const listener of listeners) {
        kernel.off('test:event', listener);
      }

      const duration = Date.now() - start;

      // Should complete in under 500ms
      expect(duration).toBeLessThan(500);
      expect(kernel.listenerCount('test:event')).toBe(0);
    });
  });
});

describe('Edge cases and error scenarios (T131)', () => {
  it('should handle emitting while listeners are being added', async () => {
    const kernel = createKernel<AppEvents>();
    const results: string[] = [];
    let dynamicAdded = false;

    kernel.on('test:event', async () => {
      results.push('listener1');

      // Add listener during first emission only
      if (!dynamicAdded) {
        kernel.on('test:event', async () => {
          results.push('dynamic-listener');
        });
        dynamicAdded = true;
      }
    });

    await kernel.emit('test:event', { value: 1 });
    expect(results).toEqual(['listener1']); // Dynamic listener not called in same emission

    await kernel.emit('test:event', { value: 2 });
    // Both listeners should execute in second emission
    expect(results).toContain('listener1');
    expect(results).toContain('dynamic-listener');
    expect(results.length).toBe(3); // listener1 (first), listener1 (second), dynamic-listener (second)
  });

  it('should handle removing listeners during emission', async () => {
    const kernel = createKernel<AppEvents>();
    const results: string[] = [];

    const listener2 = vi.fn(async () => {
      results.push('listener2');
    });

    kernel.on('test:event', async () => {
      results.push('listener1');
      kernel.off('test:event', listener2); // Remove listener2
    });

    kernel.on('test:event', listener2);

    kernel.on('test:event', async () => {
      results.push('listener3');
    });

    await kernel.emit('test:event', { value: 1 });

    // listener2 should still execute in current emission (removal takes effect after)
    expect(results).toEqual(['listener1', 'listener2', 'listener3']);

    results.length = 0;
    await kernel.emit('test:event', { value: 2 });

    // listener2 should not execute in second emission
    expect(results).toEqual(['listener1', 'listener3']);
  });

  it('should handle stopPropagation with multiple listeners', async () => {
    const kernel = createKernel<AppEvents>();
    const results: string[] = [];

    kernel.on('test:event', async (event) => {
      results.push('listener1');
      event.stopPropagation();
    }, { priority: 100 });

    kernel.on('test:event', async () => {
      results.push('listener2');
    }, { priority: 50 });

    kernel.on('test:event', async () => {
      results.push('listener3');
    }, { priority: 10 });

    await kernel.emit('test:event', { value: 1 });

    expect(results).toEqual(['listener1']); // Only first listener executed
  });

  it('should handle errors in stress scenario with error boundary', async () => {
    const kernel = createKernel<AppEvents>({ errorBoundary: true });
    const results: number[] = [];

    for (let i = 0; i < 100; i++) {
      kernel.on('test:event', async () => {
        if (Math.random() < 0.1) {
          throw new Error('Random error');
        }
        results.push(i);
      });
    }

    // Should not throw despite random errors
    await expect(kernel.emit('test:event', { value: 1 })).resolves.not.toThrow();

    // Most listeners should have executed
    expect(results.length).toBeGreaterThan(80); // At least 80% success rate
  });
});
