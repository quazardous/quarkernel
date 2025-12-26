import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? '/quarkernel/' : '/',
  resolve: {
    alias: {
      '@quazardous/quarkernel': resolve(__dirname, '../packages/quarkernel/dist/index.js')
    }
  }
});
