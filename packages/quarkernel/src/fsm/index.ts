/**
 * FSM Module - State Machine Layer for QuarKernel
 *
 * Two APIs available:
 *
 * 1. createMachine() - Standalone with high-level behaviors (state-centric)
 * 2. useMachine()    - Low-level with external kernel
 *
 * @example Standalone (state-centric)
 * ```ts
 * import { createMachine } from '@quazardous/quarkernel/fsm';
 *
 * const order = createMachine({
 *   id: 'order',
 *   initial: 'draft',
 *   context: { items: 0 },
 *   states: {
 *     draft: { on: { SUBMIT: 'pending' } },
 *     pending: {
 *       entry: (ctx, { log }) => log('Order pending...'),
 *       on: { APPROVE: 'confirmed' }
 *     },
 *     confirmed: {
 *       entry: (ctx, { log }) => log('Order confirmed!'),
 *     },
 *     processing: {
 *       after: { delay: 2000, send: 'COMPLETE' },
 *       on: { COMPLETE: 'done' }
 *     }
 *   }
 * });
 *
 * order.send('SUBMIT');
 * console.log(order.state);   // 'pending'
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
  StateConfig,
  BehaviorMachine,
  BehaviorFn,
  BehaviorHelpers,
  BuiltInHelpers,
  AfterDef,
} from './create-machine.js';

// Low-level API
export { useMachine, defineMachine } from './machine.js';
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
  AfterDef as AfterDefLowLevel,
} from './types.js';
