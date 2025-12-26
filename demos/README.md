# QuarKernel Demos

## FSM Studio

Visual finite state machine designer with XState import/export.

**Live demo**: [quazardous.github.io/quarkernel/fsm-studio](https://quazardous.github.io/quarkernel/fsm-studio/)

### Features

- **Visual state diagram** with vis.js
- **XState import/export** - compatible format
- **Behaviors** - onEnter, onExit, transitions, timers
- **Live editing** - CodeMirror integration
- **Multiple examples** - Traffic Light, Coffee Machine, Media Player

### Local Development

```bash
npm run dev --workspace=demos/fsm-studio
# Open http://localhost:5173/
```

## QK Studio

Interactive visual event composer for QuarKernel.

**Live demo**: [quazardous.github.io/quarkernel/qk-studio](https://quazardous.github.io/quarkernel/qk-studio/)

### Features

- **Create events** with random funny names (or custom)
- **Drag & drop** events to compose them
- **Configure TTL** - instant, permanent, or custom duration
- **Auto-fire** events at intervals
- **Listeners** that react to events
- **Visual flowchart** with vis.js
- **Real-time log** of all activity

### Local Development

```bash
npm run dev --workspace=demos/qk-studio
# Open http://localhost:5173/
```

## Build for Production

```bash
npm run build --workspace=demos/fsm-studio
npm run build --workspace=demos/qk-studio
```

## Adding New Demos

1. Create folder `demos/your-demo/`
2. Add `package.json` with `dev` and `build` scripts
3. Add `vite.config.js` for build configuration
4. Update `.github/workflows/deploy-demos.yml` to include in deployment
5. Update `demos/index.html` to add link
