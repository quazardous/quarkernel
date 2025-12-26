/**
 * XState <-> FSM Behaviors Conversion
 *
 * Converts between QuarKernel FSM behaviors and XState format with actions.
 */

import type { MachineConfig } from './types.js';
import type { BehaviorFn } from './create-machine.js';

/**
 * FSM Behaviors format
 */
export interface FSMBehaviors<TContext = Record<string, unknown>> {
  /** State entry handlers: { stateName: (ctx, helpers) => ... } */
  onEnter?: Record<string, BehaviorFn<TContext>>;
  /** State exit handlers: { stateName: (ctx, helpers) => ... } */
  onExit?: Record<string, BehaviorFn<TContext>>;
  /** Event handlers: { EVENT_NAME: (ctx, helpers) => ... } */
  on?: Record<string, BehaviorFn<TContext>>;
  /** Auto-timers: { stateName: { send: 'EVENT', delay: 2000 } } */
  timers?: Record<string, { send: string; delay: number }>;
}

/**
 * XState config with actions
 */
export interface XStateConfigWithActions {
  id: string;
  initial: string;
  context?: Record<string, unknown>;
  states: Record<string, {
    entry?: string | string[];
    exit?: string | string[];
    on?: Record<string, string | { target: string; actions?: string | string[] }>;
    after?: Record<number, { target?: string; actions?: string | string[] }>;
  }>;
}

/**
 * Convert QuarKernel machine config + behaviors to XState format with actions
 *
 * @example
 * ```ts
 * const xstate = toXStateWithBehaviors(machineConfig, behaviors);
 * // Returns XState config + actions object
 * ```
 */
export function toXStateWithBehaviors<TContext = Record<string, unknown>>(
  config: MachineConfig<TContext>,
  behaviors?: FSMBehaviors<TContext>
): { config: XStateConfigWithActions; actions: Record<string, BehaviorFn<TContext>> } {
  const id = config.prefix || 'machine';
  const actions: Record<string, BehaviorFn<TContext>> = {};

  const xstateConfig: XStateConfigWithActions = {
    id,
    initial: config.initial,
    context: config.context as Record<string, unknown> | undefined,
    states: {},
  };

  // Build states
  for (const [stateName, stateConfig] of Object.entries(config.states)) {
    const state: XStateConfigWithActions['states'][string] = {};

    // Entry action
    if (behaviors?.onEnter?.[stateName]) {
      const actionName = `enter_${stateName}`;
      state.entry = actionName;
      actions[actionName] = behaviors.onEnter[stateName];
    }

    // Exit action
    if (behaviors?.onExit?.[stateName]) {
      const actionName = `exit_${stateName}`;
      state.exit = actionName;
      actions[actionName] = behaviors.onExit[stateName];
    }

    // Transitions
    if (stateConfig.on) {
      state.on = {};
      for (const [event, target] of Object.entries(stateConfig.on)) {
        const targetState = typeof target === 'string' ? target : (target as any).target;

        if (behaviors?.on?.[event]) {
          const actionName = `on_${event}`;
          state.on[event] = { target: targetState, actions: actionName };
          actions[actionName] = behaviors.on[event];
        } else {
          state.on[event] = targetState;
        }
      }
    }

    // Timer as after (XState delay)
    if (behaviors?.timers?.[stateName]) {
      const timer = behaviors.timers[stateName];
      state.after = {
        [timer.delay]: { actions: `raise_${timer.send}` },
      };
    }

    xstateConfig.states[stateName] = state;
  }

  return { config: xstateConfig, actions };
}

/**
 * Format XState config with behaviors as JavaScript code string
 *
 * @example
 * ```ts
 * const code = formatXStateCode(machineConfig, behaviors);
 * // Returns formatted JS code string
 * ```
 */
