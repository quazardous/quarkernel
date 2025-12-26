/**
 * Tests for useKernel composable
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, defineComponent, h } from 'vue';
import { createKernel } from '@quazardous/quarkernel';
import { QuarKernelPlugin, useKernel } from './index.js';

describe('useKernel', () => {
  let consoleWarnSpy: any;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  it('should return kernel instance', () => {
    const kernel = createKernel();
    let capturedKernel: any = null;

    const TestComponent = defineComponent({
      setup() {
        capturedKernel = useKernel();
        return () => h('div', 'test');
      },
    });

    const app = createApp(TestComponent);
    app.use(QuarKernelPlugin, { kernel });

    const container = document.createElement('div');
    app.mount(container);

    expect(capturedKernel).toBe(kernel);
  });

  it('should warn when called during SSR', () => {
    const kernel = createKernel();
    const originalWindow = global.window;

    delete (global as any).window;

    const TestComponent = defineComponent({
      setup() {
        useKernel();
        return () => h('div', 'test');
      },
    });

    const app = createApp(TestComponent);
    app.use(QuarKernelPlugin, { kernel });

    const container = document.createElement('div');
    (global as any).window = originalWindow;
    app.mount(container);
    delete (global as any).window;

    const warnings = consoleWarnSpy.mock.calls.filter((call: any[]) =>
      call[0]?.includes('server-side rendering')
    );

    (global as any).window = originalWindow;

    expect(warnings.length).toBeGreaterThan(0);
  });

  it('should provide type-safe kernel access', () => {
    interface MyEvents {
      'custom:event': { value: number };
    }

    const kernel = createKernel<MyEvents>();
    let capturedKernel: any = null;

    const TestComponent = defineComponent({
      setup() {
        capturedKernel = useKernel<typeof kernel>();
        return () => h('div', 'test');
      },
    });

    const app = createApp(TestComponent);
    app.use(QuarKernelPlugin, { kernel });

    const container = document.createElement('div');
    app.mount(container);

    expect(capturedKernel).toBe(kernel);
  });

  it('should allow multiple components to access same kernel', () => {
    const kernel = createKernel();
    const capturedKernels: any[] = [];

    const ComponentA = defineComponent({
      setup() {
        capturedKernels.push(useKernel());
        return () => h('div', 'A');
      },
    });

    const ComponentB = defineComponent({
      setup() {
        capturedKernels.push(useKernel());
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

    expect(capturedKernels).toHaveLength(2);
    expect(capturedKernels[0]).toBe(kernel);
    expect(capturedKernels[1]).toBe(kernel);
  });
});
