import { Block, Placement, Crane, YardConfig } from '../types';
import { Yard, getDimensions } from './yard';

export class PackingOptimizer {
  yard: Yard;
  config: YardConfig;
  cranes: Crane[];
  blockDelays: Map<number, number> | null = null; // High-fidelity coupled feedback delay metrics

  constructor(config: YardConfig, blocks: Block[], cranes: Crane[]) {
    this.yard = new Yard(config, blocks);
    this.config = config;
    this.cranes = cranes;
  }

  // Set the structural schedule feedback loops from metaheuristics
  setFeedbackDelays(delays: Map<number, number> | null) {
    this.blockDelays = delays;
  }

  // Generates initial 3D packed placements using the specified strategy
  solveInitialPacking(blocks: Block[], strategy: string): Placement[] {
    this.yard.clear();
    const sorted = [...blocks];
    
    // Sort logic to match corresponding heuristic
    if (strategy === 'FFD' || strategy === 'BFD') {
      // Sort descending by volume
      sorted.sort((a, b) => b.volume - a.volume);
    } else if (strategy === 'GreedyVolume') {
      sorted.sort((a, b) => b.volume - a.volume);
    } else if (strategy === 'GreedyCritical') {
      sorted.sort((a, b) => b.criticalityScore - a.criticalityScore);
    }

    const placements: Placement[] = [];

    for (const block of sorted) {
      const placement = this.findBestPlacement(block, placements, strategy);
      if (placement) {
        this.yard.addPlacement(placement);
        placements.push(placement);
      } else {
        // Fallback: Force a default position at ground, flagging collision for repair engine
        const fallback: Placement = {
          blockId: block.id,
          x: Math.min(block.id * 3, this.config.width - block.width),
          y: 0,
          z: 0,
          orientation: 0,
          stackedOn: -1
        };
        this.yard.addPlacement(fallback);
        placements.push(fallback);
      }
    }

    return placements;
  }

  // Find a valid placement using a discretized grid search of candidate Anchor Points
  findBestPlacement(block: Block, currentPlacements: Placement[], strategy: string): Placement | null {
    // Collect candidate anchor coordinates (x, y, z)
    // Anchors are: (0,0,0) or corners of currently placed blocks
    const candidatePoints: { x: number; y: number; z: number }[] = [{ x: 0, y: 0, z: 0 }];

    currentPlacements.forEach(pl => {
      const b2 = this.yard.blocks.get(pl.blockId);
      if (!b2) return;
      const { w: w2, l: l2, h: h2 } = getDimensions(b2, pl.orientation);
      
      // Right edge anchor
      candidatePoints.push({ x: pl.x + w2, y: pl.y, z: pl.z });
      // Top edge anchor
      candidatePoints.push({ x: pl.x, y: pl.y + l2, z: pl.z });
      // Stack on top anchor
      candidatePoints.push({ x: pl.x, y: pl.y, z: pl.z + h2 });
      // Corner anchor
      candidatePoints.push({ x: pl.x + w2, y: pl.y + l2, z: pl.z });
    });

    let bestPlacement: Placement | null = null;
    let bestScore = -Infinity;

    // Filter and evaluate each candidate point
    for (const pt of candidatePoints) {
      for (const orientation of [0, 1]) {
        const testPlacement: Placement = {
          blockId: block.id,
          x: pt.x,
          y: pt.y,
          z: pt.z,
          orientation,
          stackedOn: pt.z > 0 ? this.findBlockAtCoords(pt.x, pt.y, pt.z - 0.05) : -1
        };

        // 1. Hard Boundaries & Collision Free Checking
        if (this.yard.isOutOfBounds(block, testPlacement)) continue;
        const collisions = this.yard.getCollisions(block, testPlacement);
        if (collisions.length > 0) continue;

        // 2. Continuous Stacking support check
        const support = this.yard.getSupportStrength(block, testPlacement);
        if (support.percentage < 0.6) continue; // Must have at least 60% flat support underneath

        // 3. Evaluate criteria
        const evalScore = this.evaluatePlacement(block, testPlacement, support.percentage);
        
        if (strategy === 'FFD') {
          // First Fit: return immediate valid placement
          return testPlacement;
        }

        if (evalScore > bestScore) {
          bestScore = evalScore;
          bestPlacement = testPlacement;
        }
      }
    }

    return bestPlacement;
  }

