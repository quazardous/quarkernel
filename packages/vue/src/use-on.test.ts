/**
 * Tests for useOn composable
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, defineComponent, h } from 'vue';
import { createKernel } from '@quazardous/quarkernel';
import { QuarKernelPlugin, useOn } from './index.js';

describe('useOn', () => {
  it('should register event listener', async () => {
    const kernel = createKernel();
    const handler = vi.fn();

    const TestComponent = defineComponent({
      setup() {
        useOn('test:event', handler);
        return () => h('div', 'test');
      },
    });

    const app = createApp(TestComponent);
    app.use(QuarKernelPlugin, { kernel });

    const container = document.createElement('div');
    app.mount(container);

    await kernel.emit('test:event', { value: 42 });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].data).toEqual({ value: 42 });
  });

  it('should automatically cleanup listener on unmount', async () => {
    const kernel = createKernel();
    const handler = vi.fn();

    const TestComponent = defineComponent({
      setup() {
        useOn('test:event', handler);
        return () => h('div', 'test');
      },
    });

    const app = createApp(TestComponent);
    app.use(QuarKernelPlugin, { kernel });

    const container = document.createElement('div');
    app.mount(container);

    await kernel.emit('test:event', { value: 1 });
    expect(handler).toHaveBeenCalledTimes(1);

    app.unmount();

    await kernel.emit('test:event', { value: 2 });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should support manual cleanup via returned unbind function', async () => {
    const kernel = createKernel();
    const handler = vi.fn();
    let unbind: (() => void) | null = null;

    const TestComponent = defineComponent({
      setup() {
        unbind = useOn('test:event', handler);
        return () => h('div', 'test');
      },
    });

    const app = createApp(TestComponent);
    app.use(QuarKernelPlugin, { kernel });

    const container = document.createElement('div');
    app.mount(container);

    await kernel.emit('test:event', { value: 1 });
    expect(handler).toHaveBeenCalledTimes(1);

    unbind!();

    await kernel.emit('test:event', { value: 2 });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should support AbortSignal for manual cleanup', async () => {
    const kernel = createKernel();
    const handler = vi.fn();
    const controller = new AbortController();

    const TestComponent = defineComponent({
      setup() {
        useOn('test:event', handler, {
          signal: controller.signal,
        });
        return () => h('div', 'test');
      },
    });

    const app = createApp(TestComponent);
    app.use(QuarKernelPlugin, { kernel });

    const container = document.createElement('div');
    app.mount(container);

    await kernel.emit('test:event', { value: 1 });
    expect(handler).toHaveBeenCalledTimes(1);

    controller.abort();

    await kernel.emit('test:event', { value: 2 });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should pass listener options to kernel', async () => {
    const kernel = createKernel();
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    const TestComponent = defineComponent({
      setup() {
        useOn('test:event', handler1, { priority: 10 });
        useOn('test:event', handler2, { priority: 5 });
        return () => h('div', 'test');
      },
    });

    const app = createApp(TestComponent);
    app.use(QuarKernelPlugin, { kernel });

    const container = document.createElement('div');
    app.mount(container);

    await kernel.emit('test:event', {});

    expect(handler1).toHaveBeenCalled();
    expect(handler2).toHaveBeenCalled();

    const firstCall = Math.min(
      handler1.mock.invocationCallOrder[0],
      handler2.mock.invocationCallOrder[0]
    );
    expect(firstCall).toBe(handler1.mock.invocationCallOrder[0]);
  });

  it('should support once option', async () => {
    const kernel = createKernel();
    const handler = vi.fn();

    const TestComponent = defineComponent({
      setup() {
        useOn('test:event', handler, { once: true });
        return () => h('div', 'test');
      },
    });

    const app = createApp(TestComponent);
    app.use(QuarKernelPlugin, { kernel });

    const container = document.createElement('div');
    app.mount(container);

    await kernel.emit('test:event', { value: 1 });
    await kernel.emit('test:event', { value: 2 });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should work with multiple components', async () => {
    const kernel = createKernel();
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    const ComponentA = defineComponent({
      setup() {
        useOn('test:event', handler1);
        return () => h('div', 'A');
      },
    });

    const ComponentB = defineComponent({
      setup() {
        useOn('test:event', handler2);
        return () => h('div', 'B');
      },
    });

    const RootComponent = defineComponent({
      setup() {
        return () => h('div', [h(ComponentA), h(ComponentB)]);
      },
    });

    const app = createApp(RootComponent);
    app.use(QuarKernelPlugin, { kernel });

    const container = document.createElement('div');
    app.mount(container);

    await kernel.emit('test:event', {});

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  it('should support dependency ordering via after option', async () => {
    const kernel = createKernel();
    const executionOrder: string[] = [];

    const TestComponent = defineComponent({
      setup() {
        useOn(
          'test:event',
          () => {
            executionOrder.push('second');
          },
          { id: 'second', after: 'first' }
        );

        useOn(
          'test:event',
          () => {
            executionOrder.push('first');
          },
          { id: 'first' }
        );

        return () => h('div', 'test');
      },
    });

    const app = createApp(TestComponent);
    app.use(QuarKernelPlugin, { kernel });

    const container = document.createElement('div');
    app.mount(container);

    await kernel.emit('test:event', {});

    expect(executionOrder).toEqual(['first', 'second']);
  });
});
