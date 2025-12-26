/**
 * Media Player - State-centric FSM
 */
export default {
  id: 'player',
  initial: 'stopped',
  context: { position: 0 },
  states: {
    stopped: {
      entry: (ctx, { set, log }) => {
        set({ position: 0 });
        log('Stopped');
      },
      on: { PLAY: 'playing' },
    },
    playing: {
      entry: (ctx, { log }) => {
        log(`Playing from ${ctx.position}s`);
      },
      on: { PAUSE: 'paused', STOP: 'stopped' },
    },
    paused: {
      entry: (ctx, { log }) => {
        log(`Paused at ${ctx.position}s`);
      },
      on: { PLAY: 'playing', STOP: 'stopped' },
    },
  },
};
