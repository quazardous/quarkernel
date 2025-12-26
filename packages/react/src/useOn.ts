/**
 * useOn - React hook for event listeners with automatic cleanup
 *
 * Registers an event listener on the kernel and automatically removes it
 * when the component unmounts or dependencies change.
 */

import { useEffect } from 'react';
import type { EventMap, ListenerFunction, ListenerOptions } from '@quazardous/quarkernel';
import { useKernel } from './useKernel.js';

/**
 * Hook to register an event listener with automatic cleanup
 *
 * The listener is registered when the component mounts and automatically
 * removed when the component unmounts or when dependencies change.
 *
 * @param eventName - Event name to listen to
 * @param handler - Listener function to execute when event fires
 * @param options - Optional listener options (priority, after, signal, etc.)
 *
 * @example
 * ```tsx
 * function UserStatus() {
 *   useOn('user:login', (event, context) => {
 *     console.log('User logged in:', event.data.userId);
 *   });
 *
 *   return <div>User Status</div>;
 * }
 * ```
 *
 * @example With options
 * ```tsx
 * function PriorityListener() {
 *   useOn('app:init', handler, {
 *     priority: 10,
 *     after: 'core-init'
 *   });
 *
 *   return <div>App</div>;
 * }
 * ```
 *
 * @example With AbortSignal
 * ```tsx
 * function ConditionalListener() {
 *   const [enabled, setEnabled] = useState(true);
 *   const controller = useMemo(() => new AbortController(), []);
 *
 *   useOn('data:update', handler, {
 *     signal: controller.signal
 *   });
 *
 *   const disable = () => controller.abort();
 *
 *   return <button onClick={disable}>Disable</button>;
 * }
 * ```
 */
export function useOn<Events extends EventMap = EventMap, K extends keyof Events = keyof Events>(
  eventName: K,
  handler: ListenerFunction<Events[K]>,
  options?: ListenerOptions
): void {
  const kernel = useKernel<Events>();

  useEffect(() => {
    // Register listener and get cleanup function
    const off = kernel.on(eventName, handler, options);

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
  }, [kernel, eventName, handler, options]);
}
