# QuarKernel

Micro Custom Event Kernel.

## Features

Helps structuring your app with events.

- Modern: ES6, Async() support with Promise
- Dependency support: easily handle async resource dependencies
- Composite event: handle complex logic with a common event pipe
- Shared context: use event data to share variable

## Install

```bash
npm i "@quazardous/quarkernel"
```

## Basic usage

Define event listeners across your app modules with dependency support.  
Share context between components.  

```js
import { QuarKernel, QuarKernelEvent as QKE } from '@quazardous/quarkernel';

// singleton
const qk = new QuarKernel();

qk.addEventListener('my_event', (e) => {
    // something
    notNeeded();
});

// your module foo does some init stuff
qk.addEventListener('my_event', async (e) => {
    // something async
    e.context.needed = await needed();
}, 'foo');

// somewhere else in your app your module bar is waiting after foo to set a specific context
qk.addEventListener('my_event', (e) => {
    // something after the async callback
    needing(e.context.needed);
}, 'bar', 'foo');

// call everything
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


