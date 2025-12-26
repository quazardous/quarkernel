/**
 * useEventState - React hook that maintains state synchronized with events
 *
 * Creates a state value that updates whenever a specific event is emitted.
 * Automatically cleans up the listener when the component unmounts.
 */

import { useState, useEffect, useMemo } from 'react';
import type { EventMap, ListenerOptions, IKernelEvent } from '@quazardous/quarkernel';
import { useKernel } from './useKernel.js';

/**
 * Selector function to extract value from event
 */
export type EventStateSelector<T = any> = (event: IKernelEvent) => T;

/**
 * Options for useEventState hook
 */
export interface UseEventStateOptions<T = any> extends ListenerOptions {
  /**
   * Selector function to extract value from event
   * Default: (event) => event.data
   */
  selector?: EventStateSelector<T>;
}

/**
 * Hook to maintain state that updates on events
 *
 * The state value is updated whenever the specified event fires.
 * The listener is automatically cleaned up when the component unmounts.
 *
 * @param eventName - Event name to listen to
 * @param initialValue - Initial state value
 * @param selectorOrOptions - Optional selector function or options object
 * @returns Current state value
 *
 * @example
 * ```tsx
 * function UserInfo() {
 *   const user = useEventState<Events, 'user:login'>(
 *     'user:login',
 *     null
 *   );
 *
 *   return <div>User: {user?.userId}</div>;
 * }
 * ```
 *
 * @example With selector function
 * ```tsx
 * function Counter() {
 *   const count = useEventState('counter:updated', 0, (event) => event.data.value);
 *
 *   return <div>Count: {count}</div>;
 * }
 * ```
 *
 * @example With options object
 * ```tsx
 * function UserName() {
 *   const name = useEventState('user:login', 'Guest', {
 *     selector: (event) => event.data.name,
 *     priority: 10
 *   });
 *
 *   return <div>Hello, {name}</div>;
 * }
 * ```
 *
 * @example With AbortSignal
 * ```tsx
 * function ConditionalState() {
 *   const controller = useMemo(() => new AbortController(), []);
 *   const value = useEventState('data:update', null, {
 *     signal: controller.signal
 *   });
 *
 *   const stop = () => controller.abort();
 *
 *   return (
 *     <div>
 *       Value: {value}
 *       <button onClick={stop}>Stop Updates</button>
 *     </div>
 *   );
 * }
 * ```
 */
export function useEventState<
  Events extends EventMap = EventMap,
  K extends keyof Events = keyof Events,
  T = Events[K]
>(
  eventName: K,
  initialValue: T,
  selectorOrOptions?: EventStateSelector<T> | UseEventStateOptions<T>
): T {
  const kernel = useKernel<Events>();
  const [state, setState] = useState<T>(initialValue);

  // Normalize options: function becomes selector, object used as-is
  const { selector, options } = useMemo(() => {
    if (typeof selectorOrOptions === 'function') {
      return { selector: selectorOrOptions, options: undefined };
    }
    if (selectorOrOptions) {
      const { selector: sel, ...opts } = selectorOrOptions;
      return { selector: sel, options: Object.keys(opts).length > 0 ? opts : undefined };
    }
    return { selector: undefined, options: undefined };
  }, [selectorOrOptions]);

  // Default selector returns event.data
  const selectorFn = selector || ((event: IKernelEvent) => event.data as T);

  useEffect(() => {
    // Register listener that updates state
    const off = kernel.on(
      eventName,
      (event: IKernelEvent<Events[K]>) => {
        setState(selectorFn(event));
      },
      options
    );

    // If AbortSignal provided, also listen for abort
    if (options?.signal) {
      const abortHandler = () => {
        off();
      };

      options.signal.addEventListener('abort', abortHandler, { once: true });

      // Return cleanup that removes both listener and abort handler
      return () => {
        off();
        if (!options.signal!.aborted) {
          options.signal!.removeEventListener('abort', abortHandler);
        }
      };
    }

    // Return cleanup function
    return off;
  }, [kernel, eventName, selector, options]);

  return state;
}
