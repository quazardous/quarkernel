/**
 * Composition class - Merges multiple kernels into a unified interface
 *
 * Subscribes to events from multiple kernels, buffers them, and emits
 * composite events when all source events have fired. Contexts are merged
 * using a configurable ContextMerger strategy.
 */

import { Kernel } from '../kernel.js';
import { createNamespacedMerger } from './mergers/index.js';
import type {
  EventName,
  ContextMerger,
  CompositionOptions,
  ConflictInfo,
} from './types.js';
import type { IKernelEvent } from '../types.js';
import type {
  EventMap,
  ListenerFunction,
  ListenerOptions,
} from '../types.js';

/**
 * Reserved internal event name for composite emissions
 * Using a prefix that users are unlikely to use accidentally
 */
const COMPOSED_EVENT = '__qk:composed__';

/**
 * Buffered event entry for a source kernel
 */
interface BufferedEvent {
  name: string;
  data: any;
  context: Record<string, any>;
  timestamp: number;
}

/**
 * Source kernel subscription
 */
interface KernelSubscription {
  kernel: Kernel;
  eventName: EventName;
  unbind: () => void;
}

/**
 * Composition class that merges events from multiple kernels
 *
 * Example:
 * ```ts
 * const userKernel = createKernel();
 * const profileKernel = createKernel();
 *
 * const composition = new Composition([
 *   [userKernel, 'user:loaded'],
 *   [profileKernel, 'profile:loaded'],
 * ], {
 *   merger: createNamespacedMerger(),
 *   bufferLimit: 100,
 * });
 *
 * composition.onComposed((event) => {
 *   // event.data.merged contains merged contexts from all sources
 * });
 * ```
 */
export class Composition<Events extends EventMap = EventMap> {
  private kernel: Kernel<Events>;
  private subscriptions: KernelSubscription[] = [];
  private buffers: Map<EventName, BufferedEvent[]> = new Map();
  private merger: ContextMerger;
  private bufferLimit: number;
  private reset: boolean;
  private eventTTL: number;
  private eventTTLs: Record<EventName, number | 'permanent' | 'instant'>;
  private sourceEvents: Set<EventName> = new Set();
  private firedSinceLastComposite: Set<EventName> = new Set();
  private lastConflicts: ConflictInfo[] = [];
  private expirationTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  /**
   * Create a new Composition
   *
   * @param kernels - Array of [kernel, eventName] tuples to subscribe to
   * @param options - Composition options
   */
  constructor(
    kernels: Array<[Kernel, EventName]>,
    options: CompositionOptions = {}
  ) {
    if (kernels.length === 0) {
      throw new Error('Composition requires at least one kernel');
    }

    this.merger = options.merger ?? createNamespacedMerger();
    this.bufferLimit = options.bufferLimit ?? 100;
    this.reset = options.reset ?? true;
    this.eventTTL = options.eventTTL ?? 0;
    this.eventTTLs = options.eventTTLs ?? {};

    // Create internal kernel for composite events
    this.kernel = new Kernel<Events>({
      debug: false,
      errorBoundary: true,
      onContextConflict: options.onConflict
        ? (key: string, values: any[]) => {
            options.onConflict!({
              key,
              sources: [],
              values,
            });
          }
        : undefined,
    });

    // Subscribe to all source kernels
    for (const [kernel, eventName] of kernels) {
      this.subscribeToKernel(kernel, eventName);
      this.sourceEvents.add(eventName);
    }
  }

  /**
   * Subscribe to events from a source kernel
   */
  private subscribeToKernel(kernel: Kernel, eventName: EventName): void {
    // Initialize buffer for this event
    this.buffers.set(eventName, []);

    // Subscribe to the kernel's events with lowest priority
    // This ensures we capture the event AFTER all other listeners have modified the context
    const unbind = kernel.on(
      eventName,
      async (event) => {
        await this.handleSourceEvent(eventName, event);
      },
      { priority: -Infinity }
    );

    this.subscriptions.push({
      kernel,
      eventName,
      unbind,
    });
  }

  /**
   * Get the effective TTL for a specific event
   * Priority: per-event TTL > global TTL > 0 (permanent)
   */
  private getEffectiveTTL(eventName: EventName): number | 'permanent' | 'instant' {
    const perEventTTL = this.eventTTLs[eventName];
    if (perEventTTL !== undefined) {
      return perEventTTL;
    }
    // Global TTL (0 means permanent)
    return this.eventTTL > 0 ? this.eventTTL : 'permanent';
  }

