import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/quarkernel/fsm-studio/' : '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@quazardous/quarkernel': '../../packages/quarkernel/dist/index.js'
    }
  }
});
