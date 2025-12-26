/**
 * Integration tests for Kernel.compose() static method
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Kernel, createKernel } from '../../src/kernel.js';
import { Composition, createNamespacedMerger, createOverrideMerger } from '../../src/composition/index.js';

describe('Kernel.compose()', () => {
  let userKernel: Kernel;
  let profileKernel: Kernel;
  let settingsKernel: Kernel;

  beforeEach(() => {
    userKernel = createKernel();
    profileKernel = createKernel();
    settingsKernel = createKernel();
  });

  describe('basic composition', () => {
    it('returns Composition instance', () => {
      const composition = Kernel.compose(
        [userKernel, 'user:loaded'],
        [profileKernel, 'profile:loaded']
      );

      expect(composition).toBeInstanceOf(Composition);
    });

    it('composes events from two kernels', async () => {
      const composition = Kernel.compose(
        [userKernel, 'user:loaded'],
        [profileKernel, 'profile:loaded']
      );

      const listener = vi.fn();
      composition.onComposed(listener);

      await userKernel.emit('user:loaded', { id: 1 });
      await profileKernel.emit('profile:loaded', { bio: 'test' });

      expect(listener).toHaveBeenCalledTimes(1);
      const event = listener.mock.calls[0][0];
      expect(event.data.sources).toEqual(['user:loaded', 'profile:loaded']);
      expect(event.data.merged).toHaveProperty('user:loaded:id', 1);
      expect(event.data.merged).toHaveProperty('profile:loaded:bio', 'test');
    });

    it('composes events from three or more kernels', async () => {
      const composition = Kernel.compose(
        [userKernel, 'user:loaded'],
        [profileKernel, 'profile:loaded'],
        [settingsKernel, 'settings:loaded']
      );

      const listener = vi.fn();
      composition.onComposed(listener);

      await userKernel.emit('user:loaded', { id: 1 });
      await profileKernel.emit('profile:loaded', { bio: 'test' });
      await settingsKernel.emit('settings:loaded', { theme: 'dark' });

      expect(listener).toHaveBeenCalledTimes(1);
      const event = listener.mock.calls[0][0];
      expect(event.data.sources).toEqual([
        'user:loaded',
        'profile:loaded',
        'settings:loaded',
      ]);
      expect(event.data.merged).toHaveProperty('user:loaded:id', 1);
      expect(event.data.merged).toHaveProperty('profile:loaded:bio', 'test');
      expect(event.data.merged).toHaveProperty('settings:loaded:theme', 'dark');
    });
  });

  describe('with options', () => {
    it('accepts merger option', async () => {
      const composition = Kernel.compose(
        [userKernel, 'user:loaded'],
        [profileKernel, 'profile:loaded'],
        { merger: createOverrideMerger() }
      );

      const listener = vi.fn();
      composition.onComposed(listener);

      await userKernel.emit('user:loaded', { count: 1 });
      await profileKernel.emit('profile:loaded', { count: 2 });

      expect(listener).toHaveBeenCalledTimes(1);
      const event = listener.mock.calls[0][0];
      // OverrideMerger should merge without namespacing, last wins
      expect(event.data.merged).toEqual({ count: 2 });
    });

    it('accepts bufferLimit option', async () => {
      const composition = Kernel.compose(
        [userKernel, 'user:loaded'],
        [profileKernel, 'profile:loaded'],
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

    it('accepts reset option', async () => {
      const composition = Kernel.compose(
        [userKernel, 'user:loaded'],
        [profileKernel, 'profile:loaded'],
        { reset: false }
      );

      const listener = vi.fn();
      composition.onComposed(listener);

      // First composition
      await userKernel.emit('user:loaded', { id: 1 });
      await profileKernel.emit('profile:loaded', { bio: 'test' });

      expect(listener).toHaveBeenCalledTimes(1);

      // Second composition - with reset: false, buffers accumulate
      await userKernel.emit('user:loaded', { id: 2 });
      await profileKernel.emit('profile:loaded', { bio: 'updated' });

      expect(listener).toHaveBeenCalledTimes(2);

      // Buffers should have multiple events
      const userBuffer = composition.getBuffer('user:loaded');
      const profileBuffer = composition.getBuffer('profile:loaded');
      expect(userBuffer?.length).toBeGreaterThan(1);
      expect(profileBuffer?.length).toBeGreaterThan(1);
    });

    it('accepts multiple options together', async () => {
      const composition = Kernel.compose(
        [userKernel, 'user:loaded'],
        [profileKernel, 'profile:loaded'],
        {
          merger: createOverrideMerger(),
          bufferLimit: 5,
          reset: true,
        }
      );

      const listener = vi.fn();
      composition.onComposed(listener);

      await userKernel.emit('user:loaded', { count: 1 });
      await profileKernel.emit('profile:loaded', { count: 2 });

      expect(listener).toHaveBeenCalledTimes(1);
      const event = listener.mock.calls[0][0];
      // OverrideMerger: last wins
      expect(event.data.merged).toEqual({ count: 2 });
    });
  });

  describe('integration with Kernel features', () => {
    it('works with kernels that have listeners with priorities', async () => {
      const composition = Kernel.compose(
        [userKernel, 'user:loaded'],
        [profileKernel, 'profile:loaded']
      );

      // Add high-priority listener that modifies context
      userKernel.on(
        'user:loaded',
        (event) => {
          event.context.priority = 'high';
        },
        { priority: 100 }
      );

      const listener = vi.fn();
      composition.onComposed(listener);

      await userKernel.emit('user:loaded', { id: 1 });
      await profileKernel.emit('profile:loaded', { bio: 'test' });

      expect(listener).toHaveBeenCalledTimes(1);
      const event = listener.mock.calls[0][0];
      // Context from high-priority listener should be merged
      expect(event.data.merged).toHaveProperty('user:loaded:priority', 'high');
    });

    it('works with kernels that have error boundaries', async () => {
      const errorHandler = vi.fn();
      const errorKernel = createKernel({
        errorBoundary: true,
        onError: errorHandler,
      });

      const composition = Kernel.compose(
        [errorKernel, 'error:test'],
        [profileKernel, 'profile:loaded']
      );

      // Add listener that throws
      errorKernel.on('error:test', () => {
        throw new Error('Test error');
      });

      const listener = vi.fn();
      composition.onComposed(listener);

      // Should not throw due to error boundary
      await expect(errorKernel.emit('error:test', { id: 1 })).resolves.toBeUndefined();
      await profileKernel.emit('profile:loaded', { bio: 'test' });

      expect(errorHandler).toHaveBeenCalled();
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('works with wildcard listeners', async () => {
      const wildcardKernel = createKernel({ wildcard: true, delimiter: ':' });

      const composition = Kernel.compose(
        [wildcardKernel, 'user:*'],
        [profileKernel, 'profile:loaded']
      );

      wildcardKernel.on('user:*', (event) => {
        event.context.wildcard = true;
      });

      const listener = vi.fn();
      composition.onComposed(listener);

      await wildcardKernel.emit('user:created', { id: 1 });
      await profileKernel.emit('profile:loaded', { bio: 'test' });

      expect(listener).toHaveBeenCalledTimes(1);
      const event = listener.mock.calls[0][0];
      expect(event.data.merged).toHaveProperty('user:*:wildcard', true);
    });
  });

  describe('edge cases', () => {
    it('handles composition with no options', () => {
      const composition = Kernel.compose(
        [userKernel, 'user:loaded'],
        [profileKernel, 'profile:loaded']
      );

      expect(composition).toBeInstanceOf(Composition);
    });

    it('handles composition with only one kernel', async () => {
      const composition = Kernel.compose([userKernel, 'user:loaded']);

      const listener = vi.fn();
      composition.onComposed(listener);

      await userKernel.emit('user:loaded', { id: 1 });

      expect(listener).toHaveBeenCalledTimes(1);
      const event = listener.mock.calls[0][0];
      expect(event.data.sources).toEqual(['user:loaded']);
      expect(event.data.merged).toHaveProperty('user:loaded:id', 1);
    });

    it('handles same kernel subscribed to different events', async () => {
      const composition = Kernel.compose(
        [userKernel, 'user:created'],
        [userKernel, 'user:updated']
      );

      const listener = vi.fn();
      composition.onComposed(listener);

      await userKernel.emit('user:created', { id: 1 });
      await userKernel.emit('user:updated', { id: 1, name: 'test' });

      expect(listener).toHaveBeenCalledTimes(1);
      const event = listener.mock.calls[0][0];
      expect(event.data.sources).toEqual(['user:created', 'user:updated']);
      expect(event.data.merged).toHaveProperty('user:created:id', 1);
      expect(event.data.merged).toHaveProperty('user:updated:name', 'test');
    });
  });

  describe('cleanup', () => {
    it('composition can be disposed', async () => {
      const composition = Kernel.compose(
        [userKernel, 'user:loaded'],
        [profileKernel, 'profile:loaded']
      );

      const listener = vi.fn();
      composition.onComposed(listener);

      await userKernel.emit('user:loaded', { id: 1 });
      await profileKernel.emit('profile:loaded', { bio: 'test' });

      expect(listener).toHaveBeenCalledTimes(1);

      composition.dispose();

      // After dispose, composition should not emit
      await userKernel.emit('user:loaded', { id: 2 });
      await profileKernel.emit('profile:loaded', { bio: 'updated' });

      // Still only called once (before dispose)
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });
});
