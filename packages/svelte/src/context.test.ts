/**
 * Tests for Svelte context API
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tick } from 'svelte';
import { createKernel } from '@quazardous/quarkernel';
import { setKernel, getKernel, onEvent, KernelContextError } from './context.js';

// Mock Svelte context functions
let contextStore = new Map<symbol | string, any>();
let destroyCallbacks: Array<() => void> = [];

vi.mock('svelte', () => ({
  setContext: (key: symbol | string, value: any) => {
    contextStore.set(key, value);
  },
  getContext: (key: symbol | string) => {
    return contextStore.get(key);
  },
  onDestroy: (callback: () => void) => {
    destroyCallbacks.push(callback);
  },
  tick: () => Promise.resolve(),
}));

describe('setKernel', () => {
  beforeEach(() => {
    contextStore = new Map();
    destroyCallbacks = [];
  });

  it('should store kernel in context', () => {
    const kernel = createKernel();
    setKernel(kernel);

    // Check that kernel was stored (internal verification)
    expect(contextStore.size).toBe(1);
  });

  it('should throw if kernel is null', () => {
    expect(() => setKernel(null as any)).toThrow(
      '[QuarKernel Svelte] setKernel() requires a kernel instance'
    );
  });

  it('should throw if kernel is undefined', () => {
    expect(() => setKernel(undefined as any)).toThrow(
      '[QuarKernel Svelte] setKernel() requires a kernel instance'
    );
  });
});

describe('getKernel', () => {
  beforeEach(() => {
    contextStore = new Map();
    destroyCallbacks = [];
  });

  it('should return kernel from context', () => {
    const kernel = createKernel();
    setKernel(kernel);

    const retrieved = getKernel();
    expect(retrieved).toBe(kernel);
  });

  it('should throw KernelContextError if kernel not in context', () => {
    expect(() => getKernel()).toThrow(KernelContextError);
    expect(() => getKernel()).toThrow(
      'getKernel() must be called within a component where setKernel() was used'
    );
  });

  it('should support typed kernel access', () => {
    interface MyEvents {
      'custom:event': { value: number };
    }

    const kernel = createKernel<MyEvents>();
    setKernel(kernel);

    const retrieved = getKernel<typeof kernel>();
    expect(retrieved).toBe(kernel);
  });

  it('should allow multiple components to access same kernel', () => {
    const kernel = createKernel();
    setKernel(kernel);

    const kernel1 = getKernel();
    const kernel2 = getKernel();

    expect(kernel1).toBe(kernel);
    expect(kernel2).toBe(kernel);
    expect(kernel1).toBe(kernel2);
  });
});

describe('onEvent', () => {
  beforeEach(() => {
    contextStore = new Map();
    destroyCallbacks = [];
  });

  afterEach(() => {
    // Cleanup all listeners
    destroyCallbacks.forEach(cb => cb());
    destroyCallbacks = [];
  });

  it('should register event listener and return unsubscribe function', () => {
    const kernel = createKernel();
    setKernel(kernel);

    const handler = vi.fn();
    const unsubscribe = onEvent('test:event', handler);

    expect(typeof unsubscribe).toBe('function');
    expect(destroyCallbacks).toHaveLength(1);
  });

  it('should trigger handler when event emitted', async () => {
    const kernel = createKernel();
    setKernel(kernel);

    const handler = vi.fn();
    onEvent('test:event', handler);

    await kernel.emit('test:event', { value: 123 });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].data).toEqual({ value: 123 });
  });

  it('should support wildcard patterns', async () => {
    const kernel = createKernel();
    setKernel(kernel);

    const handler = vi.fn();
    onEvent('user:*', handler);

    await kernel.emit('user:login', { id: 1 });
    await kernel.emit('user:logout', { id: 1 });

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('should auto-cleanup on component destroy', async () => {
    const kernel = createKernel();
    setKernel(kernel);

    const handler = vi.fn();
    onEvent('test:event', handler);

    // Emit before destroy
    await kernel.emit('test:event', { value: 1 });
    expect(handler).toHaveBeenCalledTimes(1);

    // Simulate component destroy
    destroyCallbacks.forEach(cb => cb());

    // Emit after destroy - should not trigger handler
    handler.mockClear();
    await kernel.emit('test:event', { value: 2 });
    expect(handler).not.toHaveBeenCalled();
  });

  it('should allow manual unsubscribe before destroy', async () => {
    const kernel = createKernel();
    setKernel(kernel);

    const handler = vi.fn();
    const unsubscribe = onEvent('test:event', handler);

    // Emit before unsubscribe
    await kernel.emit('test:event', { value: 1 });
    expect(handler).toHaveBeenCalledTimes(1);

    // Manual unsubscribe
    unsubscribe();

    // Emit after manual unsubscribe - should not trigger
    handler.mockClear();
    await kernel.emit('test:event', { value: 2 });
    expect(handler).not.toHaveBeenCalled();
  });

  it('should handle async handlers', async () => {
    const kernel = createKernel();
    setKernel(kernel);

    const results: number[] = [];
    const handler = async (event: any) => {
      await new Promise(resolve => setTimeout(resolve, 10));
      results.push(event.data.value);
    };

    onEvent('test:event', handler);

    await kernel.emit('test:event', { value: 42 });

    expect(results).toEqual([42]);
  });

  it('should support multiple listeners on same event', async () => {
    const kernel = createKernel();
    setKernel(kernel);

    const handler1 = vi.fn();
    const handler2 = vi.fn();

    onEvent('test:event', handler1);
    onEvent('test:event', handler2);

    await kernel.emit('test:event', { value: 123 });

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  it('should throw if kernel not in context', () => {
    expect(() => onEvent('test:event', vi.fn())).toThrow(KernelContextError);
  });

  it('should register destroy callback for each listener', () => {
    const kernel = createKernel();
    setKernel(kernel);

    onEvent('event1', vi.fn());
    onEvent('event2', vi.fn());
    onEvent('event3', vi.fn());

    expect(destroyCallbacks).toHaveLength(3);
  });

  it('should preserve event context', async () => {
    const kernel = createKernel();
    setKernel(kernel);

    let capturedContext: any = null;

    onEvent('test:event', async (event) => {
      event.context.modified = true;
      capturedContext = event.context;
    });

    await kernel.emit('test:event', {});

    expect(capturedContext).toEqual({
      modified: true,
    });
  });

  it('should work with listener context utilities', async () => {
    const kernel = createKernel();
    setKernel(kernel);

    let capturedCtx: any = null;

    onEvent('test:event', async (event, ctx) => {
      capturedCtx = ctx;
    });

    await kernel.emit('test:event', {});

    expect(capturedCtx).toBeDefined();
    expect(capturedCtx.id).toBeDefined();
    expect(typeof capturedCtx.off).toBe('function');
  });
});

describe('context integration', () => {
  beforeEach(() => {
    contextStore = new Map();
    destroyCallbacks = [];
  });

  afterEach(() => {
    destroyCallbacks.forEach(cb => cb());
    destroyCallbacks = [];
  });

  it('should support full workflow: setKernel → getKernel → onEvent', async () => {
    const kernel = createKernel();
    setKernel(kernel);

    const retrieved = getKernel();
    expect(retrieved).toBe(kernel);

    const handler = vi.fn();
    onEvent('workflow:test', handler);

    await kernel.emit('workflow:test', { success: true });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].data).toEqual({ success: true });
  });

  it('should isolate contexts in different component trees', () => {
    const kernel1 = createKernel();
    const kernel2 = createKernel();

    // First component tree
    const store1 = new Map();
    contextStore = store1;
    setKernel(kernel1);
    const retrieved1 = getKernel();

    // Second component tree
    const store2 = new Map();
    contextStore = store2;
    setKernel(kernel2);
    const retrieved2 = getKernel();

    expect(retrieved1).toBe(kernel1);
    expect(retrieved2).toBe(kernel2);
    expect(retrieved1).not.toBe(retrieved2);
  });
});
