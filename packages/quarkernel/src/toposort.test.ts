import { describe, it, expect } from 'vitest';
import { toposort, CyclicDependencyError, type TopoNode } from './toposort';

describe('toposort', () => {
  describe('basic functionality', () => {
    it('sorts nodes with simple dependency chain', () => {
      const nodes: TopoNode[] = [
        { id: 'c', after: ['b'] },
        { id: 'b', after: ['a'] },
        { id: 'a', after: [] }
      ];

      const result = toposort(nodes);

      expect(result).toEqual(['a', 'b', 'c']);
    });

    it('handles nodes with no dependencies', () => {
      const nodes: TopoNode[] = [
        { id: 'a', after: [] },
        { id: 'b', after: [] },
        { id: 'c', after: [] }
      ];

      const result = toposort(nodes);

      // All independent, any order is valid
      expect(result).toHaveLength(3);
      expect(result).toContain('a');
      expect(result).toContain('b');
      expect(result).toContain('c');
    });

    it('handles empty input', () => {
      const result = toposort([]);
      expect(result).toEqual([]);
    });

    it('handles single node', () => {
      const nodes: TopoNode[] = [{ id: 'a', after: [] }];
      const result = toposort(nodes);
      expect(result).toEqual(['a']);
    });
  });

  describe('complex dependencies', () => {
    it('sorts nodes with multiple dependencies', () => {
      const nodes: TopoNode[] = [
        { id: 'd', after: ['b', 'c'] },
        { id: 'c', after: ['a'] },
        { id: 'b', after: ['a'] },
        { id: 'a', after: [] }
      ];

      const result = toposort(nodes);

      expect(result[0]).toBe('a');
      expect(result[3]).toBe('d');
      // b and c can be in any order, but both after a and before d
      expect(result.indexOf('b')).toBeGreaterThan(result.indexOf('a'));
      expect(result.indexOf('c')).toBeGreaterThan(result.indexOf('a'));
      expect(result.indexOf('d')).toBeGreaterThan(result.indexOf('b'));
      expect(result.indexOf('d')).toBeGreaterThan(result.indexOf('c'));
    });

    it('handles diamond dependency pattern', () => {
      const nodes: TopoNode[] = [
        { id: 'a', after: [] },
        { id: 'b', after: ['a'] },
        { id: 'c', after: ['a'] },
        { id: 'd', after: ['b', 'c'] }
      ];

      const result = toposort(nodes);

      expect(result[0]).toBe('a');
      expect(result[3]).toBe('d');
    });

    it('handles partial ordering with independent branches', () => {
      const nodes: TopoNode[] = [
        { id: 'a1', after: [] },
        { id: 'a2', after: ['a1'] },
        { id: 'b1', after: [] },
        { id: 'b2', after: ['b1'] }
      ];

      const result = toposort(nodes);

      // Each branch maintains order
      expect(result.indexOf('a2')).toBeGreaterThan(result.indexOf('a1'));
      expect(result.indexOf('b2')).toBeGreaterThan(result.indexOf('b1'));
      // But branches are independent
      expect(result).toHaveLength(4);
    });
  });

  describe('cycle detection', () => {
    it('detects simple two-node cycle', () => {
      const nodes: TopoNode[] = [
        { id: 'a', after: ['b'] },
        { id: 'b', after: ['a'] }
      ];

      expect(() => toposort(nodes)).toThrow(CyclicDependencyError);
    });

    it('detects three-node cycle', () => {
      const nodes: TopoNode[] = [
        { id: 'a', after: ['c'] },
        { id: 'b', after: ['a'] },
        { id: 'c', after: ['b'] }
      ];

      expect(() => toposort(nodes)).toThrow(CyclicDependencyError);
    });

    it('detects self-reference cycle', () => {
      const nodes: TopoNode[] = [
        { id: 'a', after: ['a'] }
      ];

      expect(() => toposort(nodes)).toThrow(CyclicDependencyError);
    });

    it('provides cycle path in error message', () => {
      const nodes: TopoNode[] = [
        { id: 'a', after: ['b'] },
        { id: 'b', after: ['c'] },
        { id: 'c', after: ['a'] }
      ];

      try {
        toposort(nodes);
        expect.fail('Should have thrown CyclicDependencyError');
      } catch (error) {
        expect(error).toBeInstanceOf(CyclicDependencyError);
        const cyclicError = error as CyclicDependencyError;
        expect(cyclicError.cycle).toBeDefined();
        expect(cyclicError.cycle.length).toBeGreaterThan(0);
        // Cycle should contain at least one of the nodes
        expect(['a', 'b', 'c'].some(id => cyclicError.cycle.includes(id))).toBe(true);
      }
    });

    it('detects cycle in complex graph with independent nodes', () => {
      const nodes: TopoNode[] = [
        { id: 'a', after: [] },
        { id: 'b', after: ['a'] },
        { id: 'x', after: ['z'] },
        { id: 'y', after: ['x'] },
        { id: 'z', after: ['y'] }
      ];

      expect(() => toposort(nodes)).toThrow(CyclicDependencyError);
    });
  });

  describe('edge cases', () => {
    it('handles dependency on non-existent node', () => {
      const nodes: TopoNode[] = [
        { id: 'a', after: ['nonexistent'] },
        { id: 'b', after: ['a'] }
      ];

      const result = toposort(nodes);

      // Should handle gracefully - 'a' depends on phantom node
      // 'a' should come after any dependencies are resolved
      expect(result.indexOf('b')).toBeGreaterThan(result.indexOf('a'));
    });

    it('handles duplicate dependencies', () => {
      const nodes: TopoNode[] = [
        { id: 'b', after: ['a', 'a', 'a'] },
        { id: 'a', after: [] }
      ];

      const result = toposort(nodes);

      expect(result).toEqual(['a', 'b']);
    });

    it('handles long dependency chain', () => {
      const nodes: TopoNode[] = Array.from({ length: 10 }, (_, i) => ({
        id: `node${i}`,
        after: i === 0 ? [] : [`node${i - 1}`]
      }));

      const result = toposort(nodes);

      expect(result).toHaveLength(10);
      expect(result[0]).toBe('node0');
      expect(result[9]).toBe('node9');
      // Verify order
      for (let i = 0; i < 9; i++) {
        expect(result.indexOf(`node${i + 1}`)).toBeGreaterThan(result.indexOf(`node${i}`));
      }
    });

    it('preserves order for nodes at same dependency level', () => {
      const nodes: TopoNode[] = [
        { id: 'a', after: [] },
        { id: 'b', after: [] },
        { id: 'c', after: [] },
        { id: 'd', after: ['a', 'b', 'c'] }
      ];

      const result = toposort(nodes);

      expect(result[3]).toBe('d');
      expect(result.slice(0, 3).sort()).toEqual(['a', 'b', 'c']);
    });
  });

  describe('real-world listener scenarios', () => {
    it('handles listener dependency ordering', () => {
      const listeners: TopoNode[] = [
        { id: 'analytics', after: ['auth', 'db'] },
        { id: 'auth', after: [] },
        { id: 'db', after: ['auth'] },
        { id: 'logger', after: [] }
      ];

      const result = toposort(listeners);

      expect(result.indexOf('auth')).toBeLessThan(result.indexOf('db'));
      expect(result.indexOf('db')).toBeLessThan(result.indexOf('analytics'));
      expect(result.indexOf('auth')).toBeLessThan(result.indexOf('analytics'));
    });

    it('handles middleware-style dependency chain', () => {
      const middleware: TopoNode[] = [
        { id: 'final', after: ['validation', 'auth', 'logging'] },
        { id: 'validation', after: ['logging'] },
        { id: 'auth', after: ['logging'] },
        { id: 'logging', after: [] }
      ];

      const result = toposort(middleware);

      expect(result[0]).toBe('logging');
      expect(result[3]).toBe('final');
    });
  });
});

describe('CyclicDependencyError', () => {
  it('creates error with cycle information', () => {
    const cycle = ['a', 'b', 'c'];
    const error = new CyclicDependencyError(cycle);

    expect(error.name).toBe('CyclicDependencyError');
    expect(error.cycle).toEqual(cycle);
    expect(error.message).toContain('a -> b -> c');
  });

  it('is instanceof Error', () => {
    const error = new CyclicDependencyError(['a', 'b']);
    expect(error instanceof Error).toBe(true);
  });
});
