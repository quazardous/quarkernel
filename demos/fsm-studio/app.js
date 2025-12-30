import { Kernel, useMachine, fromXState, createMachine } from '@quazardous/quarkernel';

// Import state-centric FSM configs from example files
import orderConfig from './examples/order.js';
import paymentConfig from './examples/payment.js';
import coffeeConfig from './examples/coffee.js';
import trafficLightConfig from './examples/trafficLight.js';
import playerConfig from './examples/player.js';

// Store full configs (state-centric format with entry/exit/after inline)
const exampleConfigs = {
  order: orderConfig,
  payment: paymentConfig,
  coffee: coffeeConfig,
  trafficLight: trafficLightConfig,
  player: playerConfig,
};

// Legacy behaviors extracted from configs (for backward compatibility with editor)
const machineBehaviors = {};

// ===== Kernel & Machines =====
const kernel = new Kernel();
let machines = {};
let machineConfigs = {};
let currentMachine = null;
let currentMachineName = null;
let network = null;
let nodesDataSet = null;
let edgesDataSet = null;

// ===== CodeMirror Editors =====
let cmSnapshot = null;
let cmXState = null;
let cmFSM = null;

// ===== QuarKernel to XState Converter =====
function toXState(config) {
  const xstate = {
    id: config.prefix || config.id || 'machine',
    initial: config.initial,
  };

  if (config.context) {
    xstate.context = { ...config.context };
  }

  xstate.states = {};
  for (const [stateName, stateConfig] of Object.entries(config.states)) {
    const state = {};

    if (stateConfig.on) {
      state.on = {};
      for (const [event, target] of Object.entries(stateConfig.on)) {
        if (typeof target === 'string') {
          state.on[event] = target;
        } else if (target.target) {
          state.on[event] = { target: target.target };
          if (target.actions) state.on[event].actions = target.actions;
          if (target.cond) state.on[event].cond = target.cond;
        }
      }
    }

    // Entry/exit actions
    if (stateConfig.entry) state.entry = stateConfig.entry;
    if (stateConfig.exit) state.exit = stateConfig.exit;

    xstate.states[stateName] = state;
  }

  return xstate;
}

// ===== XState to QuarKernel Converter (fromXState is imported) =====

// ===== Generate XState Config with Actions =====
// Now uses state-centric format: behavior.states[stateName].entry/exit/after
function toXStateWithActions(config, behavior) {
  const id = config.prefix || config.id || 'machine';
  const lines = [`// XState v5 Config for "${id}"`, `import { createMachine, raise } from 'xstate';`, ''];

  // Collect action names from state-centric format
  const actionNames = new Set();
  if (behavior?.states) {
    for (const [stateName, stateConfig] of Object.entries(behavior.states)) {
      if (stateConfig.entry) actionNames.add(`enter_${stateName}`);
      if (stateConfig.exit) actionNames.add(`exit_${stateName}`);
    }
  }
  if (behavior?.on) Object.keys(behavior.on).forEach((e) => actionNames.add(`on_${e}`));

  // Build states object
  const statesLines = [];
  for (const [stateName, stateConfig] of Object.entries(config.states)) {
    const stateLines = [`    ${stateName}: {`];

    // Entry action (from state-centric: behavior.states[stateName].entry)
    const behaviorStateConfig = behavior?.states?.[stateName];
    if (behaviorStateConfig?.entry) {
      stateLines.push(`      entry: 'enter_${stateName}',`);
    }

    // Exit action (from state-centric: behavior.states[stateName].exit)
    if (behaviorStateConfig?.exit) {
      stateLines.push(`      exit: 'exit_${stateName}',`);
    }

    // After/timer (from state-centric: behavior.states[stateName].after)
    if (behaviorStateConfig?.after) {
      const timer = behaviorStateConfig.after;
      stateLines.push('      after: {');
      stateLines.push(`        ${timer.delay}: { actions: raise({ type: '${timer.send}' }) },`);
      stateLines.push('      },');
    }

    // Transitions
    if (stateConfig.on && Object.keys(stateConfig.on).length > 0) {
      stateLines.push('      on: {');
      for (const [event, target] of Object.entries(stateConfig.on)) {
        const targetState = typeof target === 'string' ? target : target.target;
        if (behavior?.on?.[event]) {
          stateLines.push(`        ${event}: { target: '${targetState}', actions: 'on_${event}' },`);
        } else {
          stateLines.push(`        ${event}: '${targetState}',`);
        }
      }
      stateLines.push('      },');
    }

    stateLines.push('    },');
    statesLines.push(stateLines.join('\n'));
  }

  // Machine config
  lines.push(`export const ${id}Machine = createMachine({`);
  lines.push(`  id: '${id}',`);
  lines.push(`  initial: '${config.initial}',`);
  if (config.context) {
    lines.push(`  context: ${JSON.stringify(config.context)},`);
  }
  lines.push('  states: {');
  lines.push(statesLines.join('\n'));
  lines.push('  },');
  lines.push('});');

  // Actions implementations
  if (actionNames.size > 0) {
    lines.push('');
    lines.push('// Actions implementations');
    lines.push('export const actions = {');

    // From state-centric format
    if (behavior?.states) {
      for (const [state, stateConfig] of Object.entries(behavior.states)) {
        if (stateConfig.entry) {
          lines.push(`  enter_${state}: ${stateConfig.entry.toString()},`);
        }
        if (stateConfig.exit) {
          lines.push(`  exit_${state}: ${stateConfig.exit.toString()},`);
        }
      }
    }
    if (behavior?.on) {
      for (const [event, fn] of Object.entries(behavior.on)) {
        lines.push(`  on_${event}: ${fn.toString()},`);
      }
    }

    lines.push('};');
  }

  return lines.join('\n');
}

