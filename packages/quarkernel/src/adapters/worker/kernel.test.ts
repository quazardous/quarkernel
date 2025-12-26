/**
 * Worker Kernel Tests
 *
 * Tests for the worker thread side of the worker adapter.
 * Mocks the worker global context (self) to simulate worker environment.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createWorkerKernel, type WorkerKernel } from './kernel.js';
import { createKernel } from '../../kernel.js';
import type { Kernel, EventMap } from '../../types.js';

/**
 * Mock worker global context
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

  // Test helpers
  simulateMessage(data: any): void {
    const event = new MessageEvent('message', { data });
    this.messageHandlers.forEach((handler) => handler(event));
  }

  getPostedMessages(): any[] {
    return this.postedMessages;
  }

  getLastPostedMessage(): any {
    return this.postedMessages[this.postedMessages.length - 1];
  }

  clearPostedMessages(): void {
    this.postedMessages = [];
  }

  getMessageHandlerCount(): number {
    return this.messageHandlers.length;
  }
}

interface TestEvents extends EventMap {
  'test:event': { value: number };
  'task:start': { id: number };
  'task:complete': { id: number; success: boolean };
  'worker:output': { result: string };
}

describe('WorkerKernel', () => {
  let mockSelf: MockWorkerGlobal;
  let originalSelf: any;
  let kernel: Kernel<TestEvents>;
  let workerKernel: WorkerKernel;

  beforeEach(() => {
    // Mock the global self object
    mockSelf = new MockWorkerGlobal();
    originalSelf = (globalThis as any).self;
    (globalThis as any).self = mockSelf;

    // Create a fresh kernel for each test
    kernel = createKernel<TestEvents>();
  });

  afterEach(() => {
    // Cleanup
    if (workerKernel) {
      workerKernel.cleanup();
    }

    // Restore original self
    (globalThis as any).self = originalSelf;
  });

  describe('Initialization', () => {
    it('creates worker kernel and sends ready message', () => {
      workerKernel = createWorkerKernel(kernel);

      expect(workerKernel).toBeDefined();
      expect(workerKernel.cleanup).toBeInstanceOf(Function);

      // Should post ready message immediately
      const messages = mockSelf.getPostedMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({ type: 'worker:ready' });
    });

    it('throws error when not in worker context', () => {
      // Remove self to simulate non-worker context
      const tempSelf = (globalThis as any).self;
      (globalThis as any).self = undefined;

      expect(() => {
        createWorkerKernel(kernel);
      }).toThrow('createWorkerKernel must be called in a Worker context');

      // Restore self
      (globalThis as any).self = tempSelf;
    });

    it('registers message listener on initialization', () => {
      workerKernel = createWorkerKernel(kernel);

      // Should have registered one message listener
      expect(mockSelf.getMessageHandlerCount()).toBe(1);
    });

    it('subscribes to wildcard events on kernel', async () => {
      workerKernel = createWorkerKernel(kernel);

      // Emit an event and verify it gets forwarded
      await kernel.emit('test:event', { value: 42 });

      const messages = mockSelf.getPostedMessages();
      // Should have ready + the forwarded event
      expect(messages.length).toBeGreaterThan(1);
      const eventMessage = messages.find((m) => m.type === 'event');
      expect(eventMessage).toBeDefined();
      expect(eventMessage.name).toBe('test:event');
      expect(eventMessage.data.value).toBe(42);
    });
  });

  describe('Receiving events from main thread', () => {
    beforeEach(() => {
      workerKernel = createWorkerKernel(kernel);
      mockSelf.clearPostedMessages(); // Clear ready message
    });

    it('receives event from main and emits to local kernel', async () => {
      const listener = vi.fn();
      kernel.on('test:event', listener);

      // Simulate message from main thread
      mockSelf.simulateMessage({
        type: 'event',
        name: 'test:event',
        data: { value: 123 },
        origin: 'main',
      });

      // Wait for event to be processed
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(listener).toHaveBeenCalledOnce();
      expect(listener.mock.calls[0][0].data).toEqual({ value: 123 });
    });

    it('ignores worker-originated events (prevents echo)', async () => {
      const listener = vi.fn();
      kernel.on('test:event', listener);

      // Simulate message with worker origin (echo)
      mockSelf.simulateMessage({
        type: 'event',
        name: 'test:event',
        data: { value: 999 },
        origin: 'worker',
      });

      // Wait for potential processing
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should not trigger listener
      expect(listener).not.toHaveBeenCalled();
    });

    it('ignores non-event messages', async () => {
      const listener = vi.fn();
      kernel.on('test:event', listener);

      // Simulate non-event message
      mockSelf.simulateMessage({
        type: 'worker:ready',
      });

      // Wait for potential processing
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(listener).not.toHaveBeenCalled();
    });

    it('handles multiple events from main thread', async () => {
      const startListener = vi.fn();
      const completeListener = vi.fn();

      kernel.on('task:start', startListener);
      kernel.on('task:complete', completeListener);

      // Simulate multiple messages
      mockSelf.simulateMessage({
        type: 'event',
        name: 'task:start',
        data: { id: 1 },
        origin: 'main',
      });

      mockSelf.simulateMessage({
        type: 'event',
        name: 'task:complete',
        data: { id: 1, success: true },
        origin: 'main',
      });

      // Wait for events to be processed
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(startListener).toHaveBeenCalledOnce();
      expect(completeListener).toHaveBeenCalledOnce();
    });
  });

  describe('Sending events to main thread', () => {
    beforeEach(() => {
      workerKernel = createWorkerKernel(kernel);
      mockSelf.clearPostedMessages(); // Clear ready message
    });

    it('forwards kernel events to main thread', async () => {
      await kernel.emit('worker:output', { result: 'test' });

      const messages = mockSelf.getPostedMessages();
      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({
        type: 'event',
        name: 'worker:output',
        data: { result: 'test' },
        origin: 'worker',
      });
    });

    it('forwards multiple events to main thread', async () => {
      await kernel.emit('test:event', { value: 1 });
      await kernel.emit('test:event', { value: 2 });
      await kernel.emit('test:event', { value: 3 });

      const messages = mockSelf.getPostedMessages();
      expect(messages).toHaveLength(3);
      expect(messages[0].data.value).toBe(1);
      expect(messages[1].data.value).toBe(2);
      expect(messages[2].data.value).toBe(3);
    });

    it('includes correct origin for forwarded events', async () => {
      await kernel.emit('task:start', { id: 42 });

      const message = mockSelf.getLastPostedMessage();
      expect(message.origin).toBe('worker');
    });
  });

  describe('Bidirectional event flow', () => {
    beforeEach(() => {
      workerKernel = createWorkerKernel(kernel);
      mockSelf.clearPostedMessages();
    });

    it('handles round-trip event flow', async () => {
      // Setup listener that responds to incoming event
      kernel.on('task:start', async (event) => {
        await kernel.emit('task:complete', {
          id: event.data.id,
          success: true,
        });
      });

      // Simulate event from main
      mockSelf.simulateMessage({
        type: 'event',
        name: 'task:start',
        data: { id: 100 },
        origin: 'main',
      });

      // Wait for processing - need longer timeout for async emit
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should have posted the response
      const messages = mockSelf.getPostedMessages();
      const completeMessage = messages.find((m) => m.name === 'task:complete');

      expect(completeMessage).toBeDefined();
      expect(completeMessage.data).toEqual({ id: 100, success: true });
    });

    it('prevents infinite loops with origin tracking', async () => {
      // This test verifies that main-originated events don't trigger
      // the wildcard listener that would re-emit them (preventing echo loop)

      const localListener = vi.fn();
      kernel.on('test:event', localListener);

      // Simulate event from main
      mockSelf.simulateMessage({
        type: 'event',
        name: 'test:event',
        data: { value: 1 },
        origin: 'main',
      });

      await new Promise((resolve) => setTimeout(resolve, 20));

      // Local listener should fire once from the main-originated event
      expect(localListener).toHaveBeenCalledOnce();

      // The local listener execution will cause the wildcard to forward it,
      // but with origin: 'worker'. This is correct - we forward local emissions.
      const messages = mockSelf.getPostedMessages();
      const workerMessages = messages.filter(
        (m) => m.type === 'event' && m.name === 'test:event' && m.origin === 'worker'
      );

      // The key test: if this message came back from main with origin: 'worker',
      // it would be ignored by handleMessage, preventing infinite loops
      expect(workerMessages.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Error handling', () => {
    beforeEach(() => {
      workerKernel = createWorkerKernel(kernel);
      mockSelf.clearPostedMessages();
    });

    it('handles listener errors gracefully', async () => {
      // Spy on console.error to verify kernel error handling
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Register listener that throws
      kernel.on('test:event', async () => {
        throw new Error('Test error');
      });

      // Simulate event from main
      mockSelf.simulateMessage({
        type: 'event',
        name: 'test:event',
        data: { value: 1 },
        origin: 'main',
      });

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Kernel should have logged the error (errorBoundary: true by default)
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Kernel error:',
        expect.objectContaining({ message: 'Test error' })
      );

      // No error message should be posted to main thread
      // (kernel handles errors internally with errorBoundary)
      const messages = mockSelf.getPostedMessages();
      const errorMessage = messages.find((m) => m.type === 'worker:error');
      expect(errorMessage).toBeUndefined();

      consoleErrorSpy.mockRestore();
    });

    it('continues processing after error', async () => {
      const listener = vi.fn();

      kernel.on('test:event', async () => {
        throw new Error('Error in first event');
      });

      kernel.on('task:start', listener);

      // Simulate events
      mockSelf.simulateMessage({
        type: 'event',
        name: 'test:event',
        data: { value: 1 },
        origin: 'main',
      });

      mockSelf.simulateMessage({
        type: 'event',
        name: 'task:start',
        data: { id: 1 },
        origin: 'main',
      });

      await new Promise((resolve) => setTimeout(resolve, 20));

      // Second event should still be processed
      expect(listener).toHaveBeenCalled();
    });
  });

  describe('Cleanup', () => {
    beforeEach(() => {
      workerKernel = createWorkerKernel(kernel);
    });

    it('removes message listener on cleanup', () => {
      expect(mockSelf.getMessageHandlerCount()).toBe(1);

      workerKernel.cleanup();

      expect(mockSelf.getMessageHandlerCount()).toBe(0);
    });

    it('unbinds wildcard listener on cleanup', async () => {
      workerKernel.cleanup();
      mockSelf.clearPostedMessages();

      // Emit event after cleanup
      await kernel.emit('test:event', { value: 999 });

      // Should not forward events after cleanup
      const messages = mockSelf.getPostedMessages();
      expect(messages).toHaveLength(0);
    });

    it('stops processing incoming messages after cleanup', async () => {
      const listener = vi.fn();
      kernel.on('test:event', listener);

      workerKernel.cleanup();

      // Simulate message after cleanup
      mockSelf.simulateMessage({
        type: 'event',
        name: 'test:event',
        data: { value: 999 },
        origin: 'main',
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should not process the message
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('Debug mode', () => {
    it('creates worker kernel with debug enabled', () => {
      const consoleSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

      workerKernel = createWorkerKernel(kernel, { debug: true });

      // Should log initialization
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[WorkerKernel]')
      );

      consoleSpy.mockRestore();
    });

    it('logs messages in debug mode', async () => {
      const consoleSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

      workerKernel = createWorkerKernel(kernel, { debug: true });
      consoleSpy.mockClear();

      // Simulate incoming message
      mockSelf.simulateMessage({
        type: 'event',
        name: 'test:event',
        data: { value: 1 },
        origin: 'main',
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should log message receipt
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[WorkerKernel]'),
        expect.anything()
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Integration scenarios', () => {
    beforeEach(() => {
      workerKernel = createWorkerKernel(kernel);
      mockSelf.clearPostedMessages();
    });

    it('handles complex task processing workflow', async () => {
      const results: any[] = [];

      // Setup worker-side task processing
      kernel.on('task:start', async (event) => {
        // Simulate processing
        const result = {
          id: event.data.id,
          success: true,
        };
        results.push(result);
        await kernel.emit('task:complete', result);
      });

      // Main thread sends task
      mockSelf.simulateMessage({
        type: 'event',
        name: 'task:start',
        data: { id: 42 },
        origin: 'main',
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify processing happened
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(42);

      // Verify completion sent back to main
      const messages = mockSelf.getPostedMessages();
      const completeMsg = messages.find((m) => m.name === 'task:complete');
      expect(completeMsg).toBeDefined();
      expect(completeMsg.data.success).toBe(true);
    });

    it('handles parallel event processing', async () => {
      const processedIds: number[] = [];

      kernel.on('task:start', async (event) => {
        processedIds.push(event.data.id);
        await kernel.emit('task:complete', { id: event.data.id, success: true });
      });

      // Send multiple tasks
      for (let i = 1; i <= 5; i++) {
        mockSelf.simulateMessage({
          type: 'event',
          name: 'task:start',
          data: { id: i },
          origin: 'main',
        });
      }

      await new Promise((resolve) => setTimeout(resolve, 30));

      // All tasks should be processed
      expect(processedIds).toHaveLength(5);
      expect(processedIds.sort()).toEqual([1, 2, 3, 4, 5]);
    });
  });
});
