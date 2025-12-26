/**
 * Type definitions for QuarKernel v2
 *
 * This module contains all TypeScript types, interfaces, and type guards
 * for the event kernel. Uses strict typing with generic parameters for
 * type-safe event handling.
 */

// ============================================================================
// Event Data Types
// ============================================================================

/**
 * Event name type - can be string or branded type
 */
export type EventName = string;

/**
 * Event data type - the payload for each event
 * Can be any JSON-serializable value or undefined
 */
export type EventData = any;

/**
 * Type map for events - maps event names to their data types
 * @example
 * ```ts
 * interface Events {
 *   'user:login': { userId: string }
 *   'user:logout': { userId: string }
 *   'app:ready': undefined
 * }
 * ```
 */
export type EventMap = Record<EventName, EventData>;

// ============================================================================
// Kernel Event
// ============================================================================

/**
 * Event object passed to listeners
 * @template T - The event data type
 *
 * Note: The actual implementation is in kernel-event.ts
 * This interface is for type checking only
 */
export interface IKernelEvent<T = any> {
  /** Event name */
  readonly name: string;

  /** Event payload (typed, immutable) */
  readonly data: T;

  /** Shared mutable context - passed through listener chain */
  readonly context: Record<string, any>;

  /** Timestamp when event was created */
  readonly timestamp: number;

  /** Stop propagation to remaining listeners */
  stopPropagation(): void;

  /** Whether propagation was stopped */
  readonly isPropagationStopped: boolean;
}

// ============================================================================
// Listener Types
// ============================================================================

/**
 * Listener context - utilities available to each listener
 */
export interface IListenerContext {
  /** Unique identifier of this listener */
  id: string;

  /** Remove this listener */
  off(): void;

  /** Emit another event */
  emit<K extends string = string>(event: K, data?: any): Promise<void>;

  /** Stop propagation to remaining listeners */
  stopPropagation(): void;
}

/**
 * Listener function signature
 * @template T - The event data type
 */
export type ListenerFunction<T = any> = (
  event: IKernelEvent<T>,
  context: IListenerContext
) => void | Promise<void>;

/**
 * Predicate function for conditional once listeners
 *
 * IMPORTANT: Evaluated AFTER listener execution, not before.
 * The event parameter contains the final state after the listener has run.
 *
 * @template T - The event data type
 * @param event - Event with post-execution state (includes listener modifications to context)
 * @returns true to remove the listener, false to keep it for next emission
 */
export type PredicateFunction<T = any> = (event: IKernelEvent<T>) => boolean;

/**
 * Options for registering a listener
 */
export interface ListenerOptions {
  /** Unique identifier for dependency resolution */
  id?: string;

  /** Dependencies - listener IDs that must execute before this one */
  after?: string | string[];

  /** Priority - higher values execute earlier (within same dependency level) */
  priority?: number;

  /**
   * Listen only once - true for always, or predicate function for conditional removal
   *
   * IMPORTANT: The predicate is evaluated AFTER listener execution, not before.
   * This means:
   * - The listener always executes at least once
   * - The predicate receives the event object after the listener has run
   * - The predicate sees any modifications to event.context made by the listener
   * - If the listener throws an error, the predicate still evaluates (with errorBoundary: true)
   * - The listener is removed after execution if predicate returns true
   *
   * @example
   * ```ts
   * // Listener always executes, then removed after execution
   * kernel.on('event', handler, { once: true });
   *
   * // Listener executes each time, removed after count reaches 3
   * kernel.on('event', handler, {
   *   once: (event) => event.context.count >= 3
   * });
   * ```
   */
  once?: boolean | PredicateFunction;

  /** AbortSignal for cleanup */
  signal?: AbortSignal;
}

/**
 * Internal listener entry stored in the kernel
 * @internal
 */
export interface ListenerEntry {
  /** Unique identifier */
  id: string;

  /** The listener function */
  callback: ListenerFunction;

