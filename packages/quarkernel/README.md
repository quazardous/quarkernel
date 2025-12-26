# @quazardous/quarkernel

Event orchestration with dependency ordering and shared context.

[![npm version](https://img.shields.io/npm/v/@quazardous/quarkernel.svg?style=flat-square)](https://www.npmjs.com/package/@quazardous/quarkernel)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@quazardous/quarkernel?style=flat-square)](https://bundlephobia.com/package/@quazardous/quarkernel)

## Features

- **Dependency ordering** - Guarantee listener execution order
- **Shared context** - Pass state between listeners
- **Composite events** - React to event combinations
- **Wildcards** - Pattern matching (`user:*`)
- **TypeScript-first** - Full type safety
- **Zero dependencies** - No runtime deps
- **< 2KB gzipped**

## Installation

```bash
npm install @quazardous/quarkernel
```

```html
<!-- CDN -->
<script src="https://unpkg.com/@quazardous/quarkernel@2/dist/index.umd.js"></script>
```

## Quick Start

```typescript
import { createKernel } from '@quazardous/quarkernel';

const kernel = createKernel();

// Dependency ordering
kernel.on('checkout', async (e) => {
  e.context.stock = await checkStock(e.data.items);
}, { id: 'stock' });

kernel.on('checkout', async (e) => {
  // Runs AFTER stock check
  await processPayment(e.data.card, e.context.stock);
}, { after: ['stock'] });

await kernel.emit('checkout', { items: ['sku-123'], card: 'tok_visa' });
```

## Composition

React to multiple events:

```typescript
import { Composition } from '@quazardous/quarkernel';

const checkout = new Composition([
  [kernel, 'cart:ready'],
  [kernel, 'payment:confirmed']
]);

checkout.on('composite', () => {
  console.log('Both events fired!');
});
```

## Framework Adapters

- `@quazardous/quarkernel-vue` - Vue 3 plugin
- `@quarkernel/react` - React hooks
- `@quazardous/quarkernel-svelte` - Svelte 5 context

## Documentation

- [Getting Started](../../docs/getting-started.md)
- [API Reference](../../docs/api-reference.md)
- [Migration v1 to v2](../../docs/migration-v1-to-v2.md)

## License

MIT
