import { createKernel } from './kernel.js';

const kernel = createKernel();
const order = [];

kernel.on('test', async () => {
  order.push('independent');
}, { id: 'independent' });

kernel.on('test', async () => {
  order.push('dependent');
}, { id: 'dependent', after: ['independent'] });

await kernel.emit('test');

console.log('Execution order:', order);
console.log('Expected:', ['independent', 'dependent']);
console.log('Match:', JSON.stringify(order) === JSON.stringify(['independent', 'dependent']));
