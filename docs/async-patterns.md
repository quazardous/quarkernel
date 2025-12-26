# Async Patterns: QK + FSM + Promises

```
Promise  →  Execute async
QK       →  Orchestrate order & dependencies
FSM      →  Track state
```

---

## Promise API Reference

### QK: `emit()` → `Promise<void>`

Resolves when **all listeners complete** (parallel by default).

```typescript
await qk.emit('event', data);

// .then() receives: void (nothing)
qk.emit('event', data).then(() => console.log('all listeners done'));
```

**Error handling:**

```typescript
// errorBoundary: true (default) - never throws
await qk.emit('event');
const errors = qk.getExecutionErrors();

// errorBoundary: false - throws AggregateError
try { await qk.emit('event'); }
catch (e) { console.log(e.errors); }
```

### QK: `emitSerial()` → `Promise<void>`

Same as `emit()`, sequential execution.

### QK: `once()` → `Promise<IKernelEvent>`

```typescript
// .then() receives: IKernelEvent { name, data, context, timestamp }
const event = await qk.once('user:loaded');
console.log(event.data);    // event payload
console.log(event.context); // shared context

// With timeout (rejects on timeout)
const event = await qk.once('user:loaded', { timeout: 5000 });

// For callback style, use on() with once option:
const unbind = qk.on('user:loaded', (e) => console.log(e.data), { once: true });
```

### Composition: `once()` → `Promise<IKernelEvent>`

```typescript
const composition = new Composition([
  [qk, 'user:ready'],
  [qk, 'config:ready'],
]);

// .then() receives: IKernelEvent with data: { sources, contexts, merged }
const event = await composition.once();
console.log(event.data.merged);  // merged context
console.log(event.data.sources); // ['user:ready', 'config:ready']

// With timeout
const event = await composition.once({ timeout: 5000 });
```

### FSM: `send()` → `Promise<boolean>`

```typescript
// .then() receives: boolean (true if transitioned)
const transitioned = await machine.send('SUBMIT');

if (transitioned) {
  console.log(machine.getState());   // new state
  console.log(machine.getContext()); // current context
}
```

### FSM: `waitFor()` → `Promise<{ state, from?, event?, context }>`

```typescript
// .then() receives: { state, from?, event?, context }
const result = await machine.waitFor('completed');
console.log(result.state);   // 'completed'
console.log(result.from);    // previous state
console.log(result.event);   // transition event
console.log(result.context); // machine context

// With timeout (rejects on timeout)
await machine.waitFor('completed', { timeout: 5000 });

// Already in state? Resolves immediately
await machine.waitFor(machine.getState());
```

---

## Patterns

### 1. Dependency Graph

```typescript
qk.on('init', async (e) => {
  e.context.user = await fetchUser(e.data.id);
}, { id: 'user' });

qk.on('init', async (e) => {
  e.context.profile = await fetchProfile(e.context.user.id);
}, { id: 'profile', after: ['user'] });

qk.on('init', async (e) => {
  e.context.settings = await fetchSettings(e.context.user.id);
}, { id: 'settings', after: ['user'] });

// runs after profile AND settings (parallel after user)
qk.on('init', async (e) => {
  await buildDashboard(e.context);
}, { after: ['profile', 'settings'] });

await qk.emit('init', { id: '123' });
```

### 2. Wait for Event

```typescript
// Start async operation
qk.emit('user:fetch', { id: '123' });

// Wait for result
const event = await qk.once('user:loaded');
console.log(event.data.user);
```

### 3. Race Between Events

```typescript
const result = await Promise.race([
  qk.once('success'),
  qk.once('error'),
]);

if (result.name === 'success') { ... }
```

### 4. FSM Async State

```typescript
const loader = createMachine({
  id: 'loader',
  initial: 'idle',
  context: { data: null, error: null },
  states: {
    idle: { on: { LOAD: 'loading' } },
    loading: {
      entry: async (ctx, { set, send }) => {
        try {
          set({ data: await fetchData() });
          send('SUCCESS');
        } catch (error) {
          set({ error });
          send('FAILURE');
        }
      },
      on: { SUCCESS: 'success', FAILURE: 'error' },
    },
    success: { on: { RELOAD: 'loading' } },
    error: { on: { RETRY: 'loading' } },
  },
});
```

### 5. Wait for FSM State

```typescript
// Start transition
machine.send('SUBMIT');

// Wait for final state
const result = await machine.waitFor('completed');
console.log(result.context);
```

### 6. QK + FSM

```typescript
const order = useMachine(qk, {
  prefix: 'order',
  initial: 'draft',
  states: {
    draft: { on: { SUBMIT: 'pending' } },
    pending: { on: { PAY: 'paid', CANCEL: 'cancelled' } },
    paid: {},
    cancelled: {},
  },
});

qk.on('order:enter:pending', async () => {
  try { await chargeCard(); order.send('PAY'); }
  catch { order.send('CANCEL'); }
});

await order.send('SUBMIT');
await order.waitFor('paid');
```

### 7. Composition

```typescript
const appReady = new Composition([
  [qk, 'user:ready'],
  [qk, 'config:ready'],
]);

// Callback style
appReady.onComposed((e) => initApp(e.data.merged));

// Promise style
const { data } = await appReady.once();
initApp(data.merged);
```

### 8. Error Collection

```typescript
qk.on('batch', async () => { await mayFail1(); });
qk.on('batch', async () => { await mayFail2(); });

await qk.emit('batch'); // all run, never throws
qk.getExecutionErrors().forEach(e => console.log(e.error));
```

---

## Summary

| Method | `.then()` receives |
|--------|-------------------|
| `qk.emit()` | `void` |
| `qk.once()` | `IKernelEvent { name, data, context }` |
| `qk.on(..., { once: true })` | N/A (returns unbind) |
| `composition.once()` | `IKernelEvent { data: { sources, merged } }` |
| `machine.send()` | `boolean` |
| `machine.waitFor()` | `{ state, from?, event?, context }` |

| Layer | Error Handling |
|-------|----------------|
| **QK** | `errorBoundary` + `getExecutionErrors()` |
| **FSM** | try/catch in actions → transition to error state |
