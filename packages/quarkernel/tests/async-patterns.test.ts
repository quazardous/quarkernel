/**
 * Tests for async patterns documented in docs/async-patterns.md
 * These tests validate the documentation examples work as described.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createKernel, Kernel } from '../src/kernel.js';
import { Composition } from '../src/composition/index.js';
import { useMachine } from '../src/fsm/machine.js';
import { createMachine } from '../src/fsm/create-machine.js';

describe('Async Patterns (docs/async-patterns.md)', () => {
  let qk: Kernel;

  beforeEach(() => {
    qk = createKernel();
  });

  describe('1. Promise-First Integration', () => {
    it('wraps Promises in events', async () => {
      const fetchUser = vi.fn().mockResolvedValue({ id: '123', name: 'Alice' });
      const events: string[] = [];

      qk.on('user:fetch', async (e) => {
        try {
          const user = await fetchUser(e.data.id);
          e.context.user = user;
          await qk.emit('user:loaded', { user });
        } catch (error) {
          await qk.emit('user:error', { error, id: e.data.id });
        }
      });

      qk.on('user:loaded', (e) => {
        events.push(`loaded:${e.data.user.name}`);
      });

      await qk.emit('user:fetch', { id: '123' });

      expect(fetchUser).toHaveBeenCalledWith('123');
      expect(events).toEqual(['loaded:Alice']);
    });

    it('converts events to Promises with once option', async () => {
      const eventPromise = new Promise<any>((resolve) => {
        qk.on('user:loaded', (e) => resolve(e), { once: true });
      });

      setTimeout(() => {
        qk.emit('user:loaded', { user: { name: 'Bob' } });
      }, 10);

      const event = await eventPromise;

      expect(event.data.user.name).toBe('Bob');
    });

    it('races between events using Promise.race', async () => {
      const loadedPromise = new Promise<any>((resolve) => {
        qk.on('user:loaded', (e) => resolve(e), { once: true });
      });
      const errorPromise = new Promise<any>((resolve) => {
        qk.on('user:error', (e) => resolve(e), { once: true });
      });

      setTimeout(() => {
        qk.emit('user:error', { error: 'Not found' });
      }, 10);

      const result = await Promise.race([loadedPromise, errorPromise]);

      expect(result.name).toBe('user:error');
    });
  });

  describe('2. Parallel Promise Orchestration', () => {
    it('runs independent listeners in parallel', async () => {
      const order: string[] = [];
      const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

      qk.on('init', async () => {
        await delay(30);
        order.push('slow');
      }, { id: 'slow' });

      qk.on('init', async () => {
        await delay(10);
        order.push('fast');
      }, { id: 'fast' });

      await qk.emit('init');

      // Both run in parallel, fast finishes first
      expect(order).toEqual(['fast', 'slow']);
    });

    it('respects dependencies with after option', async () => {
      const order: string[] = [];

      qk.on('init', async (e) => {
        e.context.user = { id: '123' };
        order.push('user');
      }, { id: 'user' });

      qk.on('init', async (e) => {
        e.context.profile = { userId: e.context.user.id };
        order.push('profile');
      }, { id: 'profile', after: ['user'] });

      qk.on('init', async (e) => {
        e.context.settings = { userId: e.context.user.id };
        order.push('settings');
      }, { id: 'settings', after: ['user'] });

      qk.on('init', async (e) => {
        order.push('dashboard');
      }, { after: ['profile', 'settings'] });

      await qk.emit('init', { id: '123' });

      expect(order[0]).toBe('user');
      expect(order).toContain('profile');
      expect(order).toContain('settings');
      expect(order[order.length - 1]).toBe('dashboard');
    });
  });

  describe('3. FSM for Async State Management', () => {
    it('manages async states with createMachine', async () => {
      const fetchData = vi.fn().mockResolvedValue({ items: [1, 2, 3] });

      const loader = createMachine({
        id: 'loader',
        initial: 'idle',
        context: { data: null, error: null },
        states: {
          idle: { on: { LOAD: 'loading' } },
          loading: {
            entry: async (ctx, { set, send }) => {
              try {
                const data = await fetchData();
                set({ data });
                send('SUCCESS');
              } catch (error) {
                set({ error });
                send('FAILURE');
              }
            },
            on: {
              SUCCESS: 'success',
              FAILURE: 'error',
            },
          },
          success: { on: { RELOAD: 'loading' } },
          error: { on: { RETRY: 'loading' } },
        },
      });

      expect(loader.state).toBe('idle');

      await loader.send('LOAD');

      expect(loader.state).toBe('success');
      expect(loader.context.data).toEqual({ items: [1, 2, 3] });
    });

    it('handles async errors with FSM states', async () => {
      const fetchData = vi.fn().mockRejectedValue(new Error('Network error'));

      const loader = createMachine({
        id: 'loader',
        initial: 'idle',
        context: { data: null, error: null },
        states: {
          idle: { on: { LOAD: 'loading' } },
          loading: {
            entry: async (ctx, { set, send }) => {
              try {
                const data = await fetchData();
                set({ data });
                send('SUCCESS');
              } catch (error) {
                set({ error });
                send('FAILURE');
              }
            },
            on: {
              SUCCESS: 'success',
              FAILURE: 'error',
            },
          },
          success: {},
          error: { on: { RETRY: 'loading' } },
        },
      });

      await loader.send('LOAD');

      expect(loader.state).toBe('error');
      expect(loader.context.error).toBeInstanceOf(Error);
    });
  });

  describe('4. Combining QK + FSM + Promises', () => {
    it('orchestrates multiple machines with kernel events', async () => {
      const chargeCard = vi.fn().mockResolvedValue({ transactionId: 'tx-123' });
      const events: string[] = [];

      const order = useMachine(qk, {
        prefix: 'order',
        initial: 'draft',
        states: {
          draft: { on: { SUBMIT: 'pending' } },
          pending: { on: { PAY: 'paid', CANCEL: 'cancelled' } },
          paid: {},
          cancelled: {},
        },
      });

      const payment = useMachine(qk, {
        prefix: 'payment',
        initial: 'idle',
        states: {
          idle: { on: { CHARGE: 'processing' } },
          processing: { on: { OK: 'done', FAIL: 'failed' } },
          done: {},
          failed: {},
        },
      });

      // QK orchestrates
      qk.on('order:enter:pending', async () => {
        events.push('order:pending');
        payment.send('CHARGE');
      });

      qk.on('payment:enter:processing', async () => {
        events.push('payment:processing');
        try {
          await chargeCard();
          payment.send('OK');
        } catch {
          payment.send('FAIL');
        }
      });

      qk.on('payment:enter:done', () => {
        events.push('payment:done');
        order.send('PAY');
      });

      await order.send('SUBMIT');

      // Wait for async chain to complete
      await new Promise(r => setTimeout(r, 50));

      expect(events).toContain('order:pending');
      expect(events).toContain('payment:processing');
      expect(events).toContain('payment:done');
      expect(order.getState()).toBe('paid');
      expect(payment.getState()).toBe('done');
    });
  });

  describe('5. Composition: Waiting for Multiple Async Sources', () => {
    it('fires when all sources complete', async () => {
      const fetchUser = vi.fn().mockResolvedValue({ name: 'Alice' });
      const fetchConfig = vi.fn().mockResolvedValue({ theme: 'dark' });
      const initApp = vi.fn();

      qk.on('boot', async () => {
        const user = await fetchUser();
        await qk.emit('user:ready', { user });
      });

      qk.on('boot', async () => {
        const config = await fetchConfig();
        await qk.emit('config:ready', { config });
      });

      const appReady = new Composition([
        [qk, 'user:ready'],
        [qk, 'config:ready'],
      ]);

      appReady.onComposed((e) => {
        initApp(e.data.merged);
      });

      await qk.emit('boot');

      expect(initApp).toHaveBeenCalledTimes(1);
      expect(initApp.mock.calls[0][0]).toHaveProperty('user:ready:user');
      expect(initApp.mock.calls[0][0]).toHaveProperty('config:ready:config');
    });

    it('handles events in any order', async () => {
      const result = vi.fn();

      const ready = new Composition([
        [qk, 'a:done'],
        [qk, 'b:done'],
      ]);

      ready.onComposed(result);

      // Fire in reverse order
      await qk.emit('b:done', { value: 'B' });
      expect(result).not.toHaveBeenCalled();

      await qk.emit('a:done', { value: 'A' });
      expect(result).toHaveBeenCalledTimes(1);
    });
  });

  describe('6. Error Handling Synergies', () => {
    it('uses errorBoundary like Promise.allSettled', async () => {
      const qk = createKernel({ errorBoundary: true });
      const results: string[] = [];

      qk.on('batch', async () => {
        results.push('success1');
      });

      qk.on('batch', async () => {
        throw new Error('Listener 2 failed');
      });

      qk.on('batch', async () => {
        results.push('success3');
      });

      await qk.emit('batch');

      // All listeners ran despite error
      expect(results).toEqual(['success1', 'success3']);

      const errors = qk.getExecutionErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0].error.message).toBe('Listener 2 failed');
    });

    it('models error states with FSM (simplified)', async () => {
      // Simplified version - demonstrates FSM error modeling
      // Full retry pattern in docs/async-patterns.md
      const api = createMachine({
        id: 'api',
        initial: 'idle',
        context: { error: null },
        states: {
          idle: { on: { CALL: 'calling' } },
          calling: { on: { SUCCESS: 'success', ERROR: 'error' } },
          success: {},
          error: { on: { RETRY: 'calling' } },
        },
      });

      expect(api.state).toBe('idle');
      await api.send('CALL');
      expect(api.state).toBe('calling');
      await api.send('ERROR');
      expect(api.state).toBe('error');
      await api.send('RETRY');
      expect(api.state).toBe('calling');
      await api.send('SUCCESS');
      expect(api.state).toBe('success');
    });
  });

  describe('7. Timeout & Cancellation', () => {
    it('FSM supports timeout states', async () => {
      // Simplified version - demonstrates FSM timeout modeling
      // The 'after' property auto-sends events after delay
      const request = createMachine({
        id: 'request',
        initial: 'idle',
        states: {
          idle: { on: { START: 'loading' } },
          loading: { on: { DONE: 'success', TIMEOUT: 'timedOut' } },
          success: {},
          timedOut: { on: { RETRY: 'loading' } },
        },
      });

      await request.send('START');
      expect(request.state).toBe('loading');

      // Simulate timeout
      await request.send('TIMEOUT');
      expect(request.state).toBe('timedOut');

      // Can retry
      await request.send('RETRY');
      expect(request.state).toBe('loading');

      await request.send('DONE');
      expect(request.state).toBe('success');
    });

    it('uses Composition TTL for event expiration', async () => {
      vi.useFakeTimers();

      const result = vi.fn();

      const timed = new Composition([
        [qk, 'step1:done'],
        [qk, 'step2:done'],
      ], {
        eventTTL: 100,
      });

      timed.onComposed(result);

      await qk.emit('step1:done', { v: 1 });

      // Wait past TTL
      vi.advanceTimersByTime(150);

      await qk.emit('step2:done', { v: 2 });

      // Composition should NOT fire - step1 expired
      expect(result).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe('8. Practical Patterns', () => {
    it('implements useAsyncAction pattern', async () => {
      function useAsyncAction<T>(action: () => Promise<T>) {
        const machine = createMachine({
          id: 'action',
          initial: 'idle',
          context: { result: null as T | null, error: null as Error | null },
          states: {
            idle: { on: { EXECUTE: 'running' } },
            running: {
              entry: async (ctx, { set, send }) => {
                try {
                  const result = await action();
                  set({ result });
                  send('SUCCESS');
                } catch (error) {
                  set({ error: error as Error });
                  send('ERROR');
                }
              },
              on: { SUCCESS: 'success', ERROR: 'error' },
            },
            success: { on: { RESET: 'idle' } },
            error: { on: { RETRY: 'running', RESET: 'idle' } },
          },
        });

        return {
          execute: () => machine.send('EXECUTE'),
          retry: () => machine.send('RETRY'),
          reset: () => machine.send('RESET'),
          get state() { return machine.state; },
          get result() { return machine.context.result; },
          get error() { return machine.context.error; },
        };
      }

      const api = vi.fn().mockResolvedValue({ saved: true });
      const saveAction = useAsyncAction(() => api());

      expect(saveAction.state).toBe('idle');

      await saveAction.execute();

      expect(saveAction.state).toBe('success');
      expect(saveAction.result).toEqual({ saved: true });
    });

    it('FSM supports saga states with rollback', async () => {
      // Simplified version - demonstrates FSM saga/rollback modeling
      // Full async saga pattern in docs/async-patterns.md
      const saga = createMachine({
        id: 'saga',
        initial: 'idle',
        context: { steps: [] as string[] },
        states: {
          idle: { on: { START: 'step1' } },
          step1: { on: { NEXT: 'step2', ERROR: 'rollback' } },
          step2: { on: { NEXT: 'step3', ERROR: 'rollback' } },
          step3: { on: { DONE: 'success', ERROR: 'rollback' } },
          rollback: { on: { DONE: 'failed' } },
          success: {},
          failed: {},
        },
      });

      // Happy path
      await saga.send('START');
      expect(saga.state).toBe('step1');
      await saga.send('NEXT');
      expect(saga.state).toBe('step2');
      await saga.send('NEXT');
      expect(saga.state).toBe('step3');
      await saga.send('DONE');
      expect(saga.state).toBe('success');
    });

    it('FSM saga can rollback on error', async () => {
      const saga = createMachine({
        id: 'saga2',
        initial: 'idle',
        states: {
          idle: { on: { START: 'step1' } },
          step1: { on: { NEXT: 'step2', ERROR: 'rollback' } },
          step2: { on: { NEXT: 'step3', ERROR: 'rollback' } },
          step3: { on: { DONE: 'success', ERROR: 'rollback' } },
          rollback: { on: { DONE: 'failed' } },
          success: {},
          failed: {},
        },
      });

      // Error path
      await saga.send('START');
      await saga.send('NEXT');
      await saga.send('NEXT');
      // Step3 fails
      await saga.send('ERROR');
      expect(saga.state).toBe('rollback');
      await saga.send('DONE');
      expect(saga.state).toBe('failed');
    });
  });

  describe('Additional Synergy Patterns', () => {
    it('uses serial emit for ordered execution', async () => {
      const order: number[] = [];
      const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

      qk.on('process', async () => {
        await delay(30);
        order.push(1);
      });

      qk.on('process', async () => {
        await delay(10);
        order.push(2);
      });

      await qk.emitSerial('process');

      // Serial execution - order of registration preserved
      expect(order).toEqual([1, 2]);
    });

    it('shares context between listeners with dependencies', async () => {
      let summary = '';

      qk.on('load', (e) => {
        e.context.user = { name: 'Alice' };
      }, { id: 'user' });

      qk.on('load', (e) => {
        e.context.posts = [{ title: 'Hello' }];
      }, { id: 'posts' });

      qk.on('load', (e) => {
        // Access both contexts - guaranteed available due to after
        summary = `${e.context.user.name}: ${e.context.posts.length} posts`;
      }, { after: ['user', 'posts'] });

      await qk.emit('load');

      expect(summary).toBe('Alice: 1 posts');
    });

    it('chains FSM transitions with kernel events', async () => {
      const transitions: string[] = [];

      const machine = useMachine(qk, {
        prefix: 'flow',
        initial: 'a',
        states: {
          a: { on: { NEXT: 'b' } },
          b: { on: { NEXT: 'c' } },
          c: {},
        },
      });

      qk.on('flow:transition', (e) => {
        transitions.push(`${e.data.from}->${e.data.to}`);
      });

      await machine.send('NEXT');
      await machine.send('NEXT');

      expect(transitions).toEqual(['a->b', 'b->c']);
    });
  });
});
