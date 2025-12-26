/**
 * Media Player - FSM Behaviors
 */
export default {
  onEnter: {
    playing: (ctx, { log }) => {
      log(`Playing from ${ctx.position}s`);
    },
    paused: (ctx, { log }) => {
      log(`Paused at ${ctx.position}s`);
    },
    stopped: (ctx, { set, log }) => {
      set({ position: 0 });
      log('Stopped');
    },
  },
};
