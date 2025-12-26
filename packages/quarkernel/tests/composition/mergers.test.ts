/**
 * Tests for ContextMerger implementations
 */

import { describe, it, expect } from 'vitest';
import { createNamespacedMerger, createOverrideMerger } from '../../src/composition/index.js';
import type { EventName } from '../../src/composition/types.js';

describe('NamespacedMerger', () => {
  it('prefixes all keys with event name', () => {
    const merger = createNamespacedMerger();
    const contexts = new Map<EventName, Record<string, any>>([
      ['user:loaded', { count: 1, name: 'Alice' }],
      ['profile:loaded', { count: 2, city: 'NYC' }],
    ]);
    const sources = ['user:loaded', 'profile:loaded'];

    const result = merger.merge(contexts, sources);

    expect(result).toEqual({
      'user:loaded:count': 1,
      'user:loaded:name': 'Alice',
      'profile:loaded:count': 2,
      'profile:loaded:city': 'NYC',
    });
  });

  it('prevents key collisions between events', () => {
    const merger = createNamespacedMerger();
    const contexts = new Map<EventName, Record<string, any>>([
      ['user:loaded', { status: 'active', value: 100 }],
      ['profile:loaded', { status: 'idle', value: 200 }],
      ['settings:loaded', { status: 'pending', value: 300 }],
    ]);
    const sources = ['user:loaded', 'profile:loaded', 'settings:loaded'];

    const result = merger.merge(contexts, sources);

    expect(result).toEqual({
      'user:loaded:status': 'active',
      'user:loaded:value': 100,
      'profile:loaded:status': 'idle',
      'profile:loaded:value': 200,
      'settings:loaded:status': 'pending',
      'settings:loaded:value': 300,
    });
    expect(Object.keys(result)).toHaveLength(6);
  });

  it('handles empty contexts', () => {
    const merger = createNamespacedMerger();
    const contexts = new Map<EventName, Record<string, any>>([
      ['user:loaded', {}],
      ['profile:loaded', { value: 42 }],
    ]);
    const sources = ['user:loaded', 'profile:loaded'];

    const result = merger.merge(contexts, sources);

    expect(result).toEqual({
      'profile:loaded:value': 42,
    });
  });

  it('handles single event context', () => {
    const merger = createNamespacedMerger();
    const contexts = new Map<EventName, Record<string, any>>([['user:loaded', { x: 1, y: 2 }]]);
    const sources = ['user:loaded'];

    const result = merger.merge(contexts, sources);

    expect(result).toEqual({
      'user:loaded:x': 1,
      'user:loaded:y': 2,
    });
  });

  it('preserves complex values', () => {
    const merger = createNamespacedMerger();
    const complexValue = { nested: { deep: 'value' }, array: [1, 2, 3] };
    const contexts = new Map<EventName, Record<string, any>>([['user:loaded', { data: complexValue }]]);
    const sources = ['user:loaded'];

    const result = merger.merge(contexts, sources);

    expect(result).toEqual({
      'user:loaded:data': complexValue,
    });
    expect(result['user:loaded:data']).toBe(complexValue);
  });
});

describe('OverrideMerger', () => {
  it('merges contexts with last-write-wins for duplicate keys', () => {
    const merger = createOverrideMerger();
    const contexts = new Map<EventName, Record<string, any>>([
      ['user:loaded', { count: 1, name: 'Alice' }],
      ['profile:loaded', { count: 2, city: 'NYC' }],
    ]);
    const sources = ['user:loaded', 'profile:loaded'];

    const result = merger.merge(contexts, sources);

    expect(result).toEqual({
      count: 2,
      name: 'Alice',
      city: 'NYC',
    });
  });

  it('respects source order for overrides', () => {
    const merger = createOverrideMerger();
    const contexts = new Map<EventName, Record<string, any>>([
      ['user:loaded', { value: 100 }],
      ['profile:loaded', { value: 200 }],
      ['settings:loaded', { value: 300 }],
    ]);

    const result1 = merger.merge(contexts, ['user:loaded', 'profile:loaded', 'settings:loaded']);
    expect(result1.value).toBe(300);

    const result2 = merger.merge(contexts, ['settings:loaded', 'profile:loaded', 'user:loaded']);
    expect(result2.value).toBe(100);

    const result3 = merger.merge(contexts, ['profile:loaded', 'user:loaded', 'settings:loaded']);
    expect(result3.value).toBe(300);
  });

  it('combines unique keys from all sources', () => {
    const merger = createOverrideMerger();
    const contexts = new Map<EventName, Record<string, any>>([
      ['user:loaded', { a: 1, b: 2 }],
      ['profile:loaded', { c: 3, d: 4 }],
      ['settings:loaded', { e: 5, f: 6 }],
    ]);
    const sources = ['user:loaded', 'profile:loaded', 'settings:loaded'];

    const result = merger.merge(contexts, sources);

    expect(result).toEqual({
      a: 1,
      b: 2,
      c: 3,
      d: 4,
      e: 5,
      f: 6,
    });
  });

  it('handles empty contexts', () => {
    const merger = createOverrideMerger();
    const contexts = new Map<EventName, Record<string, any>>([
      ['user:loaded', {}],
      ['profile:loaded', { value: 42 }],
    ]);
    const sources = ['user:loaded', 'profile:loaded'];

    const result = merger.merge(contexts, sources);

    expect(result).toEqual({ value: 42 });
  });

  it('handles single event context', () => {
    const merger = createOverrideMerger();
    const contexts = new Map<EventName, Record<string, any>>([['user:loaded', { x: 1, y: 2 }]]);
    const sources = ['user:loaded'];

    const result = merger.merge(contexts, sources);

    expect(result).toEqual({ x: 1, y: 2 });
  });

  it('skips events not in sources array', () => {
    const merger = createOverrideMerger();
    const contexts = new Map<EventName, Record<string, any>>([
      ['user:loaded', { value: 1 }],
      ['profile:loaded', { value: 2 }],
      ['settings:loaded', { value: 3 }],
    ]);
    const sources = ['user:loaded', 'settings:loaded'];

    const result = merger.merge(contexts, sources);

    expect(result).toEqual({ value: 3 });
  });

  it('handles missing event names in contexts map', () => {
    const merger = createOverrideMerger();
    const contexts = new Map<EventName, Record<string, any>>([
      ['user:loaded', { value: 1 }],
      ['settings:loaded', { value: 3 }],
    ]);
    const sources = ['user:loaded', 'profile:loaded', 'settings:loaded'];

    const result = merger.merge(contexts, sources);

    expect(result).toEqual({ value: 3 });
  });

  it('preserves reference to complex values', () => {
    const merger = createOverrideMerger();
    const obj1 = { nested: 'value1' };
    const obj2 = { nested: 'value2' };
    const contexts = new Map<EventName, Record<string, any>>([
      ['user:loaded', { data: obj1 }],
      ['profile:loaded', { data: obj2 }],
    ]);
    const sources = ['user:loaded', 'profile:loaded'];

    const result = merger.merge(contexts, sources);

    expect(result.data).toBe(obj2);
  });

  it('demonstrates collision behavior', () => {
    const merger = createOverrideMerger();
    const contexts = new Map<EventName, Record<string, any>>([
      ['temp:reading', { status: 'active', value: 22.5 }],
      ['humidity:reading', { status: 'idle', value: 65 }],
    ]);
    const sources = ['temp:reading', 'humidity:reading'];

    const result = merger.merge(contexts, sources);

    expect(result).toEqual({
      status: 'idle',
      value: 65,
    });
  });
});
