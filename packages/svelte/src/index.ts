/**
 * @quazardous/quarkernel-svelte
 *
 * Svelte adapter for QuarKernel
 * Provides context API, composables, and reactive stores for Svelte 5+ applications
 */

export { setKernel, getKernel, onEvent, KernelContextError } from './context.js';
export { eventStore, contextStore } from './stores.js';
