/**
 * createMachine - High-level FSM factory
 *
 * Standalone state machine with declarative behaviors.
 * Can work independently or connect to a kernel.
 */

import { Kernel } from '../kernel.js';
import { useMachine } from './machine.js';
import type { Machine, MachineConfig } from './types.js';

/**
 * Built-in helpers (always available)
 */
export interface BuiltInHelpers<TContext = Record<string, unknown>> {
  /** Merge into context */
  set: (partial: Partial<TContext>) => void;
  /** Trigger transition */
  send: (event: string, payload?: unknown) => void;
  /** Log message (default: console.log) */
  log: (message: string) => void;
}

/**
 * Behavior helpers passed to callbacks (built-ins + custom)
 */
export type BehaviorHelpers<TContext = Record<string, unknown>, TCustom = Record<string, unknown>> =
  BuiltInHelpers<TContext> & TCustom;

/**
 * Behavior callback
 */
export type BehaviorFn<TContext = Record<string, unknown>> = (
  ctx: TContext,
  helpers: BehaviorHelpers<TContext>
) => void | Promise<void>;

/**
 * Timer/after definition
 */
export interface AfterDef {
  /** Event to send */
  send: string;
  /** Delay in ms */
  delay: number;
}

/**
 * State-centric state definition
 */
export interface StateConfig<TContext = Record<string, unknown>> {
  /** Transitions: { EVENT: 'target' } or { EVENT: { target: 'x', cond: 'guard' } } */
  on?: Record<string, string | { target: string; cond?: string }>;
  /** Action on entering this state */
  entry?: BehaviorFn<TContext>;
  /** Action on exiting this state */
  exit?: BehaviorFn<TContext>;
  /** Auto-transition after delay: { delay: 3000, send: 'TIMER' } */
  after?: AfterDef;
}

/**
 * High-level machine config (state-centric)
 */
export interface CreateMachineConfig<TContext = Record<string, unknown>, THelpers = Record<string, unknown>> {
  /** Machine identifier */
  id: string;

  /** Initial state */
  initial: string;

  /** Initial context */
  context?: TContext;

  /** State definitions with entry/exit/after inline */
  states: Record<string, StateConfig<TContext>>;

  /** Global event handlers: { EVENT_NAME: (ctx, helpers) => ... } */
  on?: Record<string, BehaviorFn<TContext>>;

  /** Custom helpers merged with built-ins (set, send) */
  helpers?: THelpers;
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
}

/**
 * Create a standalone state machine with behaviors (state-centric)
 *
 * @example
 * ```ts
 * const order = createMachine({
 *   id: 'order',
 *   initial: 'draft',
 *   context: { items: 0, total: 0 },
 *
 *   states: {
 *     draft: {
 *       on: { ADD_ITEM: 'draft', SUBMIT: 'pending' }
 *     },
 *     pending: {
 *       entry: (ctx, { log }) => log('Order pending...'),
 *       on: { APPROVE: 'confirmed', REJECT: 'draft' }
 *     },
 *     confirmed: {
 *       entry: (ctx, { log }) => log(`Order confirmed: ${ctx.items} items`),
 *       on: { SHIP: 'shipped' }
 *     },
 *     processing: {
 *       after: { delay: 2000, send: 'COMPLETE' },
 *       on: { COMPLETE: 'done' }
 *     },
 *     shipped: {},
 *   },
 *
 *   // Global event handlers (optional)
 *   on: {
 *     ADD_ITEM: (ctx, { set }) => {
 *       set({ items: ctx.items + 1, total: ctx.total + 29.99 });
 *     },
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
    helpers: customHelpers = {},
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

  // Convert states (extract only transitions for base machine)
  for (const [stateName, stateDef] of Object.entries(states)) {
    machineConfig.states[stateName] = {
      on: stateDef.on ? { ...stateDef.on } : undefined,
    };
  }

  // Create base machine
  const baseMachine = useMachine<TContext>(kernel, machineConfig);

  // Create helpers factory (built-ins + custom)
  const createHelpers = () => ({
    // Built-ins
    set: (partial: Partial<TContext>) => baseMachine.setContext(partial),
    send: (event: string, payload?: unknown) => baseMachine.send(event, payload),
    log: console.log,
    // Custom helpers (can override built-ins)
    ...customHelpers,
  });

  // Register behavior handlers
  // Entry handlers (read from each state's entry property)
  kernel.on(`${id}:enter:*`, async (e: any) => {
    const stateName = e.data?.state;
    if (!stateName) return;

    // Clear any existing timer for previous state
    activeTimers.forEach((timer, key) => {
      if (!key.startsWith(stateName + ':')) {
        clearTimeout(timer);
        activeTimers.delete(key);
      }
    });

    // Get state config
    const stateConfig = states[stateName];
    if (!stateConfig) return;

    // Call entry handler
    if (stateConfig.entry) {
      await stateConfig.entry(baseMachine.getContext(), createHelpers());
    }

    // Set up after timer if defined
    if (stateConfig.after) {
      const timerId = setTimeout(() => {
        baseMachine.send(stateConfig.after!.send);
        activeTimers.delete(stateName + ':timer');
      }, stateConfig.after.delay);
      activeTimers.set(stateName + ':timer', timerId);
    }
  });

  // Exit handlers (read from each state's exit property)
  kernel.on(`${id}:exit:*`, async (e: any) => {
    const stateName = e.data?.state;
    if (!stateName) return;

    // Clear timer
    const timerId = activeTimers.get(stateName + ':timer');
    if (timerId) {
      clearTimeout(timerId);
      activeTimers.delete(stateName + ':timer');
    }

    // Get state config
    const stateConfig = states[stateName];
    if (!stateConfig) return;

    // Call exit handler
    if (stateConfig.exit) {
      await stateConfig.exit(baseMachine.getContext(), createHelpers());
    }
  });

  // Global event handlers
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

    destroy() {
      // Clear all timers
      activeTimers.forEach((timer) => clearTimeout(timer));
      activeTimers.clear();
      baseMachine.destroy();
    },
  };

  return machine;
}
