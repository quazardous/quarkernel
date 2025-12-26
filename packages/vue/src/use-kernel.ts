/**
 * Vue composable for accessing QuarKernel instance
 *
 * Provides type-safe access to the kernel instance registered via plugin.
 * Includes SSR guards to prevent server-side usage.
 */

import { inject, getCurrentInstance } from 'vue';
import type { Kernel } from '@quazardous/quarkernel';
import { KERNEL_INJECTION_KEY } from './plugin.js';

/**
 * Check if running in SSR context
 * @internal
 */
function isSSR(): boolean {
  return typeof window === 'undefined';
}

/**
 * Composable to access QuarKernel instance from components
 *
 * Must be called within setup() function of a component where the plugin was installed.
 * Throws error if plugin not installed or called outside setup context.
 * Warns when accessed during SSR.
 *
 * @example
 * ```ts
 * import { useKernel } from '@quazardous/quarkernel-vue';
 *
 * export default {
 *   setup() {
 *     const kernel = useKernel();
 *
 *     kernel.on('user:login', async (event) => {
 *       console.log('User logged in:', event.data);
 *     });
 *
 *     return {};
 *   }
 * }
 * ```
 */
export function useKernel<T extends Kernel = Kernel>(): T {
  // Check if called within Vue component setup
  const instance = getCurrentInstance();
  if (!instance) {
    throw new Error('[QuarKernel Vue] useKernel() must be called within setup() function');
  }

  // SSR guard - warn but don't block (for flexibility)
  if (isSSR()) {
    console.warn(
      '[QuarKernel Vue] useKernel() called during server-side rendering. ' +
      'Kernel events should typically run client-side only. ' +
      'Ensure you guard kernel usage in onMounted() or similar lifecycle hooks.'
    );
  }

  // Inject kernel instance
  const kernel = inject<T>(KERNEL_INJECTION_KEY);

  if (!kernel) {
    throw new Error(
      '[QuarKernel Vue] Kernel instance not found. ' +
      'Did you install QuarKernelPlugin with app.use(QuarKernelPlugin, { kernel })?'
    );
  }

  return kernel;
}
