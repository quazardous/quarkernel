/**
 * Coffee Machine - FSM Behaviors
 */
export default {
  onEnter: {
    brewing: (ctx, { set, log }) => {
      set({ water: ctx.water - 10, beans: ctx.beans - 5 });
      log(`Brewing... (water: ${ctx.water - 10}%, beans: ${ctx.beans - 5}%)`);
    },
    dispensing: (ctx, { log }) => {
      log('Dispensing coffee...');
    },
    ready: (ctx, { set, log }) => {
      set({ cups: ctx.cups + 1 });
      log(`Coffee #${ctx.cups + 1} ready!`);
    },
    error: (ctx, { log }) => {
      log('Machine error! Reset or retry.');
    },
  },
  timers: {
    brewing: { send: 'BREW_COMPLETE', delay: 2000 },
    dispensing: { send: 'DISPENSE_COMPLETE', delay: 1000 },
  },
};
