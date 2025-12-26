# Publishing to npm

## Quick publish

```bash
# 1. Bump version (patch/minor/major) - all packages manually
npm version patch --workspace=packages/quarkernel --no-git-tag-version && \
npm version patch --workspace=packages/react --no-git-tag-version && \
npm version patch --workspace=packages/vue --no-git-tag-version && \
npm version patch --workspace=packages/svelte --no-git-tag-version

# 2. Commit
git add -A && git commit -m "vX.X.X - Description"

# 3. Tag and push (triggers GitHub Actions publish)
git tag vX.X.X && git push && git push --tags
```

## Build outputs

- `dist/index.js` - ESM
- `dist/index.cjs` - CommonJS
- `dist/index.umd.js` - IIFE for CDN (unpkg, jsdelivr)
- `dist/fsm.js` / `dist/xstate.js` - Sub-modules

CDN usage:
```html
<script src="https://unpkg.com/@quazardous/quarkernel@2/dist/index.umd.js"></script>
<script>
  const qk = QuarKernel.createKernel();
</script>
```

## Verify

```bash
# Check published version
npm view @quazardous/quarkernel version

# Check workflow status
gh run list --limit 1
```

## Re-trigger failed publish

```bash
git tag -d vX.X.X
git push origin :refs/tags/vX.X.X
git tag vX.X.X
git push origin vX.X.X
```
