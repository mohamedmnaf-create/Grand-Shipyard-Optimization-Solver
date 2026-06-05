import { Block, Placement, Crane, Transporter, YardConfig, Solution, Score, Schedule } from '../types';
import { Yard, getDimensions } from './yard';
import { snapZToSupportingBlocks } from './metaheuristic';
import { GlobalObjectiveFunction } from './objective';

/**
 * 1. ENTROPY INJECTION ENGINE
 * Injects multi-level calibrated noise and spatial resets into placements.
 */
export class EntropyInjector {
  /**
   * Action 1: Micro Perturbation
   * Applies safe minor coordinate shifts, swaps, and 90-degree rotations.
   */
  static microPerturbation(placements: Placement[], blocks: Block[], yard: Yard): Placement[] {
    const copy = placements.map(p => ({ ...p }));
    const blockMap = new Map(blocks.map(b => [b.id, b]));
    
    // Choose 10-20% of placements randomly to perturb
    const count = Math.max(1, Math.floor(copy.length * 0.15));
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(Math.random() * copy.length);
      const pl = copy[idx];
      const block = blockMap.get(pl.blockId);
      if (!block) continue;

      const action = Math.random();
      if (action < 0.4) {
        // Safe small jitter (+-1 cell)
        const dx = Math.random() > 0.5 ? 1 : -1;
        const dy = Math.random() > 0.5 ? 1 : -1;
        
        const newX = Math.max(0, Math.min(yard.config.width - block.width, pl.x + dx));
        const newY = Math.max(0, Math.min(yard.config.length - block.length, pl.y + dy));
        
        pl.x = newX;
        pl.y = newY;
      } else if (action < 0.7) {
        // Minor orientation flip
        pl.orientation = pl.orientation === 0 ? 1 : 0;
      } else {
        // Random local swap if possible with another block
        const partnerIdx = Math.floor(Math.random() * copy.length);
        if (partnerIdx !== idx) {
          const partnerPl = copy[partnerIdx];
          const tempX = pl.x;
          const tempY = pl.y;
          const tempO = pl.orientation;
          
          pl.x = partnerPl.x;
          pl.y = partnerPl.y;
          pl.orientation = partnerPl.orientation;
          
          partnerPl.x = tempX;
          partnerPl.y = tempY;
          partnerPl.orientation = tempO;
          
          // Re-evaluate partner Z later
          partnerPl.z = snapZToSupportingBlocks(blockMap.get(partnerPl.blockId)!, partnerPl, copy, yard);
          partnerPl.stackedOn = partnerPl.z > 0 ? partnerPl.stackedOn : -1;
        }
      }
      
      // Snap Z to support structure safely
      pl.z = snapZToSupportingBlocks(block, pl, copy, yard);
      pl.stackedOn = pl.z > 0 ? pl.stackedOn : -1;
    }
    
