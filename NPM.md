# Publishing to npm

## Quick publish

```bash
# 1. Bump version (patch/minor/major)
npm version patch --workspace=packages/quarkernel --no-git-tag-version
npm version patch --workspace=packages/react --no-git-tag-version
npm version patch --workspace=packages/vue --no-git-tag-version
npm version patch --workspace=packages/svelte --no-git-tag-version

# 2. Commit
git add -A && git commit -m "Bump to vX.X.X"

# 3. Tag and push (triggers GitHub Actions publish)
git tag vX.X.X
git push && git push --tags
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
