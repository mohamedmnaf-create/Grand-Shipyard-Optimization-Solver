import { Block, Placement, Crane, Transporter, Schedule, ScheduleEvent } from '../types';
import { getDimensions } from './yard';

export class Scheduler {
  blocks: Block[];
  cranes: Crane[];
  transporters: Transporter[];

  constructor(blocks: Block[], cranes: Crane[], transporters: Transporter[]) {
    this.blocks = blocks;
    this.cranes = cranes;
    this.transporters = transporters;
  }

  // Generates resource-constrained project schedule based on 3D packed placements
  generateSchedule(placements: Placement[]): Schedule {
    const placementMap = new Map(placements.map(p => [p.blockId, p]));
    const blockMap = new Map(this.blocks.map(b => [b.id, b]));

    // Build DAG relations
    const inDegree = new Map<number, number>();
    const adj: Map<number, number[]> = new Map();
    const backAdj: Map<number, number[]> = new Map();

    this.blocks.forEach(b => {
      inDegree.set(b.id, b.dependencies.length);
      adj.set(b.id, []);
      backAdj.set(b.id, b.dependencies);
    });

    this.blocks.forEach(b => {
      b.dependencies.forEach(depId => {
        if (adj.has(depId)) {
          adj.get(depId)!.push(b.id);
        }
      });
    });

    // Tracking end-execution times of each block to respect hard dependency chains
    const blockEndTime = new Map<number, number>();
    const events: ScheduleEvent[] = [];

    // Track state (next available time) of cranes and transporters
    const craneFreeTimes = new Map<number, number>(this.cranes.map(c => [c.id, 0]));
    const transporterFreeTimes = new Map<number, number>(this.transporters.map(t => [t.id, 0]));

    // Kahn's topologically processing queue
    const queue: number[] = [];
    inDegree.forEach((deg, id) => {
      if (deg === 0) queue.push(id);
    });

    let overallFeasible = true;

    // Compile-ordered list of scheduled IDs
    while (queue.length > 0) {
      // Prioritize blocks by criticality score and due date
      queue.sort((a, b) => {
        const bA = blockMap.get(a)!;
        const bB = blockMap.get(b)!;
        return (bB.criticalityScore - bA.criticalityScore) || (bA.dueDate - bB.dueDate);
      });

      const currId = queue.shift()!;
      const block = blockMap.get(currId)!;
      const placement = placementMap.get(currId);

      if (!placement) continue;

      // Determine earliest starting time based on dependencies
      let depsEndTime = 0;
      block.dependencies.forEach(depId => {
        depsEndTime = Math.max(depsEndTime, blockEndTime.get(depId) || 0);
      });

      // Find the best Resource assignments using a Min Cost Match strategy.
      // We look for a (crane, transporter) pair that minimizes completion time.
      let bestCraneId = -1;
      let bestTransporterId = -1;
      let earliestFinish = Infinity;
      
      let chosenStartTime = 0;
      let chosenTravelDuration = 0;

      // Travel/Transit distance based on layout coordinates relative to loading yard entrance (0,0)
      const transportDist = Math.max(20, placement.x + placement.y);

      for (const crane of this.cranes) {
        if (crane.capacity < block.weight) continue; // Crane too weak

        const cranePrep = craneFreeTimes.get(crane.id) || 0;

        for (const trans of this.transporters) {
          if (trans.capacity < block.weight) continue; // Transporter weak

          const transPrep = transporterFreeTimes.get(trans.id) || 0;

          // TRAVEL PHASE: Starts as soon as dependencies are prepped AND carrier is free
          const travelStart = Math.max(depsEndTime, transPrep);
          const travelDuration = Math.round((transportDist / (trans.speed || 1)) / 10) + 1; // discrete travel intervals
          const travelEnd = travelStart + travelDuration;

          // LIFT PHASE: Starts ONLY when travel is completed AND crane is free
          const liftStart = Math.max(travelEnd, cranePrep);
          const liftDuration = Math.round(((block.height + placement.z) / (crane.speed || 1)) / 10) + 1; // discrete lift intervals
          const liftEnd = liftStart + liftDuration;

          if (liftEnd < earliestFinish) {
            earliestFinish = liftEnd;
            chosenStartTime = travelStart;
            chosenTravelDuration = travelDuration;
            bestCraneId = crane.id;
            bestTransporterId = trans.id;
          }
        }
      }

      // If no valid resources could hand the block, fail feasibility!
      if (earliestFinish === Infinity || bestCraneId === -1 || bestTransporterId === -1) {
        overallFeasible = false;
        // Strict failure handler: Force marking as infeasible with dummy end time
        blockEndTime.set(currId, depsEndTime + 20);
        continue;
      }

      // Record final block scheduling timing window
      blockEndTime.set(currId, earliestFinish);

      // Book resource times (RELEASE resource immediately after its respective task phase!)
      // Transporter is released immediately at completion of Travel Phase!
      transporterFreeTimes.set(bestTransporterId, chosenStartTime + chosenTravelDuration);
      // Crane is released after Lift Phase concludes!
      craneFreeTimes.set(bestCraneId, earliestFinish);

      // Add to scheduled event log
      events.push({
        blockId: currId,
        startTime: chosenStartTime,
        endTime: earliestFinish,
        craneId: bestCraneId,
        transporterId: bestTransporterId,
        type: block.dependencies.length > 0 ? 'assemble' : 'lift'
      });

      // Update inDegree and feed topological queues
      const dependents = adj.get(currId) || [];
      dependents.forEach(depId => {
        const degree = inDegree.get(depId)! - 1;
        inDegree.set(depId, degree);
        if (degree === 0) {
          queue.push(depId);
        }
      });
    }

    // Capture makespan
    const maxTime = events.length > 0 ? Math.max(...events.map(e => e.endTime)) : 0;

    // Build timeline details for viz
    const resourceTimeline: { [key: string]: number[] } = {};
    this.cranes.forEach(c => {
      resourceTimeline[`crane_${c.id}`] = new Array(maxTime + 5).fill(0);
    });
    this.transporters.forEach(t => {
      resourceTimeline[`trans_${t.id}`] = new Array(maxTime + 5).fill(0);
    });

    events.forEach(ev => {
      for (let t = ev.startTime; t < ev.endTime; t++) {
        if (t < resourceTimeline[`crane_${ev.craneId}`].length) {
          resourceTimeline[`crane_${ev.craneId}`][t] = ev.blockId;
        }
        if (t < resourceTimeline[`trans_${ev.transporterId}`].length) {
          resourceTimeline[`trans_${ev.transporterId}`][t] = ev.blockId;
        }
      }
    });

    return {
      events,
      makespan: maxTime,
      resourceTimeline,
      isFeasible: overallFeasible && events.length === this.blocks.length,
    };
  }
}
