import { describe, it, expect } from 'vitest';
import { KernelEvent } from './kernel-event.js';

describe('KernelEvent', () => {
  describe('constructor', () => {
    it('creates event with name and data', () => {
      const event = new KernelEvent('test:event', { foo: 'bar' });

      expect(event.name).toBe('test:event');
      expect(event.data).toEqual({ foo: 'bar' });
    });

    it('creates event with empty context by default', () => {
      const event = new KernelEvent('test:event', { foo: 'bar' });

      expect(event.context).toEqual({});
    });

    it('creates event with provided context', () => {
      const context = { shared: 'value' };
      const event = new KernelEvent('test:event', { foo: 'bar' }, context);

      expect(event.context).toBe(context);
    });

    it('sets timestamp on creation', () => {
      const before = Date.now();
      const event = new KernelEvent('test:event', null);
      const after = Date.now();

      expect(event.timestamp).toBeGreaterThanOrEqual(before);
      expect(event.timestamp).toBeLessThanOrEqual(after);
    });

    it('has readonly properties (TypeScript enforced)', () => {
      const event = new KernelEvent('test:event', { foo: 'bar' });

      // TypeScript prevents these assignments at compile time
      // Runtime checks not enforced by readonly keyword
      expect(event.name).toBe('test:event');
      expect(event.data).toEqual({ foo: 'bar' });
      expect(typeof event.timestamp).toBe('number');
    });
  });

  describe('context mutability', () => {
    it('allows context to be mutated', () => {
      const event = new KernelEvent('test:event', null);

      event.context.foo = 'bar';
      event.context.count = 42;

      expect(event.context.foo).toBe('bar');
      expect(event.context.count).toBe(42);
    });

    it('shares context reference', () => {
      const context = { shared: 'value' };
      const event = new KernelEvent('test:event', null, context);

      context.modified = true;

      expect(event.context.modified).toBe(true);
    });
  });

  describe('stopPropagation', () => {
    it('sets propagation stopped flag', () => {
      const event = new KernelEvent('test:event', null);

      expect(event.isPropagationStopped).toBe(false);

      event.stopPropagation();

      expect(event.isPropagationStopped).toBe(true);
    });

    it('can be called multiple times', () => {
      const event = new KernelEvent('test:event', null);

      event.stopPropagation();
      event.stopPropagation();

      expect(event.isPropagationStopped).toBe(true);
    });
  });

  describe('type safety', () => {
    it('preserves generic type for data', () => {
      interface UserData {
        userId: string;
        name: string;
      }

      const event = new KernelEvent<UserData>('user:login', {
        userId: '123',
        name: 'Alice',
      });

      // TypeScript should infer correct type
      expect(event.data.userId).toBe('123');
      expect(event.data.name).toBe('Alice');
    });

    it('accepts undefined data', () => {
      const event = new KernelEvent<undefined>('app:ready', undefined);

      expect(event.data).toBeUndefined();
    });

    it('accepts null data', () => {
      const event = new KernelEvent<null>('app:reset', null);

      expect(event.data).toBeNull();
    });

    it('accepts complex nested data', () => {
      const data = {
        user: { id: '123', profile: { avatar: 'url' } },
        timestamp: Date.now(),
        tags: ['admin', 'verified'],
      };

      const event = new KernelEvent('complex:event', data);

      expect(event.data).toEqual(data);
      expect(event.data.user.profile.avatar).toBe('url');
      expect(event.data.tags).toHaveLength(2);
    });
  });

  describe('propagation state isolation', () => {
    it('independent events have separate propagation state', () => {
      const event1 = new KernelEvent('event1', null);
      const event2 = new KernelEvent('event2', null);

      event1.stopPropagation();

      expect(event1.isPropagationStopped).toBe(true);
      expect(event2.isPropagationStopped).toBe(false);
    });
  });

  describe('real-world scenarios', () => {
    it('simulates listener chain with shared context', () => {
      const event = new KernelEvent<{ userId: string }>('user:login', {
        userId: '123',
      });

      // Listener 1: authenticate
      event.context.user = { id: '123', name: 'Alice' };

      // Listener 2: load preferences
      event.context.preferences = { theme: 'dark' };

      // Listener 3: track analytics (then stop)
      event.context.tracked = true;
      event.stopPropagation();

      expect(event.context).toEqual({
        user: { id: '123', name: 'Alice' },
        preferences: { theme: 'dark' },
        tracked: true,
      });
      expect(event.isPropagationStopped).toBe(true);
    });

    it('simulates error handler stopping propagation', () => {
      const event = new KernelEvent<{ action: string }>('command:execute', {
        action: 'delete',
      });

      // Listener 1: validation
      const validationError = 'Invalid action';
      if (validationError) {
        event.context.error = validationError;
        event.stopPropagation();
      }

      // This would normally be listener 2, but shouldn't run
      // because propagation was stopped

      expect(event.context.error).toBe('Invalid action');
      expect(event.isPropagationStopped).toBe(true);
    });
  });
});
