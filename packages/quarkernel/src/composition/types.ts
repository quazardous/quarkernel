/**
 * Composition types for QuarKernel v2
 *
 * Types for composite events, context merging strategies, and conflict detection.
 */

/**
 * Name of a source event in a composition
 *
 * When composing events like `compose(['user:loaded', 'profile:loaded'], 'app:ready')`,
 * the event names 'user:loaded' and 'profile:loaded' are used as keys to merge their contexts.
 */
export type EventName = string;

/**
 * Result of a context merge operation
 */
export interface MergeResult {
  /** The merged context object */
  context: Record<string, any>;

  /** Array of detected conflicts during merge */
  conflicts: ConflictInfo[];
}

/**
 * Context merger strategy interface
 *
 * Implementations define how to merge contexts from multiple source events
 * when creating a composite event.
 */
export interface ContextMerger {
  /**
   * Merge contexts from multiple source events
   *
   * @param contexts - Map of source event names to their event context objects
   * @param sources - Array of source event names in order of emission
   * @returns Merged context object for the composite event
   */
  merge(contexts: Map<EventName, Record<string, any>>, sources: EventName[]): Record<string, any>;

  /**
   * Merge contexts and detect conflicts
   *
   * @param contexts - Map of source event names to their event context objects
   * @param sources - Array of source event names in order of emission
   * @returns MergeResult with merged context and detected conflicts
   */
  mergeWithConflicts(contexts: Map<EventName, Record<string, any>>, sources: EventName[]): MergeResult;
}

/**
 * Information about a context key conflict during merge
 */
export interface ConflictInfo {
  /** The context key that has conflicting values */
  key: string;

  /** Source event names that provided values for this key */
  sources: EventName[];

  /** The actual values from each source (in same order as sources) */
  values: any[];
}

/**
 * Options for creating a composition
 */
export interface CompositionOptions {
  /**
   * Context merger strategy to use
   * @default NamespacedMerger
   */
  merger?: ContextMerger;

  /**
   * Maximum number of events to buffer per source event
   * @default 100
   */
  bufferLimit?: number;

  /**
   * Whether to reset the buffer after emitting composite event
   * @default true
   */
  reset?: boolean;

  /**
   * Callback for context conflicts (debug mode)
   */
  onConflict?: (conflict: ConflictInfo) => void;

  /**
   * Global time-to-live for buffered events in milliseconds.
   * Events older than this will be considered expired and won't count
   * toward composition readiness.
   *
   * @default 0 (no expiration - events stay in buffer indefinitely)
   *
   * @example
   * ```ts
   * // All events expire after 5 seconds
   * const composition = new Composition(kernels, { eventTTL: 5000 });
   * ```
   */
  eventTTL?: number;

  /**
   * Per-event TTL configuration. Overrides global eventTTL for specific events.
   *
   * Values can be:
   * - `0` or `'permanent'`: Event stays in buffer indefinitely (default)
   * - `number > 0`: Event expires after N milliseconds
   * - `'instant'`: Event only triggers if it completes a composition immediately,
   *   otherwise it's discarded (doesn't wait in buffer)
   *
   * @example
   * ```ts
   * const composition = new Composition(kernels, {
   *   eventTTLs: {
   *     'user:click': 'permanent',     // Waits indefinitely
   *     'mouse:move': 100,             // Expires after 100ms
   *     'key:press': 'instant'         // Must complete composition now or discard
   *   }
   * });
   * ```
   */
  eventTTLs?: Record<EventName, number | 'permanent' | 'instant'>;
}
