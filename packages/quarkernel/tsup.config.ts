import { defineConfig } from 'tsup';

export default defineConfig([
  // ESM + CJS builds
  {
    entry: {
      index: 'src/index.ts',
      fsm: 'src/fsm/index.ts',
      xstate: 'src/xstate/index.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
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
