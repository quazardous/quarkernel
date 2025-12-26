/**
 * Reactive Svelte stores for QuarKernel events
 *
 * Provides eventStore and contextStore factories that wrap kernel events
 * in Svelte readable stores with automatic subscription management.
 */

import { readable } from 'svelte/store';
import type { Readable } from 'svelte/store';
import type { IKernelEvent, IListenerContext } from '@quazardous/quarkernel';
import { getKernel } from './context.js';

/**
 * Create a readable store that updates when matching events occur
 *
 * The store subscribes to kernel events matching the pattern and updates
 * with the latest event data. Automatically manages kernel subscriptions
 * based on store subscription lifecycle.
 *
 * @param pattern - Event name or wildcard pattern to match
 * @returns Readable store containing latest event data (or undefined initially)
 *
 * @example
 * ```svelte
 * <script>
 *   import { eventStore } from '@quazardous/quarkernel-svelte';
 *
 *   const userEvents = eventStore('user:*');
 *
 *   // Svelte 5 runes
 *   $: console.log('Latest user event:', $userEvents);
 * </script>
 *
 * <div>
 *   {#if $userEvents}
 *     <p>Event: {$userEvents.name}</p>
 *     <p>Data: {JSON.stringify($userEvents.data)}</p>
 *   {/if}
 * </div>
 * ```
 */
export function eventStore<T = any>(pattern: string): Readable<IKernelEvent<T> | undefined> {
  return readable<IKernelEvent<T> | undefined>(undefined, (set) => {
    const kernel = getKernel();

    // Subscribe to kernel events and update store
    const unsubscribe = kernel.on(pattern, async (event, _context) => {
      set(event);
    });

    // Return cleanup function - called when store has no subscribers
    return () => {
      unsubscribe();
    };
  });
}

/**
 * Create a readable store that updates with current listener context
 *
 * Useful for accessing context data in reactive Svelte components.
 * The store updates whenever an event matching the pattern is processed
 * and provides access to the listener context object.
 *
 * @param pattern - Event name or wildcard pattern to match
 * @returns Readable store containing latest listener context (or undefined initially)
 *
 * @example
 * ```svelte
 * <script>
 *   import { contextStore } from '@quazardous/quarkernel-svelte';
 *
 *   const ctx = contextStore('cart:*');
 * </script>
 *
 * <div>
 *   {#if $ctx}
 *     <p>Listener ID: {$ctx.id}</p>
 *     <p>Context data: {JSON.stringify($ctx)}</p>
 *   {/if}
 * </div>
 * ```
 */
export function contextStore(pattern: string): Readable<IListenerContext | undefined> {
  return readable<IListenerContext | undefined>(undefined, (set) => {
    const kernel = getKernel();

    // Subscribe to kernel events and update store with context
    const unsubscribe = kernel.on(pattern, async (_event, ctx) => {
      set(ctx);
    });

    // Return cleanup function - called when store has no subscribers
    return () => {
      unsubscribe();
    };
  });
}
