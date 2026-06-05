import { Block, Placement, YardConfig, Schedule, Score, Solution } from '../types';

export enum RegimeType {
  PACKING_DOMINANT = 'PACKING_DOMINANT',
  SCHEDULING_DOMINANT = 'SCHEDULING_DOMINANT',
  RESOURCE_CONGESTED = 'RESOURCE_CONGESTED',
  DEPENDENCY_HEAVY = 'DEPENDENCY_HEAVY',
  BALANCED = 'BALANCED',
  ADVERSARIAL_TIGHT = 'ADVERSARIAL_TIGHT'
}

export enum StrategyProfile {
  PACKING_MODE = 'PACKING_MODE',
  SCHEDULING_MODE = 'SCHEDULING_MODE',
  CONGESTION_MODE = 'CONGESTION_MODE',
  BALANCED_MODE = 'BALANCED_MODE'
}

export enum SearchPhase {
  EXPLORATION = 'EXPLORATION',
  EXPLOITATION = 'EXPLOITATION',
  COMPRESSION = 'COMPRESSION',
  ESCAPE = 'ESCAPE',
  STABILIZATION = 'STABILIZATION'
}

/**
 * 1. PROBLEM REGIME DETECTOR
 * Mentally inspects active yard configurations, crane availability, and dependencies
 * to yield a structural categorization of the optimization instance.
 */
export class ProblemRegimeDetector {
  static analyze(
    blocks: Block[],
    placements: Placement[],
    schedule: Schedule,
    config: YardConfig,
    cranesCount: number,
    transportersCount: number
  ): { type: RegimeType; confidence: number } {
    // 1. Block density ratio
    const totalVolume = Math.max(1, config.width * config.length * config.maxHeight);
    const packedVolume = blocks.reduce((acc, b) => acc + (b.volume || b.width * b.length * b.height), 0);
    const densityRatio = packedVolume / totalVolume;

    // 2. Average block size variance
    const avgVolume = packedVolume / (blocks.length || 1);
    const sumSqDiff = blocks.reduce((acc, b) => acc + Math.pow((b.volume || b.width * b.length * b.height) - avgVolume, 2), 0);
    const variance = sumSqDiff / (blocks.length || 1);

    // 3. Dependency DAG depth
    const maxDepth = blocks.reduce((max, b) => Math.max(max, b.dependencyDepth || 0), 0);
    const totalDependenciesCount = blocks.reduce((acc, b) => acc + (b.dependencies?.length || 0), 0);

    // 4. Crane utilization saturation
    let totalWorkTime = 0;
    if (schedule && schedule.events) {
      schedule.events.forEach(ev => {
        totalWorkTime += Math.max(0, ev.endTime - ev.startTime);
      });
    }
    const makespan = Math.max(1, schedule?.makespan || 1);
    const totalResources = Math.max(1, cranesCount + transportersCount);
    const craneSaturation = totalWorkTime / (makespan * totalResources);

    // 5. Spatial distribution / entropy
    const gridSize = 4;
    const cellWidth = Math.max(1, config.width / gridSize);
    const cellLength = Math.max(1, config.length / gridSize);
    const cellCounts = new Array(gridSize * gridSize).fill(0);
    placements.forEach(p => {
      const cx = Math.max(0, Math.min(gridSize - 1, Math.floor(p.x / cellWidth)));
      const cy = Math.max(0, Math.min(gridSize - 1, Math.floor(p.y / cellLength)));
      cellCounts[cx + cy * gridSize]++;
    });

    let entropy = 0;
    const totalPlacements = placements.length || 1;
    cellCounts.forEach(c => {
      const p = c / totalPlacements;
      if (p > 0) {
        entropy -= p * Math.log2(p);
      }
    });

    // Score rules based on computed metrics
    const rScores = {
      [RegimeType.PACKING_DOMINANT]: 0.1,
      [RegimeType.SCHEDULING_DOMINANT]: 0.1,
      [RegimeType.RESOURCE_CONGESTED]: 0.1,
      [RegimeType.DEPENDENCY_HEAVY]: 0.1,
      [RegimeType.BALANCED]: 0.3,
      [RegimeType.ADVERSARIAL_TIGHT]: 0.1,
    };

    if (densityRatio > 0.6) {
      rScores[RegimeType.PACKING_DOMINANT] += 2.5;
      rScores[RegimeType.ADVERSARIAL_TIGHT] += 1.5;
    } else if (densityRatio > 0.35) {
      rScores[RegimeType.PACKING_DOMINANT] += 1.2;
    }

    if (craneSaturation > 0.70) {
      rScores[RegimeType.RESOURCE_CONGESTED] += 2.2;
    } else if (craneSaturation > 0.45) {
      rScores[RegimeType.RESOURCE_CONGESTED] += 1.0;
    }

    if (maxDepth > 3 || totalDependenciesCount > blocks.length * 0.7) {
      rScores[RegimeType.DEPENDENCY_HEAVY] += 2.6;
      rScores[RegimeType.SCHEDULING_DOMINANT] += 1.5;
    } else if (maxDepth > 1) {
      rScores[RegimeType.DEPENDENCY_HEAVY] += 1.0;
    }

    if (entropy < 1.9 && densityRatio > 0.25) {
      rScores[RegimeType.ADVERSARIAL_TIGHT] += 2.0;
      rScores[RegimeType.PACKING_DOMINANT] += 1.0;
    }

    if (variance > 40.0) {
      rScores[RegimeType.PACKING_DOMINANT] += 0.8;
    }

    let bestType = RegimeType.BALANCED;
    let maxVal = -1;
    let sumVal = 0;
    for (const key of Object.keys(rScores) as RegimeType[]) {
      const v = rScores[key];
      sumVal += v;
      if (v > maxVal) {
        maxVal = v;
        bestType = key;
      }
    }

    const confidence = sumVal > 0 ? maxVal / sumVal : 1.0;
    return { type: bestType, confidence };
  }
}

