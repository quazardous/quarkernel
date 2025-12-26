/**
 * ListenerContext provides metadata and utilities for event listeners.
 * Passed as the second parameter to listener callbacks: (event, ctx) => {}
 *
 * Features:
 * - Listener metadata (id, eventName, priority, dependencies)
 * - Cancellation via cancel() or AbortSignal
 * - Event emission from within listeners
 * - Propagation control
 */

import type { KernelEvent } from './kernel-event';

/**
 * Context object passed to each listener callback.
 * Provides utilities for listener self-management without polluting the event object.
 */
export class ListenerContext {
  /** Unique identifier for this listener instance */
  readonly id: string;

  /** Event name this listener is registered for */
  readonly eventName: string;

  /** Listener priority (higher = earlier execution) */
  readonly priority: number;

  /** Listener dependencies (IDs of listeners that must execute first) */
  readonly dependencies: readonly string[];

  /** AbortSignal for cancellation (if provided during registration) */
  readonly signal?: AbortSignal;

  /** Reference to the kernel instance for emit/off operations */
  private readonly kernel: ListenerContextKernel;

  /** Reference to the listener function for removal */
  private readonly listenerFn: Function;

  /** Current event being processed (set during emit) */
  private currentEvent?: KernelEvent<any>;

  /**
   * Creates a new ListenerContext.
   * @internal Use Kernel.on() to register listeners, which creates contexts automatically.
   */
  constructor(
    id: string,
    eventName: string,
    priority: number,
    dependencies: readonly string[],
    kernel: ListenerContextKernel,
    listenerFn: Function,
    signal?: AbortSignal
  ) {
    this.id = id;
    this.eventName = eventName;
    this.priority = priority;
    this.dependencies = dependencies;
    this.kernel = kernel;
    this.listenerFn = listenerFn;
    this.signal = signal;

    // Note: AbortSignal handling is managed by Kernel.on() (kernel.ts:131-138)
    // to avoid duplicate listeners. The signal is stored here for reference only.
  }

  /**
   * Sets the current event being processed.
   * @internal Called by Kernel during emit()
   */
  setCurrentEvent = (event: KernelEvent<any>): void => {
    this.currentEvent = event;
  };

  /**
   * Clears the current event after processing.
   * @internal Called by Kernel after listener execution
   */
  clearCurrentEvent = (): void => {
    this.currentEvent = undefined;
  };

  /**
   * Removes this listener from the kernel.
   * Alias for kernel.off() with this listener's reference.
   */
  cancel = (): void => {
    this.kernel.off(this.eventName, this.listenerFn);
  };

  /**
   * Alias for cancel() to match common naming patterns.
   */
  off = (): void => {
    this.cancel();
  };

  /**
   * Emits an event from within this listener.
   * Delegates to kernel.emit().
   */
  emit = async <T = any>(eventName: string, data?: T): Promise<void> => {
    return this.kernel.emit(eventName, data);
  };

  /**
   * Stops propagation of the current event to remaining listeners.
   * Requires an event to be currently processing.
   */
  stopPropagation = (): void => {
    if (!this.currentEvent) {
      throw new Error('stopPropagation() can only be called during event processing');
    }
    this.currentEvent.stopPropagation();
  };
}

/**
 * Minimal kernel interface required by ListenerContext.
 * Prevents circular dependencies between ListenerContext and Kernel.
 */
export interface ListenerContextKernel {
  off(eventName: string, listener: Function): void;
  emit<T = any>(eventName: string, data?: T): Promise<void>;
}

/**
 * WeakMap storage for listener contexts to prevent memory leaks.
 * Maps listener function to its context.
 */
const contextStorage = new WeakMap<Function, ListenerContext>();

/**
 * Associates a listener function with its context.
 * @internal Used by Kernel during listener registration
 */
export const setListenerContext = (fn: Function, ctx: ListenerContext): void => {
  contextStorage.set(fn, ctx);
};

/**
 * Retrieves the context for a listener function.
 * @internal Used by Kernel during listener execution
 */
export const getListenerContext = (fn: Function): ListenerContext | undefined => {
  return contextStorage.get(fn);
};

/**
 * Removes the context for a listener function.
 * @internal Used by Kernel during listener removal
 */
export const deleteListenerContext = (fn: Function): boolean => {
  return contextStorage.delete(fn);
};
