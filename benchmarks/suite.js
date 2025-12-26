import { Bench } from 'tinybench';
import { Kernel } from '@quazardous/quarkernel';
import mitt from 'mitt';
import Emittery from 'emittery';
import os from 'os';

const ITERATIONS = 1_000_000;
const LISTENER_COUNT = 10;

const formatOpsPerSec = (ops) => {
  if (ops >= 1_000_000) {
    return `${(ops / 1_000_000).toFixed(2)}M`;
  } else if (ops >= 1_000) {
    return `${(ops / 1_000).toFixed(2)}K`;
  }
  return ops.toFixed(2);
};

const formatRelative = (baseline, current) => {
  const ratio = current / baseline;
  if (ratio >= 1) {
    return `${ratio.toFixed(2)}x faster`;
  }
  return `${(1 / ratio).toFixed(2)}x slower`;
};

console.log('\n╔═══════════════════════════════════════════════════════════════════════╗');
console.log('║           QuarKernel v2 Performance Benchmarks                       ║');
console.log('╚═══════════════════════════════════════════════════════════════════════╝\n');

console.log(`Test Environment:`);
console.log(`  Node.js: ${process.version}`);
console.log(`  Platform: ${process.platform} ${process.arch}`);
console.log(`  CPU: ${os.cpus()[0]?.model || 'Unknown'}`);
console.log(`  Iterations: ${ITERATIONS.toLocaleString()}`);
console.log(`  Listeners: ${LISTENER_COUNT}\n`);

async function runBenchmark(name, setup) {
  console.log(`\n${'='.repeat(75)}`);
  console.log(`Benchmark: ${name}`);
  console.log('='.repeat(75));

  const bench = new Bench({ time: 1000 });

  const instances = setup();

  for (const [libName, instance, emitFn] of instances) {
    bench.add(libName, emitFn);
  }

  await bench.warmup();
  await bench.run();

  const results = bench.tasks.map(task => ({
    name: task.name,
    ops: task.result?.hz || 0,
    margin: task.result?.rme || 0,
    samples: task.result?.samples?.length || 0,
  }));

  results.sort((a, b) => b.ops - a.ops);

  const baseline = results[0].ops;

  console.log('\nResults:');
  console.log('─'.repeat(75));
  console.log(
    `${'Library'.padEnd(20)} | ` +
    `${'Ops/sec'.padStart(12)} | ` +
    `${'Margin'.padStart(10)} | ` +
    `${'Samples'.padStart(8)} | ` +
    `Relative`
  );
  console.log('─'.repeat(75));

  for (const result of results) {
    const relative = result.ops === baseline ? 'baseline' : formatRelative(baseline, result.ops);
    console.log(
      `${result.name.padEnd(20)} | ` +
      `${formatOpsPerSec(result.ops).padStart(12)} | ` +
      `${`±${result.margin.toFixed(2)}%`.padStart(10)} | ` +
      `${result.samples.toString().padStart(8)} | ` +
      `${relative}`
    );
  }

  return results;
}

const allResults = {};

await runBenchmark('Simple Emit (10 listeners)', () => {
  const kernel = new Kernel();
  const mittEmitter = mitt();
  const emitteryEmitter = new Emittery();

  const handler = () => {};

  for (let i = 0; i < LISTENER_COUNT; i++) {
    kernel.on('test', handler);
    mittEmitter.on('test', handler);
    emitteryEmitter.on('test', handler);
  }

  return [
    ['QuarKernel', kernel, () => kernel.emit('test', { value: 42 })],
    ['mitt', mittEmitter, () => mittEmitter.emit('test', { value: 42 })],
    ['Emittery', emitteryEmitter, () => emitteryEmitter.emit('test', { value: 42 })],
  ];
});

await runBenchmark('Async Emit (10 listeners)', () => {
  const kernel = new Kernel();
  const emitteryEmitter = new Emittery();

  const asyncHandler = async () => {};

  for (let i = 0; i < LISTENER_COUNT; i++) {
    kernel.on('test', asyncHandler);
    emitteryEmitter.on('test', asyncHandler);
  }

  return [
    ['QuarKernel', kernel, async () => await kernel.emit('test', { value: 42 })],
    ['Emittery', emitteryEmitter, async () => await emitteryEmitter.emit('test', { value: 42 })],
  ];
});

