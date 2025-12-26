/**
 * Vue composable for reactive event state
 *
 * Maintains a reactive ref that updates whenever the specified event is emitted.
 * Automatically removes the listener when the component is unmounted.
 */

import { ref, onUnmounted } from 'vue';
import type { Ref } from 'vue';
import type { ListenerOptions, KernelEvent } from '@quazardous/quarkernel';
import { useKernel } from './use-kernel.js';

/**
 * Options for useEventState composable
 */
export interface UseEventStateOptions extends Omit<ListenerOptions, 'once'> {
  /**
   * Transform function to extract value from event
   * Default: returns event.data
   */
  transform?: (event: KernelEvent) => any;
}

/**
 * Composable to maintain reactive state that updates on events
 *
 * Creates a Vue reactive ref that automatically updates when the specified
 * event is emitted. The listener is automatically removed when the component
 * unmounts via Vue's onUnmounted lifecycle hook.
 *
 * @template T - Value type
 * @template K - Event name type
 * @param eventName - Event name to listen for
 * @param initialValue - Initial value for the ref
 * @param options - Listener options and transform function (optional)
 * @returns Reactive ref that updates on events
 *
 * @example
 * ```ts
 * import { useEventState } from '@quazardous/quarkernel-vue';
 *
 * export default {
 *   setup() {
 *     // Simple usage - updates with event.data
 *     const userCount = useEventState('user:count', 0);
 *
 *     // With transform function
 *     const userName = useEventState(
 *       'user:login',
 *       'Guest',
 *       {
 *         transform: (event) => event.data.name
 *       }
 *     );
 *
 *     // With manual cleanup
 *     const controller = new AbortController();
 *     const status = useEventState('status', 'idle', {
 *       signal: controller.signal
 *     });
 *     // Later: controller.abort();
 *
 *     return { userCount, userName, status };
 *   }
 * }
 * ```
 */
export function useEventState<T = any, K extends string = string>(
  eventName: K,
  initialValue: T,
  options?: UseEventStateOptions
): Ref<T> {
  const kernel = useKernel();
  const state = ref<T>(initialValue) as Ref<T>;

  // Extract transform function from options
  const { transform, ...listenerOptions } = options || {};
  const transformFn = transform || ((event: KernelEvent) => event.data);

  // Register listener that updates state
  const unbind = kernel.on(
    eventName,
    (event: KernelEvent) => {
      state.value = transformFn(event);
    },
    listenerOptions
  );

  // Auto-cleanup on component unmount
  onUnmounted(() => {
    unbind();
  });

  return state;
}
