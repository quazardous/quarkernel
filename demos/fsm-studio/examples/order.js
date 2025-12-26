/**
 * Order Machine - FSM Behaviors
 */
export default {
  on: {
    ADD_ITEM: (ctx, { set, log }) => {
      set({ items: ctx.items + 1, total: ctx.total + 29.99 });
      log(`Item added. Total: $${(ctx.total + 29.99).toFixed(2)}`);
    },
  },
  onEnter: {
    confirmed: (ctx, { log }) => {
      log(`Order confirmed: ${ctx.items} items, $${ctx.total.toFixed(2)}`);
    },
    shipped: (ctx, { log }) => {
      log('Shipped! Tracking: SKY-' + Date.now().toString(36).toUpperCase());
    },
    delivered: (ctx, { log }) => {
      log('Package delivered!');
    },
  },
};
