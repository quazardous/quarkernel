/**
 * Tests for execution errors with overlapping and nested emits
 *
 * Each emit keeps its own errors (returned by emit() / emitSerial() and exposed
 * on event.errors). getExecutionErrors() is only reset when an emit starts on an
 * idle kernel, so overlapping or nested emits don't wipe each other's errors.
 */

import { describe, it, expect } from 'vitest';
import { createKernel } from './kernel.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface TestEvents {
  'job:run': { id: string; delay: number };
  'job:nested': undefined;
  'job:ok': undefined;
}

// Emits job A, then job B while A is still running; A fails before B starts
const overlappingEmits = (kernel: ReturnType<typeof createKernel<TestEvents>>) => {
  kernel.on('job:run', (event) => {
    throw new Error(`failed ${event.data.id}`);
  }, { id: 'fails' });

  kernel.on('job:run', async (event) => {
    await sleep(event.data.delay);
  }, { id: 'slow' });

  return (async () => {
    const emitA = kernel.emit('job:run', { id: 'A', delay: 20 });
    await sleep(5);
    const emitB = kernel.emit('job:run', { id: 'B', delay: 0 });
    return Promise.all([emitA, emitB]);
  })();
};

describe('Execution errors per emit', () => {
  it('should resolve each overlapping emit() with its own errors', async () => {
    const kernel = createKernel<TestEvents>({ onError: () => {} });

    const [errorsA, errorsB] = await overlappingEmits(kernel);

    expect(errorsA.map((e) => e.error.message)).toEqual(['failed A']);
    expect(errorsB.map((e) => e.error.message)).toEqual(['failed B']);
  });

  it('should not lose errors of overlapping emits in getExecutionErrors()', async () => {
    const kernel = createKernel<TestEvents>({ onError: () => {} });

    await overlappingEmits(kernel);

    expect(kernel.getExecutionErrors().map((e) => e.error.message)).toEqual(['failed A', 'failed B']);
  });

  it('should expose the errors of the emit on event.errors', async () => {
    const seenByOnError: number[] = [];
    let seenByDependent: string[] | undefined;
    const kernel = createKernel<TestEvents>({
      onError: (_error, event) => {
        seenByOnError.push(event.errors?.length ?? -1);
      },
    });

    kernel.on('job:run', () => {
      throw new Error('boom');
    }, { id: 'fails' });

    kernel.on('job:run', (event) => {
      seenByDependent = event.errors?.map((e) => e.listenerId);
    }, { id: 'report', after: ['fails'] });

    await kernel.emit('job:run', { id: 'A', delay: 0 });

    expect(seenByOnError).toEqual([1]);
    expect(seenByDependent).toEqual(['fails']);
  });

  it('should resolve emitSerial() with its errors', async () => {
    const kernel = createKernel<TestEvents>({ onError: () => {} });

    kernel.on('job:run', () => {
      throw new Error('first');
    }, { id: 'first', priority: 2 });

    kernel.on('job:run', () => {
      throw new Error('second');
    }, { id: 'second', priority: 1 });

    const errors = await kernel.emitSerial('job:run', { id: 'A', delay: 0 });

    expect(errors.map((e) => e.listenerId)).toEqual(['first', 'second']);
  });

  it('should resolve with an empty array when nothing failed or nothing listened', async () => {
    const kernel = createKernel<TestEvents>();

    kernel.on('job:ok', () => {});

    expect(await kernel.emit('job:ok')).toEqual([]);
    expect(await kernel.emitSerial('job:ok')).toEqual([]);
    expect(await kernel.emit('job:nested')).toEqual([]);
  });

  it('should still reject with AggregateError when errorBoundary is false', async () => {
    const kernel = createKernel<TestEvents>({ errorBoundary: false });

    kernel.on('job:run', () => {
      throw new Error('boom');
    });

    await expect(kernel.emit('job:run', { id: 'A', delay: 0 })).rejects.toThrow(AggregateError);
    expect(kernel.getExecutionErrors()).toHaveLength(1);
  });

  it('should keep errors of a nested emit in getExecutionErrors() after the outer emit', async () => {
    const kernel = createKernel<TestEvents>({ onError: () => {} });
    let nestedErrors: ReadonlyArray<unknown> = [];

    kernel.on('job:nested', () => {
      throw new Error('nested failure');
    });

    kernel.on('job:run', async () => {
      nestedErrors = await kernel.emit('job:nested');
    });

    const outerErrors = await kernel.emit('job:run', { id: 'A', delay: 0 });

    expect(outerErrors).toEqual([]);
    expect(nestedErrors).toHaveLength(1);
    expect(kernel.getExecutionErrors().map((e) => e.eventName)).toEqual(['job:nested']);
  });

  it('should reset getExecutionErrors() when an emit starts on an idle kernel', async () => {
    const kernel = createKernel<TestEvents>({ onError: () => {} });

    kernel.on('job:run', () => {
      throw new Error('boom');
    });
    kernel.on('job:ok', () => {});

    await kernel.emit('job:run', { id: 'A', delay: 0 });
    expect(kernel.getExecutionErrors()).toHaveLength(1);

    await kernel.emit('job:ok');
    expect(kernel.getExecutionErrors()).toHaveLength(0);
  });
});
