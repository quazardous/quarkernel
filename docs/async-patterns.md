# Async Patterns: QK + FSM + Promises

```
Promise  →  Execute async
QK       →  Orchestrate order & dependencies
FSM      →  Track state
```

---

## Promise Behavior

### `emit()` → `Promise<void>`

Resolves when **all listeners complete** (parallel by default).

```typescript
// errorBoundary: true (default) - never throws
await qk.emit('event');
const errors = qk.getExecutionErrors();

// errorBoundary: false - throws AggregateError
try { await qk.emit('event'); }
catch (e) { console.log(e.errors); }
```

### `emitSerial()` → `Promise<void>`

Same as `emit()`, but sequential execution.

### FSM `send()` → `Promise<boolean>`

```typescript
const ok = await machine.send('SUBMIT'); // true if transitioned
```

Errors in entry/exit are caught silently. Handle them yourself:

```typescript
entry: async (ctx, { send }) => {
  try { await op(); send('OK'); }
  catch { send('ERROR'); }
}
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

### 2. FSM Async State

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

### 3. QK + FSM

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
```

### 4. Composition

```typescript
const appReady = new Composition([
  [qk, 'user:ready'],
  [qk, 'config:ready'],
]);

appReady.onComposed((e) => initApp(e.data.merged));
```

### 5. Error Collection (like `Promise.allSettled`)

```typescript
qk.on('batch', async () => { await mayFail1(); });
qk.on('batch', async () => { await mayFail2(); });

await qk.emit('batch'); // all run, never throws
qk.getExecutionErrors().forEach(e => console.log(e.error));
```

### 6. FSM Timeout

```typescript
loading: {
  entry: async (ctx, { send }) => {
    send('DONE', { data: await fetchData() });
  },
  after: { delay: 5000, send: 'TIMEOUT' },
  on: { DONE: 'success', TIMEOUT: 'timedOut' },
}
```

---

## Summary

| Layer | Error Handling |
|-------|----------------|
| **Promise** | try/catch |
| **QK** | `errorBoundary` + `getExecutionErrors()` |
| **FSM** | try/catch in actions → transition to error state |
