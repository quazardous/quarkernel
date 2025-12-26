/**
 * Tests for QuarKernel Vue plugin
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createApp, defineComponent, h } from 'vue';
import { createKernel } from '@quazardous/quarkernel';
import { QuarKernelPlugin, useKernel } from './index.js';

describe('QuarKernelPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should throw error when installed without kernel option', () => {
    const app = createApp({});

    expect(() => {
      app.use(QuarKernelPlugin, {} as any);
    }).toThrow('[QuarKernel Vue] Plugin requires a kernel instance in options');
  });

  it('should install plugin with kernel instance', () => {
    const kernel = createKernel();
    const app = createApp({});

    expect(() => {
      app.use(QuarKernelPlugin, { kernel });
    }).not.toThrow();
  });

  it('should provide kernel instance to components', async () => {
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

  it('should throw error when useKernel called without plugin installation', () => {
    const TestComponent = defineComponent({
      setup() {
        expect(() => {
          useKernel();
        }).toThrow('[QuarKernel Vue] Kernel instance not found');
        return () => h('div', 'test');
      },
    });

    const app = createApp(TestComponent);
    const container = document.createElement('div');
    app.mount(container);
  });

  it('should throw error when useKernel called outside setup', () => {
    expect(() => {
      useKernel();
    }).toThrow('[QuarKernel Vue] useKernel() must be called within setup() function');
  });

  it('should allow kernel operations from component', async () => {
    const kernel = createKernel<{
      'test:event': { message: string };
    }>();

    const events: string[] = [];

    const TestComponent = defineComponent({
      setup() {
        const k = useKernel();

        k.on('test:event', async (event) => {
          events.push(event.data.message);
        });

        return () => h('div', 'test');
      },
    });

    const app = createApp(TestComponent);
    app.use(QuarKernelPlugin, { kernel });

    const container = document.createElement('div');
    app.mount(container);

    await kernel.emit('test:event', { message: 'hello' });

    expect(events).toEqual(['hello']);
  });
});
