/**
 * QuarKernel Core Implementation
 *
 * A TypeScript event kernel with:
 * - Priority-based listener ordering
 * - Shared context between listeners
 * - Async-first with Promise-based API
 * - Arrow functions only (no `this` binding)
 */

import { KernelEvent } from './kernel-event.js';
import { ListenerContext, type ListenerContextKernel } from './listener-context.js';
import { findMatchingPatterns } from './wildcard.js';
import { toposort, type TopoNode } from './toposort.js';
import { Composition } from './composition/composition.js';
import type { EventName, CompositionOptions } from './composition/types.js';
import type {
  EventMap,
  ListenerFunction,
  ListenerOptions,
  ListenerEntry,
  KernelOptions,
} from './types.js';

/**
 * Error collected during event execution
 */
interface ExecutionError {
  listenerId: string;
  error: Error;
  timestamp: number;
  eventName: string;
}

/**
 * Core Kernel class
 * Implements basic on(), off(), emit() with Map-based storage
 */
export class Kernel<Events extends EventMap = EventMap> implements ListenerContextKernel {
  private listeners = new Map<string, ListenerEntry[]>();
  private options: Required<KernelOptions>;
  private listenerIdCounter = 0;
  private executionErrors: ExecutionError[] = [];

  constructor(options: KernelOptions = {}) {
    this.options = {
      delimiter: options.delimiter ?? ':',
      wildcard: options.wildcard ?? true,
      maxListeners: options.maxListeners ?? Infinity,
      debug: options.debug ?? false,
      errorBoundary: options.errorBoundary ?? true,
      onError: options.onError ?? ((error: Error) => {
        console.error('Kernel error:', error);
      }),
      contextMerger: options.contextMerger ?? undefined,
      onContextConflict: options.onContextConflict ?? undefined,
    } as Required<KernelOptions>;

    if (this.options.debug) {
      console.debug('[QuarKernel] Kernel initialized', {
        delimiter: this.options.delimiter,
        wildcard: this.options.wildcard,
        maxListeners: this.options.maxListeners,
        errorBoundary: this.options.errorBoundary,
      });
    }
  }

  /**
   * Register an event listener
   * Returns an unbind function for cleanup
   */
  on<K extends keyof Events>(
    eventName: K,
    listener: ListenerFunction<Events[K]>,
    options: ListenerOptions = {}
  ): () => void {
    const event = String(eventName);

    // If signal already aborted, don't register listener
    if (options.signal?.aborted) {
      if (this.options.debug) {
        console.debug('[QuarKernel] Listener not added (signal already aborted)', {
          event,
        });
      }
      // Return no-op unbind function
      return () => {};
    }

    const priority = options.priority ?? 0;
    const id = options.id ?? `listener_${++this.listenerIdCounter}`;
    const after = Array.isArray(options.after)
      ? options.after
      : options.after
      ? [options.after]
      : [];

    // Create abort listener if signal provided
    let abortListener: (() => void) | undefined;
    if (options.signal) {
      abortListener = () => this.off(event, listener);
    }

    const entry: ListenerEntry = {
      id,
      callback: listener as ListenerFunction,
      after,
      priority,
      once: options.once ?? false,
      original: listener as ListenerFunction,
      signal: options.signal,
      abortListener,
    };

    // Get or create listener array for this event
    const entries = this.listeners.get(event) ?? [];
    entries.push(entry);

    // Sort by priority (descending: higher priority first)
    // Note: Dependency ordering is handled in emit() by sortListenersByDependencies()
    entries.sort((a, b) => b.priority - a.priority);

    this.listeners.set(event, entries);

    if (this.options.debug) {
      console.debug('[QuarKernel] Listener added', {
        event,
        listenerId: id,
        priority,
        after,
        once: entry.once,
        totalListeners: entries.length,
      });
    }

    // Check maxListeners warning
    if (this.options.maxListeners > 0 && entries.length > this.options.maxListeners) {
      console.warn(
        `MaxListenersExceeded: Event "${event}" has ${entries.length} listeners (limit: ${this.options.maxListeners})`
      );
    }

    // Handle AbortSignal - add abort listener (signal not already aborted, checked above)
    if (options.signal && abortListener) {
      options.signal.addEventListener('abort', abortListener, { once: true });
    }

    // Return unbind function
    return () => this.off(event, listener);
  }

