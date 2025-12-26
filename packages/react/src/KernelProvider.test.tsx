/**
 * Tests for KernelProvider component
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { createKernel } from '@quazardous/quarkernel';
import { KernelProvider } from './KernelProvider.js';
import { useKernel } from './useKernel.js';

describe('KernelProvider', () => {
  it('renders children without errors', () => {
    const kernel = createKernel();

    const { container } = render(
      <KernelProvider kernel={kernel}>
        <div data-testid="child">Test Content</div>
      </KernelProvider>
    );

    expect(container.querySelector('[data-testid="child"]')).toBeTruthy();
    expect(container.textContent).toBe('Test Content');
  });

  it('provides kernel instance to children', () => {
    const kernel = createKernel();
    let capturedKernel: any = null;

    function TestComponent() {
      capturedKernel = useKernel();
      return <div>Test</div>;
    }

    render(
      <KernelProvider kernel={kernel}>
        <TestComponent />
      </KernelProvider>
    );

    expect(capturedKernel).toBe(kernel);
  });

  it('supports nested providers with different kernels', () => {
    const kernel1 = createKernel();
    const kernel2 = createKernel();

    let outerKernel: any = null;
    let innerKernel: any = null;

    function OuterComponent() {
      outerKernel = useKernel();
      return (
        <KernelProvider kernel={kernel2}>
          <InnerComponent />
        </KernelProvider>
      );
    }

    function InnerComponent() {
      innerKernel = useKernel();
      return <div>Inner</div>;
    }

    render(
      <KernelProvider kernel={kernel1}>
        <OuterComponent />
      </KernelProvider>
    );

    expect(outerKernel).toBe(kernel1);
    expect(innerKernel).toBe(kernel2);
    expect(outerKernel).not.toBe(innerKernel);
  });

  it('re-renders children when kernel prop changes', () => {
    const kernel1 = createKernel();
    const kernel2 = createKernel();

    let currentKernel: any = null;

    function TestComponent() {
      currentKernel = useKernel();
      return <div>Test</div>;
    }

    const { rerender } = render(
      <KernelProvider kernel={kernel1}>
        <TestComponent />
      </KernelProvider>
    );

    expect(currentKernel).toBe(kernel1);

    rerender(
      <KernelProvider kernel={kernel2}>
        <TestComponent />
      </KernelProvider>
    );

    expect(currentKernel).toBe(kernel2);
  });
});
