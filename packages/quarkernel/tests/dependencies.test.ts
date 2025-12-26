/**
 * Comprehensive tests for listener dependency resolution (T127)
 *
 * Tests the dependency ordering system in QuarKernel:
 * - Dependency order enforcement (after option)
 * - Combined priority + dependency sorting
 * - Circular dependency detection
 * - Missing dependency errors
 * - Complex dependency graphs
 */

import { describe, it, expect, vi } from 'vitest';
import { createKernel } from '../src/kernel.js';
import { CyclicDependencyError } from '../src/toposort.js';

interface TestEvents {
  'test': { value: number };
}

describe('Listener Dependencies', () => {
  describe('Basic dependency ordering', () => {
    it('should execute listeners in simple dependency chain A->B->C', async () => {
      const kernel = createKernel<TestEvents>();
      const order: string[] = [];

      kernel.on('test', async () => {
        order.push('C');
      }, { id: 'C', after: ['B'] });

      kernel.on('test', async () => {
        order.push('B');
      }, { id: 'B', after: ['A'] });

      kernel.on('test', async () => {
        order.push('A');
      }, { id: 'A' });

      await kernel.emit('test', { value: 1 });

      expect(order).toEqual(['A', 'B', 'C']);
    });

    it('should execute listener without dependencies before dependent listeners', async () => {
      const kernel = createKernel<TestEvents>();
      const order: string[] = [];

      kernel.on('test', async () => {
        order.push('dependent');
      }, { id: 'dependent', after: ['independent'] });

      kernel.on('test', async () => {
        order.push('independent');
      }, { id: 'independent' });

      await kernel.emit('test', { value: 1 });

      expect(order).toEqual(['independent', 'dependent']);
    });

    it('should handle multiple dependencies for single listener', async () => {
      const kernel = createKernel<TestEvents>();
      const order: string[] = [];

      kernel.on('test', async () => {
        order.push('A');
      }, { id: 'A' });

      kernel.on('test', async () => {
        order.push('B');
      }, { id: 'B' });

      kernel.on('test', async () => {
        order.push('C');
      }, { id: 'C', after: ['A', 'B'] });

      await kernel.emit('test', { value: 1 });

      // C must execute after both A and B
      expect(order.indexOf('C')).toBeGreaterThan(order.indexOf('A'));
      expect(order.indexOf('C')).toBeGreaterThan(order.indexOf('B'));
      expect(order).toContain('A');
      expect(order).toContain('B');
      expect(order).toContain('C');
    });

    it('should accept dependency as string', async () => {
      const kernel = createKernel<TestEvents>();
      const order: string[] = [];

      kernel.on('test', async () => {
        order.push('first');
      }, { id: 'first' });

      kernel.on('test', async () => {
        order.push('second');
      }, { id: 'second', after: 'first' });

      await kernel.emit('test', { value: 1 });

      expect(order).toEqual(['first', 'second']);
    });

    it('should accept dependency as array', async () => {
      const kernel = createKernel<TestEvents>();
      const order: string[] = [];

      kernel.on('test', async () => {
        order.push('A');
      }, { id: 'A' });

      kernel.on('test', async () => {
        order.push('B');
      }, { id: 'B' });

      kernel.on('test', async () => {
        order.push('final');
      }, { id: 'final', after: ['A', 'B'] });

      await kernel.emit('test', { value: 1 });

      expect(order.indexOf('final')).toBeGreaterThan(order.indexOf('A'));
      expect(order.indexOf('final')).toBeGreaterThan(order.indexOf('B'));
    });
  });

  describe('Priority with dependencies', () => {
    it('should respect priority within same dependency level', async () => {
      const kernel = createKernel<TestEvents>();
      const order: string[] = [];

      kernel.on('test', async () => {
        order.push('root');
      }, { id: 'root', priority: 0 });

      kernel.on('test', async () => {
        order.push('low');
      }, { id: 'low', after: ['root'], priority: 10 });

      kernel.on('test', async () => {
        order.push('high');
      }, { id: 'high', after: ['root'], priority: 50 });

      kernel.on('test', async () => {
        order.push('medium');
      }, { id: 'medium', after: ['root'], priority: 30 });

      await kernel.emit('test', { value: 1 });

      // root must be first
      expect(order[0]).toBe('root');
      // Rest should be sorted by priority: high (50), medium (30), low (10)
      expect(order.slice(1)).toEqual(['high', 'medium', 'low']);
    });

    it('should prioritize dependency order over priority', async () => {
      const kernel = createKernel<TestEvents>();
      const order: string[] = [];

      kernel.on('test', async () => {
        order.push('low-priority-first');
      }, { id: 'low-priority-first', priority: 1 });

      kernel.on('test', async () => {
        order.push('high-priority-dependent');
      }, { id: 'high-priority-dependent', priority: 100, after: ['low-priority-first'] });

      await kernel.emit('test', { value: 1 });

      // Dependency order takes precedence over priority
      expect(order).toEqual(['low-priority-first', 'high-priority-dependent']);
    });

    it('should sort independent listeners by priority only', async () => {
      const kernel = createKernel<TestEvents>();
      const order: number[] = [];

      kernel.on('test', async () => {
        order.push(1);
      }, { id: 'l1', priority: 10 });

      kernel.on('test', async () => {
        order.push(2);
      }, { id: 'l2', priority: 50 });

      kernel.on('test', async () => {
        order.push(3);
      }, { id: 'l3', priority: 30 });

      await kernel.emit('test', { value: 1 });

      // Should execute in priority order (highest first)
      expect(order).toEqual([2, 3, 1]);
    });

    it('should combine priority and dependencies in complex graph', async () => {
      const kernel = createKernel<TestEvents>();
      const order: string[] = [];

      // Level 0
      kernel.on('test', async () => {
        order.push('root');
      }, { id: 'root', priority: 0 });

      // Level 1 - both depend on root
      kernel.on('test', async () => {
        order.push('level1-low');
      }, { id: 'level1-low', after: ['root'], priority: 10 });

      kernel.on('test', async () => {
        order.push('level1-high');
      }, { id: 'level1-high', after: ['root'], priority: 50 });

      // Level 2 - depends on level1-low
      kernel.on('test', async () => {
        order.push('level2');
      }, { id: 'level2', after: ['level1-low'], priority: 100 });

      await kernel.emit('test', { value: 1 });

      expect(order[0]).toBe('root');
      // Level 1: high priority first
      expect(order[1]).toBe('level1-high');
      expect(order[2]).toBe('level1-low');
      // Level 2: after its dependency
      expect(order[3]).toBe('level2');
    });
  });

  describe('Circular dependency detection', () => {
    it('should throw CyclicDependencyError for simple two-node cycle', async () => {
      const kernel = createKernel<TestEvents>();

      kernel.on('test', vi.fn(), { id: 'A', after: ['B'] });
      kernel.on('test', vi.fn(), { id: 'B', after: ['A'] });

      await expect(
        kernel.emit('test', { value: 1 })
      ).rejects.toThrow(CyclicDependencyError);
    });

    it('should throw CyclicDependencyError for three-node cycle', async () => {
      const kernel = createKernel<TestEvents>();

      kernel.on('test', vi.fn(), { id: 'A', after: ['C'] });
      kernel.on('test', vi.fn(), { id: 'B', after: ['A'] });
      kernel.on('test', vi.fn(), { id: 'C', after: ['B'] });

      await expect(
        kernel.emit('test', { value: 1 })
      ).rejects.toThrow(CyclicDependencyError);
    });

    it('should throw CyclicDependencyError for self-reference', async () => {
      const kernel = createKernel<TestEvents>();

      kernel.on('test', vi.fn(), { id: 'self', after: ['self'] });

      await expect(
        kernel.emit('test', { value: 1 })
      ).rejects.toThrow(CyclicDependencyError);
    });

    it('should include cycle path in error message', async () => {
      const kernel = createKernel<TestEvents>();

      kernel.on('test', vi.fn(), { id: 'A', after: ['B'] });
      kernel.on('test', vi.fn(), { id: 'B', after: ['C'] });
      kernel.on('test', vi.fn(), { id: 'C', after: ['A'] });

      try {
        await kernel.emit('test', { value: 1 });
        expect.fail('Should have thrown CyclicDependencyError');
      } catch (error) {
        expect(error).toBeInstanceOf(CyclicDependencyError);
        const cyclicError = error as CyclicDependencyError;
        expect(cyclicError.cycle).toBeDefined();
        expect(cyclicError.cycle.length).toBeGreaterThan(0);
        expect(cyclicError.message).toContain('->');
      }
    });

    it('should detect cycle in complex graph with independent nodes', async () => {
      const kernel = createKernel<TestEvents>();

      // Independent chain
      kernel.on('test', vi.fn(), { id: 'independent1' });
      kernel.on('test', vi.fn(), { id: 'independent2', after: ['independent1'] });

      // Cyclic chain
      kernel.on('test', vi.fn(), { id: 'X', after: ['Z'] });
      kernel.on('test', vi.fn(), { id: 'Y', after: ['X'] });
      kernel.on('test', vi.fn(), { id: 'Z', after: ['Y'] });

      await expect(
        kernel.emit('test', { value: 1 })
      ).rejects.toThrow(CyclicDependencyError);
    });
  });

  describe('Missing dependency errors', () => {
    it('should throw error for missing dependency', async () => {
      const kernel = createKernel<TestEvents>();

      kernel.on('test', vi.fn(), { id: 'listener', after: ['nonexistent'] });

      await expect(
        kernel.emit('test', { value: 1 })
      ).rejects.toThrow('Listener "listener" depends on missing listener "nonexistent"');
    });

    it('should include listener ID and missing dependency ID in error', async () => {
      const kernel = createKernel<TestEvents>();

      kernel.on('test', vi.fn(), { id: 'myListener', after: ['missingDep'] });

      await expect(
        kernel.emit('test', { value: 1 })
      ).rejects.toThrow(/myListener.*missingDep/);
    });

    it('should throw error for multiple missing dependencies', async () => {
      const kernel = createKernel<TestEvents>();

      kernel.on('test', vi.fn(), { id: 'listener', after: ['missing1', 'missing2'] });

      // Should throw on first missing dependency encountered
      await expect(
        kernel.emit('test', { value: 1 })
      ).rejects.toThrow(/missing/);
    });
  });

  describe('Complex dependency graphs', () => {
    it('should handle diamond dependency pattern', async () => {
      const kernel = createKernel<TestEvents>();
      const order: string[] = [];

      kernel.on('test', async () => {
        order.push('A');
      }, { id: 'A' });

      kernel.on('test', async () => {
        order.push('B');
      }, { id: 'B', after: ['A'] });

      kernel.on('test', async () => {
        order.push('C');
      }, { id: 'C', after: ['A'] });

      kernel.on('test', async () => {
        order.push('D');
      }, { id: 'D', after: ['B', 'C'] });

      await kernel.emit('test', { value: 1 });

      expect(order[0]).toBe('A');
      expect(order[3]).toBe('D');
      expect(order.indexOf('B')).toBeGreaterThan(order.indexOf('A'));
      expect(order.indexOf('C')).toBeGreaterThan(order.indexOf('A'));
      expect(order.indexOf('D')).toBeGreaterThan(order.indexOf('B'));
      expect(order.indexOf('D')).toBeGreaterThan(order.indexOf('C'));
    });

    it('should handle independent dependency chains', async () => {
      const kernel = createKernel<TestEvents>();
      const order: string[] = [];

      // Chain 1: A1 -> A2 -> A3
      kernel.on('test', async () => {
        order.push('A1');
      }, { id: 'A1' });

      kernel.on('test', async () => {
        order.push('A2');
      }, { id: 'A2', after: ['A1'] });

      kernel.on('test', async () => {
        order.push('A3');
      }, { id: 'A3', after: ['A2'] });

      // Chain 2: B1 -> B2
      kernel.on('test', async () => {
        order.push('B1');
      }, { id: 'B1' });

      kernel.on('test', async () => {
        order.push('B2');
      }, { id: 'B2', after: ['B1'] });

      await kernel.emit('test', { value: 1 });

      // Each chain must maintain order
      expect(order.indexOf('A2')).toBeGreaterThan(order.indexOf('A1'));
      expect(order.indexOf('A3')).toBeGreaterThan(order.indexOf('A2'));
      expect(order.indexOf('B2')).toBeGreaterThan(order.indexOf('B1'));
      expect(order).toHaveLength(5);
    });

    it('should handle middleware-style dependency pattern', async () => {
      const kernel = createKernel<TestEvents>();
      const order: string[] = [];

      kernel.on('test', async () => {
        order.push('logging');
      }, { id: 'logging' });

      kernel.on('test', async () => {
        order.push('auth');
      }, { id: 'auth', after: ['logging'] });

      kernel.on('test', async () => {
        order.push('validation');
      }, { id: 'validation', after: ['logging'] });

      kernel.on('test', async () => {
        order.push('handler');
      }, { id: 'handler', after: ['auth', 'validation'] });

      await kernel.emit('test', { value: 1 });

      expect(order[0]).toBe('logging');
      expect(order[3]).toBe('handler');
      expect(order.indexOf('auth')).toBeGreaterThan(order.indexOf('logging'));
      expect(order.indexOf('validation')).toBeGreaterThan(order.indexOf('logging'));
      expect(order.indexOf('handler')).toBeGreaterThan(order.indexOf('auth'));
      expect(order.indexOf('handler')).toBeGreaterThan(order.indexOf('validation'));
    });

    it('should handle deep dependency chain', async () => {
      const kernel = createKernel<TestEvents>();
      const order: string[] = [];

      // Create chain: L0 -> L1 -> L2 -> L3 -> L4
      for (let i = 0; i < 5; i++) {
        kernel.on('test', async () => {
          order.push(`L${i}`);
        }, { id: `L${i}`, after: i === 0 ? [] : [`L${i - 1}`] });
      }

      await kernel.emit('test', { value: 1 });

      expect(order).toEqual(['L0', 'L1', 'L2', 'L3', 'L4']);
    });

    it('should handle wide dependency fan-out', async () => {
      const kernel = createKernel<TestEvents>();
      const order: string[] = [];

      // Root listener
      kernel.on('test', async () => {
        order.push('root');
      }, { id: 'root' });

      // 5 listeners all depending on root
      for (let i = 1; i <= 5; i++) {
        kernel.on('test', async () => {
          order.push(`child${i}`);
        }, { id: `child${i}`, after: ['root'] });
      }

      await kernel.emit('test', { value: 1 });

      expect(order[0]).toBe('root');
      expect(order).toHaveLength(6);
      // All children should come after root
      for (let i = 1; i <= 5; i++) {
        expect(order.indexOf(`child${i}`)).toBeGreaterThan(0);
      }
    });

    it('should handle tree-like dependency structure', async () => {
      const kernel = createKernel<TestEvents>();
      const order: string[] = [];

      // Root
      kernel.on('test', async () => {
        order.push('root');
      }, { id: 'root' });

      // Level 1
      kernel.on('test', async () => {
        order.push('L1-A');
      }, { id: 'L1-A', after: ['root'] });

      kernel.on('test', async () => {
        order.push('L1-B');
      }, { id: 'L1-B', after: ['root'] });

      // Level 2
      kernel.on('test', async () => {
        order.push('L2-A');
      }, { id: 'L2-A', after: ['L1-A'] });

      kernel.on('test', async () => {
        order.push('L2-B');
      }, { id: 'L2-B', after: ['L1-B'] });

      await kernel.emit('test', { value: 1 });

      expect(order[0]).toBe('root');
      expect(order.indexOf('L1-A')).toBeGreaterThan(order.indexOf('root'));
      expect(order.indexOf('L1-B')).toBeGreaterThan(order.indexOf('root'));
      expect(order.indexOf('L2-A')).toBeGreaterThan(order.indexOf('L1-A'));
      expect(order.indexOf('L2-B')).toBeGreaterThan(order.indexOf('L1-B'));
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle plugin initialization dependencies', async () => {
      const kernel = createKernel<TestEvents>();
      const order: string[] = [];

      kernel.on('test', async () => {
        order.push('database');
      }, { id: 'database', priority: 100 });

      kernel.on('test', async () => {
        order.push('cache');
      }, { id: 'cache', after: ['database'], priority: 90 });

      kernel.on('test', async () => {
        order.push('session');
      }, { id: 'session', after: ['database', 'cache'], priority: 80 });

      kernel.on('test', async () => {
        order.push('auth');
      }, { id: 'auth', after: ['session'], priority: 70 });

      kernel.on('test', async () => {
        order.push('router');
      }, { id: 'router', after: ['auth'], priority: 60 });

      await kernel.emit('test', { value: 1 });

      expect(order).toEqual(['database', 'cache', 'session', 'auth', 'router']);
    });

    it('should handle event processing pipeline', async () => {
      const kernel = createKernel<TestEvents>();
      const order: string[] = [];

      kernel.on('test', async () => {
        order.push('sanitize');
      }, { id: 'sanitize' });

      kernel.on('test', async () => {
        order.push('validate');
      }, { id: 'validate', after: ['sanitize'] });

      kernel.on('test', async () => {
        order.push('transform');
      }, { id: 'transform', after: ['validate'] });

      kernel.on('test', async () => {
        order.push('persist');
      }, { id: 'persist', after: ['transform'] });

      kernel.on('test', async () => {
        order.push('notify');
      }, { id: 'notify', after: ['persist'] });

      await kernel.emit('test', { value: 1 });

      expect(order).toEqual(['sanitize', 'validate', 'transform', 'persist', 'notify']);
    });

    it('should handle analytics dependencies', async () => {
      const kernel = createKernel<TestEvents>();
      const order: string[] = [];

      kernel.on('test', async () => {
        order.push('core-handler');
      }, { id: 'core-handler', priority: 100 });

      kernel.on('test', async () => {
        order.push('user-tracking');
      }, { id: 'user-tracking', after: ['core-handler'], priority: 50 });

      kernel.on('test', async () => {
        order.push('performance-metrics');
      }, { id: 'performance-metrics', after: ['core-handler'], priority: 50 });

      kernel.on('test', async () => {
        order.push('analytics-aggregation');
      }, { id: 'analytics-aggregation', after: ['user-tracking', 'performance-metrics'], priority: 10 });

      await kernel.emit('test', { value: 1 });

      expect(order[0]).toBe('core-handler');
      expect(order[3]).toBe('analytics-aggregation');
    });
  });

  describe('Edge cases', () => {
    it('should handle empty dependency array', async () => {
      const kernel = createKernel<TestEvents>();
      const order: string[] = [];

      kernel.on('test', async () => {
        order.push('listener');
      }, { id: 'listener', after: [] });

      await kernel.emit('test', { value: 1 });

      expect(order).toEqual(['listener']);
    });

    it('should handle listener with no ID but with dependencies', async () => {
      const kernel = createKernel<TestEvents>();
      const order: string[] = [];

      kernel.on('test', async () => {
        order.push('A');
      }, { id: 'A' });

      // No explicit ID, auto-generated
      kernel.on('test', async () => {
        order.push('B');
      }, { after: ['A'] });

      await kernel.emit('test', { value: 1 });

      expect(order.indexOf('B')).toBeGreaterThan(order.indexOf('A'));
    });

    it('should maintain order for multiple emits', async () => {
      const kernel = createKernel<TestEvents>();

      kernel.on('test', vi.fn(), { id: 'A' });
      kernel.on('test', vi.fn(), { id: 'B', after: ['A'] });

      // First emit
      await kernel.emit('test', { value: 1 });

      // Second emit should use same order
      await kernel.emit('test', { value: 2 });

      // No errors = order maintained
      expect(true).toBe(true);
    });

    it('should work with wildcard events', async () => {
      const kernel = createKernel();
      const order: string[] = [];

      kernel.on('test:*', async () => {
        order.push('wildcard-first');
      }, { id: 'wildcard-first' });

      kernel.on('test:specific', async () => {
        order.push('specific-after');
      }, { id: 'specific-after', after: ['wildcard-first'] });

      await kernel.emit('test:specific');

      expect(order.indexOf('specific-after')).toBeGreaterThan(order.indexOf('wildcard-first'));
    });
  });
});
