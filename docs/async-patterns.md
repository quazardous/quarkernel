# Async Patterns: Integrating QK & FSM with Promises

How to leverage QuarKernel and FSM in Promise-oriented development.

---

## Core Principle

**Promises handle async operations. QK orchestrates them. FSM controls the flow.**

```
Promise  →  "How to wait for async"
QK       →  "When and in what order"
FSM      →  "What state are we in"
```

---

## 1. Promise-First Integration

### Wrapping Promises in Events

```typescript
const qk = createKernel();

// Your existing Promise-based service
async function fetchUser(id: string): Promise<User> {
  return api.get(`/users/${id}`);
}

// Integrate with QK - emit events around Promise lifecycle
qk.on('user:fetch', async (e) => {
  try {
    const user = await fetchUser(e.data.id);
    e.context.user = user;
    await qk.emit('user:loaded', { user });
  } catch (error) {
    await qk.emit('user:error', { error, id: e.data.id });
  }
});

// Usage - still Promise-based
await qk.emit('user:fetch', { id: '123' });
```

### Converting Events to Promises

```typescript
// Wait for an event as a Promise
const userLoaded = await qk.once('user:loaded');
console.log(userLoaded.data.user);

// Race between events
const result = await Promise.race([
  qk.once('user:loaded'),
  qk.once('user:error'),
]);
```

---

## 2. Parallel Promise Orchestration

### Problem: Multiple async calls with dependencies

```typescript
// Traditional Promise approach - manual orchestration
const user = await fetchUser(id);
const [profile, settings] = await Promise.all([
  fetchProfile(user.id),
  fetchSettings(user.id),
]);
const dashboard = await buildDashboard(user, profile, settings);
```

### QK Solution: Declarative dependencies

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

// profile & settings run in parallel after user
qk.on('init', async (e) => {
  e.context.dashboard = await buildDashboard(
    e.context.user,
    e.context.profile,
    e.context.settings
  );
}, { after: ['profile', 'settings'] });

// Single call, all orchestration handled
await qk.emit('init', { id: '123' });
```

**Synergy**: QK manages the dependency graph, Promises do the actual async work.

---

## 3. FSM for Async State Management

### Problem: Complex async flows with multiple states

```typescript
// Promise-only approach - state is implicit
let isLoading = false;
let hasError = false;
let data = null;

async function load() {
  isLoading = true;
  try {
    data = await fetchData();
    isLoading = false;
  } catch (e) {
    hasError = true;
    isLoading = false;
  }
}
```

### FSM Solution: Explicit states

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
          const data = await fetchData();  // Your Promise
          set({ data });
          send('SUCCESS');
        } catch (error) {
          set({ error });
          send('FAILURE');
        }
      },
      on: {
        SUCCESS: 'success',
        FAILURE: 'error',
      },
    },
    success: { on: { RELOAD: 'loading' } },
    error: { on: { RETRY: 'loading' } },
  },
});

// Usage
await loader.send('LOAD');
console.log(loader.state);    // 'success' or 'error'
console.log(loader.context);  // { data, error }
```

**Synergy**: FSM tracks state explicitly, Promises execute inside entry/exit actions.

---

## 4. Combining QK + FSM + Promises

### Multi-Machine Workflow

```typescript
const qk = createKernel();

// Machine 1: Order lifecycle
const order = useMachine(qk, {
  prefix: 'order',
  initial: 'draft',
  states: {
    draft: { on: { SUBMIT: 'pending' } },
    pending: { on: { PAY: 'paid', CANCEL: 'cancelled' } },
    paid: { on: { SHIP: 'shipped' } },
    shipped: {},
    cancelled: {},
  },
});

// Machine 2: Payment processing
const payment = useMachine(qk, {
  prefix: 'payment',
  initial: 'idle',
  states: {
    idle: { on: { CHARGE: 'processing' } },
    processing: { on: { OK: 'done', FAIL: 'failed' } },
    done: {},
    failed: { on: { RETRY: 'processing' } },
  },
});

// QK orchestrates: when order enters pending, start payment
qk.on('order:enter:pending', async (e) => {
  payment.send('CHARGE');
});

// Promise-based payment processing
qk.on('payment:enter:processing', async (e) => {
  try {
    await chargeCard(e.context.order.total);  // Your Promise
    payment.send('OK');
  } catch {
    payment.send('FAIL');
  }
});

// React to payment result
qk.on('payment:enter:done', () => order.send('PAY'));
qk.on('payment:enter:failed', () => order.send('CANCEL'));

// Start flow
await order.send('SUBMIT');
```

---

## 5. Composition: Waiting for Multiple Async Sources

### Problem: React when multiple independent Promises complete

```typescript
// Traditional - manage flags manually
let userReady = false;
let configReady = false;

fetchUser().then(u => { user = u; userReady = true; checkReady(); });
fetchConfig().then(c => { config = c; configReady = true; checkReady(); });

function checkReady() {
  if (userReady && configReady) initApp(user, config);
}
```

### Composition Solution

```typescript
const qk = createKernel();

// Async loaders emit events when done
qk.on('boot', async () => {
  const user = await fetchUser();
  await qk.emit('user:ready', { user });
});

qk.on('boot', async () => {
  const config = await fetchConfig();
  await qk.emit('config:ready', { config });
});

// Composition waits for both
const appReady = new Composition([
  [qk, 'user:ready'],
  [qk, 'config:ready'],
]);

appReady.onComposed((e) => {
  // Both Promises resolved, contexts merged
  initApp(e.data.merged);
});

await qk.emit('boot');
```

