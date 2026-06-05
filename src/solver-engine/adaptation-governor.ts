import { Block, Placement, YardConfig, Schedule, Score, Solution } from '../types';
import { RegimeType, StrategyProfile } from './regime-aware';

export enum AdaptationState {
  STABLE = 'STABLE',
  CAUTIOUS_ADAPTATION = 'CAUTIOUS_ADAPTATION',
  ACTIVE_ADAPTATION = 'ACTIVE_ADAPTATION',
  AGGRESSIVE_EXPLORATION = 'AGGRESSIVE_EXPLORATION',
  LOCKED_STABILIZATION = 'LOCKED_STABILIZATION'
}

export interface SystemMetrics {
  regimeOscillationFrequency: number;
  eliteImprovementSlope: number;
  entropyVariance: number;
  strategySuccessVariance: number;
  stagnationDuration: number;
  solutionDiversityIndex: number;
}

/**
 * MODULE 1 — ADAPTATION GOVERNOR CORE
 * Controls all adaptive behaviors in the system, acting as a global regulatory layer above all heuristics.
 */
export class AdaptationGovernor {
  static computeState(metrics: SystemMetrics): AdaptationState {
    // If regime oscillation is super high and improvement is stalled or negative, freeze adaptation to stabilize
    if (metrics.regimeOscillationFrequency > 0.4 && metrics.eliteImprovementSlope <= 0) {
      return AdaptationState.LOCKED_STABILIZATION;
    }

    // High stagnation with low diversity triggers aggressive exploration to shake loose of local valleys
    if (metrics.stagnationDuration >= 14 && metrics.solutionDiversityIndex < 0.12) {
      return AdaptationState.AGGRESSIVE_EXPLORATION;
    }

    // High stagnation with standard diversity triggers active search shifting
    if (metrics.stagnationDuration >= 8) {
      return AdaptationState.ACTIVE_ADAPTATION;
    }

    // System is stable but progress exists slowly; use cautious adaptation
    if (metrics.stagnationDuration < 8 && metrics.eliteImprovementSlope > 0 && metrics.eliteImprovementSlope < 20) {
      return AdaptationState.CAUTIOUS_ADAPTATION;
    }

    // Default stable regime when making consistent comfortable improvements
    if (metrics.stagnationDuration < 5 && metrics.eliteImprovementSlope >= 20) {
      return AdaptationState.STABLE;
    }

    return AdaptationState.ACTIVE_ADAPTATION;
  }
}

/**
 * MODULE 4 — ADAPTATION BUDGET SYSTEM
 * Controls how much "change energy" the system can spend across key adaptive interfaces.
 */
export class AdaptationBudgetManager {
  regimeSwitchBudget: number = 100;
  entropyInjectionBudget: number = 100;
  strategySwitchBudget: number = 100;
  eliteMigrationBudget: number = 100;

  /**
   * Automatically recharges budgets slightly to preserve long-term responsiveness
   */
  recharge() {
    this.regimeSwitchBudget = Math.min(100, this.regimeSwitchBudget + 1.5);
    this.entropyInjectionBudget = Math.min(100, this.entropyInjectionBudget + 2.0);
    this.strategySwitchBudget = Math.min(100, this.strategySwitchBudget + 1.5);
    this.eliteMigrationBudget = Math.min(100, this.eliteMigrationBudget + 1.0);
  }

  consumeRegimeSwitch(): boolean {
    const cost = 16;
    if (this.regimeSwitchBudget >= cost) {
      this.regimeSwitchBudget -= cost;
      return true;
    }
    return false;
  }

  consumeEntropyInjection(): boolean {
    const cost = 12;
    if (this.entropyInjectionBudget >= cost) {
      this.entropyInjectionBudget -= cost;
      return true;
    }
    return false;
  }

  consumeStrategySwitch(): boolean {
    const cost = 14;
    if (this.strategySwitchBudget >= cost) {
      this.strategySwitchBudget -= cost;
      return true;
    }
    return false;
  }

