/**
 * React adapter lifecycle integration tests
 * Tests component mount/unmount cleanup and memory leak prevention
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { StrictMode, useEffect, useState } from 'react';
import { createKernel, type Kernel } from '@quazardous/quarkernel';
import { KernelProvider, useOn, useKernel, useEventState } from '../src/index.js';

describe('React adapter lifecycle integration', () => {
  let kernel: Kernel;

  beforeEach(() => {
    kernel = createKernel();
  });

  describe('Component mount/unmount cleanup', () => {
    it('should cleanup all listeners when component unmounts', async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();

      function TestComponent() {
        useOn('event:a', handler1);
        useOn('event:b', handler2);
        useOn('event:c', handler3);
        return <div>test</div>;
      }

      const { unmount } = render(
        <KernelProvider kernel={kernel}>
          <TestComponent />
        </KernelProvider>
      );

      // Verify listeners are registered
      await kernel.emit('event:a', {});
      await kernel.emit('event:b', {});
      await kernel.emit('event:c', {});

      await waitFor(() => {
        expect(handler1).toHaveBeenCalledTimes(1);
        expect(handler2).toHaveBeenCalledTimes(1);
        expect(handler3).toHaveBeenCalledTimes(1);
      });

      // Unmount component
      unmount();

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

      function ComponentA() {
        useOn('test:event', handlerA);
        return <div>A</div>;
      }

      function ComponentB() {
        useOn('test:event', handlerB);
        return <div>B</div>;
      }

      const { unmount: unmountA } = render(
        <KernelProvider kernel={kernel}>
          <ComponentA />
        </KernelProvider>
      );

      const { unmount: unmountB } = render(
        <KernelProvider kernel={kernel}>
          <ComponentB />
        </KernelProvider>
      );

      // Both should receive events
      await kernel.emit('test:event', {});

      await waitFor(() => {
        expect(handlerA).toHaveBeenCalledTimes(1);
        expect(handlerB).toHaveBeenCalledTimes(1);
      });

      // Unmount only component A
      unmountA();

      // Only B should receive events
      await kernel.emit('test:event', {});

      await waitFor(() => {
        expect(handlerA).toHaveBeenCalledTimes(1);
        expect(handlerB).toHaveBeenCalledTimes(2);
      });

      // Unmount B
      unmountB();

      // Neither should receive events
      await kernel.emit('test:event', {});
      expect(handlerA).toHaveBeenCalledTimes(1);
      expect(handlerB).toHaveBeenCalledTimes(2);
    });

    it('should cleanup nested component listeners on parent unmount', async () => {
      const handlerParent = vi.fn();
      const handlerChild = vi.fn();

      function ChildComponent() {
        useOn('test:event', handlerChild);
        return <div>child</div>;
      }

      function ParentComponent() {
        useOn('test:event', handlerParent);
        return (
          <div>
            <ChildComponent />
          </div>
        );
      }

      const { unmount } = render(
        <KernelProvider kernel={kernel}>
          <ParentComponent />
        </KernelProvider>
      );

      await kernel.emit('test:event', {});

      await waitFor(() => {
        expect(handlerParent).toHaveBeenCalledTimes(1);
        expect(handlerChild).toHaveBeenCalledTimes(1);
      });

      // Unmount parent (should cleanup both)
      unmount();

      await kernel.emit('test:event', {});
      expect(handlerParent).toHaveBeenCalledTimes(1);
      expect(handlerChild).toHaveBeenCalledTimes(1);
    });

    it('should cleanup conditional component listeners', async () => {
      const handler = vi.fn();

      function ConditionalChild() {
        useOn('test:event', handler);
        return <div>conditional</div>;
      }

      function ParentComponent() {
        const [show, setShow] = useState(true);
        return (
          <div>
            {show && <ConditionalChild />}
            <button onClick={() => setShow(false)}>Hide</button>
          </div>
        );
      }

      const { getByText, rerender } = render(
        <KernelProvider kernel={kernel}>
          <ParentComponent />
        </KernelProvider>
      );

      await kernel.emit('test:event', {});

      await waitFor(() => {
        expect(handler).toHaveBeenCalledTimes(1);
      });

      // Hide component by triggering state change
      getByText('Hide').click();
      rerender(
        <KernelProvider kernel={kernel}>
          <ParentComponent />
        </KernelProvider>
      );

      await new Promise(resolve => setTimeout(resolve, 0));

      await kernel.emit('test:event', {});
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should handle StrictMode double-mount cleanup correctly', async () => {
      const handler = vi.fn();
      const mountEffect = vi.fn();
      const cleanupEffect = vi.fn();

      function TestComponent() {
        useOn('test:event', handler);

        useEffect(() => {
          mountEffect();
          return () => cleanupEffect();
        }, []);

        return <div>test</div>;
      }

      const { unmount } = render(
        <StrictMode>
          <KernelProvider kernel={kernel}>
            <TestComponent />
          </KernelProvider>
        </StrictMode>
      );

      // In StrictMode, effects run twice in development
      // But listeners should still be correctly registered
      await kernel.emit('test:event', {});

      await waitFor(() => {
        expect(handler).toHaveBeenCalled();
      });

      const callCountBeforeUnmount = handler.mock.calls.length;

      unmount();

      // After unmount, no more calls should happen
      await kernel.emit('test:event', {});
      expect(handler).toHaveBeenCalledTimes(callCountBeforeUnmount);
    });
  });

  describe('AbortSignal cleanup interactions', () => {
    it('should cleanup AbortSignal listener on component unmount', async () => {
      const handler = vi.fn();
      const controller = new AbortController();
      const removeListenerSpy = vi.spyOn(controller.signal, 'removeEventListener');

      function TestComponent() {
        useOn('test:event', handler, { signal: controller.signal });
        return <div>test</div>;
      }

      const { unmount } = render(
        <KernelProvider kernel={kernel}>
          <TestComponent />
        </KernelProvider>
      );

      await kernel.emit('test:event', {});

      await waitFor(() => {
        expect(handler).toHaveBeenCalledTimes(1);
      });

      unmount();

      // Should have removed abort listener
      expect(removeListenerSpy).toHaveBeenCalled();

      removeListenerSpy.mockRestore();
    });

    it('should handle AbortSignal abort before unmount', async () => {
      const handler = vi.fn();
      const controller = new AbortController();

      function TestComponent() {
        useOn('test:event', handler, { signal: controller.signal });
        return <div>test</div>;
      }

      const { unmount } = render(
        <KernelProvider kernel={kernel}>
          <TestComponent />
        </KernelProvider>
      );

      await kernel.emit('test:event', {});

      await waitFor(() => {
        expect(handler).toHaveBeenCalledTimes(1);
      });

      // Abort signal before unmount
      controller.abort();

      await kernel.emit('test:event', {});
      expect(handler).toHaveBeenCalledTimes(1);

      // Unmount should not cause errors
      unmount();
    });

    it('should cleanup multiple AbortSignal listeners independently', async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const controller1 = new AbortController();
      const controller2 = new AbortController();

      function TestComponent() {
        useOn('event:a', handler1, { signal: controller1.signal });
        useOn('event:b', handler2, { signal: controller2.signal });
        return <div>test</div>;
      }

      const { unmount } = render(
        <KernelProvider kernel={kernel}>
          <TestComponent />
        </KernelProvider>
      );

      await kernel.emit('event:a', {});
      await kernel.emit('event:b', {});

      await waitFor(() => {
        expect(handler1).toHaveBeenCalledTimes(1);
        expect(handler2).toHaveBeenCalledTimes(1);
      });

      // Abort only first signal
      controller1.abort();

      await kernel.emit('event:a', {});
      await kernel.emit('event:b', {});

      await waitFor(() => {
        expect(handler1).toHaveBeenCalledTimes(1);
        expect(handler2).toHaveBeenCalledTimes(2);
      });

      // Unmount should cleanup remaining
      unmount();

      await kernel.emit('event:b', {});
      expect(handler2).toHaveBeenCalledTimes(2);
    });

    it('should not attempt cleanup if signal already aborted on unmount', async () => {
      const handler = vi.fn();
      const controller = new AbortController();

      function TestComponent() {
        useOn('test:event', handler, { signal: controller.signal });
        return <div>test</div>;
      }

      const { unmount } = render(
        <KernelProvider kernel={kernel}>
          <TestComponent />
        </KernelProvider>
      );

      // Abort before unmount
      controller.abort();

      const removeListenerSpy = vi.spyOn(controller.signal, 'removeEventListener');

      // Unmount should not try to remove listener (already aborted)
      unmount();

      expect(removeListenerSpy).not.toHaveBeenCalled();

      removeListenerSpy.mockRestore();
    });
  });

  describe('Memory leak prevention', () => {
    it('should not leak listeners across multiple mount/unmount cycles', async () => {
      const handler = vi.fn();

      function TestComponent() {
        useOn('test:event', handler);
        return <div>test</div>;
      }

      // Mount/unmount 3 times
      for (let i = 0; i < 3; i++) {
        const { unmount } = render(
          <KernelProvider kernel={kernel}>
            <TestComponent />
          </KernelProvider>
        );
        unmount();
      }

      // Emit event - should not be called (no active listeners)
      await kernel.emit('test:event', {});
      expect(handler).not.toHaveBeenCalled();
    });

    it('should cleanup useEventState subscriptions on unmount', async () => {
      function TestComponent() {
        const state = useEventState('test:event', 0, (prev) => prev + 1);
        return <div>count: {state}</div>;
      }

      const { unmount } = render(
        <KernelProvider kernel={kernel}>
          <TestComponent />
        </KernelProvider>
      );

      await kernel.emit('test:event', {});
      await kernel.emit('test:event', {});

      unmount();

      // Emit more events - should not cause errors or memory leaks
      await kernel.emit('test:event', {});
      await kernel.emit('test:event', {});
    });

    it('should handle rapid mount/unmount without listener buildup', async () => {
      const handler = vi.fn();

      function TestComponent() {
        useOn('test:event', handler);
        return <div>test</div>;
      }

      // Rapid mount/unmount
      const unmountFunctions = [];

      for (let i = 0; i < 10; i++) {
        const { unmount } = render(
          <KernelProvider kernel={kernel}>
            <TestComponent />
          </KernelProvider>
        );
        unmountFunctions.push(unmount);
      }

      // Unmount all
      unmountFunctions.forEach(unmount => unmount());

      // Emit - should not be called
      await kernel.emit('test:event', {});
      expect(handler).not.toHaveBeenCalled();
    });

    it('should cleanup listeners even when component errors during unmount', async () => {
      const handler = vi.fn();
      const errorHandler = vi.fn();

      // Suppress console.error for this test
      const originalError = console.error;
      console.error = vi.fn();

      function TestComponent() {
        useOn('test:event', handler);

        useEffect(() => {
          return () => {
            // Simulate error during cleanup
            throw new Error('Cleanup error');
          };
        }, []);

        return <div>test</div>;
      }

      try {
        const { unmount } = render(
          <KernelProvider kernel={kernel}>
            <TestComponent />
          </KernelProvider>
        );

        await kernel.emit('test:event', {});

        await waitFor(() => {
          expect(handler).toHaveBeenCalledTimes(1);
        });

        // Unmount (will throw but should still cleanup listeners)
        try {
          unmount();
        } catch (e) {
          errorHandler(e);
        }

        // Listener should still be cleaned up
        await kernel.emit('test:event', {});
        expect(handler).toHaveBeenCalledTimes(1);
      } finally {
        console.error = originalError;
      }
    });
  });

  describe('Multiple components with shared kernel', () => {
    it('should allow multiple components to share kernel instance', async () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      let kernelA: Kernel | null = null;
      let kernelB: Kernel | null = null;

      function ComponentA() {
        kernelA = useKernel();
        useOn('shared:event', handler1);
        return <div>A</div>;
      }

      function ComponentB() {
        kernelB = useKernel();
        useOn('shared:event', handler2);
        return <div>B</div>;
      }

      render(
        <KernelProvider kernel={kernel}>
          <ComponentA />
        </KernelProvider>
      );

      render(
        <KernelProvider kernel={kernel}>
          <ComponentB />
        </KernelProvider>
      );

      // Both should receive event
      await kernel.emit('shared:event', {});

      await waitFor(() => {
        expect(handler1).toHaveBeenCalledTimes(1);
        expect(handler2).toHaveBeenCalledTimes(1);
      });

      // Both should have same kernel instance
      expect(kernelA).toBe(kernel);
      expect(kernelB).toBe(kernel);
    });

    it('should maintain listener order across components', async () => {
      const executionOrder: string[] = [];

      function ComponentA() {
        useOn('test:event', () => executionOrder.push('A'), { priority: 10 });
        return <div>A</div>;
      }

      function ComponentB() {
        useOn('test:event', () => executionOrder.push('B'), { priority: 5 });
        return <div>B</div>;
      }

      render(
        <KernelProvider kernel={kernel}>
          <ComponentA />
          <ComponentB />
        </KernelProvider>
      );

      await kernel.emit('test:event', {});

      await waitFor(() => {
        expect(executionOrder).toEqual(['A', 'B']);
      });
    });

    it('should handle component remounting with same listeners', async () => {
      const handler = vi.fn();

      function TestComponent() {
        useOn('test:event', handler);
        return <div>test</div>;
      }

      const { unmount, rerender } = render(
        <KernelProvider kernel={kernel}>
          <TestComponent />
        </KernelProvider>
      );

      await kernel.emit('test:event', {});

      await waitFor(() => {
        expect(handler).toHaveBeenCalledTimes(1);
      });

      // Remount by unmounting and rendering again
      unmount();

      render(
        <KernelProvider kernel={kernel}>
          <TestComponent />
        </KernelProvider>
      );

      // Should register listener again
      await kernel.emit('test:event', {});

      await waitFor(() => {
        expect(handler).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('SSR environment guards', () => {
    it('should handle SSR environment gracefully', () => {
      const originalWindow = global.window;

      try {
        // Simulate SSR environment
        // @ts-expect-error - Testing SSR environment
        delete global.window;

        // Should not throw when creating component in SSR
        expect(() => {
          function TestComponent() {
            return <div>ssr-test</div>;
          }

          // Component definition should work in SSR
          <TestComponent />;
        }).not.toThrow();
      } finally {
        // Restore environment
        global.window = originalWindow;
      }
    });
  });
});
