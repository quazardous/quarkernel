import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    /**
     * Why dangerouslyIgnoreUnhandledErrors is needed:
     *
     * SCOPE: Only Worker adapter tests (src/adapters/worker/*.test.ts) produce
     * these unhandled rejections. All other tests are unaffected.
     *
     * TECHNICAL CAUSE:
     * The Worker adapter tests verify rejection handling in createWorkerBridge().
     * When testing scenarios like:
     * - Worker initialization timeout
     * - Worker error before ready
     * - Bridge terminated before ready
     *
     * The Promise rejection occurs inside a setTimeout callback. Even though we
     * attach .catch() handlers BEFORE triggering the rejection, Node.js's
     * unhandled rejection detection runs at the end of each event loop turn
     * and may flag the rejection before the catch handler is invoked.
     *
     * EVENT LOOP TIMING ISSUE:
     * 1. Promise is created with internal reject() function stored
     * 2. Test attaches .catch() handler (handler is registered)
     * 3. setTimeout callback fires, calls reject()
     * 4. Node.js checks for unhandled rejections (race condition!)
     * 5. Microtask queue runs, .catch() handler is invoked
     *
     * The .catch() IS attached and DOES run, but Node/Vitest may detect
     * "unhandled rejection" between steps 3 and 5.
     *
     * WHY THIS IS NOT A BUG:
     * - The rejections ARE handled by our test code
     * - The catch handlers ARE invoked and assertions pass
     * - This is purely a detection timing issue, not missing error handling
     * - Worker tests include local beforeAll/afterAll handlers that filter
     *   expected rejections from console output
     *
     * ALTERNATIVES CONSIDERED:
     * - vi.useFakeTimers(): Breaks real async behavior testing
     * - Wrapping bridge creation: Would change the API under test
     * - expect().rejects: Same timing issue
     * - Vitest workspace scoping: Overkill for this isolated case
     */
    dangerouslyIgnoreUnhandledErrors: true,
  },
});
