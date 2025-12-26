    import { createKernel, Composition } from '../../packages/quarkernel/dist/index.js';

    // ===== State =====
    const kernel = createKernel({ debug: true });
    window.kernel = kernel;

    const eventsMap = new Map();      // name -> { deps, type, ttl, lit, compositionTTL }
    const listenersMap = new Map();   // name -> { events: Set, off: Function|null, lit }
    const compositions = new Map();   // eventName -> Composition instance
    let defaultTtl = 3000;

    const eventDropDeps = new Set();
    const listenerDropEvents = new Set();

    // ===== vis.js Network =====
    const nodes = new vis.DataSet();
    const edges = new vis.DataSet();
    const network = new vis.Network(
      document.getElementById('flowchart'),
      { nodes, edges },
      {
        physics: {
          enabled: true,
          barnesHut: { gravitationalConstant: -3000, springLength: 150 }
        },
        nodes: {
          shape: 'box',
          margin: 10,
          font: { face: 'Comic Sans MS, cursive', size: 14 },
          borderWidth: 2,
          shadow: true
        },
        edges: {
          arrows: { to: { enabled: true, scaleFactor: 0.5 } },
          smooth: { type: 'cubicBezier' },
          color: { color: '#9ca3af', highlight: '#3b82f6' },
          width: 2
        },
        interaction: {
          dragNodes: true,
          hover: true
        }
      }
    );

    // ===== Funny slug generator =====
    const adjectives = ['cosmic', 'fuzzy', 'sneaky', 'bouncy', 'groovy', 'spicy', 'crunchy', 'wobbly', 'zesty', 'funky', 'turbo', 'mega', 'ultra', 'hyper', 'quantum', 'cyber', 'neon', 'retro', 'pixel', 'crispy'];
    const nouns = ['banana', 'penguin', 'taco', 'ninja', 'robot', 'unicorn', 'potato', 'waffle', 'dragon', 'llama', 'pickle', 'donut', 'wizard', 'pirate', 'toast', 'muffin', 'rocket', 'squirrel', 'koala', 'avocado'];
    const verbs = ['reader', 'watcher', 'catcher', 'handler', 'tracker', 'observer', 'monitor', 'checker', 'scanner', 'listener'];

    function randomEventSlug() {
      const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
      const noun = nouns[Math.floor(Math.random() * nouns.length)];
      return `${adj}-${noun}`;
    }

    function randomListenerSlug() {
      const noun = nouns[Math.floor(Math.random() * nouns.length)];
      const verb = verbs[Math.floor(Math.random() * verbs.length)];
      return `${noun}-${verb}`;
    }

    // ===== Logging =====
    function log(message, type = 'system', source = 'system', details = null) {
      const content = document.getElementById('logContent');
      const wrapper = document.createElement('div');
      const entry = document.createElement('div');
      const timeEl = document.createElement('span');

      // Wrapper class
      let wrapperClass = 'log-entry-wrapper';
      if (source === 'event') wrapperClass += ' event-wrapper';
      else if (source === 'listener') wrapperClass += ' listener-wrapper';
      else wrapperClass += ' system-wrapper';
      wrapper.className = wrapperClass;

      // Entry class
      let entryClass = 'log-entry';
      if (source === 'event') entryClass += ' event-log';
      else if (source === 'listener') entryClass += ' listener-log';
      else entryClass += ' system-log';
      if (type) entryClass += ` ${type}`;
      entry.className = entryClass;

      // Time
      const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      timeEl.className = 'log-time';
      timeEl.textContent = time;

      // Content: sender + message (dark gray)
      if (details) {
        entry.innerHTML = `<span class="log-sender">${message}</span><span class="log-message">${details}</span>`;
      } else {
        entry.innerHTML = `<span class="log-sender">${message}</span>`;
      }

      // Assemble: bubble + time on same row (opposite sides via flex-direction)
      wrapper.appendChild(entry);
      wrapper.appendChild(timeEl);

      content.appendChild(wrapper);
      content.scrollTop = content.scrollHeight;
    }

    // ===== Events =====
    function createEvent() {
      const input = document.getElementById('eventNameInput');
      const name = input.value.trim();
      if (!name) { log('Event name required', 'error'); return; }
      if (eventsMap.has(name)) { log(`Event "${name}" exists`, 'error'); return; }

      const deps = [...eventDropDeps];
      const eventData = { deps, type: 'default', ttl: null, lit: false };
      eventsMap.set(name, eventData);

      // Add to flowchart
      nodes.add({
        id: `event:${name}`,
        label: name,
        color: { background: deps.length ? '#faf5ff' : '#fffef0', border: deps.length ? '#a855f7' : '#facc15' },
        shadow: { enabled: true, color: 'rgba(0,0,0,0.1)', size: 5 },
        group: 'event'
      });

      // Create composition if deps
      if (deps.length > 0) {
        createCompositionFor(name, deps);
        deps.forEach(dep => {
          edges.add({ from: `event:${dep}`, to: `event:${name}`, id: `edge:${dep}:${name}` });
        });
        log(name, 'create', 'event', `= [${deps.join(' + ')}]`);
      } else {
        log(name, 'create', 'event', 'created');
      }

      eventDropDeps.clear();
      renderEventDropZone();
      renderEvents();
      input.value = randomEventSlug();
    }

    function createCompositionFor(name, deps) {
      if (compositions.has(name)) compositions.get(name).dispose();

      const event = eventsMap.get(name);
      const compositionTTL = event?.compositionTTL; // Composition-level TTL override

      const sources = deps.map(dep => [kernel, dep]);
      const options = { eventTTL: compositionTTL || defaultTtl }; // Use composition TTL if set

      // Build per-event TTLs (only if no composition-level override)
      if (!compositionTTL) {
        const eventTTLs = {};
        for (const dep of deps) {
          const depEvent = eventsMap.get(dep);
          if (!depEvent) continue;

          // Priority: dep's custom ttl > dep's type
          if (depEvent.ttl) {
            eventTTLs[dep] = depEvent.ttl;
          } else if (depEvent.type === 'instant') {
            eventTTLs[dep] = 'instant';
          } else if (depEvent.type === 'permanent') {
            eventTTLs[dep] = 'permanent';
          }
        }
        if (Object.keys(eventTTLs).length > 0) {
          options.eventTTLs = eventTTLs;
        }
      }

      const comp = new Composition(sources, options);
      comp.onComposed(() => {
        log(name, 'composed', 'event', 'composed!');
        lightUpEvent(name);
        kernel.emit(name);
      });
      compositions.set(name, comp);
    }

    // Auto-fire management
    const autoFireTimers = new Map();

    function startAutoFire(name) {
      stopAutoFire(name); // Clear any existing
      const event = eventsMap.get(name);
      if (!event || !event.autoInterval) return;

      const timer = setInterval(() => {
        fireEvent(name);
      }, event.autoInterval);
      autoFireTimers.set(name, timer);
    }

    function stopAutoFire(name) {
      const timer = autoFireTimers.get(name);
      if (timer) {
        clearInterval(timer);
        autoFireTimers.delete(name);
      }
    }

    function fireEvent(name, message = null) {
      if (message) {
        log(name, 'fire', 'event', `fired: "${message}"`);
        kernel.emit(name, { message });
      } else {
        log(name, 'fire', 'event', 'fired');
        kernel.emit(name);
      }
      lightUpEvent(name);
    }

    function showMsgPopup(name, chip) {
      closePopup();
      const popup = document.createElement('div');
      popup.className = 'msg-popup';
      popup.innerHTML = `
        <input type="text" placeholder="Enter message..." autofocus />
        <button>Send</button>
      `;

      const input = popup.querySelector('input');
      const btn = popup.querySelector('button');

      const send = () => {
        const msg = input.value.trim();
        if (msg) {
          fireEvent(name, msg);
          closePopup();
        }
      };

      btn.addEventListener('click', send);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
      popup.addEventListener('click', e => e.stopPropagation());

      const rect = chip.getBoundingClientRect();
      popup.style.top = `${rect.bottom + 4}px`;
      popup.style.left = `${Math.max(10, rect.left)}px`;

      document.body.appendChild(popup);
      activePopup = popup;
      input.focus();
    }

    function lightUpEdgesFrom(eventName) {
      // Find all edges starting from this event
      const allEdges = edges.get();
      const fromNodeId = `event:${eventName}`;

      for (const edge of allEdges) {
        if (edge.from === fromNodeId) {
          // Light up in orange
          edges.update({
            id: edge.id,
            color: { color: '#f97316', highlight: '#f97316' },
            width: 3
          });

          // Fade back after delay
          setTimeout(() => {
            edges.update({
              id: edge.id,
              color: { color: '#9ca3af', highlight: '#3b82f6' },
              width: 2
            });
          }, 600);
        }
      }
    }

    function updateEventNode(name, lit) {
      const event = eventsMap.get(name);
      const isComposed = event?.deps?.length > 0;
      const baseColor = isComposed ? '#a855f7' : '#facc15';
      const baseBg = isComposed ? '#faf5ff' : '#fffef0';

      if (lit) {
        nodes.update({
          id: `event:${name}`,
          label: name,
          color: {
            background: '#dcfce7',
            border: '#22c55e'
          },
          shadow: { enabled: true, color: 'rgba(34,197,94,0.5)', size: 10 }
        });
      } else {
        nodes.update({
          id: `event:${name}`,
          label: name,
          color: { background: baseBg, border: baseColor },
          shadow: { enabled: true, color: 'rgba(0,0,0,0.1)', size: 5 }
        });
      }
    }

    function lightUpEvent(name) {
      const event = eventsMap.get(name);
      if (!event) return;

      // Light up outgoing edges
      lightUpEdgesFrom(name);

      // Update node with lit state
      updateEventNode(name, true);
      event.lit = true;
      renderEvents();

      // Instant: brief flash
      if (event.type === 'instant') {
        setTimeout(() => {
          event.lit = false;
          updateEventNode(name, false);
          log(name, 'expired', 'event', 'expired');
          renderEvents();
        }, 200);
        return;
      }

      // Permanent: never expires
      if (event.type === 'permanent') return;

      // Default or custom TTL
      const ttl = event.ttl || defaultTtl;
      setTimeout(() => {
        event.lit = false;
        updateEventNode(name, false);
        log(name, 'expired', 'event', 'expired');
        renderEvents();
      }, ttl);
    }

    // Check if an event is used by any other object (composition or listener)
    function isEventUsed(name) {
      // Check if used as a dependency in any composed event
      for (const [, event] of eventsMap) {
        if (event.deps.includes(name)) return true;
      }
      // Check if used by any listener
      for (const [, listener] of listenersMap) {
        if (listener.events.has(name)) return true;
      }
      return false;
    }

    // Rebuild compositions that depend on a given event (when its TTL changes)
    function rebuildDependentCompositions(depName) {
      for (const [eventName, event] of eventsMap) {
        if (event.deps.includes(depName)) {
          createCompositionFor(eventName, event.deps);
        }
      }
    }

    // Delete an event
    function deleteEvent(name) {
      const event = eventsMap.get(name);
      if (!event) return;

      // Stop auto-fire if running
      stopAutoFire(name);

      // Dispose composition if exists
      if (compositions.has(name)) {
        compositions.get(name).dispose();
        compositions.delete(name);
      }

      // Remove from eventsMap
      eventsMap.delete(name);

      // Remove node from flowchart
      nodes.remove(`event:${name}`);

      // Remove all edges connected to this event
      const allEdges = edges.get();
      const edgesToRemove = allEdges.filter(e =>
        e.from === `event:${name}` || e.to === `event:${name}`
      );
      edges.remove(edgesToRemove.map(e => e.id));

      renderEvents();
      saveState();
      log(name, 'expired', 'event', 'deleted');
    }

    function renderEvents() {
      const list = document.getElementById('eventsList');
      list.innerHTML = '';

      for (const [name, event] of eventsMap) {
        const chip = document.createElement('div');
        const isComposed = event.deps.length > 0;
        const isLit = event.lit;
        const shouldBlink = isLit && event.type !== 'permanent' && event.type !== 'instant';

        chip.className = `event-chip${isComposed ? ' composed' : ''}`;
        chip.draggable = true;
        chip.dataset.name = name;

        let typeBadge = '';
        if (event.autoInterval) typeBadge += `<span class="type-badge auto">&#x21bb; ${(event.autoInterval/1000).toFixed(1)}s</span>`;
        if (isComposed && event.compositionTTL) typeBadge += `<span class="type-badge window" title="Composition window: ${(event.compositionTTL/1000).toFixed(1)}s">⏱${(event.compositionTTL/1000).toFixed(1)}s</span>`;
        if (event.type === 'permanent') typeBadge += '<span class="type-badge permanent">&#8734;</span>';
        else if (event.type === 'instant') typeBadge += '<span class="type-badge instant">&#9889;</span>';
        else if (event.ttl) typeBadge += `<span class="type-badge custom">${(event.ttl/1000).toFixed(1)}s</span>`;

        const cogIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`;
        const trashIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;

        // Check if event can be deleted (not used by compositions or listeners)
        const canDelete = !isEventUsed(name);
        const deleteBtn = canDelete ? `<button class="delete-btn" title="Delete event">${trashIcon}</button>` : '';

        if (isComposed) {
          const depTags = event.deps.map(d => `<span class="dep-tag">${d}</span>`).join('');
          chip.innerHTML = `
            <div class="chip-titlebar">
              <div class="led${isLit ? ' lit' : ''}${shouldBlink ? ' blinking' : ''}"></div>
              <span class="chip-name">${name}</span>
              ${deleteBtn}
              <button class="config-btn" title="Configure">${cogIcon}</button>
            </div>
            <div class="chip-body">
              <button class="fire-btn${isLit ? ' active' : ''}" title="Fire"></button>
              <button class="msg-btn" title="Send with message">sms</button>
              ${typeBadge}
            </div>
            <div class="chip-deps">${depTags}</div>
          `;
        } else {
          chip.innerHTML = `
            <div class="chip-titlebar">
              <div class="led${isLit ? ' lit' : ''}${shouldBlink ? ' blinking' : ''}"></div>
              <span class="chip-name">${name}</span>
              ${deleteBtn}
              <button class="config-btn" title="Configure">${cogIcon}</button>
            </div>
            <div class="chip-body">
              <button class="fire-btn${isLit ? ' active' : ''}" title="Fire"></button>
              <button class="msg-btn" title="Send with message">sms</button>
              ${typeBadge}
            </div>
          `;
        }

        chip.addEventListener('click', () => fireEvent(name));
        chip.querySelector('.fire-btn').addEventListener('click', (e) => { e.stopPropagation(); fireEvent(name); });
        chip.querySelector('.msg-btn').addEventListener('click', (e) => { e.stopPropagation(); showMsgPopup(name, chip); });
        chip.querySelector('.config-btn').addEventListener('click', (e) => { e.stopPropagation(); showEventConfig(name, chip); });

        // Delete button handler
        const deleteBtnEl = chip.querySelector('.delete-btn');
        if (deleteBtnEl) {
          deleteBtnEl.addEventListener('click', (e) => { e.stopPropagation(); deleteEvent(name); });
        }

        chip.addEventListener('dragstart', (e) => {
          chip.classList.add('dragging');
          e.dataTransfer.setData('text/plain', `event:${name}`);
        });
        chip.addEventListener('dragend', () => chip.classList.remove('dragging'));

        list.appendChild(chip);
      }
    }

    function renderEventDropZone() {
      const zone = document.getElementById('eventDropZone');
      zone.innerHTML = '';
      zone.classList.toggle('empty', eventDropDeps.size === 0);

      for (const name of eventDropDeps) {
        const chip = document.createElement('div');
        chip.className = 'dep-chip';
        chip.innerHTML = `<span>${name}</span><button class="remove-btn">x</button>`;
        chip.querySelector('.remove-btn').addEventListener('click', () => {
          eventDropDeps.delete(name);
          renderEventDropZone();
        });
        zone.appendChild(chip);
      }
    }

    // ===== Listeners =====
    function createListener() {
      const input = document.getElementById('listenerNameInput');
      const name = input.value.trim();
      if (!name) { log('Listener name required', 'error'); return; }
      if (listenersMap.has(name)) { log(`Listener "${name}" exists`, 'error'); return; }

      const events = new Set(listenerDropEvents);
      const listenerData = { events, off: null, lit: false };
      listenersMap.set(name, listenerData);

      // Add to flowchart
      nodes.add({
        id: `listener:${name}`,
        label: name,
        color: { background: '#f0f9ff', border: '#38bdf8' },
        shadow: { enabled: true, color: 'rgba(0,0,0,0.1)', size: 5 },
        group: 'listener'
      });

      // Subscribe to events
      if (events.size > 0) {
        subscribeListener(name, events);
        events.forEach(evt => {
          edges.add({ from: `event:${evt}`, to: `listener:${name}`, id: `edge:${evt}:listener:${name}` });
        });
        log(name, 'create', 'listener', `-> [${[...events].join(', ')}]`);
      } else {
        log(name, 'create', 'listener', 'created');
      }

      listenerDropEvents.clear();
      renderListenerDropZone();
      renderListeners();
      input.value = randomListenerSlug();
    }

    // Delete a listener
    function deleteListener(name) {
      const listener = listenersMap.get(name);
      if (!listener) return;

      // Unsubscribe from events
      if (listener.off) listener.off();

      // Clear any pending timers
      if (listener.flickerInterval) clearInterval(listener.flickerInterval);
      if (listener.flickerTimeout) clearTimeout(listener.flickerTimeout);
      if (listener.offTimeout) clearTimeout(listener.offTimeout);

      // Remove from listenersMap
      listenersMap.delete(name);

      // Remove node from flowchart
      nodes.remove(`listener:${name}`);

      // Remove all edges connected to this listener
      const allEdges = edges.get();
      const edgesToRemove = allEdges.filter(e => e.to === `listener:${name}`);
      edges.remove(edgesToRemove.map(e => e.id));

      renderListeners();
      saveState();
      log(name, 'expired', 'listener', 'deleted');
    }

    function subscribeListener(name, events) {
      const listener = listenersMap.get(name);
      if (!listener) return;

      // Unsubscribe previous
      if (listener.off) listener.off();

      // Subscribe to all events
      const offs = [];
      for (const evt of events) {
        const off = kernel.on(evt, (eventObj) => {
          lightUpListener(name);
          // eventObj can be the data directly or an event object with .data
          const msg = eventObj?.message || eventObj?.data?.message;
          if (msg) {
            log(name, 'fire', 'listener', `← ${evt}\n"${msg}"`);
          } else {
            log(name, 'fire', 'listener', `← ${evt}`);
          }
        });
        offs.push(off);
      }
      listener.off = () => offs.forEach(fn => fn());
    }

    function updateListenerNode(name, state) {
      // state: 'off', 'lit', 'flicker-on', 'flicker-off'
      const nodeId = `listener:${name}`;

      if (state === 'off') {
        nodes.update({
          id: nodeId,
          label: name,
          color: { background: '#f0f9ff', border: '#38bdf8' },
          shadow: { enabled: true, color: 'rgba(0,0,0,0.1)', size: 5 }
        });
      } else if (state === 'lit' || state === 'flicker-on') {
        nodes.update({
          id: nodeId,
          label: name,
          color: { background: '#fee2e2', border: '#ef4444' },
          shadow: { enabled: true, color: 'rgba(239,68,68,0.5)', size: 10 }
        });
      } else if (state === 'flicker-off') {
        nodes.update({
          id: nodeId,
          label: name,
          color: { background: '#f0f9ff', border: '#38bdf8' },
          shadow: { enabled: true, color: 'rgba(0,0,0,0.1)', size: 5 }
        });
      }
    }

    function lightUpListener(name) {
      const listener = listenersMap.get(name);
      if (!listener) return;

      // Clear any existing timers
      if (listener.flickerInterval) {
        clearInterval(listener.flickerInterval);
        listener.flickerInterval = null;
      }
      if (listener.flickerTimeout) {
        clearTimeout(listener.flickerTimeout);
        listener.flickerTimeout = null;
      }
      if (listener.offTimeout) {
        clearTimeout(listener.offTimeout);
        listener.offTimeout = null;
      }

      updateListenerNode(name, 'lit');
      listener.lit = true;
      listener.flickering = false;
      renderListeners();

      // Start flickering after 1200ms
      listener.flickerTimeout = setTimeout(() => {
        listener.flickering = true;
        renderListeners();

        // Flicker the diagram node too
        let flickerState = true;
        listener.flickerInterval = setInterval(() => {
          flickerState = !flickerState;
          updateListenerNode(name, flickerState ? 'flicker-on' : 'flicker-off');
        }, 100);
      }, 1200);

      // Turn off after flicker (1200ms + 600ms flicker)
      listener.offTimeout = setTimeout(() => {
        if (listener.flickerInterval) {
          clearInterval(listener.flickerInterval);
          listener.flickerInterval = null;
        }
        listener.flickerTimeout = null;
        listener.offTimeout = null;
        listener.lit = false;
        listener.flickering = false;
        updateListenerNode(name, 'off');
        renderListeners();
      }, 1800);
    }

    function renderListeners() {
      const list = document.getElementById('listenersList');
      list.innerHTML = '';

      for (const [name, listener] of listenersMap) {
        const chip = document.createElement('div');
        chip.className = 'listener-chip';
        chip.draggable = true;
        chip.dataset.name = name;

        const ledClass = listener.lit ? (listener.flickering ? ' lit-red flickering' : ' lit-red') : '';
        const eventTags = [...listener.events].map(e => `<span class="event-tag">${e}</span>`).join('');
        const trashIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
        chip.innerHTML = `
          <div class="chip-titlebar">
            <span class="chip-name">${name}</span>
            <button class="delete-btn" title="Delete listener">${trashIcon}</button>
            <div class="led${ledClass}"></div>
          </div>
          <div class="chip-events">${eventTags}</div>
        `;

        // Delete button handler
        chip.querySelector('.delete-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          deleteListener(name);
        });

        chip.addEventListener('dragstart', (e) => {
          chip.classList.add('dragging');
          e.dataTransfer.setData('text/plain', `listener:${name}`);
        });
        chip.addEventListener('dragend', () => chip.classList.remove('dragging'));

        // Allow dropping events onto listeners
        chip.addEventListener('dragover', (e) => {
          const data = e.dataTransfer.types.includes('text/plain');
          if (data) {
            e.preventDefault();
            chip.style.outline = '2px dashed #0ea5e9';
          }
        });
        chip.addEventListener('dragleave', () => {
          chip.style.outline = '';
        });
        chip.addEventListener('drop', (e) => {
          e.preventDefault();
          chip.style.outline = '';
          const data = e.dataTransfer.getData('text/plain');
          if (data.startsWith('event:')) {
            const eventName = data.slice(6);
            if (eventsMap.has(eventName) && !listener.events.has(eventName)) {
              listener.events.add(eventName);
              // Re-subscribe with new events
              subscribeListener(name, listener.events);
              // Add edge in flowchart
              edges.add({ from: `event:${eventName}`, to: `listener:${name}`, id: `edge:${eventName}:listener:${name}` });
              renderListeners();
              log(name, 'create', 'listener', `+= ${eventName}`);
              saveState();
            }
          }
        });

        list.appendChild(chip);
      }
    }

    function renderListenerDropZone() {
      const zone = document.getElementById('listenerDropZone');
      zone.innerHTML = '';
      zone.classList.toggle('empty', listenerDropEvents.size === 0);

      for (const name of listenerDropEvents) {
        const chip = document.createElement('div');
        chip.className = 'dep-chip';
        chip.innerHTML = `<span>${name}</span><button class="remove-btn">x</button>`;
        chip.querySelector('.remove-btn').addEventListener('click', () => {
          listenerDropEvents.delete(name);
          renderListenerDropZone();
        });
        zone.appendChild(chip);
      }
    }

    // ===== Config popup =====
    let activePopup = null;

    function closePopup() {
      if (activePopup) {
        if (activePopup._cleanup) activePopup._cleanup();
        activePopup.remove();
        activePopup = null;
      }
    }

    function showEventConfig(name, chip) {
      closePopup();
      const event = eventsMap.get(name);
      if (!event) return;

      const popup = document.createElement('div');
      popup.className = 'config-popup';
      const customTtl = event.ttl || 3000;
      const isComposed = event.deps.length > 0;

      const autoInterval = event.autoInterval || 2000;

      // Composition-specific options (TTL window)
      const compositionTTL = event.compositionTTL || defaultTtl;
      const hasCompositionTTL = !!event.compositionTTL;
      const compositionRow = isComposed ? `
        <div class="config-row" style="margin-top:0.75rem; padding-top:0.5rem; border-top:1px solid #e5e7eb; gap:0.3rem;">
          <span style="font-size:0.65rem; color:#6b7280; flex-shrink:0;">Window:</span>
          <button class="type-btn ${!hasCompositionTTL ? 'active' : ''}" data-comp-ttl="inherit" title="Inherit: use each dep's own TTL">Auto</button>
          <button class="type-btn ${hasCompositionTTL ? 'active' : ''}" data-comp-ttl="custom" title="Custom: override all deps with this TTL">Set</button>
          <input type="range" class="comp-ttl-slider" min="500" max="30000" step="500" value="${compositionTTL}" style="flex:1; min-width:40px;" ${!hasCompositionTTL ? 'disabled' : ''}>
          <span class="comp-ttl-value" style="min-width:30px; text-align:right; font-size:0.65rem;">${(compositionTTL/1000).toFixed(1)}s</span>
        </div>
      ` : '';

      popup.innerHTML = `
        <div class="mac-titlebar">
          <span class="mac-title">${name}</span>
          <button class="mac-close" title="Close"></button>
        </div>
        <div class="popup-body">
          <div class="config-row" style="gap:0.25rem; justify-content:space-between;">
            <button class="type-btn ${!event.ttl && event.type === 'default' ? 'active' : ''}" data-type="default" title="Standard: uses the global TTL slider value">Std</button>
            <button class="type-btn ${event.type === 'permanent' ? 'active' : ''}" data-type="permanent" title="Permanent: stays lit forever until manually reset">&#8734;</button>
            <button class="type-btn ${event.type === 'instant' ? 'active' : ''}" data-type="instant" title="Instant: brief flash (200ms), no composition window">&#9889;</button>
            <button class="type-btn ${event.ttl ? 'active' : ''}" data-type="custom" title="Custom TTL: set a specific duration with the slider below">TTL</button>
          </div>
          <div class="config-row" style="margin-top:0.5rem;">
            <input type="range" class="custom-ttl" min="100" max="30000" step="100" value="${customTtl}" style="flex:1;" ${!event.ttl ? 'disabled' : ''}>
            <span class="ttl-value" style="min-width:35px; text-align:right;">${(customTtl/1000).toFixed(1)}s</span>
          </div>
          ${compositionRow}
          <div class="config-row" style="margin-top:0.75rem; padding-top:0.5rem; border-top:1px solid #e5e7eb; flex-wrap:nowrap;">
            <button class="type-btn ${event.autoInterval ? 'active' : ''}" data-auto title="Auto-fire: emit this event at regular intervals" style="flex-shrink:0;">&#x21bb;</button>
            <input type="range" class="auto-interval" min="500" max="10000" step="500" value="${autoInterval}" style="flex:1; min-width:0;" ${!event.autoInterval ? 'disabled' : ''}>
            <span class="auto-value" style="min-width:30px; text-align:right; flex-shrink:0; font-size:0.65rem;">${(autoInterval/1000).toFixed(1)}s</span>
          </div>
        </div>
      `;

      const slider = popup.querySelector('.custom-ttl');
      const valueSpan = popup.querySelector('.ttl-value');

      popup.querySelectorAll('.type-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          popup.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');

          const type = btn.dataset.type;
          slider.disabled = type !== 'custom';

          if (type === 'custom') {
            event.type = 'default';
            event.ttl = parseInt(slider.value, 10);
          } else {
            event.type = type;
            event.ttl = null;
          }
          rebuildDependentCompositions(name); // Rebuild compositions using this event
          renderEvents();
          saveState();
        });
      });

      slider.addEventListener('input', (e) => {
        e.stopPropagation();
        event.ttl = parseInt(e.target.value, 10);
        valueSpan.textContent = `${(event.ttl/1000).toFixed(1)}s`;
        rebuildDependentCompositions(name); // Rebuild compositions using this event
        renderEvents();
        saveState();
      });

      // Auto-fire controls
      const autoBtn = popup.querySelector('[data-auto]');
      const autoSlider = popup.querySelector('.auto-interval');
      const autoValue = popup.querySelector('.auto-value');

      autoBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (event.autoInterval) {
          // Turn off
          stopAutoFire(name);
          event.autoInterval = null;
          autoBtn.classList.remove('active');
          autoSlider.disabled = true;
        } else {
          // Turn on
          event.autoInterval = parseInt(autoSlider.value, 10);
          startAutoFire(name);
          autoBtn.classList.add('active');
          autoSlider.disabled = false;
        }
        renderEvents();
        saveState();
      });

      autoSlider.addEventListener('input', (e) => {
        e.stopPropagation();
        const interval = parseInt(e.target.value, 10);
        autoValue.textContent = `${(interval/1000).toFixed(1)}s`;
        if (event.autoInterval) {
          event.autoInterval = interval;
          stopAutoFire(name);
          startAutoFire(name);
          saveState();
        }
      });

      // Composition TTL buttons (only for composed events)
      popup.querySelectorAll('[data-comp-ttl]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          popup.querySelectorAll('[data-comp-ttl]').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');

          const mode = btn.dataset.compTtl;
          const compSlider = popup.querySelector('.comp-ttl-slider');
          const compValue = popup.querySelector('.comp-ttl-value');

          if (mode === 'inherit') {
            event.compositionTTL = null;
            compSlider.disabled = true;
          } else {
            event.compositionTTL = parseInt(compSlider.value, 10);
            compSlider.disabled = false;
          }

          createCompositionFor(name, event.deps);
          renderEvents();
          saveState();
        });
      });

      // Composition TTL slider
      const compSlider = popup.querySelector('.comp-ttl-slider');
      const compValue = popup.querySelector('.comp-ttl-value');
      if (compSlider) {
        compSlider.addEventListener('input', (e) => {
          e.stopPropagation();
          const val = parseInt(e.target.value, 10);
          compValue.textContent = `${(val/1000).toFixed(1)}s`;
          if (event.compositionTTL !== null) {
            event.compositionTTL = val;
            createCompositionFor(name, event.deps);
            saveState();
          }
        });
      }

      popup.addEventListener('click', e => e.stopPropagation());
      popup.querySelector('.mac-close').addEventListener('click', closePopup);

      // Initial positioning
      const rect = chip.getBoundingClientRect();
      let popupX = Math.max(10, rect.left);
      let popupY = rect.bottom + 4;

      // Ensure popup stays within viewport
      const popupWidth = 260;
      const popupHeight = 300; // Approximate
      if (popupX + popupWidth > window.innerWidth - 10) {
        popupX = window.innerWidth - popupWidth - 10;
      }
      if (popupY + popupHeight > window.innerHeight - 10) {
        popupY = rect.top - popupHeight - 4;
        if (popupY < 10) popupY = 10;
      }

      popup.style.top = `${popupY}px`;
      popup.style.left = `${popupX}px`;

      // Make titlebar draggable
      const titlebar = popup.querySelector('.mac-titlebar');
      let isDragging = false;
      let dragOffsetX = 0;
      let dragOffsetY = 0;

      const onMouseDown = (e) => {
        if (e.target.classList.contains('mac-close')) return;
        isDragging = true;
        popup.classList.add('dragging');
        dragOffsetX = e.clientX - popup.offsetLeft;
        dragOffsetY = e.clientY - popup.offsetTop;
        e.preventDefault();
      };

      const onMouseMove = (e) => {
        if (!isDragging) return;
        let newX = e.clientX - dragOffsetX;
        let newY = e.clientY - dragOffsetY;

        // Keep within viewport bounds
        const popupRect = popup.getBoundingClientRect();
        newX = Math.max(0, Math.min(newX, window.innerWidth - popupRect.width));
        newY = Math.max(0, Math.min(newY, window.innerHeight - popupRect.height));

        popup.style.left = `${newX}px`;
        popup.style.top = `${newY}px`;
      };

      const onMouseUp = () => {
        if (isDragging) {
          isDragging = false;
          popup.classList.remove('dragging');
        }
      };

      titlebar.addEventListener('mousedown', onMouseDown);
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);

      // Store cleanup function
      popup._cleanup = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.body.appendChild(popup);
      activePopup = popup;
    }

    document.addEventListener('click', closePopup);

    // ===== Drop zones =====
    function setupDropZone(zone, targetSet, renderFn) {
      zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('drag-over');
      });
      zone.addEventListener('dragleave', (e) => {
        if (!zone.contains(e.relatedTarget)) zone.classList.remove('drag-over');
      });
      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        const data = e.dataTransfer.getData('text/plain');
        if (data.startsWith('event:')) {
          const name = data.slice(6);
          if (eventsMap.has(name)) {
            targetSet.add(name);
            renderFn();
          }
        }
      });
    }

    setupDropZone(document.getElementById('eventDropZone'), eventDropDeps, renderEventDropZone);
    setupDropZone(document.getElementById('listenerDropZone'), listenerDropEvents, renderListenerDropZone);

    // ===== Panel toggles =====
    function togglePanel(panelId) {
      const panel = document.getElementById(panelId);
      panel.classList.toggle('hidden');
    }

    document.getElementById('toggleLeft').addEventListener('click', () => togglePanel('leftPanel'));
    document.getElementById('toggleRight').addEventListener('click', () => togglePanel('rightPanel'));

    // ===== Default TTL slider =====
    const ttlSlider = document.getElementById('defaultTtlSlider');
    const ttlValue = document.getElementById('defaultTtlValue');

    ttlSlider.addEventListener('input', (e) => {
      defaultTtl = parseInt(e.target.value, 10);
      ttlValue.textContent = `${(defaultTtl/1000).toFixed(1)}s`;
    });

    // ===== LocalStorage Persistence =====
    const STORAGE_KEY = 'qk-studio-state';

    function saveState() {
      const state = {
        events: Array.from(eventsMap.entries()).map(([name, data]) => ({
          name,
          deps: data.deps,
          type: data.type,
          ttl: data.ttl,
          autoInterval: data.autoInterval,
          compositionTTL: data.compositionTTL
        })),
        listeners: Array.from(listenersMap.entries()).map(([name, data]) => ({
          name,
          events: Array.from(data.events)
        })),
        defaultTtl
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    function loadState() {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return false;

      try {
        const state = JSON.parse(saved);

        // Restore default TTL
        if (state.defaultTtl) {
          defaultTtl = state.defaultTtl;
          document.getElementById('defaultTtlSlider').value = defaultTtl;
          document.getElementById('defaultTtlValue').textContent = `${(defaultTtl/1000).toFixed(1)}s`;
        }

        // Restore events
        for (const evt of state.events || []) {
          const eventData = { deps: evt.deps || [], type: evt.type || 'default', ttl: evt.ttl, autoInterval: evt.autoInterval, compositionTTL: evt.compositionTTL || null, lit: false };
          eventsMap.set(evt.name, eventData);

          nodes.add({
            id: `event:${evt.name}`,
            label: evt.name,
            color: { background: evt.deps?.length ? '#faf5ff' : '#fffef0', border: evt.deps?.length ? '#a855f7' : '#facc15' },
            shadow: { enabled: true, color: 'rgba(0,0,0,0.1)', size: 5 },
            group: 'event'
          });

          if (evt.deps?.length > 0) {
            createCompositionFor(evt.name, evt.deps);
            evt.deps.forEach(dep => {
              edges.add({ from: `event:${dep}`, to: `event:${evt.name}`, id: `edge:${dep}:${evt.name}` });
            });
          }
        }

        // Restore listeners
        for (const lst of state.listeners || []) {
          const events = new Set(lst.events || []);
          const listenerData = { events, off: null, lit: false };
          listenersMap.set(lst.name, listenerData);

          nodes.add({
            id: `listener:${lst.name}`,
            label: lst.name,
            color: { background: '#f0f9ff', border: '#38bdf8' },
            shadow: { enabled: true, color: 'rgba(0,0,0,0.1)', size: 5 },
            group: 'listener'
          });

          if (events.size > 0) {
            subscribeListener(lst.name, events);
            events.forEach(evt => {
              edges.add({ from: `event:${evt}`, to: `listener:${lst.name}`, id: `edge:${evt}:listener:${lst.name}` });
            });
          }
        }

        renderEvents();
        renderListeners();

        // Restart auto-fire timers
        for (const [name, event] of eventsMap) {
          if (event.autoInterval) {
            startAutoFire(name);
          }
        }

        return true;
      } catch (e) {
        console.error('Failed to load state:', e);
        return false;
      }
    }

    function clearAll() {
      // Stop all auto-fire timers
      for (const name of autoFireTimers.keys()) {
        stopAutoFire(name);
      }

      // Clear maps
      eventsMap.clear();
      listenersMap.clear();
      compositions.forEach(c => c.dispose());
      compositions.clear();
      eventDropDeps.clear();
      listenerDropEvents.clear();

      // Clear vis.js
      nodes.clear();
      edges.clear();

      // Clear localStorage
      localStorage.removeItem(STORAGE_KEY);

      // Clear UI
      renderEvents();
      renderListeners();
      renderEventDropZone();
      renderListenerDropZone();
      document.getElementById('logContent').innerHTML = '';

      log('QK Studio', 'create', 'system', 'cleared');
    }

    function showClearConfirm() {
      const overlay = document.createElement('div');
      overlay.className = 'confirm-overlay';

      const dialog = document.createElement('div');
      dialog.className = 'confirm-dialog';
      dialog.innerHTML = `
        <h3>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; margin-right: 0.3rem;">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
          Clear All?
        </h3>
        <p>This will delete all events, listeners and reset the studio.</p>
        <div class="btn-row">
          <button class="btn-cancel">Cancel</button>
          <button class="btn-confirm">Clear</button>
        </div>
      `;

      dialog.querySelector('.btn-cancel').addEventListener('click', () => {
        overlay.remove();
        dialog.remove();
      });

      dialog.querySelector('.btn-confirm').addEventListener('click', () => {
        clearAll();
        overlay.remove();
        dialog.remove();
      });

      overlay.addEventListener('click', () => {
        overlay.remove();
        dialog.remove();
      });

      document.body.appendChild(overlay);
      document.body.appendChild(dialog);
    }

    // Auto-save on changes
    const originalCreateEvent = createEvent;
    createEvent = function() {
      originalCreateEvent();
      saveState();
    };

    const originalCreateListener = createListener;
    createListener = function() {
      originalCreateListener();
      saveState();
    };

    // ===== Init =====
    document.getElementById('eventNameInput').value = randomEventSlug();
    document.getElementById('listenerNameInput').value = randomListenerSlug();

    document.getElementById('eventNameInput').addEventListener('keydown', e => { if (e.key === 'Enter') createEvent(); });
    document.getElementById('listenerNameInput').addEventListener('keydown', e => { if (e.key === 'Enter') createListener(); });

    document.getElementById('createEventBtn').addEventListener('click', createEvent);
    document.getElementById('createListenerBtn').addEventListener('click', createListener);

    document.getElementById('eventShuffleBtn').addEventListener('click', () => {
      document.getElementById('eventNameInput').value = randomEventSlug();
    });
    document.getElementById('listenerShuffleBtn').addEventListener('click', () => {
      document.getElementById('listenerNameInput').value = randomListenerSlug();
    });

    document.getElementById('clearAllBtn').addEventListener('click', showClearConfirm);
    document.getElementById('clearLogBtn').addEventListener('click', () => {
      document.getElementById('logContent').innerHTML = '';
      log('Log', 'system', 'system', 'cleared');
    });

    // Default demo flow - Simple ping-pong example
    function loadDefaultFlow() {
      // Base events: simple clicks + one auto-fire
      const baseEvents = [
        { name: 'ping', deps: [], type: 'default' },
        { name: 'pong', deps: [], type: 'default' },
        { name: 'tick', deps: [], type: 'default', ttl: 2000, autoInterval: 3000 }
      ];

      // Composed event: fires when both ping AND pong have fired
      const composedEvents = [
        { name: 'ping-pong', deps: ['ping', 'pong'], type: 'default' }
      ];

      // Listeners
      const listeners = [
        { name: 'game-watcher', events: ['ping-pong'] },
        { name: 'tick-logger', events: ['tick'] }
      ];

      // Create base events
      for (const evt of baseEvents) {
        const eventData = { deps: [], type: evt.type, ttl: evt.ttl || null, autoInterval: evt.autoInterval || null, lit: false };
        eventsMap.set(evt.name, eventData);
        nodes.add({
          id: `event:${evt.name}`,
          label: evt.name,
          color: { background: '#fffef0', border: '#facc15' },
          shadow: { enabled: true, color: 'rgba(0,0,0,0.1)', size: 5 },
          group: 'event'
        });
        if (evt.autoInterval) {
          startAutoFire(evt.name);
        }
      }

      // Create composed events
      for (const evt of composedEvents) {
        const eventData = { deps: evt.deps, type: evt.type, ttl: null, lit: false };
        eventsMap.set(evt.name, eventData);
        nodes.add({
          id: `event:${evt.name}`,
          label: evt.name,
          color: { background: '#faf5ff', border: '#a855f7' },
          shadow: { enabled: true, color: 'rgba(0,0,0,0.1)', size: 5 },
          group: 'event'
        });
        createCompositionFor(evt.name, evt.deps);
        evt.deps.forEach(dep => {
          edges.add({ from: `event:${dep}`, to: `event:${evt.name}`, id: `edge:${dep}:${evt.name}` });
        });
      }

      // Create listeners
      for (const lst of listeners) {
        const events = new Set(lst.events);
        const listenerData = { events, off: null, lit: false };
        listenersMap.set(lst.name, listenerData);
        nodes.add({
          id: `listener:${lst.name}`,
          label: lst.name,
          color: { background: '#f0f9ff', border: '#38bdf8' },
          shadow: { enabled: true, color: 'rgba(0,0,0,0.1)', size: 5 },
          group: 'listener'
        });
        subscribeListener(lst.name, events);
        events.forEach(evt => {
          edges.add({ from: `event:${evt}`, to: `listener:${lst.name}`, id: `edge:${evt}:listener:${lst.name}` });
        });
      }

      renderEvents();
      renderListeners();
      saveState();

      log('QK Studio', 'create', 'system', 'demo loaded');
      log('Tip', 'system', 'system', 'Click ping then pong to trigger ping-pong!');
    }

    // Load saved state or show ready message
    if (loadState()) {
      log('QK Studio', 'create', 'system', 'restored');
    } else {
      loadDefaultFlow();
    }
