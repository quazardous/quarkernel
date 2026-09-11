/**
 * Timing helpers for performance regression guards in tests
 *
 * Wall-clock assertions depend on machine load (vitest runs test files in
 * parallel, CI machines are shared). Measure the median of several runs after
 * a warm-up, and use bounds that catch pathological slowness instead of
 * benchmarking the code (see benchmarks/ for throughput numbers).
 */

export interface MedianOptions {
  /** Unmeasured runs before sampling (default 3) */
  warmup?: number;
  /** Measured runs (default 9) */
  samples?: number;
}

/**
 * Median of a list of numbers
 */
export const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

/**
 * Duration in ms of one synchronous run
 */
export const measure = (fn: () => void): number => {
  const start = performance.now();
  fn();
  return performance.now() - start;
};

/**
 * Median duration in ms of a synchronous function
 */
export const medianDuration = (
  fn: () => void,
  { warmup = 3, samples = 9 }: MedianOptions = {}
): number => {
  for (let i = 0; i < warmup; i++) {
    fn();
  }

  const durations: number[] = [];
  for (let i = 0; i < samples; i++) {
    durations.push(measure(fn));
  }
  return median(durations);
};

/**
 * Median duration in ms of an async function
 */
export const medianDurationAsync = async (
  fn: () => Promise<unknown>,
  { warmup = 3, samples = 9 }: MedianOptions = {}
): Promise<number> => {
  for (let i = 0; i < warmup; i++) {
    await fn();
  }

  const durations: number[] = [];
  for (let i = 0; i < samples; i++) {
    const start = performance.now();
    await fn();
    durations.push(performance.now() - start);
  }
  return median(durations);
};
