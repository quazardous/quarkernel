/**
 * FSM Machine Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Kernel } from '../kernel.js';
import { useMachine } from './machine.js';
import type { MachineConfig, FSMEventData } from './types.js';

describe('useMachine', () => {
  let kernel: Kernel;

  beforeEach(() => {
    kernel = new Kernel();
  });

  describe('basic transitions', () => {
    it('should start in initial state', () => {
      const machine = useMachine(kernel, {
        prefix: 'test',
        initial: 'idle',
        states: {
          idle: { on: { START: 'running' } },
          running: {},
        },
      });

      expect(machine.getState()).toBe('idle');
    });

    it('should transition on valid event', async () => {
      const machine = useMachine(kernel, {
        prefix: 'test',
        initial: 'idle',
        states: {
          idle: { on: { START: 'running' } },
          running: { on: { STOP: 'idle' } },
        },
      });

      const result = await machine.send('START');
      expect(result).toBe(true);
      expect(machine.getState()).toBe('running');
    });

    it('should return false for invalid transition', async () => {
      const machine = useMachine(kernel, {
        prefix: 'test',
        initial: 'idle',
        states: {
          idle: { on: { START: 'running' } },
          running: {},
        },
      });

      const result = await machine.send('INVALID');
      expect(result).toBe(false);
      expect(machine.getState()).toBe('idle');
    });

    it('should chain multiple transitions', async () => {
      const machine = useMachine(kernel, {
        prefix: 'order',
        initial: 'draft',
        states: {
          draft: { on: { SUBMIT: 'pending' } },
          pending: { on: { APPROVE: 'confirmed', REJECT: 'draft' } },
          confirmed: { on: { SHIP: 'shipped' } },
          shipped: {},
        },
      });

      await machine.send('SUBMIT');
      expect(machine.getState()).toBe('pending');

      await machine.send('APPROVE');
      expect(machine.getState()).toBe('confirmed');

      await machine.send('SHIP');
      expect(machine.getState()).toBe('shipped');
    });
  });

  describe('event emission', () => {
    it('should emit enter event on transition', async () => {
      const machine = useMachine(kernel, {
        prefix: 'test',
        initial: 'idle',
        states: {
          idle: { on: { START: 'running' } },
          running: {},
        },
      });

      const enterEvents: FSMEventData[] = [];
      kernel.on('test:enter:running', (e) => {
        enterEvents.push(e.data);
      });

      await machine.send('START');

      expect(enterEvents).toHaveLength(1);
      expect(enterEvents[0]).toMatchObject({
        machine: 'test',
        state: 'running',
        from: 'idle',
        to: 'running',
        event: 'START',
      });
    });

    it('should emit exit event on transition', async () => {
      const machine = useMachine(kernel, {
        prefix: 'test',
        initial: 'idle',
        states: {
          idle: { on: { START: 'running' } },
          running: {},
        },
      });

      const exitEvents: FSMEventData[] = [];
      kernel.on('test:exit:idle', (e) => {
        exitEvents.push(e.data);
      });

      await machine.send('START');

      expect(exitEvents).toHaveLength(1);
      expect(exitEvents[0]).toMatchObject({
        machine: 'test',
        from: 'idle',
        to: 'running',
      });
    });

    it('should emit transition event', async () => {
      const machine = useMachine(kernel, {
        prefix: 'test',
        initial: 'idle',
        states: {
          idle: { on: { START: 'running' } },
          running: {},
        },
      });

      const transitions: FSMEventData[] = [];
      kernel.on('test:transition', (e) => {
        transitions.push(e.data);
      });

      await machine.send('START');

      expect(transitions).toHaveLength(1);
      expect(transitions[0].event).toBe('START');
    });

    it('should emit specific transition event', async () => {
      const machine = useMachine(kernel, {
        prefix: 'test',
        initial: 'idle',
        states: {
          idle: { on: { START: 'running' } },
          running: {},
        },
      });

      const startEvents: FSMEventData[] = [];
      kernel.on('test:transition:START', (e) => {
        startEvents.push(e.data);
      });

      await machine.send('START');

      expect(startEvents).toHaveLength(1);
    });

    it('should support wildcard listeners', async () => {
      const machine = useMachine(kernel, {
        prefix: 'order',
        initial: 'draft',
        states: {
          draft: { on: { SUBMIT: 'pending' } },
          pending: {},
        },
      });

      const allEnters: string[] = [];
      kernel.on('order:enter:*', (e) => {
        allEnters.push(e.data.state);
      });

      await machine.send('SUBMIT');

      expect(allEnters).toContain('pending');
    });
  });

  describe('guards', () => {
    it('should block transition when guard returns false', async () => {
      const machine = useMachine(kernel, {
        prefix: 'test',
        initial: 'idle',
        context: { allowed: false },
        states: {
          idle: {
            on: {
              START: {
                target: 'running',
                guard: (ctx) => ctx.allowed,
              },
            },
          },
          running: {},
        },
      });

      const result = await machine.send('START');
      expect(result).toBe(false);
      expect(machine.getState()).toBe('idle');
    });

    it('should allow transition when guard returns true', async () => {
      const machine = useMachine(kernel, {
        prefix: 'test',
        initial: 'idle',
        context: { allowed: true },
        states: {
          idle: {
            on: {
              START: {
                target: 'running',
                guard: (ctx) => ctx.allowed,
              },
            },
          },
          running: {},
        },
      });

      const result = await machine.send('START');
      expect(result).toBe(true);
      expect(machine.getState()).toBe('running');
    });

    it('should emit guard:rejected event', async () => {
      const machine = useMachine(kernel, {
        prefix: 'test',
        initial: 'idle',
        context: { allowed: false },
        states: {
          idle: {
            on: {
              START: {
                target: 'running',
                guard: (ctx) => ctx.allowed,
              },
            },
          },
          running: {},
        },
      });

      const rejected: FSMEventData[] = [];
      kernel.on('test:guard:rejected', (e) => {
        rejected.push(e.data);
      });

      await machine.send('START');

      expect(rejected).toHaveLength(1);
      expect(rejected[0].event).toBe('START');
    });

    it('should use fallback state when guard fails', async () => {
      const machine = useMachine(kernel, {
        prefix: 'test',
        initial: 'idle',
        context: { allowed: false },
        states: {
          idle: {
            on: {
              START: {
                target: 'running',
                guard: (ctx) => ctx.allowed,
              },
            },
          },
          running: {},
          error: {},
        },
      });

      const result = await machine.send('START', undefined, { fallback: 'error' });
      expect(result).toBe(true);
      expect(machine.getState()).toBe('error');
    });

    it('should support inline guard override', async () => {
      const machine = useMachine(kernel, {
        prefix: 'test',
        initial: 'idle',
        context: { count: 5 },
        states: {
          idle: {
            on: {
              START: {
                target: 'running',
                guard: (ctx) => ctx.count > 10, // Would fail
              },
            },
          },
          running: {},
        },
      });

      // Inline guard overrides state guard
      const result = await machine.send('START', undefined, {
        guard: (ctx) => ctx.count > 0, // This passes
      });

      expect(result).toBe(true);
      expect(machine.getState()).toBe('running');
    });
  });

  describe('force transitions', () => {
    it('should force transition to target state', async () => {
      const machine = useMachine(kernel, {
        prefix: 'test',
        initial: 'idle',
        states: {
          idle: {},
          running: {},
          error: {},
        },
      });

      const result = await machine.send('FORCE_RESET', undefined, {
        force: true,
        target: 'error',
      });

      expect(result).toBe(true);
      expect(machine.getState()).toBe('error');
    });

    it('should force transition to initial state by default', async () => {
      const machine = useMachine(kernel, {
        prefix: 'test',
        initial: 'idle',
        states: {
          idle: { on: { START: 'running' } },
          running: {},
        },
      });

      await machine.send('START');
      expect(machine.getState()).toBe('running');

      await machine.send('RESET', undefined, { force: true });
      expect(machine.getState()).toBe('idle');
    });

    it('should bypass guards on force transition', async () => {
      const machine = useMachine(kernel, {
        prefix: 'test',
        initial: 'idle',
        context: { allowed: false },
        states: {
          idle: {
            on: {
              START: {
                target: 'running',
                guard: (ctx) => ctx.allowed,
              },
            },
          },
          running: {},
        },
      });

      const result = await machine.send('START', undefined, {
        force: true,
        target: 'running',
      });

      expect(result).toBe(true);
      expect(machine.getState()).toBe('running');
    });

    it('should mark forced transitions in event data', async () => {
      const machine = useMachine(kernel, {
        prefix: 'test',
        initial: 'idle',
        states: {
          idle: {},
          running: {},
        },
      });

      const transitions: FSMEventData[] = [];
      kernel.on('test:transition', (e) => {
        transitions.push(e.data);
      });

      await machine.send('FORCE', undefined, { force: true, target: 'running' });

      expect(transitions[0].forced).toBe(true);
    });

    it('should reject force when allowForce is false', async () => {
      const machine = useMachine(kernel, {
        prefix: 'test',
        initial: 'idle',
        allowForce: false,
        states: {
          idle: {},
          running: {},
        },
      });

      await expect(
        machine.send('FORCE', undefined, { force: true, target: 'running' })
      ).rejects.toThrow('Force transitions not allowed');
    });
  });

  describe('context', () => {
    it('should initialize with provided context', () => {
      const machine = useMachine(kernel, {
        prefix: 'test',
        initial: 'idle',
        context: { count: 0, name: 'test' },
        states: { idle: {} },
      });

      expect(machine.getContext()).toEqual({ count: 0, name: 'test' });
    });

    it('should update context with partial object', () => {
      const machine = useMachine(kernel, {
        prefix: 'test',
        initial: 'idle',
        context: { count: 0, name: 'test' },
        states: { idle: {} },
      });

      machine.setContext({ count: 5 });
      expect(machine.getContext()).toEqual({ count: 5, name: 'test' });
    });

    it('should update context with function', () => {
      const machine = useMachine(kernel, {
        prefix: 'test',
        initial: 'idle',
        context: { count: 0 },
        states: { idle: {} },
      });

      machine.setContext((ctx) => ({ ...ctx, count: ctx.count + 1 }));
      expect(machine.getContext().count).toBe(1);
    });

    it('should pass context to guards', async () => {
      const guardFn = vi.fn((ctx) => ctx.retries < 3);

      const machine = useMachine(kernel, {
        prefix: 'test',
        initial: 'idle',
        context: { retries: 2 },
        states: {
          idle: {
            on: {
              RETRY: { target: 'running', guard: guardFn },
            },
          },
          running: {},
        },
      });

      await machine.send('RETRY');

      expect(guardFn).toHaveBeenCalledWith(
        { retries: 2 },
        'RETRY',
        undefined
      );
    });
  });

  describe('actions', () => {
    it('should execute onEnter action', async () => {
      const onEnter = vi.fn();

      const machine = useMachine(kernel, {
        prefix: 'test',
        initial: 'idle',
        states: {
          idle: { on: { START: 'running' } },
          running: { onEnter },
        },
      });

      await machine.send('START');

      expect(onEnter).toHaveBeenCalled();
    });

    it('should execute onExit action', async () => {
      const onExit = vi.fn();

      const machine = useMachine(kernel, {
        prefix: 'test',
        initial: 'idle',
        states: {
          idle: { on: { START: 'running' }, onExit },
          running: {},
        },
      });

      await machine.send('START');

      expect(onExit).toHaveBeenCalled();
    });

    it('should execute transition actions', async () => {
      const action = vi.fn();

      const machine = useMachine(kernel, {
        prefix: 'test',
        initial: 'idle',
        states: {
          idle: {
            on: {
              START: { target: 'running', actions: action },
            },
          },
          running: {},
        },
      });

      await machine.send('START');

      expect(action).toHaveBeenCalled();
    });

    it('should execute multiple transition actions in order', async () => {
      const order: number[] = [];

      const machine = useMachine(kernel, {
        prefix: 'test',
        initial: 'idle',
        states: {
          idle: {
            on: {
              START: {
                target: 'running',
                actions: [
                  () => order.push(1),
                  () => order.push(2),
                  () => order.push(3),
                ],
              },
            },
          },
          running: {},
        },
      });

      await machine.send('START');

      expect(order).toEqual([1, 2, 3]);
    });

    it('should pass payload to actions', async () => {
      const action = vi.fn();

      const machine = useMachine(kernel, {
        prefix: 'test',
        initial: 'idle',
        states: {
          idle: {
            on: {
              START: { target: 'running', actions: action },
            },
          },
          running: {},
        },
      });

      await machine.send('START', { userId: 123 });

      expect(action).toHaveBeenCalledWith(
        expect.any(Object),
        'START',
        { userId: 123 }
      );
    });
  });

  describe('can() and transitions()', () => {
    it('should return true for valid transition', () => {
      const machine = useMachine(kernel, {
        prefix: 'test',
        initial: 'idle',
        states: {
          idle: { on: { START: 'running', PAUSE: 'paused' } },
          running: {},
          paused: {},
        },
      });

      expect(machine.can('START')).toBe(true);
      expect(machine.can('PAUSE')).toBe(true);
      expect(machine.can('INVALID')).toBe(false);
    });

    it('should return available transitions', () => {
      const machine = useMachine(kernel, {
        prefix: 'test',
        initial: 'idle',
        states: {
          idle: { on: { START: 'running', PAUSE: 'paused' } },
          running: { on: { STOP: 'idle' } },
          paused: {},
        },
      });

      expect(machine.transitions()).toEqual(['START', 'PAUSE']);
    });

    it('should return empty array for terminal state', () => {
      const machine = useMachine(kernel, {
        prefix: 'test',
        initial: 'done',
        states: {
          done: {},
        },
      });

      expect(machine.transitions()).toEqual([]);
    });
  });

  describe('persistence (toJSON/restore)', () => {
    it('should serialize machine state', () => {
      const machine = useMachine(kernel, {
        prefix: 'test',
        initial: 'idle',
        context: { count: 5 },
        states: {
          idle: { on: { START: 'running' } },
          running: {},
        },
      });

      const snapshot = machine.toJSON();

      expect(snapshot).toEqual({
        state: 'idle',
        context: { count: 5 },
        history: undefined,
      });
    });

    it('should serialize after transitions', async () => {
      const machine = useMachine(kernel, {
        prefix: 'test',
        initial: 'idle',
        context: { count: 0 },
        states: {
          idle: { on: { START: 'running' } },
          running: { on: { STOP: 'idle' } },
        },
      });

      await machine.send('START');
      machine.setContext({ count: 10 });

      const snapshot = machine.toJSON();

      expect(snapshot.state).toBe('running');
      expect(snapshot.context.count).toBe(10);
    });

    it('should restore from snapshot', async () => {
      const machine = useMachine(kernel, {
        prefix: 'test',
        initial: 'idle',
        context: { count: 0 },
        states: {
          idle: { on: { START: 'running' } },
          running: { on: { STOP: 'idle' } },
        },
      });

      machine.restore({
        state: 'running',
        context: { count: 42 },
      });

      expect(machine.getState()).toBe('running');
      expect(machine.getContext().count).toBe(42);
    });

    it('should initialize from snapshot in config', () => {
      const machine = useMachine(kernel, {
        prefix: 'test',
        initial: 'idle',
        context: { count: 0 },
        snapshot: {
          state: 'running',
          context: { count: 100 },
        },
        states: {
          idle: { on: { START: 'running' } },
          running: {},
        },
      });

      expect(machine.getState()).toBe('running');
      expect(machine.getContext().count).toBe(100);
    });

    it('should track history when enabled', async () => {
      const machine = useMachine(kernel, {
        prefix: 'test',
        initial: 'idle',
        trackHistory: true,
        states: {
          idle: { on: { START: 'running' } },
          running: { on: { STOP: 'idle' } },
        },
      });

      await machine.send('START');
      await machine.send('STOP');

      const snapshot = machine.toJSON();

      expect(snapshot.history).toHaveLength(2);
      expect(snapshot.history![0]).toMatchObject({
        from: 'idle',
        to: 'running',
        event: 'START',
      });
      expect(snapshot.history![1]).toMatchObject({
        from: 'running',
        to: 'idle',
        event: 'STOP',
      });
    });

    it('should limit history size', async () => {
      const machine = useMachine(kernel, {
        prefix: 'test',
        initial: 'a',
        trackHistory: true,
        maxHistory: 3,
        states: {
          a: { on: { NEXT: 'b' } },
          b: { on: { NEXT: 'c' } },
          c: { on: { NEXT: 'd' } },
          d: { on: { NEXT: 'e' } },
          e: {},
        },
      });

      await machine.send('NEXT'); // a -> b
      await machine.send('NEXT'); // b -> c
      await machine.send('NEXT'); // c -> d
      await machine.send('NEXT'); // d -> e

      const snapshot = machine.toJSON();

      expect(snapshot.history).toHaveLength(3);
      expect(snapshot.history![0].from).toBe('b');
      expect(snapshot.history![2].from).toBe('d');
    });

    it('should throw on invalid snapshot state', () => {
      const machine = useMachine(kernel, {
        prefix: 'test',
        initial: 'idle',
        states: {
          idle: {},
          running: {},
        },
      });

      expect(() => {
        machine.restore({
          state: 'invalid',
          context: {},
        });
      }).toThrow('Invalid snapshot state "invalid"');
    });
  });

  describe('multi-machine orchestration', () => {
    it('should orchestrate multiple machines via events', async () => {
      const order = useMachine(kernel, {
        prefix: 'order',
        initial: 'draft',
        states: {
          draft: { on: { SUBMIT: 'pending' } },
          pending: { on: { COMPLETE: 'confirmed' } },
          confirmed: {},
        },
      });

      const payment = useMachine(kernel, {
        prefix: 'payment',
        initial: 'pending',
        states: {
          pending: { on: { PROCESS: 'processing' } },
          processing: { on: { SUCCESS: 'paid', FAIL: 'failed' } },
          paid: {},
          failed: {},
        },
      });

      // Orchestration: when order is submitted, process payment
      kernel.on('order:enter:pending', async () => {
        await payment.send('PROCESS');
      });

      // When payment succeeds, complete order
      kernel.on('payment:enter:paid', async () => {
        await order.send('COMPLETE');
      });

      // Start the flow
      await order.send('SUBMIT');
      await payment.send('SUCCESS');

      expect(order.getState()).toBe('confirmed');
      expect(payment.getState()).toBe('paid');
    });

    it('should support wildcard monitoring', async () => {
      const machine1 = useMachine(kernel, {
        prefix: 'machine1',
        initial: 'a',
        states: {
          a: { on: { GO: 'b' } },
          b: {},
        },
      });

      const machine2 = useMachine(kernel, {
        prefix: 'machine2',
        initial: 'x',
        states: {
          x: { on: { GO: 'y' } },
          y: {},
        },
      });

      const allTransitions: FSMEventData[] = [];
      kernel.on('*:transition', (e) => {
        allTransitions.push(e.data);
      });

      await machine1.send('GO');
      await machine2.send('GO');

      expect(allTransitions).toHaveLength(2);
      expect(allTransitions[0].machine).toBe('machine1');
      expect(allTransitions[1].machine).toBe('machine2');
    });
  });

  describe('error handling', () => {
    it('should throw on invalid initial state', () => {
      expect(() => {
        useMachine(kernel, {
          prefix: 'test',
          initial: 'nonexistent',
          states: {
            idle: {},
          },
        });
      }).toThrow('Invalid initial state "nonexistent"');
    });

    it('should throw on invalid target state in transition', async () => {
      const machine = useMachine(kernel, {
        prefix: 'test',
        initial: 'idle',
        states: {
          idle: { on: { GO: 'nonexistent' } },
        },
      });

      await expect(machine.send('GO')).rejects.toThrow(
        'Invalid target state "nonexistent"'
      );
    });
  });

  describe('cleanup', () => {
    it('should cleanup on destroy', async () => {
      const machine = useMachine(kernel, {
        prefix: 'test',
        initial: 'idle',
        states: {
          idle: { on: { START: 'running' } },
          running: {},
        },
      });

      machine.destroy();

      // Machine should still work but cleanup functions cleared
      expect(machine.getState()).toBe('idle');
    });
  });
});
