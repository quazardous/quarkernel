# Contributing to QuarKernel

Thanks for your interest in QuarKernel! Bug reports, fixes and improvements are welcome.

## Setup

Requirements: Node.js >= 18 and npm.

```bash
git clone https://github.com/quazardous/quarkernel.git
cd quarkernel
npm ci
```

The repository is an npm workspaces monorepo:

| Path | Package |
|------|---------|
| `packages/quarkernel` | `@quazardous/quarkernel` (core, FSM, XState import/export) |
| `packages/vue` | `@quazardous/quarkernel-vue` |
| `packages/react` | `@quazardous/quarkernel-react` |
| `packages/svelte` | `@quazardous/quarkernel-svelte` |
| `demos/*` | QK Studio, FSM Studio and other demos |
| `docs/` | Guides and API reference |
| `benchmarks/` | Performance suite |

## Build, type check, test

```bash
npm run build                                    # build all packages
npm test                                         # run all test suites (vitest)
npm test --workspace=packages/quarkernel         # one package only
npm run typecheck --workspace=packages/quarkernel
npm run size --workspace=packages/quarkernel     # bundle size budgets (after build)
```

The publish workflow runs the build, the core type check, the bundle size check and all test suites. Please make sure they pass locally before opening a pull request.

## Pull requests

- Keep each pull request focused on one change.
- Add or update tests for any behaviour change. Bug fixes should come with a test that fails without the fix.
- Update the docs (`README.md`, `docs/`) when the public API or its semantics change.
- Add an entry to `CHANGELOG.md` (see below).
- Everything is written in English: code, comments, docs, commit messages and pull request descriptions.

## Changelog and versioning

- The changelog follows [Keep a Changelog](https://keepachangelog.com/): entries are grouped under `Added`, `Changed`, `Fixed`, `Removed`, newest version first.
- Versions follow [Semantic Versioning](https://semver.org/): patch for fixes, minor for backward-compatible features, major for breaking changes.
- Every released version gets its own changelog section.

## Releases (maintainers)

1. Bump `version` in the affected `packages/*/package.json` files and add the `CHANGELOG.md` section.
2. Commit as `vX.Y.Z - Short summary`.
3. Push a `vX.Y.Z` tag: the publish workflow builds, type checks, tests and publishes to npm.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](./LICENSE).
