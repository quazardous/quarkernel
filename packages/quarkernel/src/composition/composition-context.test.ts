/**
 * Tests for the context captured by compositions
 *
 * A composition must see the source event context as left by every other
 * listener of that emit, including async listeners and dependency chains.
 * It relies on the internal `phase: 'final'` listener option.
 */

import { describe, it, expect } from 'vitest';
import { createKernel } from '../kernel.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Composition context capture', () => {
  it('should capture context written by async listeners (emit)', async () => {
    const qk = createKernel();

    qk.on('user:ready', async (e) => {
      await sleep(10);
      e.context.profile = 'loaded';
    });
    qk.on('user:ready', (e) => {
      e.context.sync = 'yes';
    });

    const ready = qk.when(['user:ready', 'config:ready']);
    const composed = ready.once({ timeout: 1000 });

    await qk.emit('user:ready', { id: 1 });
    await qk.emit('config:ready', { theme: 'dark' });

    expect((await composed).data.contexts['user:ready']).toEqual({ id: 1, sync: 'yes', profile: 'loaded' });

    ready.dispose();
  });

  it('should capture context written by async listeners (emitSerial)', async () => {
    const qk = createKernel();

    qk.on('user:ready', async (e) => {
      await sleep(10);
      e.context.profile = 'loaded';
    });

    const ready = qk.when(['user:ready', 'config:ready']);
    const composed = ready.once({ timeout: 1000 });

    await qk.emitSerial('user:ready', { id: 1 });
    await qk.emitSerial('config:ready', { theme: 'dark' });

    expect((await composed).data.contexts['user:ready']).toEqual({ id: 1, profile: 'loaded' });

    ready.dispose();
  });

  it('should capture context written by a dependency chain', async () => {
    const qk = createKernel();

    qk.on('order:placed', async (e) => {
      await sleep(5);
      e.context.stock = 'reserved';
    }, { id: 'stock' });

    qk.on('order:placed', async (e) => {
      await sleep(5);
      e.context.payment = `charged after ${e.context.stock}`;
    }, { id: 'payment', after: ['stock'] });

    const shipping = qk.when(['order:placed', 'address:valid']);
    const composed = shipping.once({ timeout: 1000 });

    await qk.emit('order:placed', {});
    await qk.emit('address:valid', {});

    expect((await composed).data.contexts['order:placed']).toEqual({
      stock: 'reserved',
      payment: 'charged after reserved',
    });

    shipping.dispose();
  });
});

describe("Kernel listener phase: 'final' (internal)", () => {
  it('should run after every other listener, whatever their priority and dependencies', async () => {
    const qk = createKernel();
    const log: string[] = [];

    qk.on('e', () => {
      log.push('final');
    }, { phase: 'final', priority: 1000 });

    qk.on('e', async () => {
      await sleep(5);
      log.push('a');
    }, { id: 'a' });

    qk.on('e', async () => {
      await sleep(5);
      log.push('b');
    }, { id: 'b', after: ['a'] });

    await qk.emit('e');

    expect(log).toEqual(['a', 'b', 'final']);
  });

  it('should not be usable as an after dependency', async () => {
    const qk = createKernel();

    qk.on('e', () => {}, { id: 'collector', phase: 'final' });
    qk.on('e', () => {}, { id: 'dependent', after: ['collector'] });

    await expect(qk.emit('e')).rejects.toThrow('Listener "dependent" depends on missing listener "collector"');
  });

  it('should run when it is the only listener of the event', async () => {
    const qk = createKernel();
    let calls = 0;

    qk.on('e', () => {
      calls++;
    }, { phase: 'final' });

    await qk.emit('e');
    await qk.emitSerial('e');

    expect(calls).toBe(2);
  });
});
