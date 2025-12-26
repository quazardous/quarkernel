/**
 * KernelEvent - Custom event implementation for QuarKernel
 *
 * NOT based on native Event/EventTarget for design reasons:
 * - Need shared mutable context between listeners
 * - Need dependency-ordered execution
 * - Simpler API without DOM baggage
 */

/**
 * Event propagation control for listener execution
 */
export class KernelEvent<T = unknown> {
  /**
   * Event name/type
   */
  readonly name: string;

  /**
   * Event payload (typed, immutable)
   */
  readonly data: T;

  /**
   * Shared mutable context for passing data between listeners
   */
  readonly context: Record<string, any>;

  /**
   * Event creation timestamp (milliseconds since epoch)
   */
  readonly timestamp: number;

  /**
   * Internal flag: stop propagation to remaining listeners
   * @private
   */
  private _propagationStopped = false;

  constructor(name: string, data: T, context: Record<string, any> = {}) {
    this.name = name;
    this.data = data;
    this.context = context;
    this.timestamp = Date.now();
  }

  /**
   * Stop propagation to remaining listeners in the chain
   * Similar to DOM Event.stopPropagation()
   *
   * After calling this, no more listeners will execute.
   */
  stopPropagation = (): void => {
    this._propagationStopped = true;
  };

  /**
   * Check if propagation was stopped
   * @internal
   */
  get isPropagationStopped(): boolean {
    return this._propagationStopped;
  }
}
