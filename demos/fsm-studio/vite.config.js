import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { copyFileSync, mkdirSync, readdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Copy examples folder to dist after build
const copyExamples = () => ({
  name: 'copy-examples',
  closeBundle() {
    const srcDir = resolve(__dirname, 'examples');
    const destDir = resolve(__dirname, 'dist/examples');
    mkdirSync(destDir, { recursive: true });
    for (const file of readdirSync(srcDir)) {
      copyFileSync(resolve(srcDir, file), resolve(destDir, file));
    }
  }
});

export default defineConfig({
  root: '.',
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  plugins: [copyExamples()]
});