  /**
   * Remove an event listener
   * If no listener provided, removes all listeners for the event
   */
  off(eventName: string, listener?: Function): void {
    const entries = this.listeners.get(eventName);

    if (!entries) {
      return;
    }

    if (!listener) {
      if (this.options.debug) {
        console.debug('[QuarKernel] All listeners removed', {
          event: eventName,
          count: entries.length,
        });
      }
      // Remove all listeners for this event and cleanup abort listeners
      for (const entry of entries) {
        if (entry.signal && entry.abortListener) {
          entry.signal.removeEventListener('abort', entry.abortListener);
        }
      }
      this.listeners.delete(eventName);
      return;
    }

    // Find the entry to remove and cleanup its abort listener
    const entryToRemove = entries.find((entry) => entry.original === listener);
    if (entryToRemove?.signal && entryToRemove.abortListener) {
      entryToRemove.signal.removeEventListener('abort', entryToRemove.abortListener);
    }

    // Remove specific listener by original function reference equality
    const filtered = entries.filter((entry) => entry.original !== listener);
    const removed = entries.length - filtered.length;

    if (this.options.debug && removed > 0) {
      console.debug('[QuarKernel] Listener removed', {
        event: eventName,
        removed,
        remaining: filtered.length,
      });
    }

    if (filtered.length === 0) {
      this.listeners.delete(eventName);
    } else {
      this.listeners.set(eventName, filtered);
    }
  }

  /**
   * Emit an event
   * Executes all registered listeners in parallel (by default)
   * Returns a Promise that resolves when all listeners complete
   * Throws AggregateError if any listeners failed
   */
  async emit<K extends keyof Events>(
    eventName: K,
    data?: Events[K]
  ): Promise<void> {
    const event = String(eventName);

    // Get all matching listeners (exact match + wildcards)
    const allPatterns = Array.from(this.listeners.keys());
    const matchingPatterns = this.options.wildcard
      ? findMatchingPatterns(event, allPatterns, this.options.delimiter)
      : allPatterns.filter(p => p === event);

    // Collect all listeners from matching patterns
    const allEntries: ListenerEntry[] = [];
    for (const pattern of matchingPatterns) {
      const entries = this.listeners.get(pattern);
      if (entries) {
        allEntries.push(...entries);
      }
    }

    if (allEntries.length === 0) {
      if (this.options.debug) {
        console.debug('[QuarKernel] Event emitted (no listeners)', { event });
      }
      return;
    }

    if (this.options.debug) {
      console.debug('[QuarKernel] Event emitted', {
        event,
        listenerCount: allEntries.length,
        data: data !== undefined ? JSON.stringify(data).substring(0, 100) : undefined,
      });
    }

    // Clear execution errors from previous emit
    this.executionErrors = [];

    const kernelEvent = new KernelEvent<Events[K]>(
      event,
      data as Events[K],
      {}
    );

    // Sort listeners by dependencies and priority
    const sortedEntries = this.sortListenersByDependencies(allEntries);

    // Execute all listeners in parallel using Promise.allSettled
    // to ensure one failure doesn't block others
    const promises = sortedEntries.map((entry) =>
      this.executeListener(entry, kernelEvent, event)
    );

    const results = await Promise.allSettled(promises);

    // Remove once listeners after execution
    this.removeOnceListeners(event, sortedEntries, kernelEvent);

    // Collect errors from rejected promises (only if errorBoundary is false)
    if (!this.options.errorBoundary) {
      const errors = results
        .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
        .map((result) => result.reason);

      if (errors.length > 0) {
        throw new AggregateError(errors, `${errors.length} listener(s) failed for event "${event}"`);
      }
    }

    if (this.options.debug) {
      console.debug('[QuarKernel] Event completed', {
        event,
      });
    }
  }

