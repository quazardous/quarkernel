/**
 * Bundle size check
 *
 * Bundles each public entry point from dist/ with esbuild (minified ESM),
 * gzips it and compares the result against a budget. Also checks that the
 * kernel is bundled only once when the core and /fsm entries are used together.
 * Run after `npm run build`. Exits with code 1 when a check fails.
 */

import { build } from 'esbuild';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const packageDir = fileURLToPath(new URL('..', import.meta.url));

// Budgets in bytes (minified + gzip)
const checks = [
  { name: '. (createKernel only)', code: "export { createKernel } from './dist/index.js';", budget: 5000 },
  { name: '. (full entry)', code: "export * from './dist/index.js';", budget: 8000 },
  { name: './fsm (full entry)', code: "export * from './dist/fsm.js';", budget: 6500 },
  { name: './xstate (full entry)', code: "export * from './dist/xstate.js';", budget: 1200 },
];

// String literal that only exists in the Kernel constructor
const KERNEL_MARKER = '[QuarKernel] Kernel initialized';

const bundle = async (code) => {
  const result = await build({
    stdin: { contents: code, resolveDir: packageDir },
    bundle: true,
    minify: true,
    format: 'esm',
    write: false,
    logLevel: 'silent',
  });
  return result.outputFiles[0];
};

const formatKb = (bytes) => `${(bytes / 1000).toFixed(2)} kB`;

let failed = false;

for (const { name, code, budget } of checks) {
  const minified = (await bundle(code)).contents;
  const gzipped = gzipSync(minified, { level: 9 }).length;
  const ok = gzipped <= budget;
  if (!ok) failed = true;

  console.log(
    `${ok ? 'OK  ' : 'FAIL'} ${name.padEnd(24)} ${formatKb(minified.length).padStart(9)} min ${formatKb(gzipped).padStart(9)} gzip  (budget ${formatKb(budget)})`
  );
}

const shared = await bundle(
  "export { createKernel } from './dist/index.js'; export { createMachine } from './dist/fsm.js';"
);
const kernelCopies = shared.text.split(KERNEL_MARKER).length - 1;
const sharedOk = kernelCopies === 1;
if (!sharedOk) failed = true;

console.log(
  `${sharedOk ? 'OK  ' : 'FAIL'} ${'. + ./fsm together'.padEnd(24)} ${formatKb(shared.contents.length).padStart(9)} min   kernel bundled ${kernelCopies} time(s), expected 1`
);

if (failed) {
  console.error(
    '\nBundle check failed. Raise a budget only if the size increase is intended; ' +
      'a kernel bundled more than once means an entry no longer shares the core chunk.'
  );
  process.exit(1);
}
