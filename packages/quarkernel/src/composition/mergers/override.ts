/**
 * OverrideMerger - Last-write-wins strategy
 *
 * Merges contexts by iterating through source events in order.
 * Later events override values from earlier events for the same key.
 *
 * Example:
 * Sources order: ['user:loaded', 'profile:loaded']
 * Input:
 *   'user:loaded': { count: 1, name: "Alice" }
 *   'profile:loaded': { count: 2, city: "NYC" }
 *
 * Output:
 *   { count: 2, name: "Alice", city: "NYC" }
 *   (profile:loaded's count overrode user:loaded's count)
 */

import type { ContextMerger, EventName, MergeResult, ConflictInfo } from '../types.js';

export const createOverrideMerger = (): ContextMerger => ({
  merge: (contexts: Map<EventName, Record<string, any>>, sources: EventName[]): Record<string, any> => {
    const result: Record<string, any> = {};

    for (const eventName of sources) {
      const context = contexts.get(eventName);
      if (!context) continue;

      for (const [key, value] of Object.entries(context)) {
        result[key] = value;
      }
    }

    return result;
  },

  mergeWithConflicts: (contexts: Map<EventName, Record<string, any>>, sources: EventName[]): MergeResult => {
    const result: Record<string, any> = {};
    const conflicts: ConflictInfo[] = [];
    const keySources = new Map<string, Array<{ source: EventName; value: any }>>();

    // Track all sources for each key
    for (const eventName of sources) {
      const context = contexts.get(eventName);
      if (!context) continue;

      for (const [key, value] of Object.entries(context)) {
        if (!keySources.has(key)) {
          keySources.set(key, []);
        }
        keySources.get(key)!.push({ source: eventName, value });
      }
    }

    // Detect conflicts and build result
    for (const [key, sourceList] of keySources) {
      if (sourceList.length > 1) {
        // Conflict detected - multiple sources provide this key
        conflicts.push({
          key,
          sources: sourceList.map(s => s.source),
          values: sourceList.map(s => s.value),
        });
      }

      // Last source wins (override behavior)
      result[key] = sourceList[sourceList.length - 1].value;
    }

    return {
      context: result,
      conflicts,
    };
  },
});