/**
 * 2. STRATEGY ORCHESTRATOR
 * Activates profile specific heuristics corresponding to classified regime structures.
 */
export class StrategyOrchestrator {
  static select(regime: RegimeType): StrategyProfile {
    switch (regime) {
      case RegimeType.PACKING_DOMINANT:
        return StrategyProfile.PACKING_MODE;
      case RegimeType.SCHEDULING_DOMINANT:
      case RegimeType.DEPENDENCY_HEAVY:
        return StrategyProfile.SCHEDULING_MODE;
      case RegimeType.RESOURCE_CONGESTED:
      case RegimeType.ADVERSARIAL_TIGHT:
        return StrategyProfile.CONGESTION_MODE;
      case RegimeType.BALANCED:
      default:
        return StrategyProfile.BALANCED_MODE;
    }
  }
}

/**
 * 3. REGIME TRANSITION CONTROLLER
 * Interpolates control coefficients cleanly based on stagnation feedback to secure learning continuity.
 */
export class RegimeTransitionController {
  private alpha: number = 0.5;

  adjust(stagnationCount: number) {
    this.alpha = Math.max(0.15, Math.min(0.85, 1.0 - (stagnationCount / 30.0)));
  }

  blend(oldState: number, strategyValue: number): number {
    return this.alpha * oldState + (1.0 - this.alpha) * strategyValue;
  }
}

/**
 * 4. MULTI-LANDSCAPE OBJECTIVE DECOMPOSITION
 * Re-shales objective score ratios, aligning priority metrics to specific structural bottlenecks.
 */
export class MultiLandscapeObjective {
  static getWeights(regime: RegimeType): {
    wPacking: number;
    wScheduling: number;
    wResource: number;
    wDependency: number;
  } {
    switch (regime) {
      case RegimeType.PACKING_DOMINANT:
        return { wPacking: 1.8, wScheduling: 0.5, wResource: 0.4, wDependency: 0.4 };
      case RegimeType.SCHEDULING_DOMINANT:
        return { wPacking: 0.5, wScheduling: 1.8, wResource: 0.6, wDependency: 1.1 };
      case RegimeType.RESOURCE_CONGESTED:
        return { wPacking: 0.4, wScheduling: 0.8, wResource: 1.9, wDependency: 0.9 };
      case RegimeType.DEPENDENCY_HEAVY:
        return { wPacking: 0.4, wScheduling: 0.9, wResource: 0.5, wDependency: 2.2 };
      case RegimeType.ADVERSARIAL_TIGHT:
        return { wPacking: 1.4, wScheduling: 1.0, wResource: 1.0, wDependency: 1.2 };
      case RegimeType.BALANCED:
      default:
        return { wPacking: 1.0, wScheduling: 1.0, wResource: 1.0, wDependency: 1.0 };
    }
  }

  static evaluateMultilandscape(
    base: Score,
    regime: RegimeType,
    blocks: Block[],
    schedule: Schedule
  ): Score {
    const weights = this.getWeights(regime);

    // Split components
    const packingBase = base.packingUtilization * 5.0 - (base.penaltyCollisions + base.penaltyReachability + base.penaltyStackingHeight) * 1.2;
    const schedulingBase = base.scheduleMakespan * 15.0 + base.deadlineCompliance * 8.0;
    const resourceBase = base.resourceUtilization * 2.0;

    // Calculate delay penalty independently
    let totalDelay = 0;
    const blockMap = new Map(blocks.map(b => [b.id, b]));
    if (schedule && schedule.events) {
      schedule.events.forEach(ev => {
        const b = blockMap.get(ev.blockId);
        if (b && ev.endTime > b.dueDate) {
          totalDelay += (ev.endTime - b.dueDate);
        }
      });
    }
    const dependencyBase = -(totalDelay * 2.5);

    const weightedScoreTotal = Math.round(
      weights.wPacking * packingBase +
      weights.wScheduling * schedulingBase +
      weights.wResource * resourceBase +
      weights.wDependency * dependencyBase
    );

    return {
      ...base,
      totalScore: weightedScoreTotal
    };
  }
}

