/**
 * Worker Bridge Tests
 *
 * Tests for the main thread side of the worker bridge.
 * Uses a mock worker to simulate worker behavior without actual Worker threads.
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import { createWorkerBridge, type WorkerBridge } from './bridge.js';
import type { EventMap } from '../../types.js';

/**
 * Handle expected unhandled rejections from worker bridge tests.
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
    originalConsoleError('Unexpected unhandled rejection in worker bridge test:', reason);
  }
};

// Reformat expected error messages to be clearly labeled as test scenarios
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
 * Mock Worker implementation for testing
 */
class MockWorker {
  private messageHandlers: ((event: MessageEvent) => void)[] = [];
  private errorHandlers: ((event: ErrorEvent) => void)[] = [];

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
    // Store for assertions
    (this as any).lastPostedMessage = data;
  }

  terminate(): void {
    this.messageHandlers = [];
    this.errorHandlers = [];
  }

  // Test helpers - use setTimeout to simulate async message delivery
  // This gives catch handlers time to be attached before rejection occurs
  simulateMessage(data: any): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const event = new MessageEvent('message', { data });
        this.messageHandlers.forEach((handler) => handler(event));
        resolve();
      }, 0);
    });
  }

  simulateError(message: string): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        const event = { type: 'error', message } as ErrorEvent;
        this.errorHandlers.forEach((handler) => handler(event));
        resolve();
      }, 0);
    });
  }

  getLastPostedMessage(): any {
    return (this as any).lastPostedMessage;
  }
}

interface TestEvents extends EventMap {
  'test:event': { value: number };
  'worker:output': { result: string };
  'task:start': { id: number };
  'task:complete': { id: number; success: boolean };
}

