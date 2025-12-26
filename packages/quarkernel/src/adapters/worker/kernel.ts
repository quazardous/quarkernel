/**
 * Worker Kernel - Worker Thread Side
 *
 * Creates a worker-side adapter that wraps an existing kernel and bridges
 * events with the main thread via postMessage. Handles bidirectional event
 * passing and prevents echo loops with origin tracking.
 *
 * Architecture:
 * - Worker thread: createWorkerKernel(kernel) wraps existing kernel
 * - Listens to self.onmessage for events from main thread
 * - Subscribes to kernel.on('*') and forwards to main via postMessage
 * - Sends ready signal after initialization
 * - Origin tracking prevents infinite message loops
 */

import type { Kernel, EventMap, KernelEvent } from '../../types.js';

/**
 * Internal message types for worker communication
 * Must match the types defined in bridge.ts
 */
type WorkerMessage =
  | { type: 'worker:ready' }
  | { type: 'worker:error'; error: { message: string; stack?: string } }
  | { type: 'event'; name: string; data: any; origin: 'main' | 'worker' };

/**
 * Options for creating worker kernel
 */
export interface WorkerKernelOptions {
  /** Debug mode - enables logging */
  debug?: boolean;
}

/**
 * Worker kernel instance with cleanup
 */
export interface WorkerKernel {
  /** Cleanup and stop listening */
  cleanup(): void;
}

/**
 * Create a worker-side kernel adapter that bridges with the main thread
 *
 * @param kernel - Existing kernel instance to wrap
 * @param options - Worker kernel configuration options
 * @returns WorkerKernel with cleanup method
 *
 * @example
 * ```ts
 * // In worker.js
 * import { createKernel } from 'quarkernel';
 * import { createWorkerKernel } from 'quarkernel/adapters/worker';
 *
 * const kernel = createKernel();
 * const workerKernel = createWorkerKernel(kernel);
 *
 * // Use kernel normally
 * kernel.on('task:start', async (event) => {
 *   const result = await processTask(event.data);
 *   await kernel.emit('task:complete', result);
 * });
 * ```
 */
export function createWorkerKernel<Events extends EventMap = EventMap>(
  kernel: Kernel<Events>,
  options: WorkerKernelOptions = {}
): WorkerKernel {
  const { debug = false } = options;

  // Verify we're in a worker context
  if (typeof self === 'undefined' || typeof self.postMessage !== 'function') {
    throw new Error('createWorkerKernel must be called in a Worker context');
  }

  /**
   * Handle incoming messages from main thread
   */
  const handleMessage = (event: MessageEvent<WorkerMessage>) => {
    const message = event.data;

    if (debug) {
      console.debug('[WorkerKernel] Received message from main:', message.type);
    }

    // Only process event messages
    if (message.type !== 'event') {
      return;
    }

    // Ignore events that originated from worker (prevent echo)
    if (message.origin === 'worker') {
      if (debug) {
        console.debug('[WorkerKernel] Ignoring worker-originated event:', message.name);
      }
      return;
    }

    // Emit the event to the local kernel
    // Fire-and-forget - kernel handles errors internally with errorBoundary
    kernel.emit(message.name as keyof Events, message.data);
  };

  /**
   * Subscribe to all kernel events and forward to main thread
   * Uses wildcard pattern ** to capture all events
   */
  const unbindWildcard = kernel.on('**' as keyof Events, (event: KernelEvent) => {
    // Forward event to main thread
    const message: WorkerMessage = {
      type: 'event',
      name: event.name,
      data: event.data,
      origin: 'worker',
    };

    if (debug) {
      console.debug('[WorkerKernel] Forwarding event to main:', event.name);
    }

    self.postMessage(message);
  });

  // Setup message listener
  self.addEventListener('message', handleMessage as any);

  // Send ready signal to main thread
  const readyMessage: WorkerMessage = { type: 'worker:ready' };
  self.postMessage(readyMessage);

  if (debug) {
    console.debug('[WorkerKernel] Initialized and ready');
  }

  /**
   * Cleanup function
   */
  const cleanup = () => {
    if (debug) {
      console.debug('[WorkerKernel] Cleaning up');
    }

    // Remove message listener
    self.removeEventListener('message', handleMessage as any);

    // Unbind wildcard listener
    unbindWildcard();
  };

  return {
    cleanup,
  };
}
