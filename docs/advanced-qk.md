# Advanced QuarKernel Patterns

Progressive guide from basic to advanced patterns.

---

## 1. Kernel Basics

```typescript
import { Kernel, createKernel } from '@quazardous/quarkernel';

const qk = createKernel();

// Basic listener
qk.on('user:login', (e) => console.log('Logged in:', e.data.userId));

// Dependency ordering
qk.on('checkout', async (e) => {
  e.context.user = await fetchUser(e.data.userId);
}, { id: 'fetch-user' });

qk.on('checkout', async (e) => {
  e.context.cart = await fetchCart(e.context.user.id);
}, { id: 'fetch-cart', after: 'fetch-user' });

qk.on('checkout', (e) => {
  console.log(`${e.context.user.name}: ${e.context.cart.items.length} items`);
}, { after: 'fetch-cart' });

// Wildcards
qk.on('user:*', (e) => console.log('User event:', e.name));
qk.on('**', (e) => console.log('Any event:', e.name));

await qk.emit('checkout', { userId: '123' });
```

---

## 2. Standalone Machine

Self-contained with inline behaviors:

```typescript
import { createMachine } from '@quazardous/quarkernel/fsm';

const player = createMachine({
  id: 'player',
  initial: 'stopped',
  context: { track: null, position: 0 },

  states: {
    stopped: {
      entry: (ctx, { set }) => set({ position: 0 }),
      on: { PLAY: 'playing' },
    },
    playing: {
      entry: (ctx, { log }) => log(`Playing: ${ctx.track}`),
      after: { delay: 1000, send: 'TICK' },  // Auto-transition
      on: { PAUSE: 'paused', STOP: 'stopped', TICK: 'playing' },
    },
    paused: {
      on: { PLAY: 'playing', STOP: 'stopped' },
    },
  },

  on: {
    TICK: (ctx, { set }) => set({ position: ctx.position + 1 }),
  },

  helpers: {
    log: (msg) => console.log(`[PLAYER] ${msg}`),
  },
});

player.send('PLAY');
console.log(player.state);   // 'playing'
console.log(player.context); // { track: null, position: 0 }
```

---

## 3. Orchestrated Machines

Multiple machines coordinated via kernel:

```typescript
import { Kernel, useMachine } from '@quazardous/quarkernel';

const qk = new Kernel();

const order = useMachine(qk, {
  prefix: 'order',
  initial: 'cart',
  states: {
    cart:       { on: { CHECKOUT: 'pending' } },
    pending:    { on: { PAY: 'paid', CANCEL: 'cancelled' } },
    paid:       { on: { SHIP: 'shipped' } },
    shipped:    {},
    cancelled:  {},
  },
});

const payment = useMachine(qk, {
  prefix: 'payment',
  initial: 'idle',
  states: {
    idle:       { on: { CHARGE: 'processing' } },
    processing: { on: { SUCCESS: 'done', FAIL: 'failed' } },
    done:       {},
    failed:     { on: { RETRY: 'processing' } },
  },
});

// Cross-machine orchestration
qk.on('order:enter:pending', () => payment.send('CHARGE'));
qk.on('payment:enter:done', () => order.send('PAY'));
qk.on('payment:enter:failed', () => order.send('CANCEL'));

// Log all transitions
qk.on('*:transition', (e) => {
  console.log(`[${e.data.machine}] ${e.data.from} → ${e.data.to}`);
});
```

---

## 4. Event Composition

Wait for multiple events:

```typescript
import { Kernel, Composition } from '@quazardous/quarkernel';

const qk = new Kernel();

// Fire when ALL events have occurred (any order)
const appReady = new Composition([
  [qk, 'auth:complete'],
  [qk, 'data:loaded'],
  [qk, 'ui:rendered'],
]);

appReady.onComposed((e) => {
  // Merged context from all events
  console.log('App ready!', e.context);
});

// Events can occur in any order
qk.emit('ui:rendered', { theme: 'dark' });
qk.emit('auth:complete', { user: { id: 1 } });
qk.emit('data:loaded', { items: 42 });
// → composite fires with merged context
```

---

## 5. FSM + Composition

Coordinate machines with composition:

```typescript
const order = useMachine(qk, {
  prefix: 'order',
  initial: 'draft',
  states: {
    draft:     { on: { SUBMIT: 'pending' } },
    pending:   { on: { CONFIRM: 'confirmed' } },
    confirmed: {},
  },
});

const payment = useMachine(qk, {
  prefix: 'payment',
  initial: 'idle',
  states: {
    idle: { on: { PAY: 'paid' } },
    paid: {},
  },
});

const shipping = useMachine(qk, {
  prefix: 'shipping',
  initial: 'idle',
  states: {
    idle:     { on: { PREPARE: 'ready' } },
    ready:    { on: { DISPATCH: 'shipped' } },
    shipped:  {},
  },
});

// Start fulfillment when order confirmed AND payment received
const fulfillmentReady = new Composition([
  [qk, 'order:enter:confirmed'],
  [qk, 'payment:enter:paid'],
]);

fulfillmentReady.onComposed(() => {
  shipping.send('PREPARE');
  fulfillmentReady.reset();  // Ready for next order
});

qk.on('shipping:enter:ready', () => shipping.send('DISPATCH'));
```

---

## 6. Saga Pattern

Distributed transaction with rollback:

```typescript
const order = useMachine(qk, {
  prefix: 'order',
  initial: 'pending',
  states: {
    pending:   { on: { CONFIRM: 'confirmed', ROLLBACK: 'cancelled' } },
    confirmed: { on: { ROLLBACK: 'cancelled' } },
    cancelled: {},
  },
});

const inventory = useMachine(qk, {
  prefix: 'inventory',
  initial: 'available',
  states: {
    available: { on: { RESERVE: 'reserved' } },
    reserved:  { on: { COMMIT: 'committed', RELEASE: 'available' } },
    committed: {},
  },
});

const payment = useMachine(qk, {
  prefix: 'payment',
  initial: 'idle',
  states: {
    idle:     { on: { CHARGE: 'charging' } },
    charging: { on: { SUCCESS: 'charged', FAIL: 'failed' } },
    charged:  { on: { REFUND: 'refunded' } },
    failed:   {},
    refunded: {},
  },
});

// Saga success: all three must complete
const sagaComplete = new Composition([
  [qk, 'order:enter:confirmed'],
  [qk, 'inventory:enter:reserved'],
  [qk, 'payment:enter:charged'],
]);

sagaComplete.onComposed(() => {
  inventory.send('COMMIT');
  sagaComplete.reset();
});

// Rollback on payment failure
qk.on('payment:enter:failed', async () => {
  await inventory.send('RELEASE');
  await order.send('ROLLBACK');
});
```

---

## 7. Hierarchical & Sync

Parent-child with synchronized states:

```typescript
// Parent machines
const app = useMachine(qk, {
  prefix: 'app',
  initial: 'loading',
  states: {
    loading: { on: { READY: 'ready', ERROR: 'error' } },
    ready:   { on: { ERROR: 'error' } },
    error:   { on: { RETRY: 'loading' } },
  },
});

const auth = useMachine(qk, {
  prefix: 'auth',
  initial: 'loggedOut',
  states: {
    loggedOut: { on: { LOGIN: 'loggedIn' } },
    loggedIn:  { on: { LOGOUT: 'loggedOut' } },
  },
});

// Child machines (depend on parents)
const dashboard = useMachine(qk, {
  prefix: 'dashboard',
  initial: 'hidden',
  states: {
    hidden:  { on: { SHOW: 'visible' } },
    visible: { on: { HIDE: 'hidden' } },
  },
});

const player = useMachine(qk, {
  prefix: 'player',
  initial: 'stopped',
  states: {
    stopped: { on: { PLAY: 'playing' } },
    playing: { on: { STOP: 'stopped' } },
  },
});

// Show dashboard when app ready AND logged in
const showDashboard = new Composition([
  [qk, 'app:enter:ready'],
  [qk, 'auth:enter:loggedIn'],
]);
showDashboard.onComposed(() => dashboard.send('SHOW'));

// Sync: hide dashboard & stop player on logout or error
qk.on('auth:enter:loggedOut', () => {
  dashboard.send('HIDE');
  player.send('STOP');
});

qk.on('app:enter:error', () => {
  dashboard.send('HIDE');
  player.send('STOP');
});
```

---

## 8. Conditional & Guards

State-dependent logic:

```typescript
const premium = useMachine(qk, {
  prefix: 'premium',
  initial: 'free',
  states: {
    free:    { on: { UPGRADE: 'premium' } },
    premium: { on: { DOWNGRADE: 'free' } },
  },
});

const download = useMachine(qk, {
  prefix: 'download',
  initial: 'idle',
  states: {
    idle:        { on: { START: 'checking' } },
    checking:    { on: { ALLOW: 'active', BLOCK: 'blocked' } },
    active:      { on: { DONE: 'idle' } },
    blocked:     { on: { DISMISS: 'idle' } },
  },
});

// Guard: check premium status
qk.on('download:enter:checking', () => {
  if (premium.getState() === 'premium') {
    download.send('ALLOW');
  } else {
    download.send('BLOCK');
  }
});

// Alternative: inline guard
const restricted = useMachine(qk, {
  prefix: 'restricted',
  initial: 'locked',
  states: {
    locked: {
      on: {
        UNLOCK: {
          target: 'unlocked',
          guard: () => premium.getState() === 'premium',
        },
      },
    },
    unlocked: { on: { LOCK: 'locked' } },
  },
});
```

---

## 9. Composition Patterns

```typescript
// Sequential: events must occur in order
let step = 0;
['step1', 'step2', 'step3'].forEach((event, i) => {
  qk.on(event, () => {
    if (i === step) {
      step++;
      if (step === 3) {
        qk.emit('sequence:complete');
        step = 0;
      }
    }
  });
});

// Timeout: events within time window
const timed = new Composition([[qk, 'auth:start'], [qk, 'auth:done']]);
let timeout;
qk.on('auth:start', () => {
  timeout = setTimeout(() => {
    timed.reset();
    qk.emit('auth:timeout');
  }, 30000);
});
timed.onComposed(() => clearTimeout(timeout));

// Exclusive: race between events
Promise.race([
  qk.once('op:success'),
  qk.once('op:failure'),
  qk.once('op:timeout'),
]).then((e) => console.log('First:', e.name));

// Repeating: fire on each cycle
const cycle = new Composition([[qk, 'tick:a'], [qk, 'tick:b']]);
cycle.onComposed(() => {
  console.log('Cycle complete');
  cycle.reset();
});

// Debounced: wait for settle
let debounce;
qk.on('input:change', () => {
  clearTimeout(debounce);
  debounce = setTimeout(() => qk.emit('input:settled'), 300);
});
```

---

## 10. Persistence

```typescript
const wizard = useMachine(qk, {
  prefix: 'wizard',
  initial: 'step1',
  context: { data: {} },
  trackHistory: true,
  states: {
    step1: { on: { NEXT: 'step2' } },
    step2: { on: { NEXT: 'step3', BACK: 'step1' } },
    step3: { on: { NEXT: 'done', BACK: 'step2' } },
    done:  {},
  },
});

// Save on every transition
qk.on('wizard:transition', () => {
  localStorage.setItem('wizard', JSON.stringify(wizard.toJSON()));
});

// Restore on load
const saved = localStorage.getItem('wizard');
if (saved) wizard.restore(JSON.parse(saved));
```

---

## 11. Multi-Kernel

Domain separation with bridge:

```typescript
const uiKernel = new Kernel();
const dataKernel = new Kernel();
const bridge = new Kernel();

const modal = useMachine(uiKernel, {
  prefix: 'modal',
  initial: 'closed',
  states: {
    closed: { on: { OPEN: 'open' } },
    open:   { on: { CLOSE: 'closed' } },
  },
});

const cache = useMachine(dataKernel, {
  prefix: 'cache',
  initial: 'fresh',
  states: {
    fresh: { on: { STALE: 'stale' } },
    stale: { on: { REFRESH: 'fresh' } },
  },
});

// Cross-kernel via bridge
dataKernel.on('cache:enter:stale', () => bridge.emit('data:stale'));
bridge.on('data:stale', () => modal.send('OPEN'));
uiKernel.on('modal:enter:closed', () => cache.send('REFRESH'));
```

---

## Summary

| Level | Pattern | Use Case |
|-------|---------|----------|
| Basic | Kernel events | Pub/sub with ordering |
| Basic | `createMachine()` | Self-contained component |
| Multi | `useMachine()` | Kernel-orchestrated machines |
| Multi | Composition | Wait for multiple events |
| Multi | FSM + Composition | Complex workflows |
| Advanced | Saga | Distributed transactions |
| Advanced | Hierarchical | Parent-child dependencies |
| Advanced | Guards | Conditional logic |
| Advanced | Patterns | Sequential, timeout, race, debounce |
| Advanced | Persistence | Save/restore state |
| Advanced | Multi-kernel | Domain separation |
