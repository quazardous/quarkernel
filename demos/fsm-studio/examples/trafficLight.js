/**
 * Traffic Light - FSM Behaviors
 */
export default {
  onEnter: {
    green: (ctx, { log }) => log('GREEN'),
    yellow: (ctx, { log }) => log('YELLOW'),
    red: (ctx, { log }) => log('RED'),
  },
  timers: {
    green: { send: 'TIMER', delay: 3000 },
    yellow: { send: 'TIMER', delay: 1000 },
    red: { send: 'TIMER', delay: 2000 },
  },
};
