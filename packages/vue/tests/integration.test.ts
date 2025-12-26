/**
 * Vue adapter lifecycle integration tests
 * Tests component mount/unmount cleanup and memory leak prevention
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, defineComponent, h, ref } from 'vue';
import { createKernel, type Kernel } from '@quazardous/quarkernel';
import { QuarKernelPlugin, useOn, useKernel, useEventState } from '../src/index.js';

describe('Vue adapter lifecycle integration', () => {
  let kernel: Kernel;

  beforeEach(() => {
    kernel = createKernel();
  });

  describe('Component mount/unmount cleanup', () => {
    it('should cleanup all listeners when component unmounts', async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      const TestComponent = defineComponent({
        setup() {
          useOn('event:a', handler1);
          useOn('event:b', handler2);
          useOn('event:c', handler3);
          return () => h('div', 'test');
        },
      });

      const app = createApp(TestComponent);
      app.use(QuarKernelPlugin, { kernel });

      const container = document.createElement('div');
      app.mount(container);

      // Verify listeners are registered
      await kernel.emit('event:a', {});
      await kernel.emit('event:b', {});
      await kernel.emit('event:c', {});

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
      expect(handler3).toHaveBeenCalledTimes(1);

      // Unmount component
      app.unmount();

      // Emit again - handlers should not be called
      await kernel.emit('event:a', {});
      await kernel.emit('event:b', {});
      await kernel.emit('event:c', {});

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
      expect(handler3).toHaveBeenCalledTimes(1);
    });

    it('should cleanup listeners from multiple components independently', async () => {
      const handlerA = vi.fn();
      const handlerB = vi.fn();

      const ComponentA = defineComponent({
        setup() {
          useOn('test:event', handlerA);
          return () => h('div', 'A');
        },
      });

      const ComponentB = defineComponent({
        setup() {
          useOn('test:event', handlerB);
          return () => h('div', 'B');
        },
      });

      const appA = createApp(ComponentA);
      appA.use(QuarKernelPlugin, { kernel });
      const containerA = document.createElement('div');
      appA.mount(containerA);

      const appB = createApp(ComponentB);
      appB.use(QuarKernelPlugin, { kernel });
      const containerB = document.createElement('div');
      appB.mount(containerB);

      // Both should receive events
      await kernel.emit('test:event', {});
      expect(handlerA).toHaveBeenCalledTimes(1);
      expect(handlerB).toHaveBeenCalledTimes(1);

      // Unmount only component A
      appA.unmount();

      // Only B should receive events
      await kernel.emit('test:event', {});
      expect(handlerA).toHaveBeenCalledTimes(1);
      expect(handlerB).toHaveBeenCalledTimes(2);

      // Unmount B
      appB.unmount();

      // Neither should receive events
      await kernel.emit('test:event', {});
      expect(handlerA).toHaveBeenCalledTimes(1);
      expect(handlerB).toHaveBeenCalledTimes(2);
    });

    it('should cleanup nested component listeners on parent unmount', async () => {
      const handlerParent = vi.fn();
      const handlerChild = vi.fn();

      const ChildComponent = defineComponent({
        setup() {
          useOn('test:event', handlerChild);
          return () => h('div', 'child');
        },
      });

      const ParentComponent = defineComponent({
        setup() {
          useOn('test:event', handlerParent);
          return () => h('div', [h(ChildComponent)]);
        },
      });

      const app = createApp(ParentComponent);
      app.use(QuarKernelPlugin, { kernel });
      const container = document.createElement('div');
      app.mount(container);

      await kernel.emit('test:event', {});
      expect(handlerParent).toHaveBeenCalledTimes(1);
      expect(handlerChild).toHaveBeenCalledTimes(1);

      // Unmount parent (should cleanup both)
      app.unmount();

      await kernel.emit('test:event', {});
      expect(handlerParent).toHaveBeenCalledTimes(1);
      expect(handlerChild).toHaveBeenCalledTimes(1);
    });

    it('should cleanup conditional component listeners', async () => {
      const handler = vi.fn();
      const show = ref(true);

      const ConditionalChild = defineComponent({
        setup() {
          useOn('test:event', handler);
          return () => h('div', 'conditional');
        },
      });

      const ParentComponent = defineComponent({
        setup() {
          return () => h('div', [show.value ? h(ConditionalChild) : null]);
        },
      });

      const app = createApp(ParentComponent);
      app.use(QuarKernelPlugin, { kernel });
      const container = document.createElement('div');
      app.mount(container);

      await kernel.emit('test:event', {});
      expect(handler).toHaveBeenCalledTimes(1);

      // Hide component
      show.value = false;
      await new Promise(resolve => setTimeout(resolve, 0));

      await kernel.emit('test:event', {});
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('AbortSignal cleanup interactions', () => {
    it('should cleanup AbortSignal listener on component unmount', async () => {
      const handler = vi.fn();
      const controller = new AbortController();
      const removeListenerSpy = vi.spyOn(controller.signal, 'removeEventListener');

      const TestComponent = defineComponent({
        setup() {
          useOn('test:event', handler, { signal: controller.signal });
          return () => h('div', 'test');
        },
      });

      const app = createApp(TestComponent);
      app.use(QuarKernelPlugin, { kernel });
      const container = document.createElement('div');
      app.mount(container);

      await kernel.emit('test:event', {});
      expect(handler).toHaveBeenCalledTimes(1);

      app.unmount();

      // Should have removed abort listener
      expect(removeListenerSpy).toHaveBeenCalled();

      removeListenerSpy.mockRestore();
    });

    it('should handle AbortSignal abort before unmount', async () => {
      const handler = vi.fn();
      const controller = new AbortController();

      const TestComponent = defineComponent({
        setup() {
          useOn('test:event', handler, { signal: controller.signal });
          return () => h('div', 'test');
        },
      });

      const app = createApp(TestComponent);
      app.use(QuarKernelPlugin, { kernel });
      const container = document.createElement('div');
      app.mount(container);

      await kernel.emit('test:event', {});
      expect(handler).toHaveBeenCalledTimes(1);

      // Abort signal before unmount
      controller.abort();

      await kernel.emit('test:event', {});
      expect(handler).toHaveBeenCalledTimes(1);

      // Unmount should not cause errors
      app.unmount();
    });

    it('should cleanup multiple AbortSignal listeners independently', async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const controller1 = new AbortController();
      const controller2 = new AbortController();

      const TestComponent = defineComponent({
        setup() {
          useOn('event:a', handler1, { signal: controller1.signal });
          useOn('event:b', handler2, { signal: controller2.signal });
          return () => h('div', 'test');
        },
      });

      const app = createApp(TestComponent);
      app.use(QuarKernelPlugin, { kernel });
      const container = document.createElement('div');
      app.mount(container);

      await kernel.emit('event:a', {});
      await kernel.emit('event:b', {});
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);

      // Abort only first signal
      controller1.abort();

      await kernel.emit('event:a', {});
      await kernel.emit('event:b', {});
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(2);

      // Unmount should cleanup remaining
      app.unmount();

      await kernel.emit('event:b', {});
      expect(handler2).toHaveBeenCalledTimes(2);
    });
  });

  describe('Memory leak prevention', () => {
    it('should not leak listeners across multiple mount/unmount cycles', async () => {
      const handler = vi.fn();

      const TestComponent = defineComponent({
        setup() {
          useOn('test:event', handler);
          return () => h('div', 'test');
        },
      });

      // Mount/unmount 3 times
      for (let i = 0; i < 3; i++) {
        const app = createApp(TestComponent);
        app.use(QuarKernelPlugin, { kernel });
        const container = document.createElement('div');
        app.mount(container);
        app.unmount();
      }

      // Emit event - should not be called (no active listeners)
      await kernel.emit('test:event', {});
      expect(handler).not.toHaveBeenCalled();
    });

    it('should cleanup useEventState subscriptions on unmount', async () => {
      const TestComponent = defineComponent({
        setup() {
          const state = useEventState('test:event', 0, (prev, evt) => prev + 1);
          return () => h('div', state.value);
        },
      });

      const app = createApp(TestComponent);
      app.use(QuarKernelPlugin, { kernel });
      const container = document.createElement('div');
      app.mount(container);

      await kernel.emit('test:event', {});
      await kernel.emit('test:event', {});

      app.unmount();

      // Emit more events - should not cause errors or memory leaks
      await kernel.emit('test:event', {});
      await kernel.emit('test:event', {});
    });

    it('should handle rapid mount/unmount without listener buildup', async () => {
      const handler = vi.fn();

      const TestComponent = defineComponent({
        setup() {
          useOn('test:event', handler);
          return () => h('div', 'test');
        },
      });

      // Rapid mount/unmount
      const apps = [];
      const containers = [];

      for (let i = 0; i < 10; i++) {
        const app = createApp(TestComponent);
        app.use(QuarKernelPlugin, { kernel });
        const container = document.createElement('div');
        app.mount(container);
        apps.push(app);
        containers.push(container);
      }

      // Unmount all
      apps.forEach(app => app.unmount());

      // Emit - should not be called
      await kernel.emit('test:event', {});
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('Multiple components with shared kernel', () => {
    it('should allow multiple components to share kernel instance', async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      const ComponentA = defineComponent({
        setup() {
          const k = useKernel();
          useOn('shared:event', handler1);
          return () => h('div', k === kernel ? 'same-kernel' : 'different-kernel');
        },
      });

      const ComponentB = defineComponent({
        setup() {
          const k = useKernel();
          useOn('shared:event', handler2);
          return () => h('div', k === kernel ? 'same-kernel' : 'different-kernel');
        },
      });

      const appA = createApp(ComponentA);
      appA.use(QuarKernelPlugin, { kernel });
      const containerA = document.createElement('div');
      appA.mount(containerA);

      const appB = createApp(ComponentB);
      appB.use(QuarKernelPlugin, { kernel });
      const containerB = document.createElement('div');
      appB.mount(containerB);

      // Both should receive event
      await kernel.emit('shared:event', {});
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);

      // Both should have same kernel instance
      expect(containerA.textContent).toBe('same-kernel');
      expect(containerB.textContent).toBe('same-kernel');
    });

    it('should maintain listener order across components', async () => {
      const executionOrder: string[] = [];

      const ComponentA = defineComponent({
        setup() {
          useOn('test:event', () => executionOrder.push('A'), { priority: 10 });
          return () => h('div', 'A');
        },
      });

      const ComponentB = defineComponent({
        setup() {
          useOn('test:event', () => executionOrder.push('B'), { priority: 5 });
          return () => h('div', 'B');
        },
      });

      const appA = createApp(ComponentA);
      appA.use(QuarKernelPlugin, { kernel });
      appA.mount(document.createElement('div'));

      const appB = createApp(ComponentB);
      appB.use(QuarKernelPlugin, { kernel });
      appB.mount(document.createElement('div'));

      await kernel.emit('test:event', {});

      expect(executionOrder).toEqual(['A', 'B']);
    });
  });

  describe('SSR environment guards', () => {
    it('should handle SSR environment gracefully', () => {
      const originalWindow = global.window;
      const originalDocument = global.document;

      try {
        // Simulate SSR environment
        // @ts-expect-error - Testing SSR environment
        delete global.window;
        // @ts-expect-error - Testing SSR environment
        delete global.document;

        // Should not throw when creating component in SSR
        expect(() => {
          defineComponent({
            setup() {
              // This would normally warn in SSR but should not throw
              return () => h('div', 'ssr-test');
            },
          });
        }).not.toThrow();
      } finally {
        // Restore environment
        global.window = originalWindow;
        global.document = originalDocument;
      }
    });
  });
});
