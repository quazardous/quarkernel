# @quazardous/quarkernel-vue

Vue 3 adapter for QuarKernel - seamless event kernel integration with Vue's reactivity system.

## Installation

```bash
npm install @quazardous/quarkernel @quazardous/quarkernel-vue
# or
pnpm add @quazardous/quarkernel @quazardous/quarkernel-vue
```

## Usage

### 1. Install the Plugin

```typescript
import { createApp } from 'vue';
import { createKernel } from '@quazardous/quarkernel';
import { QuarKernelPlugin } from '@quazardous/quarkernel-vue';
import App from './App.vue';

const qk = createKernel();
const app = createApp(App);

app.use(QuarKernelPlugin, { kernel });
app.mount('#app');
```

### 2. Use in Components

```vue
<script setup lang="ts">
import { useKernel } from '@quazardous/quarkernel-vue';
import { onMounted } from 'vue';

const qk = useKernel();

onMounted(() => {
  qk.on('user:login', async (event) => {
    console.log('User logged in:', event.data);
  });
});

async function login() {
  await qk.emit('user:login', { userId: '123' });
}
</script>
```

## API

### QuarKernelPlugin

Vue plugin that registers the kernel instance globally.

**Options:**
- `kernel`: Kernel instance to provide globally (required)

### useKernel()

Composable to access the kernel instance from within component setup functions.

**Returns:** The kernel instance provided via the plugin

**Throws:**
- Error if called outside setup() context
- Error if plugin not installed

**SSR Warning:** Warns when accessed during server-side rendering

## TypeScript Support

Full TypeScript support with typed events:

```typescript
interface AppEvents {
  'user:login': { userId: string };
  'user:logout': { userId: string };
}

const qk = createKernel<AppEvents>();

// In component
const qk = useKernel<typeof kernel>();
```

## License

MIT
