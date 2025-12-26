/**
 * Focused performance measurement for optimization tracking
 * Run: node perf-measure.js
 *
 * Measures specific scenarios to track optimization impact:
 * 1. Simple emit (no wildcards, no deps) - target for fast path
 * 2. With wildcards - pattern matching overhead
 * 3. With dependencies - sorting overhead
 * 4. Many listeners - scaling behavior
 */

import { Bench } from 'tinybench';
import { Kernel } from '@quazardous/quarkernel';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ITERATIONS = 100_000;

console.log('╔═══════════════════════════════════════════════════════════════╗');
console.log('║         QuarKernel Optimization Measurement                  ║');
console.log('╚═══════════════════════════════════════════════════════════════╝\n');

console.log(`Date: ${new Date().toISOString()}`);
console.log(`Node: ${process.version}\n`);

const results = {};

async function measure(name, setup) {
  const bench = new Bench({ time: 1000 });
  const [_, emitFn] = setup();

  bench.add(name, emitFn);
  await bench.warmup();
  await bench.run();

  const task = bench.tasks[0];
  const ops = task.result?.hz || 0;
  results[name] = ops;

  return ops;
}

// Scenario 1: Simple emit - no wildcards, no dependencies
console.log('─'.repeat(65));
console.log('Scenario 1: Simple Emit (no wildcards, no deps)');
console.log('─'.repeat(65));

const ops1 = await measure('simple-10', () => {
  const kernel = new Kernel({ wildcard: false });
  for (let i = 0; i < 10; i++) {
    kernel.on('test', () => {});
  }
  return [kernel, () => kernel.emit('test', { v: 1 })];
});
console.log(`  10 listeners: ${(ops1 / 1000).toFixed(1)}K ops/s`);

const ops1b = await measure('simple-1', () => {
  const kernel = new Kernel({ wildcard: false });
  kernel.on('test', () => {});
  return [kernel, () => kernel.emit('test', { v: 1 })];
});
console.log(`   1 listener:  ${(ops1b / 1000).toFixed(1)}K ops/s`);

// Scenario 2: With wildcards enabled (default)
console.log('\n' + '─'.repeat(65));
console.log('Scenario 2: Wildcards Enabled (default config)');
console.log('─'.repeat(65));

const ops2 = await measure('wildcards-10', () => {
  const kernel = new Kernel(); // wildcard: true by default
  for (let i = 0; i < 10; i++) {
    kernel.on('test', () => {});
  }
  return [kernel, () => kernel.emit('test', { v: 1 })];
});
console.log(`  10 listeners: ${(ops2 / 1000).toFixed(1)}K ops/s`);

const ops2b = await measure('wildcards-pattern', () => {
  const kernel = new Kernel();
  kernel.on('user:*', () => {});
  kernel.on('user:login', () => {});
  return [kernel, () => kernel.emit('user:login', { v: 1 })];
});
console.log(`  With pattern: ${(ops2b / 1000).toFixed(1)}K ops/s`);

// Scenario 3: With dependencies
console.log('\n' + '─'.repeat(65));
console.log('Scenario 3: With Dependencies');
console.log('─'.repeat(65));

const ops3 = await measure('deps-chain-3', () => {
  const kernel = new Kernel({ wildcard: false });
  kernel.on('test', () => {}, { id: 'a' });
  kernel.on('test', () => {}, { id: 'b', after: ['a'] });
  kernel.on('test', () => {}, { id: 'c', after: ['b'] });
  return [kernel, () => kernel.emit('test', { v: 1 })];
});
console.log(`  Chain of 3:   ${(ops3 / 1000).toFixed(1)}K ops/s`);

const ops3b = await measure('deps-parallel-3', () => {
  const kernel = new Kernel({ wildcard: false });
  kernel.on('test', () => {}, { id: 'a' });
  kernel.on('test', () => {}, { id: 'b', after: ['a'] });
  kernel.on('test', () => {}, { id: 'c', after: ['a'] }); // parallel with b
  return [kernel, () => kernel.emit('test', { v: 1 })];
});
console.log(`  Parallel 3:   ${(ops3b / 1000).toFixed(1)}K ops/s`);

// Scenario 4: Many listeners (scaling)
console.log('\n' + '─'.repeat(65));
console.log('Scenario 4: Scaling (no wildcards, no deps)');
console.log('─'.repeat(65));

for (const count of [10, 50, 100]) {
  const ops = await measure(`scale-${count}`, () => {
    const kernel = new Kernel({ wildcard: false });
    for (let i = 0; i < count; i++) {
      kernel.on('test', () => {});
    }
    return [kernel, () => kernel.emit('test', { v: 1 })];
  });
  console.log(`  ${count.toString().padStart(3)} listeners: ${(ops / 1000).toFixed(1)}K ops/s`);
}

// Summary
console.log('\n' + '═'.repeat(65));
console.log('SUMMARY');
console.log('═'.repeat(65));

// Load baseline for comparison
const __dirname = dirname(fileURLToPath(import.meta.url));
const baselinePath = join(__dirname, 'baseline.json');

let baseline = null;
if (existsSync(baselinePath)) {
  baseline = JSON.parse(readFileSync(baselinePath, 'utf-8'));
}

console.log('\n| Scenario          | Current    | Baseline   | Change     |');
console.log('|-------------------|------------|------------|------------|');

for (const [name, ops] of Object.entries(results)) {
  const current = `${(ops / 1000).toFixed(1)}K`.padStart(10);
  let baselineStr = '         -';
  let changeStr = '         -';

  if (baseline?.results?.[name]) {
    const base = baseline.results[name];
    baselineStr = `${(base / 1000).toFixed(1)}K`.padStart(10);
    const ratio = ops / base;
    if (ratio >= 1.05) {
      changeStr = `+${((ratio - 1) * 100).toFixed(0)}%`.padStart(10);
    } else if (ratio <= 0.95) {
      changeStr = `${((ratio - 1) * 100).toFixed(0)}%`.padStart(10);
    } else {
      changeStr = '        ~0';
    }
  }

  console.log(`| ${name.padEnd(17)} | ${current} | ${baselineStr} | ${changeStr} |`);
}

console.log('\n' + JSON.stringify({
  date: new Date().toISOString().split('T')[0],
  node: process.version,
  results: Object.fromEntries(
    Object.entries(results).map(([k, v]) => [k, Math.round(v)])
  )
}, null, 2));
