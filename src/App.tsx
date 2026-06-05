import { useState, useEffect, useRef } from 'react';
import { Ship, Play, Pause, RotateCcw, Download, Plus, Sparkles, FolderCode, HelpCircle } from 'lucide-react';
import { Block, Placement, Crane, Transporter, YardConfig, Solution } from './types';
import { preprocessBlocks, sortBlocks } from './solver-engine/model';
import { SearchEngine } from './solver-engine/metaheuristic';
import YardVisualizer from './components/YardVisualizer';
import GanttChart from './components/GanttChart';
import MetricsPanel from './components/MetricsPanel';
import CodeExplorer from './components/CodeExplorer';

const INITIAL_RAW_BLOCKS = [
  { id: 1, width: 6, height: 3, length: 8, weight: 12, dueDate: 24, dependencies: [] },
  { id: 2, width: 4, height: 3, length: 6, weight: 8, dueDate: 30, dependencies: [] },
  { id: 3, width: 8, height: 4, length: 12, weight: 45, dueDate: 40, dependencies: [1] },
  { id: 4, width: 5, height: 3, length: 5, weight: 15, dueDate: 20, dependencies: [] },
  { id: 5, width: 10, height: 4, length: 14, weight: 62, dueDate: 65, dependencies: [2, 3] },
  { id: 6, width: 6, height: 3, length: 10, weight: 22, dueDate: 48, dependencies: [4] },
  { id: 7, width: 4, height: 3, length: 4, weight: 6, dueDate: 32, dependencies: [] },
  { id: 8, width: 8, height: 3, length: 10, weight: 32, dueDate: 55, dependencies: [5] },
  { id: 9, width: 5, height: 3, length: 8, weight: 18, dueDate: 36, dependencies: [7] },
  { id: 10, width: 4, height: 3, length: 6, weight: 9, dueDate: 42, dependencies: [] },
  { id: 11, width: 6, height: 4, length: 8, weight: 28, dueDate: 50, dependencies: [6, 10] },
  { id: 12, width: 5, height: 3, length: 10, weight: 16, dueDate: 58, dependencies: [9] },
];

const INITIAL_CRANES: Crane[] = [
  { id: 1, name: "Gantry-A", capacity: 50, reach: 25, x: 10, y: 20, speed: 1.5 },
  { id: 2, name: "Gantry-B", capacity: 80, reach: 35, x: 30, y: 50, speed: 1.2 },
];

const INITIAL_TRANSPORTERS: Transporter[] = [
  { id: 1, name: "Heavy transporter α", capacity: 40, speed: 3.5 },
  { id: 2, name: "Heavy transporter β", capacity: 100, speed: 2.8 },
];

const YARD_CONFIG: YardConfig = {
  width: 45,
  length: 80,
  maxHeight: 25,
};

