# Performance Analysis & Optimization Guide

Internal documentation for optimizing QuarKernel performance.

---

## Identified Bottlenecks

### 1. `emit()` - Pattern Matching (kernel.ts:219-222)

```typescript
// Current: O(n) array creation + O(n) filter on EVERY emit
const allPatterns = Array.from(this.listeners.keys());
const matchingPatterns = this.options.wildcard
  ? findMatchingPatterns(event, allPatterns, this.options.delimiter)
  : allPatterns.filter(p => p === event);
```

**Problem**: Creates new array and iterates all patterns even for exact matches.

**Solution**: Direct Map lookup first, wildcard scan only when needed.

---

### 2. `emit()` - Dependency Sorting (kernel.ts:258)

```typescript
// Current: Called EVERY emit, even when no dependencies exist
const sortedEntries = this.sortListenersByDependencies(allEntries);
```

**Problem**: `sortListenersByDependencies()` does:
- `entries.some(e => e.after.length > 0)` check
- Creates Set, Map, runs toposort(), recursive level assignment
- O(n²) worst case

**Solution**:
- Track `hasDependencies` flag on registration
- Pre-compute sort order on `on()`, not `emit()`

---

### 3. `emit()` - Object Allocation (kernel.ts:251-255, 471-478)

```typescript
// Every emit creates:
const kernelEvent = new KernelEvent<Events[K]>(event, data, {});

// Every listener creates:
const ctx = new ListenerContext(entry.id, eventName, ...7 params);
```

**Problem**: Object allocation is expensive at high frequency.

**Solution**:
- Reuse event objects or use plain objects `{ name, data, context }`
- Make ListenerContext lazy (create only if accessed via proxy)

---

### 4. `emit()` - Async Overhead (kernel.ts:262-266)

```typescript
// Current: Always uses Promise.allSettled, even for sync handlers
const promises = sortedEntries.map((entry) =>
  this.executeListener(entry, kernelEvent, event)
);
const results = await Promise.allSettled(promises);
```

**Problem**: Promise overhead (~100ns per listener) adds up.

**Solution**: Detect sync handlers, use direct call loop when possible.

---

### 5. `on()` - Array Sort (kernel.ts:122)

```typescript
// Current: Sorts entire array on EVERY listener add
entries.sort((a, b) => b.priority - a.priority);
```

**Problem**: O(n log n) on every registration.

**Solution**: Binary insertion (O(n)) or skip sort if priority is default.

---

## Optimization Strategies

### Phase 1: Fast Path (Biggest Impact)

Add internal fast path for common case:
- No wildcards in registered patterns
- No dependencies
- No debug mode
- errorBoundary: true (default)

```typescript
// Fast path checks
private hasWildcardListeners = false;
private hasDependencyListeners = false;

// On emit - direct path
if (!this.hasWildcardListeners && !this.hasDependencyListeners && !this.options.debug) {
  return this.emitFast(eventName, data);
}
```

### Phase 2: Pattern Matching Optimization

```typescript
// Direct lookup first, wildcard scan only if needed
const exactListeners = this.listeners.get(event);
if (!this.hasWildcardListeners) {
  return exactListeners ?? [];
}
// Only now scan for wildcards
```

### Phase 3: Pre-computed Dependency Order

```typescript
// On registration
private dependencySortedCache = new Map<string, ListenerEntry[]>();

on(eventName, listener, options) {
  // ... existing logic ...

  // Invalidate cache for this event
  this.dependencySortedCache.delete(event);

  // Pre-compute sort order
  if (options.after?.length) {
    this.hasDependencyListeners = true;
    this.precomputeDependencyOrder(event);
  }
}
```

### Phase 4: Lazy Context Creation

```typescript
// Use proxy for lazy context creation
const ctx = new Proxy({} as ListenerContext, {
  get: (target, prop) => {
    if (!target._initialized) {
      Object.assign(target, new ListenerContext(...));
      target._initialized = true;
    }
    return target[prop];
  }
});
```

---

## Expected Improvements

| Optimization | Expected Impact |
|--------------|-----------------|
| Fast path (no wildcards/deps) | 5-10x faster |
| Direct Map lookup | 2x faster on exact match |
| Pre-computed sort | 2-3x faster with deps |
| Lazy context | 1.5x faster (object allocation) |
| Sync handler detection | 2x faster for sync handlers |

**Target**: Get within 10x of mitt for simple emit cases.

---

## Trade-offs

- **Code complexity**: Fast paths add conditional logic
- **Memory**: Pre-computed caches use more memory
- **Maintenance**: Two code paths to maintain

**Decision**: Worth it for high-frequency event systems. Keep slow path for correctness, fast path for performance.
