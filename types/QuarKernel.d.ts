export type eventListenerCallback = (e?: QuarKernelEvent) => any;
export type composeTriggerCallback = (stack?: {
    [x: string]: Array<{
        e: QuarKernelEvent;
        p: Promise<QuarKernelEvent>;
    }>;
}) => any;
export type composeEventFactory = (stack?: {
    [x: string]: Array<QuarKernelEvent>;
}) => QuarKernelEvent;
export type eventCallback = (e?: QuarKernelEvent, target?: string) => any;
export type eventAsyncCallback = () => any;
/**
 * @callback eventListenerCallback
 * @param {QuarKernelEvent} [e]
 */
/**
 * @callback composeTriggerCallback
 * @param {Object.<string, Array<{e:QuarKernelEvent,p:Promise<QuarKernelEvent>}>>} [stack] Stack of components events/promises
 */
/**
 * @callback composeEventFactory
 * @param {Object.<string, Array<QuarKernelEvent>>} [stack] Stack of components events
 * @return {QuarKernelEvent}
 */
/**
 * @callback eventCallback
 * @param {QuarKernelEvent} [e] The event
 * @param {string} [target] The current target
 */
/**
 * @callback eventAsyncCallback
 * @async
 * @param {QuarKernelEvent} [e] The event
 * @param {string} [target] The current target
 */
export class QuarKernel {
    constructor(options?: {});
    /**
     * For each event type, list of valid target sequences.
     * ie sequence [A, B] means A must be fired before B.
     * @type {Array<string,Array<Array<string>>>}
     * @private
     */
    private seqGraph;
    /**
     * For each event type and target list of direct targets dependencies.
     * @type {Array<string,Array<string,Array<string>>>}
     * @private
     */
    private dependencies;
    /**
     * @type {Array<string,Array<string,Array<eventCallback|eventAsyncCallback>>}
     * @private
     */
    private callbacks;
    /**
     * @private
     */
    private targetAutoId;
    /**
     * @type {Array<CompositeTrigger>}
     * @private
     */
    private compositeTriggers;
    /**
     * Register for some event.
     *
     * @param {string} type Type of event to listen to
     * @param {eventCallback|eventAsyncCallback} callback
     * @param {string} [target] A unique code for the target listener
     * @param {string|Array<string>} [dependencies] A list of targets dependencies
     * In the event scope, callbacks will be fired according to dependencies
     */
    addEventListener(type: string, callback: eventCallback | eventAsyncCallback, target?: string, dependencies?: string | Array<string>): void;
    /**
     * Create a composite trigger.
     *
     * @param {Array<string>} components list of event types
     * @param {composeTriggerCallback} callback something to do
     */
    addCompositeTrigger(components: Array<string>, callback: composeTriggerCallback, reset?: boolean): void;
    /**
     * Create a composite event.
     *
     * @param {Array<string>} components list of event types
     * @param {composeEventFactory} factory event factory
     */
    addCompositeEvent(components: Array<string>, factory: composeEventFactory, reset?: boolean): void;
    /**
     * @param {QuarKernelEvent} e
     * @param {Promise<QuarKernelEvent>} p
     * @return {Promise<QuarKernelEvent>}
     * @private
     */
    private composeTrigger;
    /**
     * Dispatch an event.
     *
     * @param {QuarKernelEvent} e The event
     * @return {Promise<QuarKernelEvent>}
     */
    dispatchEvent(e: QuarKernelEvent): Promise<QuarKernelEvent>;
    /**
     * @param {string} type
     * @param {string} target
     * @return {Array<string>}
     * @private
     */
    private getTargetDependencies;
}
export class QuarKernelEvent {
    /**
     * @param {string} type Type of the event
     * @param {Object} [param] Parameters for this event
     * @param {Object} [context] Modifiable context for this event
     */
    constructor(type: string, param?: any, context?: any);
    type: string;
    param: any;
    context: any;
}
