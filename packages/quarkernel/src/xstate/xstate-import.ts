/**
 * XState Import Helper
 *
 * Converts XState machine definitions to quarkernel FSM format.
 * Supports basic XState v4/v5 machine structures.
 */

import type { MachineConfig, StateNode, TransitionDef, GuardFunction, ActionFunction } from '../fsm/types.js';

/**
 * XState-like state node (simplified)
 */
interface XStateNode {
  on?: Record<string, string | XStateTransition>;
  entry?: string | string[] | XStateAction | XStateAction[];
  exit?: string | string[] | XStateAction | XStateAction[];
  always?: XStateTransition | XStateTransition[];
  after?: Record<string, string | XStateTransition>;
  meta?: Record<string, any>;
}

/**
 * XState-like transition
 */
interface XStateTransition {
  target?: string;
  cond?: string | XStateGuard;
  guard?: string | XStateGuard;  // v5 uses guard instead of cond
  actions?: string | string[] | XStateAction | XStateAction[];
}

/**
 * XState guard definition
 */
interface XStateGuard {
  type: string;
  [key: string]: any;
}

/**
 * XState action definition
 */
interface XStateAction {
  type: string;
  [key: string]: any;
}

/**
 * XState-like machine config
 */
export interface XStateMachineConfig {
  id?: string;
  initial: string;
  context?: Record<string, any>;
  states: Record<string, XStateNode>;
}

/**
 * Import options
 */
export interface ImportOptions<TContext = any> {
  /** Machine prefix (required for quarkernel) */
  prefix: string;

  /** Guard implementations (keyed by guard name/type) */
  guards?: Record<string, GuardFunction<TContext>>;

  /** Action implementations (keyed by action name/type) */
  actions?: Record<string, ActionFunction<TContext>>;

  /** Allow force transitions */
  allowForce?: boolean;

  /** Track history */
  trackHistory?: boolean;
}

/**
 * Convert XState machine config to quarkernel format
 *
 * @param xstateConfig - XState machine configuration
 * @param options - Import options with implementations
 * @returns quarkernel MachineConfig
 *
 * @example
 * ```ts
 * // XState format
 * const xstateMachine = {
 *   id: 'order',
 *   initial: 'draft',
 *   context: { retries: 0 },
 *   states: {
 *     draft: { on: { SUBMIT: 'pending' } },
 *     pending: {
 *       on: {
 *         APPROVE: { target: 'confirmed', cond: 'canApprove' },
 *         REJECT: 'draft'
 *       }
 *     },
 *     confirmed: {}
 *   }
 * };
 *
 * // Convert to quarkernel
 * const config = fromXState(xstateMachine, {
 *   prefix: 'order',
 *   guards: {
 *     canApprove: (ctx) => ctx.retries < 3
 *   }
 * });
 *
 * const machine = useMachine(kernel, config);
 * ```
 */
