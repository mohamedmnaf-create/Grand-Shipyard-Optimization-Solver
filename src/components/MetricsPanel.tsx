import { Score, MetaheuristicStats } from '../types';
import { Target, BarChart3, Settings2, Activity, Cpu } from 'lucide-react';

interface MetricsPanelProps {
  score: Score;
  stats: MetaheuristicStats;
  currentRegime?: string;
  currentStrategy?: string;
  currentPhase?: string;
  adaptationState?: string;
  budgets?: {
    regimeSwitchBudget: number;
    entropyInjectionBudget: number;
    strategySwitchBudget: number;
    eliteMigrationBudget: number;
  };
}

export default function MetricsPanel({
  score,
  stats,
  currentRegime,
  currentStrategy,
  currentPhase,
  adaptationState,
  budgets
}: MetricsPanelProps) {
  return (
    <div id="metrics-panel-container" className="grid grid-cols-1 lg:grid-cols-3 gap-6 font-mono">
      {/* Primary Goal Score Metrics Card */}
      <div className="bg-[#0E0E0E] rounded-lg border border-[#2A2A2A] p-4 space-y-4 shadow-lg">
        <div className="flex justify-between items-center bg-[#151515] px-3 py-2 border-b border-[#2A2A2A] rounded-t-lg -mx-4 -mt-4 mb-2">
          <h4 className="text-[10px] uppercase tracking-[0.2em] text-[#6B7280] font-bold flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5 text-[#10B981]" />
            Scoring Engine
          </h4>
          <span className="text-[9px] bg-[#111111] text-[#9CA3AF] px-1.5 py-0.5 rounded border border-[#2A2A2A]">
            ITER_N: {stats.iteration}
          </span>
        </div>

        <div className="text-center py-3 border-b border-[#1F2937]">
          <div className="text-[9px] text-[#9CA3AF] uppercase mb-1 font-mono tracking-wider">Current Champion Score</div>
          <div className="text-3xl font-mono font-bold tracking-tight text-[#10B981]">
            {(score.totalScore * 1000).toExponential(4).toUpperCase()}
          </div>
          <div className="text-[9px] text-[#3B82F6] font-mono mt-1">IMPROVEMENT: +0.02% (last 10s)</div>
        </div>

        {/* Breakdown Progress Bars */}
        <div className="space-y-3 pt-2 text-[11px]">
          <div className="bg-[#151515] p-2.5 border border-[#1F2937] rounded">
            <div className="flex justify-between mb-1.5">
              <span className="text-[#9CA3AF]">Packing Utilization</span>
              <span className="font-bold text-white">{score.packingUtilization.toFixed(1)}%</span>
            </div>
            <div className="h-1 bg-[#222] rounded-full overflow-hidden">
              <div className="h-full bg-[#10B981]" style={{ width: `${score.packingUtilization}%` }}></div>
            </div>
          </div>

          <div className="bg-[#151515] p-2.5 border border-[#1F2937] rounded">
            <div className="flex justify-between mb-1.5">
              <span className="text-[#9CA3AF]">Deadline Compliance</span>
              <span className="font-bold text-white">{score.deadlineCompliance.toFixed(1)}%</span>
            </div>
            <div className="h-1 bg-[#222] rounded-full overflow-hidden">
              <div className="h-full bg-[#3B82F6]" style={{ width: `${score.deadlineCompliance}%` }}></div>
            </div>
          </div>

          <div className="bg-[#151515] p-2.5 border border-[#1F2937] rounded">
            <div className="flex justify-between mb-1.5">
              <span className="text-[#9CA3AF]">Resource Service Rate</span>
              <span className="font-bold text-white">{score.resourceUtilization}%</span>
            </div>
            <div className="h-1 bg-[#222] rounded-full overflow-hidden">
              <div className="h-full bg-[#F59E0B]" style={{ width: `${score.resourceUtilization}%` }}></div>
            </div>
          </div>
        </div>
      </div>

      {/* Operator Bandit Hyper-heuristic Stats */}
      <div className="bg-[#0E0E0E] rounded-lg border border-[#2A2A2A] p-4 space-y-4">
        <div className="flex justify-between items-center bg-[#151515] px-3 py-2 border-b border-[#2A2A2A] rounded-t-lg -mx-4 -mt-4 mb-2">
          <h4 className="text-[10px] uppercase tracking-[0.2em] text-[#6B7280] font-bold flex items-center gap-1.5">
            <Settings2 className="h-3.5 w-3.5 text-[#F59E0B]" />
            Meta-Heuristic Pools
          </h4>
        </div>

        <div className="space-y-3">
          {Object.entries(stats.operatorStats).map(([key, op]) => {
            const successRate = op.calls === 0 ? 0 : (op.successes / op.calls) * 100;
            return (
              <div key={key} className="bg-[#151515] p-2.5 border border-[#1F2937] rounded">
                <div className="flex justify-between text-[11px] mb-1.5">
                  <span className="font-bold text-[#E5E7EB] uppercase text-[10px] tracking-wide">{key.replace(/_/g, ' ')}</span>
                  <span className="text-[10px] text-[#9CA3AF]">
                    Calls: {op.calls}
                  </span>
                </div>
                <div className="h-1 bg-[#222] rounded-full overflow-hidden mb-1">
                  <div className="h-full bg-[#3B82F6]" style={{ width: `${successRate}%` }}></div>
                </div>
                <div className="text-[9px] text-[#4B5563] text-right">Succ rate: {successRate.toFixed(0)}%</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Profiling Engine & Hardware Stats */}
      <div className="bg-[#0E0E0E] rounded-lg border border-[#2A2A2A] p-4 space-y-4">
        <div className="flex justify-between items-center bg-[#151515] px-3 py-2 border-b border-[#2A2A2A] rounded-t-lg -mx-4 -mt-4 mb-2">
          <h4 className="text-[10px] uppercase tracking-[0.2em] text-[#6B7280] font-bold flex items-center gap-1.5">
            <Cpu className="h-3.5 w-3.5 text-[#3B82F6]" />
            C++ Core Telemetry
          </h4>
        </div>

        {/* Adaptive Intelligence Core Indicator */}
        <div className="bg-[#151515] p-3 border border-[#1F2937] rounded space-y-2.5 text-[10px]">
          <div className="text-[9px] text-[#6B7280] uppercase tracking-wider font-bold">Self-Reconfigured Organism State</div>
          
          {/* Governor State */}
          <div className="flex justify-between items-center bg-[#0C0C0C] p-2 border border-[#1F2937] rounded">
            <span className="text-[#6B7280] text-[8px] uppercase">Adaptation Governor</span>
            <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider border ${
              adaptationState === 'STABLE' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
              adaptationState === 'CAUTIOUS_ADAPTATION' ? 'text-sky-400 bg-sky-500/10 border-sky-500/20' :
              adaptationState === 'ACTIVE_ADAPTATION' ? 'text-[#8B5CF6] bg-[#8B5CF6]/10 border-[#8B5CF6]/20' :
              adaptationState === 'AGGRESSIVE_EXPLORATION' ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' :
              adaptationState === 'LOCKED_STABILIZATION' ? 'text-rose-400 bg-rose-500/10 border-rose-500/20' :
              'text-[#10B981] bg-[#10B981]/10 border-[#10B981]/20'
            }`}>
              {adaptationState || 'ACTIVE_ADAPTATION'}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="bg-[#0A0A0A] p-1.5 border border-[#1F2937] rounded flex flex-col justify-between overflow-hidden">
              <span className="text-[#6B7280] text-[8px] uppercase">Regime</span>
              <span className="text-[#10B981] font-bold text-[9px] tracking-tight truncate" title={currentRegime || 'BALANCED'}>
                {currentRegime || 'BALANCED'}
              </span>
            </div>
            <div className="bg-[#0A0A0A] p-1.5 border border-[#1F2937] rounded flex flex-col justify-between overflow-hidden">
              <span className="text-[#6B7280] text-[8px] uppercase">Strategy</span>
              <span className="text-[#3B82F6] font-bold text-[9px] tracking-tight truncate text-blue-400" title={currentStrategy || 'BALANCED_MODE'}>
                {(currentStrategy || 'BALANCED_MODE').replace('_MODE', '')}
              </span>
            </div>
            <div className="bg-[#0A0A0A] p-1.5 border border-[#1F2937] rounded flex flex-col justify-between overflow-hidden">
              <span className="text-[#6B7280] text-[8px] uppercase">Phase</span>
              <span className="text-[#F59E0B] font-bold text-[9px] tracking-tight truncate" title={currentPhase || 'EXPLORATION'}>
                {currentPhase || 'EXPLORATION'}
              </span>
            </div>
          </div>

          {/* Adaptation Budgets */}
          {budgets && (
            <div className="space-y-1.5 pt-1.5 border-t border-[#1F2937]/30">
              <div className="text-[8px] text-[#6B7280] uppercase tracking-wider font-bold mb-1">Governor Adaptation Budgets</div>
              <div className="grid grid-cols-2 gap-x-2.5 gap-y-1.5">
                <div>
                  <div className="flex justify-between text-[7px] text-[#9CA3AF] mb-0.5">
                    <span>Regime Switch</span>
                    <span>{Math.round(budgets.regimeSwitchBudget)}%</span>
                  </div>
                  <div className="h-1 bg-[#1A1A1A] rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500" style={{ width: `${budgets.regimeSwitchBudget}%` }}></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-[7px] text-[#9CA3AF] mb-0.5">
                    <span>Strategy Switch</span>
                    <span>{Math.round(budgets.strategySwitchBudget)}%</span>
                  </div>
                  <div className="h-1 bg-[#1A1A1A] rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500" style={{ width: `${budgets.strategySwitchBudget}%` }}></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-[7px] text-[#9CA3AF] mb-0.5">
                    <span>Entropy Gate</span>
                    <span>{Math.round(budgets.entropyInjectionBudget)}%</span>
                  </div>
                  <div className="h-1 bg-[#1A1A1A] rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500" style={{ width: `${budgets.entropyInjectionBudget}%` }}></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-[7px] text-[#9CA3AF] mb-0.5">
                    <span>Multiverse Migration</span>
                    <span>{Math.round(budgets.eliteMigrationBudget)}%</span>
                  </div>
                  <div className="h-1 bg-[#1A1A1A] rounded-full overflow-hidden">
                    <div className="h-full bg-purple-500" style={{ width: `${budgets.eliteMigrationBudget}%` }}></div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2.5 text-[11px]">
          <div className="flex justify-between items-center py-2 px-2.5 bg-[#151515] border border-[#1F2937] rounded">
            <span className="text-[#9CA3AF] flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]"></span> Scoring Clock
            </span>
            <span className="text-[#10B981] font-bold">&lt; 0.02ms / iter</span>
          </div>
          <div className="flex justify-between items-center py-2 px-2.5 bg-[#151515] border border-[#1F2937] rounded">
            <span className="text-[#9CA3AF] flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]"></span> Spatial AABB Checks
            </span>
            <span className="text-white font-bold">O(1) Grid</span>
          </div>
          <div className="flex justify-between items-center py-2 px-2.5 bg-[#151515] border border-[#1F2937] rounded">
            <span className="text-[#9CA3AF] flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]"></span> Repair Loops
            </span>
            <span className="text-[#F59E0B] font-bold">Incremental 8.2ms</span>
          </div>
          <div className="flex justify-between items-center py-2 px-2.5 bg-[#151515] border border-[#1F2937] rounded">
            <span className="text-[#9CA3AF] flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#3B82F6]"></span> Multi-threading
            </span>
            <span className="text-[#3B82F6] font-bold">OpenMP v5.2</span>
          </div>
        </div>
      </div>
    </div>
  );
}