  consumeEliteMigration(): boolean {
    const cost = 8;
    if (this.eliteMigrationBudget >= cost) {
      this.eliteMigrationBudget -= cost;
      return true;
    }
    return false;
  }
}

/**
 * MODULE 5 — REGIME STABILITY FILTER
 * Enforces temporal consistency and dwell time constraints to prevent rapid regime thrashing/flipping.
 */
export class RegimeStabilityFilter {
  private lastRegime: RegimeType = RegimeType.BALANCED;
  private ticksSinceSwitch: number = 0;
  private minDwellTime: number = 6;
  private confidenceThreshold: number = 0.40;

  allowSwitch(targetRegime: RegimeType, confidence: number, state: AdaptationState, budgetManager: AdaptationBudgetManager): boolean {
    this.ticksSinceSwitch++;

    // Lock transitions completely during stable states or freeze conditions
    if (state === AdaptationState.STABLE || state === AdaptationState.LOCKED_STABILIZATION) {
      return false;
    }

    // Force transition if the regime is identical
    if (targetRegime === this.lastRegime) {
      return true;
    }

    // In aggressive exploration mode, we bypass dwell time, but still require budget
    if (state === AdaptationState.AGGRESSIVE_EXPLORATION) {
      if (confidence >= this.confidenceThreshold * 0.7 && budgetManager.consumeRegimeSwitch()) {
        this.lastRegime = targetRegime;
        this.ticksSinceSwitch = 0;
        return true;
      }
      return false;
    }

    // Normal regime switching conditions: minimum dwell time and confidence threshold
    if (this.ticksSinceSwitch >= this.minDwellTime && confidence >= this.confidenceThreshold) {
      if (budgetManager.consumeRegimeSwitch()) {
        this.lastRegime = targetRegime;
        this.ticksSinceSwitch = 0;
        return true;
      }
    }

    return false;
  }

  getCurrentRegime(): RegimeType {
    return this.lastRegime;
  }
}

/**
 * MODULE 6 — ENTROPY GATING SYSTEM
 * Authoritatively locks down entropy injection features during inappropriate search windows or budget exhausts.
 */
export class EntropyGate {
  static allowed(
    stagnationState: 'STABLE' | 'DEGENERATING' | 'COLLAPSING',
    stagnationCount: number,
    state: AdaptationState,
    budgetManager: AdaptationBudgetManager
  ): boolean {
    // 1. Entropy allowed ONLY IF stagnation is present
    if (stagnationState === 'STABLE' && stagnationCount < 3) {
      return false;
    }

    // 2. STABLE or LOCKED states forbid entropy injection to reinforce clean exploitation structures
    if (state === AdaptationState.STABLE || state === AdaptationState.LOCKED_STABILIZATION) {
      return false;
    }

    // 3. Must have available adaptation budget
    if (budgetManager.entropyInjectionBudget < 12) {
      return false;
    }

    return true;
  }
}

/**
 * MODULE 7 — ELITE MIGRATION CONTROLLER
 * Verifies solution structures and limits horizontal migration flows to Active/Aggressive periods.
 */
export class EliteMigrationController {
  static canMigrate(state: AdaptationState, budgetManager: AdaptationBudgetManager): boolean {
    // Migrations only allowed during active adaptation or aggressive exploration states
    if (state !== AdaptationState.ACTIVE_ADAPTATION && state !== AdaptationState.AGGRESSIVE_EXPLORATION) {
      return false;
    }

    // Must satisfy migration budget
    if (budgetManager.eliteMigrationBudget < 8) {
      return false;
    }

    return true;
  }

  static validateCompatibility(solution: Solution, config: YardConfig): boolean {
    // Baseline checks: no absolute layout coordinate overflow
    const maxH = config.maxHeight;
    return solution.placements.every(p => {
      // Validate heights and general coordinates aren't infinitely negative or corrupt
      if (p.x < 0 || p.y < 0 || p.z < 0 || p.z > maxH) {
        return false;
      }
      return true;
    });
  }
}