  /** Dependencies (listener IDs) */
  after: string[];

  /** Priority for ordering */
  priority: number;

  /** Listen only once - true for always, or predicate function evaluated after execution */
  once: boolean | PredicateFunction;

  /** Original listener function reference (for off()) */
  original: ListenerFunction;

  /** AbortSignal for cleanup */
  signal?: AbortSignal;

  /** Abort event listener reference for cleanup */
  abortListener?: () => void;
}

// ============================================================================
// Kernel Options
// ============================================================================

/**
 * Options for creating a kernel instance
 */
export interface KernelOptions {
  /** Event name delimiter for namespacing (default: ':') */
  delimiter?: string;

  /** Enable wildcard pattern matching (default: true) */
  wildcard?: boolean;

  /** Maximum listeners per event (default: Infinity, 0 = unlimited) */
  maxListeners?: number;

  /** Error handler for listener exceptions */
  onError?: (error: Error, event: IKernelEvent) => void;

  /** Debug mode - enables warnings and logging */
  debug?: boolean;

  /** Error boundary - continue executing listeners even if one fails */
  errorBoundary?: boolean;

  /** Default context merger for composite events */
  contextMerger?: ContextMerger | ContextMergerFunction;

  /** Callback when context keys conflict during merge */
  onContextConflict?: (key: string, values: any[]) => void;
}

// ============================================================================
// Composition Types
// ============================================================================

/**
 * Event stack for composition - maps event names to their event objects
 */
export type EventStack = Record<string, IKernelEvent>;

/**
 * Factory function to create composite event from source events
 * @param stack - Map of event names to their event objects
 * @returns The composite event specification (type and data)
 */
export type CompositionFactory = (stack: EventStack) => {
  type: string;
  data: any;
} | null;

/**
 * Options for event composition
 */
export interface CompositionOptions {
  /** Reset buffer after composition fires (default: true) */
  reset?: boolean;

  /** Context merger for this composition (overrides kernel default) */
  contextMerger?: ContextMerger | ContextMergerFunction;
}

/**
 * Internal composition entry
 * @internal
 */
export interface IComposition {
  /** Event names to compose */
  events: string[];

  /** Buffer of received events */
  buffer: Map<string, IKernelEvent>;

  /** Factory to create composite event */
  factory: CompositionFactory;

  /** Reset buffer after firing */
  reset: boolean;

  /** Context merger */
  merger: ContextMerger;
}

// ============================================================================
// Context Merger Interface
// ============================================================================

/**
 * Strategy pattern for merging event contexts in compositions
 */
export interface ContextMerger {
  /**
   * Merge contexts from multiple events
   * @param contexts - Map of event names to their context objects
   * @returns The merged context
   */
  merge(contexts: Record<string, any>): any;
}

/**
 * Function-based context merger (shorthand for ContextMerger interface)
 */
export type ContextMergerFunction = (contexts: Record<string, any>) => any;

// ============================================================================
// Kernel Interface
// ============================================================================

/**
 * Main kernel interface
 * @template Events - Event map defining event names and their data types
 */
export interface IKernel<Events extends EventMap = EventMap> {
  // Subscribe methods
  on<K extends keyof Events>(
    event: K | K[],
    listener: ListenerFunction<Events[K]>,
    options?: ListenerOptions
  ): () => void;

  once<K extends keyof Events>(
    event: K,
    listener: ListenerFunction<Events[K]>,
    options?: Omit<ListenerOptions, 'once'>
  ): () => void;

  once<K extends keyof Events>(
    event: K,
    predicate: PredicateFunction<Events[K]>,
    listener: ListenerFunction<Events[K]>,
    options?: Omit<ListenerOptions, 'once'>
  ): () => void;

  once<K extends keyof Events>(
    event: K
  ): Promise<IKernelEvent<Events[K]>>;

