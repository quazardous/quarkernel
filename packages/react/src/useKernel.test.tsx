/**
 * Tests for useKernel hook
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { createKernel } from '@quazardous/quarkernel';
import { KernelProvider } from './KernelProvider.js';
import { useKernel, KernelProviderError } from './useKernel.js';

describe('useKernel', () => {
  it('returns kernel instance when inside provider', () => {
    const kernel = createKernel();
    let hookResult: any = null;

    function TestComponent() {
      hookResult = useKernel();
      return <div>Test</div>;
    }

    render(
      <KernelProvider kernel={kernel}>
        <TestComponent />
      </KernelProvider>
    );

    expect(hookResult).toBe(kernel);
  });

  it('throws KernelProviderError when used outside provider', () => {
    function TestComponent() {
      useKernel();
      return <div>Test</div>;
    }

    expect(() => {
      render(<TestComponent />);
    }).toThrow(KernelProviderError);
  });

  it('provides helpful error message when missing provider', () => {
    function TestComponent() {
      useKernel();
      return <div>Test</div>;
    }

    try {
      render(<TestComponent />);
    } catch (error) {
      expect(error).toBeInstanceOf(KernelProviderError);
      expect((error as Error).message).toContain('useKernel must be used within a KernelProvider');
      expect((error as Error).message).toContain('<KernelProvider kernel={kernel}>');
    }
  });

  describe('SSR detection', () => {
    it('does not warn when called in browser environment (window is defined)', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn');
      const kernel = createKernel();

      function TestComponent() {
        useKernel();
        return <div>Test</div>;
      }

      render(
        <KernelProvider kernel={kernel}>
          <TestComponent />
        </KernelProvider>
      );

      expect(consoleWarnSpy).not.toHaveBeenCalled();
      consoleWarnSpy.mockRestore();
    });
  });

  it('preserves kernel type information', () => {
    interface Events {
      'user:login': { userId: string };
      'user:logout': undefined;
    }

    const kernel = createKernel<Events>();
    let typedKernel: any = null;

    function TestComponent() {
      typedKernel = useKernel<Events>();
      return <div>Test</div>;
    }

    render(
      <KernelProvider kernel={kernel}>
        <TestComponent />
      </KernelProvider>
    );

    expect(typedKernel).toBe(kernel);
  });
});
