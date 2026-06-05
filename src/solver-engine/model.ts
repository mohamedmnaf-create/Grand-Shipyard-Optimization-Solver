import { Block } from '../types';

export function preprocessBlocks(blocksData: any[]): Block[] {
  // First, extract features for each raw block
  const preprocessed: Block[] = blocksData.map(b => {
    const volume = b.width * b.height * b.length;
    const footprint = b.width * b.length;
    const density = b.weight / volume;
    
    let weightClass: 'Light' | 'Medium' | 'Heavy' | 'Ultra' = 'Light';
    if (b.weight > 50) weightClass = 'Ultra';
    else if (b.weight > 20) weightClass = 'Heavy';
    else if (b.weight > 5) weightClass = 'Medium';

    return {
      id: b.id,
      width: b.width,
      height: b.height,
      length: b.length,
      weight: b.weight,
      dueDate: b.dueDate,
      dependencies: b.dependencies || [],
      volume,
      density,
      footprint,
      weightClass,
      criticalityScore: 0, // Computed dynamically during DAG processing
      dependencyDepth: 0,  // Computed dynamically
    };
  });

  // Build dependency adjacency lists & back references
  const adj: Map<number, number[]> = new Map();
  const backAdj: Map<number, number[]> = new Map();
  const nodeMap = new Map(preprocessed.map(b => [b.id, b]));

  preprocessed.forEach(b => {
    adj.set(b.id, []);
    backAdj.set(b.id, []);
  });

  preprocessed.forEach(b => {
    b.dependencies.forEach(depId => {
      // depId is a blocker. b depends on depId. So depId must finish BEFORE b.
      // Arrow is depId -> b
      if (adj.has(depId)) {
        adj.get(depId)!.push(b.id);
      }
      if (backAdj.has(b.id)) {
        backAdj.get(b.id)!.push(depId);
      }
    });
  });

  // 1. Cycle detection & Topological Sort (Kahn's or DFS)
  const sortedIds = topologicalSort(preprocessed, backAdj, adj);

  // 2. Compute Dependency Depth & Criticality Score
  // Depth of a node: max chain of dependencies before it
  const depthCache = new Map<number, number>();
  function calculateDepth(id: number): number {
    if (depthCache.has(id)) return depthCache.get(id)!;
    const deps = backAdj.get(id) || [];
    if (deps.length === 0) {
      depthCache.set(id, 0);
      return 0;
    }
    const maxSubDepth = Math.max(...deps.map(calculateDepth));
    const currentDepth = maxSubDepth + 1;
    depthCache.set(id, currentDepth);
    return currentDepth;
  }

  preprocessed.forEach(b => {
    b.dependencyDepth = calculateDepth(b.id);
  });

  // Criticality calculations based on topological orders & due dates
  // Root dependencies (nodes with no outbound blocker) vs leaves
  const criticality = new Map<number, number>();
  // Process reverse topological order for criticality propagation
  const revSorted = [...sortedIds].reverse();
  revSorted.forEach(id => {
    const block = nodeMap.get(id);
    if (!block) return;
    
    // Base criticality is inversely proportional to due date plus a scale weight factor
    const baseCrit = 1000 / (block.dueDate + 1) + (block.weight / 10);
    
    // Propagate criticality to dependencies: dependency criticality is base + max of downstream dependent criticalities
    const dependents = adj.get(id) || [];
    const childMaxCrit = dependents.reduce((max, childId) => {
      return Math.max(max, criticality.get(childId) || 0);
    }, 0);
    
    const nodeCrit = baseCrit + childMaxCrit * 0.8;
    criticality.set(id, nodeCrit);
    block.criticalityScore = Math.round(nodeCrit * 10) / 10;
  });

  return preprocessed;
}

// Topological Sort implementation helper
function topologicalSort(blocks: Block[], backAdj: Map<number, number[]>, adj: Map<number, number[]>): number[] {
  const inDegree = new Map<number, number>();
  blocks.forEach(b => {
    inDegree.set(b.id, (backAdj.get(b.id) || []).length);
  });

  const queue: number[] = [];
  inDegree.forEach((deg, id) => {
    if (deg === 0) queue.push(id);
  });

  const sorted: number[] = [];
  while (queue.length > 0) {
    // Sort queue to be deterministic or prioritize heavier blocks
    queue.sort((a, b) => b - a); // Stable standard order
    const curr = queue.shift()!;
    sorted.push(curr);

    const dependents = adj.get(curr) || [];
    dependents.forEach(dep => {
      const degree = inDegree.get(dep)! - 1;
      inDegree.set(dep, degree);
      if (degree === 0) {
        queue.push(dep);
      }
    });
  }

  // If we couldn't sort everything, there was a cycle.
  if (sorted.length < blocks.length) {
    // Return standard sorted as backup, resolving loops gracefully
    console.warn("Cycle detected in Shipyard Dependency Graph! Resolving gracefully.");
    const remaining = blocks.map(b => b.id).filter(id => !sorted.includes(id));
    return [...sorted, ...remaining];
  }

  return sorted;
}

// Sorting strategies for initial state construction
export function sortBlocks(blocks: Block[], strategy: string): Block[] {
  const sorted = [...blocks];
  switch (strategy) {
    case 'Volume':
      return sorted.sort((a, b) => b.volume - a.volume);
    case 'Weight':
      return sorted.sort((a, b) => b.weight - a.weight);
    case 'Deadline':
      return sorted.sort((a, b) => a.dueDate - b.dueDate || b.criticalityScore - a.criticalityScore);
    case 'Depth':
      return sorted.sort((a, b) => b.dependencyDepth - a.dependencyDepth || a.dueDate - b.dueDate);
    case 'Criticality':
      return sorted.sort((a, b) => b.criticalityScore - a.criticalityScore);
    default:
      return sorted;
  }
}
