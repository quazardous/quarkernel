/**
 * Tests for useEventState composable
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, defineComponent, h, nextTick } from 'vue';
import { createKernel } from '@quazardous/quarkernel';
import { QuarKernelPlugin, useEventState } from './index.js';

describe('useEventState', () => {
  it('should create reactive ref with initial value', () => {
    const kernel = createKernel();
    let stateRef: any = null;

    const TestComponent = defineComponent({
      setup() {
        stateRef = useEventState('test:event', 42);
        return () => h('div', stateRef.value);
      },
    });

    const app = createApp(TestComponent);
    app.use(QuarKernelPlugin, { kernel });

    const container = document.createElement('div');
    app.mount(container);

    expect(stateRef.value).toBe(42);
  });

  it('should update ref when event is emitted', async () => {
    const kernel = createKernel();
    let stateRef: any = null;

    const TestComponent = defineComponent({
      setup() {
        stateRef = useEventState('test:event', 0);
        return () => h('div', stateRef.value);
      },
    });

    const app = createApp(TestComponent);
    app.use(QuarKernelPlugin, { kernel });

    const container = document.createElement('div');
    app.mount(container);

    expect(stateRef.value).toBe(0);

    await kernel.emit('test:event', 42);
    await nextTick();

    expect(stateRef.value).toBe(42);
  });

  it('should update ref multiple times', async () => {
    const kernel = createKernel();
    let stateRef: any = null;

    const TestComponent = defineComponent({
      setup() {
        stateRef = useEventState('test:event', 0);
        return () => h('div', stateRef.value);
      },
    });

    const app = createApp(TestComponent);
    app.use(QuarKernelPlugin, { kernel });

    const container = document.createElement('div');
    app.mount(container);

    await kernel.emit('test:event', 1);
    await nextTick();
    expect(stateRef.value).toBe(1);

    await kernel.emit('test:event', 2);
    await nextTick();
    expect(stateRef.value).toBe(2);

    await kernel.emit('test:event', 3);
    await nextTick();
    expect(stateRef.value).toBe(3);
  });

  it('should automatically cleanup listener on unmount', async () => {
    const kernel = createKernel();
    let stateRef: any = null;

    const TestComponent = defineComponent({
      setup() {
        stateRef = useEventState('test:event', 0);
        return () => h('div', stateRef.value);
      },
    });

    const app = createApp(TestComponent);
    app.use(QuarKernelPlugin, { kernel });

    const container = document.createElement('div');
    app.mount(container);

    await kernel.emit('test:event', 1);
    await nextTick();
    expect(stateRef.value).toBe(1);

    app.unmount();

    await kernel.emit('test:event', 2);
    await nextTick();

    expect(stateRef.value).toBe(1);
  });

  it('should support transform function', async () => {
    const kernel = createKernel();
    let stateRef: any = null;

    const TestComponent = defineComponent({
      setup() {
        stateRef = useEventState('user:login', 'Guest', {
          transform: (event) => event.data.name,
        });
        return () => h('div', stateRef.value);
      },
    });

    const app = createApp(TestComponent);
    app.use(QuarKernelPlugin, { kernel });

    const container = document.createElement('div');
    app.mount(container);

    expect(stateRef.value).toBe('Guest');

    await kernel.emit('user:login', { id: 1, name: 'Alice' });
    await nextTick();

    expect(stateRef.value).toBe('Alice');
  });

  it('should support AbortSignal for manual cleanup', async () => {
    const kernel = createKernel();
    let stateRef: any = null;
    const controller = new AbortController();

    const TestComponent = defineComponent({
      setup() {
        stateRef = useEventState('test:event', 0, {
          signal: controller.signal,
        });
        return () => h('div', stateRef.value);
      },
    });

    const app = createApp(TestComponent);
    app.use(QuarKernelPlugin, { kernel });

    const container = document.createElement('div');
    app.mount(container);

    await kernel.emit('test:event', 1);
    await nextTick();
    expect(stateRef.value).toBe(1);

    controller.abort();

    await kernel.emit('test:event', 2);
    await nextTick();

    expect(stateRef.value).toBe(1);
  });

  it('should support listener options', async () => {
    const kernel = createKernel();
    let stateRef: any = null;

    const TestComponent = defineComponent({
      setup() {
        stateRef = useEventState('test:event', 0, {
          priority: 10,
          id: 'my-listener',
        });
        return () => h('div', stateRef.value);
      },
    });

    const app = createApp(TestComponent);
    app.use(QuarKernelPlugin, { kernel });

    const container = document.createElement('div');
    app.mount(container);

    await kernel.emit('test:event', 42);
    await nextTick();

    expect(stateRef.value).toBe(42);
  });

  it('should work with complex event data', async () => {
    interface UserEvent {
      id: number;
      name: string;
      email: string;
    }

    const kernel = createKernel<{ 'user:update': UserEvent }>();
    let stateRef: any = null;

    const TestComponent = defineComponent({
      setup() {
        stateRef = useEventState<UserEvent>('user:update', {
          id: 0,
          name: '',
          email: '',
        });
        return () => h('div', stateRef.value.name);
      },
    });

    const app = createApp(TestComponent);
    app.use(QuarKernelPlugin, { kernel });

    const container = document.createElement('div');
    app.mount(container);

    const userData = { id: 1, name: 'Alice', email: 'alice@example.com' };
    await kernel.emit('user:update', userData);
    await nextTick();

    expect(stateRef.value).toEqual(userData);
  });

  it('should maintain reactivity in template', async () => {
    const kernel = createKernel();

    const TestComponent = defineComponent({
      setup() {
        const count = useEventState('count:update', 0);
        return () => h('div', { id: 'count' }, count.value.toString());
      },
    });

    const app = createApp(TestComponent);
    app.use(QuarKernelPlugin, { kernel });

    const container = document.createElement('div');
    app.mount(container);

    const countDiv = container.querySelector('#count');
    expect(countDiv?.textContent).toBe('0');

    await kernel.emit('count:update', 5);
    await nextTick();

    expect(countDiv?.textContent).toBe('5');
  });

  it('should handle different data types', async () => {
    const kernel = createKernel();
    let stringRef: any = null;
    let numberRef: any = null;
    let objectRef: any = null;
    let arrayRef: any = null;

    const TestComponent = defineComponent({
      setup() {
        stringRef = useEventState('string:event', 'initial');
        numberRef = useEventState('number:event', 0);
        objectRef = useEventState('object:event', {});
        arrayRef = useEventState('array:event', []);
        return () => h('div', 'test');
      },
    });

    const app = createApp(TestComponent);
    app.use(QuarKernelPlugin, { kernel });

    const container = document.createElement('div');
    app.mount(container);

    await kernel.emit('string:event', 'updated');
    await kernel.emit('number:event', 42);
    await kernel.emit('object:event', { key: 'value' });
    await kernel.emit('array:event', [1, 2, 3]);
    await nextTick();

    expect(stringRef.value).toBe('updated');
    expect(numberRef.value).toBe(42);
    expect(objectRef.value).toEqual({ key: 'value' });
    expect(arrayRef.value).toEqual([1, 2, 3]);
  });

  it('should support transform with event context', async () => {
    const kernel = createKernel();
    let stateRef: any = null;

    kernel.on('test:event', (event, ctx) => {
      event.context.processed = true;
    }, { priority: 10 });

    const TestComponent = defineComponent({
      setup() {
        stateRef = useEventState('test:event', null, {
          transform: (event) => ({
            data: event.data,
            contextKeys: Object.keys(event.context),
          }),
          priority: 5,
        });
        return () => h('div', 'test');
      },
    });

    const app = createApp(TestComponent);
    app.use(QuarKernelPlugin, { kernel });

    const container = document.createElement('div');
    app.mount(container);

    await kernel.emit('test:event', 'value');
    await nextTick();

    expect(stateRef.value).toEqual({
      data: 'value',
      contextKeys: ['processed'],
    });
  });
});