// ===== Format State-Centric FSM as JS Code =====
function formatBehaviorCode(machineName, fullConfig) {
  const config = machineConfigs[machineName];
  const lines = [`// FSM Definition for "${machineName}"`, `// Helpers: ctx, set(obj), send(event), log(msg)`, '', `export default {`];

  // ID
  lines.push(`  id: '${machineName}',`);

  // Initial state
  if (config?.initial) {
    lines.push(`  initial: '${config.initial}',`);
  }

  // Context
  if (config?.context && Object.keys(config.context).length > 0) {
    lines.push(`  context: ${JSON.stringify(config.context)},`);
  }

  // States (state-centric: entry/exit/after inline)
  const statesConfig = fullConfig?.states || config?.states || {};
  lines.push('  states: {');
  for (const [stateName, stateConfig] of Object.entries(statesConfig)) {
    lines.push(`    ${stateName}: {`);

    // entry
    if (stateConfig.entry) {
      lines.push(`      entry: ${stateConfig.entry.toString()},`);
    }

    // exit
    if (stateConfig.exit) {
      lines.push(`      exit: ${stateConfig.exit.toString()},`);
    }

    // after
    if (stateConfig.after) {
      lines.push(`      after: { delay: ${stateConfig.after.delay}, send: '${stateConfig.after.send}' },`);
    }

    // on (transitions)
    const transitions = stateConfig.on || {};
    const transitionEntries = Object.entries(transitions);
    if (transitionEntries.length > 0) {
      lines.push('      on: {');
      for (const [event, target] of transitionEntries) {
        const targetState = typeof target === 'string' ? target : target.target;
        lines.push(`        ${event}: '${targetState}',`);
      }
      lines.push('      },');
    }

    lines.push('    },');
  }
  lines.push('  },');

  // Global event handlers (on at root level)
  if (fullConfig?.on && Object.keys(fullConfig.on).length > 0) {
    lines.push('  on: {');
    for (const [event, fn] of Object.entries(fullConfig.on)) {
      lines.push(`    ${event}: ${fn.toString()},`);
    }
    lines.push('  },');
  }

  lines.push('};');
  return lines.join('\n');
}

// ===== Event Logging =====
let showKernelEvents = false;

kernel.on('*:enter:*', (e) => {
  log(`ENTER ${e.data.state}`, 'enter');
  updateUI();
});

kernel.on('*:exit:*', (e) => {
  log(`EXIT ${e.data.state}`, 'exit');
});

kernel.on('*:transition', (e) => {
  log(`${e.data.from} → ${e.data.to} (${e.data.event})`, 'transition');
  updateUI();
});

// Log all kernel events when enabled (** matches any number of segments)
kernel.on('**', (e) => {
  if (showKernelEvents) {
    const data = e.data ? ` ${JSON.stringify(e.data)}` : '';
    log(`[kernel] ${e.name}${data}`, 'kernel');
  }
});

window.toggleKernelEvents = (enabled) => {
  showKernelEvents = enabled;
  log(`Kernel events: ${enabled ? 'ON' : 'OFF'}`, 'system');
};

