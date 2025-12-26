/**
 * FSM Types for QuarKernel
 *
 * Flexible state machine layer built on quarkernel events.
 * Prefixed events allow loose coupling and multi-machine orchestration.
 */

/**
 * State name type
 */
export type StateName = string;

/**
 * Transition event name type
 */
export type TransitionEvent = string;

/**
 * Guard function - returns true to allow transition
 */
export type GuardFunction<TContext = any> = (
  context: TContext,
  event: TransitionEvent,
  payload?: any
) => boolean;

/**
 * Action function - side effect on transition
 */
export type ActionFunction<TContext = any> = (
  context: TContext,
  event: TransitionEvent,
  payload?: any
) => void | Promise<void>;

/**
 * Transition definition
 */
export interface TransitionDef<TContext = any> {
  /** Target state */
  target: StateName;

  /** Guard condition (optional) */
  guard?: GuardFunction<TContext>;

  /** Actions to run on transition (optional) */
  actions?: ActionFunction<TContext> | ActionFunction<TContext>[];
}

/**
 * Timer/after definition for auto-transitions
 */
export interface AfterDef {
  /** Delay in milliseconds */
  delay: number;
  /** Event to send after delay */
  send: string;
}

/**
 * State node definition (state-centric format)
 */
export interface StateNode<TContext = any> {
  /** Transitions from this state: event -> target or TransitionDef */
  on?: Record<TransitionEvent, StateName | TransitionDef<TContext>>;

  /** Action on entering this state */
  entry?: ActionFunction<TContext>;

  /** Action on exiting this state */
  exit?: ActionFunction<TContext>;

  /** Auto-transition after delay: { delay: 3000, send: 'TIMER' } */
  after?: AfterDef;
}

/**
 * Machine configuration
 */
export interface MachineConfig<TContext = any> {
  /** Event prefix for this machine (e.g., 'order', 'player') */
  prefix: string;

  /** Initial state */
  initial: StateName;

  /** State definitions */
  states: Record<StateName, StateNode<TContext>>;

  /** Initial context (optional) */
  context?: TContext;

  /** Allow force transitions that bypass guards */
  allowForce?: boolean;

  /** Restore from snapshot (overrides initial/context) */
  snapshot?: MachineSnapshot<TContext>;

  /** Track transition history */
  trackHistory?: boolean;

  /** Max history entries (default: 100) */
  maxHistory?: number;
}

/**
 * Send options
 */
export interface SendOptions<TContext = any> {
  /** Force transition (bypass guards and undefined transitions) */
  force?: boolean;

  /** Target state for force transitions */
  target?: StateName;

  /** Inline guard (overrides state guard) */
  guard?: GuardFunction<TContext>;

  /** Fallback state if guard fails */
  fallback?: StateName;
}

/**
 * Serialized machine state (for persistence)
 */
export interface MachineSnapshot<TContext = any> {
  /** Current state */
  state: StateName;

  /** Machine context */
  context: TContext;

  /** Transition history (optional) */
  history?: Array<{
    from: StateName;
    to: StateName;
    event: TransitionEvent;
    timestamp: number;
  }>;
}

/**
 * Machine instance returned by useMachine()
 */
export interface Machine<TContext = any> {
  /** Current state */
  getState(): StateName;

  /** Machine context */
  getContext(): TContext;

  /** Update context */
  setContext(updater: Partial<TContext> | ((ctx: TContext) => TContext)): void;

  /**
   * Send transition event
   *
   * @returns Promise<boolean> - true if transition occurred, false otherwise
   *
   * @example
   * ```typescript
   * const transitioned = await machine.send('SUBMIT');
   * // After await, check machine.getState() for current state
   * ```
   */
  send(event: TransitionEvent, payload?: any, options?: SendOptions<TContext>): Promise<boolean>;

  /**
   * Wait until machine reaches a specific state
   *
   * @param state - Target state to wait for
   * @param options - Optional timeout
   * @returns Promise resolving when state is reached
   *
   * @example
   * ```typescript
   * // .then() receives: { state, from?, event?, context }
   * await machine.waitFor('completed');
   * await machine.waitFor('completed', { timeout: 5000 });
   * ```
   */
  waitFor(state: StateName, options?: { timeout?: number }): Promise<{
    state: StateName;
    from?: StateName;
    event?: TransitionEvent;
    context: TContext;
  }>;

  /** Check if transition is valid from current state */
  can(event: TransitionEvent): boolean;

  /** Get available transitions from current state */
  transitions(): TransitionEvent[];

  /** Machine prefix */
  readonly prefix: string;

  /** Serialize machine state to JSON */
  toJSON(): MachineSnapshot<TContext>;

  /** Restore machine state from snapshot */
  restore(snapshot: MachineSnapshot<TContext>): void;

  /** Cleanup listeners */
  destroy(): void;
}

/**
 * FSM event data emitted on kernel
 */
export interface FSMEventData {
  /** Machine prefix */
  machine: string;

  /** Current/new state */
  state: StateName;

  /** Previous state (for transition events) */
  from?: StateName;

  /** Target state (for transition events) */
  to?: StateName;

  /** Transition event name */
  event?: TransitionEvent;

  /** Event payload */
  payload?: any;

  /** Whether this was a forced transition */
  forced?: boolean;
}

/**
 * FSM events emitted on the kernel
 *
 * Pattern: {prefix}:{eventType}:{state?}
 *
 * Events emitted:
 * - {prefix}:enter:{state} - Entering a state
 * - {prefix}:exit:{state} - Exiting a state
 * - {prefix}:transition - Any transition occurred
 * - {prefix}:transition:{event} - Specific transition event
 * - {prefix}:guard:rejected - Guard rejected transition
 */
export type FSMEvents = {
  [key: `${string}:enter:${string}`]: FSMEventData;
  [key: `${string}:exit:${string}`]: FSMEventData;
  [key: `${string}:transition`]: FSMEventData;
  [key: `${string}:transition:${string}`]: FSMEventData;
  [key: `${string}:guard:rejected`]: FSMEventData;
};
