/**
 * Coffee Machine - State-centric FSM
 */
export default {
  id: 'coffeeMachine',
  initial: 'idle',
  context: { cups: 0, water: 100, beans: 100 },
  states: {
    idle: {
      on: { INSERT_CUP: 'cupInserted' },
    },
    cupInserted: {
      on: { SELECT_DRINK: 'brewing', REMOVE_CUP: 'idle' },
    },
    brewing: {
      entry: (ctx, { set, log }) => {
        set({ water: ctx.water - 10, beans: ctx.beans - 5 });
        log(`Brewing... (water: ${ctx.water - 10}%, beans: ${ctx.beans - 5}%)`);
      },
      after: { delay: 2000, send: 'BREW_COMPLETE' },
      on: { BREW_COMPLETE: 'dispensing', BREW_ERROR: 'error' },
    },
    dispensing: {
      entry: (ctx, { log }) => {
        log('Dispensing coffee...');
      },
      after: { delay: 1000, send: 'DISPENSE_COMPLETE' },
      on: { DISPENSE_COMPLETE: 'ready' },
    },
    ready: {
      entry: (ctx, { set, log }) => {
        set({ cups: ctx.cups + 1 });
        log(`Coffee #${ctx.cups + 1} ready!`);
      },
      on: { TAKE_CUP: 'idle', ADD_MILK: 'addingMilk' },
    },
    addingMilk: {
      on: { MILK_ADDED: 'ready' },
    },
    error: {
      entry: (ctx, { log }) => {
        log('Machine error! Reset or retry.');
      },
      on: { RESET: 'idle', RETRY: 'brewing' },
    },
  },
};
