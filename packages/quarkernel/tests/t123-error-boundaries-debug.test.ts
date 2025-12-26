import { describe, it, expect, vi } from 'vitest';
import { createKernel } from '../src/kernel.js';

interface TestEvents {
  'test:event': { value: number };
}

describe('T123 - Error boundaries and debug mode', () => {
  describe('Debug logging', () => {
    it('should log when kernel is initialized with debug=true', () => {
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      
      createKernel<TestEvents>({ debug: true });
      
      expect(debugSpy).toHaveBeenCalledWith(
        '[QuarKernel] Kernel initialized',
        expect.objectContaining({
          errorBoundary: true,
        })
      );
      
      debugSpy.mockRestore();
    });

    it('should log when listener is added', async () => {
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const kernel = createKernel<TestEvents>({ debug: true });
      
      kernel.on('test:event', async () => {});
      
      expect(debugSpy).toHaveBeenCalledWith(
        '[QuarKernel] Listener added',
        expect.objectContaining({
          event: 'test:event',
        })
      );
      
      debugSpy.mockRestore();
    });

    it('should log execution trace', async () => {
      const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      const kernel = createKernel<TestEvents>({ debug: true });
      
      kernel.on('test:event', async () => {});
      await kernel.emit('test:event', { value: 1 });
      
      expect(debugSpy).toHaveBeenCalledWith(
        '[QuarKernel] Event emitted',
        expect.any(Object)
      );
      expect(debugSpy).toHaveBeenCalledWith(
        '[QuarKernel] Listener executing',
        expect.any(Object)
      );
      expect(debugSpy).toHaveBeenCalledWith(
        '[QuarKernel] Listener completed',
        expect.any(Object)
      );
      expect(debugSpy).toHaveBeenCalledWith(
        '[QuarKernel] Event completed',
        expect.objectContaining({
          event: 'test:event',
        })
      );
      
      debugSpy.mockRestore();
    });
  });

  describe('Error aggregation', () => {
    it('should collect errors without stopping other listeners', async () => {
      const kernel = createKernel<TestEvents>({ errorBoundary: true });
      const listener1 = vi.fn(async () => {
        throw new Error('Error 1');
      });
      const listener2 = vi.fn();
      
      kernel.on('test:event', listener1);
      kernel.on('test:event', listener2);
      
      await kernel.emit('test:event', { value: 1 });
      
      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
      
      const errors = kernel.getExecutionErrors();
      expect(errors).toHaveLength(1);
      expect(errors[0].error.message).toBe('Error 1');
      expect(errors[0].listenerId).toBeDefined();
    });

    it('should clear execution errors', async () => {
      const kernel = createKernel<TestEvents>();
      
      kernel.on('test:event', async () => {
        throw new Error('Test error');
      });
      
      await kernel.emit('test:event', { value: 1 });
      expect(kernel.getExecutionErrors()).toHaveLength(1);
      
      kernel.clearExecutionErrors();
      expect(kernel.getExecutionErrors()).toHaveLength(0);
    });

    it('should reset errors on new emit', async () => {
      const kernel = createKernel<TestEvents>();
      
      kernel.on('test:event', async (e) => {
        if (e.data.value === 1) {
          throw new Error('First error');
        }
      });
      
      await kernel.emit('test:event', { value: 1 });
      expect(kernel.getExecutionErrors()).toHaveLength(1);
      
      await kernel.emit('test:event', { value: 2 });
      expect(kernel.getExecutionErrors()).toHaveLength(0);
    });
  });
});
