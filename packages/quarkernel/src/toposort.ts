/**
 * Internal topological sort implementation
 * Kahn's algorithm for dependency resolution with cycle detection
 */

export interface TopoNode {
  id: string;
  after: string[];
}

export class CyclicDependencyError extends Error {
  constructor(
    public readonly cycle: string[]
  ) {
    super(`Cyclic dependency detected: ${cycle.join(' -> ')}`);
    this.name = 'CyclicDependencyError';
  }
}

/**
 * Topologically sort nodes by their dependencies
 * @param nodes - Array of nodes with id and after (dependencies) fields
 * @returns Sorted array of node IDs respecting dependency order
 * @throws CyclicDependencyError if circular dependencies exist
 */
export const toposort = (nodes: TopoNode[]): string[] => {
  // Build adjacency list and in-degree map
  const graph = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  const allNodes = new Set<string>();

  // Initialize all nodes
  nodes.forEach(node => {
    allNodes.add(node.id);
    if (!graph.has(node.id)) {
      graph.set(node.id, []);
    }
    if (!inDegree.has(node.id)) {
      inDegree.set(node.id, 0);
    }
  });

  // Build graph edges and calculate in-degrees
  nodes.forEach(node => {
    node.after.forEach(dep => {
      // Add dependency node if not already in the graph
      if (!allNodes.has(dep)) {
        allNodes.add(dep);
        graph.set(dep, []);
        inDegree.set(dep, 0);
      }

      // Add edge: dep -> node.id
      graph.get(dep)!.push(node.id);
      inDegree.set(node.id, (inDegree.get(node.id) || 0) + 1);
    });
  });

  // Kahn's algorithm: start with nodes that have no dependencies
  const queue: string[] = [];
  const result: string[] = [];

  allNodes.forEach(id => {
    if (inDegree.get(id) === 0) {
      queue.push(id);
    }
  });

  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);

    // Reduce in-degree for all dependent nodes
    const neighbors = graph.get(current) || [];
    neighbors.forEach(neighbor => {
      const newDegree = inDegree.get(neighbor)! - 1;
      inDegree.set(neighbor, newDegree);

      if (newDegree === 0) {
        queue.push(neighbor);
      }
    });
  }

  // If not all nodes are processed, there's a cycle
  if (result.length !== allNodes.size) {
    const remaining = Array.from(allNodes).filter(id => !result.includes(id));
    const cycle = detectCycle(remaining, graph);
    throw new CyclicDependencyError(cycle);
  }

  // Return only the IDs that were in the original input
  return result.filter(id => nodes.some(n => n.id === id));
};

/**
 * Detect and extract a cycle from the dependency graph
 */
const detectCycle = (remaining: string[], graph: Map<string, string[]>): string[] => {
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const path: string[] = [];

  const dfs = (node: string): boolean => {
    visited.add(node);
    recStack.add(node);
    path.push(node);

    const neighbors = graph.get(node) || [];
    for (const neighbor of neighbors) {
      if (!remaining.includes(neighbor)) continue;

      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) return true;
      } else if (recStack.has(neighbor)) {
        // Found cycle
        return true;
      }
    }

    recStack.delete(node);
    path.pop();
    return false;
  };

  for (const node of remaining) {
    if (!visited.has(node)) {
      if (dfs(node)) {
        return [...path];
      }
    }
  }

  // Fallback - return remaining nodes
  return remaining;
};
