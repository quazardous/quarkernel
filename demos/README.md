# QuarKernel Demos

## QK Studio

Interactive visual event composer for QuarKernel.

**Live demo**: [quazardous.github.io/quarkernel/studio](https://quazardous.github.io/quarkernel/studio/)

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
cd demos/studio
npm run dev
# Open http://localhost:5174/
```

### Build for Production

```bash
npm run build --workspace=demos/studio
# Output in demos/studio/dist/
```

## Adding New Demos

1. Create folder `demos/your-demo/`
2. Add `package.json` with `dev` and `build` scripts
3. Update `.github/workflows/deploy-demos.yml` to include in deployment
4. Update `demos/index.html` to add link