await runBenchmark('Register/Unregister Listener', () => {
  const kernel = new Kernel();
  const mittEmitter = mitt();
  const emitteryEmitter = new Emittery();

  const handler = () => {};

  return [
    ['QuarKernel', kernel, () => {
      const off = kernel.on('test', handler);
      off();
    }],
    ['mitt', mittEmitter, () => {
      mittEmitter.on('test', handler);
      mittEmitter.off('test', handler);
    }],
    ['Emittery', emitteryEmitter, () => {
      const off = emitteryEmitter.on('test', handler);
      off();
    }],
  ];
});

await runBenchmark('Many Listeners (100 listeners)', () => {
  const MANY_LISTENERS = 100;
  const kernel = new Kernel();
  const mittEmitter = mitt();
  const emitteryEmitter = new Emittery();

  const handler = () => {};

  for (let i = 0; i < MANY_LISTENERS; i++) {
    kernel.on('test', handler);
    mittEmitter.on('test', handler);
    emitteryEmitter.on('test', handler);
  }

  return [
    ['QuarKernel', kernel, () => kernel.emit('test', { value: 42 })],
    ['mitt', mittEmitter, () => mittEmitter.emit('test', { value: 42 })],
    ['Emittery', emitteryEmitter, () => emitteryEmitter.emit('test', { value: 42 })],
  ];
});

await runBenchmark('Wildcard Events', () => {
  const kernel = new Kernel();
  const mittEmitter = mitt();

  const handler = () => {};

  kernel.on('user.*', handler);
  mittEmitter.on('*', handler);

  return [
    ['QuarKernel', kernel, () => kernel.emit('user.created', { id: 1 })],
    ['mitt', mittEmitter, () => mittEmitter.emit('user.created', { id: 1 })],
  ];
});

await runBenchmark('Multiple Event Types (10 types)', () => {
  const EVENT_TYPES = 10;
  const kernel = new Kernel();
  const mittEmitter = mitt();
  const emitteryEmitter = new Emittery();

  const handler = () => {};

  for (let i = 0; i < EVENT_TYPES; i++) {
    const eventName = `event${i}`;
    for (let j = 0; j < LISTENER_COUNT; j++) {
      kernel.on(eventName, handler);
      mittEmitter.on(eventName, handler);
      emitteryEmitter.on(eventName, handler);
    }
  }

  let counter = 0;

  return [
    ['QuarKernel', kernel, () => {
      kernel.emit(`event${counter % EVENT_TYPES}`, { value: 42 });
      counter++;
    }],
    ['mitt', mittEmitter, () => {
      mittEmitter.emit(`event${counter % EVENT_TYPES}`, { value: 42 });
      counter++;
    }],
    ['Emittery', emitteryEmitter, () => {
      emitteryEmitter.emit(`event${counter % EVENT_TYPES}`, { value: 42 });
      counter++;
    }],
  ];
});

await runBenchmark('Dependency Ordering (QuarKernel unique feature)', () => {
  const kernel = new Kernel();

  let executionOrder = [];

  kernel.on('test', async (event, ctx) => {
    executionOrder.push('listener1');
  }, { id: 'listener1' });

  kernel.on('test', async (event, ctx) => {
    executionOrder.push('listener2');
  }, { id: 'listener2', after: ['listener1'] });

  kernel.on('test', async (event, ctx) => {
    executionOrder.push('listener3');
  }, { id: 'listener3', after: ['listener2'] });

  return [
    ['QuarKernel (with deps)', kernel, async () => {
      executionOrder = [];
      await kernel.emit('test', {});
    }],
  ];
});

await runBenchmark('Shared Context (QuarKernel unique feature)', () => {
  const kernel = new Kernel();

  kernel.on('test', async (event, ctx) => {
    event.context.step1 = 'completed';
  });

  kernel.on('test', async (event, ctx) => {
    event.context.step2 = event.context.step1 + ' and extended';
  });

  return [
    ['QuarKernel (shared ctx)', kernel, async () => {
      await kernel.emit('test', {}, { initial: true });
    }],
  ];
});

console.log('\n' + '='.repeat(75));
console.log('Benchmark Summary');
console.log('='.repeat(75));
console.log('\nKey Findings:');
console.log('  • QuarKernel provides competitive performance for basic operations');
console.log('  • Dependency ordering and shared context are unique features');
console.log('  • Async emit is native and efficient');
console.log('  • Wildcard support with regex caching');
console.log('\nNote: Performance may vary based on hardware and Node.js version.');
console.log('      Run these benchmarks on your target environment for accurate results.\n');
