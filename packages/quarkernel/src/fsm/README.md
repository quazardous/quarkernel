# QuarKernel FSM

High-level state machine abstraction with XState compatibility.

## Two APIs

| API | Use Case |
|-----|----------|
| `createMachine()` | Standalone, self-contained, high-level behaviors |
| `useMachine()` | With external kernel, event orchestration, multi-machine |

---

## 1. Standalone: `createMachine()`

Self-contained machine with declarative behaviors.

```typescript
import { createMachine } from '@quazardous/quarkernel/fsm';

const order = createMachine({
  id: 'order',
  initial: 'draft',
  context: { items: 0, total: 0 },

  // State definitions (XState-compatible)
  states: {
    draft:     { on: { ADD_ITEM: 'draft', SUBMIT: 'pending' } },
    pending:   { on: { APPROVE: 'confirmed', REJECT: 'draft' } },
    confirmed: { on: { SHIP: 'shipped' } },
    shipped:   { on: { DELIVER: 'delivered' } },
    delivered: {},
  },

  // Event handlers - called when event triggers transition
  on: {
    ADD_ITEM: (ctx, { set, log }) => {
      set({ items: ctx.items + 1, total: ctx.total + 29.99 });
      log(`Added item. Total: ${ctx.items + 1}`);
    },
  },

  // State entry handlers
  onEnter: {
    confirmed: (ctx, { log }) => {
      log(`Order confirmed: ${ctx.items} items, $${ctx.total}`);
    },
    shipped: (ctx, { log }) => {
      log('Package shipped!');
    },
  },

  // State exit handlers
  onExit: {
    draft: (ctx, { log }) => {
      log('Leaving draft state');
    },
  },

  // Auto-timers (trigger event after delay)
  timers: {
    processing: { send: 'COMPLETE', delay: 2000 },
  },

  // Optional logger
  logger: console.log,
});

// Usage
order.send('ADD_ITEM');
order.send('SUBMIT');

console.log(order.state);   // 'pending'
console.log(order.context); // { items: 1, total: 29.99 }

// Export to XState
console.log(order.toXState());
```

### Behavior Helpers

Callbacks receive `(ctx, helpers)`:

| Helper | Description |
|--------|-------------|
| `ctx` | Current context (read-only snapshot) |
| `set(obj)` | Merge object into context |
| `send(event)` | Trigger a transition |
| `log(msg)` | Log message (if logger provided) |

---

## 2. With Kernel: `useMachine()`

For multi-machine orchestration and event listeners.

```typescript
import { Kernel, useMachine } from '@quazardous/quarkernel';

const kernel = new Kernel();

const order = useMachine(kernel, {
  prefix: 'order',  // Event prefix
  initial: 'draft',
  context: { items: 0 },
  states: {
    draft:     { on: { SUBMIT: 'pending' } },
    pending:   { on: { APPROVE: 'confirmed' } },
    confirmed: {},
  },
});

const payment = useMachine(kernel, {
  prefix: 'payment',
  initial: 'pending',
  states: {
    pending:    { on: { PROCESS: 'processing' } },
    processing: { on: { SUCCESS: 'paid', FAIL: 'failed' } },
    paid:       {},
    failed:     { on: { RETRY: 'processing' } },
  },
});

// Listen to events
kernel.on('order:enter:confirmed', async () => {
  console.log('Order confirmed, processing payment...');
  await payment.send('PROCESS');
});

kernel.on('payment:enter:paid', () => {
  console.log('Payment successful!');
});

// Wildcards
kernel.on('*:transition', (e) => {
  console.log(`[${e.data.machine}] ${e.data.from} → ${e.data.to}`);
});

kernel.on('order:*', (e) => {
  console.log('Order event:', e.name);
});
```

---

## Event Mapping

Events emitted on the kernel (for `useMachine`):

| Event Pattern | When | Data |
|---------------|------|------|
| `{prefix}:enter:{state}` | Entering a state | `{ state, from?, to?, event? }` |
| `{prefix}:exit:{state}` | Exiting a state | `{ state, from, to, event }` |
| `{prefix}:transition` | Any transition | `{ from, to, event, payload? }` |
| `{prefix}:transition:{event}` | Specific event | `{ from, to, event, payload? }` |
| `{prefix}:guard:rejected` | Guard blocked | `{ state, event }` |

### Examples

```typescript
// Specific state
kernel.on('order:enter:confirmed', handler);
kernel.on('order:exit:draft', handler);

// Any state (wildcard)
kernel.on('order:enter:*', handler);

// Any machine
kernel.on('*:transition', handler);

// Specific transition event
kernel.on('order:transition:SUBMIT', handler);
```

---

## XState Compatibility

### Export to XState

```typescript
// From createMachine
const xstate = order.toXState();
// {
//   id: 'order',
//   initial: 'draft',
//   context: { items: 0, total: 0 },
//   states: {
//     draft: { on: { ADD_ITEM: 'draft', SUBMIT: 'pending' } },
//     ...
//   }
// }

// From useMachine
import { toXStateFormat } from '@quazardous/quarkernel/fsm';
const xstate = toXStateFormat(machineConfig);
```

### Import from XState

```typescript
import { fromXState, useMachine } from '@quazardous/quarkernel/fsm';

const xstateConfig = {
  id: 'player',
  initial: 'stopped',
  states: {
    stopped: { on: { PLAY: 'playing' } },
    playing: { on: { PAUSE: 'paused', STOP: 'stopped' } },
    paused:  { on: { PLAY: 'playing', STOP: 'stopped' } },
  },
};

const config = fromXState(xstateConfig, {
  prefix: 'player',
  guards: {
    canPlay: (ctx) => ctx.hasPermission,
  },
  actions: {
    logPlay: (ctx) => console.log('Playing!'),
  },
});

const player = useMachine(kernel, config);
```

---

## API Reference

### `createMachine(config)`

| Option | Type | Description |
|--------|------|-------------|
| `id` | `string` | Machine identifier |
| `initial` | `string` | Initial state |
| `context` | `object` | Initial context |
| `states` | `Record<string, StateNode>` | State definitions |
| `on` | `Record<string, BehaviorFn>` | Event handlers |
| `onEnter` | `Record<string, BehaviorFn>` | Entry handlers |
| `onExit` | `Record<string, BehaviorFn>` | Exit handlers |
| `timers` | `Record<string, TimerDef>` | Auto-timers |
| `logger` | `(msg: string) => void` | Logger function |

Returns `BehaviorMachine`:

| Property/Method | Description |
|-----------------|-------------|
| `.state` | Current state |
| `.context` | Current context |
| `.send(event, payload?)` | Trigger transition |
| `.can(event)` | Check if transition valid |
| `.transitions()` | Get available events |
| `.toXState()` | Export to XState format |
| `.toJSON()` | Serialize state |
| `.restore(snapshot)` | Restore from snapshot |
| `.destroy()` | Cleanup |

### `useMachine(kernel, config)`

| Option | Type | Description |
|--------|------|-------------|
| `prefix` | `string` | Event prefix |
| `initial` | `string` | Initial state |
| `context` | `object` | Initial context |
| `states` | `Record<string, StateNode>` | State definitions |
| `allowForce` | `boolean` | Allow force transitions |
| `trackHistory` | `boolean` | Track history |
| `snapshot` | `MachineSnapshot` | Restore from snapshot |

Returns `Machine` with same methods.