export function fromXState<TContext = Record<string, any>>(
  xstateConfig: XStateMachineConfig,
  options: ImportOptions<TContext>
): MachineConfig<TContext> {
  const { prefix, guards = {}, actions = {}, allowForce, trackHistory } = options;

  const states: Record<string, StateNode<TContext>> = {};

  for (const [stateName, xstateNode] of Object.entries(xstateConfig.states)) {
    const stateNode: StateNode<TContext> = {};

    // Convert transitions
    if (xstateNode.on) {
      stateNode.on = {};

      for (const [event, transition] of Object.entries(xstateNode.on)) {
        if (typeof transition === 'string') {
          // Simple string target
          stateNode.on[event] = transition;
        } else {
          // Object transition with target, guard, actions
          const transitionDef: TransitionDef<TContext> = {
            target: transition.target || stateName, // Self-transition if no target
          };

          // Convert guard (cond in v4, guard in v5)
          const guardRef = transition.cond || transition.guard;
          if (guardRef) {
            const guardName = typeof guardRef === 'string' ? guardRef : guardRef.type;
            const guardFn = guards[guardName];
            if (guardFn) {
              transitionDef.guard = guardFn;
            } else {
              console.warn(`Guard "${guardName}" not provided in options.guards`);
            }
          }

          // Convert actions
          if (transition.actions) {
            const actionRefs = Array.isArray(transition.actions)
              ? transition.actions
              : [transition.actions];

            const actionFns: ActionFunction<TContext>[] = [];
            for (const actionRef of actionRefs) {
              const actionName = typeof actionRef === 'string' ? actionRef : actionRef.type;
              const actionFn = actions[actionName];
              if (actionFn) {
                actionFns.push(actionFn);
              } else {
                console.warn(`Action "${actionName}" not provided in options.actions`);
              }
            }

            if (actionFns.length > 0) {
              transitionDef.actions = actionFns.length === 1 ? actionFns[0] : actionFns;
            }
          }

          stateNode.on[event] = transitionDef;
        }
      }
    }

    // Convert entry actions
    if (xstateNode.entry) {
      const entryRefs = Array.isArray(xstateNode.entry)
        ? xstateNode.entry
        : [xstateNode.entry];

      const entryFns: ActionFunction<TContext>[] = [];
      for (const actionRef of entryRefs) {
        const actionName = typeof actionRef === 'string' ? actionRef : actionRef.type;
        const actionFn = actions[actionName];
        if (actionFn) {
          entryFns.push(actionFn);
        }
      }

      if (entryFns.length > 0) {
        stateNode.entry = async (ctx, event, payload) => {
          for (const fn of entryFns) {
            await fn(ctx, event, payload);
          }
        };
      }
    }

    // Convert exit actions
    if (xstateNode.exit) {
      const exitRefs = Array.isArray(xstateNode.exit)
        ? xstateNode.exit
        : [xstateNode.exit];

      const exitFns: ActionFunction<TContext>[] = [];
      for (const actionRef of exitRefs) {
        const actionName = typeof actionRef === 'string' ? actionRef : actionRef.type;
        const actionFn = actions[actionName];
        if (actionFn) {
          exitFns.push(actionFn);
        }
      }

      if (exitFns.length > 0) {
        stateNode.exit = async (ctx, event, payload) => {
          for (const fn of exitFns) {
            await fn(ctx, event, payload);
          }
        };
      }
    }

    states[stateName] = stateNode;
  }

  return {
    prefix,
    initial: xstateConfig.initial,
    context: xstateConfig.context as TContext,
    states,
    allowForce,
    trackHistory,
  };
}

/**
 * Export quarkernel machine config to XState-compatible format
 * Useful for visualization tools that understand XState format
 *
 * @param config - quarkernel MachineConfig
 * @returns XState-compatible config (without function implementations)
 */
export function toXStateFormat<TContext = any>(
  config: MachineConfig<TContext>
): XStateMachineConfig {
  const states: Record<string, XStateNode> = {};

  for (const [stateName, stateNode] of Object.entries(config.states)) {
    const xstateNode: XStateNode = {};

    if (stateNode.on) {
      xstateNode.on = {};

      for (const [event, transition] of Object.entries(stateNode.on)) {
        if (typeof transition === 'string') {
          xstateNode.on[event] = transition;
        } else {
          const xstateTransition: XStateTransition = {
            target: transition.target,
          };

          // Note: guard and action functions can't be serialized
          // We just mark that they exist
          if (transition.guard) {
            xstateTransition.guard = { type: 'guard' };
          }
          if (transition.actions) {
            xstateTransition.actions = { type: 'action' };
          }

          xstateNode.on[event] = xstateTransition;
        }
      }
    }

    if (stateNode.entry) {
      xstateNode.entry = { type: 'entry' };
    }

    if (stateNode.exit) {
      xstateNode.exit = { type: 'exit' };
    }

    states[stateName] = xstateNode;
  }

  return {
    id: config.prefix,
    initial: config.initial,
    context: config.context as Record<string, any>,
    states,
  };
}
