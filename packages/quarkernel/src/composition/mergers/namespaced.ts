/**
 * NamespacedMerger - Prefixes all context keys with source event name
 *
 * Prevents key collisions by namespacing each event's context with its event name.
 * This is the default merger strategy as it guarantees no conflicts.
 *
 * Example:
 * Input:
 *   'user:loaded': { count: 1, name: "Alice" }
 *   'profile:loaded': { count: 2, city: "NYC" }
 *
 * Output:
 *   {
 *     "user:loaded:count": 1,
 *     "user:loaded:name": "Alice",
 *     "profile:loaded:count": 2,
 *     "profile:loaded:city": "NYC"
 *   }
 */

import type { ContextMerger, EventName, MergeResult } from '../types.js';

export const createNamespacedMerger = (): ContextMerger => ({
  merge: (contexts: Map<EventName, Record<string, any>>, _sources: EventName[]): Record<string, any> => {
    const result: Record<string, any> = {};

    for (const [eventName, context] of contexts) {
      for (const [key, value] of Object.entries(context)) {
        result[`${eventName}:${key}`] = value;
      }
    }

    return result;
  },

  mergeWithConflicts: (contexts: Map<EventName, Record<string, any>>, _sources: EventName[]): MergeResult => {
    const result: Record<string, any> = {};

    // Namespaced merger never has conflicts by design (all keys are prefixed)
    for (const [eventName, context] of contexts) {
      for (const [key, value] of Object.entries(context)) {
        result[`${eventName}:${key}`] = value;
      }
    }

    return {
      context: result,
      conflicts: [], // No conflicts possible with namespacing
    };
  },
});
