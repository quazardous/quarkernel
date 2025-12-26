# QuarKernel Benchmarks

Performance comparison against popular event emitter libraries.

---

## Running

```bash
npm install
npm run bench
```

Output to file:
```bash
npm run bench > benchmark-results.txt 2>&1
```

---

## Test Environment

```
Node.js: v22.20.0
Platform: linux x64
CPU: AMD Ryzen 5 Pro 7535U
Iterations: 1,000,000
Default listeners: 10
```

---

## Results Summary

| Benchmark | mitt | Emittery | QuarKernel | Notes |
|-----------|------|----------|------------|-------|
| Simple Emit (10 listeners) | 11.19M | 651K | 199K | Baseline sync emit |
| Async Emit (10 listeners) | - | 566K | 180K | Native async support |
| Register/Unregister | 8.92M | 305K | 2.74M | Listener lifecycle |
| Many Listeners (100) | 3.33M | 675K | 20K | Scaling with listeners |
| Wildcard Events | 12.60M | - | 738K | Pattern matching |
| Multiple Event Types (10) | 6.91M | 923K | 362K | Event type diversity |

**Operations per second (higher is better)**

---

## Unique Features (QuarKernel only)

| Feature | Performance | Description |
|---------|-------------|-------------|
| Dependency Ordering | 272K ops/s | Guaranteed execution order with `after: ['id']` |
| Shared Context | 547K ops/s | Context sharing between listeners |

---

## What's Tested

| Benchmark | Description |
|-----------|-------------|
| Simple Emit | Basic event emission with 10 listeners |
| Async Emit | Async handlers (QuarKernel vs Emittery) |
| Register/Unregister | Listener lifecycle performance |
| Many Listeners | Scaling with 100 listeners |
| Wildcard Events | Pattern matching `user.*` |
| Multiple Event Types | 10 different event types |
| Dependency Ordering | QuarKernel-only: `after: ['id']` |
| Shared Context | QuarKernel-only: context propagation |

---

## Analysis

### Where QuarKernel excels

1. **Register/Unregister** (2.74M ops/s) - 9x faster than Emittery
2. **Shared Context** - No equivalent in other libraries
3. **Dependency Ordering** - Unique feature with good performance
4. **Wildcard Matching** (738K ops/s) - With regex caching

### Trade-offs

QuarKernel is slower than mitt for basic emit because:
- **Async-first**: All emit operations return Promises
- **Feature overhead**: Dependency checking, context creation, wildcard matching
- **Object allocation**: KernelEvent and ListenerContext per emit

### When to use QuarKernel

- **Use QuarKernel** when you need:
  - Guaranteed listener execution order
  - Shared context between listeners
  - Wildcard pattern matching
  - Async event handling

- **Use mitt** when you need:
  - Maximum raw performance
  - Simple fire-and-forget events
  - Minimal bundle size

---

## Optimization Tips

1. **Disable wildcards** if not needed:
   ```typescript
   const qk = createKernel({ wildcard: false });
   ```

2. **Avoid dependencies** when order doesn't matter:
   ```typescript
   // Slower
   qk.on('event', fn, { id: 'a' });
   qk.on('event', fn, { after: ['a'] });

   // Faster
   qk.on('event', fn);
   qk.on('event', fn);
   ```

3. **Use `once: true`** instead of manual cleanup:
   ```typescript
   qk.on('event', fn, { once: true });
   ```

4. **Batch related operations**:
   ```typescript
   // Emit once with context sharing instead of multiple emits
   await qk.emit('process', { items: [...] });
   ```

---

## Adding Custom Benchmarks

Edit `suite.js`:

```javascript
await runBenchmark('My Benchmark', () => {
  const kernel = new Kernel();
  const mittEmitter = mitt();

  kernel.on('test', () => {});
  mittEmitter.on('test', () => {});

  return [
    ['QuarKernel', kernel, () => kernel.emit('test', {})],
    ['mitt', mittEmitter, () => mittEmitter.emit('test', {})],
  ];
});
```

---

## Hardware Variance

Performance varies based on CPU, Node.js version, and V8 optimizations.
Always run benchmarks on your target environment.
