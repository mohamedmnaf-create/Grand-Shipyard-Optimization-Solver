import { Block, Placement, Crane, Transporter, YardConfig, Solution, Score, MetaheuristicStats, Schedule } from '../types';
import { PackingOptimizer } from './packing';
import { Scheduler } from './scheduler';
import { Yard, getDimensions } from './yard';
import { GlobalObjectiveFunction } from './objective';
import {
  EntropyInjector,
  AdversarialMutator,
  NonlinearObjectiveShaper,
  StagnationDetector,
  DiversityController,
  EscapeOrchestrator,
  EliteLandscapeShake
} from './adaptive-escape';
import {
  RegimeType,
  StrategyProfile,
  SearchPhase,
  ProblemRegimeDetector,
  StrategyOrchestrator,
  RegimeTransitionController,
  MultiLandscapeObjective,
  MetaPolicyLearner,
  PhaseSpaceController,
  EliteMultiverse
} from './regime-aware';
import {
  AdaptationState,
  SystemMetrics,
  AdaptationGovernor,
  AdaptationBudgetManager,
  RegimeStabilityFilter,
  EntropyGate,
  EliteMigrationController
} from './adaptation-governor';

/**
 * 8. GLOBAL COHERENCE CHECKER
 * SolutionCoherenceValidator enforces:
 * - spatial consistency (inside boundary, no collisions, support strength >= 60%)
 * - dependency consistency (start time in schedule >= end time of preceding dependencies)
 * - scheduling feasibility (isFeasible flag is true, event counts match block quantity)
 * - resource validity (cranes and transporters assigned correctly with sufficient capacities)
 */
export class SolutionCoherenceValidator {
  static isValid(
    placements: Placement[],
    schedule: Schedule,
    yard: Yard,
    blocks: Block[],
    cranes: Crane[],
    transporters: Transporter[]
  ): boolean {
    // 1. Basic schedule integrity check
    if (!schedule || schedule.isFeasible === false || schedule.events.length !== blocks.length) {
      return false;
    }

    // 2. Spatial correctness & physical bounds check
    yard.clear();
    const blockMap = new Map(blocks.map(b => [b.id, b]));

    for (const p of placements) {
      const b = blockMap.get(p.blockId);
      if (!b) return false;
      if (yard.isOutOfBounds(b, p)) return false;
      if (yard.getCollisions(b, p).length > 0) return false;
      if (yard.getSupportStrength(b, p).percentage < 0.6) return false;
      yard.addPlacement(p);
    }

    // 3. Dependency consistency & resource validity check
    const eventMap = new Map(schedule.events.map(ev => [ev.blockId, ev]));
    const craneMap = new Map(cranes.map(c => [c.id, c]));
    const transMap = new Map(transporters.map(t => [t.id, t]));

    for (const b of blocks) {
      const ev = eventMap.get(b.id);
      if (!ev) return false;

      // Dependency logic sequence checks
      for (const depId of b.dependencies) {
        const depEv = eventMap.get(depId);
        if (!depEv) return false;
        if (ev.startTime < depEv.endTime) {
          return false; // Timeline precedence violation!
        }
      }

      // Crane capacity constraints validation
      if (cranes.length > 0) {
        const crane = craneMap.get(ev.craneId);
        if (!crane || crane.capacity < b.weight) {
          return false; // Crane cannot lift block weight or invalid assignment!
        }
      }

      // Transporter capacity constraints validation
      if (transporters.length > 0) {
        const transporter = transMap.get(ev.transporterId);
        if (!transporter || transporter.capacity < b.weight) {
          return false; // Transporter too weak or invalid assignment!
        }
      }
    }

    return true;
  }
}

/**
 * Backward compatible constraint gate forwarding to the comprehensive SolutionCoherenceValidator.
 */
export class ConstraintGate {
  static isValid(placements: Placement[], schedule: Schedule, yard: Yard, blocks: Block[]): boolean {
    // Basic mock resource list for backwards-compatibility or minimal checks
    return SolutionCoherenceValidator.isValid(placements, schedule, yard, blocks, [], []);
  }
}

/**
 * Snaps a candidate placement z-coordinate directly to the supporting structures underneath.
 */
export function snapZToSupportingBlocks(block: Block, placement: Placement, placements: Placement[], yard: Yard): number {
  const { w, l } = getDimensions(block, placement.orientation);
  const aabb = {
    xMin: placement.x,
    xMax: placement.x + w,
    yMin: placement.y,
    yMax: placement.y + l,
    zMin: 0,
    zMax: yard.config.maxHeight,
  };

  let maxZ = 0;
  placements.forEach(op => {
    if (op.blockId === block.id) return;
    const ob = yard.blocks.get(op.blockId);
    if (!ob) return;
    const oaabb = yard.getAABB(ob, op);

    // Horizontal overlap check
    const xOverlap = Math.max(0, Math.min(aabb.xMax, oaabb.xMax) - Math.max(aabb.xMin, oaabb.xMin));
    const yOverlap = Math.max(0, Math.min(aabb.yMax, oaabb.yMax) - Math.max(aabb.yMin, oaabb.yMin));

    if (xOverlap > 0.05 && yOverlap > 0.05) {
      maxZ = Math.max(maxZ, oaabb.zMax);
    }
  });

  return maxZ;
}

/**
 * 1. GLOBAL OBJECTIVE COMPILER
 * Evaluates layouts and timelines using ONLY the GlobalObjectiveFunction authoritative rules.
 */
export class ScoreCalculator {
  config: YardConfig;
  blocks: Block[];
  yard: Yard;
  cranes: Crane[];
  transporters: Transporter[];

