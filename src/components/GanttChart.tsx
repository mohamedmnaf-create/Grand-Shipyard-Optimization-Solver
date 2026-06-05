import { Schedule, Block, Placement } from '../types';
import { Clock, Box, ShieldAlert } from 'lucide-react';

interface GanttChartProps {
  schedule: Schedule;
  blocks: Block[];
  placements: Placement[];
}

export default function GanttChart({ schedule, blocks, placements }: GanttChartProps) {
  const blockMap = new Map(blocks.map(b => [b.id, b]));
  const placementMap = new Map(placements.map(p => [p.blockId, p]));

  // Find unique resource timelines
  const uniqueCranes = Array.from(new Set(schedule.events.map(e => e.craneId))).sort((a, b) => a - b);
  const uniqueTransporters = Array.from(new Set(schedule.events.map(e => e.transporterId))).sort((a, b) => a - b);

  return (
    <div id="gantt-schedule-timeline" className="bg-[#0E0E0E] rounded-lg border border-[#2A2A2A] p-4 space-y-4 font-mono">
      <div className="flex justify-between items-center bg-[#151515] px-3 py-2 border-b border-[#2A2A2A] rounded-t-lg -mx-4 -mt-4 mb-2">
        <h4 className="text-[10px] uppercase tracking-[0.2em] text-[#6B7280] font-bold flex items-center gap-2">
          <Clock className="h-4 w-4 text-[#3B82F6]" />
          Shipyard Gantt Scheduling Timeline
        </h4>
        <div className="text-[11px] bg-[#111111] text-[#10B981] px-2 py-0.5 rounded font-mono font-bold border border-[#2A2A2A]">
          Final Makespan: {schedule.makespan} Hours
        </div>
      </div>

      {schedule.events.length === 0 ? (
        <div className="text-center py-8 text-[#6B7280] text-xs font-mono">
          No schedule events generated. Ready solver engine above.
        </div>
      ) : (
        <div className="space-y-6">
          {/* Crane Allocations */}
          <div>
            <h5 className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-2">Gantry Crane Timelines</h5>
            <div className="space-y-2">
              {uniqueCranes.map(craneId => {
                const craneEvents = schedule.events.filter(e => e.craneId === craneId);
                return (
                  <div key={craneId} className="grid grid-cols-12 items-center gap-4 bg-[#050505] p-2.5 rounded border border-[#2A2A2A]">
                    <div className="col-span-2 text-xs font-bold text-[#9CA3AF] font-mono">
                      Crane #{craneId}
                    </div>
                    <div className="col-span-10 relative h-7 bg-[#111111] rounded border border-[#2A2A2A] overflow-hidden">
                      {craneEvents.map((ev, idx) => {
                        const block = blockMap.get(ev.blockId);
                        const leftPct = (ev.startTime / schedule.makespan) * 100;
                        const widthPct = ((ev.endTime - ev.startTime) / schedule.makespan) * 100;
                        
                        const isOverdue = block && ev.endTime > block.dueDate;

                        return (
                          <div
                            key={idx}
                            className={`absolute top-0 h-full flex items-center justify-center text-[10px] font-mono font-bold transition-all overflow-hidden border-r border-[#000000]/20 ${
                              isOverdue ? 'bg-[#EF4444] text-white hover:bg-red-500' : 'bg-[#3B82F6] text-black hover:bg-[#60A5FA]'
                            }`}
                            style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                            title={`Block ${ev.blockId}: Duration ${ev.startTime}-${ev.endTime}h (Due: ${block?.dueDate}h)`}
                          >
                            B#{ev.blockId}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Transporter Allocations */}
          <div>
            <h5 className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider mb-2">Heavy Transporter Timelines</h5>
            <div className="space-y-2">
              {uniqueTransporters.map(transId => {
                const transEvents = schedule.events.filter(e => e.transporterId === transId);
                return (
                  <div key={transId} className="grid grid-cols-12 items-center gap-4 bg-[#050505] p-2.5 rounded border border-[#2A2A2A]">
                    <div className="col-span-2 text-xs font-bold text-[#9CA3AF] font-mono">
                      Trans #{transId}
                    </div>
                    <div className="col-span-10 relative h-7 bg-[#111111] rounded border border-[#2A2A2A] overflow-hidden">
                      {transEvents.map((ev, idx) => {
                        const leftPct = (ev.startTime / schedule.makespan) * 100;
                        const widthPct = ((ev.endTime - ev.startTime) / schedule.makespan) * 100;

                        return (
                          <div
                            key={idx}
                            className="absolute top-0 h-full flex items-center justify-center text-[10px] font-mono font-bold text-black bg-[#F59E0B] hover:bg-amber-400 transition-all overflow-hidden border-r border-[#000000]/20"
                            style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                            title={`Block ${ev.blockId}: Transported during ${ev.startTime}-${ev.endTime}h`}
                          >
                            B#{ev.blockId}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Delayed Deadlines Legend & Info */}
          <div className="flex items-center gap-3.5 bg-[#F59E0B]/5 p-3 rounded border border-[#F59E0B]/20 text-[11px] font-mono leading-relaxed">
            <ShieldAlert className="h-4.5 w-4.5 text-[#F59E0B] flex-shrink-0" />
            <div className="text-[#9CA3AF]">
              <span className="font-bold text-[#F59E0B]">HEURISTIC DELAY ALERT:</span> Red blocks indicate scheduling completion times that exceed the assigned deadline (<span className="text-[#E5E7EB]">dueDate</span>). The meta-heuristics target these with high priority penalty coefficients.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
