import { defineConfig } from 'tsup';

export default defineConfig([
  // ESM build: code splitting so the entries share one copy of the kernel
  {
    entry: {
      index: 'src/index.ts',
      fsm: 'src/fsm/index.ts',
      xstate: 'src/xstate/index.ts',
    },
    format: ['esm'],
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: true,
    treeshake: true,
    minify: false,
    outDir: 'dist',
  },
  // CJS build: no splitting (experimental in tsup), each entry is self-contained
  {
    entry: {
      index: 'src/index.ts',
      fsm: 'src/fsm/index.ts',
      xstate: 'src/xstate/index.ts',
    },
    format: ['cjs'],
    dts: true,
    sourcemap: true,
    splitting: false,
    treeshake: true,
    minify: false,
    outDir: 'dist',
  },
  // IIFE build for CDN (unpkg, jsdelivr)
  {
    entry: ['src/index.ts'],
    format: ['iife'],
    globalName: 'QuarKernel',
    sourcemap: true,
    minify: true,
    outDir: 'dist',
    outExtension: () => ({ js: '.umd.js' }),
  },
]);
