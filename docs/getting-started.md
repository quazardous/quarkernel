# Getting Started with QuarKernel v2

QuarKernel is a lightweight, TypeScript-first event kernel with unique features like dependency-ordered listeners, shared context, and composite events. It works seamlessly in browsers, Node.js, and Web Workers.

## Installation

### npm

```bash
npm install @quazardous/quarkernel
```

### CDN (unpkg)

```html
<script type="module">
  import { createKernel } from 'https://unpkg.com/@quazardous/quarkernel@2/dist/index.js';
</script>
```

### CDN (jsdelivr)

```html
<script type="module">
  import { createKernel } from 'https://cdn.jsdelivr.net/npm/@quazardous/quarkernel@2/+esm';
</script>
```

## Basic Usage

### Your First Event

Here's a complete example in just 10 lines:

```typescript
import { createKernel } from '@quazardous/quarkernel';

// Create kernel instance
const qk = createKernel();

// Listen for events
qk.on('user:login', async (event, ctx) => {
  console.log('User logged in:', event.data.userId);
});

// Emit event
await qk.emit('user:login', { userId: '123' });
```

### TypeScript Support

QuarKernel is TypeScript-first with full type safety:

```typescript
import { createKernel } from '@quazardous/quarkernel';

// Define your event types
interface Events {
  'user:login': { userId: string; timestamp: number };
  'user:logout': { userId: string };
  'app:ready': undefined;
}

// Create typed kernel
const qk = createKernel<Events>();

// TypeScript ensures correct data types
qk.on('user:login', async (event, ctx) => {
  // event.data is typed as { userId: string; timestamp: number }
  console.log(event.data.userId); // ✅ OK
  console.log(event.data.invalidProp); // ❌ TypeScript error
});

// Emit with type checking
await qk.emit('user:login', {
  userId: '123',
  timestamp: Date.now()
}); // ✅ OK

await qk.emit('user:login', { userId: 123 }); // ❌ TypeScript error
```

## Core Concepts

### Event Object

Every listener receives a `KernelEvent` object with:

```typescript
qk.on('user:login', async (event, ctx) => {
  event.name;      // 'user:login' - event name
  event.data;      // { userId: '123' } - immutable payload
  event.context;   // {} - shared mutable context for passing data between listeners
  event.timestamp; // 1234567890 - when event was created

  event.stopPropagation(); // Skip remaining listeners
});
```

### Listener Context

The second parameter provides utilities for each listener:

```typescript
qk.on('user:login', async (event, ctx) => {
  ctx.id;    // 'listener_1' - this listener's ID
  ctx.off(); // Remove this listener
  ctx.emit('another:event', data); // Emit another event
  ctx.stopPropagation(); // Stop event propagation
});
```

### Shared Context

Pass data between listeners using `event.context`:

```typescript
// First listener fetches user
qk.on('user:login', async (event, ctx) => {
  const user = await fetchUser(event.data.userId);
  event.context.user = user; // Store in shared context
}, { id: 'fetch-user' });

// Second listener uses the fetched user
qk.on('user:login', async (event, ctx) => {
  console.log('User name:', event.context.user.name);
}, { id: 'display-user', after: 'fetch-user' });
```

### Dependency Ordering

Control listener execution order with `after` option:

```typescript
// Listener 'auth' runs first
qk.on('user:login', async (event, ctx) => {
  event.context.user = await authenticate(event.data);
}, { id: 'auth' });

// Listener 'analytics' runs AFTER 'auth'
qk.on('user:login', async (event, ctx) => {
  track('login', event.context.user);
}, { id: 'analytics', after: 'auth' });

// Listener 'notification' runs AFTER both 'auth' and 'analytics'
qk.on('user:login', async (event, ctx) => {
  notify('Welcome!', event.context.user);
}, { id: 'notification', after: ['auth', 'analytics'] });
```

### Cleanup with Unbind

Always clean up listeners to prevent memory leaks:

```typescript
// Method 1: Use returned unbind function
const unbind = qk.on('user:login', handler);
unbind(); // Remove listener

// Method 2: Use qk.off()
qk.off('user:login', handler);

// Method 3: Use listener context
qk.on('user:login', async (event, ctx) => {
  if (someCondition) {
    ctx.off(); // Remove self
  }
});

// Method 4: AbortSignal (modern cleanup)
const controller = new AbortController();
qk.on('user:login', handler, { signal: controller.signal });
controller.abort(); // Remove listener
```

