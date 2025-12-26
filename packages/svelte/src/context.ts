/**
 * Svelte context API for QuarKernel integration
 *
 * Provides setKernel/getKernel for dependency injection and onEvent
 * composable for event subscriptions with automatic cleanup.
 */

import { getContext, setContext, onDestroy } from 'svelte';
import type { Kernel } from '@quazardous/quarkernel';

/**
 * Context key for kernel instance
 * @internal
 */
const KERNEL_CONTEXT_KEY = Symbol('quarkernel');

/**
 * Error thrown when getKernel is called outside context
 */
export class KernelContextError extends Error {
  constructor() {
    super(
      'getKernel() must be called within a component where setKernel() was used. ' +
      'Ensure you call setKernel(kernel) in a parent component.'
    );
    this.name = 'KernelContextError';
  }
}

/**
 * Store kernel instance in Svelte context
 *
 * Must be called during component initialization (top level of component script).
 * Makes kernel available to all child components via getKernel().
 *
 * @param kernel - Kernel instance to provide to child components
 *
 * @example
 * ```svelte
 * <script>
 *   import { createKernel } from '@quazardous/quarkernel';
 *   import { setKernel } from '@quazardous/quarkernel-svelte';
 *
 *   const kernel = createKernel();
 *   setKernel(kernel);
 * </script>
 * ```
 */
export function setKernel(kernel: Kernel): void {
  if (!kernel) {
    throw new Error('[QuarKernel Svelte] setKernel() requires a kernel instance');
  }

  setContext(KERNEL_CONTEXT_KEY, kernel);
}

/**
 * Retrieve kernel instance from Svelte context
 *
 * Must be called within a component where a parent called setKernel().
 * Throws KernelContextError if kernel not found in context.
 *
 * @throws {KernelContextError} If called outside context or before setKernel()
 * @returns The kernel instance
 *
 * @example
 * ```svelte
 * <script>
 *   import { getKernel } from '@quazardous/quarkernel-svelte';
 *
 *   const kernel = getKernel();
 *
 *   // Use kernel directly
 *   kernel.emit('user:login', { id: 123 });
 * </script>
 * ```
 */
export function getKernel<T extends Kernel = Kernel>(): T {
  const kernel = getContext<T>(KERNEL_CONTEXT_KEY);

  if (!kernel) {
    throw new KernelContextError();
  }

  return kernel;
}

/**
 * Register an event listener with automatic cleanup on component destroy
 *
 * Convenience wrapper around kernel.on() that:
 * - Retrieves kernel from context
 * - Registers the listener
 * - Automatically unsubscribes when component is destroyed
 * - Returns unsubscribe function for manual cleanup
 *
 * @param pattern - Event name or pattern (supports wildcards)
 * @param handler - Event handler function
 * @returns Unsubscribe function to manually remove listener before destroy
 *
 * @example
 * ```svelte
 * <script>
 *   import { onEvent } from '@quazardous/quarkernel-svelte';
 *
 *   // Auto-cleanup on component destroy
 *   onEvent('user:*', async (event) => {
 *     console.log('User event:', event.data);
 *   });
 *
 *   // Manual cleanup if needed
 *   const unsubscribe = onEvent('cart:update', (event) => {
 *     console.log('Cart updated');
 *   });
 *
 *   function handleClick() {
 *     unsubscribe(); // Remove listener early
 *   }
 * </script>
 * ```
 */
export function onEvent(
  pattern: string,
  handler: (event: any, ctx: any) => void | Promise<void>
): () => void {
  const kernel = getKernel();

  // Register listener and get unsubscribe function
  const unsubscribe = kernel.on(pattern, handler);

  // Auto-cleanup on component destroy
  onDestroy(() => {
    unsubscribe();
  });

  return unsubscribe;
}
