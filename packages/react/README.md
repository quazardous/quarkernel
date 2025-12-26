# @quazardous/quarkernel-react

React 18+ bindings for QuarKernel - Context provider and hooks with auto-cleanup.

## Installation

```bash
npm install @quazardous/quarkernel @quazardous/quarkernel-react
```

## Features

- **KernelProvider**: Context provider for dependency injection
- **useKernel()**: Access kernel anywhere in tree
- **useOn()**: Register listener with auto-cleanup on unmount
- **useEventState()**: Reactive state from events
- **Type-safe**: Full TypeScript support
- **SSR-safe**: Warns on server-side access

## Usage

### Basic Setup

```tsx
import { createKernel } from '@quazardous/quarkernel';
import { KernelProvider } from '@quazardous/quarkernel-react';

const qk = createKernel();

function App() {
  return (
    <KernelProvider kernel={kernel}>
      <MyComponent />
    </KernelProvider>
  );
}
```

### useKernel()

Access kernel instance from any component:

```tsx
import { useKernel } from '@quazardous/quarkernel-react';

function MyComponent() {
  const qk = useKernel();

  const handleClick = () => {
    qk.emit('button:clicked', { timestamp: Date.now() });
  };

  return <button onClick={handleClick}>Click me</button>;
}
```

### useOn()

Register listener with automatic cleanup on unmount:

```tsx
import { useOn } from '@quazardous/quarkernel-react';

function Notifications() {
  useOn('notification:new', (event) => {
    console.log('New notification:', event.data);
  });

  // Listener auto-removed when component unmounts
  return <div>Listening for notifications...</div>;
}
```

### useEventState()

Reactive state derived from events:

```tsx
import { useEventState } from '@quazardous/quarkernel-react';

function Counter() {
  const count = useEventState('counter:updated', 0, (event) => event.data.value);

  return <div>Count: {count}</div>;
}
```

### Wildcard Patterns

```tsx
import { useOn } from '@quazardous/quarkernel-react';

function UserTracker() {
  useOn('user:*', (event) => {
    console.log('User event:', event.name, event.data);
  });

  return null;
}
```

## API

### `<KernelProvider kernel={kernel}>`

Context provider for kernel instance.

**Props:**
- `kernel`: Kernel instance (required)
- `children`: React children

### `useKernel()`

Hook to access kernel from context.

**Returns:** Kernel instance

**Throws:** `KernelProviderError` if used outside provider

### `useOn(event, handler, options?)`

Register event listener with auto-cleanup.

**Parameters:**
- `event`: Event name or wildcard pattern
- `handler`: `(event, ctx) => void | Promise<void>`
- `options`: Listener options (id, after, priority)

**Returns:** Unsubscribe function

### `useEventState(event, initial, selector?)`

Reactive state from events.

**Parameters:**
- `event`: Event name to listen for
- `initial`: Initial state value
- `selector`: Optional `(event) => T` to extract value

**Returns:** Current state value

## License

MIT
