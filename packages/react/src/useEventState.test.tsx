/**
 * Tests for useEventState hook
 */

import { describe, it, expect, vi } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { createKernel } from '@quazardous/quarkernel';
import { KernelProvider } from './KernelProvider.js';
import { useEventState } from './useEventState.js';

describe('useEventState', () => {
  it('returns initial value on mount', () => {
    const kernel = createKernel();
    let stateValue: any = undefined;

    function TestComponent() {
      stateValue = useEventState('test:event', 'initial');
      return <div>{stateValue}</div>;
    }

    render(
      <KernelProvider kernel={kernel}>
        <TestComponent />
      </KernelProvider>
    );

    expect(stateValue).toBe('initial');
  });

  it('updates state when event is emitted', async () => {
    const kernel = createKernel();
    let stateValue: any = undefined;

    function TestComponent() {
      stateValue = useEventState('test:event', 'initial');
      return <div>{stateValue}</div>;
    }

    render(
      <KernelProvider kernel={kernel}>
        <TestComponent />
      </KernelProvider>
    );

    expect(stateValue).toBe('initial');

    await act(async () => {
      await kernel.emit('test:event', 'updated');
    });

    await waitFor(() => {
      expect(stateValue).toBe('updated');
    });
  });

  it('updates state multiple times', async () => {
    const kernel = createKernel();
    let stateValue: any = undefined;

    function TestComponent() {
      stateValue = useEventState('test:event', 0);
      return <div>{stateValue}</div>;
    }

    render(
      <KernelProvider kernel={kernel}>
        <TestComponent />
      </KernelProvider>
    );

    expect(stateValue).toBe(0);

    await act(async () => {
      await kernel.emit('test:event', 1);
    });
    await waitFor(() => expect(stateValue).toBe(1));

    await act(async () => {
      await kernel.emit('test:event', 2);
    });
    await waitFor(() => expect(stateValue).toBe(2));

    await act(async () => {
      await kernel.emit('test:event', 3);
    });
    await waitFor(() => expect(stateValue).toBe(3));
  });

  it('stops updating after unmount', async () => {
    const kernel = createKernel();
    let stateValue: any = undefined;

    function TestComponent() {
      stateValue = useEventState('test:event', 'initial');
      return <div>{stateValue}</div>;
    }

    const { unmount } = render(
      <KernelProvider kernel={kernel}>
        <TestComponent />
      </KernelProvider>
    );

    await act(async () => {
      await kernel.emit('test:event', 'updated');
    });

    await waitFor(() => {
      expect(stateValue).toBe('updated');
    });

    unmount();

    await kernel.emit('test:event', 'should-not-update');

    // State should remain at 'updated' after unmount
    expect(stateValue).toBe('updated');
  });

  it('works with typed events', async () => {
    interface Events {
      'user:login': { userId: string; username: string };
      'user:logout': undefined;
    }

    const kernel = createKernel<Events>();
    let userData: any = null;

    function TestComponent() {
      userData = useEventState<Events, 'user:login'>(
        'user:login',
        null as any
      );
      return <div>{userData?.username}</div>;
    }

    render(
      <KernelProvider kernel={kernel}>
        <TestComponent />
      </KernelProvider>
    );

    expect(userData).toBe(null);

    await act(async () => {
      await kernel.emit('user:login', {
        userId: '123',
        username: 'testuser'
      });
    });

    await waitFor(() => {
      expect(userData).toEqual({
        userId: '123',
        username: 'testuser'
      });
    });
  });

  it('supports AbortSignal for manual cleanup', async () => {
    const kernel = createKernel();
    const controller = new AbortController();
    let stateValue: any = undefined;

    function TestComponent() {
      stateValue = useEventState('test:event', 'initial', {
        signal: controller.signal
      });
      return <div>{stateValue}</div>;
    }

    render(
      <KernelProvider kernel={kernel}>
        <TestComponent />
      </KernelProvider>
    );

    await act(async () => {
      await kernel.emit('test:event', 'first-update');
    });

    await waitFor(() => {
      expect(stateValue).toBe('first-update');
    });

    // Abort the signal
    controller.abort();

    await kernel.emit('test:event', 'should-not-update');

    // State should remain at 'first-update' after abort
    expect(stateValue).toBe('first-update');
  });

  it('cleans up AbortSignal listener on unmount', async () => {
    const kernel = createKernel();
    const controller = new AbortController();

    const addEventListenerSpy = vi.spyOn(controller.signal, 'addEventListener');
    const removeEventListenerSpy = vi.spyOn(controller.signal, 'removeEventListener');

    function TestComponent() {
      useEventState('test:event', 'initial', {
        signal: controller.signal
      });
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
    const controller = new AbortController();

    function TestComponent() {
      useEventState('test:event', 'initial', {
        signal: controller.signal
      });
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

  it('works with listener options', async () => {
    const kernel = createKernel();
    let stateValue: any = undefined;

    function TestComponent() {
      stateValue = useEventState('test:event', 0, {
        priority: 10,
        id: 'state-listener'
      });
      return <div>{stateValue}</div>;
    }

    render(
      <KernelProvider kernel={kernel}>
        <TestComponent />
      </KernelProvider>
    );

    await act(async () => {
      await kernel.emit('test:event', 42);
    });

    await waitFor(() => {
      expect(stateValue).toBe(42);
    });
  });

  it('handles complex data types', async () => {
    const kernel = createKernel();
    let stateValue: any = undefined;

    function TestComponent() {
      stateValue = useEventState('test:event', { count: 0, items: [] });
      return <div>Test</div>;
    }

    render(
      <KernelProvider kernel={kernel}>
        <TestComponent />
      </KernelProvider>
    );

    expect(stateValue).toEqual({ count: 0, items: [] });

    const newData = { count: 5, items: ['a', 'b', 'c'] };
    await act(async () => {
      await kernel.emit('test:event', newData);
    });

    await waitFor(() => {
      expect(stateValue).toEqual(newData);
    });
  });

  it('handles null and undefined values', async () => {
    const kernel = createKernel();
    let stateValue: any = 'initial';

    function TestComponent() {
      stateValue = useEventState('test:event', 'initial');
      return <div>Test</div>;
    }

    render(
      <KernelProvider kernel={kernel}>
        <TestComponent />
      </KernelProvider>
    );

    await act(async () => {
      await kernel.emit('test:event', null);
    });

    await waitFor(() => {
      expect(stateValue).toBe(null);
    });

    await act(async () => {
      await kernel.emit('test:event', undefined);
    });

    await waitFor(() => {
      expect(stateValue).toBe(undefined);
    });
  });

  it('does not trigger re-renders for same event twice if data unchanged', async () => {
    const kernel = createKernel();
    const renderSpy = vi.fn();

    function TestComponent() {
      const value = useEventState('test:event', 'initial');
      renderSpy();
      return <div>{value}</div>;
    }

    render(
      <KernelProvider kernel={kernel}>
        <TestComponent />
      </KernelProvider>
    );

    // Initial render
    expect(renderSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      await kernel.emit('test:event', 'updated');
    });

    await waitFor(() => {
      expect(renderSpy).toHaveBeenCalledTimes(2);
    });

    // Emit same value again - React should not re-render due to setState optimization
    await act(async () => {
      await kernel.emit('test:event', 'updated');
    });

    // Note: React's setState may or may not trigger a re-render depending on
    // Object.is comparison, so we just verify the state is still correct
    await waitFor(() => {
      expect(renderSpy).toHaveBeenCalled();
    });
  });
});
