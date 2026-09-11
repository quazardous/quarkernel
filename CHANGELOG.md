# Changelog

All notable changes to QuarKernel will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [2.3.3] - 2026-09-11

### Fixed
- **Dependency ordering with async listeners**: `emit()` now waits for dependencies to complete
  - Previously all listeners started at once, so a listener with `after: ['id']` could run before an async dependency finished and read an incomplete `context`
  - Listeners now run level by level: listeners in the same dependency level run in parallel, and each level completes before the next one starts
  - Listeners without dependencies still run fully in parallel
  - A failing dependency does not skip its dependents (errors are still reported via `onError` / `AggregateError`); `stopPropagation()` in an async dependency now skips the remaining levels
- **Bundling**: the ES module `/fsm` and `/xstate` entries now share the kernel with the core entry instead of embedding their own copy
  - A bundle importing both `createKernel` and `createMachine` drops from 31.9 kB to 17.8 kB minified
  - The CommonJS builds stay self-contained
  - The `size` script now fails if the kernel is bundled more than once

### Changed
- **Emit performance**: `emit()` and `emitSerial()` no longer re-match patterns and re-sort listeners on every call
  - The resolved listeners (exact + wildcard matches, grouped by dependency level) are cached per event name and invalidated on any `on()` / `off()` / `offAll()` (including `once` and `AbortSignal` removals)
  - Dependency levels are computed in a single pass over the topological order instead of a recursive search
  - Missing or cyclic dependencies are still reported on every emit
- **Type checking**: added a `typecheck` script (`tsc --noEmit`) to the core package, run in the publish workflow before the tests
  - Fixed stale type imports in the worker adapter (`Kernel` / `KernelEvent` renamed to `IKernel` / `IKernelEvent`)
- **Contributing**: added `CONTRIBUTING.md`; root `npm test` and `npm run clean` no longer fail on demo workspaces that don't define those scripts
- **README**: replaced the inaccurate "< 2KB gzipped" claim with measured sizes per entry point and reworked the comparison table (mitt, eventemitter3, emittery)
  - New `size` script (esbuild minify + gzip) with a budget per entry point, run in the publish workflow

## [2.3.2] - 2025-12-30

### Fixed
- **FSM Studio**: Manual transitions not updating UI
  - `createMachine()` uses internal kernel, so FSM Studio's event listeners didn't receive events
  - Added `updateUI()` call after `send()` in transition buttons, graph edge clicks, and force actions
- **QK Studio**: vis.js flowchart now also uses the system-ui font stack

## [2.3.1] - 2025-12-30

### Fixed
- **FSM Studio**: Memory leak when loading new examples
  - Previous machine was not destroyed, causing old timers/listeners to continue running
  - Now properly destroys current machine before loading a new example
- **QK Studio**: Changed font from Comic Sans MS to system-ui font stack

## [2.3.0] - 2025-12-26

### Changed
- **Promise-oriented API**: Refactored async patterns for clarity
  - Improved documentation structure

## [2.2.5] - 2025-12-26

### Added
- `unpkg` and `browser` fields in package.json for CDN usage

## [2.2.4] - 2025-12-26

### Added
- **UMD build**: Added UMD format for CDN distribution
  - Available via unpkg: `https://unpkg.com/@quazardous/quarkernel`

## [2.2.3] - 2025-12-26

### Changed
- Auto-copy README on build for npm package

## [2.2.0] - 2025-12-26

### Added
- **FSM Studio demo**: Visual finite state machine editor
  - Graph visualization with vis.js
  - XState-compatible config import/export
  - State-centric FSM definition format
  - CodeMirror editors for config editing
- **QK Studio demo**: Event/listener visualization
  - Drag & drop chip interface
  - Real-time event log

## [2.1.0] - 2025-12-25

### Added
- **createMachine()**: High-level FSM factory function
  - State-centric definition format with inline entry/exit/after
  - Built-in helpers: `ctx`, `set()`, `send()`, `log()`
  - Timer support via `after: { delay, send }`
- **fromXState()**: Convert XState v5 configs to QuarKernel format

## [2.0.0] - 2025-12-24

### Added
- **FSM module**: Finite State Machine support via `useMachine()`
  - State transitions with guards and actions
  - Context management with `set()` helper
  - Event history tracking
  - Snapshot/restore capabilities
- **Wildcard patterns**: `*` and `**` for event matching
  - `*` matches single segment
  - `**` matches multiple segments

### Changed
- **BREAKING**: Event naming convention uses `:` separator
  - Example: `user:login`, `order:item:added`

## [1.0.0] - 2025-12-20

### Added
- Initial release
- `Kernel` class with event emission and listening
- Dependency ordering for listeners
- Shared context between listeners
- Composite events
- Promise-based async support
- TypeScript definitions
