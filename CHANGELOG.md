# Changelog

All notable changes to QuarKernel will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

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
