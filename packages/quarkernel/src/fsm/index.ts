/**
 * FSM Module - State Machine Layer for QuarKernel
 *
 * Two APIs available:
 *
 * 1. createMachine() - Standalone with high-level behaviors
 * 2. useMachine()    - Low-level with external kernel
 *
 * @example Standalone
 * ```ts
 * import { createMachine } from '@quazardous/quarkernel/fsm';
 *
 * const order = createMachine({
 *   id: 'order',
 *   initial: 'draft',
 *   context: { items: 0 },
 *   states: {
 *     draft: { on: { SUBMIT: 'pending' } },
 *     pending: { on: { APPROVE: 'confirmed' } },
 *     confirmed: {}
 *   },
 *   on: {
 *     SUBMIT: (ctx, { log }) => log('Submitted!')
 *   },
 *   onEnter: {
 *     confirmed: (ctx, { log }) => log('Order confirmed!')
 *   }
 * });
 *
 * order.send('SUBMIT');
 * console.log(order.state);   // 'pending'
 * console.log(order.toXState()); // XState format
 * ```
 *
 * @example With Kernel
 * ```ts
 * import { Kernel, useMachine } from '@quazardous/quarkernel';
 *
 * const kernel = new Kernel();
 * const order = useMachine(kernel, {
 *   prefix: 'order',
 *   initial: 'draft',
 *   states: { ... }
 * });
 *
 * kernel.on('order:enter:confirmed', () => console.log('Confirmed!'));
 * kernel.on('*:transition', () => console.log('Any machine transitioned'));
 * ```
 */

// High-level API
export { createMachine } from './create-machine.js';
export type {
  CreateMachineConfig,
  BehaviorMachine,
  BehaviorFn,
  BehaviorHelpers,
  TimerDef,
  XStateOutput,
} from './create-machine.js';

// Low-level API
export { useMachine, defineMachine } from './machine.js';
export { fromXState, toXStateFormat } from './xstate-import.js';
export {
  toXStateWithBehaviors,
  formatXStateCode,
  formatBehaviorsCode,
} from './xstate-behaviors.js';
export type {
  FSMBehaviors,
  XStateConfigWithActions,
} from './xstate-behaviors.js';
export type {
  MachineConfig,
  Machine,
  MachineSnapshot,
  StateNode,
  TransitionDef,
  SendOptions,
  FSMEventData,
  StateName,
  TransitionEvent,
  GuardFunction,
  ActionFunction,
} from './types.js';
export type { XStateMachineConfig, ImportOptions } from './xstate-import.js';