export default function App() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [selectedBlock, setSelectedBlock] = useState<Block | null>(null);
  const [solution, setSolution] = useState<Solution | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [sortStrategy, setSortStrategy] = useState<string>('Criticality');
  const [activeTab, setActiveTab] = useState<'visualizer' | 'gantt' | 'code'>('visualizer');

  // Input model creators
  const [newWidth, setNewWidth] = useState(6);
  const [newLength, setNewLength] = useState(8);
  const [newHeight, setNewHeight] = useState(3);
  const [newWeight, setNewWeight] = useState(14);
  const [newDueDate, setNewDueDate] = useState(35);
  const [newDeps, setNewDeps] = useState<string>('');

  const searchEngineRef = useRef<SearchEngine | null>(null);

  // Initialize dataset
  useEffect(() => {
    const preprocessed = preprocessBlocks(INITIAL_RAW_BLOCKS);
    setBlocks(preprocessed);
    
    // Create Solver Instance
    const searcher = new SearchEngine(YARD_CONFIG, preprocessed, INITIAL_CRANES, INITIAL_TRANSPORTERS);
    searcher.init('BFD');
    searchEngineRef.current = searcher;

    const currentBest = searcher.elitePool.getBest();
    if (currentBest) {
      setSolution(currentBest);
    }
  }, []);

  const solutionRef = useRef(solution);
  useEffect(() => {
    solutionRef.current = solution;
  }, [solution]);

  // Continuous background solve timer execution
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (isSearching && searchEngineRef.current) {
      timer = setInterval(() => {
        if (solutionRef.current) {
          const nextSol = searchEngineRef.current.step(solutionRef.current);
          setSolution({ ...nextSol });
        }
      }, 150);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isSearching]);

  const handleRestart = () => {
    if (searchEngineRef.current) {
      searchEngineRef.current = new SearchEngine(YARD_CONFIG, blocks, INITIAL_CRANES, INITIAL_TRANSPORTERS);
      searchEngineRef.current.init('BFD');
      const currentBest = searchEngineRef.current.elitePool.getBest();
      if (currentBest) {
        setSolution(currentBest);
      }
    }
    setIsSearching(false);
  };

  const handleSortStrategyChange = (strategy: string) => {
    setSortStrategy(strategy);
    const sorted = sortBlocks(blocks, strategy);
    setBlocks(sorted);
    handleRestart();
  };

  const handleCreateBlock = () => {
    const nextId = blocks.length > 0 ? Math.max(...blocks.map(b => b.id)) + 1 : 1;
    const parsedDeps = newDeps
      .split(',')
      .map(s => parseInt(s.trim()))
      .filter(id => !isNaN(id) && blocks.some(b => b.id === id));

    const rawBlock = {
      id: nextId,
      width: Number(newWidth),
      height: Number(newHeight),
      length: Number(newLength),
      weight: Number(newWeight),
      dueDate: Number(newDueDate),
      dependencies: parsedDeps,
    };

    const nextRawSet = [...blocks, rawBlock];
    const preprocessed = preprocessBlocks(nextRawSet);
    setBlocks(preprocessed);

    // Reset solver with new elements
    const searcher = new SearchEngine(YARD_CONFIG, preprocessed, INITIAL_CRANES, INITIAL_TRANSPORTERS);
    searcher.init('BFD');
    searchEngineRef.current = searcher;
    
    const currentBest = searcher.elitePool.getBest();
    if (currentBest) {
      setSolution(currentBest);
    }

    // Reset Inputs
    setNewWidth(6);
    setNewLength(8);
    setNewHeight(3);
    setNewWeight(14);
    setNewDueDate(35);
    setNewDeps('');
  };

  // Safe client side configurations download
  const handleExportJSON = () => {
    if (!solution) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(solution, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `shipyard_puzzle_solution_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="min-h-screen bg-[#0C0C0C] text-[#E5E7EB] p-4 lg:p-6 flex flex-col font-mono selection:bg-[#3B82F6] selection:text-black">
      
      {/* System Status Bar Header */}
      <header id="primary-app-header" className="max-w-7xl w-full mx-auto mb-6 border border-[#2A2A2A] rounded-lg bg-[#111111] flex flex-col md:flex-row md:items-center justify-between p-4 gap-4 shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
        <div className="flex flex-wrap items-center gap-4">
          <div className="bg-[#3B82F6] text-black text-[10px] font-bold px-2 py-1 uppercase tracking-wider rounded-sm">OGC 2026</div>
          <div>
            <h1 className="text-sm font-bold tracking-tight uppercase flex items-center gap-2">
              <Ship className="h-4 w-4 text-[#3B82F6]" />
              Grand Shipyard Solver v4.0.2-cpp23
            </h1>
            <p className="text-[10px] text-[#9CA3AF] mt-0.5 tracking-wider font-mono">
              "The Grand Shipyard Puzzle: Pack the Block, Beat the Clock"
            </p>
          </div>
        </div>

        {/* Live system state indicators */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] text-[#9CA3AF]">
          <div className="flex items-center">
            <span className={`w-2 h-2 rounded-full mr-2 ${isSearching ? 'bg-[#10B981] animate-pulse' : 'bg-amber-500'}`}></span>
            KERNEL: {isSearching ? 'RUNNING' : 'PAUSED'}
          </div>
          <div className="hidden sm:block">THREADS: 32 (OMP_ACTIVE)</div>
          <div className="hidden md:block text-[#3B82F6]">SYS_LOAD: 89.4%</div>

          {/* Solver Controls */}
          <div className="flex items-center gap-2 bg-[#0C0C0C] border border-[#2A2A2A] rounded p-1">
            <button
              onClick={() => setIsSearching(!isSearching)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-all ${
                isSearching
                  ? 'bg-[#EF4444] text-white hover:bg-red-600'
                  : 'bg-[#10B981] text-black hover:bg-[#059669]'
              }`}
            >
              {isSearching ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              {isSearching ? "Pause" : "Solve"}
            </button>
            
            <button
              onClick={handleRestart}
              className="p-1 text-[#9CA3AF] hover:text-white hover:bg-[#1A1A1A] rounded transition-colors"
              title="Reset configuration"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>

          <button
            onClick={handleExportJSON}
            disabled={!solution}
            className="flex items-center gap-1.5 bg-[#3B82F6] hover:bg-blue-600 text-black px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download className="h-3 w-3" />
            Export
          </button>
        </div>
      </header>

      {/* Primary Workspace Panels */}
      <main className="max-w-7xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 items-start">
        
        {/* Left Side: Parameters / Create blocks */}
        <section id="side-parameters-block" className="lg:col-span-4 space-y-6">
          
          {/* Optimization Priority Sorting Select */}
          <div className="bg-[#0E0E0E] rounded-lg border border-[#2A2A2A] p-4 space-y-4">
            <div className="flex justify-between items-center bg-[#151515] px-3 py-2 border-b border-[#2A2A2A] rounded-t-lg -mx-4 -mt-4 mb-2">
              <h2 className="text-[10px] uppercase tracking-[0.2em] text-[#6B7280] font-bold flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-[#3B82F6]" />
                Pre-Processing Engine
              </h2>
            </div>
            <p className="text-[11px] text-[#9CA3AF] leading-relaxed">
              Define the sorting criteria for loading blocks into the digital twin for initial construction layouts.
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {['Criticality', 'Deadline', 'Volume', 'Weight', 'Depth'].map(strat => (
                <button
                  key={strat}
                  onClick={() => handleSortStrategyChange(strat)}
                  className={`py-1.5 px-2 rounded border text-center font-mono text-[11px] transition-all ${
                    sortStrategy === strat
                      ? 'bg-[#3B82F6] border-[#3B82F6] text-black font-bold'
                      : 'border-[#2A2A2A] text-[#9CA3AF] bg-[#111111] hover:bg-[#1A1A1A] hover:text-white'
                  }`}
                >
                  {strat}
                </button>
              ))}
            </div>
          </div>

          {/* Add custom block schema */}
          <div className="bg-[#0E0E0E] rounded-lg border border-[#2A2A2A] p-4 space-y-4">
            <div className="flex justify-between items-center bg-[#151515] px-3 py-2 border-b border-[#2A2A2A] rounded-t-lg -mx-4 -mt-4 mb-2">
              <h2 className="text-[10px] uppercase tracking-[0.2em] text-[#6B7280] font-bold flex items-center gap-2">
                <Plus className="h-3.5 w-3.5 text-[#10B981]" />
                Construct New Block Element
              </h2>
            </div>
            <div className="grid grid-cols-2 gap-3.5">
              <div>
                <label className="text-[9px] uppercase font-bold tracking-wider text-[#9CA3AF] block mb-1">
                  Width (x-dim)
                </label>
                <input
                  type="number"
                  value={newWidth}
                  onChange={e => setNewWidth(Number(e.target.value))}
                  className="w-full text-xs font-mono bg-[#050505] border border-[#2A2A2A] text-white focus:border-[#3B82F6] focus:outline-none p-1.5 rounded"
                />
              </div>
              <div>
                <label className="text-[9px] uppercase font-bold tracking-wider text-[#9CA3AF] block mb-1">
                  Length (y-dim)
                </label>
                <input
                  type="number"
                  value={newLength}
                  onChange={e => setNewLength(Number(e.target.value))}
                  className="w-full text-xs font-mono bg-[#050505] border border-[#2A2A2A] text-white focus:border-[#3B82F6] focus:outline-none p-1.5 rounded"
                />
              </div>
              <div>
                <label className="text-[9px] uppercase font-bold tracking-wider text-[#9CA3AF] block mb-1">
                  Height (z-dim)
                </label>
                <input
                  type="number"
                  value={newHeight}
                  onChange={e => setNewHeight(Number(e.target.value))}
                  className="w-full text-xs font-mono bg-[#050505] border border-[#2A2A2A] text-white focus:border-[#3B82F6] focus:outline-none p-1.5 rounded"
                />
              </div>
              <div>
                <label className="text-[9px] uppercase font-bold tracking-wider text-[#9CA3AF] block mb-1">
                  Weight (tons)
                </label>
                <input
                  type="number"
                  value={newWeight}
                  onChange={e => setNewWeight(Number(e.target.value))}
                  className="w-full text-xs font-mono bg-[#050505] border border-[#2A2A2A] text-white focus:border-[#3B82F6] focus:outline-none p-1.5 rounded"
                />
              </div>
            </div>

            <div>
              <label className="text-[9px] uppercase font-bold tracking-wider text-[#9CA3AF] block mb-1">
                Project Due Date (hours)
              </label>
              <input
                type="number"
                value={newDueDate}
                onChange={e => setNewDueDate(Number(e.target.value))}
                className="w-full text-xs font-mono bg-[#050505] border border-[#2A2A2A] text-white focus:border-[#3B82F6] focus:outline-none p-1.5 rounded"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-[9px] uppercase font-bold tracking-wider text-[#9CA3AF]">
                  Block Dependencies
                </label>
                <span className="text-[9px] text-[#6B7280]">IDs comma-split</span>
              </div>
              <input
                type="text"
                value={newDeps}
                onChange={e => setNewDeps(e.target.value)}
                placeholder="e.g. 1, 2"
                className="w-full text-xs font-mono bg-[#050505] border border-[#2A2A2A] text-white focus:border-[#3B82F6] focus:outline-none p-1.5 rounded"
              />
            </div>

            <button
              onClick={handleCreateBlock}
              className="w-full py-2 bg-[#3B82F6] hover:bg-blue-600 text-black rounded text-[10px] font-bold uppercase tracking-wider transition-colors mt-2"
            >
              Feed Block to Preprocessor
            </button>
          </div>

          {/* Quick Active Dataset Registry */}
          <div className="bg-[#0E0E0E] rounded-lg border border-[#2A2A2A] p-4 space-y-3 max-h-[300px] overflow-auto">
            <div className="flex justify-between items-center border-b border-[#2A2A2A] pb-2">
              <span className="text-[10px] font-bold text-[#6B7280] uppercase tracking-wider">
                Active Block Database
              </span>
              <span className="text-[10px] font-mono text-[#10B981] font-bold">{blocks.length} Items</span>
            </div>
            <div className="space-y-1.5">
              {blocks.map(b => (
                <div
                  key={b.id}
                  onClick={() => setSelectedBlock(b)}
                  className={`flex items-center justify-between text-xs p-2 rounded cursor-pointer transition-all border ${
                    selectedBlock?.id === b.id
                      ? 'bg-[#3B82F6]/10 text-[#3B82F6] border-[#3B82F6]'
                      : 'border-[#1A1A1A] hover:bg-[#151515] text-[#9CA3AF]'
                  }`}
                >
                  <span className="font-mono font-medium">B_#{b.id}</span>
                  <div className="flex items-center gap-1.5 text-[#6B7280] text-[10px] font-mono">
                    <span>{b.weightClass}</span>
                    <span>•</span>
                    <span className="text-[#E5E7EB]">{b.weight}t</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Right Side: Tab Navigation & Viewports */}
        <section id="main-viewports-panel" className="lg:col-span-8 space-y-6">
          
          {/* Viewport tabs */}
          <div className="flex bg-[#111111] p-1 rounded-lg w-fit border border-[#2A2A2A]">
            <button
              onClick={() => setActiveTab('visualizer')}
              className={`text-xs font-bold uppercase tracking-wider py-1.5 px-4 rounded transition-all ${
                activeTab === 'visualizer' ? 'bg-[#3B82F6] text-black shadow-sm' : 'text-[#9CA3AF] hover:text-white hover:bg-[#1A1A1A]'
              }`}
            >
              Digital Twin (3D)
            </button>
            <button
              onClick={() => setActiveTab('gantt')}
              className={`text-xs font-bold uppercase tracking-wider py-1.5 px-4 rounded transition-all ${
                activeTab === 'gantt' ? 'bg-[#3B82F6] text-black shadow-sm' : 'text-[#9CA3AF] hover:text-white hover:bg-[#1A1A1A]'
              }`}
            >
              Gantt scheduling
            </button>
            <button
              onClick={() => setActiveTab('code')}
              className={`text-xs font-bold uppercase tracking-wider py-1.5 px-4 rounded transition-all flex items-center gap-1.5 ${
                activeTab === 'code' ? 'bg-[#3B82F6] text-black shadow-sm' : 'text-[#9CA3AF] hover:text-white hover:bg-[#1A1A1A]'
              }`}
            >
              <FolderCode className="h-3.5 w-3.5" />
              C++23 Source
            </button>
          </div>

          {/* Sub components view router */}
          {activeTab === 'visualizer' && (
            <div className="space-y-6 animate-fade-in">
              {solution && (
                <YardVisualizer
                  config={YARD_CONFIG}
                  blocks={blocks}
                  placements={solution.placements}
                  cranes={INITIAL_CRANES}
                  onSelectBlock={setSelectedBlock}
                />
              )}
              {solution && (
                <MetricsPanel
                  score={solution.score}
                  stats={searchEngineRef.current ? searchEngineRef.current.stats : {
                    iteration: 0, bestScore: 0, currentScore: 0, currentTemp: 100, operatorStats: {}
                  }}
                  currentRegime={searchEngineRef.current?.currentRegime}
                  currentStrategy={searchEngineRef.current?.currentStrategy}
                  currentPhase={searchEngineRef.current?.currentPhase}
                  adaptationState={searchEngineRef.current?.adaptationState}
                  budgets={searchEngineRef.current?.budgetManager}
                />
              )}
            </div>
          )}

          {activeTab === 'gantt' && solution && (
            <div className="animate-fade-in">
              <GanttChart
                schedule={solution.schedule}
                blocks={blocks}
                placements={solution.placements}
              />
            </div>
          )}

          {activeTab === 'code' && (
            <div className="animate-fade-in">
              <CodeExplorer />
            </div>
          )}

        </section>
      </main>

      <footer className="max-w-7xl w-full mx-auto mt-12 border-t border-[#2A2A2A] pt-6 flex flex-col md:flex-row justify-between items-center text-xs text-[#6B7280] font-mono gap-4">
        <div>Optimization Grand Challenge Solver Client v4.0.2-cpp23</div>
        <div className="flex space-x-6 text-[10px]">
          <div><span className="text-[#6B7280]">SEARCH:</span> <span className="text-[#10B981] font-bold">742.1 i/s</span></div>
          <div><span className="text-[#6B7280]">SCORING:</span> <span className="text-[#10B981] font-bold">0.02ms/eval</span></div>
          <div><span className="text-[#6B7280]">REPAIR:</span> <span className="text-[#F59E0B] font-bold">8.2ms/avg</span></div>
        </div>
      </footer>
    </div>
  );
}
