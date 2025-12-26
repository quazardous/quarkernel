# QuarKernel

[![npm version](https://img.shields.io/npm/v/@quazardous/quarkernel.svg?style=flat-square)](https://www.npmjs.com/package/@quazardous/quarkernel)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@quazardous/quarkernel?style=flat-square)](https://bundlephobia.com/package/@quazardous/quarkernel)
[![license](https://img.shields.io/npm/l/@quazardous/quarkernel.svg?style=flat-square)](https://github.com/quazardous/quarkernel/blob/main/LICENSE)

**Event orchestration with dependency ordering, shared context, and state machines.**

TypeScript-first. Zero dependencies. < 2KB gzipped.

[![Try QK Studio](https://img.shields.io/badge/Try_it_live-QK_Studio-blue?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBvbHlnb24gcG9pbnRzPSI1IDMgMTkgMTIgNSAyMSA1IDMiPjwvcG9seWdvbj48L3N2Zz4=)](https://quazardous.github.io/quarkernel/qk-studio/)
[![Try FSM Studio](https://img.shields.io/badge/Try_it_live-FSM_Studio-purple?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiPjxjaXJjbGUgY3g9IjYiIGN5PSIxMiIgcj0iMyIvPjxjaXJjbGUgY3g9IjE4IiBjeT0iMTIiIHI9IjMiLz48bGluZSB4MT0iOSIgeTE9IjEyIiB4Mj0iMTUiIHkyPSIxMiIvPjwvc3ZnPg==)](https://quazardous.github.io/quarkernel/fsm-studio/)

---

## Why QuarKernel?

```typescript
// Other event libs: fire and pray
emitter.emit('user:login', data);

// QuarKernel: orchestrate with confidence
qk.on('user:login', fetchUser, { id: 'fetch' });
qk.on('user:login', logAnalytics, { after: ['fetch'] }); // Guaranteed order
qk.on('user:login', (e) => greet(e.context.user));       // Shared context
```

**What makes it different:**

| Feature | mitt | emittery | **QuarKernel** |
|---------|:----:|:--------:|:--------------:|
| Dependency ordering | - | - | **Yes** |
| Shared context | - | - | **Yes** |
| Composite events | - | - | **Yes** |
| Wildcards | - | - | **Yes** |
| Async/await | - | Yes | **Yes** |
| TypeScript | Yes | Yes | **Yes** |
| < 2KB | Yes | Yes | **Yes** |

---

## Install

```bash
npm install @quazardous/quarkernel
```

```html
<!-- CDN -->
<script src="https://unpkg.com/@quazardous/quarkernel@2/dist/index.umd.js"></script>
```

---

## Quick Start

```typescript
import { createKernel } from '@quazardous/quarkernel';

const qk = createKernel();

// 1. Dependency ordering - control execution sequence
qk.on('checkout', async (e) => {
  e.context.inventory = await checkStock(e.data.items);
}, { id: 'stock' });

qk.on('checkout', async (e) => {
  // Runs AFTER stock check - guaranteed
  await processPayment(e.data.card, e.context.inventory);
}, { after: ['stock'] });

await qk.emit('checkout', { items: ['sku-123'], card: 'tok_visa' });
```

```typescript
// 2. Composite events - react to event combinations
import { Composition } from '@quazardous/quarkernel';

const checkout = new Composition([
  [qk, 'cart:ready'],
  [qk, 'payment:confirmed']
]);

checkout.onComposed(() => {
  console.log('Both events fired - proceed to shipping!');
});
```

```typescript
// 3. Wildcards - catch event patterns
qk.on('user:*', (e) => console.log('User action:', e.name));
// Matches: user:login, user:logout, user:signup...
```

---

## State Machines (FSM)

Built-in finite state machine support with XState-compatible format:

```typescript
import { createMachine } from '@quazardous/quarkernel/fsm';

const order = createMachine({
  id: 'order',
  initial: 'draft',
  context: { items: 0 },
  states: {
    draft: { on: { SUBMIT: 'pending' } },
    pending: { on: { APPROVE: 'confirmed', REJECT: 'draft' } },
    confirmed: { on: { SHIP: 'shipped' } },
    shipped: {}
  },
  onEnter: {
    confirmed: (ctx, { log }) => log('Order confirmed!')
  },
  on: {
    SUBMIT: (ctx, { set }) => set({ submittedAt: Date.now() })
  }
});

order.send('SUBMIT');
console.log(order.state); // 'pending'
```

**Features:**
- XState import/export (`fromXState`, `toXState`)
- Behavior helpers: `set()`, `send()`, `log()`
- Auto-timers for delayed transitions
- Visual debugging with [FSM Studio](https://quazardous.github.io/quarkernel/fsm-studio/)

---

## Framework Adapters

Official bindings with auto-cleanup on unmount:

| Package | Framework | Docs |
|---------|-----------|------|
| `@quazardous/quarkernel-vue` | Vue 3 | [README](./packages/vue/README.md) |
| `@quazardous/quarkernel-react` | React 18+ | [README](./packages/react/README.md) |
| `@quazardous/quarkernel-svelte` | Svelte 5 | [README](./packages/svelte/README.md) |

```bash
# Vue
npm install @quazardous/quarkernel @quazardous/quarkernel-vue

# React
npm install @quazardous/quarkernel @quazardous/quarkernel-react

# Svelte
npm install @quazardous/quarkernel @quazardous/quarkernel-svelte
```

---

## Documentation

**Guides:**
- [Getting Started](./docs/getting-started.md) - Installation, first event, basic usage
- [API Reference](./docs/api-reference.md) - Complete API documentation
- [Advanced Patterns](./docs/advanced-qk.md) - Multi-machine, composition, sagas
- [Async Integration](./docs/async-patterns.md) - QK + FSM + Promises synergies
- [Migration v1 to v2](./docs/migration-v1-to-v2.md) - Upgrade guide

**Packages:**
- [Core package](./packages/quarkernel/README.md) - Main QuarKernel library

**Resources:**
- [Benchmarks](./docs/benchmarks.md) - Performance comparisons
- [Demos](./demos/README.md) - Live examples

---

## Use Cases

**Request pipeline** - Auth, validate, transform, respond in guaranteed order

**Game events** - Combo detection with composite events

**Form wizards** - Step dependencies with shared validation context

**Order workflows** - State machines for order lifecycle (draft → pending → confirmed → shipped)

**Analytics** - Wildcard listeners for all `track:*` events

**Microservices** - Event choreography with dependency graphs

**UI flows** - FSM-driven modals, wizards, and multi-step forms

---

## License

[MIT](./LICENSE) - Made by [quazardous](https://github.com/quazardous)