// ===== UML-style Graph Building =====
function buildGraph(config, currentState) {
  const nodes = [];
  const edges = [];
  const stateNames = Object.keys(config.states);

  // Add initial pseudo-state (filled circle)
  nodes.push({
    id: '__initial__',
    label: '',
    shape: 'dot',
    size: 12,
    color: {
      background: '#a78bfa',
      border: '#a78bfa',
    },
    fixed: false,
  });

  // Edge from initial pseudo-state to initial state
  edges.push({
    from: '__initial__',
    to: config.initial,
    arrows: 'to',
    color: { color: '#a78bfa', highlight: '#c4b5fd' },
    width: 2,
    smooth: { type: 'curvedCW', roundness: 0.1 },
  });

  // Create state nodes
  stateNames.forEach((state) => {
    const isCurrent = state === currentState;
    const isFinal = !config.states[state].on || Object.keys(config.states[state].on).length === 0;

    if (isFinal) {
      // Final state: bullseye (circle with inner circle)
      nodes.push({
        id: state,
        label: state,
        shape: 'circle',
        size: 30,
        color: {
          background: isCurrent ? '#3b82f6' : 'transparent',
          border: isCurrent ? '#60a5fa' : '#71717a',
          highlight: {
            background: isCurrent ? '#3b82f6' : 'transparent',
            border: '#facc15', // Yellow border when selected
          },
        },
        borderWidth: 3,
        borderWidthSelected: 4,
        font: {
          color: '#e4e4e7',
          size: 12,
          face: 'system-ui, sans-serif',
        },
        shadow: {
          enabled: false,
          color: '#facc15',
          size: 15,
          x: 0,
          y: 0,
        },
        chosen: {
          node: (values) => {
            values.shadow = true;
            values.shadowColor = '#facc15';
            values.shadowSize = 15;
            values.borderColor = '#facc15';
          },
        },
        shapeProperties: {
          borderDashes: false,
        },
      });
    } else {
      // Regular state: rounded rectangle
      nodes.push({
        id: state,
        label: state,
        shape: 'box',
        borderRadius: 8,
        margin: { top: 12, bottom: 12, left: 16, right: 16 },
        color: {
          background: isCurrent ? '#3b82f6' : '#1e293b',
          border: isCurrent ? '#60a5fa' : '#475569',
          highlight: {
            background: isCurrent ? '#3b82f6' : '#1e293b',
            border: '#facc15', // Yellow border when selected
          },
          hover: {
            background: '#334155',
            border: '#64748b',
          },
        },
        shadow: {
          enabled: false,
          color: '#facc15',
          size: 15,
          x: 0,
          y: 0,
        },
        chosen: {
          node: (values) => {
            values.shadow = true;
            values.shadowColor = '#facc15';
            values.shadowSize = 15;
            values.borderColor = '#facc15';
          },
        },
        borderWidth: 2,
        borderWidthSelected: 3,
        font: {
          color: '#e4e4e7',
          size: 14,
          face: 'system-ui, sans-serif',
          bold: isCurrent,
        },
        shadow: {
          enabled: isCurrent,
          color: 'rgba(59, 130, 246, 0.5)',
          size: 10,
          x: 0,
          y: 0,
        },
      });
    }
  });

  // Create transition edges
  stateNames.forEach((state) => {
    const stateNode = config.states[state];
    if (stateNode.on) {
      Object.entries(stateNode.on).forEach(([event, target]) => {
        const targetState = typeof target === 'string' ? target : target.target;
        const isSelfLoop = state === targetState;
        const isAvailable = state === currentState;

        edges.push({
          from: state,
          to: targetState,
          label: event,
          arrows: {
            to: {
              enabled: true,
              scaleFactor: 0.8,
              type: 'arrow',
            },
          },
          color: {
            color: isAvailable ? '#60a5fa' : '#64748b',
            highlight: '#93c5fd',
            hover: '#94a3b8',
          },
          width: isAvailable ? 2.5 : 1.5,
          font: {
            color: isAvailable ? '#93c5fd' : '#94a3b8',
            size: 11,
            face: 'system-ui, sans-serif',
            strokeWidth: 0,
            align: 'horizontal',
            background: 'rgba(26, 26, 46, 0.9)',
          },
          smooth: isSelfLoop
            ? { type: 'curvedCW', roundness: 0.6 }
            : { type: 'curvedCW', roundness: 0.15 },
          selfReference: {
            size: 25,
            angle: Math.PI / 4,
          },
          event: event, // Store for click handler
          hoverWidth: 3,
        });
      });
    }
  });

  return { nodes, edges };
}

// ===== Auto Layout (simple force-based positioning) =====
function calculateInitialPositions(nodes, edges) {
  const positions = {};
  const stateNodes = nodes.filter((n) => n.id !== '__initial__');
  const initialNode = nodes.find((n) => n.id === '__initial__');

  // Find the actual initial state
  const initialEdge = edges.find((e) => e.from === '__initial__');
  const initialStateId = initialEdge ? initialEdge.to : stateNodes[0]?.id;

  // Simple left-to-right layout based on graph distance from initial
  const distances = {};
  const queue = [initialStateId];
  distances[initialStateId] = 0;

  while (queue.length > 0) {
    const current = queue.shift();
    const currentDist = distances[current];

    edges.forEach((edge) => {
      if (edge.from === current && edge.to !== '__initial__' && distances[edge.to] === undefined) {
        distances[edge.to] = currentDist + 1;
        queue.push(edge.to);
      }
    });
  }

  // Position nodes by distance level
  const levels = {};
  stateNodes.forEach((node) => {
    const dist = distances[node.id] ?? 0;
    if (!levels[dist]) levels[dist] = [];
    levels[dist].push(node.id);
  });

  const levelSpacing = 180;
  const nodeSpacing = 100;

  Object.entries(levels).forEach(([level, nodeIds]) => {
    const x = parseInt(level) * levelSpacing + 150;
    const startY = -((nodeIds.length - 1) * nodeSpacing) / 2;

    nodeIds.forEach((nodeId, idx) => {
      positions[nodeId] = { x, y: startY + idx * nodeSpacing };
    });
  });

  // Position initial pseudo-state to the left
  if (initialStateId && positions[initialStateId]) {
    positions['__initial__'] = {
      x: positions[initialStateId].x - 80,
      y: positions[initialStateId].y,
    };
  } else {
    positions['__initial__'] = { x: 50, y: 0 };
  }

  return positions;
}

