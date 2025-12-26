/**
 * Worker tests setup file
 *
 * Handles expected error messages from worker error scenario tests.
 * These errors are intentional and verify error handling behavior.
 */

import { beforeAll, afterAll } from 'vitest';

const expectedErrorPatterns = [
  'Worker bridge terminated before ready',
  'Worker initialization failed',
  'Worker error:',
  'Worker initialization timeout',
  'Kernel error:',
];

// Store original stderr.write
const originalStderrWrite = process.stderr.write.bind(process.stderr);

beforeAll(() => {
  // Intercept stderr to filter expected error messages
  process.stderr.write = (chunk: any, ...args: any[]) => {
    const message = typeof chunk === 'string' ? chunk : chunk.toString();
    const isExpected = expectedErrorPatterns.some(pattern => message.includes(pattern));

    if (isExpected) {
      // Replace with clear "expected" message
      return originalStderrWrite(`[Expected Test Error] ${message}`, ...args);
    }

    return originalStderrWrite(chunk, ...args);
  };
});

afterAll(() => {
  // Restore original stderr.write
  process.stderr.write = originalStderrWrite;
});
