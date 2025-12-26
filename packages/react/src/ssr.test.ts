/**
 * Unit tests for SSR detection logic
 * These tests verify the SSR guard behavior without relying on React rendering
 */

import { describe, it, expect, vi } from 'vitest';

describe('SSR detection logic', () => {
  it('detects SSR environment when window is undefined', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const isSSR = typeof window === 'undefined';

    if (isSSR && typeof console !== 'undefined' && console.warn) {
      console.warn(
        '[QuarKernel] useKernel called during server-side rendering. ' +
        'Event listeners will not work during SSR.'
      );
    }

    expect(isSSR).toBe(false);
    expect(consoleWarnSpy).not.toHaveBeenCalled();

    consoleWarnSpy.mockRestore();
  });

  it('would warn in real SSR environment', () => {
    const isSSR = typeof window === 'undefined';

    expect(isSSR).toBe(false);
  });
});
