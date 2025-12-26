# QuarKernel FSM

State machine abstraction with state-centric format.

## Two APIs

| API | Use Case |
|-----|----------|
| `createMachine()` | Standalone, self-contained, behaviors inline |
| `useMachine()` | With external kernel, event orchestration |

---

## 1. Standalone: `createMachine()`

Self-contained machine with **state-centric** behaviors (entry/exit/after inside each state).

```typescript
import { createMachine } from '@quazardous/quarkernel/fsm';

const trafficLight = createMachine({
  id: 'trafficLight',
  initial: 'green',
  context: {},

  states: {
    green: {
      entry: (ctx, { log }) => log('GREEN'),
      after: { delay: 3000, send: 'TIMER' },
      on: { TIMER: 'yellow' },
    },
    yellow: {
      entry: (ctx, { log }) => log('YELLOW'),
      after: { delay: 1000, send: 'TIMER' },
      on: { TIMER: 'red' },
    },
    red: {
      entry: (ctx, { log }) => log('RED'),
      after: { delay: 2000, send: 'TIMER' },
      on: { TIMER: 'green' },
    },
  },
});

trafficLight.send('TIMER'); // green → yellow
console.log(trafficLight.state); // 'yellow'
```

### State Config

Each state can have:

| Property | Type | Description |
|----------|------|-------------|
| `entry` | `(ctx, helpers) => void` | Called when entering state |
| `exit` | `(ctx, helpers) => void` | Called when exiting state |
| `after` | `{ delay: number, send: string }` | Auto-send event after delay |
| `on` | `Record<string, string>` | Transitions: `{ EVENT: 'targetState' }` |

### Behavior Helpers

Callbacks `entry` and `exit` receive `(ctx, helpers)`:

```typescript
entry: (ctx, { set, send }) => {
  // ctx: current context (read-only snapshot)
  set({ count: ctx.count + 1 });  // Merge into context
  send('NEXT');                    // Trigger transition
}
```

**Built-in helpers** (always available):

| Helper | Description |
|--------|-------------|
| `set(obj)` | Merge object into context: `set({ count: 5 })` |
| `send(event)` | Trigger a transition: `send('NEXT')` |
| `log(msg)` | Log message (default: `console.log`) |

**Custom helpers** via `helpers` config (can override built-ins):

```typescript
const machine = createMachine({
  id: 'test',
  initial: 'idle',
  helpers: {
    log: console.log,
    notify: (msg) => toast.show(msg),
    track: (event) => analytics.track(event),
  },
  states: {
    idle: {
      entry: (ctx, { log }) => log('Entered idle'),
      exit: (ctx, { notify }) => notify('Leaving idle'),
    },
    active: {
      entry: (ctx, { set, track }) => {
        set({ activatedAt: Date.now() });
        track('state:active');
      },
    },
  },
});
```

### Global Event Handlers

Handle events at machine level (not state-specific):

```typescript
const order = createMachine({
  id: 'order',
  initial: 'draft',
  context: { items: 0, total: 0 },

  states: {
    draft: { on: { ADD_ITEM: 'draft', SUBMIT: 'pending' } },
    pending: { on: { APPROVE: 'confirmed' } },
    confirmed: {
      entry: (ctx, { log }) => log(`Confirmed: ${ctx.items} items`),
    },
  },

  // Global: called on ANY transition with this event
  on: {
    ADD_ITEM: (ctx, { set, log }) => {
      set({ items: ctx.items + 1, total: ctx.total + 29.99 });
      log(`Item added. Total: $${ctx.total + 29.99}`);
    },
  },
});
```

---

## File Format

Save machines as ES modules:

```javascript
// trafficLight.js
export default {
  id: 'trafficLight',
  initial: 'green',
  context: {},
  states: {
    green: {
      entry: (ctx, { log }) => log('GREEN'),
      after: { delay: 3000, send: 'TIMER' },
      on: { TIMER: 'yellow' },
    },
    yellow: {
      entry: (ctx, { log }) => log('YELLOW'),
      after: { delay: 1000, send: 'TIMER' },
      on: { TIMER: 'red' },
    },
    red: {
      entry: (ctx, { log }) => log('RED'),
      after: { delay: 2000, send: 'TIMER' },
      on: { TIMER: 'green' },
    },
  },
};
```

Load and use:

```javascript
import { createMachine } from '@quazardous/quarkernel/fsm';
import trafficLightConfig from './trafficLight.js';

const machine = createMachine({
  ...trafficLightConfig,
  logger: console.log,
});
```

---

## 2. With Kernel: `useMachine()`

For multi-machine orchestration and event listeners.

```typescript
import { Kernel, useMachine } from '@quazardous/quarkernel';

const qk = new Kernel();

const order = useMachine(qk, {
  prefix: 'order',
  initial: 'draft',
  states: {
    draft:     { on: { SUBMIT: 'pending' } },
    pending:   { on: { APPROVE: 'confirmed' } },
    confirmed: {},
  },
});

const payment = useMachine(qk, {
  prefix: 'payment',
  initial: 'pending',
  states: {
    pending:    { on: { PROCESS: 'processing' } },
    processing: { on: { SUCCESS: 'paid', FAIL: 'failed' } },
    paid:       {},
    failed:     {},
  },
});

// Cross-machine orchestration
qk.on('order:enter:confirmed', async () => {
  console.log('Order confirmed, processing payment...');
  await payment.send('PROCESS');
});

qk.on('payment:enter:paid', () => {
  console.log('Payment successful!');
});

// Wildcards
qk.on('*:transition', (e) => {
  console.log(`[${e.data.machine}] ${e.data.from} → ${e.data.to}`);
});
```

---

## Event Mapping

Events emitted on the kernel (for `useMachine`):

| Event Pattern | When |
|---------------|------|
| `{prefix}:enter:{state}` | Entering a state |
| `{prefix}:exit:{state}` | Exiting a state |
| `{prefix}:transition` | Any transition |
| `{prefix}:transition:{event}` | Specific event |

---

## API Reference

### `createMachine(config)`

| Option | Type | Description |
|--------|------|-------------|
| `id` | `string` | Machine identifier |
| `initial` | `string` | Initial state |
| `context` | `object` | Initial context |
| `states` | `Record<string, StateConfig>` | State definitions with entry/exit/after/on |
| `on` | `Record<string, BehaviorFn>` | Global event handlers |
| `helpers` | `object` | Custom helpers (merged with built-ins) |

### `StateConfig`

| Property | Type | Description |
|----------|------|-------------|
| `entry` | `BehaviorFn` | Called on state entry |
| `exit` | `BehaviorFn` | Called on state exit |
| `after` | `{ delay, send }` | Auto-transition after delay |
| `on` | `Record<string, string>` | Event → target state |

### `BehaviorFn`

```typescript
type BehaviorFn = (ctx: Context, helpers: BehaviorHelpers) => void;

// Built-in helpers (always available)
interface BuiltInHelpers {
  set: (partial: Partial<Context>) => void;
  send: (event: string) => void;
  log: (message: string) => void;  // default: console.log
}

// BehaviorHelpers = BuiltInHelpers + custom helpers from config
```