// ===== Render Graph =====
function renderGraph() {
  if (!currentMachine || !currentMachineName) return;

  const config = machineConfigs[currentMachineName];
  if (!config) return;

  const { nodes, edges } = buildGraph(config, currentMachine.getState());
  const positions = calculateInitialPositions(nodes, edges);

  const container = document.getElementById('graph');

  // Update or create DataSets
  if (nodesDataSet && edgesDataSet && network) {
    // Preserve current node positions from the network
    const currentPositions = network.getPositions();

    // Apply preserved positions (or initial for new nodes)
    nodes.forEach((node) => {
      if (currentPositions[node.id]) {
        node.x = currentPositions[node.id].x;
        node.y = currentPositions[node.id].y;
      } else if (positions[node.id]) {
        node.x = positions[node.id].x;
        node.y = positions[node.id].y;
      }
    });

    // Update nodes in place (preserves view)
    nodesDataSet.update(nodes);

    // Only update edges if they changed
    const currentEdgeIds = edgesDataSet.getIds();
    const newEdgeIds = edges.map(e => e.id);
    if (JSON.stringify(currentEdgeIds.sort()) !== JSON.stringify(newEdgeIds.sort())) {
      edgesDataSet.clear();
      edgesDataSet.add(edges);
    }
  } else {
    // Apply initial positions for new network
    nodes.forEach((node) => {
      if (positions[node.id]) {
        node.x = positions[node.id].x;
        node.y = positions[node.id].y;
      }
    });
    // Create new network
    nodesDataSet = new vis.DataSet(nodes);
    edgesDataSet = new vis.DataSet(edges);

    const options = {
      layout: {
        hierarchical: false, // Free drag in all directions
      },
      physics: {
        enabled: false, // No automatic physics
      },
      interaction: {
        hover: true,
        selectConnectedEdges: false,
        dragNodes: true, // Allow dragging
        dragView: true, // Allow panning
        zoomView: true, // Allow zooming
      },
      nodes: {
        fixed: false,
      },
      edges: {
        width: 2,
        selectionWidth: 3,
        hoverWidth: 2.5,
      },
      manipulation: {
        enabled: false,
      },
    };

    network = new vis.Network(container, { nodes: nodesDataSet, edges: edgesDataSet }, options);

    // Click on edge to fire transition
    network.on('selectEdge', (params) => {
      if (params.edges.length === 1) {
        const edgeId = params.edges[0];
        const edge = edgesDataSet.get(edgeId);
        if (edge && edge.event && currentMachine.can(edge.event)) {
          currentMachine.send(edge.event);
          network.unselectAll();
        }
      }
    });

    // Double-click on node to show info
    network.on('doubleClick', (params) => {
      if (params.nodes.length === 1 && params.nodes[0] !== '__initial__') {
        const nodeId = params.nodes[0];
        const stateConfig = config.states[nodeId];
        if (stateConfig) {
          const transitions = stateConfig.on ? Object.keys(stateConfig.on).join(', ') : 'none';
          log(`State "${nodeId}" - transitions: ${transitions}`, 'system');
        }
      }
    });

    // Select node to show state details in left panel
    network.on('selectNode', (params) => {
      if (params.nodes.length === 1 && params.nodes[0] !== '__initial__') {
        showSelectedStateDetails(params.nodes[0]);
      }
    });

    // Deselect to hide state details
    network.on('deselectNode', () => {
      hideSelectedStateDetails();
    });
  }
}

// ===== Show/Hide Selected State Details =====
function showSelectedStateDetails(stateName) {
  const section = document.getElementById('selected-state-section');
  const details = document.getElementById('selected-state-details');

  if (!currentMachineName || !machineConfigs[currentMachineName]) return;

  const config = machineConfigs[currentMachineName];
  const stateConfig = config.states[stateName];
  const behavior = machineBehaviors[currentMachineName];

  if (!stateConfig) return;

  let html = `<div class="state-name">${stateName}</div>`;

  // Transitions
  if (stateConfig.on && Object.keys(stateConfig.on).length > 0) {
    html += `<div class="state-info"><strong>Transitions:</strong></div>`;
    html += `<ul class="state-info-list">`;
    for (const [event, target] of Object.entries(stateConfig.on)) {
      const targetState = typeof target === 'string' ? target : target.target;
      html += `<li>${event} → ${targetState}</li>`;
    }
    html += `</ul>`;
  }

  // Behaviors from state-centric format (behavior.states[stateName])
  const behaviorStateConfig = behavior?.states?.[stateName];
  if (behaviorStateConfig) {
    // entry
    if (behaviorStateConfig.entry) {
      html += `<div class="state-info"><strong>entry:</strong> ✓</div>`;
    }
    // exit
    if (behaviorStateConfig.exit) {
      html += `<div class="state-info"><strong>exit:</strong> ✓</div>`;
    }
    // after (timer)
    if (behaviorStateConfig.after) {
      const timer = behaviorStateConfig.after;
      html += `<div class="state-info"><strong>after:</strong> ${timer.send} after ${timer.delay}ms</div>`;
    }
  }

  // Is initial?
  if (config.initial === stateName) {
    html += `<div class="state-info"><strong>Initial state</strong></div>`;
  }

  // Is final?
  if (!stateConfig.on || Object.keys(stateConfig.on).length === 0) {
    html += `<div class="state-info"><strong>Final state</strong></div>`;
  }

  details.innerHTML = html;
  section.style.display = '';
}

function hideSelectedStateDetails() {
  document.getElementById('selected-state-section').style.display = 'none';
}

// ===== Helper: setValue only if changed, preserve scroll =====
function setValueIfChanged(cm, value) {
  if (cm.getValue() === value) return; // No change, skip
  const scrollInfo = cm.getScrollInfo();
  const cursor = cm.getCursor();
  cm.setValue(value);
  cm.scrollTo(scrollInfo.left, scrollInfo.top);
  cm.setCursor(cursor);
}