  constructor(config: YardConfig, blocks: Block[], cranes: Crane[] = [], transporters: Transporter[] = []) {
    this.config = config;
    this.blocks = blocks;
    this.yard = new Yard(config, blocks);
    this.cranes = cranes;
    this.transporters = transporters;
  }

  evaluate(placements: Placement[], schedule: Schedule): Score {
    return GlobalObjectiveFunction.evaluate(
      this.config,
      this.blocks,
      placements,
      schedule,
      this.yard,
      this.cranes.length,
      this.transporters.length
    );
  }
}

/**
 * 3. CANONICAL REPAIR ORDERING
 * Solves and repairs conflicting layout placements in a 100% deterministic, stable sequence.
 */
export class DeterministicRepairEngine {
  yard: Yard;
  optimizer: PackingOptimizer;

  constructor(yard: Yard, optimizer: PackingOptimizer) {
    this.yard = yard;
    this.optimizer = optimizer;
  }

  getSpatialHash(p: Placement): number {
    // Unifies coordinates and orientation into one deterministic unique index for stable tie-breaking
    return Math.round(p.x * 100000 + p.y * 1000 + p.z + p.orientation * 0.1);
  }

  repair(placements: Placement[]): Placement[] {
    const copy = placements.map(p => ({ ...p }));
    this.yard.clear();
    copy.forEach(p => this.yard.addPlacement(p));

    const blockMap = new Map(this.optimizer.yard.blocks);

    // Dynamic sorted violation queue implementation
    interface DetailedViolation {
      type: 'collision' | 'dependency' | 'resource' | 'boundary';
      priority: number;
      blockId: number;
      hash: number;
    }

    const violations: DetailedViolation[] = [];

    for (const pl of copy) {
      const block = blockMap.get(pl.blockId);
      if (!block) continue;

      const isOutOfBounds = this.yard.isOutOfBounds(block, pl);
      const collisions = this.yard.getCollisions(block, pl);
      const stability = this.yard.getSupportStrength(block, pl);

      const spatialHash = this.getSpatialHash(pl);

      // 1. Collision Check
      if (collisions.length > 0) {
        violations.push({ type: 'collision', priority: 1, blockId: pl.blockId, hash: spatialHash });
      }

      // 2. Dependency Check: Stacked on block which actually depends on current block (reverse cycle)
      if (pl.stackedOn !== -1) {
        const supportingBlock = blockMap.get(pl.stackedOn);
        if (supportingBlock && supportingBlock.dependencies.includes(block.id)) {
          violations.push({ type: 'dependency', priority: 2, blockId: pl.blockId, hash: spatialHash });
        }
      }

      // 3. Resource Check: Reachable by any valid crane with enough lift capacity
      let reachable = false;
      const bCenter = { x: pl.x + block.width / 2, y: pl.y + block.length / 2 };
      for (const crane of this.optimizer.cranes) {
        const dx = bCenter.x - crane.x;
        const dy = bCenter.y - crane.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= crane.reach && crane.capacity >= block.weight) {
          reachable = true;
          break;
        }
      }
      if (!reachable) {
        violations.push({ type: 'resource', priority: 3, blockId: pl.blockId, hash: spatialHash });
      }

      // 4. Boundary Check
      if (isOutOfBounds || stability.percentage < 0.6) {
        violations.push({ type: 'boundary', priority: 4, blockId: pl.blockId, hash: spatialHash });
      }
    }

    // Process violations in authoritative priority order
    violations.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      if (a.blockId !== b.blockId) {
        return a.blockId - b.blockId; // Stable block ID ordering
      }
      return a.hash - b.hash; // stable spatial hash tie-breaker
    });

    const invalidIds = Array.from(new Set(violations.map(v => v.blockId)));
    if (invalidIds.length === 0) return copy;

    // Filter valid elements & remove conflicting ones
    const repairedPlacements = copy.filter(p => !invalidIds.includes(p.blockId));
    this.yard.clear();
    repairedPlacements.forEach(p => this.yard.addPlacement(p));

    const invalidBlocks = invalidIds
      .map(id => blockMap.get(id)!)
      .sort((a, b) => a.id - b.id); // Sorted stably by block IDs

    for (const block of invalidBlocks) {
      const resolved = this.optimizer.findBestPlacement(block, repairedPlacements, 'BFD');
      if (resolved) {
        repairedPlacements.push(resolved);
        this.yard.addPlacement(resolved);
      } else {
        // Deterministic fallback coordinates to ensure reproducibility under the same seed
        const deterministicX = Math.floor((block.id * 17) % (this.optimizer.config.width - block.width + 1));
        const fallback: Placement = {
          blockId: block.id,
          x: deterministicX,
          y: 0,
          z: 0,
          orientation: 0,
          stackedOn: -1
        };
        repairedPlacements.push(fallback);
        this.yard.addPlacement(fallback);
      }
    }

    return repairedPlacements;
  }
}

/**
 * 6. REPAIR AS OPTIMIZER (HYBRID LOCAL HILL CLIMBER)
 * Extends the deterministic repair engine to immediately perform local search optimization,
 * driving elite score convergence by injecting high quality repaired states back into elite pool.
 */
export class HybridRepairOptimizer extends DeterministicRepairEngine {
  scheduler: Scheduler;
  elitePool: ElitePool;
  cranes: Crane[];
  transporters: Transporter[];

  constructor(
    yard: Yard,
    optimizer: PackingOptimizer,
    scheduler: Scheduler,
    elitePool: ElitePool,
    cranes: Crane[],
    transporters: Transporter[]
  ) {
    super(yard, optimizer);
    this.scheduler = scheduler;
    this.elitePool = elitePool;
    this.cranes = cranes;
    this.transporters = transporters;
  }

