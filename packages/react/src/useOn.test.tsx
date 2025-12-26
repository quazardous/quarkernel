/**
 * Tests for useOn hook
 */

import { describe, it, expect, vi } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { createKernel } from '@quazardous/quarkernel';
import { KernelProvider } from './KernelProvider.js';
import { useOn } from './useOn.js';

describe('useOn', () => {
  it('registers event listener on mount', async () => {
    const kernel = createKernel();
    const handler = vi.fn();

    function TestComponent() {
      useOn('test:event', handler);
      return <div>Test</div>;
    }

    render(
      <KernelProvider kernel={kernel}>
        <TestComponent />
      </KernelProvider>
    );

    await act(async () => {
      await kernel.emit('test:event', { value: 42 });
    });

    await waitFor(() => {
      expect(handler).toHaveBeenCalledTimes(1);
    });

    expect(handler.mock.calls[0][0].data).toEqual({ value: 42 });
  });

  it('removes listener on unmount', async () => {
    const kernel = createKernel();
    const handler = vi.fn();

    function TestComponent() {
      useOn('test:event', handler);
      return <div>Test</div>;
    }

    const { unmount } = render(
      <KernelProvider kernel={kernel}>
        <TestComponent />
      </KernelProvider>
    );

    await act(async () => {
      await kernel.emit('test:event', { value: 1 });
    });

    await waitFor(() => {
      expect(handler).toHaveBeenCalledTimes(1);
    });

    unmount();

    await kernel.emit('test:event', { value: 2 });

    // Should still be called only once (not called after unmount)
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('handles listener options correctly', async () => {
    const kernel = createKernel();
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    function TestComponent() {
      useOn('test:event', handler1, { id: 'first', priority: 1 });
      useOn('test:event', handler2, { id: 'second', priority: 2 });
      return <div>Test</div>;
    }

    render(
      <KernelProvider kernel={kernel}>
        <TestComponent />
      </KernelProvider>
    );

    await act(async () => {
      await kernel.emit('test:event', {});
    });

    await waitFor(() => {
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    // handler2 should be called first (higher priority)
    expect(handler2.mock.invocationCallOrder[0]).toBeLessThan(
      handler1.mock.invocationCallOrder[0]
    );
  });

  it('supports AbortSignal for manual cleanup', async () => {
    const kernel = createKernel();
    const handler = vi.fn();
    const controller = new AbortController();

    function TestComponent() {
      useOn('test:event', handler, { signal: controller.signal });
      return <div>Test</div>;
    }

    render(
      <KernelProvider kernel={kernel}>
        <TestComponent />
      </KernelProvider>
    );

    await act(async () => {
      await kernel.emit('test:event', { value: 1 });
    });

    await waitFor(() => {
      expect(handler).toHaveBeenCalledTimes(1);
    });

    // Abort the signal
    controller.abort();

    await kernel.emit('test:event', { value: 2 });

    // Should still be called only once (aborted after first call)
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('cleans up AbortSignal listener on unmount', async () => {
    const kernel = createKernel();
    const handler = vi.fn();
    const controller = new AbortController();

    // Spy on addEventListener to verify cleanup
    const addEventListenerSpy = vi.spyOn(controller.signal, 'addEventListener');
    const removeEventListenerSpy = vi.spyOn(controller.signal, 'removeEventListener');

    function TestComponent() {
      useOn('test:event', handler, { signal: controller.signal });
      return <div>Test</div>;
    }

    const { unmount } = render(
      <KernelProvider kernel={kernel}>
        <TestComponent />
      </KernelProvider>
    );

    expect(addEventListenerSpy).toHaveBeenCalledWith('abort', expect.any(Function), { once: true });

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalled();

    addEventListenerSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
  });

  it('does not remove abort listener if already aborted on unmount', async () => {
    const kernel = createKernel();
    const handler = vi.fn();
    const controller = new AbortController();

    function TestComponent() {
      useOn('test:event', handler, { signal: controller.signal });
      return <div>Test</div>;
    }

    const { unmount } = render(
      <KernelProvider kernel={kernel}>
        <TestComponent />
      </KernelProvider>
    );

    // Abort before unmount
    controller.abort();

    const removeEventListenerSpy = vi.spyOn(controller.signal, 'removeEventListener');

    unmount();

    // Should not try to remove listener since signal already aborted
    expect(removeEventListenerSpy).not.toHaveBeenCalled();

    removeEventListenerSpy.mockRestore();
  });

  it('works with typed events', async () => {
    interface Events {
      'user:login': { userId: string };
      'user:logout': undefined;
    }

    const kernel = createKernel<Events>();
    const handler = vi.fn();

    function TestComponent() {
      useOn<Events, 'user:login'>('user:login', handler);
      return <div>Test</div>;
    }

    render(
      <KernelProvider kernel={kernel}>
        <TestComponent />
      </KernelProvider>
    );

    await act(async () => {
      await kernel.emit('user:login', { userId: 'test-123' });
    });

    await waitFor(() => {
      expect(handler).toHaveBeenCalledTimes(1);
    });

    expect(handler.mock.calls[0][0].data.userId).toBe('test-123');
  });

  it('handles multiple events with same handler', async () => {
    const kernel = createKernel();
    const handler = vi.fn();

    function TestComponent() {
      useOn('event:a', handler);
      useOn('event:b', handler);
      return <div>Test</div>;
    }

    render(
      <KernelProvider kernel={kernel}>
        <TestComponent />
      </KernelProvider>
    );

    await act(async () => {
      await kernel.emit('event:a', { source: 'a' });
      await kernel.emit('event:b', { source: 'b' });
    });

    await waitFor(() => {
      expect(handler).toHaveBeenCalledTimes(2);
    });

    expect(handler.mock.calls[0][0].data.source).toBe('a');
    expect(handler.mock.calls[1][0].data.source).toBe('b');
  });

  it('works with once option', async () => {
    const kernel = createKernel();
    const handler = vi.fn();

    function TestComponent() {
      useOn('test:event', handler, { once: true });
      return <div>Test</div>;
    }

    render(
      <KernelProvider kernel={kernel}>
        <TestComponent />
      </KernelProvider>
    );

    await act(async () => {
      await kernel.emit('test:event', { value: 1 });
      await kernel.emit('test:event', { value: 2 });
    });

    await waitFor(() => {
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  it('works with after dependency', async () => {
    const kernel = createKernel();
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    function TestComponent() {
      useOn('test:event', handler1, { id: 'first' });
      useOn('test:event', handler2, { id: 'second', after: 'first' });
      return <div>Test</div>;
    }

    render(
      <KernelProvider kernel={kernel}>
        <TestComponent />
      </KernelProvider>
    );

    await act(async () => {
      await kernel.emit('test:event', {});
    });

    await waitFor(() => {
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    // handler1 should be called before handler2
    expect(handler1.mock.invocationCallOrder[0]).toBeLessThan(
      handler2.mock.invocationCallOrder[0]
    );
  });
});
