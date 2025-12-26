/**
 * Comprehensive tests for topological sort algorithm (T127)
 *
 * Tests Kahn's algorithm implementation for dependency resolution:
 * - Basic topological sorting
 * - Cycle detection
 * - Edge cases and graph patterns
 * - Algorithm correctness
 */

import { describe, it, expect } from 'vitest';
import { toposort, CyclicDependencyError, type TopoNode } from '../src/toposort.js';

describe('Topological Sort Algorithm', () => {
  describe('Algorithm correctness', () => {
    it('should sort simple linear chain A->B->C', () => {
      const nodes: TopoNode[] = [
        { id: 'C', after: ['B'] },
        { id: 'B', after: ['A'] },
        { id: 'A', after: [] }
      ];

      const result = toposort(nodes);

      expect(result).toEqual(['A', 'B', 'C']);
    });

    it('should handle reverse input order', () => {
      const nodes: TopoNode[] = [
        { id: 'A', after: [] },
        { id: 'B', after: ['A'] },
        { id: 'C', after: ['B'] }
      ];

      const result = toposort(nodes);

      expect(result).toEqual(['A', 'B', 'C']);
    });

    it('should handle shuffled input order', () => {
      const nodes: TopoNode[] = [
        { id: 'B', after: ['A'] },
        { id: 'C', after: ['B'] },
        { id: 'A', after: [] }
      ];

      const result = toposort(nodes);

      expect(result).toEqual(['A', 'B', 'C']);
    });

    it('should handle nodes with no dependencies', () => {
      const nodes: TopoNode[] = [
        { id: 'A', after: [] },
        { id: 'B', after: [] },
        { id: 'C', after: [] }
      ];

      const result = toposort(nodes);

      expect(result).toHaveLength(3);
      expect(result).toContain('A');
      expect(result).toContain('B');
      expect(result).toContain('C');
    });

    it('should handle empty input', () => {
      const result = toposort([]);
      expect(result).toEqual([]);
    });

    it('should handle single node', () => {
      const nodes: TopoNode[] = [{ id: 'A', after: [] }];
      const result = toposort(nodes);
      expect(result).toEqual(['A']);
    });

    it('should handle single node with self-dependencies gracefully in error', () => {
      const nodes: TopoNode[] = [{ id: 'A', after: ['A'] }];
      expect(() => toposort(nodes)).toThrow(CyclicDependencyError);
    });
  });

  describe('Multiple dependencies', () => {
    it('should sort with multiple dependencies', () => {
      const nodes: TopoNode[] = [
        { id: 'D', after: ['B', 'C'] },
        { id: 'C', after: ['A'] },
        { id: 'B', after: ['A'] },
        { id: 'A', after: [] }
      ];

      const result = toposort(nodes);

      expect(result[0]).toBe('A');
      expect(result[3]).toBe('D');
      // B and C can be in any order
      expect(result.indexOf('B')).toBeGreaterThan(result.indexOf('A'));
      expect(result.indexOf('C')).toBeGreaterThan(result.indexOf('A'));
      expect(result.indexOf('D')).toBeGreaterThan(result.indexOf('B'));
      expect(result.indexOf('D')).toBeGreaterThan(result.indexOf('C'));
    });

    it('should handle node depending on all others', () => {
      const nodes: TopoNode[] = [
        { id: 'A', after: [] },
        { id: 'B', after: [] },
        { id: 'C', after: [] },
        { id: 'final', after: ['A', 'B', 'C'] }
      ];

      const result = toposort(nodes);

      expect(result[3]).toBe('final');
      expect(result.slice(0, 3).sort()).toEqual(['A', 'B', 'C']);
    });

    it('should handle duplicate dependencies', () => {
      const nodes: TopoNode[] = [
        { id: 'B', after: ['A', 'A', 'A'] },
        { id: 'A', after: [] }
      ];

      const result = toposort(nodes);

      expect(result).toEqual(['A', 'B']);
    });
  });

  describe('Diamond dependency pattern', () => {
    it('should handle classic diamond pattern', () => {
      const nodes: TopoNode[] = [
        { id: 'A', after: [] },
        { id: 'B', after: ['A'] },
        { id: 'C', after: ['A'] },
        { id: 'D', after: ['B', 'C'] }
      ];

      const result = toposort(nodes);

      expect(result[0]).toBe('A');
      expect(result[3]).toBe('D');
      // B and C in middle
      expect([1, 2]).toContain(result.indexOf('B'));
      expect([1, 2]).toContain(result.indexOf('C'));
    });

    it('should handle nested diamond pattern', () => {
      const nodes: TopoNode[] = [
        { id: 'root', after: [] },
        { id: 'L1-A', after: ['root'] },
        { id: 'L1-B', after: ['root'] },
        { id: 'L2-A', after: ['L1-A', 'L1-B'] },
        { id: 'L2-B', after: ['L1-A', 'L1-B'] },
        { id: 'final', after: ['L2-A', 'L2-B'] }
      ];

      const result = toposort(nodes);

      expect(result[0]).toBe('root');
      expect(result[5]).toBe('final');
      expect(result.indexOf('L1-A')).toBeGreaterThan(result.indexOf('root'));
      expect(result.indexOf('L1-B')).toBeGreaterThan(result.indexOf('root'));
      expect(result.indexOf('L2-A')).toBeGreaterThan(result.indexOf('L1-A'));
      expect(result.indexOf('L2-B')).toBeGreaterThan(result.indexOf('L1-B'));
      expect(result.indexOf('final')).toBeGreaterThan(result.indexOf('L2-A'));
      expect(result.indexOf('final')).toBeGreaterThan(result.indexOf('L2-B'));
    });
  });

  describe('Independent chains', () => {
    it('should handle two independent chains', () => {
      const nodes: TopoNode[] = [
        { id: 'A1', after: [] },
        { id: 'A2', after: ['A1'] },
        { id: 'B1', after: [] },
        { id: 'B2', after: ['B1'] }
      ];

      const result = toposort(nodes);

      expect(result.indexOf('A2')).toBeGreaterThan(result.indexOf('A1'));
      expect(result.indexOf('B2')).toBeGreaterThan(result.indexOf('B1'));
      expect(result).toHaveLength(4);
    });

    it('should handle multiple independent chains', () => {
      const nodes: TopoNode[] = [
        { id: 'A1', after: [] },
        { id: 'A2', after: ['A1'] },
        { id: 'A3', after: ['A2'] },
        { id: 'B1', after: [] },
        { id: 'B2', after: ['B1'] },
        { id: 'C1', after: [] }
      ];

      const result = toposort(nodes);

      expect(result.indexOf('A2')).toBeGreaterThan(result.indexOf('A1'));
      expect(result.indexOf('A3')).toBeGreaterThan(result.indexOf('A2'));
      expect(result.indexOf('B2')).toBeGreaterThan(result.indexOf('B1'));
      expect(result).toHaveLength(6);
    });

    it('should handle chains that merge', () => {
      const nodes: TopoNode[] = [
        { id: 'A1', after: [] },
        { id: 'A2', after: ['A1'] },
        { id: 'B1', after: [] },
        { id: 'B2', after: ['B1'] },
        { id: 'merge', after: ['A2', 'B2'] }
      ];

      const result = toposort(nodes);

      expect(result[4]).toBe('merge');
      expect(result.indexOf('A2')).toBeGreaterThan(result.indexOf('A1'));
      expect(result.indexOf('B2')).toBeGreaterThan(result.indexOf('B1'));
      expect(result.indexOf('merge')).toBeGreaterThan(result.indexOf('A2'));
      expect(result.indexOf('merge')).toBeGreaterThan(result.indexOf('B2'));
    });
  });

  describe('Cycle detection', () => {
    it('should detect simple two-node cycle', () => {
      const nodes: TopoNode[] = [
        { id: 'A', after: ['B'] },
        { id: 'B', after: ['A'] }
      ];

      expect(() => toposort(nodes)).toThrow(CyclicDependencyError);
    });

    it('should detect three-node cycle', () => {
      const nodes: TopoNode[] = [
        { id: 'A', after: ['C'] },
        { id: 'B', after: ['A'] },
        { id: 'C', after: ['B'] }
      ];

      expect(() => toposort(nodes)).toThrow(CyclicDependencyError);
    });

    it('should detect self-reference cycle', () => {
      const nodes: TopoNode[] = [
        { id: 'A', after: ['A'] }
      ];

      expect(() => toposort(nodes)).toThrow(CyclicDependencyError);
    });

    it('should provide cycle path in error', () => {
      const nodes: TopoNode[] = [
        { id: 'A', after: ['B'] },
        { id: 'B', after: ['C'] },
        { id: 'C', after: ['A'] }
      ];

      try {
        toposort(nodes);
        expect.fail('Should have thrown CyclicDependencyError');
      } catch (error) {
        expect(error).toBeInstanceOf(CyclicDependencyError);
        const cyclicError = error as CyclicDependencyError;
        expect(cyclicError.cycle).toBeDefined();
        expect(cyclicError.cycle.length).toBeGreaterThan(0);
        expect(['A', 'B', 'C'].some(id => cyclicError.cycle.includes(id))).toBe(true);
      }
    });

    it('should detect cycle in larger graph', () => {
      const nodes: TopoNode[] = [
        { id: 'A', after: ['B'] },
        { id: 'B', after: ['C'] },
        { id: 'C', after: ['D'] },
        { id: 'D', after: ['E'] },
        { id: 'E', after: ['A'] }
      ];

      expect(() => toposort(nodes)).toThrow(CyclicDependencyError);
    });

    it('should detect cycle with independent nodes present', () => {
      const nodes: TopoNode[] = [
        { id: 'independent1', after: [] },
        { id: 'independent2', after: ['independent1'] },
        { id: 'X', after: ['Z'] },
        { id: 'Y', after: ['X'] },
        { id: 'Z', after: ['Y'] }
      ];

      expect(() => toposort(nodes)).toThrow(CyclicDependencyError);
    });

    it('should detect indirect cycle', () => {
      const nodes: TopoNode[] = [
        { id: 'A', after: ['B'] },
        { id: 'B', after: ['C'] },
        { id: 'C', after: ['D'] },
        { id: 'D', after: ['B'] }
      ];

      expect(() => toposort(nodes)).toThrow(CyclicDependencyError);
    });
  });

  describe('Edge cases', () => {
    it('should handle dependency on non-existent node', () => {
      const nodes: TopoNode[] = [
        { id: 'A', after: ['phantom'] },
        { id: 'B', after: ['A'] }
      ];

      const result = toposort(nodes);

      expect(result.indexOf('B')).toBeGreaterThan(result.indexOf('A'));
    });

    it('should handle long linear chain', () => {
      const nodes: TopoNode[] = Array.from({ length: 10 }, (_, i) => ({
        id: `node${i}`,
        after: i === 0 ? [] : [`node${i - 1}`]
      }));

      const result = toposort(nodes);

      expect(result).toHaveLength(10);
      expect(result[0]).toBe('node0');
      expect(result[9]).toBe('node9');
      for (let i = 0; i < 9; i++) {
        expect(result.indexOf(`node${i + 1}`)).toBeGreaterThan(result.indexOf(`node${i}`));
      }
    });

    it('should handle very long chain without stack overflow', () => {
      const nodes: TopoNode[] = Array.from({ length: 1000 }, (_, i) => ({
        id: `node${i}`,
        after: i === 0 ? [] : [`node${i - 1}`]
      }));

      const result = toposort(nodes);

      expect(result).toHaveLength(1000);
      expect(result[0]).toBe('node0');
      expect(result[999]).toBe('node999');
    });

    it('should handle wide fan-out', () => {
      const nodes: TopoNode[] = [
        { id: 'root', after: [] },
        ...Array.from({ length: 50 }, (_, i) => ({
          id: `child${i}`,
          after: ['root']
        }))
      ];

      const result = toposort(nodes);

      expect(result[0]).toBe('root');
      expect(result).toHaveLength(51);
    });

    it('should handle complex web structure', () => {
      const nodes: TopoNode[] = [
        { id: 'A', after: [] },
        { id: 'B', after: [] },
        { id: 'C', after: ['A', 'B'] },
        { id: 'D', after: ['A'] },
        { id: 'E', after: ['B'] },
        { id: 'F', after: ['C', 'D', 'E'] }
      ];

      const result = toposort(nodes);

      expect(result[5]).toBe('F');
      expect(result.indexOf('C')).toBeGreaterThan(result.indexOf('A'));
      expect(result.indexOf('C')).toBeGreaterThan(result.indexOf('B'));
      expect(result.indexOf('D')).toBeGreaterThan(result.indexOf('A'));
      expect(result.indexOf('E')).toBeGreaterThan(result.indexOf('B'));
      expect(result.indexOf('F')).toBeGreaterThan(result.indexOf('C'));
      expect(result.indexOf('F')).toBeGreaterThan(result.indexOf('D'));
      expect(result.indexOf('F')).toBeGreaterThan(result.indexOf('E'));
    });

    it('should preserve order for nodes at same level', () => {
      const nodes: TopoNode[] = [
        { id: 'A', after: [] },
        { id: 'B', after: [] },
        { id: 'C', after: [] },
        { id: 'D', after: ['A', 'B', 'C'] }
      ];

      const result = toposort(nodes);

      expect(result[3]).toBe('D');
      expect(result.slice(0, 3).sort()).toEqual(['A', 'B', 'C']);
    });

    it('should handle empty after array', () => {
      const nodes: TopoNode[] = [
        { id: 'A', after: [] },
        { id: 'B', after: [] }
      ];

      const result = toposort(nodes);

      expect(result).toHaveLength(2);
      expect(result).toContain('A');
      expect(result).toContain('B');
    });

    it('should handle mixed empty and non-empty dependencies', () => {
      const nodes: TopoNode[] = [
        { id: 'A', after: [] },
        { id: 'B', after: ['A'] },
        { id: 'C', after: [] },
        { id: 'D', after: ['C'] }
      ];

      const result = toposort(nodes);

      expect(result.indexOf('B')).toBeGreaterThan(result.indexOf('A'));
      expect(result.indexOf('D')).toBeGreaterThan(result.indexOf('C'));
      expect(result).toHaveLength(4);
    });
  });

  describe('Real-world patterns', () => {
    it('should handle plugin dependency graph', () => {
      const plugins: TopoNode[] = [
        { id: 'core', after: [] },
        { id: 'db', after: ['core'] },
        { id: 'cache', after: ['core'] },
        { id: 'auth', after: ['db', 'cache'] },
        { id: 'api', after: ['auth'] },
        { id: 'admin', after: ['auth'] }
      ];

      const result = toposort(plugins);

      expect(result[0]).toBe('core');
      expect(result.indexOf('db')).toBeGreaterThan(result.indexOf('core'));
      expect(result.indexOf('cache')).toBeGreaterThan(result.indexOf('core'));
      expect(result.indexOf('auth')).toBeGreaterThan(result.indexOf('db'));
      expect(result.indexOf('auth')).toBeGreaterThan(result.indexOf('cache'));
    });

    it('should handle build system dependencies', () => {
      const tasks: TopoNode[] = [
        { id: 'clean', after: [] },
        { id: 'compile-ts', after: ['clean'] },
        { id: 'compile-css', after: ['clean'] },
        { id: 'bundle-js', after: ['compile-ts'] },
        { id: 'bundle-css', after: ['compile-css'] },
        { id: 'minify', after: ['bundle-js', 'bundle-css'] },
        { id: 'deploy', after: ['minify'] }
      ];

      const result = toposort(tasks);

      expect(result[0]).toBe('clean');
      expect(result[6]).toBe('deploy');
    });

    it('should handle middleware chain', () => {
      const middleware: TopoNode[] = [
        { id: 'logger', after: [] },
        { id: 'cors', after: ['logger'] },
        { id: 'auth', after: ['cors'] },
        { id: 'validation', after: ['auth'] },
        { id: 'handler', after: ['validation'] },
        { id: 'error-handler', after: ['handler'] }
      ];

      const result = toposort(middleware);

      expect(result).toEqual([
        'logger',
        'cors',
        'auth',
        'validation',
        'handler',
        'error-handler'
      ]);
    });
  });

  describe('CyclicDependencyError', () => {
    it('should create error with cycle information', () => {
      const cycle = ['A', 'B', 'C'];
      const error = new CyclicDependencyError(cycle);

      expect(error.name).toBe('CyclicDependencyError');
      expect(error.cycle).toEqual(cycle);
      expect(error.message).toContain('A -> B -> C');
    });

    it('should be instance of Error', () => {
      const error = new CyclicDependencyError(['A', 'B']);
      expect(error instanceof Error).toBe(true);
    });

    it('should format cycle path correctly', () => {
      const error = new CyclicDependencyError(['node1', 'node2', 'node3']);
      expect(error.message).toBe('Cyclic dependency detected: node1 -> node2 -> node3');
    });

    it('should handle single node cycle', () => {
      const error = new CyclicDependencyError(['self']);
      expect(error.message).toBe('Cyclic dependency detected: self');
    });
  });
});