  /**
   * Emit an event with serial execution
   * Executes listeners sequentially (one after another) instead of in parallel
   * Respects the same dependency and priority ordering as emit()
   * Stops on first error if errorBoundary is false, otherwise continues and collects errors
   */
  async emitSerial<K extends keyof Events>(
    eventName: K,
    data?: Events[K]
  ): Promise<void> {
    const event = String(eventName);

    // Get all matching listeners (exact match + wildcards)
    const allPatterns = Array.from(this.listeners.keys());
    const matchingPatterns = this.options.wildcard
      ? findMatchingPatterns(event, allPatterns, this.options.delimiter)
      : allPatterns.filter(p => p === event);

    // Collect all listeners from matching patterns
    const allEntries: ListenerEntry[] = [];
    for (const pattern of matchingPatterns) {
      const entries = this.listeners.get(pattern);
      if (entries) {
        allEntries.push(...entries);
      }
    }

    if (allEntries.length === 0) {
      if (this.options.debug) {
        console.debug('[QuarKernel] Event emitted serially (no listeners)', { event });
      }
      return;
    }

    if (this.options.debug) {
      console.debug('[QuarKernel] Event emitted serially', {
        event,
        listenerCount: allEntries.length,
        data: data !== undefined ? JSON.stringify(data).substring(0, 100) : undefined,
      });
    }

    // Clear execution errors from previous emit
    this.executionErrors = [];

    const kernelEvent = new KernelEvent<Events[K]>(
      event,
      data as Events[K],
      {}
    );

    // Sort listeners by dependencies and priority
    const sortedEntries = this.sortListenersByDependencies(allEntries);

    // Execute listeners sequentially
    const errors: Error[] = [];
    for (const entry of sortedEntries) {
      try {
        await this.executeListener(entry, kernelEvent, event);
      } catch (error) {
        if (!this.options.errorBoundary) {
          // Stop on first error if error boundary is disabled
          // Clean up once listeners before throwing
          this.removeOnceListeners(event, sortedEntries, kernelEvent);
          throw error;
        }
        // errorBoundary is true, collect error and continue
        errors.push(error as Error);
      }
    }

    // Remove once listeners after execution
    this.removeOnceListeners(event, sortedEntries, kernelEvent);

    // If errorBoundary is false and we have errors, throw AggregateError
    if (!this.options.errorBoundary && errors.length > 0) {
      throw new AggregateError(errors, `${errors.length} listener(s) failed for event "${event}"`);
    }

    if (this.options.debug) {
      console.debug('[QuarKernel] Event completed serially', {
        event,
      });
    }
  }

  /**
   * Sort listeners by dependencies and priority
   * Uses topological sort for dependency resolution
   */
  private sortListenersByDependencies(entries: ListenerEntry[]): ListenerEntry[] {
    // If no dependencies, just return sorted by priority
    const hasDependencies = entries.some(e => e.after.length > 0);
    if (!hasDependencies) {
      return [...entries].sort((a, b) => b.priority - a.priority);
    }

    // Check for missing dependencies
    const listenerIds = new Set(entries.map(e => e.id));
    for (const entry of entries) {
      for (const dep of entry.after) {
        if (!listenerIds.has(dep)) {
          throw new Error(`Listener "${entry.id}" depends on missing listener "${dep}"`);
        }
      }
    }

    // Convert to TopoNode format
    const nodes: TopoNode[] = entries.map(e => ({
      id: e.id,
      after: e.after,
    }));

    // Get topologically sorted IDs (validates dependencies, unused but required for validation)
    toposort(nodes);

    // Group by dependency level and sort by priority within each level
    const levelMap = new Map<string, number>();
    const assignLevel = (id: string, visited = new Set<string>()): number => {
      if (levelMap.has(id)) {
        return levelMap.get(id)!;
      }
      if (visited.has(id)) {
        return 0;
      }
      visited.add(id);

      const entry = entries.find(e => e.id === id);
      if (!entry || entry.after.length === 0) {
        levelMap.set(id, 0);
        return 0;
      }

      const maxDepLevel = Math.max(...entry.after.map(dep => assignLevel(dep, visited)));
      const level = maxDepLevel + 1;
      levelMap.set(id, level);
      return level;
    };

    entries.forEach(e => assignLevel(e.id));

    // Sort by level, then by priority within level
    return [...entries].sort((a, b) => {
      const levelA = levelMap.get(a.id) ?? 0;
      const levelB = levelMap.get(b.id) ?? 0;
      if (levelA !== levelB) {
        return levelA - levelB; // Lower level first
      }
      return b.priority - a.priority; // Higher priority first within same level
    });
  }

