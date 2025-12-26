/**
 * FSM Machine Implementation
 *
 * Flexible state machine layer built on quarkernel events.
 * Uses prefixed events for loose coupling and multi-machine orchestration.
 */

import type { Kernel } from '../kernel.js';
import type {
  MachineConfig,
  Machine,
  MachineSnapshot,
  StateName,
  TransitionEvent,
  TransitionDef,
  SendOptions,
  FSMEventData,
} from './types.js';

/**
 * Create a state machine on a kernel
 *
 * @param kernel - The quarkernel instance to use
 * @param config - Machine configuration
 * @returns Machine instance
 *
 * @example
 * ```ts
 * const kernel = new Kernel();
 *
 * const order = useMachine(kernel, {
 *   prefix: 'order',
 *   initial: 'draft',
 *   states: {
 *     draft: { on: { SUBMIT: 'pending' } },
 *     pending: { on: { APPROVE: 'confirmed', REJECT: 'draft' } },
 *     confirmed: { on: { SHIP: 'shipped' } },
 *     shipped: {}
 *   }
 * });
 *
 * // Listen to state changes
 * kernel.on('order:enter:confirmed', (e) => {
 *   console.log('Order confirmed!');
 * });
 *
 * await order.send('SUBMIT');
 * await order.send('APPROVE');
 * ```
 */
