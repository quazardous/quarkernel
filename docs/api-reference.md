# API Reference

Complete API documentation for QuarKernel v2.

## Table of Contents

- [Core API](#core-api)
  - [createKernel()](#createkernel)
  - [Kernel](#kernel)
  - [KernelEvent](#kernelevent)
  - [ListenerContext](#listenercontext)
- [Composition API](#composition-api)
  - [Kernel.compose()](#kernelcompose)
  - [Composition](#composition)
  - [Context Mergers](#context-mergers)
- [Types](#types)
  - [EventMap](#eventmap)
  - [KernelOptions](#kerneloptions)
  - [ListenerOptions](#listeneroptions)
  - [CompositionOptions](#compositionoptions)
- [Errors](#errors)

---

## Core API

### createKernel()

Factory function to create a new Kernel instance.

**Signature:**
```typescript
function createKernel<Events extends EventMap = EventMap>(
  options?: KernelOptions
): Kernel<Events>
```

**Parameters:**
- `options` (optional): Configuration options for the qk. See [KernelOptions](#kerneloptions).

**Returns:** A new `Kernel<Events>` instance.

**Example:**
```typescript
import { createKernel } from '@quazardous/quarkernel';

// Basic kernel
const qk = createKernel();

// Typed kernel
interface Events {
  'user:login': { userId: string };
  'user:logout': { userId: string };
}
const typedKernel = createKernel<Events>();

// With options
const debugKernel = createKernel({
  debug: true,
  maxListeners: 50,
  errorBoundary: true,
  onError: (error, event) => {
    console.error(`Error in ${event.name}:`, error);
  }
});
```

---

### Kernel

Main event kernel class for managing listeners and emitting events.

#### Methods

##### on()

Register an event listener. Returns an unbind function for cleanup.

**Signature:**
```typescript
on<K extends keyof Events>(
  eventName: K,
  listener: ListenerFunction<Events[K]>,
  options?: ListenerOptions
): UnbindFunction
```

**Parameters:**
- `eventName`: Event name to listen for (supports wildcards like `'user:*'`, `'**'`)
- `listener`: Callback function `(event, ctx) => void | Promise<void>`
- `options` (optional): Listener configuration. See [ListenerOptions](#listeneroptions).

**Returns:** Unbind function `() => void` to remove the listener.

**Example:**
```typescript
// Basic listener
const unbind = qk.on('user:login', async (event, ctx) => {
  console.log('User logged in:', event.data.userId);
});

// With dependencies and priority
qk.on('user:login', async (event, ctx) => {
  event.context.user = await fetchUser(event.data.userId);
}, {
  id: 'fetch-user',
  priority: 10
});

qk.on('user:login', async (event, ctx) => {
  console.log('User:', event.context.user.name);
}, {
  id: 'log-user',
  after: 'fetch-user'  // Runs after 'fetch-user'
});

// Cleanup with unbind
unbind();

// AbortSignal cleanup
const controller = new AbortController();
qk.on('user:login', handler, { signal: controller.signal });
controller.abort(); // Removes listener

// Wildcard patterns
qk.on('user:*', handler);    // Matches user:login, user:logout, etc.
qk.on('**', handler);         // Matches all events
```

##### once()

Wait for an event (Promise-based).

**Signature:**
```typescript
once<K extends keyof Events>(
  event: K,
  options?: { timeout?: number }
): Promise<IKernelEvent<Events[K]>>
```

**Parameters:**
- `event`: Event name to wait for
- `options` (optional): `{ timeout?: number }` - timeout in ms (rejects on timeout)

**Returns:** `Promise<IKernelEvent>` resolving with `{ name, data, context, timestamp }`.

**Example:**
```typescript
// Wait for an event
const event = await qk.once('user:login');
console.log(event.data);    // event payload
console.log(event.context); // shared context

// With timeout
const event = await qk.once('app:ready', { timeout: 5000 });

// For callback style, use on() with once option:
qk.on('app:ready', (event) => {
  console.log('App is ready!');
}, { once: true });

// Conditional removal (predicate evaluated after execution)
qk.on('user:login', (event) => {
  event.context.count = (event.context.count || 0) + 1;
}, {
  once: (event) => event.context.count >= 3
});
```

##### off()

Remove event listener(s).

**Signature:**
```typescript
off<K extends keyof Events>(
  event: K,
  listener?: ListenerFunction<Events[K]>
): void
```

**Parameters:**
- `event`: Event name
- `listener` (optional): Specific listener to remove. If omitted, removes all listeners for the event.

**Example:**
```typescript
const handler = async (event, ctx) => { ... };

// Add listener
qk.on('user:login', handler);

// Remove specific listener
qk.off('user:login', handler);

// Remove all listeners for event
qk.off('user:login');
```

##### offAll()

Remove all listeners for all events or specific event.

**Signature:**
```typescript
offAll(event?: keyof Events): void
```

**Parameters:**
- `event` (optional): If provided, removes all listeners for this event only. If omitted, removes all listeners for all events.

**Example:**
```typescript
// Remove all listeners for specific event
qk.offAll('user:login');

// Remove ALL listeners from kernel
qk.offAll();
```

##### emit()

Emit an event and execute all matching listeners in parallel (respecting dependency order).

**Signature:**
```typescript
emit<K extends keyof Events>(
  event: K,
  data?: Events[K]
): Promise<void>
```

**Parameters:**
- `event`: Event name to emit
- `data` (optional): Event payload (typed based on EventMap)

**Returns:** Promise that resolves when all listeners complete.

**Throws:** `AggregateError` if any listeners fail and `errorBoundary: false`.

**Example:**
```typescript
// Emit with data
await qk.emit('user:login', {
  userId: '123',
  timestamp: Date.now()
});

// Emit without data
await qk.emit('app:ready');

// Handle errors
try {
  await qk.emit('user:login', data);
} catch (error) {
  // AggregateError contains all listener errors
  console.error('Listeners failed:', error.errors);
}
```

##### emitSerial()

Emit an event and execute listeners sequentially (one after another) instead of in parallel.

**Signature:**
```typescript
emitSerial<K extends keyof Events>(
  event: K,
  data?: Events[K]
): Promise<void>
```

**Parameters:**
- `event`: Event name to emit
- `data` (optional): Event payload

**Returns:** Promise that resolves when all listeners complete sequentially.

**Example:**
```typescript
// Execute listeners one by one
await qk.emitSerial('task:process', { taskId: '123' });

// Useful for async workflows where order matters
qk.on('pipeline:run', async (event, ctx) => {
  event.context.step1 = await step1();
}, { id: 'step1' });

qk.on('pipeline:run', async (event, ctx) => {
  event.context.step2 = await step2(event.context.step1);
}, { id: 'step2', after: 'step1' });

// Runs step1, waits for completion, then step2
await qk.emitSerial('pipeline:run', { id: 'job-1' });
```

##### listenerCount()

Get number of listeners for an event or total count.

**Signature:**
```typescript
listenerCount(event?: keyof Events): number
```

**Parameters:**
- `event` (optional): Event name. If omitted, returns total count across all events.

**Returns:** Number of registered listeners.

**Example:**
```typescript
qk.on('user:login', handler1);
qk.on('user:login', handler2);
qk.on('user:logout', handler3);

console.log(qk.listenerCount('user:login'));  // 2
console.log(qk.listenerCount('user:logout')); // 1
console.log(qk.listenerCount());              // 3 (total)
```

##### eventNames()

Get all event names with registered listeners.

**Signature:**
```typescript
eventNames(): (keyof Events)[]
```

**Returns:** Array of event names that have at least one listener.

**Example:**
```typescript
qk.on('user:login', handler1);
qk.on('user:logout', handler2);

console.log(qk.eventNames()); // ['user:login', 'user:logout']
```

##### debug()

Enable or disable debug mode for detailed logging.

**Signature:**
```typescript
debug(enabled: boolean): void
```

**Parameters:**
- `enabled`: `true` to enable debug mode, `false` to disable

**Example:**
```typescript
qk.debug(true);  // Enable debug logging
// Logs listener execution, timing, errors, etc.

qk.debug(false); // Disable debug logging
```

##### getExecutionErrors()

Get errors collected during the last event emission (when `errorBoundary: true`).

**Signature:**
```typescript
getExecutionErrors(): ReadonlyArray<ExecutionError>
```

**Returns:** Array of errors with metadata (listenerId, error, timestamp, eventName).

**Example:**
```typescript
const qk = createKernel({ errorBoundary: true });

qk.on('task:run', async (event, ctx) => {
  throw new Error('Failed');
}, { id: 'failing-listener' });

await qk.emit('task:run', {});

const errors = qk.getExecutionErrors();
errors.forEach(err => {
  console.log(`${err.listenerId}: ${err.error.message}`);
});
```

##### clearExecutionErrors()

Clear the collected execution errors.

**Signature:**
```typescript
clearExecutionErrors(): void
```

**Example:**
```typescript
qk.clearExecutionErrors();
console.log(qk.getExecutionErrors()); // []
```

---

### KernelEvent

Event object passed to listeners.

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Event name (readonly) |
| `data` | `T` | Event payload - immutable, typed (readonly) |
| `context` | `Record<string, any>` | Shared mutable context for passing data between listeners (readonly reference, but object is mutable) |
| `timestamp` | `number` | Event creation timestamp in milliseconds (readonly) |
| `isPropagationStopped` | `boolean` | Whether propagation was stopped (readonly) |

**Methods:**

##### stopPropagation()

Stop propagation to remaining listeners in the chain.

**Signature:**
```typescript
stopPropagation(): void
```

**Example:**
```typescript
qk.on('user:login', async (event, ctx) => {
  if (event.data.banned) {
    event.stopPropagation(); // Skip remaining listeners
    return;
  }
  // Continue processing...
});
```

---

### ListenerContext

Context object passed as second parameter to listener callbacks. Provides utilities for listener self-management.

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `id` | `string` | Unique identifier for this listener (readonly) |
| `eventName` | `string` | Event name this listener is registered for (readonly) |
| `priority` | `number` | Listener priority (higher = earlier execution) (readonly) |
| `dependencies` | `readonly string[]` | IDs of listeners that must execute first (readonly) |
| `signal` | `AbortSignal?` | AbortSignal if provided during registration (readonly) |

**Methods:**

##### off() / cancel()

Remove this listener from the kernel (both are aliases).

**Signature:**
```typescript
off(): void
cancel(): void
```

**Example:**
```typescript
qk.on('user:login', async (event, ctx) => {
  if (event.data.oneTimeToken) {
    ctx.off(); // Remove self after processing one-time token
  }
});
```

##### emit()

Emit another event from within this listener.

**Signature:**
```typescript
emit<T = any>(eventName: string, data?: T): Promise<void>
```

**Parameters:**
- `eventName`: Event to emit
- `data` (optional): Event payload

**Returns:** Promise that resolves when emitted event completes.

**Example:**
```typescript
qk.on('user:login', async (event, ctx) => {
  await ctx.emit('analytics:track', {
    action: 'login',
    userId: event.data.userId
  });
});
```

##### stopPropagation()

Stop propagation of the current event to remaining listeners.

**Signature:**
```typescript
stopPropagation(): void
```

**Throws:** Error if called outside event processing.

**Example:**
```typescript
qk.on('user:login', async (event, ctx) => {
  if (event.data.suspended) {
    ctx.stopPropagation(); // Skip remaining listeners
  }
});
```

---

## Composition API

### Kernel.compose()

Static method to create a composition that merges events from multiple kernels.

**Signature:**
```typescript
static compose<Events extends EventMap = EventMap>(
  ...args: (readonly [Kernel, EventName] | CompositionOptions)[]
): Composition<Events>
```

**Parameters:**
- `...args`: Variable arguments of `[kernel, eventName]` tuples followed by optional `CompositionOptions`

**Returns:** `Composition` instance that emits composite events.

**Example:**
```typescript
const userKernel = createKernel();
const profileKernel = createKernel();
const settingsKernel = createKernel();

// Compose multiple kernels
const composition = Kernel.compose(
  [userKernel, 'user:loaded'],
  [profileKernel, 'profile:loaded'],
  [settingsKernel, 'settings:loaded'],
  {
    merger: createNamespacedMerger(),
    bufferLimit: 50,
    reset: true
  }
);

// Listen for composite event
composition.onComposed(async (event, ctx) => {
  console.log('All sources ready');
  console.log('Merged context:', event.data.merged);
  console.log('Individual contexts:', event.data.contexts);
  console.log('Source events:', event.data.sources);
});

// Emit events on source kernels
await userKernel.emit('user:loaded', { userId: '123' });
await profileKernel.emit('profile:loaded', { name: 'Alice' });
await settingsKernel.emit('settings:loaded', { theme: 'dark' });
// → Composite event fires
```

---

### Composition

Class that merges events from multiple kernels into unified composite events.

**Constructor:**
```typescript
new Composition<Events>(
  kernels: Array<[Kernel, EventName]>,
  options?: CompositionOptions
)
```

**Factory function:**
```typescript
createComposition<Events>(
  kernels: Array<[Kernel, EventName]>,
  options?: CompositionOptions
): Composition<Events>
```

#### Methods

##### on()

Register a listener for composite events.

**Signature:**
```typescript
on<K extends keyof Events>(
  eventName: K,
  listener: ListenerFunction<Events[K]>,
  options?: ListenerOptions
): UnbindFunction
```

**Example:**
```typescript
composition.onComposed(async (event, ctx) => {
  // event.data.sources: ['user:loaded', 'profile:loaded']
  // event.data.contexts: { 'user:loaded': {...}, 'profile:loaded': {...} }
  // event.data.merged: merged context using configured merger
});
```

##### off()

Remove a listener.

**Signature:**
```typescript
off(eventName: string, listener?: Function): void
```

##### offAll()

Remove all listeners.

**Signature:**
```typescript
offAll(eventName?: keyof Events): void
```

##### emit()

Emit an event through the composition (typically not used, as composition auto-emits).

**Signature:**
```typescript
emit<K extends keyof Events>(
  eventName: K,
  data?: Events[K]
): Promise<void>
```

##### getContext()

Get merged context from buffered events without emitting.

**Signature:**
```typescript
getContext(): Record<string, any> | null
```

**Returns:** Merged context or `null` if not all sources have fired yet.

**Example:**
```typescript
const merged = composition.getContext();
if (merged) {
  console.log('Current merged state:', merged);
}
```

##### getBuffer()

Get buffered events for a specific source (debugging).

**Signature:**
```typescript
getBuffer(eventName: EventName): ReadonlyArray<BufferedEvent> | undefined
```

**Returns:** Array of buffered events or `undefined` if source not found.

##### clearBuffers()

Clear all buffered events.

**Signature:**
```typescript
clearBuffers(): void
```

##### getConflicts()

Get conflicts detected during the last merge operation.

**Signature:**
```typescript
getConflicts(): ReadonlyArray<ConflictInfo>
```

**Returns:** Array of conflicts (empty if none detected).

**Example:**
```typescript
composition.onComposed(async (event, ctx) => {
  const conflicts = composition.getConflicts();
  conflicts.forEach(conflict => {
    console.warn(`Key "${conflict.key}" conflicts:`, conflict.sources);
  });
});
```

##### dispose()

Cleanup all subscriptions and listeners.

**Signature:**
```typescript
dispose(): void
```

**Example:**
```typescript
// When done with composition
composition.dispose();
```

##### listenerCount()

Get number of listeners.

**Signature:**
```typescript
listenerCount(eventName?: keyof Events): number
```

##### eventNames()

Get all event names with listeners.

**Signature:**
```typescript
eventNames(): (keyof Events)[]
```

##### debug()

Enable/disable debug mode.

**Signature:**
```typescript
debug(enabled: boolean): void
```

---

### Context Mergers

Strategies for merging contexts from multiple source events.

#### ContextMerger Interface

**Interface:**
```typescript
interface ContextMerger {
  merge(
    contexts: Map<EventName, Record<string, any>>,
    sources: EventName[]
  ): Record<string, any>;

  mergeWithConflicts(
    contexts: Map<EventName, Record<string, any>>,
    sources: EventName[]
  ): MergeResult;
}
```

**Custom implementation example:**
```typescript
const customMerger: ContextMerger = {
  merge(contexts, sources) {
    const result = {};
    for (const [eventName, context] of contexts) {
      Object.assign(result, context);
    }
    return result;
  },

  mergeWithConflicts(contexts, sources) {
    const result = {};
    const conflicts = [];
    // ... conflict detection logic
    return { context: result, conflicts };
  }
};
```

#### Built-in Mergers

##### createNamespacedMerger()

Prefixes all context keys with source event name. Prevents conflicts by design (default merger).

**Signature:**
```typescript
createNamespacedMerger(): ContextMerger
```

**Behavior:**
```typescript
// Input:
//   'user:loaded':    { count: 1, name: "Alice" }
//   'profile:loaded': { count: 2, city: "NYC" }
//
// Output:
{
  "user:loaded:count": 1,
  "user:loaded:name": "Alice",
  "profile:loaded:count": 2,
  "profile:loaded:city": "NYC"
}
```

**Example:**
```typescript
import { createNamespacedMerger } from '@quazardous/quarkernel';

const composition = Kernel.compose(
  [kernel1, 'event1'],
  [kernel2, 'event2'],
  { merger: createNamespacedMerger() }
);
```

##### createOverrideMerger()

Last-write-wins strategy. Later events override earlier events for same keys.

**Signature:**
```typescript
createOverrideMerger(): ContextMerger
```

**Behavior:**
```typescript
// Sources order: ['user:loaded', 'profile:loaded']
// Input:
//   'user:loaded':    { count: 1, name: "Alice" }
//   'profile:loaded': { count: 2, city: "NYC" }
//
// Output:
{
  count: 2,      // profile:loaded overrode user:loaded
  name: "Alice", // from user:loaded (no conflict)
  city: "NYC"    // from profile:loaded (no conflict)
}
```

**Example:**
```typescript
import { createOverrideMerger } from '@quazardous/quarkernel';

const composition = Kernel.compose(
  [kernel1, 'event1'],
  [kernel2, 'event2'],
  {
    merger: createOverrideMerger(),
    onConflict: (conflict) => {
      console.warn(`Key "${conflict.key}" overridden by ${conflict.sources[conflict.sources.length - 1]}`);
    }
  }
);
```

---

## Types

### EventMap

Type map defining event names and their data types.

**Definition:**
```typescript
type EventMap = Record<string, any>;
```

**Example:**
```typescript
interface MyEvents extends EventMap {
  'user:login': { userId: string; timestamp: number };
  'user:logout': { userId: string };
  'app:ready': undefined;
  'data:update': { id: string; value: any };
}

const qk = createKernel<MyEvents>();
```

---

### KernelOptions

Configuration options for kernel initialization.

**Interface:**
```typescript
interface KernelOptions {
  delimiter?: string;
  wildcard?: boolean;
  maxListeners?: number;
  debug?: boolean;
  errorBoundary?: boolean;
  onError?: (error: Error, event: KernelEvent) => void;
  contextMerger?: ContextMerger | ContextMergerFunction;
  onContextConflict?: (conflict: ConflictInfo) => void;
}
```

**Properties:**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `delimiter` | `string` | `':'` | Event name delimiter for namespacing |
| `wildcard` | `boolean` | `true` | Enable wildcard pattern matching |
| `maxListeners` | `number` | `Infinity` | Max listeners per event (0 = unlimited, triggers warning when exceeded) |
| `debug` | `boolean` | `false` | Enable debug logging |
| `errorBoundary` | `boolean` | `true` | Continue executing listeners even if one fails |
| `onError` | `function` | `console.error` | Error handler for listener exceptions |
| `contextMerger` | `ContextMerger \| function` | `undefined` | Default context merger for composite events |
| `onContextConflict` | `function` | `undefined` | Callback when context keys conflict during merge |

**Example:**
```typescript
const qk = createKernel({
  delimiter: '.',
  wildcard: true,
  maxListeners: 50,
  debug: process.env.NODE_ENV === 'development',
  errorBoundary: true,
  onError: (error, event) => {
    logger.error(`Error in ${event.name}:`, error);
    Sentry.captureException(error);
  }
});
```

---

### ListenerOptions

Options for registering a listener.

**Interface:**
```typescript
interface ListenerOptions {
  id?: string;
  after?: string | string[];
  priority?: number;
  once?: boolean | PredicateFunction;
  signal?: AbortSignal;
}
```

**Properties:**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `id` | `string` | auto-generated | Unique identifier for dependency resolution |
| `after` | `string \| string[]` | `[]` | Dependencies - listener IDs that must execute first |
| `priority` | `number` | `0` | Priority - higher values execute earlier (within same dependency level) |
| `once` | `boolean \| PredicateFunction` | `false` | Remove listener after execution. If predicate, evaluated AFTER execution. |
| `signal` | `AbortSignal` | `undefined` | AbortSignal for cleanup |

**Example:**
```typescript
// Basic options
qk.on('user:login', handler, {
  id: 'auth-handler',
  priority: 10
});

// Dependencies
qk.on('user:login', handler, {
  id: 'analytics',
  after: ['auth-handler', 'session-handler']
});

// Conditional once
qk.on('task:run', handler, {
  once: (event) => event.context.attempts >= 3
});

// AbortSignal
const controller = new AbortController();
qk.on('user:login', handler, {
  signal: controller.signal
});
controller.abort(); // Removes listener
```

---

### CompositionOptions

Options for creating a composition.

**Interface:**
```typescript
interface CompositionOptions {
  merger?: ContextMerger;
  bufferLimit?: number;
  reset?: boolean;
  onConflict?: (conflict: ConflictInfo) => void;
}
```

**Properties:**

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `merger` | `ContextMerger` | `NamespacedMerger` | Context merger strategy |
| `bufferLimit` | `number` | `100` | Maximum events to buffer per source |
| `reset` | `boolean` | `true` | Reset buffer after emitting composite event |
| `onConflict` | `function` | `undefined` | Callback for context conflicts (debug) |

**Example:**
```typescript
const composition = Kernel.compose(
  [kernel1, 'event1'],
  [kernel2, 'event2'],
  {
    merger: createOverrideMerger(),
    bufferLimit: 50,
    reset: true,
    onConflict: (conflict) => {
      console.warn(`Context key conflict: ${conflict.key}`);
      console.warn(`Sources: ${conflict.sources.join(', ')}`);
      console.warn(`Values:`, conflict.values);
    }
  }
);
```

---

## Errors

### CircularDependencyError

Thrown when circular dependencies are detected in listener graph.

**Example:**
```typescript
qk.on('event', handler1, { id: 'A', after: 'B' });
qk.on('event', handler2, { id: 'B', after: 'A' });
// Throws: CircularDependencyError: Circular dependency detected: A -> B -> A
```

### MissingDependencyError

Thrown when a listener depends on a non-existent listener.

**Example:**
```typescript
qk.on('event', handler, { id: 'A', after: 'nonexistent' });
await qk.emit('event');
// Throws: MissingDependencyError: Listener "A" depends on missing listener "nonexistent"
```

### MaxListenersExceededError

Warning (not thrown) when listener count exceeds `maxListeners` option.

**Example:**
```typescript
const qk = createKernel({ maxListeners: 2 });
qk.on('event', handler1);
qk.on('event', handler2);
qk.on('event', handler3);
// Console warning: MaxListenersExceeded: Event "event" has 3 listeners (limit: 2)
```

---

## Advanced Patterns

### Priority-Based Ordering

Control execution order with priority (higher = earlier):

```typescript
qk.on('render', handler1, { priority: 10 });  // Runs first
qk.on('render', handler2, { priority: 5 });   // Runs second
qk.on('render', handler3, { priority: 0 });   // Runs third (default)
```

### Dependency Chains

Build complex workflows with dependencies:

```typescript
qk.on('pipeline', step1, { id: 'step1' });
qk.on('pipeline', step2, { id: 'step2', after: 'step1' });
qk.on('pipeline', step3, { id: 'step3', after: 'step2' });
qk.on('pipeline', step4, { id: 'step4', after: ['step2', 'step3'] });

// Execution order: step1 → step2 → step3 → step4
```

### Shared Context Pipeline

Pass data through listener chain:

```typescript
qk.on('user:create', async (event, ctx) => {
  event.context.user = await createUser(event.data);
}, { id: 'create' });

qk.on('user:create', async (event, ctx) => {
  event.context.profile = await createProfile(event.context.user);
}, { id: 'profile', after: 'create' });

qk.on('user:create', async (event, ctx) => {
  await sendWelcomeEmail(event.context.user, event.context.profile);
}, { id: 'email', after: ['create', 'profile'] });
```

### Error Handling Strategies

**Strategy 1: Error Boundary (continue on error)**
```typescript
const qk = createKernel({
  errorBoundary: true,
  onError: (error, event) => {
    logger.error(`Listener failed for ${event.name}:`, error);
  }
});

// All listeners execute even if some fail
```

**Strategy 2: Fail Fast (stop on first error)**
```typescript
const qk = createKernel({
  errorBoundary: false
});

try {
  await qk.emit('critical:operation', data);
} catch (error) {
  // AggregateError with all failures
  console.error('Operation failed:', error.errors);
}
```

### Conditional Listeners

Remove listener based on runtime conditions:

```typescript
qk.on('poll:data', async (event, ctx) => {
  const data = await fetchData();
  event.context.result = data;

  if (data.complete) {
    ctx.off(); // Stop polling when complete
  }
}, {
  once: (event) => event.context.result?.complete === true
});
```

---

## See Also

- [Getting Started Guide](./getting-started.md)
- [Migration Guide v1→v2](./migration-v1-to-v2.md)
- [Demos](../demos/)