    return copy;
  }

  /**
   * Action 2: Macro Shake
   * Selectively destroys 5-15% of placements and packs them greedily.
   */
  static macroShake(
    placements: Placement[],
    blocks: Block[],
    yard: Yard,
    optimizer: any,
    ratio = 0.12
  ): Placement[] {
    const copy = placements.map(p => ({ ...p }));
    const blockMap = new Map(blocks.map(b => [b.id, b]));
    
    const destroyCount = Math.max(2, Math.floor(copy.length * ratio));
    const destroyedIds: number[] = [];
    
    // Choose blocks randomly to destroy
    const remainingPlacements = [...copy];
    for (let i = 0; i < destroyCount; i++) {
      const idx = Math.floor(Math.random() * remainingPlacements.length);
      const plucked = remainingPlacements.splice(idx, 1)[0];
      if (plucked) destroyedIds.push(plucked.blockId);
    }
    
    const keptPlacements = copy.filter(p => !destroyedIds.includes(p.blockId));
    
    yard.clear();
    keptPlacements.forEach(kp => yard.addPlacement(kp));
    
    destroyedIds.forEach(id => {
      const b = blockMap.get(id);
      if (!b) return;
      
      const rep = optimizer.findBestPlacement(b, keptPlacements, 'BFD');
      if (rep) {
        keptPlacements.push(rep);
        yard.addPlacement(rep);
      } else {
        // Deterministic fallback
        const deterministicX = Math.floor((b.id * 17) % (yard.config.width - b.width + 1));
        const fallback: Placement = {
          blockId: b.id,
          x: deterministicX,
          y: 0,
          z: 0,
          orientation: 0,
          stackedOn: -1
        };
        keptPlacements.push(fallback);
        yard.addPlacement(fallback);
      }
    });
    
    return keptPlacements;
  }

  /**
   * Action 3: Phase Reset (Strong Escape)
   * Resets a spatial quadrant (25% of yard area) completely and repacks it.
   */
  static phaseReset(
    placements: Placement[],
    blocks: Block[],
    yard: Yard,
    optimizer: any
  ): Placement[] {
    const copy = placements.map(p => ({ ...p }));
    const blockMap = new Map(blocks.map(b => [b.id, b]));
    
    // Pick a random quadrant criteria
    const quadX0 = Math.random() < 0.5 ? 0 : yard.config.width / 2;
    const quadX1 = quadX0 + yard.config.width / 2;
    const quadY0 = Math.random() < 0.5 ? 0 : yard.config.length / 2;
    const quadY1 = quadY0 + yard.config.length / 2;
    
    const destroyedIds: number[] = [];
    
    for (const p of copy) {
      const b = blockMap.get(p.blockId);
      if (!b) continue;
      const aabb = yard.getAABB(b, p);
      
      // Check if overlapping quadrant boundaries
      if (
        aabb.xMin < quadX1 && aabb.xMax > quadX0 &&
        aabb.yMin < quadY1 && aabb.yMax > quadY0
      ) {
        destroyedIds.push(p.blockId);
      }
    }
    
    if (destroyedIds.length === 0) {
      // Fallback: destroy last 15% blocks
      destroyedIds.push(...copy.slice(-Math.max(1, Math.floor(copy.length * 0.15))).map(p => p.blockId));
    }
    
    const keptPlacements = copy.filter(p => !destroyedIds.includes(p.blockId));
    
    yard.clear();
    keptPlacements.forEach(kp => yard.addPlacement(kp));
    
    destroyedIds.forEach(id => {
      const b = blockMap.get(id);
      if (!b) return;
      
      const rep = optimizer.findBestPlacement(b, keptPlacements, 'BFD');
      if (rep) {
        keptPlacements.push(rep);
        yard.addPlacement(rep);
      } else {
        const fallX = Math.floor((b.id * 23) % (yard.config.width - b.width + 1));
        const fallback: Placement = {
          blockId: b.id,
          x: fallX,
          y: 0,
          z: 0,
          orientation: 0,
          stackedOn: -1
        };
        keptPlacements.push(fallback);
        yard.addPlacement(fallback);
      }
    });
    
    return keptPlacements;
  }

  /**
   * Action 4: Full Structural Rebalance
   * Reinitializes only packing layouts entirely via alternative heuristic strategy.
   */
  static fullStructuralRebalance(blocks: Block[], optimizer: any): Placement[] {
    const strategies = ['GreedyVolume', 'GreedyCritical', 'BFD', 'FFD'];
    const selectedStrategy = strategies[Math.floor(Math.random() * strategies.length)];
    return optimizer.solveInitialPacking(blocks, selectedStrategy);
  }
}

/**
 * 2. ADVERSARIAL MUTATION GENERATOR
 * Generates stress test perturbations designed to isolate and test structural system bottlenecks.
 */
export class AdversarialMutator {
  /**
   * Type A: Congestion Spike Injection
   * Shifts placements to stack highly heavy blocks densely in a tight spatial sector,
   * triggering high localized packing footprint density and potential crane limits.
   */
  static injectCongestionSpike(placements: Placement[], blocks: Block[], yard: Yard): Placement[] {
    const copy = placements.map(p => ({ ...p }));
    const blockMap = new Map(blocks.map(b => [b.id, b]));
    
    // Sort blocks descending by weight to pick heavy blocks
    const heavyBlockIds = [...blocks]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, Math.max(1, Math.floor(blocks.length * 0.3)))
      .map(b => b.id);
      
    // Co-locate heavy blocks together in a small region, e.g. center
    const targetSectorX = yard.config.width / 2;
    const targetSectorY = yard.config.length / 2;
    
    copy.forEach(pl => {
      if (heavyBlockIds.includes(pl.blockId)) {
        const b = blockMap.get(pl.blockId);
        if (!b) return;
        
        // Jitter coordinate closely tightly grouped inside the sector
        const jitterX = Math.floor((Math.random() - 0.5) * 4);
        const jitterY = Math.floor((Math.random() - 0.5) * 4);
        
        pl.x = Math.max(0, Math.min(yard.config.width - b.width, Math.round(targetSectorX + jitterX)));
        pl.y = Math.max(0, Math.min(yard.config.length - b.length, Math.round(targetSectorY + jitterY)));
        pl.z = snapZToSupportingBlocks(b, pl, copy, yard);
        pl.stackedOn = pl.z > 0 ? pl.stackedOn : -1;
      }
    });
    
