/**
 * Traffic Light - State-centric FSM
 */
export default {
  id: 'trafficLight',
  initial: 'green',
  context: {},
  states: {
    green: {
      entry: (ctx, { log }) => log('GREEN'),
      after: { delay: 3000, send: 'TIMER' },
      on: { TIMER: 'yellow' },
    },
    yellow: {
      entry: (ctx, { log }) => log('YELLOW'),
      after: { delay: 1000, send: 'TIMER' },
      on: { TIMER: 'red' },
    },
    red: {
      entry: (ctx, { log }) => log('RED'),
      after: { delay: 2000, send: 'TIMER' },
      on: { TIMER: 'green' },
    },
  },
};
