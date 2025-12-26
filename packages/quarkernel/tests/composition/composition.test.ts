/**
 * Tests for Composition class
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createKernel } from '../../src/kernel.js';
import {
  Composition,
  createComposition,
  createNamespacedMerger,
  createOverrideMerger,
} from '../../src/composition/index.js';
import type { Kernel } from '../../src/kernel.js';

describe('Composition', () => {
  let userKernel: Kernel;
  let profileKernel: Kernel;
  let composition: Composition;

  beforeEach(() => {
    userKernel = createKernel();
    profileKernel = createKernel();
  });

  describe('constructor and factory', () => {
    it('creates composition from kernels array', () => {
      composition = new Composition([
        [userKernel, 'user:loaded'],
        [profileKernel, 'profile:loaded'],
      ]);

      expect(composition).toBeInstanceOf(Composition);
    });

    it('creates composition using factory function', () => {
      composition = createComposition([
        [userKernel, 'user:loaded'],
        [profileKernel, 'profile:loaded'],
      ]);

      expect(composition).toBeInstanceOf(Composition);
    });

    it('uses NamespacedMerger by default', async () => {
      composition = createComposition([
        [userKernel, 'user:loaded'],
        [profileKernel, 'profile:loaded'],
      ]);

      const listener = vi.fn();
      composition.onComposed(listener);

      await userKernel.emit('user:loaded', { count: 1 });
      await profileKernel.emit('profile:loaded', { count: 2 });

      expect(listener).toHaveBeenCalledTimes(1);
      const event = listener.mock.calls[0][0];
      expect(event.data.merged).toHaveProperty('user:loaded:count', 1);
      expect(event.data.merged).toHaveProperty('profile:loaded:count', 2);
    });

    it('accepts custom merger', async () => {
      composition = createComposition(
        [
          [userKernel, 'user:loaded'],
          [profileKernel, 'profile:loaded'],
        ],
        { merger: createOverrideMerger() }
      );

      const listener = vi.fn();
      composition.onComposed(listener);

      await userKernel.emit('user:loaded', { count: 1 });
      await profileKernel.emit('profile:loaded', { count: 2 });

      expect(listener).toHaveBeenCalledTimes(1);
      const event = listener.mock.calls[0][0];
      expect(event.data.merged).toEqual({ count: 2 });
    });

    it('accepts custom buffer limit', async () => {
      composition = createComposition(
        [
          [userKernel, 'user:loaded'],
          [profileKernel, 'profile:loaded'],
        ],
        { bufferLimit: 2 }
      );

      // Fill buffer beyond limit
      await userKernel.emit('user:loaded', { value: 1 });
      await userKernel.emit('user:loaded', { value: 2 });
      await userKernel.emit('user:loaded', { value: 3 });

      const buffer = composition.getBuffer('user:loaded');
      expect(buffer).toHaveLength(2);
      expect(buffer?.[0].data).toEqual({ value: 2 });
      expect(buffer?.[1].data).toEqual({ value: 3 });
    });
  });

  describe('event composition', () => {
    beforeEach(() => {
      composition = createComposition([
        [userKernel, 'user:loaded'],
        [profileKernel, 'profile:loaded'],
      ]);
    });

    it('emits composite event when all sources fire', async () => {
      const listener = vi.fn();
      composition.onComposed(listener);

      await userKernel.emit('user:loaded', { userId: 123 });
      expect(listener).not.toHaveBeenCalled();

      await profileKernel.emit('profile:loaded', { profileId: 456 });
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('includes all source contexts in composite event', async () => {
      const listener = vi.fn();
      composition.onComposed(listener);

      await userKernel.emit('user:loaded', { userId: 123 });
      await profileKernel.emit('profile:loaded', { profileId: 456 });

      const event = listener.mock.calls[0][0];
      expect(event.data.sources).toContain('user:loaded');
      expect(event.data.sources).toContain('profile:loaded');
      expect(event.data.contexts['user:loaded']).toBeDefined();
      expect(event.data.contexts['profile:loaded']).toBeDefined();
    });

    it('merges contexts using configured merger', async () => {
      const listener = vi.fn();
      composition.onComposed(listener);

      // Add context through listeners
      userKernel.on('user:loaded', (e) => {
        e.context.userName = 'Alice';
        e.context.count = 1;
      });
      profileKernel.on('profile:loaded', (e) => {
        e.context.city = 'NYC';
        e.context.count = 2;
      });

      await userKernel.emit('user:loaded', {});
      await profileKernel.emit('profile:loaded', {});

      const event = listener.mock.calls[0][0];
      expect(event.data.merged).toHaveProperty('user:loaded:userName', 'Alice');
      expect(event.data.merged).toHaveProperty('user:loaded:count', 1);
      expect(event.data.merged).toHaveProperty('profile:loaded:city', 'NYC');
      expect(event.data.merged).toHaveProperty('profile:loaded:count', 2);
    });

    it('emits composite event on subsequent source emissions', async () => {
      // With reset=true (default), composition requires all sources to fire in each cycle
      // So subsequent emissions wait for all sources before emitting
      const listener = vi.fn();
      composition.onComposed(listener);

      await userKernel.emit('user:loaded', { v: 1 });
      await profileKernel.emit('profile:loaded', { v: 1 });
      expect(listener).toHaveBeenCalledTimes(1);

      // After reset, user fires but waits for profile
      await userKernel.emit('user:loaded', { v: 2 });
      expect(listener).toHaveBeenCalledTimes(1); // No composite yet

      // When profile fires, both have fired in this cycle -> composite
      await profileKernel.emit('profile:loaded', { v: 2 });
      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('uses latest event from each source for merging', async () => {
      const listener = vi.fn();
      composition.onComposed(listener);

      userKernel.on('user:loaded', (e) => {
        e.context.value = e.data.value;
      });
      profileKernel.on('profile:loaded', (e) => {
        e.context.value = e.data.value;
      });

      await userKernel.emit('user:loaded', { value: 1 });
      await userKernel.emit('user:loaded', { value: 2 });
      await profileKernel.emit('profile:loaded', { value: 100 });

      const event = listener.mock.calls[0][0];
      expect(event.data.merged['user:loaded:value']).toBe(2);
      expect(event.data.merged['profile:loaded:value']).toBe(100);
    });
  });

  describe('buffer management', () => {
    beforeEach(() => {
      composition = createComposition(
        [
          [userKernel, 'user:loaded'],
          [profileKernel, 'profile:loaded'],
        ],
        { bufferLimit: 3 }
      );
    });

    it('buffers events per source', async () => {
      await userKernel.emit('user:loaded', { v: 1 });
      await userKernel.emit('user:loaded', { v: 2 });

      const buffer = composition.getBuffer('user:loaded');
      expect(buffer).toHaveLength(2);
      expect(buffer?.[0].data).toEqual({ v: 1 });
      expect(buffer?.[1].data).toEqual({ v: 2 });
    });

    it('enforces buffer limit (FIFO)', async () => {
      await userKernel.emit('user:loaded', { v: 1 });
      await userKernel.emit('user:loaded', { v: 2 });
      await userKernel.emit('user:loaded', { v: 3 });
      await userKernel.emit('user:loaded', { v: 4 });

      const buffer = composition.getBuffer('user:loaded');
      expect(buffer).toHaveLength(3);
      expect(buffer?.[0].data).toEqual({ v: 2 });
      expect(buffer?.[1].data).toEqual({ v: 3 });
      expect(buffer?.[2].data).toEqual({ v: 4 });
    });

    it('maintains separate buffers for each source', async () => {
      await userKernel.emit('user:loaded', { v: 1 });
      await userKernel.emit('user:loaded', { v: 2 });
      await profileKernel.emit('profile:loaded', { v: 100 });

      const userBuffer = composition.getBuffer('user:loaded');
      const profileBuffer = composition.getBuffer('profile:loaded');

      expect(userBuffer).toHaveLength(2);
      expect(profileBuffer).toHaveLength(1);
    });

    it('resets buffers after composite emission by default', async () => {
      const listener = vi.fn();
      composition.onComposed(listener);

      await userKernel.emit('user:loaded', { v: 1 });
      await profileKernel.emit('profile:loaded', { v: 1 });

      expect(listener).toHaveBeenCalledTimes(1);

      const userBuffer = composition.getBuffer('user:loaded');
      const profileBuffer = composition.getBuffer('profile:loaded');

      // After reset, buffers keep only the latest event to enable continuous composition
      expect(userBuffer).toHaveLength(1);
      expect(profileBuffer).toHaveLength(1);
    });

    it('preserves buffers when reset=false', async () => {
      composition = createComposition(
        [
          [userKernel, 'user:loaded'],
          [profileKernel, 'profile:loaded'],
        ],
        { reset: false }
      );

      const listener = vi.fn();
      composition.onComposed(listener);

      await userKernel.emit('user:loaded', { v: 1 });
      await profileKernel.emit('profile:loaded', { v: 1 });

      const userBuffer = composition.getBuffer('user:loaded');
      const profileBuffer = composition.getBuffer('profile:loaded');

      expect(userBuffer).toHaveLength(1);
      expect(profileBuffer).toHaveLength(1);
    });

    it('clears all buffers on demand', async () => {
      await userKernel.emit('user:loaded', { v: 1 });
      await profileKernel.emit('profile:loaded', { v: 1 });

      composition.clearBuffers();

      const userBuffer = composition.getBuffer('user:loaded');
      const profileBuffer = composition.getBuffer('profile:loaded');

      expect(userBuffer).toHaveLength(0);
      expect(profileBuffer).toHaveLength(0);
    });
  });

  describe('getContext()', () => {
    beforeEach(() => {
      composition = createComposition([
        [userKernel, 'user:loaded'],
        [profileKernel, 'profile:loaded'],
      ]);
    });

    it('returns null when not all sources have fired', () => {
      expect(composition.getContext()).toBeNull();
    });

    it('returns null after one source fires', async () => {
      await userKernel.emit('user:loaded', { v: 1 });
      expect(composition.getContext()).toBeNull();
    });

    it('returns merged context when all sources have fired', async () => {
      userKernel.on('user:loaded', (e) => {
        e.context.userName = 'Alice';
      });
      profileKernel.on('profile:loaded', (e) => {
        e.context.city = 'NYC';
      });

      await userKernel.emit('user:loaded', {});
      await profileKernel.emit('profile:loaded', {});

      const context = composition.getContext();
      expect(context).not.toBeNull();
      expect(context).toHaveProperty('user:loaded:userName', 'Alice');
      expect(context).toHaveProperty('profile:loaded:city', 'NYC');
    });

    it('does not trigger composite event emission', async () => {
      const listener = vi.fn();
      composition.onComposed(listener);

      await userKernel.emit('user:loaded', {});
      await profileKernel.emit('profile:loaded', {});

      // Clear listener calls from automatic emission
      listener.mockClear();

      composition.getContext();
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('unified interface', () => {
    beforeEach(() => {
      composition = createComposition([
        [userKernel, 'user:loaded'],
        [profileKernel, 'profile:loaded'],
      ]);
    });

    it('supports on() for registering listeners', async () => {
      const listener = vi.fn();
      composition.onComposed(listener);

      await userKernel.emit('user:loaded', {});
      await profileKernel.emit('profile:loaded', {});

      expect(listener).toHaveBeenCalled();
    });

    it('returns unbind function from on()', async () => {
      const listener = vi.fn();
      const unbind = composition.onComposed(listener);

      await userKernel.emit('user:loaded', {});
      await profileKernel.emit('profile:loaded', {});

      expect(listener).toHaveBeenCalledTimes(1);

      unbind();
      listener.mockClear();

      await userKernel.emit('user:loaded', {});
      expect(listener).not.toHaveBeenCalled();
    });

    it('supports offComposed() for removing specific listener', async () => {
      const listener = vi.fn();
      composition.onComposed(listener);

      await userKernel.emit('user:loaded', {});
      await profileKernel.emit('profile:loaded', {});

      expect(listener).toHaveBeenCalledTimes(1);

      composition.offComposed(listener);
      listener.mockClear();

      await userKernel.emit('user:loaded', {});
      expect(listener).not.toHaveBeenCalled();
    });

    it('supports emit() to trigger events on internal kernel', async () => {
      const listener = vi.fn();
      composition.on('custom', listener);

      await composition.emit('custom', { test: 'data' });

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener.mock.calls[0][0].data).toEqual({ test: 'data' });
    });

    it('blocks emit() of reserved internal events', async () => {
      await expect(composition.emit('__qk:composed__' as any, {}))
        .rejects.toThrow('Cannot emit reserved event');

      await expect(composition.emit('__qk:anything__' as any, {}))
        .rejects.toThrow('Cannot emit reserved event');
    });

    it('supports composedListenerCount()', () => {
      expect(composition.composedListenerCount()).toBe(0);

      composition.onComposed(() => {});
      expect(composition.composedListenerCount()).toBe(1);

      composition.onComposed(() => {});
      expect(composition.composedListenerCount()).toBe(2);
    });

    it('supports eventNames() for custom events', () => {
      expect(composition.eventNames()).toEqual([]);

      composition.on('custom', () => {});
      composition.on('other', () => {});

      const names = composition.eventNames();
      expect(names).toContain('custom');
      expect(names).toContain('other');
    });

    it('supports offComposed()', async () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      composition.onComposed(listener1);
      composition.onComposed(listener2);

      composition.offComposed();

      await userKernel.emit('user:loaded', {});
      await profileKernel.emit('profile:loaded', {});

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).not.toHaveBeenCalled();
    });

    it('supports debug() to enable/disable debug mode', () => {
      expect(() => composition.debug(true)).not.toThrow();
      expect(() => composition.debug(false)).not.toThrow();
    });
  });

  describe('disposal', () => {
    beforeEach(() => {
      composition = createComposition([
        [userKernel, 'user:loaded'],
        [profileKernel, 'profile:loaded'],
      ]);
    });

    it('unsubscribes from all source kernels', async () => {
      const listener = vi.fn();
      composition.onComposed(listener);

      await userKernel.emit('user:loaded', {});
      await profileKernel.emit('profile:loaded', {});
      expect(listener).toHaveBeenCalledTimes(1);

      composition.dispose();
      listener.mockClear();

      await userKernel.emit('user:loaded', {});
      await profileKernel.emit('profile:loaded', {});
      expect(listener).not.toHaveBeenCalled();
    });

    it('clears all listeners on internal kernel', async () => {
      const listener = vi.fn();
      composition.onComposed(listener);

      composition.dispose();

      await composition.emit('composite', { test: true });
      expect(listener).not.toHaveBeenCalled();
    });

    it('clears all buffers', async () => {
      await userKernel.emit('user:loaded', { v: 1 });

      composition.dispose();

      const buffer = composition.getBuffer('user:loaded');
      expect(buffer).toBeUndefined();
    });

    it('can be called multiple times safely', () => {
      composition.dispose();
      expect(() => composition.dispose()).not.toThrow();
    });
  });

  describe('context merging with different strategies', () => {
    it('works with OverrideMerger', async () => {
      composition = createComposition(
        [
          [userKernel, 'user:loaded'],
          [profileKernel, 'profile:loaded'],
        ],
        { merger: createOverrideMerger() }
      );

      const listener = vi.fn();
      composition.onComposed(listener);

      userKernel.on('user:loaded', (e) => {
        e.context.status = 'user';
        e.context.value = 1;
      });
      profileKernel.on('profile:loaded', (e) => {
        e.context.status = 'profile';
        e.context.extra = 2;
      });

      await userKernel.emit('user:loaded', {});
      await profileKernel.emit('profile:loaded', {});

      const event = listener.mock.calls[0][0];
      expect(event.data.merged).toEqual({
        status: 'profile',
        value: 1,
        extra: 2,
      });
    });

    it('handles empty contexts', async () => {
      composition = createComposition([
        [userKernel, 'user:loaded'],
        [profileKernel, 'profile:loaded'],
      ]);

      const listener = vi.fn();
      composition.onComposed(listener);

      await userKernel.emit('user:loaded', {});
      await profileKernel.emit('profile:loaded', {});

      const event = listener.mock.calls[0][0];
      expect(event.data.merged).toEqual({});
    });
  });

  describe('edge cases', () => {
    it('throws error when composing zero kernels', () => {
      expect(() => createComposition([])).toThrow();
    });

    it('handles composition with single kernel', async () => {
      composition = createComposition([[userKernel, 'user:loaded']]);

      const listener = vi.fn();
      composition.onComposed(listener);

      await userKernel.emit('user:loaded', { test: true });

      expect(listener).toHaveBeenCalledTimes(1);
      const event = listener.mock.calls[0][0];
      expect(event.data.sources).toEqual(['user:loaded']);
    });

    it('handles buffer overflow beyond default limit of 100', async () => {
      composition = createComposition([
        [userKernel, 'user:loaded'],
        [profileKernel, 'profile:loaded'],
      ]);

      // Emit 150 events to overflow the default buffer limit of 100
      for (let i = 0; i < 150; i++) {
        await userKernel.emit('user:loaded', { value: i });
      }

      const buffer = composition.getBuffer('user:loaded');
      expect(buffer).toHaveLength(100);
      // First event (value: 0) should be evicted
      expect(buffer?.[0].data).toEqual({ value: 50 });
      // Last event should be preserved
      expect(buffer?.[99].data).toEqual({ value: 149 });
    });

    it('handles circular kernel references', async () => {
      const kernelA = createKernel();
      const kernelB = createKernel();

      // Create circular reference through listeners
      kernelA.on('event-a', async () => {
        await kernelB.emit('event-b', { from: 'A' });
      });

      kernelB.on('event-b', async () => {
        // Don't re-emit to A to avoid infinite loop
        // Just verify composition captures both
      });

      composition = createComposition([
        [kernelA, 'event-a'],
        [kernelB, 'event-b'],
      ]);

      const listener = vi.fn();
      composition.onComposed(listener);

      // Trigger the circular reference
      await kernelA.emit('event-a', { initial: true });

      expect(listener).toHaveBeenCalledTimes(1);
      const event = listener.mock.calls[0][0];
      expect(event.data.sources).toContain('event-a');
      expect(event.data.sources).toContain('event-b');
    });

    it('detects conflicting context keys with NamespacedMerger', async () => {
      const onConflict = vi.fn();
      composition = createComposition(
        [
          [userKernel, 'user:loaded'],
          [profileKernel, 'profile:loaded'],
        ],
        { onConflict }
      );

      const listener = vi.fn();
      composition.onComposed(listener);

      userKernel.on('user:loaded', (e) => {
        e.context.status = 'active';
        e.context.count = 1;
      });

      profileKernel.on('profile:loaded', (e) => {
        e.context.status = 'pending';
        e.context.count = 2;
      });

      await userKernel.emit('user:loaded', {});
      await profileKernel.emit('profile:loaded', {});

      // NamespacedMerger prevents conflicts by prefixing
      const event = listener.mock.calls[0][0];
      expect(event.data.merged).toHaveProperty('user:loaded:status', 'active');
      expect(event.data.merged).toHaveProperty('profile:loaded:status', 'pending');
      expect(event.data.merged).toHaveProperty('user:loaded:count', 1);
      expect(event.data.merged).toHaveProperty('profile:loaded:count', 2);
    });

    it('handles conflicting context keys with OverrideMerger', async () => {
      const onConflict = vi.fn();
      composition = createComposition(
        [
          [userKernel, 'user:loaded'],
          [profileKernel, 'profile:loaded'],
        ],
        { merger: createOverrideMerger(), onConflict }
      );

      const listener = vi.fn();
      composition.onComposed(listener);

      userKernel.on('user:loaded', (e) => {
        e.context.status = 'active';
        e.context.count = 1;
      });

      profileKernel.on('profile:loaded', (e) => {
        e.context.status = 'pending';
        e.context.count = 2;
      });

      await userKernel.emit('user:loaded', {});
      await profileKernel.emit('profile:loaded', {});

      // OverrideMerger uses last-write-wins
      const event = listener.mock.calls[0][0];
      expect(event.data.merged).toEqual({
        status: 'pending',
        count: 2,
      });
    });

    it('handles many source kernels', async () => {
      const kernel1 = createKernel();
      const kernel2 = createKernel();
      const kernel3 = createKernel();
      const kernel4 = createKernel();

      composition = createComposition([
        [kernel1, 'event1'],
        [kernel2, 'event2'],
        [kernel3, 'event3'],
        [kernel4, 'event4'],
      ]);

      const listener = vi.fn();
      composition.onComposed(listener);

      await kernel1.emit('event1', {});
      await kernel2.emit('event2', {});
      await kernel3.emit('event3', {});

      expect(listener).not.toHaveBeenCalled();

      await kernel4.emit('event4', {});

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('handles rapid successive emissions', async () => {
      composition = createComposition([
        [userKernel, 'user:loaded'],
        [profileKernel, 'profile:loaded'],
      ]);

      const listener = vi.fn();
      composition.onComposed(listener);

      for (let i = 0; i < 10; i++) {
        await userKernel.emit('user:loaded', { i });
        await profileKernel.emit('profile:loaded', { i });
      }

      expect(listener).toHaveBeenCalledTimes(10);
    });
  });

  describe('event TTL (time-to-live)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('accepts eventTTL option', () => {
      composition = createComposition(
        [
          [userKernel, 'user:loaded'],
          [profileKernel, 'profile:loaded'],
        ],
        { eventTTL: 5000 }
      );

      expect(composition.getEventTTL()).toBe(5000);
    });

    it('defaults to 0 (no expiration) when eventTTL not specified', () => {
      composition = createComposition([
        [userKernel, 'user:loaded'],
        [profileKernel, 'profile:loaded'],
      ]);

      expect(composition.getEventTTL()).toBe(0);
    });

    it('emits composite when all events fire within TTL window', async () => {
      composition = createComposition(
        [
          [userKernel, 'user:loaded'],
          [profileKernel, 'profile:loaded'],
        ],
        { eventTTL: 5000 }
      );

      const listener = vi.fn();
      composition.onComposed(listener);

      await userKernel.emit('user:loaded', { user: 'test' });

      // Advance time but stay within TTL
      vi.advanceTimersByTime(2000);

      await profileKernel.emit('profile:loaded', { profile: 'test' });

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('does NOT emit composite when first event expires before second fires', async () => {
      composition = createComposition(
        [
          [userKernel, 'user:loaded'],
          [profileKernel, 'profile:loaded'],
        ],
        { eventTTL: 3000 }
      );

      const listener = vi.fn();
      composition.onComposed(listener);

      await userKernel.emit('user:loaded', { user: 'test' });

      // Wait for first event to expire
      vi.advanceTimersByTime(4000);

      await profileKernel.emit('profile:loaded', { profile: 'test' });

      // Composite should NOT fire because user:loaded expired
      expect(listener).not.toHaveBeenCalled();

      // Buffer for user:loaded should be empty
      const buffer = composition.getBuffer('user:loaded');
      expect(buffer).toHaveLength(0);
    });

    it('fires composite when second event re-fires within TTL after expiration', async () => {
      composition = createComposition(
        [
          [userKernel, 'user:loaded'],
          [profileKernel, 'profile:loaded'],
        ],
        { eventTTL: 3000 }
      );

      const listener = vi.fn();
      composition.onComposed(listener);

      // First cycle - user fires, expires, profile fires (no composite)
      await userKernel.emit('user:loaded', { user: 'test1' });
      vi.advanceTimersByTime(4000);
      await profileKernel.emit('profile:loaded', { profile: 'test1' });
      expect(listener).not.toHaveBeenCalled();

      // Second cycle - both fire within TTL window
      await userKernel.emit('user:loaded', { user: 'test2' });
      vi.advanceTimersByTime(1000);
      await profileKernel.emit('profile:loaded', { profile: 'test2' });

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('clears expiration timers on dispose', async () => {
      composition = createComposition(
        [
          [userKernel, 'user:loaded'],
          [profileKernel, 'profile:loaded'],
        ],
        { eventTTL: 5000 }
      );

      await userKernel.emit('user:loaded', { user: 'test' });

      // Dispose should clear timers
      composition.dispose();

      // Advancing time should not cause errors
      expect(() => vi.advanceTimersByTime(10000)).not.toThrow();
    });

    it('without TTL, events stay in buffer indefinitely', async () => {
      composition = createComposition([
        [userKernel, 'user:loaded'],
        [profileKernel, 'profile:loaded'],
      ]);

      const listener = vi.fn();
      composition.onComposed(listener);

      await userKernel.emit('user:loaded', { user: 'test' });

      // Advance time significantly
      vi.advanceTimersByTime(60000);

      await profileKernel.emit('profile:loaded', { profile: 'test' });

      // Should still fire because no TTL configured
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('handles multiple events from same source with TTL', async () => {
      composition = createComposition(
        [
          [userKernel, 'user:loaded'],
          [profileKernel, 'profile:loaded'],
        ],
        { eventTTL: 5000 }
      );

      const listener = vi.fn();
      composition.onComposed(listener);

      // Fire multiple user events
      await userKernel.emit('user:loaded', { v: 1 });
      vi.advanceTimersByTime(2000);
      await userKernel.emit('user:loaded', { v: 2 });
      vi.advanceTimersByTime(2000);
      await userKernel.emit('user:loaded', { v: 3 });

      // First event should be expired, but second and third still valid
      vi.advanceTimersByTime(2000);

      const buffer = composition.getBuffer('user:loaded');
      // v:1 expired (5s TTL, 6s elapsed), v:2 and v:3 still valid
      expect(buffer?.length).toBeLessThanOrEqual(2);

      // Profile fires - should trigger composite with latest user event
      await profileKernel.emit('profile:loaded', { profile: 'test' });

      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe('per-event TTL (eventTTLs)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('accepts eventTTLs option', () => {
      composition = createComposition(
        [
          [userKernel, 'user:loaded'],
          [profileKernel, 'profile:loaded'],
        ],
        {
          eventTTLs: {
            'user:loaded': 3000,
            'profile:loaded': 'permanent',
          },
        }
      );

      expect(composition.getEventTTLs()).toEqual({
        'user:loaded': 3000,
        'profile:loaded': 'permanent',
      });
    });

    it('per-event TTL overrides global TTL', async () => {
      composition = createComposition(
        [
          [userKernel, 'user:loaded'],
          [profileKernel, 'profile:loaded'],
        ],
        {
          eventTTL: 10000, // Global: 10s
          eventTTLs: {
            'user:loaded': 2000, // Override: 2s for user:loaded
          },
        }
      );

      const listener = vi.fn();
      composition.onComposed(listener);

      await userKernel.emit('user:loaded', { user: 'test' });

      // Wait 3s - user:loaded should expire (has 2s TTL), but profile:loaded would still be valid under global TTL
      vi.advanceTimersByTime(3000);

      await profileKernel.emit('profile:loaded', { profile: 'test' });

      // Should NOT fire because user:loaded expired with its custom 2s TTL
      expect(listener).not.toHaveBeenCalled();
    });

    it('permanent per-event TTL keeps event forever', async () => {
      composition = createComposition(
        [
          [userKernel, 'user:loaded'],
          [profileKernel, 'profile:loaded'],
        ],
        {
          eventTTL: 2000, // Global: 2s
          eventTTLs: {
            'user:loaded': 'permanent', // Override: permanent
          },
        }
      );

      const listener = vi.fn();
      composition.onComposed(listener);

      await userKernel.emit('user:loaded', { user: 'test' });

      // Wait much longer than global TTL
      vi.advanceTimersByTime(30000);

      await profileKernel.emit('profile:loaded', { profile: 'test' });

      // Should fire because user:loaded is permanent
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('instant mode fires composite only if it completes immediately', async () => {
      composition = createComposition(
        [
          [userKernel, 'user:loaded'],
          [profileKernel, 'profile:loaded'],
        ],
        {
          eventTTLs: {
            'user:loaded': 'instant', // user:loaded is instant
          },
        }
      );

      const listener = vi.fn();
      composition.onComposed(listener);

      // Fire user:loaded first - it's instant so it won't wait
      await userKernel.emit('user:loaded', { user: 'first' });

      // user:loaded should be discarded since composition wasn't complete
      const buffer = composition.getBuffer('user:loaded');
      expect(buffer).toHaveLength(0);

      // profile:loaded fires next
      await profileKernel.emit('profile:loaded', { profile: 'test' });

      // No composite because user:loaded was discarded
      expect(listener).not.toHaveBeenCalled();
    });

    it('instant event triggers composite when it completes the composition', async () => {
      composition = createComposition(
        [
          [userKernel, 'user:loaded'],
          [profileKernel, 'profile:loaded'],
        ],
        {
          eventTTLs: {
            'user:loaded': 'instant', // user:loaded is instant
          },
        }
      );

      const listener = vi.fn();
      composition.onComposed(listener);

      // Fire profile:loaded first (permanent by default)
      await profileKernel.emit('profile:loaded', { profile: 'test' });

      // Now fire user:loaded - it's instant and should complete composition
      await userKernel.emit('user:loaded', { user: 'completes' });

      // Composite should fire because user:loaded completed the composition
      expect(listener).toHaveBeenCalledTimes(1);
      const event = listener.mock.calls[0][0];
      expect(event.data.merged).toHaveProperty('user:loaded:user', 'completes');
    });

    it('mixed TTL modes work together', async () => {
      const kernel3 = createKernel();

      composition = createComposition(
        [
          [userKernel, 'user:loaded'],
          [profileKernel, 'profile:loaded'],
          [kernel3, 'settings:loaded'],
        ],
        {
          eventTTLs: {
            'user:loaded': 'permanent', // Stays forever
            'profile:loaded': 5000, // 5s TTL
            'settings:loaded': 'instant', // Must complete immediately
          },
        }
      );

      const listener = vi.fn();
      composition.onComposed(listener);

      // Fire permanent event
      await userKernel.emit('user:loaded', { user: 'test' });

      // Fire TTL event
      await profileKernel.emit('profile:loaded', { profile: 'test' });

      vi.advanceTimersByTime(2000);

      // Fire instant event - should complete composition
      await kernel3.emit('settings:loaded', { settings: 'test' });

      expect(listener).toHaveBeenCalledTimes(1);

      // Cleanup
      composition.dispose();
    });

    it('instant event is discarded after failed composition but buffer is restored for next try', async () => {
      const kernel3 = createKernel();

      composition = createComposition(
        [
          [userKernel, 'user:loaded'],
          [profileKernel, 'profile:loaded'],
          [kernel3, 'settings:loaded'],
        ],
        {
          eventTTLs: {
            'settings:loaded': 'instant',
          },
        }
      );

      const listener = vi.fn();
      composition.onComposed(listener);

      // Only user fires
      await userKernel.emit('user:loaded', { user: 'test' });

      // Fire instant - composition incomplete, discarded
      await kernel3.emit('settings:loaded', { v: 1 });
      expect(composition.getBuffer('settings:loaded')).toHaveLength(0);
      expect(listener).not.toHaveBeenCalled();

      // Now profile fires
      await profileKernel.emit('profile:loaded', { profile: 'test' });

      // Still no composite (settings was discarded)
      expect(listener).not.toHaveBeenCalled();

      // Fire settings again - should now complete
      await kernel3.emit('settings:loaded', { v: 2 });
      expect(listener).toHaveBeenCalledTimes(1);

      composition.dispose();
    });

    it('setEventTTL updates global TTL', () => {
      composition = createComposition([
        [userKernel, 'user:loaded'],
        [profileKernel, 'profile:loaded'],
      ]);

      expect(composition.getEventTTL()).toBe(0);

      composition.setEventTTL(5000);
      expect(composition.getEventTTL()).toBe(5000);
    });

    it('setEventTTLFor updates per-event TTL', () => {
      composition = createComposition([
        [userKernel, 'user:loaded'],
        [profileKernel, 'profile:loaded'],
      ]);

      expect(composition.getEventTTLs()).toEqual({});

      composition.setEventTTLFor('user:loaded', 'instant');
      composition.setEventTTLFor('profile:loaded', 3000);

      expect(composition.getEventTTLs()).toEqual({
        'user:loaded': 'instant',
        'profile:loaded': 3000,
      });
    });

    it('clearEventTTLFor removes per-event TTL', () => {
      composition = createComposition(
        [
          [userKernel, 'user:loaded'],
          [profileKernel, 'profile:loaded'],
        ],
        {
          eventTTLs: {
            'user:loaded': 'instant',
            'profile:loaded': 5000,
          },
        }
      );

      composition.clearEventTTLFor('user:loaded');

      expect(composition.getEventTTLs()).toEqual({
        'profile:loaded': 5000,
      });
    });

    it('dynamically changed TTL affects subsequent events', async () => {
      composition = createComposition([
        [userKernel, 'user:loaded'],
        [profileKernel, 'profile:loaded'],
      ]);

      const listener = vi.fn();
      composition.onComposed(listener);

      // Initially no TTL - event stays forever
      await userKernel.emit('user:loaded', { user: 'test' });

      vi.advanceTimersByTime(10000);

      // Event should still be in buffer
      expect(composition.getBuffer('user:loaded')).toHaveLength(1);

      // Now set instant mode for user:loaded
      composition.setEventTTLFor('user:loaded', 'instant');

      // Fire user:loaded again - should be discarded (profile not ready)
      await userKernel.emit('user:loaded', { user: 'test2' });

      // Buffer should still have old event (instant only affects new events)
      // But firedSinceLastComposite was cleared because instant discarded it
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
