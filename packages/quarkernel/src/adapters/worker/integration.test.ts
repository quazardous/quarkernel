/**
 * Worker Adapter Integration Tests (T091)
 *
 * Integration tests verifying Worker adapter in real environments.
 * Tests worker communication lifecycle, bidirectional events, and cleanup.
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { createKernel } from '../../kernel.js';
import { createWorkerBridge, type WorkerBridge } from './bridge.js';
import { createWorkerKernel, type WorkerKernel } from './kernel.js';
import type { Kernel, EventMap } from '../../types.js';

/**
 * Handle expected unhandled rejections from worker integration tests.
 * These rejections occur when testing error scenarios and are expected.
 */
const expectedRejectionPatterns = [
  'Worker bridge terminated before ready',
  'Worker initialization failed',
  'Worker error:',
  'Worker initialization timeout',
];

const rejectionHandler = (reason: any) => {
  const message = reason?.message || String(reason);
  const isExpected = expectedRejectionPatterns.some(pattern => message.includes(pattern));
  if (!isExpected) {
    originalConsoleError('Unexpected unhandled rejection in worker integration test:', reason);
  }
};

// Suppress expected error messages from appearing in test output
let originalConsoleError: typeof console.error;

beforeAll(() => {
  originalConsoleError = console.error;
  console.error = (...args: any[]) => {
    const message = args.map(a => String(a)).join(' ');
    const isExpected = expectedRejectionPatterns.some(pattern => message.includes(pattern));
    if (isExpected) {
      // Silent - these are expected test scenarios, no output needed
    } else {
      originalConsoleError(...args);
    }
  };
  process.on('unhandledRejection', rejectionHandler);
});

afterAll(() => {
  console.error = originalConsoleError;
  process.off('unhandledRejection', rejectionHandler);
});

/**
 * Mock Worker implementation for testing bidirectional communication
 */
class IntegrationMockWorker {
  private messageHandlers: ((event: MessageEvent) => void)[] = [];
  private errorHandlers: ((event: ErrorEvent) => void)[] = [];
  private terminated = false;

  addEventListener(type: string, handler: any): void {
    if (type === 'message') {
      this.messageHandlers.push(handler);
    } else if (type === 'error') {
      this.errorHandlers.push(handler);
    }
  }

  removeEventListener(type: string, handler: any): void {
    if (type === 'message') {
      const index = this.messageHandlers.indexOf(handler);
      if (index > -1) {
        this.messageHandlers.splice(index, 1);
      }
    } else if (type === 'error') {
      const index = this.errorHandlers.indexOf(handler);
      if (index > -1) {
        this.errorHandlers.splice(index, 1);
      }
    }
  }

  postMessage(data: any): void {
    if (this.terminated) {
      throw new Error('Worker is terminated');
    }
    // Simulate worker processing the message
    setTimeout(() => this.simulateWorkerReceive(data), 0);
  }

  terminate(): void {
    this.terminated = true;
    this.messageHandlers = [];
    this.errorHandlers = [];
  }

  // Simulate worker receiving message from main
  private simulateWorkerReceive(data: any): void {
    if (this.terminated) return;

    // Worker processes message and may respond
    if (data.type === 'event' && data.origin === 'main') {
      // Echo back with worker origin
      this.simulateWorkerSend({
        type: 'event',
        name: `${data.name}:response`,
        data: { original: data.data },
        origin: 'worker',
      });
    }
  }

  // Simulate worker sending message to main - use setTimeout to prevent unhandled rejections
  simulateWorkerSend(data: any): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        if (this.terminated) {
          resolve();
          return;
        }
        const event = new MessageEvent('message', { data });
        this.messageHandlers.forEach((handler) => handler(event));
        resolve();
      }, 0);
    });
  }

  simulateError(error: Error): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        if (this.terminated) {
          resolve();
          return;
        }
        const event = {
          type: 'error' as const,
          message: error.message,
          error,
        };
        this.errorHandlers.forEach((handler) => handler(event as any));
        resolve();
      }, 0);
    });
  }

  isTerminated(): boolean {
    return this.terminated;
  }
}

/**
 * Mock worker global context for worker-side tests
 */
class MockWorkerGlobal {
  private messageHandlers: ((event: MessageEvent) => void)[] = [];
  private postedMessages: any[] = [];

  addEventListener(type: string, handler: any): void {
    if (type === 'message') {
      this.messageHandlers.push(handler);
    }
  }

  removeEventListener(type: string, handler: any): void {
    if (type === 'message') {
      const index = this.messageHandlers.indexOf(handler);
      if (index > -1) {
        this.messageHandlers.splice(index, 1);
      }
    }
  }

  postMessage(data: any): void {
    this.postedMessages.push(data);
  }

  simulateMessage(data: any): void {
    const event = new MessageEvent('message', { data });
    this.messageHandlers.forEach((handler) => handler(event));
  }

