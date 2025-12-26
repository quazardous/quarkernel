/**
 * XState Import Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { Kernel } from '../kernel.js';
import { useMachine } from './machine.js';
import { fromXState, toXStateFormat } from './xstate-import.js';
import type { XStateMachineConfig } from './xstate-import.js';

describe('fromXState', () => {
  it('should convert simple XState machine', () => {
    const xstateConfig: XStateMachineConfig = {
      id: 'light',
      initial: 'green',
      states: {
        green: { on: { TIMER: 'yellow' } },
        yellow: { on: { TIMER: 'red' } },
        red: { on: { TIMER: 'green' } },
      },
    };

    const config = fromXState(xstateConfig, { prefix: 'light' });

    expect(config.prefix).toBe('light');
    expect(config.initial).toBe('green');
    expect(config.states.green.on?.TIMER).toBe('yellow');
    expect(config.states.yellow.on?.TIMER).toBe('red');
    expect(config.states.red.on?.TIMER).toBe('green');
  });

  it('should convert context', () => {
    const xstateConfig: XStateMachineConfig = {
      initial: 'idle',
      context: { count: 0, name: 'test' },
      states: { idle: {} },
    };

    const config = fromXState(xstateConfig, { prefix: 'test' });

    expect(config.context).toEqual({ count: 0, name: 'test' });
  });

  it('should convert guards (cond syntax)', () => {
    const canProceed = vi.fn(() => true);

    const xstateConfig: XStateMachineConfig = {
      initial: 'idle',
      states: {
        idle: {
          on: {
            START: { target: 'running', cond: 'canProceed' },
          },
        },
        running: {},
      },
    };

    const config = fromXState(xstateConfig, {
      prefix: 'test',
      guards: { canProceed },
    });

    expect(config.states.idle.on?.START).toMatchObject({
      target: 'running',
    });
    expect((config.states.idle.on?.START as any).guard).toBe(canProceed);
  });

  it('should convert guards (guard syntax v5)', () => {
    const isReady = vi.fn(() => true);

    const xstateConfig: XStateMachineConfig = {
      initial: 'idle',
      states: {
        idle: {
          on: {
            GO: { target: 'active', guard: 'isReady' },
          },
        },
        active: {},
      },
    };

    const config = fromXState(xstateConfig, {
      prefix: 'test',
      guards: { isReady },
    });

    expect((config.states.idle.on?.GO as any).guard).toBe(isReady);
  });

  it('should convert transition actions', () => {
    const logTransition = vi.fn();

    const xstateConfig: XStateMachineConfig = {
      initial: 'idle',
      states: {
        idle: {
          on: {
            START: { target: 'running', actions: 'logTransition' },
          },
        },
        running: {},
      },
    };

    const config = fromXState(xstateConfig, {
      prefix: 'test',
      actions: { logTransition },
    });

    expect((config.states.idle.on?.START as any).actions).toBe(logTransition);
  });

  it('should convert multiple transition actions', () => {
    const action1 = vi.fn();
    const action2 = vi.fn();

    const xstateConfig: XStateMachineConfig = {
      initial: 'idle',
      states: {
        idle: {
          on: {
            START: { target: 'running', actions: ['action1', 'action2'] },
          },
        },
        running: {},
      },
    };

    const config = fromXState(xstateConfig, {
      prefix: 'test',
      actions: { action1, action2 },
    });

    const actions = (config.states.idle.on?.START as any).actions;
    expect(actions).toHaveLength(2);
    expect(actions[0]).toBe(action1);
    expect(actions[1]).toBe(action2);
  });

  it('should convert entry actions', () => {
    const onEnterRunning = vi.fn();

    const xstateConfig: XStateMachineConfig = {
      initial: 'idle',
      states: {
        idle: { on: { START: 'running' } },
        running: { entry: 'onEnterRunning' },
      },
    };

    const config = fromXState(xstateConfig, {
      prefix: 'test',
      actions: { onEnterRunning },
    });

    expect(config.states.running.onEnter).toBeDefined();
  });

  it('should convert exit actions', () => {
    const onExitIdle = vi.fn();

    const xstateConfig: XStateMachineConfig = {
      initial: 'idle',
      states: {
        idle: { on: { START: 'running' }, exit: 'onExitIdle' },
        running: {},
      },
    };

    const config = fromXState(xstateConfig, {
      prefix: 'test',
      actions: { onExitIdle },
    });

    expect(config.states.idle.onExit).toBeDefined();
  });

  it('should work with useMachine after conversion', async () => {
    const kernel = new Kernel();

    const xstateConfig: XStateMachineConfig = {
      id: 'order',
      initial: 'draft',
      context: { approved: false },
      states: {
        draft: { on: { SUBMIT: 'pending' } },
        pending: {
          on: {
            APPROVE: { target: 'confirmed', cond: 'isApproved' },
            REJECT: 'draft',
          },
        },
        confirmed: {},
      },
    };

    const config = fromXState(xstateConfig, {
      prefix: 'order',
      guards: {
        isApproved: (ctx) => ctx.approved,
      },
    });

    const machine = useMachine(kernel, config);

    expect(machine.getState()).toBe('draft');

    await machine.send('SUBMIT');
    expect(machine.getState()).toBe('pending');

    // Guard blocks
    await machine.send('APPROVE');
    expect(machine.getState()).toBe('pending');

    // Update context and try again
    machine.setContext({ approved: true });
    await machine.send('APPROVE');
    expect(machine.getState()).toBe('confirmed');
  });
});

describe('toXStateFormat', () => {
  it('should export simple config', () => {
    const config = {
      prefix: 'light',
      initial: 'green',
      states: {
        green: { on: { TIMER: 'yellow' } },
        yellow: { on: { TIMER: 'red' } },
        red: { on: { TIMER: 'green' } },
      },
    };

    const xstate = toXStateFormat(config);

    expect(xstate.id).toBe('light');
    expect(xstate.initial).toBe('green');
    expect(xstate.states.green.on?.TIMER).toBe('yellow');
  });

  it('should export context', () => {
    const config = {
      prefix: 'test',
      initial: 'idle',
      context: { count: 5 },
      states: { idle: {} },
    };

    const xstate = toXStateFormat(config);

    expect(xstate.context).toEqual({ count: 5 });
  });

  it('should mark guards and actions', () => {
    const config = {
      prefix: 'test',
      initial: 'idle',
      states: {
        idle: {
          on: {
            GO: {
              target: 'running',
              guard: () => true,
              actions: () => {},
            },
          },
          onEnter: () => {},
          onExit: () => {},
        },
        running: {},
      },
    };

    const xstate = toXStateFormat(config);

    const transition = xstate.states.idle.on?.GO as any;
    expect(transition.guard).toEqual({ type: 'guard' });
    expect(transition.actions).toEqual({ type: 'action' });
    expect(xstate.states.idle.entry).toEqual({ type: 'onEnter' });
    expect(xstate.states.idle.exit).toEqual({ type: 'onExit' });
  });
});
