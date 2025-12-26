/**
 * useEventState - React hook that maintains state synchronized with events
 *
 * Creates a state value that updates whenever a specific event is emitted.
 * Automatically cleans up the listener when the component unmounts.
 */

import { useState, useEffect } from 'react';
import type { EventMap, ListenerOptions, KernelEvent } from '@quazardous/quarkernel';
import { useKernel } from './useKernel.js';

/**
 * Hook to maintain state that updates on events
 *
 * The state value is updated whenever the specified event fires.
 * The listener is automatically cleaned up when the component unmounts.
 *
 * @param eventName - Event name to listen to
 * @param initialValue - Initial state value
 * @param options - Optional listener options (priority, after, signal, etc.)
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
 * @example With transformer
 * ```tsx
 * function NotificationCount() {
 *   const [count, setCount] = useState(0);
 *
 *   useEventState('notification:new', 0);
 *
 *   // Or manually control the state update
 *   useOn('notification:new', (event) => {
 *     setCount(prev => prev + 1);
 *   });
 *
 *   return <div>Notifications: {count}</div>;
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
  K extends keyof Events = keyof Events
>(
  eventName: K,
  initialValue: Events[K],
  options?: ListenerOptions
): Events[K] {
  const kernel = useKernel<Events>();
  const [state, setState] = useState<Events[K]>(initialValue);

  useEffect(() => {
    // Register listener that updates state
    const off = kernel.on(
      eventName,
      (event: KernelEvent<Events[K]>) => {
        setState(event.data);
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
  }, [kernel, eventName, options]);

  return state;
}