// ===== UI Update =====
function updateUI() {
  if (!currentMachine) return;

  document.getElementById('current-state').textContent = currentMachine.getState();
  document.getElementById('context').textContent = JSON.stringify(currentMachine.getContext(), null, 2);

  // Update JSON State tab (always update, it's the snapshot)
  const snapshotJson = JSON.stringify(currentMachine.toJSON(), null, 2);
  if (cmSnapshot) {
    setValueIfChanged(cmSnapshot, snapshotJson);
  } else {
    document.getElementById('snapshot').value = snapshotJson;
  }

  // Skip XState/FSM updates if user is editing (masterTab is set)
  if (masterTab) {
    // User is editing, don't overwrite their changes
    return updateTransitionsAndGraph();
  }

  // Update XState and FSM tabs (ignore changes during programmatic update)
  if (typeof ignoringChanges !== 'undefined') ignoringChanges = true;

  // Update XState Import tab with current machine's XState representation + behaviors
  if (currentMachineName && machineConfigs[currentMachineName]) {
    const behavior = machineBehaviors[currentMachineName];
    const xstateWithActions = toXStateWithActions(machineConfigs[currentMachineName], behavior);
    if (cmXState) {
      setValueIfChanged(cmXState, xstateWithActions);
      markClean('xstate', xstateWithActions);
    } else {
      document.getElementById('xstate-input').value = xstateWithActions;
    }
  }

  // Update FSM tab with current machine's behaviors
  if (currentMachineName && cmFSM) {
    const behavior = machineBehaviors[currentMachineName];
    let fsmCode;
    if (behavior) {
      fsmCode = formatBehaviorCode(currentMachineName, behavior);
    } else {
      fsmCode = `// No behaviors defined for "${currentMachineName}"\n// Add behaviors here:\nexport const ${currentMachineName} = {\n  onEnter: {},\n  onExit: {},\n  on: {},\n  timers: {},\n};`;
    }
    setValueIfChanged(cmFSM, fsmCode);
    markClean('fsm', fsmCode);
  }

  if (typeof ignoringChanges !== 'undefined') ignoringChanges = false;

  updateTransitionsAndGraph();
}

function updateTransitionsAndGraph() {

  // Update transition buttons
  const transitionsEl = document.getElementById('transitions');
  transitionsEl.innerHTML = '';
  for (const t of currentMachine.transitions()) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.textContent = t;
    btn.onclick = () => currentMachine.send(t);
    transitionsEl.appendChild(btn);
  }

  // Update force-to dropdown
  updateForceToDropdown();

  renderGraph();
}

// ===== Logging =====
function log(message, type = '') {
  const logEl = document.getElementById('event-log');
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
  logEl.appendChild(entry);
  logEl.scrollTop = logEl.scrollHeight;
}

// ===== Machine Selection =====
function selectMachine(name) {
  currentMachine = machines[name];
  currentMachineName = name;

  // Reset network for new machine
  if (network) {
    network.destroy();
    network = null;
    nodesDataSet = null;
    edgesDataSet = null;
  }

  updateUI();
  log(`Switched to ${name} machine`, 'system');
}

// ===== Panel Toggle =====
window.togglePanel = (side) => {
  const panel = document.getElementById(`${side}-panel`);
  panel.classList.toggle('hidden');
  const handle = panel.querySelector('.panel-handle');
  const isHidden = panel.classList.contains('hidden');

  if (side === 'bottom') {
    handle.textContent = isHidden ? '▲' : '▼';
  } else {
    handle.textContent = isHidden
      ? side === 'left' ? '▶' : '◀'
      : side === 'left' ? '◀' : '▶';
  }
};

// ===== Clear Log =====
window.clearLog = () => {
  document.getElementById('event-log').innerHTML = '';
  log('Log cleared', 'system');
};

// ===== IDE Tabs =====
let currentTab = 'fsm';

function switchTab(tabName) {
  // Prevent switching to disabled tab
  const tabEl = document.querySelector(`.ide-tab[data-tab="${tabName}"]`);
  if (tabEl?.classList.contains('disabled')) {
    return;
  }

  // Update active tab
  document.querySelectorAll('.ide-tab').forEach((t) => t.classList.remove('active'));
  tabEl?.classList.add('active');

  // Update active content
  document.querySelectorAll('.ide-tab-content').forEach((c) => c.classList.remove('active'));
  document.getElementById(`tab-${tabName}`)?.classList.add('active');

  // Update tab actions (show only the ones for this tab)
  document.querySelectorAll('.ide-tab-actions').forEach((actions) => {
    actions.style.display = actions.dataset.for === tabName ? 'flex' : 'none';
  });

  currentTab = tabName;

  // Refresh CodeMirror when tab becomes visible
  if (tabName === 'json-state' && cmSnapshot) {
    setTimeout(() => cmSnapshot.refresh(), 1);
  } else if (tabName === 'xstate' && cmXState) {
    setTimeout(() => cmXState.refresh(), 1);
  } else if (tabName === 'fsm' && cmFSM) {
    setTimeout(() => cmFSM.refresh(), 1);
  }
}

