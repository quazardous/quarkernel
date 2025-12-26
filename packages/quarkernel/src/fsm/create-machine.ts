/**
 * createMachine - High-level FSM factory
 *
 * Standalone state machine with declarative behaviors.
 * Can work independently or connect to a kernel.
 */

import { Kernel } from '../kernel.js';
import { useMachine } from './machine.js';
import { toXStateFormat } from './xstate-import.js';
import type { Machine, MachineConfig, MachineSnapshot } from './types.js';

/**
 * Behavior helpers passed to callbacks
 */
export interface BehaviorHelpers<TContext = Record<string, unknown>> {
  /** Merge into context */
  set: (partial: Partial<TContext>) => void;
  /** Trigger transition */
  send: (event: string, payload?: unknown) => void;
  /** Log message (if logger provided) */
  log: (message: string) => void;
}

/**
 * Behavior callback
 */
export type BehaviorFn<TContext = Record<string, unknown>> = (
  ctx: TContext,
  helpers: BehaviorHelpers<TContext>
) => void | Promise<void>;

/**
 * Timer definition
 */
export interface TimerDef {
  /** Event to send */
  send: string;
  /** Delay in ms */
  delay: number;
}

/**
 * High-level machine config with behaviors
 */
export interface CreateMachineConfig<TContext = Record<string, unknown>> {
  /** Machine identifier */
  id: string;

  /** Initial state */
  initial: string;

  /** Initial context */
  context?: TContext;

  /** State definitions: { stateName: { on: { EVENT: 'target' } } } */
  states: Record<string, {
    on?: Record<string, string | { target: string; cond?: string }>;
  }>;

  /** Event handlers: { EVENT_NAME: (ctx, helpers) => ... } */
  on?: Record<string, BehaviorFn<TContext>>;

  /** State entry handlers: { stateName: (ctx, helpers) => ... } */
  onEnter?: Record<string, BehaviorFn<TContext>>;

  /** State exit handlers: { stateName: (ctx, helpers) => ... } */
  onExit?: Record<string, BehaviorFn<TContext>>;

  /** Auto-timers: { stateName: { send: 'EVENT', delay: 2000 } } */
  timers?: Record<string, TimerDef>;

  /** Logger function (optional) */
  logger?: (message: string) => void;
}

/**
 * XState-compatible output format
 */
export interface XStateOutput {
  id: string;
  initial: string;
  context?: Record<string, unknown>;
  states: Record<string, {
    on?: Record<string, string | { target: string }>;
  }>;
}

/**
 * Extended machine interface with behaviors
 */
export interface BehaviorMachine<TContext = Record<string, unknown>> extends Machine<TContext> {
  /** Machine ID */
  readonly id: string;

  /** Current state (getter) */
  readonly state: string;

  /** Current context (getter) */
  readonly context: TContext;

  /** Export to XState format */
  toXState(): XStateOutput;
}

/**
 * Create a standalone state machine with behaviors
 *
 * @example
 * ```ts
 * const order = createMachine({
 *   id: 'order',
 *   initial: 'draft',
 *   context: { items: 0, total: 0 },
 *
 *   states: {
 *     draft: { on: { ADD_ITEM: 'draft', SUBMIT: 'pending' } },
 *     pending: { on: { APPROVE: 'confirmed', REJECT: 'draft' } },
 *     confirmed: { on: { SHIP: 'shipped' } },
 *     shipped: {},
 *   },
 *
 *   on: {
 *     ADD_ITEM: (ctx, { set }) => {
 *       set({ items: ctx.items + 1, total: ctx.total + 29.99 });
 *     },
 *   },
 *
 *   onEnter: {
 *     confirmed: (ctx, { log }) => log(`Order: ${ctx.items} items`),
 *   },
 *
 *   timers: {
 *     processing: { send: 'COMPLETE', delay: 2000 },
 *   },
 * });
 *
 * order.send('ADD_ITEM');
 * order.send('SUBMIT');
 * console.log(order.state);   // 'pending'
 * console.log(order.context); // { items: 1, total: 29.99 }
 * ```
 */
