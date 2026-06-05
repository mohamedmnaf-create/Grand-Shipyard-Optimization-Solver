export interface Block {
  id: number;
  width: number;
  height: number;
  length: number;
  weight: number;
  dueDate: number;
  dependencies: number[];
  
  // Preprocessed attributes
  volume: number;
  density: number;
  footprint: number;
  weightClass: 'Light' | 'Medium' | 'Heavy' | 'Ultra';
  criticalityScore: number;
  dependencyDepth: number;
}

export interface Placement {
  blockId: number;
  x: number;
  y: number;
  z: number;
  orientation: number; // 0: standard (L x W), 1: rotated (W x L)
  // Stacked on top of block ID (-1 if ground)
  stackedOn: number;
}

export interface Crane {
  id: number;
  name: string;
  capacity: number; // Max weight
  reach: number; // Max radius from origin (x0, y0)
  x: number;
  y: number;
  speed: number; // m/s
}

export interface Transporter {
  id: number;
  name: string;
  capacity: number;
  speed: number;
}

export interface YardConfig {
  width: number;
  length: number;
  maxHeight: number;
}

export interface ScheduleEvent {
  blockId: number;
  startTime: number;
  endTime: number;
  craneId: number;
  transporterId: number;
  type: 'transport' | 'lift' | 'assemble';
}

export interface Schedule {
  events: ScheduleEvent[];
  makespan: number;
  resourceTimeline: { [key: string]: number[] }; // tracks idle/busy windows
  isFeasible?: boolean;
}

export interface Score {
  totalScore: number;
  packingUtilization: number; // Area/Volume utilization ratio
  scheduleMakespan: number; // Inverse of makespan
  resourceUtilization: number; // Utilization rate percentage
  deadlineCompliance: number; // Satisfied deadlines vs delayed
  penaltyCollisions: number; // 0 if perfect
  penaltyReachability: number; // Access scores
  penaltyStackingHeight: number; // 0 if no structural violations
}

export interface Solution {
  placements: Placement[];
  schedule: Schedule;
  score: Score;
}

export interface MetaheuristicStats {
  iteration: number;
  bestScore: number;
  currentScore: number;
  currentTemp: number;
  operatorStats: {
    [key: string]: {
      calls: number;
      successes: number;
      improvementSum: number;
      ucbValue: number;
    };
  };
}