  /**
   * Execute a single listener with error handling
   */
  private async executeListener(
    entry: ListenerEntry,
    event: KernelEvent<any>,
    eventName: string
  ): Promise<void> {
    // Check if propagation was stopped
    if (event.isPropagationStopped) {
      if (this.options.debug) {
        console.debug('[QuarKernel] Listener skipped (propagation stopped)', {
          listenerId: entry.id,
        });
      }
      return;
    }

    const startTime = Date.now();

    if (this.options.debug) {
      console.debug('[QuarKernel] Listener executing', {
        listenerId: entry.id,
        event: eventName,
        priority: entry.priority,
      });
    }

    try {
      // Create listener context
      const ctx = new ListenerContext(
        entry.id,
        eventName,
        entry.priority,
        entry.after,
        this,
        entry.original,
        entry.signal
      );

      // Set current event for context methods
      ctx.setCurrentEvent(event);

      try {
        await entry.callback(event, ctx);

        if (this.options.debug) {
          const duration = Date.now() - startTime;
          console.debug('[QuarKernel] Listener completed', {
            listenerId: entry.id,
            duration: `${duration}ms`,
          });
        }
      } finally {
        // Clear current event after execution
        ctx.clearCurrentEvent();
      }
    } catch (error) {
      const executionError: ExecutionError = {
        listenerId: entry.id,
        error: error as Error,
        timestamp: Date.now(),
        eventName,
      };

      // Collect error for reporting
      this.executionErrors.push(executionError);

      if (this.options.debug) {
        console.debug('[QuarKernel] Listener error', {
          listenerId: entry.id,
          error: (error as Error).message,
        });
      }

      if (this.options.errorBoundary) {
        // Call error handler but continue with other listeners
        this.options.onError(error as Error, event);
      } else {
        // Re-throw if error boundary is disabled
        throw error;
      }
    }
  }

  /**
   * Remove listeners marked with once: true or whose predicate returns true after execution
   *
   * This method is called AFTER all listeners have executed for an event.
   * The predicate functions receive the event object with the final state after all listeners ran.
   *
   * Behavior:
   * - If once: true, the listener is always removed after execution
   * - If once is a predicate function, it's evaluated with the post-execution event state
   * - Predicates can examine event.context to make decisions based on listener modifications
   * - Listeners are removed even if they threw errors (when errorBoundary: true)
   *
   * @param eventName - The event name being processed
   * @param entries - Listeners that executed (or were scheduled to execute)
   * @param event - The event object with final state after all listeners executed
   */
  private removeOnceListeners(eventName: string, entries: ListenerEntry[], event: KernelEvent<any>): void {
    const listenersToRemove = entries.filter((entry) => {
      if (!entry.once) {
        return false;
      }

      // If once is true, always remove
      if (entry.once === true) {
        return true;
      }

      // If once is a predicate function, evaluate it
      if (typeof entry.once === 'function') {
        return entry.once(event);
      }

      return false;
    });

    if (listenersToRemove.length === 0) {
      return;
    }

    if (this.options.debug) {
      console.debug('[QuarKernel] Removing once listeners', {
        event: eventName,
        count: listenersToRemove.length,
      });
    }

    // Remove each listener that should be removed
    // For wildcard patterns, we need to find which pattern they belong to
    for (const entry of listenersToRemove) {
      // Find the pattern this listener was registered under
      for (const [pattern, entries] of this.listeners.entries()) {
        if (entries.includes(entry)) {
          this.off(pattern, entry.original);
          break;
        }
      }
    }
  }