describe('WorkerBridge', () => {
  let mockWorker: MockWorker;
  let bridge: WorkerBridge<TestEvents>;

  beforeEach(() => {
    mockWorker = new MockWorker();
  });

  afterEach(async () => {
    if (bridge) {
      // Catch any pending rejections from terminate or timeout
      const catchPromise = bridge.readyPromise.catch(() => {});
      bridge.terminate();
      await catchPromise;
    }
  });

  describe('Initialization', () => {
    it('creates bridge with Worker instance', () => {
      bridge = createWorkerBridge<TestEvents>(mockWorker as any);

      expect(bridge).toBeDefined();
      expect(bridge.kernel).toBeDefined();
      expect(bridge.ready).toBe(false);
      expect(bridge.readyPromise).toBeInstanceOf(Promise);
    });

    it('resolves readyPromise when worker sends ready message', async () => {
      bridge = createWorkerBridge<TestEvents>(mockWorker as any);

      expect(bridge.ready).toBe(false);

      await mockWorker.simulateMessage({ type: 'worker:ready' });

      await bridge.readyPromise;
      expect(bridge.ready).toBe(true);
    });

    it('rejects readyPromise on worker error before ready', async () => {
      bridge = createWorkerBridge<TestEvents>(mockWorker as any);

      // Attach handler BEFORE triggering the error (prevents unhandled rejection)
      const errorPromise = bridge.readyPromise.catch((e) => e);

      // Trigger the error
      await mockWorker.simulateMessage({
        type: 'worker:error',
        error: { message: 'Worker initialization failed' },
      });

      const caughtError = await errorPromise;

      expect(caughtError).not.toBeNull();
      expect(caughtError.message).toContain('Worker initialization failed');
    });

    it('rejects readyPromise on ErrorEvent before ready', async () => {
      bridge = createWorkerBridge<TestEvents>(mockWorker as any);

      // Attach handler BEFORE triggering the error (prevents unhandled rejection)
      const errorPromise = bridge.readyPromise.catch((e) => e);

      // Trigger the error
      await mockWorker.simulateError('Script loading failed');

      const caughtError = await errorPromise;

      expect(caughtError).not.toBeNull();
      expect(caughtError.message).toContain('Worker error: Script loading failed');
    });

    it('rejects readyPromise on initialization timeout', async () => {
      // Use separate bridge to avoid cleanup issues
      const tempWorker = new MockWorker();
      const tempBridge = createWorkerBridge<TestEvents>(tempWorker as any, {
        initTimeout: 100,
      });

      // Transform rejection to resolution for clean handling
      const errorPromise = tempBridge.readyPromise.catch((e) => e);

      // Wait for the timeout
      const caughtError = await errorPromise;

      expect(caughtError.message).toContain('Worker initialization timeout after 100ms');

      // Cleanup
      tempBridge.terminate();
    });

    it('accepts custom timeout option', async () => {
      // Use separate bridge to avoid cleanup issues
      const tempWorker = new MockWorker();
      const tempBridge = createWorkerBridge<TestEvents>(tempWorker as any, {
        initTimeout: 50,
      });

      const startTime = Date.now();

      // Transform rejection to resolution for clean handling
      const errorPromise = tempBridge.readyPromise.catch((e) => e);

      // Wait for the timeout
      const caughtError = await errorPromise;

      const elapsed = Date.now() - startTime;

      expect(caughtError.message).toContain('timeout');

      // Timer precision can vary, be more forgiving
      expect(elapsed).toBeGreaterThanOrEqual(45);
      expect(elapsed).toBeLessThan(150);

      // Cleanup
      tempBridge.terminate();
    });
  });

  describe('Event emission (main → worker)', () => {
    beforeEach(async () => {
      bridge = createWorkerBridge<TestEvents>(mockWorker as any);
      await mockWorker.simulateMessage({ type: 'worker:ready' });
      await bridge.readyPromise;
    });

    it('sends event to worker via postMessage', async () => {
      await bridge.kernel.emit('test:event', { value: 42 });

      const message = mockWorker.getLastPostedMessage();
      expect(message).toEqual({
        type: 'event',
        name: 'test:event',
        data: { value: 42 },
        origin: 'main',
      });
    });

    it('sends event without data', async () => {
      await bridge.kernel.emit('task:start', { id: 1 });

      const message = mockWorker.getLastPostedMessage();
      expect(message.type).toBe('event');
      expect(message.name).toBe('task:start');
      expect(message.data).toEqual({ id: 1 });
    });

    it('emitSerial behaves same as emit', async () => {
      await bridge.kernel.emitSerial('test:event', { value: 99 });

      const message = mockWorker.getLastPostedMessage();
      expect(message).toEqual({
        type: 'event',
        name: 'test:event',
        data: { value: 99 },
        origin: 'main',
      });
    });

    it('throws error when emitting after terminate', async () => {
      bridge.terminate();

      await expect(bridge.kernel.emit('test:event', { value: 1 })).rejects.toThrow(
        'Worker bridge has been terminated'
      );
    });
  });

  describe('Event reception (worker → main)', () => {
    beforeEach(async () => {
      bridge = createWorkerBridge<TestEvents>(mockWorker as any);
      await mockWorker.simulateMessage({ type: 'worker:ready' });
      await bridge.readyPromise;
    });

    it('executes registered listener when event received from worker', async () => {
      const listener = vi.fn();
      bridge.kernel.on('worker:output', listener);

      await mockWorker.simulateMessage({
        type: 'event',
        name: 'worker:output',
        data: { result: 'done' },
        origin: 'worker',
      });

      // Wait for async listener execution
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'worker:output',
          data: { result: 'done' },
        }),
        expect.any(Object)
      );
    });

    it('ignores events with main origin (prevents echo)', async () => {
      const listener = vi.fn();
      bridge.kernel.on('test:event', listener);

      await mockWorker.simulateMessage({
        type: 'event',
        name: 'test:event',
        data: { value: 123 },
        origin: 'main',
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(listener).not.toHaveBeenCalled();
    });

    it('executes multiple listeners for same event', async () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      bridge.kernel.on('worker:output', listener1);
      bridge.kernel.on('worker:output', listener2);

      await mockWorker.simulateMessage({
        type: 'event',
        name: 'worker:output',
        data: { result: 'complete' },
        origin: 'worker',
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it('handles listener errors without crashing', async () => {
      const errorListener = vi.fn(() => {
        throw new Error('Listener failed');
      });
      const goodListener = vi.fn();

      bridge.kernel.on('worker:output', errorListener);
      bridge.kernel.on('worker:output', goodListener);

      await mockWorker.simulateMessage({
        type: 'event',
        name: 'worker:output',
        data: { result: 'test' },
        origin: 'worker',
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(errorListener).toHaveBeenCalled();
      expect(goodListener).toHaveBeenCalled();
    });
  });

  describe('Listener management', () => {
    beforeEach(async () => {
      bridge = createWorkerBridge<TestEvents>(mockWorker as any);
      await mockWorker.simulateMessage({ type: 'worker:ready' });
      await bridge.readyPromise;
    });

    it('returns unbind function from on()', async () => {
      const listener = vi.fn();
      const unbind = bridge.kernel.on('test:event', listener);

      expect(typeof unbind).toBe('function');

      await mockWorker.simulateMessage({
        type: 'event',
        name: 'test:event',
        data: { value: 1 },
        origin: 'worker',
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(listener).toHaveBeenCalledTimes(1);

      unbind();

      await mockWorker.simulateMessage({
        type: 'event',
        name: 'test:event',
        data: { value: 2 },
        origin: 'worker',
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('removes specific listener with off()', async () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      bridge.kernel.on('test:event', listener1);
      bridge.kernel.on('test:event', listener2);

      bridge.kernel.off('test:event', listener1);

      await mockWorker.simulateMessage({
        type: 'event',
        name: 'test:event',
        data: { value: 42 },
        origin: 'worker',
      });
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it('removes all listeners for event with off(event)', async () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      bridge.kernel.on('test:event', listener1);
      bridge.kernel.on('test:event', listener2);

      bridge.kernel.off('test:event');

      await mockWorker.simulateMessage({
        type: 'event',
        name: 'test:event',
        data: { value: 42 },
        origin: 'worker',
      });
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();
    });

    it('removes all listeners with offAll()', async () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      bridge.kernel.on('test:event', listener1);
      bridge.kernel.on('worker:output', listener2);

      bridge.kernel.offAll();

      await mockWorker.simulateMessage({
        type: 'event',
        name: 'test:event',
        data: { value: 1 },
        origin: 'worker',
      });
      await mockWorker.simulateMessage({
        type: 'event',
        name: 'worker:output',
        data: { result: 'test' },
        origin: 'worker',
      });
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();
    });

    it('returns correct listener count', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const listener3 = vi.fn();

      bridge.kernel.on('test:event', listener1);
      bridge.kernel.on('test:event', listener2);
      bridge.kernel.on('worker:output', listener3);

      expect(bridge.kernel.listenerCount('test:event')).toBe(2);
      expect(bridge.kernel.listenerCount('worker:output')).toBe(1);
      expect(bridge.kernel.listenerCount()).toBe(3);
    });

    it('returns event names with registered listeners', () => {
      bridge.kernel.on('test:event', vi.fn());
      bridge.kernel.on('worker:output', vi.fn());

      const names = bridge.kernel.eventNames();
      expect(names).toHaveLength(2);
      expect(names).toContain('test:event');
      expect(names).toContain('worker:output');
    });
  });

  describe('once() method', () => {
    beforeEach(async () => {
      bridge = createWorkerBridge<TestEvents>(mockWorker as any);
      await mockWorker.simulateMessage({ type: 'worker:ready' });
      await bridge.readyPromise;
    });

    it('removes listener after first execution', async () => {
      const listener = vi.fn();
      bridge.kernel.once('test:event', listener);

      await mockWorker.simulateMessage({
        type: 'event',
        name: 'test:event',
        data: { value: 1 },
        origin: 'worker',
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(listener).toHaveBeenCalledTimes(1);

      await mockWorker.simulateMessage({
        type: 'event',
        name: 'test:event',
        data: { value: 2 },
        origin: 'worker',
      });
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('returns promise that resolves with event when called without listener', async () => {
      const promise = bridge.kernel.once('test:event');

      await mockWorker.simulateMessage({
        type: 'event',
        name: 'test:event',
        data: { value: 999 },
        origin: 'worker',
      });

      const event = await promise;
      expect(event.name).toBe('test:event');
      expect(event.data).toEqual({ value: 999 });
    });
  });

  describe('Lifecycle', () => {
    beforeEach(async () => {
      bridge = createWorkerBridge<TestEvents>(mockWorker as any);
      await mockWorker.simulateMessage({ type: 'worker:ready' });
      await bridge.readyPromise;
    });

    it('cleans up on terminate', () => {
      const listener = vi.fn();
      bridge.kernel.on('test:event', listener);

      bridge.terminate();

      expect(bridge.kernel.listenerCount()).toBe(0);
    });

    it('rejects ready promise if terminated before ready', async () => {
      const tempWorker = new MockWorker();
      const bridge2 = createWorkerBridge<TestEvents>(tempWorker as any);

      // Attach handler BEFORE terminating - transforms rejection to resolution
      const errorPromise = bridge2.readyPromise.catch((e) => e);

      // Terminate immediately (before ready signal)
      bridge2.terminate();

      // Wait for the error
      const caughtError = await errorPromise;

      expect(caughtError.message).toContain('Worker bridge terminated before ready');
    });

    it('does not process messages after terminate', async () => {
      const listener = vi.fn();
      bridge.kernel.on('test:event', listener);

      bridge.terminate();

      await mockWorker.simulateMessage({
        type: 'event',
        name: 'test:event',
        data: { value: 42 },
        origin: 'worker',
      });
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('Unsupported methods', () => {
    beforeEach(async () => {
      bridge = createWorkerBridge<TestEvents>(mockWorker as any);
      await mockWorker.simulateMessage({ type: 'worker:ready' });
      await bridge.readyPromise;
    });

    it('throws error for compose()', () => {
      expect(() => {
        bridge.kernel.compose([], () => null);
      }).toThrow('compose() is not supported in worker bridge');
    });

    it('throws error for events()', () => {
      expect(() => {
        bridge.kernel.events('test:event');
      }).toThrow('events() is not supported in worker bridge');
    });
  });

  describe('Debug mode', () => {
    it('enables debug logging when debug option is true', async () => {
      const consoleSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});

      bridge = createWorkerBridge<TestEvents>(mockWorker as any, { debug: true });
      await mockWorker.simulateMessage({ type: 'worker:ready' });
      await bridge.readyPromise;

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[WorkerBridge]'),
        expect.anything()
      );

      consoleSpy.mockRestore();
    });
  });
});
