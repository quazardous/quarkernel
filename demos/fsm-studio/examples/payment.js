/**
 * Payment Machine - State-centric FSM
 */
export default {
  id: 'payment',
  initial: 'pending',
  context: { amount: 0, method: null },
  states: {
    pending: {
      on: { PROCESS: 'processing' },
    },
    processing: {
      entry: (ctx, { set, log }) => {
        set({ startedAt: Date.now() });
        log('Processing payment...');
      },
      after: { delay: 1500, send: 'SUCCESS' },
      on: { SUCCESS: 'paid', FAIL: 'failed', TIMEOUT: 'pending' },
    },
    paid: {
      entry: (ctx, { log }) => {
        const duration = Date.now() - (ctx.startedAt || 0);
        log(`Payment completed in ${duration}ms`);
      },
      on: { REFUND: 'refunding' },
    },
    failed: {
      entry: (ctx, { set, log }) => {
        set({ retries: (ctx.retries || 0) + 1 });
        log(`Payment failed. Retry #${(ctx.retries || 0) + 1}`);
      },
      on: { RETRY: 'processing' },
    },
    refunding: {
      on: { REFUND_SUCCESS: 'refunded', REFUND_FAIL: 'paid' },
    },
    refunded: {},
  },
};