    return copy;
  }

  /**
   * Type B: Dependency Chain Stress
   * Alters layout positions of dependency-bound blocks to stretch schedules,
   * testing if scheduling heuristics can compress chains back.
   */
  static injectDependencyChainStress(placements: Placement[], blocks: Block[], yard: Yard): Placement[] {
    const copy = placements.map(p => ({ ...p }));
    const blockMap = new Map(blocks.map(b => [b.id, b]));
    
    // Locate critical path / deep dependency chain blocks
    const deepChainBlocks = [...blocks]
      .filter(b => b.dependencies.length > 0 || b.dependencyDepth > 1)
      .slice(0, Math.max(1, Math.floor(blocks.length * 0.3)));
      
    // Force dependency ancestors and decendants apart spatially to maximize transport time
    deepChainBlocks.forEach(b => {
      const pl = copy.find(p => p.blockId === b.id);
      if (!pl) return;
      
      // Displace to distant boundary regions of layout yard
      if (b.id % 2 === 0) {
        pl.x = 0;
        pl.y = 0;
      } else {
        pl.x = Math.max(0, yard.config.width - b.width);
        pl.y = Math.max(0, yard.config.length - b.length);
      }
      pl.z = snapZToSupportingBlocks(b, pl, copy, yard);
      pl.stackedOn = pl.z > 0 ? pl.stackedOn : -1;
    });
    
    return copy;
  }

  /**
   * Type C: Spatial Bottleneck Formation
   * Constrains available layout workspace, forcing blocks to pack with high density.
   */
  static applySpatialBottleneck(placements: Placement[], blocks: Block[], yard: Yard): Placement[] {
    const copy = placements.map(p => ({ ...p }));
    const blockMap = new Map(blocks.map(b => [b.id, b]));
    
    // Narrow down x-bounds to mimic limited hallway footprint (compression)
    const compressedWidthMax = yard.config.width * 0.65;
    
    copy.forEach(pl => {
      const b = blockMap.get(pl.blockId);
      if (!b) return;
      
      if (pl.x + b.width > compressedWidthMax) {
        pl.x = Math.max(0, Math.floor(compressedWidthMax - b.width - Math.random() * 3));
        pl.z = snapZToSupportingBlocks(b, pl, copy, yard);
        pl.stackedOn = pl.z > 0 ? pl.stackedOn : -1;
      }
    });
    
    return copy;
  }
}

/**
 * 3. NONLINEAR OBJECTIVE RESHAPER
 * Substitutes flat scoring metrics with non-linear curvature penalizations.
 */
export class NonlinearObjectiveShaper {
  /**
   * Evaluates layout structures under curvature-aware structural metrics.
   * Exponential Congestion Penalty grows rapidly when regional block packing density climbs.
   */
  static shapeScore(
    base: Score,
    placements: Placement[],
    blocks: Block[],
    yard: Yard,
    config: YardConfig
  ): Score {
    const reshaped = { ...base };
    
    // Calculate local spatial density in 3D grid sub-blocks (e.g., 5x5 subgrid)
    const gridSize = 5;
    const widthCell = config.width / gridSize;
    const lengthCell = config.length / gridSize;
    
    const densityMap = new Array(gridSize * gridSize).fill(0);
    const blockMap = new Map(blocks.map(b => [b.id, b]));
    
    placements.forEach(p => {
      const b = blockMap.get(p.blockId);
      if (!b) return;
      
      const cx = Math.min(gridSize - 1, Math.floor(p.x / widthCell));
      const cy = Math.min(gridSize - 1, Math.floor(p.y / lengthCell));
      densityMap[cx + cy * gridSize]++;
    });
    
    // Exponential local layout congestion penalty (e^k)
    let exponentialCongestionPenalty = 0;
    densityMap.forEach(count => {
      if (count > 2) {
        exponentialCongestionPenalty += Math.exp(count) * 0.45;
      }
    });
    
    // Apply curvature modulation to total score
    reshaped.totalScore = Math.round(reshaped.totalScore - exponentialCongestionPenalty);
    
    return reshaped;
  }
}

/**
 * 4. STAGNATION DETECTION SYSTEM
 * Monitors progress rates, operator search entropy levels, and elite pool clustering.
 */
export class StagnationDetector {
  private history: number[] = [];
  
  recordIteration(score: number) {
    this.history.push(score);
    if (this.history.length > 50) {
      this.history.shift();
    }
  }
  
  clearHistory() {
    this.history = [];
  }

  detectState(
    stagnationCount: number,
    operatorStats: any,
    elitePoolCount: number
  ): 'STABLE' | 'DEGENERATING' | 'COLLAPSING' {
    if (stagnationCount >= 18) {
      return 'COLLAPSING';
    }
    
    if (stagnationCount >= 8) {
      return 'DEGENERATING';
    }
    
    // Calculate sliding slope of historical score differences
    if (this.history.length >= 10) {
      const startVal = this.history[this.history.length - 10];
      const endVal = this.history[this.history.length - 1];
      const delta = endVal - startVal;
      
      if (delta <= 1e-3) {
        return 'DEGENERATING';
      }
    }
    
    return 'STABLE';
  }
}

