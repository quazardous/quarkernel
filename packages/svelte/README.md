# @quazardous/quarkernel-svelte

Svelte 5 adapter for QuarKernel - context API and composables for seamless event kernel integration.

## Installation

```bash
npm install @quazardous/quarkernel @quazardous/quarkernel-svelte
```

## Features

- **Context API**: `setKernel()`/`getKernel()` for dependency injection
- **Auto-cleanup**: `onEvent()` composable with automatic unsubscribe on destroy
- **Type-safe**: Full TypeScript support
- **Svelte 5**: Designed for Svelte 5+ with modern context system
- **Zero runtime deps**: Only peer dependencies on Svelte and QuarKernel

## Usage

### Basic Setup

```svelte
<!-- App.svelte (root component) -->
<script>
  import { createKernel } from '@quazardous/quarkernel';
  import { setKernel } from '@quazardous/quarkernel-svelte';

  const qk = createKernel();
  setKernel(kernel);
</script>

<ChildComponent />
```

### Using in Child Components

```svelte
<!-- ChildComponent.svelte -->
<script>
  import { getKernel, onEvent } from '@quazardous/quarkernel-svelte';

  // Get kernel from context
  const qk = getKernel();

  // Register listener with auto-cleanup
  onEvent('user:login', async (event) => {
    console.log('User logged in:', event.data);
  });

  // Manual emit
  function handleClick() {
    qk.emit('button:clicked', { timestamp: Date.now() });
  }
</script>

<button on:click={handleClick}>Click me</button>
```

### Wildcard Patterns

```svelte
<script>
  import { onEvent } from '@quazardous/quarkernel-svelte';

  // Listen to all user events
  onEvent('user:*', (event) => {
    console.log('User event:', event);
  });
</script>
```

### Manual Cleanup

```svelte
<script>
  import { onEvent } from '@quazardous/quarkernel-svelte';

  // onEvent returns unsubscribe function
  const unsubscribe = onEvent('temp:event', (event) => {
    console.log('Temporary listener');
  });

  function cleanup() {
    unsubscribe(); // Remove listener before component destroys
  }
</script>
```

## API

### `setKernel(kernel)`

Store kernel instance in Svelte context. Must be called during component initialization.

**Parameters:**
- `kernel`: Kernel instance to provide to child components

**Throws:**
- Error if kernel is null/undefined

### `getKernel()`

Retrieve kernel instance from Svelte context.

**Returns:**
- Kernel instance

**Throws:**
- `KernelContextError` if called outside context or before `setKernel()`

### `onEvent(pattern, handler)`

Register event listener with automatic cleanup on component destroy.

**Parameters:**
- `pattern`: Event name or wildcard pattern (e.g., `'user:*'`)
- `handler`: Event handler function `(event, ctx) => void | Promise<void>`

**Returns:**
- Unsubscribe function for manual cleanup

**Throws:**
- `KernelContextError` if kernel not in context

## License

MIT