document.querySelectorAll('.ide-tab').forEach((tab) => {
  tab.onclick = () => {
    const tabName = tab.dataset.tab;
    if (tabName) switchTab(tabName);
  };
});

// ===== Copy/Paste for Current Tab =====
window.copyCurrentTab = async () => {
  let content = '';
  if (currentTab === 'json-state') {
    content = cmSnapshot ? cmSnapshot.getValue() : '';
  } else if (currentTab === 'xstate') {
    content = cmXState ? cmXState.getValue() : '';
  } else if (currentTab === 'fsm') {
    content = cmFSM ? cmFSM.getValue() : '';
  }
  await navigator.clipboard.writeText(content);
  log('Copied to clipboard', 'system');
};

window.pasteCurrentTab = async () => {
  const content = await navigator.clipboard.readText();
  if (currentTab === 'json-state') {
    if (cmSnapshot) {
      cmSnapshot.setValue(content);
    } else {
      document.getElementById('snapshot').value = content;
    }
    // Try to apply the pasted JSON state
    try {
      const state = JSON.parse(content);
      if (state.state && currentMachine) {
        currentMachine.restore(state);
        updateUI();
        log('State restored from clipboard', 'system');
      }
    } catch (e) {
      log('Invalid JSON - not applied', 'exit');
    }
  } else if (currentTab === 'xstate') {
    if (cmXState) {
      cmXState.setValue(content);
    } else {
      document.getElementById('xstate-input').value = content;
    }
  }
};

// ===== FSM State-Centric Templates =====
const fsmTemplates = {
  entry: `      entry: (ctx, { set, log }) => {
        set({ updated: true });
        log('Entered state');
      },`,
  exit: `      exit: (ctx, { log }) => {
        log('Exiting state');
      },`,
  on: `      on: {
        EVENT_NAME: 'targetState',
      },`,
  after: `      after: { delay: 2000, send: 'NEXT_EVENT' },`,
};

window.addCallbackTemplate = (type) => {
  if (!type || !fsmTemplates[type]) return;

  const machineName = currentMachineName || 'machine';
  const template = fsmTemplates[type]
    .replace(/\{\{machine\}\}/g, machineName)
    .replace(/\{\{state\}\}/g, '*');

  // Insert at cursor position in CodeMirror
  const cursor = cmFSM.getCursor();
  cmFSM.replaceRange('\n' + template + '\n', cursor);
  cmFSM.focus();
  log(`Added ${type} behavior template`, 'system');
};

// Legacy functions - redirect to new save/cancel
window.runFSM = () => saveChanges();
window.reloadFSM = () => cancelChanges();

// ===== Collapsible Sections =====
window.toggleSection = (id) => {
  const section = document.getElementById(id);
  section.classList.toggle('open');
};

// ===== Force Actions =====
window.forceReset = () => {
  currentMachine.send('FORCE_RESET', null, { force: true });
};

function updateForceToDropdown() {
  const select = document.getElementById('force-to-select');
  if (!select) return;

  const config = machineConfigs[currentMachineName];
  if (!config) {
    select.innerHTML = '<option value="" disabled selected>Force to</option>';
    return;
  }

  const currentState = currentMachine?.getState();
  const options = Object.keys(config.states)
    .filter((state) => state !== currentState)
    .map((state) => `<option value="${state}">${state}</option>`)
    .join('');

  select.innerHTML = `<option value="" disabled selected>Force to</option>${options}`;
}

window.forceToStateSelect = (state) => {
  if (!state) return;
  currentMachine.send('FORCE', null, { force: true, target: state });
  log(`Forced to state: ${state}`, 'transition');
  updateUI();
};

// ===== Snapshot Functions =====
window.copySnapshot = () => {
  navigator.clipboard.writeText(document.getElementById('snapshot').value);
  log('Snapshot copied to clipboard', 'system');
};

