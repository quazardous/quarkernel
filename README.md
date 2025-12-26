# QuarKernel

[![npm version](https://img.shields.io/npm/v/@quazardous/quarkernel.svg?style=flat-square)](https://www.npmjs.com/package/@quazardous/quarkernel)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@quazardous/quarkernel?style=flat-square)](https://bundlephobia.com/package/@quazardous/quarkernel)
[![license](https://img.shields.io/npm/l/@quazardous/quarkernel.svg?style=flat-square)](https://github.com/quazardous/quarkernel/blob/main/LICENSE)

**Event orchestration with dependency ordering and shared context.**

TypeScript-first. Zero dependencies. < 2KB gzipped.

[![Try QK Studio](https://img.shields.io/badge/Try_it_live-QK_Studio-blue?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBvbHlnb24gcG9pbnRzPSI1IDMgMTkgMTIgNSAyMSA1IDMiPjwvcG9seWdvbj48L3N2Zz4=)](https://quazardous.github.io/quarkernel/studio/)

---

## Why QuarKernel?

```typescript
// Other event libs: fire and pray
emitter.emit('user:login', data);

// QuarKernel: orchestrate with confidence
kernel.on('user:login', fetchUser, { id: 'fetch' });
kernel.on('user:login', logAnalytics, { after: ['fetch'] }); // Guaranteed order
kernel.on('user:login', (e) => greet(e.context.user));       // Shared context
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

const kernel = createKernel();

// 1. Dependency ordering - control execution sequence
kernel.on('checkout', async (e) => {
  e.context.inventory = await checkStock(e.data.items);
}, { id: 'stock' });

kernel.on('checkout', async (e) => {
  // Runs AFTER stock check - guaranteed
  await processPayment(e.data.card, e.context.inventory);
}, { after: ['stock'] });

await kernel.emit('checkout', { items: ['sku-123'], card: 'tok_visa' });
```

```typescript
// 2. Composite events - react to event combinations
import { Composition } from '@quazardous/quarkernel';

const checkout = new Composition([
  [kernel, 'cart:ready'],
  [kernel, 'payment:confirmed']
]);

checkout.on('composite', () => {
  console.log('Both events fired - proceed to shipping!');
});
```

```typescript
// 3. Wildcards - catch event patterns
kernel.on('user:*', (e) => console.log('User action:', e.name));
// Matches: user:login, user:logout, user:signup...
```

---

## Framework Adapters

Official bindings with auto-cleanup on unmount:

| Package | Framework | Docs |
|---------|-----------|------|
| `@quazardous/quarkernel-vue` | Vue 3 | [README](./packages/vue/README.md) |
| `@quarkernel/react` | React 18+ | [README](./packages/react/README.md) |
| `@quazardous/quarkernel-svelte` | Svelte 5 | [README](./packages/svelte/README.md) |

```bash
# Vue
npm install @quazardous/quarkernel @quazardous/quarkernel-vue

# React
npm install @quazardous/quarkernel @quarkernel/react

# Svelte
npm install @quazardous/quarkernel @quazardous/quarkernel-svelte
```

---

## Documentation

**Guides:**
- [Getting Started](./docs/getting-started.md) - Installation, first event, basic usage
- [API Reference](./docs/api-reference.md) - Complete API documentation
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

**Analytics** - Wildcard listeners for all `track:*` events

**Microservices** - Event choreography with dependency graphs

---

## License

[MIT](./LICENSE) - Made by [quazardous](https://github.com/quazardous)
