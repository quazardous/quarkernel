# Migration Guide: QuarKernel v1 to v2

This guide helps you upgrade from QuarKernel v1 to v2. Version 2 is a complete TypeScript rewrite with breaking changes that eliminate anti-patterns and improve developer experience.

## Table of Contents

- [Why Upgrade?](#why-upgrade)
- [Breaking Changes Summary](#breaking-changes-summary)
- [Migration Checklist](#migration-checklist)
- [API Changes](#api-changes)
- [Code Examples: Before & After](#code-examples-before--after)
- [New Features in v2](#new-features-in-v2)
- [Troubleshooting](#troubleshooting)

---

## Why Upgrade?

QuarKernel v2 offers significant improvements:

- **TypeScript-first** with full type safety
- **Cleaner API** - no more confusing `this` binding or positional arguments
- **Better performance** - zero dependencies, optimized internals
- **Modern patterns** - arrow functions, AbortSignal, async/await
- **Memory leak protection** - auto-cleanup helpers and debug warnings
- **Framework adapters** - Vue, React, Svelte with auto-cleanup
- **Improved composition** - explicit context merge strategies

---

## Breaking Changes Summary

| Category | v1 | v2 | Impact |
|----------|----|----|--------|
| **Class name** | `QuarKernel` | `createKernel()` factory | HIGH |
| **Event creation** | `new QuarKernelEvent(type, param, context)` | `qk.emit(type, data)` | HIGH |
| **Listener registration** | `addEventListener(type, cb, target, deps)` | `on(type, cb, { id, after })` | HIGH |
| **Event dispatch** | `dispatchEvent(event)` | `emit(eventName, data)` | HIGH |
| **Event object** | `e.param`, `e.context` | `e.data`, `e.context` | MEDIUM |
| **Listener signature** | `(e, target) => void` | `(event, ctx) => void` | MEDIUM |
| **Composite events** | `addCompositeEvent(types, factory)` | `compose(types, factory, options)` | MEDIUM |
| **Unbind** | Manual tracking required | Returns unbind function | LOW |
| **Wildcard support** | Not available | `'user:*'`, `'**'` supported | NEW |
| **AbortSignal** | Not available | `signal` option for cleanup | NEW |

---

## Migration Checklist

### Step 1: Update Dependencies

```bash
# Remove v1
npm uninstall @quazardous/quarkernel

# Install v2
npm install @quazardous/quarkernel@^2.0.0
```

**Dependencies removed in v2:**
- `toposort` (now internal implementation)

### Step 2: Update Imports

```typescript
// v1
import { QuarKernel, QuarKernelEvent as QKE } from '@quazardous/quarkernel';

// v2
import { createKernel } from '@quazardous/quarkernel';
// No need to import event class - events created via emit()
```

### Step 3: Convert Class Instantiation

```typescript
// v1
const qk = new QuarKernel();

// v2
const qk = createKernel();
```

### Step 4: Update Event Listeners

See [API Changes](#api-changes) for detailed conversion patterns.

### Step 5: Update Event Dispatching

Replace `dispatchEvent(new QKE(...))` with `emit(...)` - see examples below.

### Step 6: Update Composite Events

Replace `addCompositeEvent()` with `compose()` - see [Composite Events](#composite-events).

### Step 7: Test & Validate

Run your test suite to catch any remaining issues. Use TypeScript strict mode to catch type errors.

---

## API Changes

### Kernel Creation

**v1:**
```javascript
import { QuarKernel } from '@quazardous/quarkernel';
const qk = new QuarKernel();
```

**v2:**
```typescript
import { createKernel } from '@quazardous/quarkernel';
const qk = createKernel();

// With TypeScript types
interface Events {
  'user:login': { userId: string };
  'user:logout': { userId: string };
}
const qk = createKernel<Events>();
```

**Migration notes:**
- Factory function replaces `new` instantiation
- TypeScript generic provides full type safety

---

### Event Listener Registration

**v1:**
```javascript
// Basic listener
qk.addEventListener('my_event', (e) => {
  console.log(e.param);
});

// Named listener with dependencies
qk.addEventListener('my_event', async (e) => {
  e.context.needed = await fetchData();
}, 'foo');

qk.addEventListener('my_event', (e) => {
  useData(e.context.needed);
}, 'bar', 'foo');  // bar depends on foo
```

**v2:**
```typescript
// Basic listener
const unbind = qk.on('my_event', (event, ctx) => {
  console.log(event.data);
});

// Named listener with dependencies
qk.on('my_event', async (event, ctx) => {
  event.context.needed = await fetchData();
}, { id: 'foo' });

qk.on('my_event', (event, ctx) => {
  useData(event.context.needed);
}, { id: 'bar', after: 'foo' });  // bar depends on foo
```

**Migration notes:**
- Method renamed: `addEventListener` → `on`
- Arguments changed: positional `(type, cb, target, deps)` → named options `(type, cb, { id, after })`
- Listener signature: `(e, target)` → `(event, ctx)`
- Event payload: `e.param` → `event.data`
- Returns unbind function for cleanup
- Second parameter is `ListenerContext` with utilities (`ctx.id`, `ctx.off()`, `ctx.emit()`)

---

### Event Dispatching

**v1:**
```javascript
import { QuarKernelEvent as QKE } from '@quazardous/quarkernel';

// Dispatch with parameters
const event = new QKE('my_event', { userId: '123' });
await qk.dispatchEvent(event);

// With custom context
const event2 = new QKE('my_event', { userId: '123' }, { custom: 'data' });
await qk.dispatchEvent(event2);
```

**v2:**
```typescript
// Dispatch with data
await qk.emit('my_event', { userId: '123' });

// Context is created automatically, mutate in listeners
qk.on('my_event', (event, ctx) => {
  event.context.custom = 'data';  // Listeners modify context
});
await qk.emit('my_event', { userId: '123' });
```

**Migration notes:**
- No need to instantiate event objects
- Method renamed: `dispatchEvent` → `emit`
- Data passed directly as second argument
- Context initialized empty, modified by listeners
- Cannot pre-populate context (design decision to enforce listener-based context building)

---

### Event Object Structure

**v1:**
```javascript
qk.addEventListener('event', (e, target) => {
  console.log(e.type);       // Event name
  console.log(e.param);      // Event parameters
  console.log(e.context);    // Shared context
  console.log(target);       // Listener target name
});
```

**v2:**
```typescript
qk.on('event', (event, ctx) => {
  console.log(event.name);      // Event name (changed from 'type')
  console.log(event.data);      // Event data (changed from 'param')
  console.log(event.context);   // Shared mutable context
  console.log(event.timestamp); // Timestamp (new)

  console.log(ctx.id);          // Listener ID (moved to ctx)
  ctx.stopPropagation();        // Stop remaining listeners
  ctx.off();                    // Remove self
  await ctx.emit('other', {});  // Emit another event
});
```

**Migration notes:**
- `e.type` → `event.name`
- `e.param` → `event.data`
- `target` removed, use `ctx.id` instead
- New: `event.timestamp`, `ctx` utilities

---

### Unsubscribing Listeners

**v1:**
```javascript
// Manual tracking required
const listeners = [];
listeners.push({ type: 'event', cb: handler });
qk.addEventListener('event', handler);

// Later: no built-in way to remove specific listener
// Had to track manually and recreate kernel
```

**v2:**
```typescript
// Unbind function returned
const unbind = qk.on('event', handler);

// Later: clean up
unbind();

// Or remove all listeners for event
qk.off('event');

// Or remove all listeners
qk.offAll();
```

**Migration notes:**
- `on()` returns unbind function
- New: `off(eventName)` removes all listeners for event
- New: `offAll()` removes all listeners

---

### Composite Events

**v1:**
```javascript
qk.addCompositeEvent(['A', 'B'], (stack) => {
  return new QKE('C');
});

qk.dispatchEvent(new QKE('A'));
qk.dispatchEvent(new QKE('B'));  // Auto-dispatches C
```

**v2:**
```typescript
qk.compose(['A', 'B'], (events) => ({
  type: 'C',
  data: {
    fromA: events['A'][0].data,
    fromB: events['B'][0].data
  }
}));

await qk.emit('A', { x: 1 });
await qk.emit('B', { y: 2 });  // Auto-emits C
```

**Migration notes:**
- Method renamed: `addCompositeEvent` → `compose`
- Factory signature changed: `(stack)` → `(events)` (clearer naming)
- Factory returns plain object `{ type, data }` instead of `QuarKernelEvent` instance
- Events indexed by name: `events['A']` is array of events
- New: Context merge strategies via `contextMerger` option

#### Context Merging Strategies (New in v2)

**v2:**
```typescript
import { NamespacedMerger, DeepMerger } from '@quazardous/quarkernel';

// Keep contexts separate by event name (recommended)
qk.compose(['A', 'B'], factory, {
  contextMerger: new NamespacedMerger()
  // Result: { 'A': { ... }, 'B': { ... } }
});

// Deep merge contexts
qk.compose(['A', 'B'], factory, {
  contextMerger: new DeepMerger()
  // Result: merged nested objects
});

// Custom merger
qk.compose(['A', 'B'], factory, {
  contextMerger: (contexts) => ({ custom: 'merge' })
});
```

**Migration notes:**
- v1 had no explicit context merge strategy (implicit shallow merge)
- v2 requires explicit choice via `contextMerger` option
- Default: `NamespacedMerger` (avoids conflicts)

---

### Wildcards (New in v2)

**Not available in v1.**

**v2:**
```typescript
// Listen to all user events
qk.on('user:*', (event, ctx) => {
  console.log(`User event: ${event.name}`);
});

// Listen to everything
qk.on('**', (event, ctx) => {
  console.log(`Any event: ${event.name}`);
});

// Emitted events match patterns
await qk.emit('user:login', {});    // Matches 'user:*' and '**'
await qk.emit('user:logout', {});   // Matches 'user:*' and '**'
await qk.emit('config:load', {});   // Matches '**' only
```

**Migration notes:**
- No equivalent in v1
- Use for cross-cutting concerns (logging, analytics, debugging)

---

### AbortSignal Support (New in v2)

**Not available in v1.**

**v2:**
```typescript
const controller = new AbortController();

// Auto-cleanup when signal aborts
qk.on('event', handler, {
  signal: controller.signal
});

// Later: cleanup
controller.abort();  // Removes all listeners with this signal
```

**Migration notes:**
- Modern cleanup pattern
- Integrates with framework lifecycles (Vue, React)
- No equivalent in v1 (manual cleanup required)

---

## Code Examples: Before & After

### Example 1: Basic Event Flow

**v1:**
```javascript
import { QuarKernel, QuarKernelEvent as QKE } from '@quazardous/quarkernel';

const qk = new QuarKernel();

qk.addEventListener('my_event', (e) => {
  console.log('Received:', e.param);
});

qk.addEventListener('my_event', async (e) => {
  e.context.result = await fetchData(e.param);
}, 'fetcher');

qk.addEventListener('my_event', (e) => {
  saveData(e.context.result);
}, 'saver', 'fetcher');

await qk.dispatchEvent(new QKE('my_event', { id: '123' }));
```

**v2:**
```typescript
import { createKernel } from '@quazardous/quarkernel';

interface Events {
  'my_event': { id: string };
}

const qk = createKernel<Events>();

qk.on('my_event', (event, ctx) => {
  console.log('Received:', event.data);
});

qk.on('my_event', async (event, ctx) => {
  event.context.result = await fetchData(event.data);
}, { id: 'fetcher' });

qk.on('my_event', (event, ctx) => {
  saveData(event.context.result);
}, { id: 'saver', after: 'fetcher' });

await qk.emit('my_event', { id: '123' });
```

---

### Example 2: Composite Events

**v1:**
```javascript
const qk = new QuarKernel();

qk.addCompositeEvent(['config:loaded', 'user:authenticated'], (stack) => {
  const configEvent = stack['config:loaded'][0];
  const userEvent = stack['user:authenticated'][0];

  return new QKE('app:ready', {
    config: configEvent.param,
    user: userEvent.param
  });
});

qk.addEventListener('app:ready', (e) => {
  startApp(e.param.config, e.param.user);
});

await qk.dispatchEvent(new QKE('config:loaded', { apiUrl: '...' }));
await qk.dispatchEvent(new QKE('user:authenticated', { userId: '123' }));
// 'app:ready' auto-dispatched
```

**v2:**
```typescript
import { createKernel, NamespacedMerger } from '@quazardous/quarkernel';

interface Events {
  'config:loaded': { apiUrl: string };
  'user:authenticated': { userId: string };
  'app:ready': { config: any; user: any };
}

const qk = createKernel<Events>();

qk.compose(['config:loaded', 'user:authenticated'], (events) => ({
  type: 'app:ready',
  data: {
    config: events['config:loaded'][0].data,
    user: events['user:authenticated'][0].data
  }
}), {
  contextMerger: new NamespacedMerger()  // Explicit merge strategy
});

qk.on('app:ready', (event, ctx) => {
  startApp(event.data.config, event.data.user);
});

await qk.emit('config:loaded', { apiUrl: '...' });
await qk.emit('user:authenticated', { userId: '123' });
// 'app:ready' auto-emitted
```

---

### Example 3: Memory Leak Prevention

**v1:**
```javascript
// Problem: Listeners accumulate, no cleanup mechanism
class Component {
  mount() {
    qk.addEventListener('event', (e) => {
      this.handleEvent(e);
    });
  }

  unmount() {
    // No way to remove listener!
    // Listener still active, memory leak
  }
}
```

**v2:**
```typescript
// Solution 1: Manual unbind
class Component {
  private unbind?: () => void;

  mount() {
    this.unbind = qk.on('event', (event, ctx) => {
      this.handleEvent(event);
    });
  }

  unmount() {
    this.unbind?.();  // Clean up
  }
}

// Solution 2: AbortSignal
class Component {
  private controller = new AbortController();

  mount() {
    qk.on('event', (event, ctx) => {
      this.handleEvent(event);
    }, { signal: this.controller.signal });
  }

  unmount() {
    this.controller.abort();  // Removes all listeners
  }
}

// Solution 3: Use framework adapters (auto-cleanup)
import { useOn } from '@quarkernel/vue';

// Vue component - auto-cleanup on unmount
setup() {
  useOn('event', (event, ctx) => {
    handleEvent(event);
  });
}
```

---

### Example 4: Multiple Dependencies

**v1:**
```javascript
qk.addEventListener('event', handler1, 'A');
qk.addEventListener('event', handler2, 'B');
qk.addEventListener('event', handler3, 'C', 'A');  // Single dependency
// No way to specify multiple dependencies in v1
```

**v2:**
```typescript
qk.on('event', handler1, { id: 'A' });
qk.on('event', handler2, { id: 'B' });
qk.on('event', handler3, { id: 'C', after: ['A', 'B'] });  // Multiple deps
```

---

## New Features in v2

### 1. Serial Execution

```typescript
// Parallel (default) - all listeners start concurrently
await qk.emit('event', data);

// Serial - wait for each listener before starting next
await qk.emitSerial('event', data);
```

### 2. Once with Predicate

```typescript
// Wait for event with condition
await qk.once('user:update', (event) => event.data.role === 'admin');

// Or as listener
qk.once('event', (event) => event.data.ready, (event, ctx) => {
  console.log('Ready!');
});
```

### 3. Async Iteration

```typescript
// Consume events as async stream
for await (const event of qk.events('user:*')) {
  console.log(event.name, event.data);
}
```

### 4. Debug Mode

```typescript
const qk = createKernel({
  debug: true,
  onError: (error, event) => {
    console.error(`Error in ${event.name}:`, error);
  }
});
```

### 5. Listener Introspection

```typescript
qk.listenerCount('event');  // Count for specific event
qk.listenerCount();         // Total count
qk.eventNames();            // All registered event names
```

### 6. Framework Adapters

v2 includes official adapters with auto-cleanup:

```typescript
// Vue 3
import { useOn, useEventState } from '@quarkernel/vue';

// React
import { useOn, useEventState } from '@quazardous/quarkernel-react';

// Svelte
import { onEvent, eventStore } from '@quarkernel/svelte';

// Worker bridge
import { createWorkerBridge } from '@quarkernel/worker';
```

---

## Troubleshooting

### TypeScript Errors

**Error:** `Property 'param' does not exist on type 'KernelEvent'`

**Solution:** Change `e.param` to `event.data`

---

**Error:** `Expected 2-3 arguments, but got 4`

**Solution:** Update listener registration:
```typescript
// v1
qk.addEventListener('event', handler, 'target', 'dep');

// v2
qk.on('event', handler, { id: 'target', after: 'dep' });
```

---

### Runtime Errors

**Error:** `TypeError: qk.dispatchEvent is not a function`

**Solution:** Replace with `qk.emit()`:
```typescript
// v1
await qk.dispatchEvent(new QKE('event', data));

// v2
await qk.emit('event', data);
```

---

**Error:** `QuarKernelEvent is not a constructor`

**Solution:** v2 doesn't export event class. Use `emit()` directly:
```typescript
// v1
const event = new QKE('event', { x: 1 });
await qk.dispatchEvent(event);

// v2
await qk.emit('event', { x: 1 });
```

---

### Migration Strategies

#### Strategy 1: Parallel Run (Recommended)

Run v1 and v2 side-by-side during migration:

```typescript
import { QuarKernel } from '@quazardous/quarkernel-v1';  // Alias v1
import { createKernel } from '@quazardous/quarkernel';

const legacyKernel = new QuarKernel();
const modernKernel = createKernel();

// Bridge events between v1 and v2
legacyKernel.addEventListener('**', (e) => {
  modernKernel.emit(e.type, e.param);
});
```

#### Strategy 2: Module-by-Module

Migrate one module at a time:
1. Identify isolated modules (low coupling)
2. Convert module to v2 API
3. Test thoroughly
4. Repeat for next module

#### Strategy 3: Wrapper Adapter

Create compatibility layer (temporary):

```typescript
// legacy-adapter.ts
class V1Adapter {
  constructor(private kernel: Kernel) {}

  addEventListener(type: string, cb: Function, target?: string, deps?: string) {
    return this.qk.on(type, (e, ctx) => cb(e, target), {
      id: target,
      after: deps
    });
  }

  dispatchEvent(event: { type: string; param: any }) {
    return this.qk.emit(event.type, event.param);
  }
}

// Use adapter
const qk = createKernel();
const legacy = new V1Adapter(kernel);
legacy.addEventListener('event', handler);  // v1 API, v2 engine
```

---

## Summary

QuarKernel v2 modernizes the API with:
- **Simpler** - factory function, clearer method names
- **Safer** - TypeScript types, memory leak protection
- **More powerful** - wildcards, AbortSignal, framework adapters
- **Better DX** - unbind functions, debug mode, better errors

The migration requires updating method names and argument order, but the core concepts (dependencies, composition, shared context) remain the same.

For questions or issues, see:
- [API Reference](./api-reference.md)
- [Getting Started Guide](./getting-started.md)
- [GitHub Issues](https://github.com/quazardous/quarkernel/issues)
