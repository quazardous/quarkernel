/**
 * useKernel - React hook to access kernel from context
 *
 * Must be used inside a KernelProvider component.
 * Includes SSR safety checks.
 */

import { useContext } from 'react';
import type { Kernel, EventMap } from '@quazardous/quarkernel';
import { KernelContext } from './KernelProvider.js';

/**
 * Error thrown when useKernel is called outside KernelProvider
 */
export class KernelProviderError extends Error {
  constructor() {
    super(
      'useKernel must be used within a KernelProvider. ' +
      'Wrap your component tree with <KernelProvider kernel={kernel}>.'
    );
    this.name = 'KernelProviderError';
  }
}

/**
 * Check if code is running during server-side rendering
 * @internal
 */
function isSSR(): boolean {
  return typeof window === 'undefined';
}

/**
 * React hook to access the kernel instance from context
 *
 * @throws {KernelProviderError} If called outside KernelProvider
 * @returns The kernel instance
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const kernel = useKernel();
 *
 *   useEffect(() => {
 *     return kernel.on('user:login', (event) => {
 *       console.log('User logged in:', event.data);
 *     });
 *   }, [kernel]);
 *
 *   return <div>...</div>;
 * }
 * ```
 */
export function useKernel<Events extends EventMap = EventMap>(): Kernel<Events> {
  if (isSSR()) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn(
        '[QuarKernel] useKernel called during server-side rendering. ' +
        'Event listeners will not work during SSR. ' +
        'Consider using useEffect to register listeners on the client side only.'
      );
    }
  }

  const kernel = useContext(KernelContext);

  if (!kernel) {
    throw new KernelProviderError();
  }

  return kernel as Kernel<Events>;
}
