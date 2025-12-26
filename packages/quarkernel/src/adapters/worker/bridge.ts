/**
 * Worker Bridge - Main Thread Side
 *
 * Creates a proxy kernel that communicates with a Worker thread via postMessage.
 * Provides kernel-compatible API on the main thread that serializes events and
 * forwards them to the worker.
 *
 * Architecture:
 * - Main thread: createWorkerBridge(worker) returns proxy kernel
 * - Worker thread: Uses actual kernel, sends events back via postMessage
 * - Bidirectional: Main can emit to worker, worker can emit to main
 * - Origin tracking: Prevents infinite message loops
 */

import type { Kernel, EventMap, ListenerFunction, ListenerOptions, KernelEvent } from '../../types.js';

/**
 * Internal message types for worker communication
 */
type WorkerMessage =
  | { type: 'worker:ready' }
  | { type: 'worker:error'; error: { message: string; stack?: string } }
  | { type: 'event'; name: string; data: any; origin: 'main' | 'worker' };

/**
 * Options for creating worker bridge
 */
export interface WorkerBridgeOptions {
  /** Timeout for worker initialization in ms (default: 5000) */
  initTimeout?: number;

  /** Debug mode - enables logging */
  debug?: boolean;
}

/**
 * Worker bridge instance with lifecycle management
 */
export interface WorkerBridge<Events extends EventMap = EventMap> {
  /** Kernel-compatible API */
  kernel: Kernel<Events>;

  /** Check if worker is ready */
  readonly ready: boolean;

  /** Promise that resolves when worker is initialized */
  readonly readyPromise: Promise<void>;

  /** Terminate the worker and cleanup */
  terminate(): void;
}

/**
 * Create a worker bridge that wraps a Worker and exposes a kernel interface
 *
 * @param worker - Worker instance or URL string to create worker from
 * @param options - Bridge configuration options
 * @returns WorkerBridge with kernel proxy and lifecycle management
 *
 * @example
 * ```ts
 * const bridge = createWorkerBridge(new Worker('./worker.js'));
 * await bridge.readyPromise;
 * bridge.kernel.emit('task:start', { id: 123 });
 * bridge.kernel.on('task:complete', (event) => console.log(event.data));
 * ```
 */
