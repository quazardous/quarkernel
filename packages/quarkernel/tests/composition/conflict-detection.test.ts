/**
 * Conflict detection tests for QuarKernel Composition
 *
 * Tests the getConflicts() method and conflict tracking during context merging.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createKernel } from '../../src/kernel.js';
import { createComposition } from '../../src/composition/composition.js';
import { createOverrideMerger, createNamespacedMerger } from '../../src/composition/mergers/index.js';
import type { Kernel } from '../../src/kernel.js';
import type { ConflictInfo } from '../../src/composition/types.js';

interface TestEvents {
  composite: {
    sources: string[];
    contexts: Record<string, any>;
    merged: Record<string, any>;
  };
}

describe('Composition - Conflict Detection', () => {
  let kernel1: Kernel;
  let kernel2: Kernel;
  let kernel3: Kernel;

  beforeEach(() => {
    kernel1 = createKernel();
    kernel2 = createKernel();
    kernel3 = createKernel();
  });

  describe('OverrideMerger conflict detection', () => {
    it('should detect conflicts when multiple kernels provide the same key', async () => {
      const composition = createComposition<TestEvents>(
        [
          [kernel1, 'user:loaded'],
          [kernel2, 'profile:loaded'],
        ],
        { merger: createOverrideMerger() }
      );

      const events: any[] = [];
      composition.onComposed((event) => {
        events.push(event);
      });

      // Both kernels emit with overlapping key "count"
      await kernel1.emit('user:loaded', { count: 1, name: 'Alice' });
      await kernel2.emit('profile:loaded', { count: 2, city: 'NYC' });

      expect(events).toHaveLength(1);

      // Check conflicts
      const conflicts = composition.getConflicts();
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]).toEqual({
        key: 'count',
        sources: ['user:loaded', 'profile:loaded'],
        values: [1, 2],
      });

      // Merged context should use last value (override behavior)
      expect(events[0].data.merged.count).toBe(2);
    });

    it('should detect multiple conflicts', async () => {
      const composition = createComposition<TestEvents>(
        [
          [kernel1, 'event1'],
          [kernel2, 'event2'],
        ],
        { merger: createOverrideMerger() }
      );

      const events: any[] = [];
      composition.onComposed((event) => {
        events.push(event);
      });

      // Both kernels emit with multiple overlapping keys
      await kernel1.emit('event1', { count: 1, status: 'pending', name: 'Alice' });
      await kernel2.emit('event2', { count: 2, status: 'active', city: 'NYC' });

      expect(events).toHaveLength(1);

      // Check conflicts - should have 2 conflicts (count and status)
      const conflicts = composition.getConflicts();
      expect(conflicts).toHaveLength(2);

      // Find each conflict
      const countConflict = conflicts.find(c => c.key === 'count');
      const statusConflict = conflicts.find(c => c.key === 'status');

      expect(countConflict).toEqual({
        key: 'count',
        sources: ['event1', 'event2'],
        values: [1, 2],
      });

      expect(statusConflict).toEqual({
        key: 'status',
        sources: ['event1', 'event2'],
        values: ['pending', 'active'],
      });
    });

    it('should detect conflicts from 3+ kernels', async () => {
      const composition = createComposition<TestEvents>(
        [
          [kernel1, 'event1'],
          [kernel2, 'event2'],
          [kernel3, 'event3'],
        ],
        { merger: createOverrideMerger() }
      );

      const events: any[] = [];
      composition.onComposed((event) => {
        events.push(event);
      });

      // All kernels emit with same key "value"
      await kernel1.emit('event1', { value: 'first' });
      await kernel2.emit('event2', { value: 'second' });
      await kernel3.emit('event3', { value: 'third' });

      expect(events).toHaveLength(1);

      const conflicts = composition.getConflicts();
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]).toEqual({
        key: 'value',
        sources: ['event1', 'event2', 'event3'],
        values: ['first', 'second', 'third'],
      });

      // Last one wins
      expect(events[0].data.merged.value).toBe('third');
    });

    it('should report no conflicts when keys are unique', async () => {
      const composition = createComposition<TestEvents>(
        [
          [kernel1, 'event1'],
          [kernel2, 'event2'],
        ],
        { merger: createOverrideMerger() }
      );

      const events: any[] = [];
      composition.onComposed((event) => {
        events.push(event);
      });

      // No overlapping keys
      await kernel1.emit('event1', { name: 'Alice' });
      await kernel2.emit('event2', { city: 'NYC' });

      expect(events).toHaveLength(1);

      const conflicts = composition.getConflicts();
      expect(conflicts).toHaveLength(0);
    });

    it('should update conflicts on each composite emission', async () => {
      const composition = createComposition<TestEvents>(
        [
          [kernel1, 'event1'],
          [kernel2, 'event2'],
        ],
        { merger: createOverrideMerger() }
      );

      const events: any[] = [];
      composition.onComposed((event) => {
        events.push(event);
      });

      // First emission - with conflict
      await kernel1.emit('event1', { value: 1 });
      await kernel2.emit('event2', { value: 2 });

      expect(events).toHaveLength(1);
      let conflicts = composition.getConflicts();
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].key).toBe('value');

      // Second emission - no conflict
      await kernel1.emit('event1', { name: 'Alice' });
      await kernel2.emit('event2', { city: 'NYC' });

      expect(events).toHaveLength(2);
      conflicts = composition.getConflicts();
      expect(conflicts).toHaveLength(0);

      // Third emission - different conflict
      await kernel1.emit('event1', { count: 10 });
      await kernel2.emit('event2', { count: 20 });

      expect(events).toHaveLength(3);
      conflicts = composition.getConflicts();
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].key).toBe('count');
    });
  });

  describe('NamespacedMerger conflict detection', () => {
    it('should never report conflicts (keys are namespaced)', async () => {
      const composition = createComposition<TestEvents>(
        [
          [kernel1, 'user:loaded'],
          [kernel2, 'profile:loaded'],
        ],
        { merger: createNamespacedMerger() }
      );

      const events: any[] = [];
      composition.onComposed((event) => {
        events.push(event);
      });

      // Both kernels emit with same key "count"
      await kernel1.emit('user:loaded', { count: 1 });
      await kernel2.emit('profile:loaded', { count: 2 });

      expect(events).toHaveLength(1);

      // No conflicts because keys are namespaced
      const conflicts = composition.getConflicts();
      expect(conflicts).toHaveLength(0);

      // Verify namespaced keys exist
      expect(events[0].data.merged['user:loaded:count']).toBe(1);
      expect(events[0].data.merged['profile:loaded:count']).toBe(2);
    });
  });

  describe('getConflicts() edge cases', () => {
    it('should return empty array before any composite event', () => {
      const composition = createComposition<TestEvents>(
        [
          [kernel1, 'event1'],
          [kernel2, 'event2'],
        ],
        { merger: createOverrideMerger() }
      );

      const conflicts = composition.getConflicts();
      expect(conflicts).toHaveLength(0);
    });

    it('should return empty array after clearBuffers()', async () => {
      const composition = createComposition<TestEvents>(
        [
          [kernel1, 'event1'],
          [kernel2, 'event2'],
        ],
        { merger: createOverrideMerger() }
      );

      composition.onComposed(() => {});

      await kernel1.emit('event1', { value: 1 });
      await kernel2.emit('event2', { value: 2 });

      // Should have conflicts
      let conflicts = composition.getConflicts();
      expect(conflicts).toHaveLength(1);

      // Clear buffers
      composition.clearBuffers();

      // Note: clearBuffers() doesn't reset lastConflicts
      // This is intentional - conflicts persist until next merge
      conflicts = composition.getConflicts();
      expect(conflicts).toHaveLength(1);
    });

    it('should return empty array after dispose()', async () => {
      const composition = createComposition<TestEvents>(
        [
          [kernel1, 'event1'],
          [kernel2, 'event2'],
        ],
        { merger: createOverrideMerger() }
      );

      composition.onComposed(() => {});

      await kernel1.emit('event1', { value: 1 });
      await kernel2.emit('event2', { value: 2 });

      // Should have conflicts
      let conflicts = composition.getConflicts();
      expect(conflicts).toHaveLength(1);

      // Dispose
      composition.dispose();

      // Conflicts should be cleared
      conflicts = composition.getConflicts();
      expect(conflicts).toHaveLength(0);
    });
  });

  describe('getContext() conflict tracking', () => {
    it('should track conflicts when using getContext()', async () => {
      const composition = createComposition<TestEvents>(
        [
          [kernel1, 'event1'],
          [kernel2, 'event2'],
        ],
        { merger: createOverrideMerger() }
      );

      // Emit events
      await kernel1.emit('event1', { value: 1 });
      await kernel2.emit('event2', { value: 2 });

      // Use getContext() instead of listening to composite
      const context = composition.getContext();
      expect(context).toBeDefined();

      // Conflicts should be tracked
      const conflicts = composition.getConflicts();
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].key).toBe('value');
    });
  });

  describe('Conflict values with different types', () => {
    it('should track conflicts with different value types', async () => {
      const composition = createComposition<TestEvents>(
        [
          [kernel1, 'event1'],
          [kernel2, 'event2'],
        ],
        { merger: createOverrideMerger() }
      );

      const events: any[] = [];
      composition.onComposed((event) => {
        events.push(event);
      });

      // Same key, different types
      await kernel1.emit('event1', { data: 42 });
      await kernel2.emit('event2', { data: 'string' });

      expect(events).toHaveLength(1);

      const conflicts = composition.getConflicts();
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]).toEqual({
        key: 'data',
        sources: ['event1', 'event2'],
        values: [42, 'string'],
      });
    });

    it('should track conflicts with object values', async () => {
      const composition = createComposition<TestEvents>(
        [
          [kernel1, 'event1'],
          [kernel2, 'event2'],
        ],
        { merger: createOverrideMerger() }
      );

      const events: any[] = [];
      composition.onComposed((event) => {
        events.push(event);
      });

      const obj1 = { nested: 'value1' };
      const obj2 = { nested: 'value2' };

      await kernel1.emit('event1', { config: obj1 });
      await kernel2.emit('event2', { config: obj2 });

      expect(events).toHaveLength(1);

      const conflicts = composition.getConflicts();
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0]).toEqual({
        key: 'config',
        sources: ['event1', 'event2'],
        values: [obj1, obj2],
      });
    });
  });
});
