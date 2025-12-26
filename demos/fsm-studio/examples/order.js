/**
 * Order Machine - State-centric FSM
 */
export default {
  id: 'order',
  initial: 'draft',
  context: { items: 0, total: 0 },
  states: {
    draft: {
      on: { ADD_ITEM: 'draft', SUBMIT: 'pending' },
    },
    pending: {
      on: { APPROVE: 'confirmed', REJECT: 'draft', CANCEL: 'cancelled' },
    },
    confirmed: {
      entry: (ctx, { log }) => {
        log(`Order confirmed: ${ctx.items} items, $${ctx.total.toFixed(2)}`);
      },
      on: { SHIP: 'shipped', CANCEL: 'cancelled' },
    },
    shipped: {
      entry: (ctx, { log }) => {
        log('Shipped! Tracking: SKY-' + Date.now().toString(36).toUpperCase());
      },
      on: { DELIVER: 'delivered' },
    },
    delivered: {
      entry: (ctx, { log }) => {
        log('Package delivered!');
      },
    },
    cancelled: {},
  },
  // Global event handlers
  on: {
    ADD_ITEM: (ctx, { set, log }) => {
      set({ items: ctx.items + 1, total: ctx.total + 29.99 });
      log(`Item added. Total: $${(ctx.total + 29.99).toFixed(2)}`);
    },
  },
};
