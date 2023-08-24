/* eslint-disable no-plusplus */
import toposort from 'toposort';

class GraphNode {
  /**
   * @param {string} target 
   * @param {string} name 
   * @param {Array<string>} requires 
   * @param {eventListenerCallback|async eventListenerCallback} callback 
   */
  constructor(target, name, requires, callback) {
    /**
     * @type {string}
     */
    this.target = target;
    /**
     * @type {string}
     */
    this.name = name;
    /**
     * @type {Array<string>}
     */
    this.requires = requires;
    /**
     * @type {eventListenerCallback|async eventListenerCallback}
     */
    this.callback = callback;
  }
}

class GraphNodeProcessor {
  /**
   * @param {Array<GraphNode>} nodes 
   */
  constructor(nodes) {
    /**
     * @type {Object.<string, {promise:Promise<QuarKernelEvent>|null,node:GraphNode}>}
     */
    this.processMap = {};
    /**
     * @type {Array<GraphNode>} nodes 
     */
    this.nodes = nodes;
    nodes.forEach(n => {
      this.processMap[n.name] = {
        promise: null,
        node: n
      };
    });
  }

  /**
   * @param  {QuarKernelEvent} e
   * @return {Promise<QuarKernelEvent>}
   * @private
   */
  processAll(e) {
    return Promise.all(
      this.nodes.map(n => this.process(n, e))
    ).then(() => e);
  }

  /**
   * @param  {GraphNode} node 
   * @param  {QuarKernelEvent} e
   * @return {Promise<*>} 
   * @private
   */
  process(node, e) {
    const process = this.processMap[node.name];
    if (!process.promise) {
      let then = null;
      if (node.callback.constructor.name === 'AsyncFunction') {
        // handle async
        then = () => node.callback(e, node.target);
      } else {
        then = () => new Promise((resolve) => {
          node.callback(e, node.target);
          resolve();
        });
      }
      process.promise = this.processDependencies(node, e).then(then);
    }
    return process.promise;
  }

  /**
   * @param  {GraphNode} node 
   * @param  {QuarKernelEvent} e
   * @return {Promise<*>} 
   * @private
   */
  processDependencies(node, e) {
    if (node.requires.length) {
      const promises = [];
      this.nodes.forEach(n => {
        if (node.requires.includes(n.target)) {
          promises.push(this.process(n, e));
        }
      });
      return Promise.all(promises);
    }
    return Promise.resolve();
  }
}

class QuarKernelEvent {
  /**
   * @param {string} type Type of the event
   * @param {Object} [param] Parameters for this event
   * @param {Object} [context] Modifiable context for this event
   */
  constructor(type, param, context) {
    this.type = type;
    this.param = param || {};
    this.context = context || {};
  }
}

// /**
//  * @typedef {Object} Person
//  * @property {string} name how the person is called
//  * @property {number} age how many years the person lived
//  */

/**
 * @private
 */
class CompositeTrigger {
  /**
   * @param {Array<string>} components 
   * @param {*} callback 
   */
  constructor(components, callback, reset) {
    this.components = components;
    this.callback = callback;
    this.reset = reset;
    /**
     * @type {Object.<string, Array<{e:QuarKernelEvent,p:Promise<QuarKernelEvent>}>>}
     */
    this.eventPromiseStack = {};
  }

  /**
   * @param {QuarKernelEvent} e 
   * @param {Promise<*>} p
   * @return {Promise<*>|null}
   * @private
   */
  compose(e, p) {
    if (!this.components.includes(e.type)) {
      return;
    }
    if (typeof this.eventPromiseStack[e.type] === 'undefined') {
      this.eventPromiseStack[e.type] = [];
    }
    this.eventPromiseStack[e.type].push({e, p});
    
    let allComponents = true;
    this.components.forEach((type) => {
      if (typeof this.eventPromiseStack[e.type] === 'undefined') {
        allComponents = false;
      }
    });

    if (!allComponents) {
      return null;
    }

    // we got all components !
    const stack = this.eventPromiseStack;
    if (this.reset) {
      this.eventPromiseStack = {};
    }
    return new Promise((resolve) => {
      resolve(this.callback(stack));
    });
  }
}

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

class QuarKernel {
  constructor(options = {}) {
    /**
     * For each event type, list of valid target sequences.
     * ie sequence [A, B] means A must be fired before B.
     * @type {Array<string,Array<Array<string>>>}
     * @private
     */
    this.seqGraph = {};
    /**
     * For each event type and target list of direct targets dependencies.
     * @type {Array<string,Array<string,Array<string>>>}
     * @private
     */
    this.dependencies = {};
    /**
     * @type {Array<string,Array<string,Array<eventCallback|eventAsyncCallback>>}
     * @private
     */
    this.callbacks = {};
    /**
     * @private
     */
    this.targetAutoId = 0;
    /**
     * @type {Array<CompositeTrigger>}
     * @private
     */
    this.compositeTriggers = [];
  }