  /**
   * Handle an event from a source kernel
   */
  private async handleSourceEvent(eventName: EventName, event: IKernelEvent<any>): Promise<void> {
    const buffer = this.buffers.get(eventName);
    if (!buffer) return;

    const effectiveTTL = this.getEffectiveTTL(eventName);

    // Generate unique ID for this buffered event (for TTL tracking)
    const eventId = `${eventName}:${event.timestamp}:${Math.random().toString(36).slice(2, 8)}`;

    // Add to buffer (FIFO)
    buffer.push({
      name: event.name,
      data: event.data,
      context: { ...event.context },
      timestamp: event.timestamp,
    });

    // Enforce buffer limit
    if (buffer.length > this.bufferLimit) {
      buffer.shift();
    }

    // Mark this source as having fired since last composite
    this.firedSinceLastComposite.add(eventName);

    // Check if all sources have fired - this determines if composition completes
    const compositionCompleted = await this.checkAndEmitComposite();

    // Handle 'instant' mode: if composition didn't complete, remove the event immediately
    if (effectiveTTL === 'instant' && !compositionCompleted) {
      // Remove the event we just added
      buffer.pop();
      this.firedSinceLastComposite.delete(eventName);
      return;
    }

    // Set up TTL expiration if configured (numeric TTL)
    if (typeof effectiveTTL === 'number' && effectiveTTL > 0) {
      const timer = setTimeout(() => {
        this.expireEvent(eventName, event.timestamp);
        this.expirationTimers.delete(eventId);
      }, effectiveTTL);

      this.expirationTimers.set(eventId, timer);
    }
  }

  /**
   * Expire an event from the buffer based on timestamp
   */
  private expireEvent(eventName: EventName, timestamp: number): void {
    const buffer = this.buffers.get(eventName);
    if (!buffer) return;

    // Remove events with matching timestamp (or older)
    const filtered = buffer.filter(e => e.timestamp > timestamp);
    this.buffers.set(eventName, filtered);

    // If buffer is now empty, remove from firedSinceLastComposite
    if (filtered.length === 0) {
      this.firedSinceLastComposite.delete(eventName);
    }
  }

  /**
   * Check if all source events have fired and emit composite event
   * @returns true if composite was emitted, false otherwise
   */
  private async checkAndEmitComposite(): Promise<boolean> {
    // Check if all buffers have at least one event
    for (const eventName of this.sourceEvents) {
      const buffer = this.buffers.get(eventName);
      if (!buffer || buffer.length === 0) {
        return false; // Not ready yet
      }
    }

    // Check if all sources have fired since last composite
    // This ensures we only emit once per "cycle" of all sources
    for (const eventName of this.sourceEvents) {
      if (!this.firedSinceLastComposite.has(eventName)) {
        return false; // Not all sources have fired yet in this cycle
      }
    }

    // Only emit if there are listeners (skip if no one is listening)
    if (this.kernel.listenerCount(COMPOSED_EVENT as keyof Events) === 0) {
      return false;
    }

    // All sources have fired - collect and merge contexts
    const contexts = new Map<EventName, Record<string, any>>();
    const sources: EventName[] = Array.from(this.sourceEvents);

    for (const eventName of sources) {
      const buffer = this.buffers.get(eventName);
      if (!buffer || buffer.length === 0) continue;

      // Get the latest event from this source
      const latestEvent = buffer[buffer.length - 1];

      // Merge both event data and context
      // If data is an object, spread it along with context
      const eventData = latestEvent.data && typeof latestEvent.data === 'object'
        ? latestEvent.data
        : {};
      const combined = { ...eventData, ...latestEvent.context };

      contexts.set(eventName, combined);
    }

    // Merge contexts using the merger strategy with conflict detection
    const mergeResult = this.merger.mergeWithConflicts(contexts, sources);
    this.lastConflicts = mergeResult.conflicts;

    // Emit composed event through internal kernel
    await this.kernel.emit(COMPOSED_EVENT as keyof Events, {
      sources,
      contexts: Object.fromEntries(contexts),
      merged: mergeResult.context,
    } as Events[keyof Events]);

    // Clear the "fired since last composite" tracker
    this.firedSinceLastComposite.clear();

    // Reset buffers if configured
    // Keep only the latest event from each source to enable continuous composition
    if (this.reset) {
      for (const eventName of this.sourceEvents) {
        const buffer = this.buffers.get(eventName);
        if (buffer && buffer.length > 0) {
          const latest = buffer[buffer.length - 1];
          this.buffers.set(eventName, [latest]);
        }
      }
    }

    return true;
  }

  /**
   * Register a listener for when all source events have fired
   * This is the primary way to react to composition completion
   *
   * @param listener - Function called with merged context when composition completes
   * @param options - Listener options (priority, id, etc.)
   * @returns Unbind function to remove the listener
   */
  onComposed(
    listener: ListenerFunction<Events[keyof Events]>,
    options?: ListenerOptions
  ): () => void {
    return this.kernel.on(COMPOSED_EVENT as keyof Events, listener, options);
  }

  /**
   * Remove a listener for composed events
   */
  offComposed(listener?: Function): void {
    this.kernel.off(COMPOSED_EVENT, listener);
  }

  /**
   * Get number of composed event listeners
   */
  composedListenerCount(): number {
    return this.kernel.listenerCount(COMPOSED_EVENT as keyof Events);
  }

  /**
   * Register a listener for events on internal kernel
   * Note: Use onComposed() to listen for composition completion
   */
  on<K extends keyof Events>(
    eventName: K,
    listener: ListenerFunction<Events[K]>,
    options?: ListenerOptions
  ): () => void {
    return this.kernel.on(eventName, listener, options);
  }

