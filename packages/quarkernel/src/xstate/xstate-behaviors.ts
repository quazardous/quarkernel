/**
 * XState <-> FSM Behaviors Conversion
 *
 * Converts between QuarKernel FSM (state-centric) and XState format.
 */

import type { CreateMachineConfig } from '../fsm/create-machine.js';

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
 * Format state-centric FSM config as JavaScript code string
 *
 * @example
 * ```ts
 * const code = formatStateCentricCode(config);
 * // Returns formatted JS code string with entry/exit/after inline in states
 * ```
 */
export function formatStateCentricCode<TContext = Record<string, unknown>>(
  config: CreateMachineConfig<TContext>
): string {
  const { id, initial, context, states, on: globalHandlers } = config;

  const lines: string[] = [
    `// FSM Definition for "${id}"`,
    `// Helpers: ctx, set(obj), send(event), log(msg)`,
    '',
    `export default {`,
    `  id: '${id}',`,
    `  initial: '${initial}',`,
  ];

  // Context
  if (context && Object.keys(context).length > 0) {
    lines.push(`  context: ${JSON.stringify(context)},`);
  }

  // States
  lines.push('  states: {');
  for (const [stateName, stateConfig] of Object.entries(states)) {
    lines.push(`    ${stateName}: {`);

    // entry
    if (stateConfig.entry) {
      lines.push(`      entry: ${stateConfig.entry.toString()},`);
    }

    // exit
    if (stateConfig.exit) {
      lines.push(`      exit: ${stateConfig.exit.toString()},`);
    }

    // after
    if (stateConfig.after) {
      lines.push(`      after: { delay: ${stateConfig.after.delay}, send: '${stateConfig.after.send}' },`);
    }

    // on (transitions)
    if (stateConfig.on && Object.keys(stateConfig.on).length > 0) {
      lines.push('      on: {');
      for (const [event, target] of Object.entries(stateConfig.on)) {
        if (typeof target === 'string') {
          lines.push(`        ${event}: '${target}',`);
        } else {
          lines.push(`        ${event}: { target: '${target.target}'${target.cond ? `, cond: '${target.cond}'` : ''} },`);
        }
      }
      lines.push('      },');
    }

    lines.push('    },');
  }
  lines.push('  },');

  // Global event handlers
  if (globalHandlers && Object.keys(globalHandlers).length > 0) {
    lines.push('  on: {');
    for (const [event, fn] of Object.entries(globalHandlers)) {
      lines.push(`    ${event}: ${fn.toString()},`);
    }
    lines.push('  },');
  }

  lines.push('};');
  return lines.join('\n');
}
