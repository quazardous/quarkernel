/**
 * Vue composable for event listener registration with automatic cleanup
 *
 * Automatically removes the listener when the component is unmounted.
 * Supports manual cleanup via AbortSignal.
 */

import { onUnmounted } from 'vue';
import type { ListenerFunction, ListenerOptions } from '@quazardous/quarkernel';
import { useKernel } from './use-kernel.js';

/**
 * Composable to register event listeners with automatic cleanup
 *
 * The listener is automatically removed when the component unmounts via Vue's
 * onUnmounted lifecycle hook. Manual cleanup is also supported via AbortSignal.
 *
 * @template K - Event name type
 * @param eventName - Event name to listen for
 * @param handler - Listener function
 * @param options - Listener options (optional)
 * @returns Cleanup function to manually remove listener
 *
 * @example
 * ```ts
 * import { useOn } from '@quazardous/quarkernel-vue';
 *
 * export default {
 *   setup() {
 *     // Automatically cleaned up on unmount
 *     useOn('user:login', async (event) => {
 *       console.log('User logged in:', event.data);
 *     });
 *
 *     // With options
 *     useOn('data:update', handler, {
 *       priority: 10,
 *       id: 'my-listener'
 *     });
 *
 *     // Manual cleanup via AbortSignal
 *     const controller = new AbortController();
 *     useOn('events', handler, {
 *       signal: controller.signal
 *     });
 *     // Later: controller.abort();
 *   }
 * }
 * ```
 */
export function useOn<K extends string = string>(
  eventName: K,
  handler: ListenerFunction,
  options?: ListenerOptions
): () => void {
  const kernel = useKernel();

  // Register listener on kernel
  const unbind = kernel.on(eventName, handler, options);

  // Auto-cleanup on component unmount
  onUnmounted(() => {
    unbind();
  });

  // Return unbind for manual cleanup
  return unbind;
}