## Event Patterns

### Wildcards

Match multiple events with wildcard patterns:

```typescript
// Match any user event (user:login, user:logout, user:update)
qk.on('user:*', async (event, ctx) => {
  console.log('User event:', event.name);
});

// Match all events
qk.on('**', async (event, ctx) => {
  console.log('Any event:', event.name);
});
```

### Namespaces

Organize events with namespaces using `:` delimiter:

```typescript
// Namespace examples
qk.emit('user:login', data);
qk.emit('user:logout', data);
qk.emit('admin:create', data);
qk.emit('admin:delete', data);

// Listen to specific namespace
qk.on('user:*', handler);  // Only user events
qk.on('admin:*', handler); // Only admin events
```

## Environment-Specific Examples

### Browser

```html
<!DOCTYPE html>
<html>
<head>
  <title>QuarKernel Browser Example</title>
</head>
<body>
  <button id="loginBtn">Login</button>

  <script type="module">
    import { createKernel } from 'https://unpkg.com/@quazardous/quarkernel@2/dist/index.js';

    const qk = createKernel();

    // Listen for login events
    qk.on('user:login', async (event, ctx) => {
      console.log('User logged in:', event.data);
      event.context.user = { name: 'John Doe' };
    });

    // Button click emits event
    document.getElementById('loginBtn').addEventListener('click', () => {
      qk.emit('user:login', { userId: '123', timestamp: Date.now() });
    });
  </script>
</body>
</html>
```

### Node.js

```javascript
// server.js
import { createKernel } from '@quazardous/quarkernel';

const qk = createKernel();

// Logger middleware
qk.on('http:request', async (event, ctx) => {
  console.log(`${event.data.method} ${event.data.url}`);
  event.context.startTime = Date.now();
}, { id: 'logger' });

// Auth middleware
qk.on('http:request', async (event, ctx) => {
  event.context.user = await verifyToken(event.data.token);
}, { id: 'auth', after: 'logger' });

// Response handler
qk.on('http:request', async (event, ctx) => {
  const duration = Date.now() - event.context.startTime;
  console.log(`Request completed in ${duration}ms by ${event.context.user?.name}`);
}, { id: 'response', after: ['logger', 'auth'] });

// Emit on HTTP request
app.use(async (req, res, next) => {
  await qk.emit('http:request', {
    method: req.method,
    url: req.url,
    token: req.headers.authorization
  });
  next();
});
```

### Web Worker

```javascript
// main.js
import { createKernel } from '@quazardous/quarkernel';

const qk = createKernel();

qk.on('worker:result', async (event, ctx) => {
  console.log('Worker result:', event.data);
});

const worker = new Worker('worker.js', { type: 'module' });
worker.onmessage = (e) => {
  qk.emit('worker:result', e.data);
};

// worker.js
import { createKernel } from '@quazardous/quarkernel';

const qk = createKernel();

qk.on('process:image', async (event, ctx) => {
  const processed = heavyImageProcessing(event.data);
  self.postMessage(processed);
});

self.onmessage = (e) => {
  qk.emit('process:image', e.data);
};
```

## Next Steps

- **[API Reference](./api-reference.md)** - Complete API documentation
- **[Demos](../demos/)** - Real-world examples and use cases
- **[Migration Guide](./migration-v1-to-v2.md)** - Upgrading from v1

## Quick Reference

```typescript
// Create kernel
const qk = createKernel<Events>(options);

// Subscribe
const unbind = qk.on(eventName, listener, options);
qk.once(eventName, listener);
qk.once(eventName, predicate, listener);

// Unsubscribe
unbind();
qk.off(eventName, listener);
qk.off(eventName); // Remove all listeners for event

// Emit
await qk.emit(eventName, data);
await qk.emitSerial(eventName, data);

// Utilities
qk.listenerCount(eventName);
qk.eventNames();

// Listener options
{
  id: 'listener-id',           // Custom ID
  priority: 10,                 // Higher = executed first
  after: ['dep1', 'dep2'],      // Dependencies
  once: true,                   // Auto-remove after first call
  signal: abortController.signal // AbortSignal for cleanup
}

// Kernel options
{
  delimiter: ':',               // Namespace delimiter
  wildcard: true,               // Enable wildcards
  maxListeners: 100,            // Warn when exceeded
  debug: false,                 // Debug logging
  errorBoundary: true,          // Catch listener errors
  onError: (error) => {}        // Error handler
}
```