window.downloadSnapshot = () => {
  const blob = new Blob([document.getElementById('snapshot').value], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${currentMachineName}-snapshot.json`;
  a.click();
  URL.revokeObjectURL(url);
  log('Snapshot downloaded', 'system');
};

window.loadSnapshot = () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = (e) => {
    const file = e.target.files[0];
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const snapshot = JSON.parse(ev.target.result);
        currentMachine.restore(snapshot);
        updateUI();
        log('Snapshot loaded', 'system');
      } catch (err) {
        log(`Error loading snapshot: ${err.message}`, 'exit');
      }
    };
    reader.readAsText(file);
  };
  input.click();
};

// ===== XState Import =====
window.importXState = () => {
  try {
    const xstateValue = cmXState ? cmXState.getValue() : document.getElementById('xstate-input').value;
    const xstate = JSON.parse(xstateValue);
    const machineName = xstate.id || 'imported';
    const config = fromXState(xstate, {
      prefix: machineName,
      trackHistory: true,
    });

    // Store config for graph
    machineConfigs[machineName] = config;
    machines[machineName] = useMachine(kernel, config);

    // Add tab if not exists
    if (!document.querySelector(`[data-machine="${machineName}"]`)) {
      const tab = document.createElement('div');
      tab.className = 'machine-tab';
      tab.dataset.machine = machineName;
      tab.textContent = machineName;
      tab.onclick = () => selectMachine(machineName);
      document.getElementById('machine-tabs').appendChild(tab);
    }

    selectMachine(machineName);
    log(`XState machine "${machineName}" imported`, 'enter');
  } catch (err) {
    log(`Error importing XState: ${err.message}`, 'exit');
  }
};

// ===== Example Loading (state-centric format) =====
window.loadExample = async (name) => {
  const example = exampleConfigs[name];
  if (!example) return;

  // Reset dirty state before loading new example
  if (typeof clearMasterTab === 'function') {
    clearMasterTab();
  }

  // Hide selected state details
  hideSelectedStateDetails();

  try {
    const machineName = example.id;

    // Destroy CURRENT machine first (not just same-name machine)
    if (currentMachine?.destroy) {
      currentMachine.destroy();
      delete machines[currentMachineName];
    }

    // Also destroy if a machine with this name already exists
    if (machines[machineName]?.destroy) {
      machines[machineName].destroy();
    }

    // Create machine using createMachine with custom helpers
    // Built-in helpers: set, send, log (log defaults to console.log)
    // We override log to use the UI log function
    const machine = createMachine({
      ...example,
      helpers: {
        log: (msg) => {
          log(msg, 'enter');
          updateUI();
        },
      },
    });

    machines[machineName] = machine;

    // Store config for the editor/graph
    machineConfigs[machineName] = {
      prefix: machineName,
      initial: example.initial,
      context: example.context || {},
      trackHistory: true,
      states: Object.fromEntries(
        Object.entries(example.states).map(([name, cfg]) => [name, { on: cfg.on || {} }])
      ),
      _fullConfig: example,
    };

    // Store in machineBehaviors for backward compatibility with editor
    machineBehaviors[machineName] = example;

    // Select and display
    selectMachine(machineName);
    switchTab('fsm');
    log(`Loaded: ${machineName}`, 'enter');
  } catch (err) {
    log(`Error loading example: ${err.message}`, 'exit');
  }
};



// ===== Right Panel Resize =====
{
  const rightPanel = document.getElementById('right-panel');
  const resizeHandle = document.getElementById('right-resize-handle');
  let isResizing = false;
  let startX = 0;
  let startWidth = 0;

  if (resizeHandle) {
    resizeHandle.addEventListener('mousedown', (e) => {
      isResizing = true;
      startX = e.clientX;
      startWidth = rightPanel.offsetWidth;
      resizeHandle.classList.add('dragging');
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      const deltaX = startX - e.clientX;
      const newWidth = Math.min(Math.max(startWidth + deltaX, 200), window.innerWidth * 0.5);
      rightPanel.style.width = newWidth + 'px';
    });

    document.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        resizeHandle.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    });
  }
}

// ===== Bottom Panel Fullscreen =====
window.toggleFullscreen = () => {
  const bottomPanel = document.getElementById('bottom-panel');
  const leftPanel = document.getElementById('left-panel');
  const rightPanel = document.getElementById('right-panel');
  const btn = document.getElementById('fullscreen-btn');
  const iconExpand = btn.querySelector('.icon-expand');
  const iconCollapse = btn.querySelector('.icon-collapse');

  bottomPanel.classList.toggle('fullscreen');
  const isFullscreen = bottomPanel.classList.contains('fullscreen');

  // Collapse/expand side panels (keep header visible)
  if (isFullscreen) {
    bottomPanel.classList.remove('hidden'); // Ensure content is visible
    leftPanel.classList.add('collapsed');
    rightPanel.classList.add('collapsed');
    iconExpand.style.display = 'none';
    iconCollapse.style.display = '';
    btn.title = 'Exit fullscreen';
  } else {
    leftPanel.classList.remove('collapsed');
    rightPanel.classList.remove('collapsed');
    iconExpand.style.display = '';
    iconCollapse.style.display = 'none';
    btn.title = 'Fullscreen';
  }

  refreshAllEditors();
};

// Refresh all CodeMirror editors (call after resize or visibility change)
function refreshAllEditors() {
  setTimeout(() => {
    if (cmSnapshot) cmSnapshot.refresh();
    if (cmXState) cmXState.refresh();
    if (cmFSM) cmFSM.refresh();
  }, 10);
}

// Also refresh on window resize
window.addEventListener('resize', refreshAllEditors);

// ResizeObserver for bottom panel
const bottomPanelObserver = new ResizeObserver(refreshAllEditors);
bottomPanelObserver.observe(document.getElementById('bottom-panel'));

// ===== Initialize CodeMirror =====
const cmOptions = {
  theme: 'dracula',
  mode: { name: 'javascript', json: true },
  lineNumbers: true,
  lineWrapping: true,
  tabSize: 2,
  indentWithTabs: false,
  matchBrackets: true,
  autoCloseBrackets: true,
};

// Initialize snapshot editor (JSON)
cmSnapshot = CodeMirror.fromTextArea(document.getElementById('snapshot'), {
  ...cmOptions,
  readOnly: false,
});
cmSnapshot.setSize('100%', '100%');

// Initialize XState import editor (JSON)
cmXState = CodeMirror.fromTextArea(document.getElementById('xstate-input'), {
  ...cmOptions,
  readOnly: false,
});
cmXState.setSize('100%', '100%');

// Initialize FSM behaviors editor (JavaScript)
cmFSM = CodeMirror.fromTextArea(document.getElementById('fsm-editor'), {
  ...cmOptions,
  mode: 'javascript',
  readOnly: false,
});
cmFSM.setSize('100%', '100%');

// ===== Dirty State Tracking =====
let masterTab = null; // Which tab is being edited ('xstate' or 'fsm' or null)
let ignoringChanges = false; // Flag to ignore programmatic changes

// Store "clean" content for comparison
let cleanContent = {
  xstate: '',
  fsm: '',
};

function setMasterTab(tabName) {
  masterTab = tabName;
  const otherTab = tabName === 'xstate' ? 'fsm' : 'xstate';

  // Update tab styles
  const masterTabEl = document.querySelector(`.ide-tab[data-tab="${tabName}"]`);
  const otherTabEl = document.querySelector(`.ide-tab[data-tab="${otherTab}"]`);

  if (masterTabEl) {
    const baseName = tabName === 'xstate' ? 'XState' : 'FSM';
    masterTabEl.textContent = `${baseName} ●`;
    masterTabEl.classList.add('dirty');
    masterTabEl.classList.remove('disabled');
  }

  if (otherTabEl) {
    const baseName = otherTab === 'xstate' ? 'XState' : 'FSM';
    otherTabEl.textContent = baseName;
    otherTabEl.classList.remove('dirty');
    otherTabEl.classList.add('disabled');
  }

  // Disable the other editor
  if (tabName === 'xstate') {
    cmFSM.setOption('readOnly', true);
    cmXState.setOption('readOnly', false);
  } else {
    cmXState.setOption('readOnly', true);
    cmFSM.setOption('readOnly', false);
  }

  // Update button visibility
  updateEditButtons();
}

function clearMasterTab() {
  masterTab = null;

  // Reset both tabs
  ['xstate', 'fsm'].forEach(tabName => {
    const tabEl = document.querySelector(`.ide-tab[data-tab="${tabName}"]`);
    if (tabEl) {
      const baseName = tabName === 'xstate' ? 'XState' : 'FSM';
      tabEl.textContent = baseName;
      tabEl.classList.remove('dirty', 'disabled');
    }
  });

  // Enable both editors
  cmXState.setOption('readOnly', false);
  cmFSM.setOption('readOnly', false);

  // Update button visibility
  updateEditButtons();
}

function markClean(tabName, content) {
  cleanContent[tabName] = content;
}

function updateEditButtons() {
  const saveBtn = document.getElementById('save-btn');
  const cancelBtn = document.getElementById('cancel-btn');

  if (saveBtn && cancelBtn) {
    saveBtn.disabled = !masterTab;
    cancelBtn.disabled = !masterTab;
  }
}

// Track changes in XState editor
cmXState.on('change', () => {
  if (ignoringChanges || cmXState.getOption('readOnly')) return;
  const current = cmXState.getValue();
  if (current !== cleanContent.xstate) {
    if (!masterTab) setMasterTab('xstate');
  }
});

// Track changes in FSM editor
cmFSM.on('change', () => {
  if (ignoringChanges || cmFSM.getOption('readOnly')) return;
  const current = cmFSM.getValue();
  if (current !== cleanContent.fsm) {
    if (!masterTab) setMasterTab('fsm');
  }
});

// Save: Apply changes from master tab and regenerate other
window.saveChanges = () => {
  if (!masterTab || !currentMachineName) return;

  try {
    if (masterTab === 'fsm') {
      // Parse FSM and regenerate XState
      const code = cmFSM.getValue();
      const match = code.match(/export\s+(?:const|default)\s+(?:\w+\s*=\s*)?(\{[\s\S]*\});?\s*$/);
      if (!match) {
        log('Error: Could not parse FSM code', 'exit');
        return;
      }
      const behaviorObj = new Function(`return ${match[1]}`)();
      machineBehaviors[currentMachineName] = behaviorObj;

      // Regenerate XState
      const xstateCode = toXStateWithActions(machineConfigs[currentMachineName], behaviorObj);
      cmXState.setValue(xstateCode);
      markClean('xstate', xstateCode);
      markClean('fsm', code);

      log('FSM saved - XState regenerated', 'enter');
    } else {
      // Parse XState and regenerate FSM (simplified - just reload behaviors)
      // For now, XState → FSM conversion is not fully implemented
      // Just mark as clean
      const xstateCode = cmXState.getValue();
      markClean('xstate', xstateCode);

      // Regenerate FSM from current behaviors
      const fsmCode = formatBehaviorCode(currentMachineName, machineBehaviors[currentMachineName]);
      cmFSM.setValue(fsmCode);
      markClean('fsm', fsmCode);

      log('XState saved', 'enter');
    }

    clearMasterTab();
  } catch (err) {
    log(`Error saving: ${err.message}`, 'exit');
  }
};

// Cancel: Revert to clean version
window.cancelChanges = () => {
  if (!masterTab) return;

  if (masterTab === 'fsm') {
    cmFSM.setValue(cleanContent.fsm);
  } else {
    cmXState.setValue(cleanContent.xstate);
  }

  clearMasterTab();
  log('Changes cancelled', 'system');
};

// ===== Initialize =====
log('FSM Studio initialized', 'system');
// Load default example
loadExample('trafficLight');
