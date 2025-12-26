/**
 * Composition module for QuarKernel v2
 *
 * Composite events and context merging strategies.
 */

export type { EventName, ContextMerger, ConflictInfo, MergeResult, CompositionOptions } from './types.js';
export { createNamespacedMerger, createOverrideMerger } from './mergers/index.js';
export { Composition, createComposition } from './composition.js';