export function useMachine<TContext = Record<string, any>>(
  kernel: Kernel,
  config: MachineConfig<TContext>
): Machine<TContext> {
  const {
    prefix,
    initial,
    states,
    allowForce = true,
    snapshot,
    trackHistory = false,
    maxHistory = 100,
  } = config;

  // History entry type
  type HistoryEntry = { from: StateName; to: StateName; event: TransitionEvent; timestamp: number };

  // Initialize state from snapshot or initial
  let currentState: StateName = snapshot?.state ?? initial;
  let context: TContext = snapshot?.context ?? config.context ?? ({} as TContext);
  let history: HistoryEntry[] = snapshot?.history ? [...snapshot.history] : [];

  // Validate initial state exists
  if (!states[currentState]) {
    throw new Error(`Invalid initial state "${currentState}" - not defined in states`);
  }

  // Cleanup functions for listeners
  const cleanupFns: Array<() => void> = [];

  /**
   * Emit FSM event on kernel
   */
  const emitFSM = async (
    eventType: string,
    data: Omit<FSMEventData, 'machine'>
  ): Promise<void> => {
    const eventData: FSMEventData = {
      machine: prefix,
      ...data,
    };
    await kernel.emit(`${prefix}:${eventType}` as any, eventData as any);
  };

  /**
   * Get transition definition for event from current state
   */
  const getTransition = (event: TransitionEvent): TransitionDef<TContext> | null => {
    const stateNode = states[currentState];
    if (!stateNode?.on) return null;

    const transition = stateNode.on[event];
    if (!transition) return null;

    // Normalize string to TransitionDef
    if (typeof transition === 'string') {
      return { target: transition };
    }

    return transition;
  };

  /**
   * Execute transition
   */
  const doTransition = async (
    event: TransitionEvent,
    targetState: StateName,
    payload?: any,
    forced = false
  ): Promise<void> => {
    const fromState = currentState;
    const fromNode = states[fromState];
    const toNode = states[targetState];

    if (!toNode) {
      throw new Error(`Invalid target state "${targetState}" - not defined in states`);
    }

    // Exit current state
    if (fromNode?.onExit) {
      await fromNode.onExit(context, event, payload);
    }
    await emitFSM(`exit:${fromState}`, {
      state: fromState,
      from: fromState,
      to: targetState,
      event,
      payload,
      forced,
    });

    // Update state
    currentState = targetState;

    // Track history
    if (trackHistory) {
      history.push({
        from: fromState,
        to: targetState,
        event,
        timestamp: Date.now(),
      });
      // Trim history if needed
      if (history.length > maxHistory) {
        history = history.slice(-maxHistory);
      }
    }

    // Emit transition event
    await emitFSM('transition', {
      state: targetState,
      from: fromState,
      to: targetState,
      event,
      payload,
      forced,
    });
    await emitFSM(`transition:${event}`, {
      state: targetState,
      from: fromState,
      to: targetState,
      event,
      payload,
      forced,
    });

    // Enter new state
    await emitFSM(`enter:${targetState}`, {
      state: targetState,
      from: fromState,
      to: targetState,
      event,
      payload,
      forced,
    });
    if (toNode.onEnter) {
      await toNode.onEnter(context, event, payload);
    }
  };

  /**
   * Machine instance
   */
  const machine: Machine<TContext> = {
    prefix,

    getState(): StateName {
      return currentState;
    },

    getContext(): TContext {
      return context;
    },

    setContext(updater): void {
      if (typeof updater === 'function') {
        context = (updater as (ctx: TContext) => TContext)(context);
      } else {
        context = { ...context, ...updater };
      }
    },

    async send(
      event: TransitionEvent,
      payload?: any,
      options: SendOptions<TContext> = {}
    ): Promise<boolean> {
      const { force = false, target, guard: inlineGuard, fallback } = options;

      // Force transition
      if (force && allowForce) {
        const targetState = target ?? initial;
        await doTransition(event, targetState, payload, true);
        return true;
      }

      // Get transition from state definition
      const transition = getTransition(event);

      // No transition defined
      if (!transition) {
        if (force && !allowForce) {
          throw new Error(`Force transitions not allowed on machine "${prefix}"`);
        }
        return false;
      }

      // Check guard
      const guardFn = inlineGuard ?? transition.guard;
      if (guardFn && !guardFn(context, event, payload)) {
        // Guard rejected
        await emitFSM('guard:rejected', {
          state: currentState,
          event,
          payload,
        });

        // Use fallback if provided
        if (fallback) {
          if (!states[fallback]) {
            throw new Error(`Invalid fallback state "${fallback}" - not defined in states`);
          }
          await doTransition(event, fallback, payload, false);
          return true;
        }

        return false;
      }

      // Execute transition actions
      if (transition.actions) {
        const actions = Array.isArray(transition.actions)
          ? transition.actions
          : [transition.actions];
        for (const action of actions) {
          await action(context, event, payload);
        }
      }

      // Do the transition
      await doTransition(event, transition.target, payload, false);
      return true;
    },

    can(event: TransitionEvent): boolean {
      return getTransition(event) !== null;
    },

    transitions(): TransitionEvent[] {
      const stateNode = states[currentState];
      if (!stateNode?.on) return [];
      return Object.keys(stateNode.on);
    },

    toJSON(): MachineSnapshot<TContext> {
      return {
        state: currentState,
        context: structuredClone(context),
        history: trackHistory ? [...history] : undefined,
      };
    },

    restore(snapshot: MachineSnapshot<TContext>): void {
      if (!states[snapshot.state]) {
        throw new Error(`Invalid snapshot state "${snapshot.state}" - not defined in states`);
      }
      currentState = snapshot.state;
      context = snapshot.context;
      if (snapshot.history) {
        history = [...snapshot.history];
      }
    },

    destroy(): void {
      for (const cleanup of cleanupFns) {
        cleanup();
      }
      cleanupFns.length = 0;
    },
  };

  // Emit initial enter event (unless restoring from snapshot)
  if (!snapshot) {
    // Schedule initial enter event for next tick to allow listeners to be set up
    setTimeout(async () => {
      const initialNode = states[initial];
      await emitFSM(`enter:${initial}`, {
        state: initial,
      });
      if (initialNode?.onEnter) {
        await initialNode.onEnter(context, '__INIT__', undefined);
      }
    }, 0);
  }

  return machine;
}

/**
 * Type helper for defining typed machine configs
 */
export function defineMachine<TContext = Record<string, any>>(
  config: Omit<MachineConfig<TContext>, 'prefix'>
): Omit<MachineConfig<TContext>, 'prefix'> {
  return config;
}
