/**
 * Tests for kernel.when()
 *
 * when() is a shorthand for a Composition whose sources are all events of the
 * same kernel.
 */

import { describe, it, expect, vi } from 'vitest';
import { createKernel } from './kernel.js';
import { Composition, createOverrideMerger } from './composition/index.js';

interface ShopEvents {
  'cart:ready': { items: number };
  'payment:confirmed': { paid: boolean };
}

describe('kernel.when()', () => {
  it('should return a Composition', () => {
    const qk = createKernel<ShopEvents>();
    const checkout = qk.when(['cart:ready', 'payment:confirmed']);

    expect(checkout).toBeInstanceOf(Composition);

    checkout.dispose();
  });

  it('should fire onComposed once every event has fired', async () => {
    const qk = createKernel<ShopEvents>();
    const onComposed = vi.fn();
    const checkout = qk.when(['cart:ready', 'payment:confirmed']);
    checkout.onComposed(onComposed);

    await qk.emit('cart:ready', { items: 2 });
    expect(onComposed).not.toHaveBeenCalled();

    await qk.emit('payment:confirmed', { paid: true });
    expect(onComposed).toHaveBeenCalledTimes(1);

    const event = onComposed.mock.calls[0][0];
    expect(event.data.sources).toEqual(['cart:ready', 'payment:confirmed']);
    expect(event.data.contexts['cart:ready']).toEqual({ items: 2 });
    expect(event.data.contexts['payment:confirmed']).toEqual({ paid: true });

    checkout.dispose();
  });

  it('should fire regardless of the order of the events', async () => {
    const qk = createKernel<ShopEvents>();
    const onComposed = vi.fn();
    const checkout = qk.when(['cart:ready', 'payment:confirmed']);
    checkout.onComposed(onComposed);

    await qk.emit('payment:confirmed', { paid: true });
    await qk.emit('cart:ready', { items: 1 });

    expect(onComposed).toHaveBeenCalledTimes(1);

    checkout.dispose();
  });

  it('should resolve once() with the composite event', async () => {
    const qk = createKernel<ShopEvents>();
    const checkout = qk.when(['cart:ready', 'payment:confirmed']);
    const composed = checkout.once({ timeout: 1000 });

    await qk.emit('payment:confirmed', { paid: true });
    await qk.emit('cart:ready', { items: 3 });

    const event = await composed;
    expect(event.data.contexts['cart:ready']).toEqual({ items: 3 });

    checkout.dispose();
  });

  it('should pass options to the composition', async () => {
    const qk = createKernel<ShopEvents>();
    const checkout = qk.when(['cart:ready', 'payment:confirmed'], {
      merger: createOverrideMerger(),
    });
    const composed = checkout.once();

    await qk.emit('cart:ready', { items: 2 });
    await qk.emit('payment:confirmed', { paid: true });

    expect((await composed).data.merged).toEqual({ items: 2, paid: true });

    checkout.dispose();
  });

  it('should unsubscribe from the kernel on dispose()', () => {
    const qk = createKernel<ShopEvents>();
    const checkout = qk.when(['cart:ready', 'payment:confirmed']);

    expect(qk.listenerCount('cart:ready')).toBe(1);
    expect(qk.listenerCount('payment:confirmed')).toBe(1);

    checkout.dispose();

    expect(qk.listenerCount('cart:ready')).toBe(0);
    expect(qk.listenerCount('payment:confirmed')).toBe(0);
  });

  it('should stay subscribed after once() resolves, until dispose()', async () => {
    const qk = createKernel<ShopEvents>();
    const checkout = qk.when(['cart:ready', 'payment:confirmed']);
    const composed = checkout.once();

    await qk.emit('cart:ready', { items: 1 });
    await qk.emit('payment:confirmed', { paid: true });
    await composed;

    expect(qk.listenerCount('cart:ready')).toBe(1);

    checkout.dispose();

    expect(qk.listenerCount('cart:ready')).toBe(0);
  });

  it('should throw when no event name is given', () => {
    const qk = createKernel<ShopEvents>();

    expect(() => qk.when([])).toThrow('when() requires at least one event name');
  });
});
