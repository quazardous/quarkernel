import { expect } from 'chai';
import { QuarKernel, QuarKernelEvent as QKE } from '../src/index.js';

describe('QuarKernel', () => {
  describe('Main', () => {
    it('dev', async () => {
      // not really a test (yet)

      const qk = new QuarKernel();

      const qkEvents = {
        FOO: 'foo',
        BAR: 'bar',
        FOOBAR: 'foobar'
      };
      const qkTargets = {
        ZERO: 'zero',
        ONE: 'one',
      };

      console.log('init', qk);

      qk.addEventListener(qkEvents.FOO, (e, target) => {
        console.log(`TRIGGER Event: ${qkEvents.FOO}, Target: ${target}`);
        e.context.foo = 1;
        e.context.stack.push(target);
      });
      qk.addEventListener(qkEvents.FOO, async (e, target) => {
        await sleep(1000);
        console.log(`delayed TRIGGER Event: ${qkEvents.FOO}, Target: ${target}`);
        e.context.stack.push(target);
      });

      const sleep = m => new Promise(r => setTimeout(r, m));
      qk.addEventListener(qkEvents.FOO, async (e, target) => {
        console.log(`TRIGGER[${qkTargets.ZERO}] Event: ${qkEvents.FOO}, Target: ${target} -> timeout`);
        await sleep(2000);
        console.log(`TRIGGER[${qkTargets.ZERO}] Event: ${qkEvents.FOO} -> done`);
        e.context.stack.push(target);
      }, qkTargets.ZERO);
      qk.addEventListener(qkEvents.FOO, (e, target) => {
        console.log(`TRIGGER[${qkTargets.ONE}] Event: ${qkEvents.FOO}, Target: ${target}`);
        console.log(`Waited after ${qkTargets.ZERO}.${qkEvents.FOO} ?`);
        console.log(e);
        e.context.stack.push(target);
      }, qkTargets.ONE, qkTargets.ZERO);

      qk.addCompositeEvent([qkEvents.FOO, qkEvents.BAR], (stack) => new QKE(qkEvents.FOOBAR));
      qk.addEventListener(qkEvents.BAR, () => {
        console.log(`TRIGGER Event: ${qkEvents.BAR}`);
      });
      qk.addEventListener(qkEvents.FOOBAR, () => {
        console.log(`Composite Event: ${qkEvents.FOOBAR}`);
        console.log(`Auto dipatched with ${qkEvents.FOO} + ${qkEvents.BAR} ?`);
      });

      console.log('just before');
      qk.dispatchEvent(new QKE(qkEvents.BAR)).then((e) => { console.log('bar: ', e); });
      const context = { stack: [] };
      await qk.dispatchEvent(new QKE(qkEvents.FOO, 'something', context)).then((e) => { console.log('foo: ', e); });
      console.log('just after', context.stack);
      expect(context.stack).to.eql(['.auto.0', '.auto.1', 'zero', 'one']);
    }).timeout(3000);
  });
});