  /**
   * Get number of listeners for an event
   */
  listenerCount(eventName?: keyof Events): number {
    if (!eventName) {
      // Total count across all events
      let total = 0;
      for (const entries of this.listeners.values()) {
        total += entries.length;
      }
      return total;
    }

    const event = String(eventName);
    const entries = this.listeners.get(event);
    return entries?.length ?? 0;
  }

  /**
   * Get all event names with registered listeners
   */
  eventNames(): (keyof Events)[] {
    return Array.from(this.listeners.keys()) as (keyof Events)[];
  }

  /**
   * Remove all listeners for all events (or specific event)
   */
  offAll(eventName?: keyof Events): void {
    if (!eventName) {
      // Cleanup all abort listeners
      for (const entries of this.listeners.values()) {
        for (const entry of entries) {
          if (entry.signal && entry.abortListener) {
            entry.signal.removeEventListener('abort', entry.abortListener);
          }
        }
      }
      this.listeners.clear();
      return;
    }

    // Cleanup abort listeners for specific event
    const event = String(eventName);
    const entries = this.listeners.get(event);
    if (entries) {
      for (const entry of entries) {
        if (entry.signal && entry.abortListener) {
          entry.signal.removeEventListener('abort', entry.abortListener);
        }
      }
    }

    this.listeners.delete(event);
  }

  /**
   * Enable/disable debug mode
   * In T115, this is a placeholder - full debug implementation in T129
   */
  debug(enabled: boolean): void {
    this.options.debug = enabled;
    if (enabled) {
      console.debug('[QuarKernel] Debug mode enabled');
    } else {
      console.debug('[QuarKernel] Debug mode disabled');
    }
  }

  /**
   * Get collected execution errors from the last emit
   * Useful for error aggregation and reporting
   */
  getExecutionErrors(): ReadonlyArray<ExecutionError> {
    return this.executionErrors;
  }

  /**
   * Clear collected execution errors
   */
  clearExecutionErrors(): void {
    this.executionErrors = [];
  }

  /**
   * Create a composition from multiple kernels
   *
   * @param kernels - Rest parameters of [kernel, eventName] tuples
   * @param options - Optional composition options (if last argument is not a tuple)
   * @returns Composition instance that merges events from all kernels
   *
   * @example
   * ```ts
   * const userKernel = createKernel();
   * const profileKernel = createKernel();
   *
   * const composition = Kernel.compose(
   *   [userKernel, 'user:loaded'],
   *   [profileKernel, 'profile:loaded'],
   *   { merger: createNamespacedMerger() }
   * );
   *
   * composition.on('composite', (event) => {
   *   console.log('All sources ready:', event.data.merged);
   * });
   * ```
   */
  static compose<Events extends EventMap = EventMap>(
    ...args: (readonly [Kernel, EventName] | CompositionOptions)[]
  ): Composition<Events> {
    // Separate kernel tuples from options
    const kernels: Array<[Kernel, EventName]> = [];
    let options: CompositionOptions | undefined;

    for (const arg of args) {
      // Check if this is a kernel tuple or options object
      if (Array.isArray(arg) && arg.length === 2 && arg[0] instanceof Kernel) {
        kernels.push(arg as [Kernel, EventName]);
      } else if (typeof arg === 'object' && !Array.isArray(arg)) {
        options = arg as CompositionOptions;
      }
    }

    return new Composition<Events>(kernels, options);
  }
}

/**
 * Factory function to create a Kernel instance
 */
export const createKernel = <Events extends EventMap = EventMap>(
  options?: KernelOptions
): Kernel<Events> => {
  return new Kernel<Events>(options);
};