---

## 6. Error Handling Synergies

### Promise Errors → FSM States

```typescript
const api = createMachine({
  id: 'api',
  initial: 'idle',
  context: { retries: 0 },
  states: {
    idle: { on: { CALL: 'calling' } },
    calling: {
      entry: async (ctx, { set, send }) => {
        try {
          const data = await apiCall();  // Promise
          set({ data, retries: 0 });
          send('SUCCESS');
        } catch (error) {
          set({ error, retries: ctx.retries + 1 });
          send('ERROR');
        }
      },
      on: {
        SUCCESS: 'success',
        ERROR: [
          { target: 'retrying', guard: (ctx) => ctx.retries < 3 },
          { target: 'failed' },
        ],
      },
    },
    retrying: {
      after: { delay: 1000 * Math.pow(2, ctx.retries), send: 'RETRY' },
      on: { RETRY: 'calling' },
    },
    success: {},
    failed: { on: { RESET: 'idle' } },
  },
});
```

### QK Error Boundary + Promise.allSettled behavior

```typescript
const qk = createKernel({ errorBoundary: true });

// Multiple Promises, some may fail
qk.on('batch', async () => { await mayFail1(); });
qk.on('batch', async () => { await mayFail2(); });
qk.on('batch', async () => { await mayFail3(); });

await qk.emit('batch');  // All run, errors collected

const errors = qk.getExecutionErrors();
// Like Promise.allSettled - you get all results + errors
```

---

## 7. Timeout & Cancellation

### FSM Timeout (replaces Promise.race with timeout)

```typescript
const request = createMachine({
  id: 'request',
  initial: 'idle',
  states: {
    idle: { on: { START: 'loading' } },
    loading: {
      entry: async (ctx, { send }) => {
        const data = await fetchData();
        send('DONE', { data });
      },
      after: { delay: 5000, send: 'TIMEOUT' },  // Auto-timeout
      on: {
        DONE: 'success',
        TIMEOUT: 'timedOut',
      },
    },
    success: {},
    timedOut: { on: { RETRY: 'loading' } },
  },
});
```

### Composition TTL (event expiration)

```typescript
const timed = new Composition([
  [qk, 'step1:done'],
  [qk, 'step2:done'],
], {
  eventTTL: 10000,  // Events expire after 10s
});

// If step2 doesn't complete within 10s of step1, composition never fires
```

---

## 8. Practical Patterns

### Pattern: Async Action with Loading State

```typescript
function useAsyncAction<T>(action: () => Promise<T>) {
  const machine = createMachine({
    id: 'action',
    initial: 'idle',
    context: { result: null, error: null },
    states: {
      idle: { on: { EXECUTE: 'running' } },
      running: {
        entry: async (ctx, { set, send }) => {
          try {
            const result = await action();
            set({ result });
            send('SUCCESS');
          } catch (error) {
            set({ error });
            send('ERROR');
          }
        },
        on: { SUCCESS: 'success', ERROR: 'error' },
      },
      success: { on: { RESET: 'idle' } },
      error: { on: { RETRY: 'running', RESET: 'idle' } },
    },
  });

  return {
    execute: () => machine.send('EXECUTE'),
    retry: () => machine.send('RETRY'),
    reset: () => machine.send('RESET'),
    get state() { return machine.state; },
    get result() { return machine.context.result; },
    get error() { return machine.context.error; },
  };
}

// Usage
const saveAction = useAsyncAction(() => api.save(data));
await saveAction.execute();
if (saveAction.state === 'error') await saveAction.retry();
```

### Pattern: Saga with Rollback

```typescript
const saga = createMachine({
  id: 'saga',
  initial: 'idle',
  context: { steps: [] },
  states: {
    idle: { on: { START: 'step1' } },
    step1: {
      entry: async (ctx, { set, send }) => {
        await doStep1();
        set({ steps: [...ctx.steps, 'step1'] });
        send('NEXT');
      },
      on: { NEXT: 'step2', ERROR: 'rollback' },
    },
    step2: {
      entry: async (ctx, { set, send }) => {
        await doStep2();
        set({ steps: [...ctx.steps, 'step2'] });
        send('NEXT');
      },
      on: { NEXT: 'step3', ERROR: 'rollback' },
    },
    step3: {
      entry: async (ctx, { set, send }) => {
        await doStep3();
        send('DONE');
      },
      on: { DONE: 'success', ERROR: 'rollback' },
    },
    rollback: {
      entry: async (ctx) => {
        // Undo in reverse order
        for (const step of ctx.steps.reverse()) {
          await undo(step);
        }
      },
      on: { DONE: 'failed' },
    },
    success: {},
    failed: {},
  },
});
```

---

## Summary

| Layer | Role | Integration Point |
|-------|------|-------------------|
| **Promise** | Execute async | Inside QK listeners, FSM entry/exit |
| **QK** | Orchestrate | Dependencies, parallel/serial, composition |
| **FSM** | Control flow | States, transitions, guards, timeouts |

**Best practice**:
1. Keep Promises for actual I/O
2. Use QK for event-driven coordination
3. Use FSM when state logic is complex

They complement each other - use all three together for robust async workflows.
