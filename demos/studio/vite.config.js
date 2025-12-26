import { defineConfig } from 'vite';

export default defineConfig({
  // Base path for GitHub Pages: https://quazardous.github.io/quarkernel/studio/
  base: process.env.GITHUB_ACTIONS ? '/quarkernel/studio/' : '/',
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
