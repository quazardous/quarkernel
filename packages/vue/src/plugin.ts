/**
 * Vue plugin for QuarKernel integration
 *
 * Provides global kernel instance access via Vue's provide/inject system.
 * Use with app.use(QuarKernelPlugin, { kernel })
 */

import type { App, Plugin } from 'vue';
import type { Kernel } from '@quazardous/quarkernel';

/**
 * Injection key for kernel instance
 * @internal
 */
export const KERNEL_INJECTION_KEY = Symbol('quarkernel');

/**
 * Plugin options
 */
export interface QuarKernelPluginOptions {
  /** Kernel instance to provide globally */
  kernel: Kernel;
}

/**
 * QuarKernel Vue plugin
 *
 * Registers kernel instance globally for access via useKernel() composable
 *
 * @example
 * ```ts
 * import { createApp } from 'vue';
 * import { createKernel } from '@quazardous/quarkernel';
 * import { QuarKernelPlugin } from '@quazardous/quarkernel-vue';
 *
 * const kernel = createKernel();
 * const app = createApp(App);
 *
 * app.use(QuarKernelPlugin, { kernel });
 * ```
 */
export const QuarKernelPlugin: Plugin = {
  install(app: App, options: QuarKernelPluginOptions) {
    if (!options || !options.kernel) {
      throw new Error('[QuarKernel Vue] Plugin requires a kernel instance in options');
    }

    app.provide(KERNEL_INJECTION_KEY, options.kernel);
  },
};
