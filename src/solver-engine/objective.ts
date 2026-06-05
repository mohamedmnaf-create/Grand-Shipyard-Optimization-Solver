import { Block, Placement, YardConfig, Schedule, Score } from '../types';
import { Yard } from './yard';

export class GlobalObjectiveFunction {
  static readonly ALPHA = 5.0;            // Packing score weight
  static readonly BETA = 15.0;            // Scheduling makespan score weight
  static readonly THETA = 8.0;            // Deadline compliance score weight
  static readonly GAMMA = 2.0;            // Resource utilization rate weight
  static readonly DELTA = 1.0;            // Constraint violation penalty weight
  static readonly EPSILON = 2.5;          // Delay penalty weight

  /**
   * Authoritatively evaluates a layout placement and schedule into a single unified scalar score.
   * TotalScore = alpha * PackingUtilization 
   *            + beta * ScheduleMakespan 
   *            + theta * DeadlineCompliance 
   *            + gamma * ResourceUtilization
   *            - delta * ConstraintViolations
   *            - epsilon * DelayPenalty
   */
  static evaluate(
    config: YardConfig,
    blocks: Block[],
    placements: Placement[],
    schedule: Schedule,
    yard: Yard,
    cranesCount: number,
    transportersCount: number
  ): Score {
    yard.clear();
    placements.forEach(p => yard.addPlacement(p));

    const totalVolume = config.width * config.length * config.maxHeight;
    let packedVolume = 0;
    let accessibilityViolations = 0;
    let outOfBoundsCount = 0;
    let collisionCount = 0;
    let stackingViolations = 0;
    let deadlineDelays = 0;

    const blockMap = new Map(blocks.map(b => [b.id, b]));

    placements.forEach(p => {
      const b = blockMap.get(p.blockId);
      if (!b) return;

      packedVolume += b.volume;

      // 1. Accessibility check
      if (!yard.isAccessible(b, p)) {
        accessibilityViolations++;
      }

      // 2. Boundary bounds check
      if (yard.isOutOfBounds(b, p)) {
        outOfBoundsCount++;
      }

      // 3. Collision intersection check
      const collisions = yard.getCollisions(b, p);
      collisionCount += collisions.length;

      // 4. Stacking support strength validation
      const support = yard.getSupportStrength(b, p);
      if (support.percentage < 0.6) {
        stackingViolations++;
      }
    });

    // Schedule deadline delay calculations
    schedule.events.forEach(ev => {
      const b = blockMap.get(ev.blockId);
      if (b && ev.endTime > b.dueDate) {
        deadlineDelays += (ev.endTime - b.dueDate);
      }
    });

    // Core Metrics Components
    const packingUtilization = Math.min(100, (packedVolume / totalVolume) * 100);
    const scheduleMakespan = schedule.makespan > 0 ? 1000 / schedule.makespan : 0;

    // Resource Utilization calculation
    let totalWorkTime = 0;
    schedule.events.forEach(ev => {
      totalWorkTime += (ev.endTime - ev.startTime);
    });
    const totalResources = Math.max(1, cranesCount + transportersCount);
    const maxPossWork = schedule.makespan * totalResources;
    const resourceUtilization = maxPossWork > 0 ? Math.min(100, Math.round((totalWorkTime / maxPossWork) * 100)) : 0;

    // Deadline Compliance calculation
    const totalEvents = schedule.events.length || 1;
    const delayedCount = schedule.events.filter(ev => {
      const b = blockMap.get(ev.blockId);
      return b && ev.endTime > b.dueDate;
    }).length;
    const deadlineCompliance = Math.max(0, 100 * (1 - delayedCount / totalEvents));

    // Hard Constraint Penalties
    const penaltyCollisions = collisionCount * 1200 + outOfBoundsCount * 2000;
    const penaltyReachability = accessibilityViolations * 350;
    const penaltyStackingHeight = stackingViolations * 500;

    const totalConstraintPenalties = penaltyCollisions + penaltyReachability + penaltyStackingHeight;

    //authoritative core scalar global objective compile
    const totalScore = Math.round(
      (this.ALPHA * packingUtilization) +
      (this.BETA * scheduleMakespan) +
      (this.THETA * deadlineCompliance) +
      (this.GAMMA * resourceUtilization) -
      (this.DELTA * totalConstraintPenalties) -
      (this.EPSILON * deadlineDelays)
    );

    return {
      totalScore,
      packingUtilization,
      scheduleMakespan,
      resourceUtilization,
      deadlineCompliance,
      penaltyCollisions,
      penaltyReachability,
      penaltyStackingHeight
    };
  }
}
