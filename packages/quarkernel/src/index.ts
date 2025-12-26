/**
 * QuarKernel v2 - Micro Custom Events Kernel
 *
 * A TypeScript event kernel with unique features:
 * - Dependency-ordered listeners
 * - Shared context between listeners
 * - Composite events with context merging
 * - AbortSignal support for cleanup
 * - Wildcard pattern matching
 * - Zero runtime dependencies
 */

export const VERSION = '2.0.0-alpha';

// Core exports
export { KernelEvent } from './kernel-event.js';
export { Kernel, createKernel } from './kernel.js';
export { ListenerContext } from './listener-context.js';

// Composition
export { Composition, createComposition, createNamespacedMerger, createOverrideMerger } from './composition/index.js';
export type { EventName as CompositionEventName, ContextMerger, ConflictInfo, CompositionOptions } from './composition/index.js';

// Export all types and interfaces
export type {
  EventName,
  EventData,
  EventMap,
  IKernelEvent,
  IKernel,
  IListenerContext,
  ListenerFunction,
  PredicateFunction,
  ListenerOptions,
  ListenerEntry,
  KernelOptions,
  EventStack,
  CompositionFactory,
  IComposition,
  ContextMergerFunction,
  EventNames,
  EventDataType,
  UnbindFunction,
} from './types';

// Export type guards
export {
  isEventName,
  isListenerFunction,
  isPredicateFunction,
  isContextMerger,
  isContextMergerFunction,
  isListenerOptions,
  isKernelEvent,
} from './types';

// Export error classes
export {
  CircularDependencyError,
  MissingDependencyError,
  MaxListenersExceededError,
} from './types';

// Internal utilities
export { toposort, CyclicDependencyError, type TopoNode } from './toposort.js';