export function createMachine<TContext = Record<string, unknown>>(
  config: CreateMachineConfig<TContext>
): BehaviorMachine<TContext> {
  const {
    id,
    initial,
    context: initialContext,
    states,
    on: eventHandlers = {},
    onEnter: enterHandlers = {},
    onExit: exitHandlers = {},
    timers = {},
    logger = () => {},
  } = config;

  // Create internal kernel
  const kernel = new Kernel();

  // Active timers for cleanup
  const activeTimers = new Map<string, ReturnType<typeof setTimeout>>();

  // Convert to MachineConfig format
  const machineConfig: MachineConfig<TContext> = {
    prefix: id,
    initial,
    context: initialContext,
    states: {},
    trackHistory: true,
  };

  // Convert states
  for (const [stateName, stateDef] of Object.entries(states)) {
    machineConfig.states[stateName] = {
      on: stateDef.on ? { ...stateDef.on } : undefined,
    };
  }

  // Create base machine
  const baseMachine = useMachine<TContext>(kernel, machineConfig);

  // Create helpers factory
  const createHelpers = (): BehaviorHelpers<TContext> => ({
    set: (partial) => baseMachine.setContext(partial),
    send: (event, payload) => baseMachine.send(event, payload),
    log: logger,
  });

  // Register behavior handlers
  // onEnter handlers
  kernel.on(`${id}:enter:*`, async (e: any) => {
    const state = e.data?.state;
    if (!state) return;

    // Clear any existing timer for previous state
    activeTimers.forEach((timer, key) => {
      if (!key.startsWith(state + ':')) {
        clearTimeout(timer);
        activeTimers.delete(key);
      }
    });

    // Call onEnter handler
    const handler = enterHandlers[state];
    if (handler) {
      await handler(baseMachine.getContext(), createHelpers());
    }

    // Set up timer if defined
    const timerDef = timers[state];
    if (timerDef) {
      const timerId = setTimeout(() => {
        baseMachine.send(timerDef.send);
        activeTimers.delete(state + ':timer');
      }, timerDef.delay);
      activeTimers.set(state + ':timer', timerId);
    }
  });

  // onExit handlers
  kernel.on(`${id}:exit:*`, async (e: any) => {
    const state = e.data?.state;
    if (!state) return;

    // Clear timer
    const timerId = activeTimers.get(state + ':timer');
    if (timerId) {
      clearTimeout(timerId);
      activeTimers.delete(state + ':timer');
    }

    // Call onExit handler
    const handler = exitHandlers[state];
    if (handler) {
      await handler(baseMachine.getContext(), createHelpers());
    }
  });

  // Event (on) handlers
  kernel.on(`${id}:transition`, async (e: any) => {
    const event = e.data?.event;
    if (!event) return;

    const handler = eventHandlers[event];
    if (handler) {
      await handler(baseMachine.getContext(), createHelpers());
    }
  });

  // Build extended machine
  const machine: BehaviorMachine<TContext> = {
    ...baseMachine,
    id,

    get state() {
      return baseMachine.getState();
    },

    get context() {
      return baseMachine.getContext();
    },

    toXState(): XStateOutput {
      const xstate = toXStateFormat(machineConfig);
      return {
        id: xstate.id || id,
        initial: xstate.initial,
        context: xstate.context,
        states: Object.fromEntries(
          Object.entries(xstate.states).map(([name, state]) => [
            name,
            {
              on: state.on
                ? Object.fromEntries(
                    Object.entries(state.on).map(([event, target]) => [
                      event,
                      typeof target === 'string' ? target : { target: (target as any).target },
                    ])
                  )
                : undefined,
            },
          ])
        ),
      };
    },

    destroy() {
      // Clear all timers
      activeTimers.forEach((timer) => clearTimeout(timer));
      activeTimers.clear();
      baseMachine.destroy();
    },
  };

  return machine;
}