  /**
   * Remove a listener
   * Delegates to internal kernel
   */
  off(eventName: string, listener?: Function): void {
    this.kernel.off(eventName, listener);
  }

  /**
   * Emit an event through the composition
   * Note: Reserved internal events (prefixed with __qk:) cannot be emitted
   */
  async emit<K extends keyof Events>(
    eventName: K,
    data?: Events[K]
  ): Promise<void> {
    if (String(eventName).startsWith('__qk:')) {
      throw new Error(`Cannot emit reserved event: ${String(eventName)}`);
    }
    return this.kernel.emit(eventName, data);
  }

  /**
   * Get merged context from latest buffered events
   * Does not emit - just returns the merged context
   */
  getContext(): Record<string, any> | null {
    // Check if all buffers have at least one event
    for (const eventName of this.sourceEvents) {
      const buffer = this.buffers.get(eventName);
      if (!buffer || buffer.length === 0) {
        return null; // Not ready yet
      }
    }

    // Collect latest contexts
    const contexts = new Map<EventName, Record<string, any>>();
    const sources: EventName[] = Array.from(this.sourceEvents);

    for (const eventName of sources) {
      const buffer = this.buffers.get(eventName);
      if (!buffer || buffer.length === 0) continue;

      const latestEvent = buffer[buffer.length - 1];

      // Merge both event data and context
      const eventData = latestEvent.data && typeof latestEvent.data === 'object'
        ? latestEvent.data
        : {};
      const combined = { ...eventData, ...latestEvent.context };

      contexts.set(eventName, combined);
    }

    // Merge with conflict detection
    const mergeResult = this.merger.mergeWithConflicts(contexts, sources);
    this.lastConflicts = mergeResult.conflicts;

    return mergeResult.context;
  }

  /**
   * Get number of listeners for an event
   */
  listenerCount(eventName?: keyof Events): number {
    return this.kernel.listenerCount(eventName);
  }

  /**
   * Get all event names with registered listeners
   */
  eventNames(): (keyof Events)[] {
    return this.kernel.eventNames();
  }

  /**
   * Remove all listeners
   */
  offAll(eventName?: keyof Events): void {
    this.kernel.offAll(eventName);
  }

  /**
   * Enable/disable debug mode
   */
  debug(enabled: boolean): void {
    this.kernel.debug(enabled);
  }

  /**
   * Get buffer for a specific source event (for debugging)
   */
  getBuffer(eventName: EventName): ReadonlyArray<BufferedEvent> | undefined {
    return this.buffers.get(eventName);
  }

  /**
   * Clear all buffers
   */
  clearBuffers(): void {
    for (const eventName of this.sourceEvents) {
      this.buffers.set(eventName, []);
    }
    this.firedSinceLastComposite.clear();
  }

  /**
   * Get conflicts detected during the last merge operation
   *
   * Returns an array of ConflictInfo objects describing which source events
   * provided conflicting values for the same context keys.
   *
   * @returns Array of conflicts from the last merge, or empty array if no conflicts
   */
  getConflicts(): ReadonlyArray<ConflictInfo> {
    return this.lastConflicts;
  }

  /**
   * Cleanup all subscriptions and listeners
   */
  dispose(): void {
    // Unsubscribe from all source kernels
    for (const sub of this.subscriptions) {
      sub.unbind();
    }
    this.subscriptions = [];

    // Clear all expiration timers
    for (const timer of this.expirationTimers.values()) {
      clearTimeout(timer);
    }
    this.expirationTimers.clear();

    // Clear all listeners on internal kernel
    this.kernel.offAll();

    // Clear buffers and trackers
    this.buffers.clear();
    this.sourceEvents.clear();
    this.firedSinceLastComposite.clear();
    this.lastConflicts = [];
  }

  /**
   * Get the configured global event TTL in milliseconds
   * @returns The TTL value, or 0 if no TTL is configured
   */
  getEventTTL(): number {
    return this.eventTTL;
  }

  /**
   * Set the global event TTL in milliseconds
   * @param ttl - TTL in milliseconds (0 = permanent)
   */
  setEventTTL(ttl: number): void {
    this.eventTTL = ttl;
  }

  /**
   * Get per-event TTL configuration
   * @returns The eventTTLs configuration object
   */
  getEventTTLs(): Readonly<Record<EventName, number | 'permanent' | 'instant'>> {
    return this.eventTTLs;
  }

  /**
   * Set TTL for a specific event
   * @param eventName - The event name to configure
   * @param ttl - TTL value: number (ms), 'permanent', or 'instant'
   */
  setEventTTLFor(eventName: EventName, ttl: number | 'permanent' | 'instant'): void {
    this.eventTTLs[eventName] = ttl;
  }

  /**
   * Remove per-event TTL configuration (falls back to global TTL)
   * @param eventName - The event name to reset
   */
  clearEventTTLFor(eventName: EventName): void {
    delete this.eventTTLs[eventName];
  }
}

/**
 * Factory function to create a Composition instance
 */
export const createComposition = <Events extends EventMap = EventMap>(
  kernels: Array<[Kernel, EventName]>,
  options?: CompositionOptions
): Composition<Events> => {
  return new Composition<Events>(kernels, options);
};
