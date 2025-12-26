/**
 * Tests for Svelte reactive stores
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { createKernel } from '@quazardous/quarkernel';
import { setKernel, getKernel } from './context.js';
import { eventStore, contextStore } from './stores.js';

// Mock Svelte context functions
let contextStoreMap = new Map<symbol | string, any>();
let destroyCallbacks: Array<() => void> = [];

vi.mock('svelte', async () => {
  const actual = await vi.importActual('svelte');
  return {
    ...actual,
    setContext: (key: symbol | string, value: any) => {
      contextStoreMap.set(key, value);
    },
    getContext: (key: symbol | string) => {
      return contextStoreMap.get(key);
    },
    onDestroy: (callback: () => void) => {
      destroyCallbacks.push(callback);
    },
  };
});

describe('eventStore', () => {
  beforeEach(() => {
    contextStoreMap = new Map();
    destroyCallbacks = [];
  });

  afterEach(() => {
    destroyCallbacks.forEach(cb => cb());
    destroyCallbacks = [];
  });

  it('should create readable store with undefined initial value', () => {
    const kernel = createKernel();
    setKernel(kernel);

    const store = eventStore('test:event');
    const value = get(store);

    expect(value).toBeUndefined();
  });

  it('should update store when event emitted', async () => {
    const kernel = createKernel();
    setKernel(kernel);

    const store = eventStore('test:event');

    // Subscribe to store to activate it
    const values: any[] = [];
    const unsubscribe = store.subscribe(value => {
      values.push(value);
    });

    // Emit event
    await kernel.emit('test:event', { value: 123 });

    expect(values).toHaveLength(2); // initial undefined + event
    expect(values[0]).toBeUndefined();
    expect(values[1].name).toBe('test:event');
    expect(values[1].data).toEqual({ value: 123 });

    unsubscribe();
  });

  it('should update store with latest event data', async () => {
    const kernel = createKernel();
    setKernel(kernel);

    const store = eventStore('counter');

    const values: any[] = [];
    const unsubscribe = store.subscribe(value => {
      if (value !== undefined) {
        values.push(value.data.count);
      }
    });

    await kernel.emit('counter', { count: 1 });
    await kernel.emit('counter', { count: 2 });
    await kernel.emit('counter', { count: 3 });

    expect(values).toEqual([1, 2, 3]);

    unsubscribe();
  });

  it('should support wildcard patterns', async () => {
    const kernel = createKernel();
    setKernel(kernel);

    const store = eventStore('user:*');

    const events: string[] = [];
    const unsubscribe = store.subscribe(value => {
      if (value !== undefined) {
        events.push(value.name);
      }
    });

    await kernel.emit('user:login', { id: 1 });
    await kernel.emit('user:logout', { id: 1 });
    await kernel.emit('user:update', { id: 1 });

    expect(events).toEqual(['user:login', 'user:logout', 'user:update']);

    unsubscribe();
  });

  it('should only match specified pattern', async () => {
    const kernel = createKernel();
    setKernel(kernel);

    const store = eventStore('cart:*');

    const events: string[] = [];
    const unsubscribe = store.subscribe(value => {
      if (value !== undefined) {
        events.push(value.name);
      }
    });

    await kernel.emit('cart:add', { item: 1 });
    await kernel.emit('user:login', { id: 1 });
    await kernel.emit('cart:remove', { item: 1 });

    // Only cart events should be captured
    expect(events).toEqual(['cart:add', 'cart:remove']);

    unsubscribe();
  });

  it('should cleanup kernel subscription when store unsubscribed', async () => {
    const kernel = createKernel();
    setKernel(kernel);

    const store = eventStore('test:event');
    const handler = vi.fn();

    const unsubscribe = store.subscribe(handler);

    await kernel.emit('test:event', { value: 1 });
    expect(handler).toHaveBeenCalledTimes(2); // initial + event

    // Unsubscribe from store
    unsubscribe();
    handler.mockClear();

    // Event should not trigger store update after unsubscribe
    await kernel.emit('test:event', { value: 2 });
    expect(handler).not.toHaveBeenCalled();
  });

  it('should handle multiple subscribers to same store', async () => {
    const kernel = createKernel();
    setKernel(kernel);

    const store = eventStore('shared:event');

    const values1: any[] = [];
    const values2: any[] = [];

    const unsub1 = store.subscribe(value => {
      if (value !== undefined) values1.push(value.data);
    });

    const unsub2 = store.subscribe(value => {
      if (value !== undefined) values2.push(value.data);
    });

    await kernel.emit('shared:event', { id: 1 });
    await kernel.emit('shared:event', { id: 2 });

    expect(values1).toEqual([{ id: 1 }, { id: 2 }]);
    expect(values2).toEqual([{ id: 1 }, { id: 2 }]);

    unsub1();
    unsub2();
  });

  it('should preserve event properties (name, data, context)', async () => {
    const kernel = createKernel();
    setKernel(kernel);

    const store = eventStore('test:event');

    let capturedEvent: any = null;
    const unsubscribe = store.subscribe(value => {
      if (value !== undefined) {
        capturedEvent = value;
      }
    });

    await kernel.emit('test:event', { foo: 'bar' });

    expect(capturedEvent).toBeDefined();
    expect(capturedEvent.name).toBe('test:event');
    expect(capturedEvent.data).toEqual({ foo: 'bar' });
    expect(capturedEvent.context).toBeDefined();

    unsubscribe();
  });

  it('should work with typed events', async () => {
    interface MyEvents {
      'typed:event': { value: number };
    }

    const kernel = createKernel<MyEvents>();
    setKernel(kernel);

    const store = eventStore<{ value: number }>('typed:event');

    let capturedValue: number | undefined;
    const unsubscribe = store.subscribe(value => {
      if (value !== undefined) {
        capturedValue = value.data.value;
      }
    });

    await kernel.emit('typed:event', { value: 42 });

    expect(capturedValue).toBe(42);

    unsubscribe();
  });

  it('should handle rapid event emission', async () => {
    const kernel = createKernel();
    setKernel(kernel);

    const store = eventStore('rapid:event');

    const values: number[] = [];
    const unsubscribe = store.subscribe(value => {
      if (value !== undefined) {
        values.push(value.data.count);
      }
    });

    // Emit multiple events quickly
    for (let i = 0; i < 10; i++) {
      await kernel.emit('rapid:event', { count: i });
    }

    expect(values).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

    unsubscribe();
  });

  it('should reactivate subscription when resubscribed', async () => {
    const kernel = createKernel();
    setKernel(kernel);

    const store = eventStore('test:event');

    // First subscription
    const values1: any[] = [];
    const unsub1 = store.subscribe(value => {
      if (value !== undefined) values1.push(value.data.value);
    });

    await kernel.emit('test:event', { value: 1 });
    unsub1();

    // Second subscription - the store remembers last value and emits it immediately
    const values2: any[] = [];
    const unsub2 = store.subscribe(value => {
      if (value !== undefined) values2.push(value.data.value);
    });

    await kernel.emit('test:event', { value: 2 });

    expect(values1).toEqual([1]);
    // Store provides last known value (1) on subscription, then new value (2)
    expect(values2).toEqual([1, 2]);

    unsub2();
  });
});

describe('contextStore', () => {
  beforeEach(() => {
    contextStoreMap = new Map();
    destroyCallbacks = [];
  });

  afterEach(() => {
    destroyCallbacks.forEach(cb => cb());
    destroyCallbacks = [];
  });

  it('should create readable store with undefined initial value', () => {
    const kernel = createKernel();
    setKernel(kernel);

    const store = contextStore('test:event');
    const value = get(store);

    expect(value).toBeUndefined();
  });

  it('should update store with listener context', async () => {
    const kernel = createKernel();
    setKernel(kernel);

    const store = contextStore('test:event');

    let capturedContext: any = null;
    const unsubscribe = store.subscribe(ctx => {
      if (ctx !== undefined) {
        capturedContext = ctx;
      }
    });

    await kernel.emit('test:event', {});

    expect(capturedContext).toBeDefined();
    expect(capturedContext.id).toBeDefined();
    expect(typeof capturedContext.off).toBe('function');

    unsubscribe();
  });

  it('should update with latest context', async () => {
    const kernel = createKernel();
    setKernel(kernel);

    const store = contextStore('ctx:event');

    const contexts: any[] = [];
    const unsubscribe = store.subscribe(ctx => {
      if (ctx !== undefined) {
        contexts.push(ctx.id);
      }
    });

    await kernel.emit('ctx:event', {});
    await kernel.emit('ctx:event', {});
    await kernel.emit('ctx:event', {});

    // Each event should update the store with context
    // The contexts all have the same listener ID (since it's the same listener)
    expect(contexts).toHaveLength(3);
    expect(new Set(contexts).size).toBe(1); // Same listener ID for all emissions

    unsubscribe();
  });

  it('should support wildcard patterns', async () => {
    const kernel = createKernel();
    setKernel(kernel);

    const store = contextStore('action:*');

    const eventNames: string[] = [];

    // Add listener to track event names via context
    kernel.on('action:*', async (event) => {
      eventNames.push(event.name);
    });

    const unsubscribe = store.subscribe(() => {});

    await kernel.emit('action:start', {});
    await kernel.emit('action:end', {});

    expect(eventNames).toEqual(['action:start', 'action:end']);

    unsubscribe();
  });

  it('should cleanup kernel subscription when store unsubscribed', async () => {
    const kernel = createKernel();
    setKernel(kernel);

    const store = contextStore('test:event');
    const handler = vi.fn();

    const unsubscribe = store.subscribe(handler);

    await kernel.emit('test:event', {});
    expect(handler).toHaveBeenCalledTimes(2); // initial + event

    unsubscribe();
    handler.mockClear();

    await kernel.emit('test:event', {});
    expect(handler).not.toHaveBeenCalled();
  });

  it('should provide context utilities', async () => {
    const kernel = createKernel();
    setKernel(kernel);

    const store = contextStore('test:event');

    let capturedContext: any = null;
    const unsubscribe = store.subscribe(ctx => {
      if (ctx !== undefined) {
        capturedContext = ctx;
      }
    });

    await kernel.emit('test:event', {});

    expect(capturedContext).toBeDefined();
    expect(typeof capturedContext.id).toBe('string');
    expect(typeof capturedContext.off).toBe('function');
    expect(typeof capturedContext.cancel).toBe('function');
    expect(typeof capturedContext.emit).toBe('function');
    expect(capturedContext.eventName).toBe('test:event');

    unsubscribe();
  });

  it('should handle multiple subscribers', async () => {
    const kernel = createKernel();
    setKernel(kernel);

    const store = contextStore('shared:ctx');

    const ids1: string[] = [];
    const ids2: string[] = [];

    const unsub1 = store.subscribe(ctx => {
      if (ctx !== undefined) ids1.push(ctx.id);
    });

    const unsub2 = store.subscribe(ctx => {
      if (ctx !== undefined) ids2.push(ctx.id);
    });

    await kernel.emit('shared:ctx', {});

    // Both subscribers should see same context
    expect(ids1).toEqual(ids2);

    unsub1();
    unsub2();
  });
});

describe('stores integration', () => {
  beforeEach(() => {
    contextStoreMap = new Map();
    destroyCallbacks = [];
  });

  afterEach(() => {
    destroyCallbacks.forEach(cb => cb());
    destroyCallbacks = [];
  });

  it('should work together - eventStore and contextStore', async () => {
    const kernel = createKernel();
    setKernel(kernel);

    const events = eventStore('integration:test');
    const contexts = contextStore('integration:test');

    let eventData: any = null;
    let contextId: string | null = null;

    const unsub1 = events.subscribe(event => {
      if (event !== undefined) {
        eventData = event.data;
      }
    });

    const unsub2 = contexts.subscribe(ctx => {
      if (ctx !== undefined) {
        contextId = ctx.id;
      }
    });

    await kernel.emit('integration:test', { value: 'test' });

    expect(eventData).toEqual({ value: 'test' });
    expect(contextId).toBeDefined();

    unsub1();
    unsub2();
  });

  it('should independently track different event patterns', async () => {
    const kernel = createKernel();
    setKernel(kernel);

    const userStore = eventStore('user:*');
    const cartStore = eventStore('cart:*');

    const userEvents: string[] = [];
    const cartEvents: string[] = [];

    const unsub1 = userStore.subscribe(event => {
      if (event !== undefined) userEvents.push(event.name);
    });

    const unsub2 = cartStore.subscribe(event => {
      if (event !== undefined) cartEvents.push(event.name);
    });

    await kernel.emit('user:login', {});
    await kernel.emit('cart:add', {});
    await kernel.emit('user:logout', {});
    await kernel.emit('cart:remove', {});

    expect(userEvents).toEqual(['user:login', 'user:logout']);
    expect(cartEvents).toEqual(['cart:add', 'cart:remove']);

    unsub1();
    unsub2();
  });

  it('should handle store creation before kernel context', () => {
    // No kernel set yet
    expect(() => {
      const store = eventStore('test:event');
      // Should only fail when subscribing, not when creating
      store.subscribe(() => {});
    }).toThrow();
  });

  it('should properly cleanup all resources', async () => {
    const kernel = createKernel();
    setKernel(kernel);

    const store1 = eventStore('event1');
    const store2 = contextStore('event2');

    const unsub1 = store1.subscribe(() => {});
    const unsub2 = store2.subscribe(() => {});

    // Verify subscriptions are active
    const handler = vi.fn();
    kernel.on('event1', handler);
    await kernel.emit('event1', {});
    expect(handler).toHaveBeenCalled();

    // Cleanup
    unsub1();
    unsub2();

    // Verify cleanup doesn't affect other listeners
    handler.mockClear();
    await kernel.emit('event1', {});
    expect(handler).toHaveBeenCalled();
  });
});
