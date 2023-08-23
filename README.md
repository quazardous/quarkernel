# QuarKernel

Micro Custom Event Kernel.

## Features

Helps structuring your app with events.

- ES6
- Async() support with Promise
- Event scope dependency support
- Composite event
- Shared context

## Basic usage

Define event listeners across your app components with dependency support.  
Share context between components.  

```js
import { QuarKernel, QuarKernelEvent as QKE } from 'quarkernel';

// singleton
const qk = new QuarKernel();

qk.addEventListener('my_event', (e) => {
    // something
    notNeeded();
});

qk.addEventListener('my_event', async (e) => {
    // something async
    e.context.needed = await needed();
}, 'foo');

// somewhere else in your app you can wait after foo to set a specific context
qk.addEventListener('my_event', (e) => {
    // something after the async callback
    needing(e.context.needed);
}, 'bar', 'foo');

qk.dispatchEvent(new QKE('my_event')).then(() => {
    // event my_event fully dispatched
    happyEnd();
});
// or await qk.dispatchEvent(new QKE('my_event'));
```

## Composite event

Composite event are auto dispatched when a specific list of events are dispatched.

ie. You set a composite event C on A+B. Your code dispatches A, then B. C is auto dispatched after B.

```js
...
// init
qk.addCompositeEvent(['A','B'], (stack) => new QKE('C'));
...
qk.dispatchEvent(new QKE('A'));
...
// this will auto dispatch C
qk.dispatchEvent(new QKE('B')); 

```