/**
 * 5. META-POLICY LEARNING ENGINE
 * Accumulates heuristic reward matrices per structural regime over elapsed durations.
 */
export class MetaPolicyLearner {
  performanceMatrix: Record<RegimeType, Record<StrategyProfile, { calls: number; improvements: number; totalDelta: number }>>;

  constructor() {
    this.performanceMatrix = {} as any;
    Object.values(RegimeType).forEach(reg => {
      this.performanceMatrix[reg] = {} as any;
      Object.values(StrategyProfile).forEach(strat => {
        this.performanceMatrix[reg][strat] = { calls: 0, improvements: 0, totalDelta: 0 };
      });
    });
  }

  update(regime: RegimeType, strategy: StrategyProfile, delta: number) {
    const record = this.performanceMatrix[regime]?.[strategy];
    if (record) {
      record.calls++;
      if (delta > 0) {
        record.improvements++;
        record.totalDelta += delta;
      }
    }
  }

  recommend(regime: RegimeType): StrategyProfile | null {
    const strategies = Object.values(StrategyProfile);
    let best = null;
    let bestVal = -Infinity;

    for (const strat of strategies) {
      const record = this.performanceMatrix[regime]?.[strat];
      if (!record || record.calls === 0) {
        return strat; // Explore unvisited profiles first
      }

      const reward = (record.totalDelta / record.calls) + (record.improvements / record.calls) * 60;
      if (reward > bestVal) {
        bestVal = reward;
        best = strat;
      }
    }

    return best;
  }
}

/**
 * 7. PHASE SPACE SEARCH MODEL
 * Tracks state convergence levels across hyper-dimensional trajectory valleys.
 */
export class PhaseSpaceController {
  currentPhase: SearchPhase = SearchPhase.EXPLORATION;
  ticksInPhase: number = 0;

  transition(
    stagnationCount: number,
    poolSimilarity: number,
    currentTemperature: number
  ): SearchPhase {
    this.ticksInPhase++;
    const old = this.currentPhase;

    if (stagnationCount > 16) {
      this.currentPhase = SearchPhase.ESCAPE;
    } else if (poolSimilarity > 0.88) {
      this.currentPhase = SearchPhase.COMPRESSION;
    } else if (stagnationCount > 6) {
      this.currentPhase = SearchPhase.STABILIZATION;
    } else if (currentTemperature > 35) {
      this.currentPhase = SearchPhase.EXPLORATION;
    } else {
      this.currentPhase = SearchPhase.EXPLOITATION;
    }

    if (this.currentPhase !== old) {
      this.ticksInPhase = 0;
    }

    // Escape lock protection
    if (this.ticksInPhase > 25 && this.currentPhase !== SearchPhase.EXPLOITATION) {
      this.currentPhase = SearchPhase.EXPLORATION;
      this.ticksInPhase = 0;
    }

    return this.currentPhase;
  }
}

/**
 * 8. ELITE MULTIVERSE MEMORY SYSTEM
 * Holds isolated sub-clusters mapping to specific regime solutions, optimizing horizontal variety.
 */
export class EliteMultiverse {
  clusters: Record<RegimeType, Solution[]>;
  maxSize: number = 4;

  constructor() {
    this.clusters = {} as any;
    Object.values(RegimeType).forEach(reg => {
      this.clusters[reg] = [];
    });
  }

  insert(regime: RegimeType, sol: Solution) {
    const list = this.clusters[regime];
    if (!list) return;

    const dup = list.some(existing => 
      Math.abs(existing.score.totalScore - sol.score.totalScore) < 0.2
    );
    if (dup) return;

    list.push({
      placements: sol.placements.map(p => ({ ...p })),
      schedule: { ...sol.schedule },
      score: { ...sol.score }
    });

    list.sort((a, b) => b.score.totalScore - a.score.totalScore);

    if (list.length > this.maxSize) {
      list.pop();
    }
  }

  getBest(regime: RegimeType): Solution | null {
    const list = this.clusters[regime];
    return list && list.length > 0 ? list[0] : null;
  }

  crossMigrate() {
    Object.values(RegimeType).forEach(fromReg => {
      const source = this.clusters[fromReg];
      if (!source || source.length === 0) return;

      const eliteChampion = source[0];

      Object.values(RegimeType).forEach(toReg => {
        if (toReg === fromReg) return;
        const target = this.clusters[toReg];
        if (!target) return;

        const isDuplicate = target.some(existing => 
          Math.abs(existing.score.totalScore - eliteChampion.score.totalScore) < 4
        );

        if (!isDuplicate) {
          target.push({
            placements: eliteChampion.placements.map(p => ({ ...p })),
            schedule: { ...eliteChampion.schedule },
            score: { ...eliteChampion.score }
          });
          target.sort((a, b) => b.score.totalScore - a.score.totalScore);
          if (target.length > this.maxSize) {
            target.pop();
          }
        }
      });
    });
  }
}
