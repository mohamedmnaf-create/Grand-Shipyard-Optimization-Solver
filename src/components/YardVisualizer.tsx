import React, { useEffect, useRef, useState } from 'react';
import { Block, Placement, Crane, YardConfig } from '../types';

interface YardVisualizerProps {
  config: YardConfig;
  blocks: Block[];
  placements: Placement[];
  cranes: Crane[];
  onSelectBlock?: (block: Block | null) => void;
}

export default function YardVisualizer({ config, blocks, placements, cranes, onSelectBlock }: YardVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hoveredBlock, setHoveredBlock] = useState<Block | null>(null);
  const [hoverCoordinates, setHoverCoordinates] = useState<{ x: number; y: number } | null>(null);
  const [gridOverlayEnabled, setGridOverlayEnabled] = useState<boolean>(false);
  const [hoveredCell, setHoveredCell] = useState<{
    cx: number;
    cy: number;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    blocksList: number[];
    density: number;
  } | null>(null);
  const [hoveredCellCoords, setHoveredCellCoords] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Responsive sizing
    const resizeCanvas = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      canvas.width = (rect?.width || 800) * window.devicePixelRatio;
      canvas.height = 420 * window.devicePixelRatio;
      canvas.style.width = '100%';
      canvas.style.height = '420px';
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Render loop
    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const w = canvas.width / window.devicePixelRatio;
      const h = canvas.height / window.devicePixelRatio;

      // Draw elegant grid lines & sky background representation
      ctx.fillStyle = '#050505'; // Deep black sky background
      ctx.fillRect(0, 0, w, h);

      // Draw grid borders
      ctx.strokeStyle = '#1F2937';
      ctx.lineWidth = 1;

      // Isometric projection matrix helper
      // ISO Coordinates logic: maps (x, y, z) into isometric screen space
      const originX = w / 2;
      const originY = h - 60;
      const scaleX = 4.2; // pixels per unit
      const scaleY = 2.4;

      const project = (x: number, y: number, z: number) => {
        // Isometric formula
        const screenX = originX + (x - y) * scaleX;
        const screenY = originY - (x + y) * scaleY - z * 5;
        return { x: screenX, y: screenY };
      };

      // Draw Yard boundaries
      const p00 = project(0, 0, 0);
      const pW0 = project(config.width, 0, 0);
      const pWL = project(config.width, config.length, 0);
      const p0L = project(0, config.length, 0);

      ctx.fillStyle = '#11151F'; // Dark ground base gray
      ctx.beginPath();
      ctx.moveTo(p00.x, p00.y);
      ctx.lineTo(pW0.x, pW0.y);
      ctx.lineTo(pWL.x, pWL.y);
      ctx.lineTo(p0L.x, p0L.y);
      ctx.closePath();
      ctx.fill();

      // Draw grid guidelines
      ctx.strokeStyle = '#222630';
      for (let i = 0; i <= config.width; i += 5) {
        const start = project(i, 0, 0);
        const end = project(i, config.length, 0);
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      }
      for (let j = 0; j <= config.length; j += 5) {
        const start = project(0, j, 0);
        const end = project(config.width, j, 0);
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
      }

      // SpatialHashGrid density calculation and rendering
      const cellSize = 10;
      const cols = Math.ceil(config.width / cellSize);
      const rows = Math.ceil(config.length / cellSize);

      if (gridOverlayEnabled) {
        const gridCells: { minX: number; maxX: number; minY: number; maxY: number; cx: number; cy: number; blocksList: number[]; density: number }[] = [];
        const cellVolumeSum = new Array(cols * rows).fill(0);
        const cellBlocksSet = Array.from({ length: cols * rows }, () => new Set<number>());

        placements.forEach(p => {
          const b = blocks.find(bl => bl.id === p.blockId);
          if (!b) return;

          const isRotated = p.orientation === 1;
          const bw = isRotated ? b.length : b.width;
          const bl = isRotated ? b.width : b.length;

          const startX = Math.floor(p.x / cellSize);
          const endX = Math.floor((p.x + bw) / cellSize);
          const startY = Math.floor(p.y / cellSize);
          const endY = Math.floor((p.y + bl) / cellSize);

          for (let cx = Math.max(0, startX); cx <= Math.min(cols - 1, endX); cx++) {
            for (let cy = Math.max(0, startY); cy <= Math.min(rows - 1, endY); cy++) {
              const cellIdx = cx + cy * cols;
              const minX = cx * cellSize;
              const maxX = Math.min(config.width, (cx + 1) * cellSize);
              const minY = cy * cellSize;
              const maxY = Math.min(config.length, (cy + 1) * cellSize);

              const xOverlap = Math.max(0, Math.min(p.x + bw, maxX) - Math.max(p.x, minX));
              const yOverlap = Math.max(0, Math.min(p.y + bl, maxY) - Math.max(p.y, minY));

              if (xOverlap > 1e-4 && yOverlap > 1e-4) {
                cellVolumeSum[cellIdx] += (xOverlap * yOverlap * b.height);
                cellBlocksSet[cellIdx].add(b.id);
              }
            }
          }
        });

        for (let cx = 0; cx < cols; cx++) {
          for (let cy = 0; cy < rows; cy++) {
            const idx = cx + cy * cols;
            const minX = cx * cellSize;
            const maxX = Math.min(config.width, (cx + 1) * cellSize);
            const minY = cy * cellSize;
            const maxY = Math.min(config.length, (cy + 1) * cellSize);

            const maxCellVolume = cellSize * cellSize * config.maxHeight;
            const density = maxCellVolume > 0 ? cellVolumeSum[idx] / maxCellVolume : 0;

            gridCells.push({
              minX,
              maxX,
              minY,
              maxY,
              cx,
              cy,
              blocksList: Array.from(cellBlocksSet[idx]),
              density
            });
          }
        }

        gridCells.forEach(cell => {
          const p00 = project(cell.minX, cell.minY, 0);
          const p10 = project(cell.maxX, cell.minY, 0);
          const p11 = project(cell.maxX, cell.maxY, 0);
          const p01 = project(cell.minX, cell.maxY, 0);

          const d = Math.min(1.0, cell.density);
          let fillStyle = 'rgba(59, 130, 246, 0.04)';
          let strokeStyle = 'rgba(75, 85, 99, 0.2)';

          if (cell.blocksList.length > 0) {
            if (d > 0.6) {
              fillStyle = `rgba(239, 68, 68, ${0.15 + d * 0.25})`;
              strokeStyle = 'rgba(239, 68, 68, 0.7)';
            } else if (d > 0.25) {
              fillStyle = `rgba(245, 158, 11, ${0.12 + d * 0.2})`;
              strokeStyle = 'rgba(245, 158, 11, 0.6)';
            } else {
              fillStyle = `rgba(16, 185, 129, ${0.08 + d * 0.15})`;
              strokeStyle = 'rgba(16, 185, 129, 0.5)';
            }
          }

          ctx.fillStyle = fillStyle;
          ctx.beginPath();
          ctx.moveTo(p00.x, p00.y);
          ctx.lineTo(p10.x, p10.y);
          ctx.lineTo(p11.x, p11.y);
          ctx.lineTo(p01.x, p01.y);
          ctx.closePath();
          ctx.fill();

          ctx.strokeStyle = strokeStyle;
          ctx.lineWidth = 1;
          ctx.stroke();

          if (hoveredCell && hoveredCell.cx === cell.cx && hoveredCell.cy === cell.cy) {
            ctx.strokeStyle = '#00F0FF';
            ctx.lineWidth = 2.5;
            ctx.stroke();
            ctx.fillStyle = 'rgba(0, 240, 255, 0.15)';
            ctx.fill();
          }

          if (cell.blocksList.length > 0) {
            const centerX = (cell.minX + cell.maxX) / 2;
            const centerY = (cell.minY + cell.maxY) / 2;
            const labelPos = project(centerX, centerY, 0);
            ctx.fillStyle = '#9CA3AF';
            ctx.font = '7px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`N=${cell.blocksList.length}`, labelPos.x, labelPos.y);
          }
        });
      }

      // Draw blocks in layers sorted by z, then y, then x to handle proper depth ordering
      const sortedPls = [...placements]
        .map(p => {
          const b = blocks.find(bl => bl.id === p.blockId);
          return { p, b };
        })
        .filter(item => item.b !== undefined)
        .sort((a, b) => {
          return (a.p.z - b.p.z) || (a.p.y + a.p.x - (b.p.y + b.p.x));
        });

      sortedPls.forEach(({ p, b }) => {
        if (!b) return;
        const isRotated = p.orientation === 1;
        const bw = isRotated ? b.length : b.width;
        const bl = isRotated ? b.width : b.length;
        const bh = b.height;

        // Front, Top, Left face projection points
        const c000 = project(p.x, p.y, p.z);
        const c100 = project(p.x + bw, p.y, p.z);
        const c110 = project(p.x + bw, p.y + bl, p.z);
        const c010 = project(p.x, p.y + bl, p.z);

        const c001 = project(p.x, p.y, p.z + bh);
        const c101 = project(p.x + bw, p.y, p.z + bh);
        const c111 = project(p.x + bw, p.y + bl, p.z + bh);
        const c011 = project(p.x, p.y + bl, p.z + bh);

        // Styling according to block properties (High density neon colors for black context)
        let primaryColor = '#1D4ED8'; // Core rich blue
        let topColor = '#3B82F6';     // Cyber active blue
        let rightColor = '#172554';   // Shadow blue

        if (b.criticalityScore > 35) {
          primaryColor = '#B91C1C'; // Critical red
          topColor = '#EF4444';
          rightColor = '#450A0A';
        } else if (b.weight > 30) {
          primaryColor = '#B45309'; // Heavy amber
          topColor = '#F59E0B';
          rightColor = '#451A03';
        }

        ctx.strokeStyle = '#050505'; // Sharp black face boundary lines
        ctx.lineWidth = 1;

        // Top Face
        ctx.fillStyle = topColor;
        ctx.beginPath();
        ctx.moveTo(c001.x, c001.y);
        ctx.lineTo(c101.x, c101.y);
        ctx.lineTo(c111.x, c111.y);
        ctx.lineTo(c011.x, c011.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Left Front Face
        ctx.fillStyle = primaryColor;
        ctx.beginPath();
        ctx.moveTo(c000.x, c000.y);
        ctx.lineTo(c100.x, c100.y);
        ctx.lineTo(c101.x, c101.y);
        ctx.lineTo(c001.x, c001.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Right Front Face
        ctx.fillStyle = rightColor;
        ctx.beginPath();
        ctx.moveTo(c100.x, c100.y);
        ctx.lineTo(c110.x, c110.y);
        ctx.lineTo(c111.x, c111.y);
        ctx.lineTo(c101.x, c101.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Text ID Label on top of block
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`ID ${b.id}`, c101.x - 10, c101.y + 12);
      });

      // Draw Cranes (represented as tall, slim architectural towers with reach radius indicators)
      cranes.forEach(crane => {
        const base = project(crane.x, crane.y, 0);
        const top = project(crane.x, crane.y, 15);

        // Drawing reach radius circle on ground
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.3)';
        ctx.lineWidth = 1;
        ctx.fillStyle = 'rgba(59, 130, 246, 0.05)';
        ctx.beginPath();
        // Since it's isometric, width of circle is double the height ratio
        ctx.ellipse(base.x, base.y, crane.reach * scaleX, crane.reach * scaleY, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Draw mast tower
        ctx.strokeStyle = '#9CA3AF'; // Brighter steel color
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(base.x, base.y);
        ctx.lineTo(top.x, top.y);
        ctx.stroke();

        // Draw horizontal Jib
        ctx.strokeStyle = '#9CA3AF';
        ctx.beginPath();
        ctx.moveTo(top.x - 30, top.y);
        ctx.lineTo(top.x + 30, top.y);
        ctx.stroke();

        // Anchor indicator
        ctx.fillStyle = '#EF4444';
        ctx.beginPath();
        ctx.arc(top.x, top.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      });
    };

    render();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [config, blocks, placements, cranes, gridOverlayEnabled, hoveredCell]);

  // Handle canvas mouse move to locate hovered blocks and spatial grid cells
  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mockX = e.clientX - rect.left;
    const mockY = e.clientY - rect.top;

    // Reverse projection heuristic: matches closest block coordinates
    const w = rect.width;
    const h = rect.height;
    const originX = w / 2;
    const originY = h - 60;
    const scaleX = 4.2;
    const scaleY = 2.4;

    let closestBlock: Block | null = null;
    let minDist = 30; // Threshold distance pixels

    placements.forEach(p => {
      const b = blocks.find(bl => bl.id === p.blockId);
      if (!b) return;

      const screenX = originX + (p.x - p.y) * scaleX;
      const screenY = originY - (p.x + p.y) * scaleY - p.z * 5;

      const d = Math.sqrt((screenX - mockX) ** 2 + (screenY - mockY) ** 2);
      if (d < minDist) {
        minDist = d;
        closestBlock = b;
      }
    });

    if (closestBlock) {
      setHoveredBlock(closestBlock);
      setHoverCoordinates({ x: e.clientX - rect.left, y: e.clientY - rect.top + 15 });
      if (onSelectBlock) onSelectBlock(closestBlock);
    } else {
      setHoveredBlock(null);
      setHoverCoordinates(null);
    }

    // Grid cell hover detection using exact dual-equation solver for floor Z=0 coordinate
    if (gridOverlayEnabled) {
      const dx = (mockX - originX) / scaleX;
      const dy = (originY - mockY) / scaleY;

      const floorX = (dx + dy) / 2;
      const floorY = (dy - dx) / 2;

      const cellSize = 10;
      const cols = Math.ceil(config.width / cellSize);
      const rows = Math.ceil(config.length / cellSize);

      if (floorX >= 0 && floorX <= config.width && floorY >= 0 && floorY <= config.length) {
        const cx = Math.floor(floorX / cellSize);
        const cy = Math.floor(floorY / cellSize);

        if (cx >= 0 && cx < cols && cy >= 0 && cy < rows) {
          const cellMinX = cx * cellSize;
          const cellMaxX = Math.min(config.width, (cx + 1) * cellSize);
          const cellMinY = cy * cellSize;
          const cellMaxY = Math.min(config.length, (cy + 1) * cellSize);

          const overlappingBlocks: number[] = [];
          let accumulatedVolume = 0;

          placements.forEach(p => {
            const b = blocks.find(bl => bl.id === p.blockId);
            if (!b) return;

            const isRotated = p.orientation === 1;
            const bw = isRotated ? b.length : b.width;
            const bl = isRotated ? b.width : b.length;

            const xOverlap = Math.max(0, Math.min(p.x + bw, cellMaxX) - Math.max(p.x, cellMinX));
            const yOverlap = Math.max(0, Math.min(p.y + bl, cellMaxY) - Math.max(p.y, cellMinY));

            if (xOverlap > 1e-4 && yOverlap > 1e-4) {
              overlappingBlocks.push(b.id);
              accumulatedVolume += (xOverlap * yOverlap * b.height);
            }
          });

          const maxCellVolume = cellSize * cellSize * config.maxHeight;
          const density = maxCellVolume > 0 ? accumulatedVolume / maxCellVolume : 0;

          setHoveredCell({
            cx,
            cy,
            minX: cellMinX,
            maxX: cellMaxX,
            minY: cellMinY,
            maxY: cellMaxY,
            blocksList: overlappingBlocks,
            density
          });
          setHoveredCellCoords({ x: e.clientX - rect.left, y: e.clientY - rect.top + 15 });
        } else {
          setHoveredCell(null);
          setHoveredCellCoords(null);
        }
      } else {
        setHoveredCell(null);
        setHoveredCellCoords(null);
      }
    } else {
      setHoveredCell(null);
      setHoveredCellCoords(null);
    }
  };

  return (
    <div id="yard-twin-visualizer" ref={containerRef} className="relative w-full bg-[#050505] rounded-lg overflow-hidden border border-[#2A2A2A] shadow-md">
      <div className="absolute top-4 left-4 z-10 bg-[#111111]/90 backdrop-blur-md px-3 py-1.5 rounded border border-[#2A2A2A] text-[11px] font-mono shadow-sm flex flex-wrap items-center gap-4 text-[#9CA3AF]">
        <span className="font-bold text-[#E5E7EB]">Digital Twin Shipyard (Isometric)</span>
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#3B82F6]"></span> Normal
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#F59E0B]"></span> Heavy
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#EF4444]"></span> Critical
          </span>
          {gridOverlayEnabled && (
            <>
              <span className="h-3 w-[1px] bg-[#2A2A2A]"></span>
              <span className="text-[#10B981] font-semibold text-[10px]">Density Heatmap:</span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 bg-emerald-500/20 border border-emerald-500/40 rounded-sm"></span> Low
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 bg-amber-500/20 border border-amber-500/40 rounded-sm"></span> Med
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 bg-red-500/25 border border-red-500/40 rounded-sm"></span> High
              </span>
            </>
          )}
        </div>
      </div>

      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        <button
          id="toggle-spatial-grid"
          onClick={() => setGridOverlayEnabled(!gridOverlayEnabled)}
          className={`px-2.5 py-1 rounded text-[10px] font-mono font-bold tracking-tight border transition-all duration-200 flex items-center gap-1.5 cursor-pointer ${
            gridOverlayEnabled
              ? 'bg-[#10B981]/15 border-[#10B981] text-[#10B981] shadow-[0_0_8px_rgba(16,185,129,0.2)]'
              : 'bg-[#111111]/90 border-[#2A2A2A] text-[#9CA3AF] hover:bg-[#1A1A1A] hover:border-[#3B82F6] hover:text-[#E5E7EB]'
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${gridOverlayEnabled ? 'bg-[#10B981] animate-pulse' : 'bg-[#9CA3AF]'}`} />
          Spatial Hash Grid
        </button>
      </div>

      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        className="w-full h-[400px] block cursor-crosshair bg-[#050505]"
      />

      {/* Tooltip detail overlay */}
      {hoveredBlock && hoverCoordinates && (
        <div
          className="absolute z-20 bg-[#111111] text-[#E5E7EB] rounded p-3 text-xs shadow-xl max-w-[220px] border border-[#2A2A2A] pointer-events-none font-mono"
          style={{ left: hoverCoordinates.x, top: hoverCoordinates.y }}
        >
          <div className="font-bold border-b border-[#2A2A2A] pb-1.5 mb-1.5 flex items-center justify-between">
            <span>Block_#{hoveredBlock.id}</span>
            <span className="bg-[#3B82F6]/20 text-[#3B82F6] px-1 py-0.5 rounded text-[9px] uppercase">
              {hoveredBlock.weightClass}
            </span>
          </div>
          <div className="space-y-1 text-[10px] text-[#9CA3AF]">
            <div>Dims: {hoveredBlock.width}m x {hoveredBlock.length}m x {hoveredBlock.height}m</div>
            <div>Mass: {hoveredBlock.weight} tons</div>
            <div>Due: {hoveredBlock.dueDate}h</div>
            <div>Crit: {hoveredBlock.criticalityScore}</div>
            <div>Depth: {hoveredBlock.dependencyDepth}</div>
          </div>
        </div>
      )}

      {/* Spatial Grid Cell details */}
      {gridOverlayEnabled && hoveredCell && hoveredCellCoords && (
        <div
          className="absolute z-20 bg-[#0C101B]/95 backdrop-blur-md text-[#E5E7EB] rounded p-3 text-[11px] shadow-2xl max-w-[245px] border border-cyan-500/30 pointer-events-none font-mono"
          style={{ left: hoveredCellCoords.x + 15, top: hoveredCellCoords.y - 10 }}
        >
          <div className="font-bold border-b border-[#2A2A2A] pb-1.5 mb-1.5 text-cyan-400 flex items-center justify-between">
            <span>Grid Cell [{hoveredCell.cx}, {hoveredCell.cy}]</span>
            <span className={`px-1 rounded text-[9px] uppercase font-bold border ${
              hoveredCell.density > 0.6 ? 'bg-red-500/10 border-red-500/30 text-red-400' :
              hoveredCell.density > 0.25 ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' :
              hoveredCell.density > 0 ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
              'bg-gray-500/10 border-gray-500/30 text-gray-400'
            }`}>
              {hoveredCell.density > 0.6 ? 'High' : hoveredCell.density > 0.25 ? 'Medium' : hoveredCell.density > 0 ? 'Low' : 'Empty'}
            </span>
          </div>
          <div className="space-y-1 text-[10px] text-[#9CA3AF]">
            <div>X: {hoveredCell.minX}m to {hoveredCell.maxX}m</div>
            <div>Y: {hoveredCell.minY}m to {hoveredCell.maxY}m</div>
            <div className="flex justify-between items-center">
              <span>Packing Vol Density:</span>
              <span className="font-bold text-white">{(Math.min(1.0, hoveredCell.density) * 100).toFixed(1)}%</span>
            </div>
            <div className="flex justify-between items-center">
              <span>Block Count:</span>
              <span className="font-bold text-white">{hoveredCell.blocksList.length}</span>
            </div>
            {hoveredCell.blocksList.length > 0 && (
              <div className="pt-1.5 border-t border-[#2A2A2A] mt-1.5">
                <span className="text-[9px] uppercase text-[#6B7280] block mb-1">Blocks Inside:</span>
                <div className="flex flex-wrap gap-1">
                  {hoveredCell.blocksList.map(id => (
                    <span key={id} className="px-1.5 py-0.5 bg-[#1A1A1A] border border-[#2A2A2A] text-[9px] text-[#10B981] font-bold rounded">
                      #{id}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
