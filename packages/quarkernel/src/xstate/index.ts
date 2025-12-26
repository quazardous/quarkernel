/**
 * XState Interoperability Module
 *
 * Convert between QuarKernel FSM and XState formats.
 *
 * @example Import from XState
 * ```ts
 * import { fromXState, useMachine } from '@quazardous/quarkernel';
 *
 * const config = fromXState(xstateConfig, {
 *   prefix: 'order',
 *   guards: { canApprove: (ctx) => ctx.retries < 3 },
 * });
 *
 * const machine = useMachine(kernel, config);
 * ```
 *
 * @example Export to XState
 * ```ts
 * import { toXStateFormat } from '@quazardous/quarkernel/xstate';
 *
 * const xstateConfig = toXStateFormat(machineConfig);
 * // Use with XState visualizer or inspector
 * ```
 */

export { fromXState, toXStateFormat } from './xstate-import.js';
export type { XStateMachineConfig, ImportOptions } from './xstate-import.js';

export { formatStateCentricCode } from './xstate-behaviors.js';
export type { XStateConfigWithActions } from './xstate-behaviors.js';