  findBlockAtCoords(x: number, y: number, z: number): number {
    for (const [id, pl] of this.yard.placements.entries()) {
      const b = this.yard.blocks.get(id);
      if (!b) continue;
      const { w, l, h } = getDimensions(b, pl.orientation);
      if (
        x >= pl.x && x <= pl.x + w &&
        y >= pl.y && y <= pl.y + l &&
        z >= pl.z && z <= pl.z + h
      ) {
        return id;
      }
    }
    return -1;
  }

  // Evaluates placement quality
  evaluatePlacement(block: Block, placement: Placement, supportPercentage: number): number {
    // Dynamic coupled feedback multipliers from operational scheduler delays
    const delay = this.blockDelays?.get(block.id) || 0;
    const delayMultiplier = 1.0 + (delay / 15.0); // Amplifies penalties for critical items
    
    const compactFactor = -0.1 * (placement.x + placement.y) * delayMultiplier; // prefer closer to gate (0,0)
    const heightPenalty = -0.5 * placement.z * delayMultiplier; // prefer lower z unless needed
    const stabilityBonus = 2.0 * supportPercentage;

    // Crane Reachability
    let reachScore = 0;
    const { w, l } = getDimensions(block, placement.orientation);
    const blockCenter = {
      x: placement.x + w / 2,
      y: placement.y + l / 2,
    };

    for (const crane of this.cranes) {
      const dx = blockCenter.x - crane.x;
      const dy = blockCenter.y - crane.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= crane.reach && crane.capacity >= block.weight) {
        reachScore += 5.0 * (1.0 - dist / crane.reach); // Closer to center is easier
      }
    }

    if (reachScore === 0) {
      // Cranes can't lift this block here
      reachScore -= 20.0;
    }

    return compactFactor + heightPenalty + stabilityBonus + reachScore;
  }

  // Neighborhood Operator: Relocate
  mutateRelocate(placements: Placement[], blockId: number): Placement[] {
    const copy = placements.map(p => ({ ...p }));
    const targetIdx = copy.findIndex(p => p.blockId === blockId);
    if (targetIdx === -1) return placements;

    const block = this.yard.blocks.get(blockId);
    if (!block) return placements;

    // Temp remove from yard to avoid self-collisions
    this.yard.removePlacement(blockId);
    
    // Find a new random or best candidate spot inside the yard
    const rx = Math.floor(Math.random() * (this.config.width - block.width));
    const ry = Math.floor(Math.random() * (this.config.length - block.length));
    const newPl: Placement = {
      ...copy[targetIdx],
      x: rx,
      y: ry,
      z: 0,
      orientation: Math.random() > 0.5 ? 1 : 0,
      stackedOn: -1
    };

    if (!this.yard.isOutOfBounds(block, newPl) && this.yard.getCollisions(block, newPl).length === 0) {
      copy[targetIdx] = newPl;
    }

    this.yard.addPlacement(copy[targetIdx]);
    return copy;
  }

  // Neighborhood Operator: Swap
  mutateSwap(placements: Placement[], b1Id: number, b2Id: number): Placement[] {
    const copy = placements.map(p => ({ ...p }));
    const idx1 = copy.findIndex(p => p.blockId === b1Id);
    const idx2 = copy.findIndex(p => p.blockId === b2Id);
    if (idx1 === -1 || idx2 === -1) return placements;

    const x1 = copy[idx1].x;
    const y1 = copy[idx1].y;
    const z1 = copy[idx1].z;
    const o1 = copy[idx1].orientation;

    copy[idx1].x = copy[idx2].x;
    copy[idx1].y = copy[idx2].y;
    copy[idx1].z = copy[idx2].z;
    copy[idx1].orientation = copy[idx2].orientation;

    copy[idx2].x = x1;
    copy[idx2].y = y1;
    copy[idx2].z = z1;
    copy[idx2].orientation = o1;

    return copy;
  }

  // Neighborhood Operator: Rotate
  mutateRotate(placements: Placement[], blockId: number): Placement[] {
    const copy = placements.map(p => ({ ...p }));
    const targetIdx = copy.findIndex(p => p.blockId === blockId);
    if (targetIdx === -1) return placements;
    copy[targetIdx].orientation = copy[targetIdx].orientation === 0 ? 1 : 0;
    return copy;
  }
}
