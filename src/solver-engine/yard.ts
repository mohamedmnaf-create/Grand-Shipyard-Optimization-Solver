import { Block, Placement, YardConfig } from '../types';

export function getDimensions(block: Block, orientation: number): { w: number, l: number, h: number } {
  if (orientation === 1) {
    return { w: block.length, l: block.width, h: block.height };
  }
  return { w: block.width, l: block.length, h: block.height };
}

export class SpatialHashGrid {
  cellSize: number;
  grid: Map<string, number[]>; // cellKey -> blockIds

  constructor(cellSize = 10) {
    this.cellSize = cellSize;
    this.grid = new Map();
  }

  clear() {
    this.grid.clear();
  }

  getCellKeys(aabb: { xMin: number; xMax: number; yMin: number; yMax: number; zMin: number; zMax: number }): string[] {
    const keys: string[] = [];
    const minX = Math.floor(aabb.xMin / this.cellSize);
    const maxX = Math.floor(aabb.xMax / this.cellSize);
    const minY = Math.floor(aabb.yMin / this.cellSize);
    const maxY = Math.floor(aabb.yMax / this.cellSize);
    const minZ = Math.floor(aabb.zMin / this.cellSize);
    const maxZ = Math.floor(aabb.zMax / this.cellSize);

    const eps = 1e-5;

    for (let x = minX; x <= maxX; x++) {
      const cellXMin = x * this.cellSize;
      const cellXMax = (x + 1) * this.cellSize;
      if (Math.max(aabb.xMin, cellXMin) >= Math.min(aabb.xMax, cellXMax) - eps) continue;

      for (let y = minY; y <= maxY; y++) {
        const cellYMin = y * this.cellSize;
        const cellYMax = (y + 1) * this.cellSize;
        if (Math.max(aabb.yMin, cellYMin) >= Math.min(aabb.yMax, cellYMax) - eps) continue;

        for (let z = minZ; z <= maxZ; z++) {
          const cellZMin = z * this.cellSize;
          const cellZMax = (z + 1) * this.cellSize;
          if (Math.max(aabb.zMin, cellZMin) >= Math.min(aabb.zMax, cellZMax) - eps) continue;

          keys.push(`${x},${y},${z}`);
        }
      }
    }

    // Fallback: If it intersects nothing due to floating boundary tolerances, always register the lower corner
    if (keys.length === 0) {
      keys.push(`${minX},${minY},${minZ}`);
    }

    return keys;
  }

  insert(blockId: number, aabb: { xMin: number; xMax: number; yMin: number; yMax: number; zMin: number; zMax: number }) {
    const keys = this.getCellKeys(aabb);
    for (const key of keys) {
      if (!this.grid.has(key)) {
        this.grid.set(key, []);
      }
      const list = this.grid.get(key)!;
      if (!list.includes(blockId)) {
        list.push(blockId);
      }
    }
  }

  remove(blockId: number, aabb: { xMin: number; xMax: number; yMin: number; yMax: number; zMin: number; zMax: number }) {
    const keys = this.getCellKeys(aabb);
    for (const key of keys) {
      if (this.grid.has(key)) {
        const list = this.grid.get(key)!;
        const index = list.indexOf(blockId);
        if (index !== -1) {
          list.splice(index, 1);
        }
        if (list.length === 0) {
          this.grid.delete(key);
        }
      }
    }
  }

  getNeighbors(aabb: { xMin: number; xMax: number; yMin: number; yMax: number; zMin: number; zMax: number }): number[] {
    const keys = this.getCellKeys(aabb);
    const neighborSet = new Set<number>();
    for (const key of keys) {
      const list = this.grid.get(key);
      if (list) {
        for (const id of list) {
          neighborSet.add(id);
        }
      }
    }
    return Array.from(neighborSet);
  }
}

export class Yard {
  config: YardConfig;
  placements: Map<number, Placement>;
  blocks: Map<number, Block>;
  spatialGrid: SpatialHashGrid;

  constructor(config: YardConfig, blocks: Block[]) {
    this.config = config;
    this.placements = new Map();
    this.blocks = new Map(blocks.map(b => [b.id, b]));
    this.spatialGrid = new SpatialHashGrid(10);
  }

  clear() {
    this.placements.clear();
    this.spatialGrid.clear();
  }

  addPlacement(placement: Placement) {
    this.placements.set(placement.blockId, placement);
    const b = this.blocks.get(placement.blockId);
    if (b) {
      this.spatialGrid.insert(placement.blockId, this.getAABB(b, placement));
    }
  }

  removePlacement(blockId: number) {
    const p = this.placements.get(blockId);
    const b = this.blocks.get(blockId);
    if (p && b) {
      this.spatialGrid.remove(blockId, this.getAABB(b, p));
    }
    this.placements.delete(blockId);
  }

