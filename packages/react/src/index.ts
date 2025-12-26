/**
 * @quazardous/quarkernel-react - React bindings for QuarKernel
 *
 * Provides Context provider and hooks for using QuarKernel in React applications.
 *
 * @example
 * ```tsx
 * import { createKernel } from '@quazardous/quarkernel';
 * import { KernelProvider, useKernel } from '@quazardous/quarkernel-react';
 *
 * const kernel = createKernel();
 *
 * function App() {
 *   return (
 *     <KernelProvider kernel={kernel}>
 *       <MyComponent />
 *     </KernelProvider>
 *   );
 * }
 *
 * function MyComponent() {
 *   const kernel = useKernel();
 *
 *   useEffect(() => {
 *     return kernel.on('event', (event) => {
 *       console.log(event.data);
 *     });
 *   }, [kernel]);
 *
 *   return <div>...</div>;
 * }
 * ```
 */

export const VERSION = '2.1.0';

// Components
export { KernelProvider, type KernelProviderProps } from './KernelProvider.js';

// Hooks
export { useKernel, KernelProviderError } from './useKernel.js';
export { useOn } from './useOn.js';
export { useEventState, type EventStateSelector, type UseEventStateOptions } from './useEventState.js';