export function formatXStateCode<TContext = Record<string, unknown>>(
  config: MachineConfig<TContext>,
  behaviors?: FSMBehaviors<TContext>
): string {
  const id = config.prefix || 'machine';
  const lines: string[] = [
    `// XState v5 Config for "${id}"`,
    `import { createMachine } from 'xstate';`,
    '',
  ];

  const { config: xstateConfig, actions } = toXStateWithBehaviors(config, behaviors);

  // Build states code
  const statesLines: string[] = [];
  for (const [stateName, stateConfig] of Object.entries(xstateConfig.states)) {
    const stateLines: string[] = [`    ${stateName}: {`];

    if (stateConfig.entry) {
      stateLines.push(`      entry: '${stateConfig.entry}',`);
    }
    if (stateConfig.exit) {
      stateLines.push(`      exit: '${stateConfig.exit}',`);
    }

    if (stateConfig.on && Object.keys(stateConfig.on).length > 0) {
      stateLines.push('      on: {');
      for (const [event, target] of Object.entries(stateConfig.on)) {
        if (typeof target === 'string') {
          stateLines.push(`        ${event}: '${target}',`);
        } else {
          const actionsStr = target.actions ? `, actions: '${target.actions}'` : '';
          stateLines.push(`        ${event}: { target: '${target.target}'${actionsStr} },`);
        }
      }
      stateLines.push('      },');
    }

    if (stateConfig.after) {
      stateLines.push('      after: {');
      for (const [delay, action] of Object.entries(stateConfig.after)) {
        stateLines.push(`        ${delay}: { actions: raise({ type: '${(action as any).actions?.replace('raise_', '')}' }) },`);
      }
      stateLines.push('      },');
    }

    stateLines.push('    },');
    statesLines.push(stateLines.join('\n'));
  }

  // Machine config
  lines.push(`export const ${id}Machine = createMachine({`);
  lines.push(`  id: '${id}',`);
  lines.push(`  initial: '${xstateConfig.initial}',`);
  if (xstateConfig.context) {
    lines.push(`  context: ${JSON.stringify(xstateConfig.context)},`);
  }
  lines.push('  states: {');
  lines.push(statesLines.join('\n'));
  lines.push('  },');
  lines.push('});');

  // Actions implementations
  if (Object.keys(actions).length > 0) {
    lines.push('');
    lines.push('// Actions implementations');
    lines.push('export const actions = {');

    for (const [name, fn] of Object.entries(actions)) {
      lines.push(`  ${name}: ${fn.toString()},`);
    }

    lines.push('};');
  }

  return lines.join('\n');
}

/**
 * Format FSM behaviors as JavaScript code string
 *
 * @example
 * ```ts
 * const code = formatBehaviorsCode('order', behaviors);
 * // Returns formatted JS code string
 * ```
 */
export function formatBehaviorsCode<TContext = Record<string, unknown>>(
  machineName: string,
  behaviors: FSMBehaviors<TContext>
): string {
  const lines: string[] = [
    `// FSM Behaviors for "${machineName}"`,
    `// Helpers: ctx, set(obj), send(event), log(msg)`,
    '',
    `export const ${machineName} = {`,
  ];

  // onEnter
  if (behaviors.onEnter && Object.keys(behaviors.onEnter).length > 0) {
    lines.push('  onEnter: {');
    for (const [state, fn] of Object.entries(behaviors.onEnter)) {
      lines.push(`    ${state}: ${fn.toString()},`);
    }
    lines.push('  },');
  }

  // onExit
  if (behaviors.onExit && Object.keys(behaviors.onExit).length > 0) {
    lines.push('  onExit: {');
    for (const [state, fn] of Object.entries(behaviors.onExit)) {
      lines.push(`    ${state}: ${fn.toString()},`);
    }
    lines.push('  },');
  }

  // on (events)
  if (behaviors.on && Object.keys(behaviors.on).length > 0) {
    lines.push('  on: {');
    for (const [event, fn] of Object.entries(behaviors.on)) {
      lines.push(`    ${event}: ${fn.toString()},`);
    }
    lines.push('  },');
  }

  // timers
  if (behaviors.timers && Object.keys(behaviors.timers).length > 0) {
    lines.push('  timers: {');
    for (const [state, timer] of Object.entries(behaviors.timers)) {
      lines.push(`    ${state}: { send: '${timer.send}', delay: ${timer.delay} },`);
    }
    lines.push('  },');
  }

  lines.push('};');
  return lines.join('\n');
}