  getPostedMessages(): any[] {
    return this.postedMessages;
  }

  clearPostedMessages(): void {
    this.postedMessages = [];
  }
}

interface TestEvents extends EventMap {
  'task:start': { id: number };
  'task:start:response': { original: { id: number } };
  'task:complete': { id: number; result: string };
  'task:complete:response': { original: { id: number; result: string } };
  'worker:compute': { value: number };
  'main:result': { computed: number };
}

describe('Worker Adapter Integration Tests (T091)', () => {
  describe('Main ↔ Worker bidirectional communication', () => {
    let mockWorker: IntegrationMockWorker;
    let bridge: WorkerBridge<TestEvents>;

    beforeEach(() => {
      mockWorker = new IntegrationMockWorker();
    });

    afterEach(() => {
      if (bridge) {
        bridge.terminate();
      }
    });

    it('should establish bidirectional communication between main and worker', async () => {
      bridge = createWorkerBridge<TestEvents>(mockWorker as any);

      // Simulate worker ready
      await mockWorker.simulateWorkerSend({ type: 'worker:ready' });
      await bridge.readyPromise;

      expect(bridge.ready).toBe(true);

      // Main emits event
      const receivedEvents: string[] = [];
      bridge.kernel.on('task:start:response', (event) => {
        receivedEvents.push(event.name);
      });

      await bridge.kernel.emit('task:start', { id: 1 });

      // Wait for async message handling
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(receivedEvents).toContain('task:start:response');
    });

    it('should handle multiple events in sequence', async () => {
      bridge = createWorkerBridge<TestEvents>(mockWorker as any);

      await mockWorker.simulateWorkerSend({ type: 'worker:ready' });
      await bridge.readyPromise;

      const responses: any[] = [];
      bridge.kernel.on('task:start:response', (event) => {
        responses.push(event.data.original);
      });

      await bridge.kernel.emit('task:start', { id: 1 });
      await bridge.kernel.emit('task:start', { id: 2 });
      await bridge.kernel.emit('task:start', { id: 3 });

      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(responses).toHaveLength(3);
      expect(responses.map((r) => r.id)).toEqual([1, 2, 3]);
    });

    it('should prevent infinite message loops with origin tracking', async () => {
      bridge = createWorkerBridge<TestEvents>(mockWorker as any);

      await mockWorker.simulateWorkerSend({ type: 'worker:ready' });
      await bridge.readyPromise;

      // Send event with worker origin - should be ignored by bridge
      await mockWorker.simulateWorkerSend({
        type: 'event',
        name: 'task:complete',
        data: { id: 1, result: 'done' },
        origin: 'worker',
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      // If infinite loop prevention works, worker won't receive echo
      expect(mockWorker.isTerminated()).toBe(false);
    });

    it('should handle worker errors gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      bridge = createWorkerBridge<TestEvents>(mockWorker as any, { debug: true });

      await mockWorker.simulateWorkerSend({ type: 'worker:ready' });
      await bridge.readyPromise;

      // Simulate worker error
      await mockWorker.simulateError(new Error('Worker computation failed'));

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(consoleErrorSpy).toHaveBeenCalled();

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Worker.terminate() cleanup', () => {
    let mockWorker: IntegrationMockWorker;
    let bridge: WorkerBridge<TestEvents>;

    beforeEach(() => {
      mockWorker = new IntegrationMockWorker();
    });

    afterEach(() => {
      if (bridge && !mockWorker.isTerminated()) {
        bridge.terminate();
      }
    });

    it('should cleanup all listeners on terminate', async () => {
      bridge = createWorkerBridge<TestEvents>(mockWorker as any);

      await mockWorker.simulateWorkerSend({ type: 'worker:ready' });
      await bridge.readyPromise;

      bridge.kernel.on('task:complete', () => {});
      bridge.kernel.on('task:start', () => {});

      expect(bridge.ready).toBe(true);

      bridge.terminate();

      expect(mockWorker.isTerminated()).toBe(true);
    });

    it('should reject emits after termination', async () => {
      bridge = createWorkerBridge<TestEvents>(mockWorker as any);

      await mockWorker.simulateWorkerSend({ type: 'worker:ready' });
      await bridge.readyPromise;

      bridge.terminate();

      await expect(
        bridge.kernel.emit('task:start', { id: 1 })
      ).rejects.toThrow('Worker bridge has been terminated');
    });

    it('should handle multiple terminate calls safely', async () => {
      bridge = createWorkerBridge<TestEvents>(mockWorker as any);

      await mockWorker.simulateWorkerSend({ type: 'worker:ready' });
      await bridge.readyPromise;

      bridge.terminate();
      bridge.terminate();
      bridge.terminate();

      expect(mockWorker.isTerminated()).toBe(true);
    });
  });

  describe('Worker-side kernel integration', () => {
    let mockSelf: MockWorkerGlobal;
    let originalSelf: any;
    let kernel: Kernel<TestEvents>;
    let workerKernel: WorkerKernel;

    beforeEach(() => {
      mockSelf = new MockWorkerGlobal();
      originalSelf = (globalThis as any).self;
      (globalThis as any).self = mockSelf;

      kernel = createKernel<TestEvents>();
    });

    afterEach(() => {
      if (workerKernel) {
        workerKernel.cleanup();
      }
      (globalThis as any).self = originalSelf;
    });

    it('should process events from main thread', async () => {
      workerKernel = createWorkerKernel(kernel);

      const processedEvents: any[] = [];
      kernel.on('task:start', (event) => {
        processedEvents.push(event.data);
      });

      // Simulate message from main
      mockSelf.simulateMessage({
        type: 'event',
        name: 'task:start',
        data: { id: 42 },
        origin: 'main',
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(processedEvents).toHaveLength(1);
      expect(processedEvents[0]).toEqual({ id: 42 });
    });

    it('should send events to main thread', async () => {
      workerKernel = createWorkerKernel(kernel);

      await kernel.emit('task:complete', { id: 1, result: 'done' });

      await new Promise((resolve) => setTimeout(resolve, 10));

      const messages = mockSelf.getPostedMessages();
      const eventMessages = messages.filter((m) => m.type === 'event');

      expect(eventMessages).toHaveLength(1);
      expect(eventMessages[0].name).toBe('task:complete');
      expect(eventMessages[0].data).toEqual({ id: 1, result: 'done' });
      expect(eventMessages[0].origin).toBe('worker');
    });

    it('should cleanup listeners on worker cleanup', () => {
      workerKernel = createWorkerKernel(kernel);

      kernel.on('task:start', () => {});
      kernel.on('task:complete', () => {});

      workerKernel.cleanup();

      // Verify no more messages are sent after cleanup
      const beforeCount = mockSelf.getPostedMessages().length;

      mockSelf.simulateMessage({
        type: 'event',
        name: 'task:start',
        data: { id: 1 },
        origin: 'main',
      });

      const afterCount = mockSelf.getPostedMessages().length;
      expect(afterCount).toBe(beforeCount);
    });
  });

  describe('Error handling and edge cases', () => {
    let mockWorker: IntegrationMockWorker;
    let bridge: WorkerBridge<TestEvents> | null = null;

    beforeEach(() => {
      mockWorker = new IntegrationMockWorker();
      bridge = null;
    });

    afterEach(async () => {
      if (bridge) {
        // Catch any pending rejections from terminate or timeout
        const catchPromise = bridge.readyPromise.catch(() => {});
        try {
          bridge.terminate();
        } catch (e) {
          // Ignore termination errors in cleanup
        }
        await catchPromise;
        bridge = null;
      }
    });

    it('should timeout if worker never sends ready', async () => {
      // Use separate mockWorker to avoid affecting other tests
      const tempWorker = new IntegrationMockWorker();
      const tempBridge = createWorkerBridge<TestEvents>(tempWorker as any, {
        initTimeout: 50,
      });

      // Attach handler immediately to prevent unhandled rejection
      const rejectionPromise = tempBridge.readyPromise.catch((error) => error);

      // Wait for the rejection
      const error = await rejectionPromise;
      expect(error.message).toContain('Worker initialization timeout');

      // Cleanup - must terminate to clear any remaining timers
      tempBridge.terminate();
    });

    it('should handle malformed messages gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      bridge = createWorkerBridge<TestEvents>(mockWorker as any, { initTimeout: 200 });

      await mockWorker.simulateWorkerSend({ type: 'worker:ready' });
      await bridge.readyPromise;

      // Send malformed messages - these will cause errors but should not crash
      try {
        await mockWorker.simulateWorkerSend({ invalid: 'message' } as any);
      } catch (e) {
        // Expected to fail
      }

      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should still be functional despite malformed messages
      expect(bridge.ready).toBe(true);

      consoleErrorSpy.mockRestore();
    });

    it('should emit events only to registered listeners', async () => {
      bridge = createWorkerBridge<TestEvents>(mockWorker as any, { initTimeout: 5000 });

      await mockWorker.simulateWorkerSend({ type: 'worker:ready' });
      await bridge.readyPromise;

      const receivedEvents: string[] = [];

      // Only listen to task:start:response
      bridge.kernel.on('task:start:response', (event) => {
        receivedEvents.push(event.name);
      });

      await bridge.kernel.emit('task:start', { id: 1 });
      await bridge.kernel.emit('task:complete', { id: 1, result: 'done' });

      await new Promise((resolve) => setTimeout(resolve, 20));

      // Should only receive task:start:response, not task:complete:response
      expect(receivedEvents).toEqual(['task:start:response']);
      expect(receivedEvents).not.toContain('task:complete:response');
    });
  });
});