/**
 * 5. SEARCH DIVERSITY CONTROLLER
 * Verifies solutions preserve Hamming-boundary distances to enforce elite variety.
 */
export class DiversityController {
  /**
   * Calculates Hamming-style configuration distances between two structural layouts.
   */
  static getHammingDistance(sol1: Solution, sol2: Solution): number {
    let diffs = 0;
    const len = Math.max(sol1.placements.length, 1);
    
    sol1.placements.forEach(p1 => {
      const p2 = sol2.placements.find(p => p.blockId === p1.blockId);
      if (!p2) {
        diffs++;
        return;
      }
      
      const xDiff = Math.abs(p1.x - p2.x);
      const yDiff = Math.abs(p1.y - p2.y);
      const zDiff = Math.abs(p1.z - p2.z);
      const oDiff = p1.orientation !== p2.orientation ? 1 : 0;
      
      if (xDiff > 1.0 || yDiff > 1.0 || zDiff > 0.1 || oDiff > 0) {
        diffs++;
      }
    });
    
    return diffs / len;
  }

  /**
   * Determines if a candidate layout preserves sufficient Hamming spacing from the elite pool.
   */
  static isSufficientlyDiverse(sol: Solution, pool: Solution[], threshold = 0.08): boolean {
    if (pool.length === 0) return true;
    
    // Must be at least threshold % distinct compared to all stored configurations
    return pool.every(elite => this.getHammingDistance(sol, elite) >= threshold);
  }
}

/**
 * 6. GLOBAL ESCAPE ORCHESTRATOR
 * Orchestrates local searches, entropy resets, and mutations based on current stagnation levels.
 */
export class EscapeOrchestrator {
  static perturb(
    solution: Solution,
    state: 'STABLE' | 'DEGENERATING' | 'COLLAPSING',
    blocks: Block[],
    yard: Yard,
    optimizer: any
  ): Solution {
    let placements = solution.placements.map(p => ({ ...p }));
    
    if (state === 'DEGENERATING') {
      // Small to medium jitter shakeups
      const roll = Math.random();
      if (roll < 0.5) {
        placements = EntropyInjector.microPerturbation(placements, blocks, yard);
      } else {
        placements = EntropyInjector.macroShake(placements, blocks, yard, optimizer, 0.10);
      }
    } else if (state === 'COLLAPSING') {
      // Strong phase resets or adversarial mutation to shake stuck state topologies
      const roll = Math.random();
      if (roll < 0.3) {
        placements = EntropyInjector.phaseReset(placements, blocks, yard, optimizer);
      } else if (roll < 0.6) {
        placements = AdversarialMutator.applySpatialBottleneck(placements, blocks, yard);
      } else if (roll < 0.8) {
        placements = AdversarialMutator.injectCongestionSpike(placements, blocks, yard);
      } else {
        placements = EntropyInjector.fullStructuralRebalance(blocks, optimizer);
      }
    }
    
    return {
      placements,
      schedule: solution.schedule,
      score: { ...solution.score }
    };
  }
}

/**
 * 7. ELITE LANDSCAPE SHAKING
 * Slightly distorts elite neighbors' coordinate geometries to probe adjacent optimal energy valleys.
 */
export function EliteLandscapeShake(
  pool: Solution[],
  yard: Yard,
  blocks: Block[],
  cranes: Crane[],
  transporters: Transporter[],
  scheduler: any,
  scorer: any
): void {
  // Never perturb the champion (index 0)
  if (pool.length < 2) return;
  
  for (let s = 1; s < pool.length; s++) {
    const currentElite = pool[s];
    // Apply 5% minor spatial mutation to distort the layout geometry
    const mutatedPlacements = EntropyInjector.microPerturbation(currentElite.placements, blocks, yard);
    
    // Evaluate mutated layout
    const schedule = scheduler.generateSchedule(mutatedPlacements);
    const score = scorer.evaluate(mutatedPlacements, schedule);
    
    // If the mutated variant is valid and doesn't collapse, update this elite candidate position
    const valid = yard.blocks && [...yard.blocks.values()].every(b => {
      const pl = mutatedPlacements.find(p => p.blockId === b.id);
      if (!pl) return false;
      return !yard.isOutOfBounds(b, pl) && yard.getCollisions(b, pl).length === 0;
    });
    
    if (valid && score.totalScore > currentElite.score.totalScore - 150) {
      pool[s] = {
        placements: mutatedPlacements,
        schedule,
        score
      };
    }
  }
}