export function createWorkerBridge<Events extends EventMap = EventMap>(
  worker: Worker | string,
  options: WorkerBridgeOptions = {}
): WorkerBridge<Events> {
  const { initTimeout = 5000, debug = false } = options;

  // Create worker instance if URL provided
  const workerInstance = typeof worker === 'string' ? new Worker(worker, { type: 'module' }) : worker;

  // State management
  let isReady = false;
  let isTerminated = false;
  const listeners = new Map<string, Set<ListenerFunction>>();
  let readyResolve: (() => void) | null = null;
  let readyReject: ((error: Error) => void) | null = null;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  // Ready promise for initialization
  const readyPromise = new Promise<void>((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;

    // Timeout for initialization
    timeoutId = setTimeout(() => {
      if (!isReady && !isTerminated) {
        const error = new Error(`Worker initialization timeout after ${initTimeout}ms`);
        readyReject?.(error);
        readyReject = null;
        readyResolve = null;
      }
    }, initTimeout);
  });

  // Clear timeout when ready or terminated
  readyPromise.finally(() => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  });

  /**
   * Handle incoming messages from worker
   */
  const handleMessage = (event: MessageEvent<WorkerMessage>) => {
    const message = event.data;

    if (debug) {
      console.debug('[WorkerBridge] Received message from worker:', message.type);
    }

    switch (message.type) {
      case 'worker:ready':
        isReady = true;
        if (debug) {
          console.debug('[WorkerBridge] Worker ready');
        }
        readyResolve?.();
        readyResolve = null;
        readyReject = null;
        break;

      case 'worker:error':
        if (debug) {
          console.error('[WorkerBridge] Worker error:', message.error.message);
        }
        const error = new Error(message.error.message);
        if (message.error.stack) {
          error.stack = message.error.stack;
        }
        readyReject?.(error);
        readyReject = null;
        readyResolve = null;
        break;

      case 'event':
        // Ignore events that originated from main (prevent echo)
        if (message.origin === 'main') {
          if (debug) {
            console.debug('[WorkerBridge] Ignoring main-originated event:', message.name);
          }
          return;
        }

        // Execute listeners for this event
        const eventListeners = listeners.get(message.name);
        if (eventListeners && eventListeners.size > 0) {
          // Create a simple kernel event object
          const kernelEvent: KernelEvent = {
            name: message.name,
            data: message.data,
            context: {},
            timestamp: Date.now(),
            isPropagationStopped: false,
            stopPropagation: () => {
              (kernelEvent as any).isPropagationStopped = true;
            },
          };

          // Execute all listeners
          for (const listener of eventListeners) {
            if (!kernelEvent.isPropagationStopped) {
              try {
                // Call listener without context for simplicity
                Promise.resolve(listener(kernelEvent, {} as any)).catch((error) => {
                  if (debug) {
                    console.error('[WorkerBridge] Listener error:', error);
                  }
                });
              } catch (error) {
                if (debug) {
                  console.error('[WorkerBridge] Listener error:', error);
                }
              }
            }
          }
        }
        break;
    }
  };

  /**
   * Handle worker errors
   */
  const handleError = (event: ErrorEvent) => {
    if (debug) {
      console.error('[WorkerBridge] Worker error event:', event.message);
    }
    const error = new Error(`Worker error: ${event.message}`);
    readyReject?.(error);
    readyReject = null;
    readyResolve = null;
  };

  // Setup message handlers
  workerInstance.addEventListener('message', handleMessage);
  workerInstance.addEventListener('error', handleError);

  /**
   * Send event to worker
   */
  const sendToWorker = (name: string, data: any) => {
    if (isTerminated) {
      throw new Error('Worker bridge has been terminated');
    }

    const message: WorkerMessage = {
      type: 'event',
      name,
      data,
      origin: 'main',
    };

    if (debug) {
      console.debug('[WorkerBridge] Sending event to worker:', name);
    }

    workerInstance.postMessage(message);
  };

  /**
   * Proxy kernel implementation
   */
  const proxyKernel: Kernel<Events> = {
    on<K extends keyof Events>(
      event: K | K[],
      listener: ListenerFunction<Events[K]>,
      options?: ListenerOptions
    ): () => void {
      const eventName = String(Array.isArray(event) ? event[0] : event);

      if (!listeners.has(eventName)) {
        listeners.set(eventName, new Set());
      }
      listeners.get(eventName)!.add(listener as ListenerFunction);

      if (debug) {
        console.debug('[WorkerBridge] Listener registered for event:', eventName);
      }

      // Return unbind function
      return () => {
        const eventListeners = listeners.get(eventName);
        if (eventListeners) {
          eventListeners.delete(listener as ListenerFunction);
          if (eventListeners.size === 0) {
            listeners.delete(eventName);
          }
        }
      };
    },

    once<K extends keyof Events>(
      event: K,
      listener?: any,
      options?: any
    ): any {
      // Handle promise-based once
      if (listener === undefined) {
        return new Promise((resolve) => {
          const unbind = this.on(event, (evt) => {
            unbind();
            resolve(evt);
          });
        });
      }

      // Handle listener-based once
      const unbind = this.on(event, async (evt, ctx) => {
        unbind();
        await listener(evt, ctx);
      }, options);
      return unbind;
    },

    off<K extends keyof Events>(event: K, listener?: ListenerFunction<Events[K]>): void {
      const eventName = String(event);

      if (!listener) {
        listeners.delete(eventName);
        return;
      }

      const eventListeners = listeners.get(eventName);
      if (eventListeners) {
        eventListeners.delete(listener as ListenerFunction);
        if (eventListeners.size === 0) {
          listeners.delete(eventName);
        }
      }
    },

    offAll(event?: keyof Events): void {
      if (!event) {
        listeners.clear();
      } else {
        listeners.delete(String(event));
      }
    },

    async emit<K extends keyof Events>(event: K, data?: Events[K]): Promise<void> {
      sendToWorker(String(event), data);
    },

    async emitSerial<K extends keyof Events>(event: K, data?: Events[K]): Promise<void> {
      // Serial emit behaves the same as regular emit for worker bridge
      sendToWorker(String(event), data);
    },

    compose(): () => void {
      throw new Error('compose() is not supported in worker bridge');
    },

    events<K extends keyof Events>(): AsyncIterable<KernelEvent<Events[K]>> {
      throw new Error('events() is not supported in worker bridge');
    },

    listenerCount(event?: keyof Events): number {
      if (!event) {
        let total = 0;
        for (const set of listeners.values()) {
          total += set.size;
        }
        return total;
      }
      return listeners.get(String(event))?.size ?? 0;
    },

    eventNames(): (keyof Events)[] {
      return Array.from(listeners.keys()) as (keyof Events)[];
    },

    debug(enabled: boolean): void {
      // Debug mode is set at bridge creation, cannot be changed dynamically
      if (debug) {
        console.debug('[WorkerBridge] Debug mode is set at creation time');
      }
    },
  };

  /**
   * Terminate worker and cleanup
   */
  const terminate = () => {
    if (isTerminated) {
      return;
    }

    if (debug) {
      console.debug('[WorkerBridge] Terminating worker');
    }

    isTerminated = true;

    // Clear initialization timeout
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }

    listeners.clear();
    workerInstance.removeEventListener('message', handleMessage);
    workerInstance.removeEventListener('error', handleError);
    workerInstance.terminate();

    // Reject ready promise if still pending
    if (readyReject) {
      readyReject(new Error('Worker bridge terminated before ready'));
      readyReject = null;
      readyResolve = null;
    }
  };

  return {
    kernel: proxyKernel,
    get ready() {
      return isReady;
    },
    readyPromise,
    terminate,
  };
}