  optimizeAndRepair(placements: Placement[], blocks: Block[]): Placement[] {
    let repaired = this.repair(placements);

    // Initial base state evaluation
    const initialSchedule = this.scheduler.generateSchedule(repaired);
    let bestScoreObj = GlobalObjectiveFunction.evaluate(
      this.optimizer.config,
      blocks,
      repaired,
      initialSchedule,
      this.yard,
      this.cranes.length,
      this.transporters.length
    );
    let bestScoreVal = bestScoreObj.totalScore;

    let improved = false;
    const blockMap = new Map(blocks.map(b => [b.id, b]));

    // Hill-climb: check local search neighborhoods around repaired blocks
    for (let i = 0; i < repaired.length; i++) {
      const pl = repaired[i];
      const block = blockMap.get(pl.blockId);
      if (!block) continue;

      // Small shifts around the coordinates
      const offsets = [
        { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
        { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
        { dx: -2, dy: 0 }, { dx: 2, dy: 0 }
      ];

      for (const off of offsets) {
        const testX = pl.x + off.dx;
        const testY = pl.y + off.dy;

        const testPl: Placement = {
          ...pl,
          x: testX,
          y: testY
        };

        this.yard.removePlacement(pl.blockId);

        if (
          !this.yard.isOutOfBounds(block, testPl) &&
          this.yard.getCollisions(block, testPl).length === 0
        ) {
          testPl.z = snapZToSupportingBlocks(block, testPl, repaired, this.yard);
          testPl.stackedOn = testPl.z > 0 ? this.optimizer.findBlockAtCoords(testPl.x, testPl.y, testPl.z - 0.05) : -1;

          const support = this.yard.getSupportStrength(block, testPl);
          if (support.percentage >= 0.6) {
            const candidatePlacements = repaired.map((p, idx) => idx === i ? testPl : p);
            const candidateSchedule = this.scheduler.generateSchedule(candidatePlacements);
            const candidateScoreObj = GlobalObjectiveFunction.evaluate(
              this.optimizer.config,
              blocks,
              candidatePlacements,
              candidateSchedule,
              this.yard,
              this.cranes.length,
              this.transporters.length
            );

            if (candidateScoreObj.totalScore > bestScoreVal) {
              bestScoreVal = candidateScoreObj.totalScore;
              bestScoreObj = candidateScoreObj;
              repaired = candidatePlacements;
              improved = true;
            }
          }
        }

        this.yard.addPlacement(repaired[i]);
      }
    }

    if (improved) {
      const finalSchedule = this.scheduler.generateSchedule(repaired);
      const optimizedSolution: Solution = {
        placements: repaired,
        schedule: finalSchedule,
        score: bestScoreObj
      };
      // Submit centrally under strict validation rules
      this.elitePool.insertIsolated(optimizedSolution, this.yard, blocks, this.cranes, this.transporters);
    }

    return repaired;
  }
}

/**
 * 4. CENTRALIZED SNAPSHOT-ISOLATION ELITE POOL
 * Stores the absolute best distinct configurations securely, enforcing validation gates
 * and prohibiting direct mutations.
 */
export class ElitePool {
  maxSize: number;
  pool: Solution[];

  constructor(maxSize = 5) {
    this.maxSize = maxSize;
    this.pool = [];
  }

  insert(sol: Solution, yard: Yard, blocks: Block[]): boolean {
    // Backwards compatible method forwards to isolated check with empty resource lists
    return this.insertIsolated(sol, yard, blocks, [], []);
  }

  insertIsolated(sol: Solution, yard: Yard, blocks: Block[], cranes: Crane[], transporters: Transporter[]): boolean {
    // Comprehensive validator gate
    if (!SolutionCoherenceValidator.isValid(sol.placements, sol.schedule, yard, blocks, cranes, transporters)) {
      return false; 
    }

    // Exact score duplication check
    const exists = this.pool.some(s => s.score.totalScore === sol.score.totalScore);
    if (exists) return false;

    // Diversity distance threshold check: prevents genetic elite collapse (95% rule)
    const isTooSimilar = this.pool.some(s => {
      let matches = 0;
      s.placements.forEach(p1 => {
        const p2 = sol.placements.find(p => p.blockId === p1.blockId);
        if (p2 && p1.x === p2.x && p1.y === p2.y && p1.z === p2.z && p1.orientation === p2.orientation) {
          matches++;
        }
      });
      const similarity = matches / sol.placements.length;
      return similarity > 0.95;
    });

    if (isTooSimilar) return false;

    // Enforce minimum Hamming distance under DiversityController
    if (!DiversityController.isSufficientlyDiverse(sol, this.pool, 0.05)) {
      return false;
    }

    // Deep clones to guarantee SNAPSHOT ISOLATION and immutability of stored solution records
    const snapshotSolution: Solution = {
      placements: sol.placements.map(p => ({ ...p })),
      schedule: JSON.parse(JSON.stringify(sol.schedule)),
      score: { ...sol.score }
    };

    this.pool.push(snapshotSolution);
    this.pool.sort((a, b) => b.score.totalScore - a.score.totalScore);

    if (this.pool.length > this.maxSize) {
      this.pool.pop();
    }

    return this.pool[0].score.totalScore === sol.score.totalScore; // matches absolute champion
  }

  getBest(): Solution | null {
    // Returns immutable copy of the current champion
    if (this.pool.length === 0) return null;
    const best = this.pool[0];
    return {
      placements: best.placements.map(p => ({ ...p })),
      schedule: JSON.parse(JSON.stringify(best.schedule)),
      score: { ...best.score }
    };
  }
}

/**
 * 5. GLOBAL SEARCH ORCHESTRATOR
 * Adaptive operator orchestrator using UCB1 Multi-Armed Bandit statistics to maintain
 * optimal balancing of exploration and exploitation under progressive stagnation detection.
 */
export class GlobalSearchCoordinator {
  stats: MetaheuristicStats;
  stagnationCount: number;

  constructor() {
    this.stagnationCount = 0;
    this.stats = {
      iteration: 0,
      bestScore: 0,
      currentScore: 0,
      currentTemp: 100,
      operatorStats: {
        'LNS_Destroy_Repair': { calls: 0, successes: 0, improvementSum: 0, ucbValue: 1.5 },
        'SA_Local_Search': { calls: 0, successes: 0, improvementSum: 0, ucbValue: 1.5 },
        'Tabu_Neighborhood': { calls: 0, successes: 0, improvementSum: 0, ucbValue: 1.5 },
        'GA_Mutation_Crossover': { calls: 0, successes: 0, improvementSum: 0, ucbValue: 1.5 }
      }
    };
  }

  selectOperatorUCB1(c = 2.0): string {
    const keys = Object.keys(this.stats.operatorStats);
    let bestKey = keys[0];
    let bestVal = -Infinity;

    for (const key of keys) {
      const val = this.stats.operatorStats[key].ucbValue;
      if (val > bestVal) {
        bestVal = val;
        bestKey = key;
      }
    }
    return bestKey;
  }

  updateUCB1Values(c = 2.0) {
    const totalCalls = Object.values(this.stats.operatorStats).reduce((sum, o) => sum + o.calls, 0) || 1;

    for (const key of Object.keys(this.stats.operatorStats)) {
      const o = this.stats.operatorStats[key];
      const avgReward = o.calls === 0 ? 1.0 : o.successes / o.calls;
      const exploration = Math.sqrt(Math.log(totalCalls) / (o.calls + 0.1));
      o.ucbValue = avgReward + c * exploration;
    }
  }

  recordOperatorOutcome(operator: string, improved: boolean, delta = 0) {
    const op = this.stats.operatorStats[operator];
    if (op) {
      op.calls++;
      if (improved) {
        op.successes++;
        op.improvementSum += delta;
      }
    }
  }
}

/**
 * Shipyard Metaheuristic Search Engine coordinating all subroutines, neighborhood local perturbations,
 * hierarchical adaptive LNS destruction, and hybrid evolutionary reparations.
 */
export class SearchEngine {
  blocks: Block[];
  cranes: Crane[];
  transporters: Transporter[];
  optimizer: PackingOptimizer;
  scheduler: Scheduler;
  scorer: ScoreCalculator;
  repairer: HybridRepairOptimizer;
  elitePool: ElitePool;
  blockDelays: Map<number, number>;
  coordinator: GlobalSearchCoordinator;
  stagnationDetector: StagnationDetector;
  regimeTransitionController: RegimeTransitionController;
  metaPolicyLearner: MetaPolicyLearner;
  phaseSpaceController: PhaseSpaceController;
  eliteMultiverse: EliteMultiverse;
  currentRegime: RegimeType;
  currentStrategy: StrategyProfile;
  currentPhase: SearchPhase;
  
  // Adaptation Governor System
  adaptationState: AdaptationState;
  budgetManager: AdaptationBudgetManager;
  regimeStabilityFilter: RegimeStabilityFilter;
  regimeHistory: RegimeType[];
  scoreHistory: number[];
  entropyVarianceHistory: number[];

  constructor(config: YardConfig, blocks: Block[], cranes: Crane[], transporters: Transporter[]) {
    this.blocks = blocks;
    this.cranes = cranes;
    this.transporters = transporters;
    this.optimizer = new PackingOptimizer(config, blocks, cranes);
    this.scheduler = new Scheduler(blocks, cranes, transporters);
    this.scorer = new ScoreCalculator(config, blocks, cranes, transporters);
    this.elitePool = new ElitePool(5);
    
    // Instantiates the hybrid repair local optimizer
    this.repairer = new HybridRepairOptimizer(
      this.optimizer.yard,
      this.optimizer,
      this.scheduler,
      this.elitePool,
      cranes,
      transporters
    );
    
    this.blockDelays = new Map<number, number>();
    this.coordinator = new GlobalSearchCoordinator();
    this.stagnationDetector = new StagnationDetector();
    
    this.regimeTransitionController = new RegimeTransitionController();
    this.metaPolicyLearner = new MetaPolicyLearner();
    this.phaseSpaceController = new PhaseSpaceController();
    this.eliteMultiverse = new EliteMultiverse();
    this.currentRegime = RegimeType.BALANCED;
    this.currentStrategy = StrategyProfile.BALANCED_MODE;
    this.currentPhase = SearchPhase.EXPLORATION;

    // Adaptation Governor System
    this.adaptationState = AdaptationState.ACTIVE_ADAPTATION;
    this.budgetManager = new AdaptationBudgetManager();
    this.regimeStabilityFilter = new RegimeStabilityFilter();
    this.regimeHistory = [];
    this.scoreHistory = [];
    this.entropyVarianceHistory = [];
  }

  // Backward compatible properties wrapping the central coordinator stats
  get stats(): MetaheuristicStats {
    return this.coordinator.stats;
  }
  set stats(val: MetaheuristicStats) {
    this.coordinator.stats = val;
  }
  get stagnationCount(): number {
    return this.coordinator.stagnationCount;
  }
  set stagnationCount(val: number) {
    this.coordinator.stagnationCount = val;
  }

  init(strategy: string): Solution {
    const placements = this.optimizer.solveInitialPacking(this.blocks, strategy);
    const schedule = this.scheduler.generateSchedule(placements);
    const score = this.scorer.evaluate(placements, schedule);
    const sol: Solution = { placements, schedule, score };
    
    this.elitePool.insertIsolated(sol, this.optimizer.yard, this.blocks, this.cranes, this.transporters);
    
    this.stats.bestScore = score.totalScore;
    this.stats.currentScore = score.totalScore;
    return sol;
  }

  computeSpatialEntropy(placements: Placement[]): number {
    const gridSize = 4;
    const cellWidth = Math.max(1, this.optimizer.config.width / gridSize);
    const cellLength = Math.max(1, this.optimizer.config.length / gridSize);
    const cellCounts = new Array(gridSize * gridSize).fill(0);
    placements.forEach(p => {
      const cx = Math.max(0, Math.min(gridSize - 1, Math.floor(p.x / cellWidth)));
      const cy = Math.max(0, Math.min(gridSize - 1, Math.floor(p.y / cellLength)));
      cellCounts[cx + cy * gridSize]++;
    });

    let entropy = 0;
    const total = placements.length || 1;
    cellCounts.forEach(c => {
      const p = c / total;
      if (p > 0) {
        entropy -= p * Math.log2(p);
      }
    });
    return entropy;
  }

  step(currentSolution: Solution): Solution {
    this.stats.iteration++;
    this.stats.currentTemp = Math.max(1.0, 100 * Math.pow(0.97, this.stats.iteration));

    // Recharge Adaptation budgets
    this.budgetManager.recharge();

    // MODULE 1 — PROBLEM REGIME DETECTOR
    const { type: detectedRegime, confidence: regimeConfidence } = ProblemRegimeDetector.analyze(
      this.blocks,
      currentSolution.placements,
      currentSolution.schedule,
      this.optimizer.config,
      this.cranes.length,
      this.transporters.length
    );

    // Track histories
    this.regimeHistory.push(detectedRegime);
    if (this.regimeHistory.length > 20) this.regimeHistory.shift();

    this.scoreHistory.push(currentSolution.score.totalScore);
    if (this.scoreHistory.length > 20) this.scoreHistory.shift();

    // 1. Regime oscillation frequency
    let switches = 0;
    for (let i = 1; i < this.regimeHistory.length; i++) {
      if (this.regimeHistory[i] !== this.regimeHistory[i - 1]) {
        switches++;
      }
    }
    const regimeOscillationFrequency = this.regimeHistory.length > 1 ? switches / (this.regimeHistory.length - 1) : 0;

    // 2. Elite improvement slope
    let eliteImprovementSlope = 0;
    if (this.scoreHistory.length >= 5) {
      const first = this.scoreHistory[0];
      const last = this.scoreHistory[this.scoreHistory.length - 1];
      eliteImprovementSlope = (last - first) / (this.scoreHistory.length - 1);
    }

    // 3. Strategy success variance
    const matrix = this.metaPolicyLearner.performanceMatrix;
    const profiles = Object.values(StrategyProfile);
    let strategySuccessVariance = 0;
    if (this.currentRegime && matrix[this.currentRegime]) {
      const successRates = profiles.map(p => {
        const record = matrix[this.currentRegime][p];
        if (!record || record.calls === 0) return 0;
        return record.improvements / record.calls;
      });
      const avgSuccess = successRates.reduce((a, b) => a + b, 0) / successRates.length;
      strategySuccessVariance = successRates.reduce((acc, r) => acc + Math.pow(r - avgSuccess, 2), 0) / successRates.length;
    }

    // 4. Entropy variance (calculate dynamic spatial distribution variance)
    const currentEntropy = this.computeSpatialEntropy(currentSolution.placements);
    this.entropyVarianceHistory.push(currentEntropy);
    if (this.entropyVarianceHistory.length > 15) this.entropyVarianceHistory.shift();
    const avgEntropy = this.entropyVarianceHistory.reduce((a, b) => a + b, 0) / this.entropyVarianceHistory.length;
    const entropyVariance = this.entropyVarianceHistory.reduce((acc, e) => acc + Math.pow(e - avgEntropy, 2), 0) / this.entropyVarianceHistory.length;

    // 5. Solution diversity index
    let solutionDiversityIndex = 0.5;
    if (this.elitePool.pool.length > 1) {
      const dists: number[] = [];
      for (let i = 0; i < this.elitePool.pool.length - 1; i++) {
        for (let j = i + 1; j < this.elitePool.pool.length; j++) {
          dists.push(DiversityController.getHammingDistance(this.elitePool.pool[i], this.elitePool.pool[j]));
        }
      }
      solutionDiversityIndex = dists.reduce((a, b) => a + b, 0) / dists.length;
    }

    const metrics: SystemMetrics = {
      regimeOscillationFrequency,
      eliteImprovementSlope,
      entropyVariance,
      strategySuccessVariance,
      stagnationDuration: this.stagnationCount,
      solutionDiversityIndex
    };

    // MODULE 3 — ADAPTATION GOVERNOR CORE STATE MACHINE
    this.adaptationState = AdaptationGovernor.computeState(metrics);

    // MODULE 5 — REGIME STABILITY FILTER
    const allowSwitch = this.regimeStabilityFilter.allowSwitch(
      detectedRegime,
      regimeConfidence,
      this.adaptationState,
      this.budgetManager
    );
    if (allowSwitch) {
      this.currentRegime = detectedRegime;
    } else {
      this.currentRegime = this.regimeStabilityFilter.getCurrentRegime();
    }

    // MODULE 2 — STRATEGY ORCHESTRATOR
    let selectedStrategy = StrategyOrchestrator.select(this.currentRegime);

    // Bias selection using Meta-Policy Learning recommendations
    const activeLearnedStrategy = this.metaPolicyLearner.recommend(this.currentRegime);
    if (activeLearnedStrategy && Math.random() < 0.7) {
      selectedStrategy = activeLearnedStrategy;
    }

    if (this.adaptationState === AdaptationState.LOCKED_STABILIZATION) {
      // Frozen; strategy remains unchanged
    } else if (selectedStrategy !== this.currentStrategy) {
      if (this.budgetManager.consumeStrategySwitch()) {
        this.currentStrategy = selectedStrategy;
      }
    } else {
      this.currentStrategy = selectedStrategy;
    }

    // MODULE 7 — PHASE SPACE SEARCH MODEL transitions
    this.currentPhase = this.phaseSpaceController.transition(
      this.stagnationCount,
      solutionDiversityIndex,
      this.stats.currentTemp
    );

    // MODULE 3 — REGIME TRANSITION CONTROLLER calibration
    this.regimeTransitionController.adjust(this.stagnationCount);

    // Record iteration and detect stagnation status
    this.stagnationDetector.recordIteration(currentSolution.score.totalScore);
    const stagnationState = this.stagnationDetector.detectState(
      this.stagnationCount,
      this.coordinator.stats.operatorStats,
      this.elitePool.pool.length
    );

    const cExploration = this.stagnationCount > 10 ? 4.0 : 2.0;

    // Simulate concurrent searches paths
    const simulatedThreads = 4;
    let bestLocalCandidate: Solution | null = null;
    let chosenOperatorUsed = 'SA_Local_Search';

    for (let t = 0; t < simulatedThreads; t++) {
      let threadOperator = this.coordinator.selectOperatorUCB1(cExploration);

      // Strategy profile overrides & biasses
      if (this.currentStrategy === StrategyProfile.PACKING_MODE) {
        if (Math.random() < 0.65) {
          threadOperator = 'LNS_Destroy_Repair';
        }
      } else if (this.currentStrategy === StrategyProfile.SCHEDULING_MODE) {
        if (Math.random() < 0.50) {
          threadOperator = 'SA_Local_Search';
        }
      } else if (this.currentStrategy === StrategyProfile.CONGESTION_MODE) {
        if (Math.random() < 0.50) {
          threadOperator = 'Tabu_Neighborhood';
        }
      }

      let candidateSol: Solution;

      // MODULE 6 — ENTROPY GATING SYSTEM
      let applyEntropy = false;
      if (EntropyGate.allowed(stagnationState, this.stagnationCount, this.adaptationState, this.budgetManager) && Math.random() < 0.45) {
        applyEntropy = true;
        this.budgetManager.consumeEntropyInjection();
      }

      if (applyEntropy) {
        candidateSol = EscapeOrchestrator.perturb(
          currentSolution,
          stagnationState,
          this.blocks,
          this.optimizer.yard,
          this.optimizer
        );
      } else {
        switch (threadOperator) {
          case 'LNS_Destroy_Repair':
            candidateSol = this.runHierarchicalLNS(currentSolution);
            break;
          case 'SA_Local_Search':
            candidateSol = this.runSA(currentSolution);
            break;
          case 'Tabu_Neighborhood':
            candidateSol = this.runTabu(currentSolution);
            break;
          case 'GA_Mutation_Crossover':
          default:
            candidateSol = this.runGA(currentSolution);
            break;
        }
      }

      // Hybrid repair: applies deterministic adjustments then optimization hill climber
      candidateSol.placements = this.repairer.optimizeAndRepair(candidateSol.placements, this.blocks);
      candidateSol.schedule = this.scheduler.generateSchedule(candidateSol.placements);
      
      // Authoritative evaluation
      let baseScoreObj = this.scorer.evaluate(candidateSol.placements, candidateSol.schedule);

      // MODULE 4 — MULTI-LANDSCAPE OBJECTIVE DECOMPOSITION
      baseScoreObj = MultiLandscapeObjective.evaluateMultilandscape(
        baseScoreObj,
        this.currentRegime,
        this.blocks,
        candidateSol.schedule
      );
      
      // Add nonlinear curvature-aware shaping
      candidateSol.score = NonlinearObjectiveShaper.shapeScore(
        baseScoreObj,
        candidateSol.placements,
        this.blocks,
        this.optimizer.yard,
        this.optimizer.config
      );

      if (!bestLocalCandidate || candidateSol.score.totalScore > bestLocalCandidate.score.totalScore) {
        bestLocalCandidate = candidateSol;
        chosenOperatorUsed = threadOperator;
      }
    }

    const delta = bestLocalCandidate!.score.totalScore - currentSolution.score.totalScore;

    // SA Metropolis criterion acceptance check
    let accepted = false;
    if (delta > 0) {
      accepted = true;
    } else {
      const prob = Math.exp(delta / this.stats.currentTemp);
      if (Math.random() < prob) {
        accepted = true;
      }
    }

    if (accepted) {
      currentSolution = bestLocalCandidate!;
      this.stats.currentScore = bestLocalCandidate!.score.totalScore;
      if (delta > 0) {
        this.coordinator.recordOperatorOutcome(chosenOperatorUsed, true, delta);
        this.stagnationCount = 0;
      } else {
        this.coordinator.recordOperatorOutcome(chosenOperatorUsed, false, 0);
        this.stagnationCount++;
      }
    } else {
      this.stagnationCount++;
    }

    // MODULE 5 — META-POLICY LEARNING ENGINE
    this.metaPolicyLearner.update(this.currentRegime, this.currentStrategy, delta);

    // Centrally isolated submission
    const newBest = this.elitePool.insertIsolated(bestLocalCandidate!, this.optimizer.yard, this.blocks, this.cranes, this.transporters);
    if (newBest) {
      const best = this.elitePool.getBest();
      if (best) {
        this.stats.bestScore = best.score.totalScore;
        
        // Dynamic Coupled feedback delay coupling calculation
        const blockMap = new Map(this.blocks.map(b => [b.id, b]));
        this.blockDelays.clear();
        best.schedule.events.forEach(ev => {
          const b = blockMap.get(ev.blockId);
          if (b && ev.endTime > b.dueDate) {
            this.blockDelays.set(ev.blockId, ev.endTime - b.dueDate);
          }
        });
        
        this.optimizer.setFeedbackDelays(this.blockDelays);
      }
    }

    // MODULE 8 — ELITE MULTIVERSE MEMORY SYSTEM (GOVERNED)
    if (EliteMigrationController.validateCompatibility(bestLocalCandidate!, this.optimizer.config)) {
      this.eliteMultiverse.insert(this.currentRegime, bestLocalCandidate!);
      
      const canMigrate = EliteMigrationController.canMigrate(this.adaptationState, this.budgetManager);
      if (canMigrate && this.stats.iteration % 15 === 0) {
        if (this.budgetManager.consumeEliteMigration()) {
          this.eliteMultiverse.crossMigrate();
        }
      }
    }

    // Elite pool landscape shaking to probe neighbor optimal energy valleys
    if (this.stats.iteration % 10 === 0 && this.elitePool.pool.length > 1) {
      EliteLandscapeShake(
        this.elitePool.pool,
        this.optimizer.yard,
        this.blocks,
        this.cranes,
        this.transporters,
        this.scheduler,
        this.scorer
      );
    }

    // Stagnation recovery: massive mutation or restart from champion
    if (this.stagnationCount > 25) {
      const champion = this.elitePool.getBest();
      if (champion) {
        currentSolution = champion;
        this.stagnationCount = 0;
      }
    }

    this.coordinator.updateUCB1Values(cExploration);

    return currentSolution;
  }

  /**
   * 7. MULTI-LEVEL LNS EXTENSION (HIERARCHICAL DESTRUCTION)
   * Adaptive, score-aware, and dependency-aware destruction strategies:
   * - Critical-Path destruction
   * - Zone-level spatial destruction
   * - Dependency-subgraph destruction
   * - Performance/Penalty-aware block destruction
   */
  runHierarchicalLNS(sol: Solution): Solution {
    const placements = sol.placements.map(p => ({ ...p }));
    const rand = Math.random();
    let destroyedIds: number[] = [];

    if (rand < 0.25) {
      destroyedIds = this.getCriticalPathBlocks(sol);
    } else if (rand < 0.50) {
      destroyedIds = this.getSpatialZoneBlocks(placements);
    } else if (rand < 0.75) {
      destroyedIds = this.getDependencySubgraphBlocks(placements);
    } else {
      destroyedIds = this.getHighPenaltyBlocks(sol);
    }

    const minDestroy = Math.max(1, Math.floor(placements.length * 0.15));
    const maxDestroy = Math.max(2, Math.floor(placements.length * 0.40));

    if (destroyedIds.length < minDestroy) {
      // Complement with random selections
      const remainingIds = placements.map(p => p.blockId).filter(id => !destroyedIds.includes(id));
      while (destroyedIds.length < minDestroy && remainingIds.length > 0) {
        const idx = Math.floor(Math.random() * remainingIds.length);
        destroyedIds.push(remainingIds.splice(idx, 1)[0]);
      }
    } else if (destroyedIds.length > maxDestroy) {
      destroyedIds = destroyedIds.slice(0, maxDestroy);
    }

    const keptPlacements = placements.filter(p => !destroyedIds.includes(p.blockId));
    const destroyedBlocks = destroyedIds.map(id => this.blocks.find(b => b.id === id)!);

    // Repack destroyed subset using FFD packing candidate coordinates
    this.optimizer.yard.clear();
    keptPlacements.forEach(kp => this.optimizer.yard.addPlacement(kp));

    destroyedBlocks.forEach(b => {
      const rep = this.optimizer.findBestPlacement(b, keptPlacements, 'BFD');
      if (rep) {
        keptPlacements.push(rep);
        this.optimizer.yard.addPlacement(rep);
      } else {
        const deterministicX = Math.floor((b.id * 17) % (this.optimizer.config.width - b.width + 1));
        const fallback: Placement = {
          blockId: b.id,
          x: deterministicX,
          y: 0,
          z: 0,
          orientation: 0,
          stackedOn: -1
        };
        keptPlacements.push(fallback);
        this.optimizer.yard.addPlacement(fallback);
      }
    });

    return {
      placements: keptPlacements,
      schedule: sol.schedule,
      score: sol.score
    };
  }

  getCriticalPathBlocks(sol: Solution): number[] {
    const list: number[] = [];
    const events = sol.schedule.events;
    if (events.length === 0) return [];

    let currentEvent = events.find(ev => ev.endTime === sol.schedule.makespan) || events[0];
    list.push(currentEvent.blockId);

    const blockMap = new Map(this.blocks.map(b => [b.id, b]));

    while (currentEvent) {
      const b = blockMap.get(currentEvent.blockId);
      if (!b || b.dependencies.length === 0) break;

      let criticalPredecessor = null;
      let maxDepEndTime = 0;

      for (const rx of events) {
        if (b.dependencies.includes(rx.blockId)) {
          if (rx.endTime > maxDepEndTime) {
            maxDepEndTime = rx.endTime;
            criticalPredecessor = rx;
          }
        }
      }

      if (criticalPredecessor) {
        list.push(criticalPredecessor.blockId);
        currentEvent = criticalPredecessor;
      } else {
        break;
      }
    }
    return list;
  }

  getSpatialZoneBlocks(placements: Placement[]): number[] {
    const minX = Math.floor(Math.random() * (this.optimizer.config.width / 2));
    const maxX = minX + Math.floor(this.optimizer.config.width / 3);
    const minY = Math.floor(Math.random() * (this.optimizer.config.length / 2));
    const maxY = minY + Math.floor(this.optimizer.config.length / 3);

    const matchIds: number[] = [];
    const blockMap = new Map(this.blocks.map(b => [b.id, b]));

    for (const p of placements) {
      const b = blockMap.get(p.blockId);
      if (!b) continue;
      const aabb = this.optimizer.yard.getAABB(b, p);
      if (
        aabb.xMin < maxX && aabb.xMax > minX &&
        aabb.yMin < maxY && aabb.yMax > minY
      ) {
        matchIds.push(p.blockId);
      }
    }
    return matchIds;
  }

  getDependencySubgraphBlocks(placements: Placement[]): number[] {
    if (placements.length === 0) return [];
    const idx = Math.floor(Math.random() * placements.length);
    const chosenId = placements[idx].blockId;

    const subIds = new Set<number>([chosenId]);
    const blockMap = new Map(this.blocks.map(b => [b.id, b]));

    let added = true;
    while (added) {
      added = false;
      for (const b of this.blocks) {
        if (!subIds.has(b.id)) {
          const hasDepInSet = b.dependencies.some(depId => subIds.has(depId));
          if (hasDepInSet) {
            subIds.add(b.id);
            added = true;
          }
        }
      }
    }

    const chosenBlock = blockMap.get(chosenId);
    if (chosenBlock) {
      chosenBlock.dependencies.forEach(id => subIds.add(id));
    }

    return Array.from(subIds);
  }

  getHighPenaltyBlocks(sol: Solution): number[] {
    const list: number[] = [];
    this.optimizer.yard.clear();
    sol.placements.forEach(p => this.optimizer.yard.addPlacement(p));

    const blockMap = new Map(this.blocks.map(b => [b.id, b]));

    for (const p of sol.placements) {
      const b = blockMap.get(p.blockId);
      if (!b) continue;

      const accessible = this.optimizer.yard.isAccessible(b, p);
      const support = this.optimizer.yard.getSupportStrength(b, p);

      if (!accessible || support.percentage < 0.6) {
        list.push(p.blockId);
      }
    }
    return list;
  }

  runSA(sol: Solution): Solution {
    const copy = sol.placements.map(p => ({ ...p }));
    const targetIdx = Math.floor(Math.random() * copy.length);
    const currentPl = copy[targetIdx];

    const block = this.blocks.find(b => b.id === currentPl.blockId);
    if (!block) return sol;

    const r = Math.random();
    if (r < 0.25) {
      copy[targetIdx].orientation = currentPl.orientation === 0 ? 1 : 0;
    } else if (r < 0.5) {
      copy[targetIdx].x = Math.max(0, Math.min(this.optimizer.config.width - block.width, currentPl.x + (Math.random() > 0.5 ? 2 : -2)));
    } else if (r < 0.75) {
      copy[targetIdx].y = Math.max(0, Math.min(this.optimizer.config.length - block.length, currentPl.y + (Math.random() > 0.5 ? 2 : -2)));
    } else {
      const otherPl = copy[Math.floor(Math.random() * copy.length)];
      if (otherPl && otherPl.blockId !== block.id) {
        const otherBlock = this.blocks.find(b => b.id === otherPl.blockId)!;
        copy[targetIdx].x = otherPl.x;
        copy[targetIdx].y = otherPl.y;
        copy[targetIdx].z = otherPl.z + otherBlock.height;
        copy[targetIdx].stackedOn = otherPl.blockId;
        return {
          placements: copy,
          schedule: sol.schedule,
          score: sol.score
        };
      }
    }

    copy[targetIdx].z = snapZToSupportingBlocks(block, copy[targetIdx], copy, this.optimizer.yard);
    copy[targetIdx].stackedOn = copy[targetIdx].z > 0 ? this.optimizer.findBlockAtCoords(copy[targetIdx].x, copy[targetIdx].y, copy[targetIdx].z - 0.05) : -1;

    return {
      placements: copy,
      schedule: sol.schedule,
      score: sol.score
    };
  }

  runTabu(sol: Solution): Solution {
    const copy = sol.placements.map(p => ({ ...p }));
    if (copy.length < 2) return sol;

    const b1 = Math.floor(Math.random() * copy.length);
    let b2 = Math.floor(Math.random() * copy.length);
    while (b1 === b2) {
      b2 = Math.floor(Math.random() * copy.length);
    }

    const temp = { ...copy[b1] };
    copy[b1].x = copy[b2].x;
    copy[b1].y = copy[b2].y;
    copy[b1].orientation = copy[b2].orientation;

    copy[b2].x = temp.x;
    copy[b2].y = temp.y;
    copy[b2].orientation = temp.orientation;

    const block1 = this.blocks.find(b => b.id === copy[b1].blockId)!;
    const block2 = this.blocks.find(b => b.id === copy[b2].blockId)!;

    copy[b1].z = snapZToSupportingBlocks(block1, copy[b1], copy, this.optimizer.yard);
    copy[b1].stackedOn = copy[b1].z > 0 ? this.optimizer.findBlockAtCoords(copy[b1].x, copy[b1].y, copy[b1].z - 0.05) : -1;

    copy[b2].z = snapZToSupportingBlocks(block2, copy[b2], copy, this.optimizer.yard);
    copy[b2].stackedOn = copy[b2].z > 0 ? this.optimizer.findBlockAtCoords(copy[b2].x, copy[b2].y, copy[b2].z - 0.05) : -1;

    return {
      placements: copy,
      schedule: sol.schedule,
      score: sol.score
    };
  }

  runGA(sol: Solution): Solution {
    const best = this.elitePool.getBest();
    if (!best) return sol;

    const crossoverPl = sol.placements.map((p, i) => {
      const bestMatch = best.placements.find(bp => bp.blockId === p.blockId);
      if (bestMatch && Math.random() > 0.5) {
        return { ...bestMatch };
      }
      return { ...p };
    });

    return {
      placements: crossoverPl,
      schedule: sol.schedule,
      score: sol.score
    };
  }
}