  getAABB(block: Block, placement: Placement) {
    const { w, l, h } = getDimensions(block, placement.orientation);
    return {
      xMin: placement.x,
      xMax: placement.x + w,
      yMin: placement.y,
      yMax: placement.y + l,
      zMin: placement.z,
      zMax: placement.z + h,
    };
  }

  // O(1) checks if two bounding boxes overlap
  overlaps(
    a: { xMin: number; xMax: number; yMin: number; yMax: number; zMin: number; zMax: number },
    b: { xMin: number; xMax: number; yMin: number; yMax: number; zMin: number; zMax: number }
  ): boolean {
    const eps = 1e-5; // threshold
    return (
      a.xMin < b.xMax - eps &&
      a.xMax > b.xMin + eps &&
      a.yMin < b.yMax - eps &&
      a.yMax > b.yMin + eps &&
      a.zMin < b.zMax - eps &&
      a.zMax > b.zMin + eps
    );
  }

  // Check if placement is inside bounds
  isOutOfBounds(block: Block, placement: Placement): boolean {
    const bounding = this.getAABB(block, placement);
    return (
      bounding.xMin < 0 ||
      bounding.xMax > this.config.width ||
      bounding.yMin < 0 ||
      bounding.yMax > this.config.length ||
      bounding.zMin < 0 ||
      bounding.zMax > this.config.maxHeight
    );
  }

  // Find all blocks overlapping with the proposed placement
  getCollisions(block: Block, placement: Placement): number[] {
    const parentAABB = this.getAABB(block, placement);
    const collisions: number[] = [];
    const candidates = this.spatialGrid.getNeighbors(parentAABB);

    for (const id of candidates) {
      if (id === block.id) continue;
      const b2 = this.blocks.get(id);
      const pl = this.placements.get(id);
      if (!b2 || !pl) continue;
      const childAABB = this.getAABB(b2, pl);
      if (this.overlaps(parentAABB, childAABB)) {
        collisions.push(id);
      }
    }
    return collisions;
  }

  // Stacking support: find active blocks underneath this placement
  getSupportStrength(block: Block, placement: Placement): { percentage: number, supportingIds: number[] } {
    if (placement.z === 0) {
      return { percentage: 1.0, supportingIds: [-1] }; // Ground is solid
    }

    const aabb = this.getAABB(block, placement);
    const w = aabb.xMax - aabb.xMin;
    const l = aabb.yMax - aabb.yMin;
    const area = w * l;

    // We look for any blocks directly underneath (at z = placement.z - block2.height)
    let supportedArea = 0;
    const supportingIds: number[] = [];
    const eps = 0.05;

    const candidates = this.spatialGrid.getNeighbors(aabb);

    for (const id of candidates) {
      if (id === block.id) continue;
      const b2 = this.blocks.get(id);
      const pl = this.placements.get(id);
      if (!b2 || !pl) continue;
      const aabb2 = this.getAABB(b2, pl);

      // Check if it's directly touching the bottom of our block
      if (Math.abs(aabb2.zMax - aabb.zMin) < eps) {
        // Calculate horizontal overlapping rectangle
        const xOverlap = Math.max(0, Math.min(aabb.xMax, aabb2.xMax) - Math.max(aabb.xMin, aabb2.xMin));
        const yOverlap = Math.max(0, Math.min(aabb.yMax, aabb2.yMax) - Math.max(aabb.yMin, aabb2.yMin));
        if (xOverlap > 0 && yOverlap > 0) {
          supportedArea += xOverlap * yOverlap;
          supportingIds.push(id);
        }
      }
    }

    return {
      percentage: supportedArea / area,
      supportingIds,
    };
  }

  // Accessibility Check: Can we lift the block without any obstructions directly on top of it?
  isAccessible(block: Block, placement: Placement): boolean {
    const aabb = this.getAABB(block, placement);
    const candidates = this.spatialGrid.getNeighbors(aabb);
    
    // Check if any block lies directly above this bounding box
    for (const id of candidates) {
      if (id === block.id) continue;
      const b2 = this.blocks.get(id);
      const pl = this.placements.get(id);
      if (!b2 || !pl) continue;
      const aabb2 = this.getAABB(b2, pl);

      if (aabb2.zMin >= aabb.zMax - 0.01) {
        // Horizontal intersection
        const xOverlap = Math.max(0, Math.min(aabb.xMax, aabb2.xMax) - Math.max(aabb.xMin, aabb2.xMin));
        const yOverlap = Math.max(0, Math.min(aabb.yMax, aabb2.yMax) - Math.max(aabb.yMin, aabb2.yMin));
        if (xOverlap > 0.01 && yOverlap > 0.01) {
          return false; // Obstructed!
        }
      }
    }
    return true;
  }
}