  /**
   * Register for some event.
   *
   * @param {string} type Type of event to listen to
   * @param {eventCallback|eventAsyncCallback} callback
   * @param {string} [target] A unique code for the target listener
   * @param {string|Array<string>} [dependencies] A list of targets dependencies
   * In the event scope, callbacks will be fired according to dependencies
   */
  addEventListener(type, callback, target, dependencies = []) {
    if (!target) {
      target = `.auto.${this.targetAutoId}`;
      this.targetAutoId++;
    }
    let deps = dependencies;
    if (!Array.isArray(deps)) {
      deps = [deps];
    }
    if (typeof this.seqGraph[type] === 'undefined') {
      this.seqGraph[type] = [];
    }
    deps.forEach((dep) => {
      this.seqGraph[type].push([dep, target]);
    });
    if (typeof this.callbacks[type] === 'undefined') {
      this.callbacks[type] = {};
    }
    if (typeof this.callbacks[type][target] === 'undefined') {
      this.callbacks[type][target] = [];
    }
    this.callbacks[type][target].push(callback);
  }

  /**
   * Create a composite trigger.
   * 
   * @param {Array<string>} components list of event types
   * @param {composeTriggerCallback} callback something to do
   */
  addCompositeTrigger(components, callback, reset = true) {
    this.compositeTriggers.push(new CompositeTrigger(components, callback, reset));
  }

  /**
   * Create a composite event.
   * 
   * @param {Array<string>} components list of event types
   * @param {composeEventFactory} factory event factory
   */
  addCompositeEvent(components, factory, reset = true) {
    this.addCompositeTrigger(components, (stack) => {
      const eventStack = {};
      const list = [];
      for (const type in stack) {
        eventStack[type] = [];
        stack[type].forEach((item) => {
          list.push(item.p);
          eventStack[type].push(item.e);
        })
      }
      const self = this;
      Promise.all(list).then(() => {
        // dispatch after all event promises
        self.dispatchEvent(factory(eventStack));
      });
    }, reset);
  }

  /**
   * @param {QuarKernelEvent} e 
   * @param {Promise<QuarKernelEvent>} p
   * @return {Promise<QuarKernelEvent>}
   * @private
   */
  composeTrigger(e, p) {
    const list = [];
    this.compositeTriggers.forEach((ct) => {
      const ctp = ct.compose(e, p);
      if (ctp) {
        list.push(ctp);
      }
    });
    if (list.length > 0) {
      p = p.then(() => Promise.all(list).then(() => e))
    }
    return p;
  }

  /**
   * Dispatch an event.
   *
   * @param {QuarKernelEvent} e The event
   * @return {Promise<QuarKernelEvent>}
   */
  dispatchEvent(e) {
    if (!(e instanceof QuarKernelEvent)) {
      throw new Error('Not a QuarKernelEvent');
    }
    if (typeof this.callbacks[e.type] === 'undefined') {
      // no callback registered
      return this.composeTrigger(e, Promise.resolve(e));
    }
    if (typeof this.seqGraph[e.type] !== 'undefined') {
      // using toposort to early detect dependencies loop
      toposort(this.seqGraph[e.type]);
    }

    const nodes = [];

    Object.keys(this.callbacks[e.type]).forEach((target) => {
      this.callbacks[e.type][target].forEach((callback, i) => {
        nodes.push(new GraphNode(
          target,
          `${target}.${i}`, // each callback gets a node
          this.getTargetDependencies(e.type, target),
          callback
        ));
      });
    });

    return this.composeTrigger(e, (new GraphNodeProcessor(nodes)).processAll(e));
  }

  /**
   * @param {string} type
   * @param {string} target
   * @return {Array<string>}
   * @private
   */
  getTargetDependencies(type, target) {
    if (typeof this.dependencies[type] === 'undefined') {
      this.dependencies[type] = {};
    }
    if (typeof this.dependencies[type][target] === 'undefined') {
      this.dependencies[type][target] = [];
      if (typeof this.seqGraph[type] !== 'undefined') {
        this.seqGraph[type].forEach((seq) => {
          if (seq[1] === target) {
            this.dependencies[type][target].push(seq[0]);
          }
        });
        // unique trick
        this.dependencies[type][target] = [...new Set(this.dependencies[type][target])];
      }
    }
    return this.dependencies[type][target];
  }
}

export { QuarKernel, QuarKernelEvent };
