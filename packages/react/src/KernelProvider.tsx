/**
 * KernelProvider - React Context Provider for QuarKernel
 *
 * Provides kernel instance to child components via React Context.
 * Use useKernel() hook to access the kernel in components.
 */

import { createContext, type ReactNode } from 'react';
import type { Kernel, EventMap } from '@quazardous/quarkernel';

/**
 * React Context for kernel instance
 * @internal
 */
export const KernelContext = createContext<Kernel<any> | null>(null);

/**
 * Props for KernelProvider component
 */
export interface KernelProviderProps<Events extends EventMap = EventMap> {
  /** Kernel instance to provide to children */
  kernel: Kernel<Events>;

  /** Child components that can access the kernel */
  children: ReactNode;
}

/**
 * Provider component that makes kernel available to child components
 *
 * @example
 * ```tsx
 * const kernel = createKernel();
 *
 * function App() {
 *   return (
 *     <KernelProvider kernel={kernel}>
 *       <MyComponent />
 *     </KernelProvider>
 *   );
 * }
 * ```
 */
export function KernelProvider<Events extends EventMap = EventMap>({
  kernel,
  children,
}: KernelProviderProps<Events>) {
  return (
    <KernelContext.Provider value={kernel}>
      {children}
    </KernelContext.Provider>
  );
}
