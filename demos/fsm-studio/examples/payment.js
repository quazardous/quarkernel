/**
 * Payment Machine - FSM Behaviors
 */
export default {
  onEnter: {
    processing: (ctx, { set, log }) => {
      set({ startedAt: Date.now() });
      log('Processing payment...');
    },
    paid: (ctx, { log }) => {
      const duration = Date.now() - (ctx.startedAt || 0);
      log(`Payment completed in ${duration}ms`);
    },
    failed: (ctx, { set, log }) => {
      set({ retries: (ctx.retries || 0) + 1 });
      log(`Payment failed. Retry #${(ctx.retries || 0) + 1}`);
    },
  },
  timers: {
    processing: { send: 'SUCCESS', delay: 1500 },
  },
};