  // Unsubscribe methods
  off<K extends keyof Events>(
    event: K,
    listener?: ListenerFunction<Events[K]>
  ): void;

  offAll(event?: keyof Events): void;

  // Emit methods
  emit<K extends keyof Events>(
    event: K,
    data?: Events[K]
  ): Promise<void>;

  emitSerial<K extends keyof Events>(
    event: K,
    data?: Events[K]
  ): Promise<void>;

  // Composition
  compose(
    events: string[],
    factory: CompositionFactory,
    options?: CompositionOptions
  ): () => void;

  // Async iteration
  events<K extends keyof Events>(
    event: K
  ): AsyncIterable<IKernelEvent<Events[K]>>;

  // Utilities
  listenerCount(event?: keyof Events): number;
  eventNames(): (keyof Events)[];

  // Debug
  debug(enabled: boolean): void;
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if value is a valid event name
 */
export function isEventName(value: unknown): value is EventName {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Type guard to check if value is a listener function
 */
export function isListenerFunction(value: unknown): value is ListenerFunction {
  return typeof value === 'function';
}

/**
 * Type guard to check if value is a predicate function
 */
export function isPredicateFunction(value: unknown): value is PredicateFunction {
  return typeof value === 'function';
}

/**
 * Type guard to check if value is a context merger
 */
export function isContextMerger(value: unknown): value is ContextMerger {
  return (
    value !== null &&
    typeof value === 'object' &&
    'merge' in value &&
    typeof (value as any).merge === 'function'
  );
}

/**
 * Type guard to check if value is a context merger function
 */
export function isContextMergerFunction(value: unknown): value is ContextMergerFunction {
  return typeof value === 'function';
}

/**
 * Type guard to check if value is ListenerOptions
 */
export function isListenerOptions(value: unknown): value is ListenerOptions {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  const opts = value as any;

  // Check optional properties have correct types if present
  if ('id' in opts && typeof opts.id !== 'string') return false;
  if ('after' in opts && typeof opts.after !== 'string' && !Array.isArray(opts.after)) return false;
  if ('priority' in opts && typeof opts.priority !== 'number') return false;
  if ('once' in opts && typeof opts.once !== 'boolean' && typeof opts.once !== 'function') return false;
  if ('signal' in opts && !(opts.signal instanceof AbortSignal)) return false;

  return true;
}

/**
 * Type guard to check if value is IKernelEvent
 */
export function isKernelEvent<T = any>(value: unknown): value is IKernelEvent<T> {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  const event = value as any;

  return (
    typeof event.name === 'string' &&
    'data' in event &&
    typeof event.context === 'object' &&
    event.context !== null &&
    typeof event.timestamp === 'number' &&
    typeof event.stopPropagation === 'function' &&
    typeof event.isPropagationStopped === 'boolean'
  );
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Extract event names from an EventMap
 */
export type EventNames<E extends EventMap> = keyof E;

/**
 * Extract event data type for a specific event
 */
export type EventDataType<E extends EventMap, K extends keyof E> = E[K];

/**
 * Unbind function returned by on() and once()
 */
export type UnbindFunction = () => void;

/**
 * Error thrown when circular dependencies are detected
 */
export class CircularDependencyError extends Error {
  constructor(cycle: string[]) {
    super(`Circular dependency detected: ${cycle.join(' -> ')}`);
    this.name = 'CircularDependencyError';
  }
}

/**
 * Error thrown when a listener dependency is missing
 */
export class MissingDependencyError extends Error {
  constructor(listenerId: string, missingDep: string) {
    super(`Listener "${listenerId}" depends on missing listener "${missingDep}"`);
    this.name = 'MissingDependencyError';
  }
}

/**
 * Error thrown when max listeners exceeded
 */
export class MaxListenersExceededError extends Error {
  constructor(event: string, max: number) {
    super(`Max listeners (${max}) exceeded for event "${event}"`);
    this.name = 'MaxListenersExceededError';
  }
}
