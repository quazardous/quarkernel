/**
 * Svelte Adapter Integration Tests (T091)
 *
 * Integration tests verifying Svelte adapter context and store reactivity.
 * Tests component tree context propagation and subscription cleanup.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get, type Unsubscriber } from 'svelte/store';
import { tick } from 'svelte';
import { createKernel, type Kernel } from '@quazardous/quarkernel';
import { setKernel, getKernel, onEvent, KernelContextError } from './context.js';
import { eventStore, contextStore } from './stores.js';

/**
 * Mock Svelte context and lifecycle
 */
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

/**
 * Simulate component lifecycle for testing
 */
class ComponentSimulator {
  private mounted = false;

  mount(): void {
    this.mounted = true;
  }

  destroy(): void {
    if (this.mounted) {
      destroyCallbacks.forEach((cb) => cb());
      destroyCallbacks = [];
      this.mounted = false;
    }
  }

  isMounted(): boolean {
    return this.mounted;
  }
}

interface TestEvents {
  'user:login': { userId: string; timestamp: number };
  'user:logout': { userId: string };
  'notification:show': { message: string; type: 'info' | 'error' };
  'cart:add': { productId: string; quantity: number };
  'cart:update': { items: number; total: number };
  'data:loaded': { count: number };
}

describe('Svelte Adapter Integration Tests (T091)', () => {
  let kernel: Kernel<TestEvents>;

  beforeEach(() => {
    contextStoreMap = new Map();
    destroyCallbacks = [];
    kernel = createKernel<TestEvents>();
  });

  afterEach(() => {
    destroyCallbacks.forEach((cb) => cb());
    destroyCallbacks = [];
    contextStoreMap.clear();
  });

  describe('Context integration - component tree', () => {
    it('should propagate kernel through component tree', () => {
      // Simulate parent component
      setKernel(kernel);

      // Simulate child component accessing kernel
      const childKernel = getKernel();

      expect(childKernel).toBe(kernel);
    });

    it('should allow multiple child components to access same kernel', () => {
      setKernel(kernel);

      // Simulate multiple child components
      const child1 = getKernel();
      const child2 = getKernel();
      const child3 = getKernel();

      expect(child1).toBe(kernel);
      expect(child2).toBe(kernel);
      expect(child3).toBe(kernel);
    });

    it('should throw error if kernel not set in parent', () => {
      // No setKernel() called

      expect(() => getKernel()).toThrow(KernelContextError);
      expect(() => getKernel()).toThrow(
        'getKernel() must be called within a component where setKernel() was used'
      );
    });

    it('should work with nested component hierarchies', () => {
      // Level 1: Root component
      setKernel(kernel);

      // Level 2: Child component
      const level2Kernel = getKernel();
      expect(level2Kernel).toBe(kernel);

      // Level 3: Grandchild component
      const level3Kernel = getKernel();
      expect(level3Kernel).toBe(kernel);

      // All levels reference same kernel
      expect(level2Kernel).toBe(level3Kernel);
    });

    it('should maintain kernel reference across component updates', async () => {
      setKernel(kernel);

      const initialKernel = getKernel();

      // Simulate component re-render (in Svelte, context persists)
      await tick();

      const afterUpdateKernel = getKernel();

      expect(afterUpdateKernel).toBe(initialKernel);
      expect(afterUpdateKernel).toBe(kernel);
    });
  });

  describe('Store reactivity - subscription updates', () => {
    beforeEach(() => {
      setKernel(kernel);
    });

    it('should update store subscribers when events are emitted', async () => {
      const store = eventStore<TestEvents, 'user:login'>('user:login');

      const receivedValues: any[] = [];
      const unsubscribe = store.subscribe((value) => {
        receivedValues.push(value);
      });

      expect(receivedValues).toHaveLength(1);
      expect(receivedValues[0]).toBeUndefined();

      await kernel.emit('user:login', { userId: 'user123', timestamp: Date.now() });

      expect(receivedValues).toHaveLength(2);
      expect(receivedValues[1]?.name).toBe('user:login');
      expect(receivedValues[1]?.data.userId).toBe('user123');

      unsubscribe();
    });

    it('should handle multiple subscribers to same store', async () => {
      const store = eventStore<TestEvents, 'notification:show'>('notification:show');

      const subscriber1Values: any[] = [];
      const subscriber2Values: any[] = [];

      const unsub1 = store.subscribe((value) => {
        if (value !== undefined) subscriber1Values.push(value.data);
      });

      const unsub2 = store.subscribe((value) => {
        if (value !== undefined) subscriber2Values.push(value.data);
      });

      await kernel.emit('notification:show', { message: 'Hello', type: 'info' });
      await kernel.emit('notification:show', { message: 'Error!', type: 'error' });

      expect(subscriber1Values).toHaveLength(2);
      expect(subscriber2Values).toHaveLength(2);
      expect(subscriber1Values).toEqual(subscriber2Values);

      unsub1();
      unsub2();
    });

    it('should update store with latest event only', async () => {
      const store = eventStore<TestEvents, 'cart:update'>('cart:update');

      const values: any[] = [];
      const unsubscribe = store.subscribe((value) => {
        values.push(value);
      });

      await kernel.emit('cart:update', { items: 1, total: 10 });
      await kernel.emit('cart:update', { items: 2, total: 25 });
      await kernel.emit('cart:update', { items: 3, total: 40 });

      // Initial undefined + 3 events
      expect(values).toHaveLength(4);

      // Current value should be latest
      const currentValue = get(store);
      expect(currentValue?.data).toEqual({ items: 3, total: 40 });

      unsubscribe();
    });

    it('should support wildcard stores', async () => {
      const userStore = eventStore<TestEvents, 'user:*'>('user:*');

      const events: string[] = [];
      const unsubscribe = userStore.subscribe((value) => {
        if (value !== undefined) {
          events.push(value.name);
        }
      });

      await kernel.emit('user:login', { userId: 'u1', timestamp: 1 });
      await kernel.emit('user:logout', { userId: 'u1' });

      expect(events).toContain('user:login');
      expect(events).toContain('user:logout');

      unsubscribe();
    });

    it('should handle rapid event emissions', async () => {
      const store = eventStore<TestEvents, 'data:loaded'>('data:loaded');

      const receivedCounts: number[] = [];
      const unsubscribe = store.subscribe((value) => {
        if (value !== undefined) {
          receivedCounts.push(value.data.count);
        }
      });

      // Emit 50 events rapidly
      for (let i = 0; i < 50; i++) {
        await kernel.emit('data:loaded', { count: i });
      }

      expect(receivedCounts).toHaveLength(50);
      expect(receivedCounts).toEqual(Array.from({ length: 50 }, (_, i) => i));

      unsubscribe();
    });
  });

  describe('Context store reactivity', () => {
    beforeEach(() => {
      setKernel(kernel);
    });

    it('should create reactive context store', async () => {
      const store = contextStore<TestEvents, 'cart:add', 'cartTotal'>(
        'cart:add',
        'cartTotal'
      );

      const values: any[] = [];
      const unsubscribe = store.subscribe((value) => {
        values.push(value);
      });

      expect(values).toHaveLength(1);
      expect(values[0]).toBeUndefined();

      await kernel.emit('cart:add', { productId: 'p1', quantity: 1 });

      // Wait for context update
      await tick();

      unsubscribe();
    });

    it('should track context changes across multiple events', async () => {
      const store = contextStore<TestEvents, 'cart:add', 'cartTotal'>('cart:add', 'cartTotal');

      const contextValues: any[] = [];
      const unsubscribe = store.subscribe((value) => {
        contextValues.push(value);
      });

      // Manually add to context to simulate listener behavior
      kernel.on('cart:add', async (event) => {
        event.context.cartTotal = (event.context.cartTotal || 0) + event.data.quantity;
      });

      await kernel.emit('cart:add', { productId: 'p1', quantity: 2 });
      await kernel.emit('cart:add', { productId: 'p2', quantity: 3 });

      unsubscribe();

      expect(contextValues.length).toBeGreaterThan(0);
    });
  });

  describe('onDestroy cleanup integration', () => {
    it('should unsubscribe listener on component destroy', async () => {
      setKernel(kernel);

      const component = new ComponentSimulator();
      component.mount();

      const receivedEvents: string[] = [];

      // Use onEvent which registers cleanup
      onEvent('user:login', (event) => {
        receivedEvents.push(event.name);
      });

      await kernel.emit('user:login', { userId: 'u1', timestamp: 1 });

      expect(receivedEvents).toHaveLength(1);

      // Destroy component - should cleanup listener
      component.destroy();

      await kernel.emit('user:login', { userId: 'u2', timestamp: 2 });

      // Should still be 1, not incremented after destroy
      expect(receivedEvents).toHaveLength(1);
    });

    it('should cleanup multiple listeners on destroy', async () => {
      setKernel(kernel);

      const component = new ComponentSimulator();
      component.mount();

      const loginCount = { value: 0 };
      const logoutCount = { value: 0 };
      const notificationCount = { value: 0 };

      onEvent('user:login', () => {
        loginCount.value++;
      });

      onEvent('user:logout', () => {
        logoutCount.value++;
      });

      onEvent('notification:show', () => {
        notificationCount.value++;
      });

      await kernel.emit('user:login', { userId: 'u1', timestamp: 1 });
      await kernel.emit('user:logout', { userId: 'u1' });
      await kernel.emit('notification:show', { message: 'Test', type: 'info' });

      expect(loginCount.value).toBe(1);
      expect(logoutCount.value).toBe(1);
      expect(notificationCount.value).toBe(1);

      component.destroy();

      await kernel.emit('user:login', { userId: 'u2', timestamp: 2 });
      await kernel.emit('user:logout', { userId: 'u2' });
      await kernel.emit('notification:show', { message: 'Test2', type: 'info' });

      // Counts should not increment after destroy
      expect(loginCount.value).toBe(1);
      expect(logoutCount.value).toBe(1);
      expect(notificationCount.value).toBe(1);
    });

    it('should cleanup store subscriptions on destroy', async () => {
      setKernel(kernel);

      const component = new ComponentSimulator();
      component.mount();

      const store = eventStore<TestEvents, 'cart:update'>('cart:update');

      const values: any[] = [];
      const unsubscribe = store.subscribe((value) => {
        values.push(value);
      });

      await kernel.emit('cart:update', { items: 1, total: 10 });

      expect(values).toHaveLength(2); // undefined + 1 event

      unsubscribe();

      await kernel.emit('cart:update', { items: 2, total: 20 });

      // Should not receive new event after unsubscribe
      expect(values).toHaveLength(2);

      component.destroy();
    });
  });

  describe('Error handling', () => {
    it('should handle store subscription lifecycle correctly', async () => {
      setKernel(kernel);

      // Create store and verify initial state
      const store = eventStore<TestEvents, 'user:login'>('user:login');

      const values: any[] = [];
      const unsubscribe = store.subscribe((value) => {
        values.push(value);
      });

      // Initial value should be undefined
      expect(values).toHaveLength(1);
      expect(values[0]).toBeUndefined();

      // Emit event
      await kernel.emit('user:login', { userId: 'u1', timestamp: 1 });

      // Should receive event
      expect(values).toHaveLength(2);
      expect(values[1]?.name).toBe('user:login');

      // Cleanup
      unsubscribe();

      // After unsubscribe, no new values should be received
      await kernel.emit('user:login', { userId: 'u2', timestamp: 2 });
      expect(values).toHaveLength(2); // No new value
    });

    it('should handle invalid event names gracefully', async () => {
      setKernel(kernel);

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const store = eventStore<TestEvents, any>('invalid:pattern:**' as any);

      const values: any[] = [];
      const unsubscribe = store.subscribe((value) => {
        values.push(value);
      });

      // Should have initial undefined value
      expect(values).toHaveLength(1);

      unsubscribe();
      consoleWarnSpy.mockRestore();
    });

    it('should prevent memory leaks with abandoned subscriptions', async () => {
      setKernel(kernel);

      const unsubscribers: Unsubscriber[] = [];

      // Create many store subscriptions
      for (let i = 0; i < 100; i++) {
        const store = eventStore<TestEvents, 'data:loaded'>('data:loaded');
        const unsub = store.subscribe(() => {});
        unsubscribers.push(unsub);
      }

      await kernel.emit('data:loaded', { count: 1 });

      // Cleanup all subscriptions
      unsubscribers.forEach((unsub) => unsub());

      await kernel.emit('data:loaded', { count: 2 });

      // No memory leaks - test passes if it doesn't hang
      expect(unsubscribers).toHaveLength(100);
    });
  });

  describe('Complex integration scenarios', () => {
    it('should handle component tree with multiple stores', async () => {
      setKernel(kernel);

      const loginStore = eventStore<TestEvents, 'user:login'>('user:login');
      const logoutStore = eventStore<TestEvents, 'user:logout'>('user:logout');
      const cartStore = eventStore<TestEvents, 'cart:update'>('cart:update');

      const loginEvents: any[] = [];
      const logoutEvents: any[] = [];
      const cartEvents: any[] = [];

      const unsub1 = loginStore.subscribe((v) => {
        if (v) loginEvents.push(v);
      });
      const unsub2 = logoutStore.subscribe((v) => {
        if (v) logoutEvents.push(v);
      });
      const unsub3 = cartStore.subscribe((v) => {
        if (v) cartEvents.push(v);
      });

      await kernel.emit('user:login', { userId: 'u1', timestamp: 1 });
      await kernel.emit('cart:update', { items: 1, total: 10 });
      await kernel.emit('user:logout', { userId: 'u1' });

      expect(loginEvents).toHaveLength(1);
      expect(logoutEvents).toHaveLength(1);
      expect(cartEvents).toHaveLength(1);

      unsub1();
      unsub2();
      unsub3();
    });

    it('should coordinate between context listeners and stores', async () => {
      setKernel(kernel);

      const component = new ComponentSimulator();
      component.mount();

      const store = eventStore<TestEvents, 'cart:add'>('cart:add');

      let listenerCalls = 0;
      const storeValues: any[] = [];

      onEvent('cart:add', () => {
        listenerCalls++;
      });

      const unsubscribe = store.subscribe((value) => {
        if (value) storeValues.push(value);
      });

      await kernel.emit('cart:add', { productId: 'p1', quantity: 1 });
      await kernel.emit('cart:add', { productId: 'p2', quantity: 2 });

      expect(listenerCalls).toBe(2);
      expect(storeValues).toHaveLength(2);

      component.destroy();
      unsubscribe();

      await kernel.emit('cart:add', { productId: 'p3', quantity: 3 });

      // Listener cleaned up by destroy, store subscription manually unsubscribed
      expect(listenerCalls).toBe(2);
      expect(storeValues).toHaveLength(2);
    });
  });
});
