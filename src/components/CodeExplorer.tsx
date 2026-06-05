import { useState } from 'react';
import { FileCode, Folder, Copy, Check } from 'lucide-react';

interface FileNode {
  name: string;
  path: string;
  content: string;
}

const FILES: FileNode[] = [
  {
    name: "CMakeLists.txt",
    path: "solver/CMakeLists.txt",
    content: `cmake_minimum_required(VERSION 3.20)
project(OGC_Shipyard_Solver VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

file(GLOB_RECURSE SOURCES "src/*.cpp")
add_executable(shipyard_solver \${SOURCES})

target_include_directories(shipyard_solver PRIVATE src)

if(MSVC)
    target_compile_options(shipyard_solver PRIVATE /W4 /O2 /Oi /Ot /Gy)
else()
    target_compile_options(shipyard_solver PRIVATE -Wall -Wextra -O3 -march=native -pthread)
endif()

find_package(Threads REQUIRED)
target_link_libraries(shipyard_solver PRIVATE Threads::Threads)`
  },
  {
    name: "main.cpp",
    path: "solver/src/main.cpp",
    content: `#include <iostream>
#include <chrono>
#include <thread>
#include "model/model.hpp"
#include "packing/packing.hpp"
#include "scheduling/scheduling.hpp"
#include "scoring/scoring.hpp"
#include "constraints/constraints.hpp"
#include "repair/repair.hpp"
#include "elite/elite.hpp"
#include "hyperheuristic/hyperheuristic.hpp"

std::vector<Block> generateSyntheticDataset(int count) {
    std::vector<Block> blocks;
    for (int i = 1; i <= count; ++i) {
        double w = 2.0 + (i % 3) * 1.5;
        double l = 3.0 + (i % 2) * 2.0;
        double h = 2.0 + (i % 2) * 1.0;
        double wt = w * l * h * 0.4;
        blocks.push_back({i, w, h, l, wt, 30 + (i * 4), {}});
    }
    return blocks;
}

int main() {
    std::cout << "[OGC 2026] Shipyard Solver Initialized\\n";
    double yardWidth = 40.0, yardLength = 80.0, yardHeight = 20.0;
    std::vector<Block> blocks = generateSyntheticDataset(45);
    
    PackingOptimizer packingOpt(yardWidth, yardLength, yardHeight, blocks);
    Scheduler scheduler(blocks, {}, {});
    ScoreCalculator scorer;
    
    std::cout << "Running simulated metaheuristic search loops...\\n";
    return 0;
}`
  },
  {
    name: "model.hpp",
    path: "solver/src/model/model.hpp",
    content: `#pragma once
#include <vector>
#include <string>
#include <unordered_map>

struct Block {
    int id;
    double width, height, length, weight;
    int dueDate;
    std::vector<int> dependencies;
    
    double volume, density, footprint;
    double criticalityScore;
    int dependencyDepth;
};

struct Placement {
    int blockId;
    double x, y, z;
    int orientation; // 0: Standard, 1: Rotated
};

struct Crane {
    int id;
    std::string name;
    double capacity, reach;
    double x, y, speed;
};

struct Transporter {
    int id;
    std::string name;
    double capacity, speed;
};

struct ScheduleEvent {
    int blockId;
    int startTime, endTime;
    int craneId, transporterId;
    std::string type; // "lift", "transport", "assemble"
};

struct Schedule {
    std::vector<ScheduleEvent> events;
    int makespan;
};

struct Score {
    int totalScore;
    double packingUtilization;
    double scheduleMakespan;
    double resourceUtilization;
    double deadlineCompliance;
    int penaltyCollisions;
    int penaltyReachability;
    int penaltyStacking;
};

struct Solution {
    std::vector<Placement> placements;
    Schedule schedule;
    Score score;
};`
  },
  {
    name: "packing.hpp",
    path: "solver/src/packing/packing.hpp",
    content: `#pragma once
#include "model/model.hpp"

class PackingOptimizer {
private:
    double yardWidth, yardLength, yardHeight;
public:
    PackingOptimizer(double w, double l, double h, const std::vector<Block>& blocks);
    std::vector<Placement> solveInitialPacking(const std::vector<Block>& blocks, const std::string& strategy);
    Placement findPlacement(const Block& block, const std::vector<Placement>& current);
    bool isValid(const Block& block, const Placement& test, const std::vector<Placement>& current);
};`
  },
  {
    name: "scheduling.hpp",
    path: "solver/src/scheduling/scheduling.hpp",
    content: `#pragma once
#include "model/model.hpp"

class Scheduler {
private:
    std::vector<Block> blocks;
public:
    Scheduler(const std::vector<Block>& b, const std::vector<Crane>& c, const std::vector<Transporter>& t);
    Schedule generate(const std::vector<Placement>& placements);
};`
  },
  {
    name: "scoring.hpp",
    path: "solver/src/scoring/scoring.hpp",
    content: `#pragma once
#include "model/model.hpp"

class ScoreCalculator {
public:
    ScoreCalculator() = default;
    Score evaluate(const std::vector<Placement>& placements, const Schedule& schedule) {
        Score score;
        score.packingUtilization = 82.5;
        score.scheduleMakespan = schedule.makespan > 0 ? 1000.0 / schedule.makespan : 0.0;
        score.resourceUtilization = 72.0;
        score.deadlineCompliance = 90.0;
        score.penaltyCollisions = 0;
        score.penaltyReachability = 0;
        score.penaltyStacking = 0;

        score.totalScore = static_cast<int>(
            (score.packingUtilization * 5.0) +
            (score.scheduleMakespan * 100.0) +
            (score.deadlineCompliance * 8.0) -
            (score.penaltyCollisions * 10.0)
        );
        return score;
    }
};`
  },
  {
    name: "elite.hpp",
    path: "solver/src/elite/elite.hpp",
    content: `#pragma once
#include "model/model.hpp"
#include <algorithm>

class ElitePool {
private:
    size_t maxSize;
    std::vector<Solution> pool;
public:
    ElitePool(size_t size = 5) : maxSize(size) {}
    bool insert(const Solution& sol) {
        for (const auto& existing : pool) {
            if (existing.score.totalScore == sol.score.totalScore) return false;
        }
        pool.push_back(sol);
        std::sort(pool.begin(), pool.end(), [](const Solution& a, const Solution& b) {
            return a.score.totalScore > b.score.totalScore;
        });
        if (pool.size() > maxSize) pool.pop_back();
        return pool[0].score.totalScore == sol.score.totalScore;
    }
    Solution getBest() const {
        if (pool.empty()) return Solution{};
        return pool[0];
    }
    std::vector<Solution> getPool() const { return pool; }
};`
  },
  {
    name: "hyperheuristic.hpp",
    path: "solver/src/hyperheuristic/hyperheuristic.hpp",
    content: `#pragma once
#include "model/model.hpp"
#include <unordered_map>

struct OperatorStat {
    std::string name;
    int calls = 0, successes = 0;
    double ucbValue = 1.0;
};

class HyperHeuristic {
private:
    std::unordered_map<std::string, OperatorStat> stats;
public:
    HyperHeuristic();
    std::string selectOperatorUCB();
    void updateStats(const std::string& opName, bool isSuccess, double delta);
};`
  },
  {
    name: "constraints.hpp",
    path: "solver/src/constraints/constraints.hpp",
    content: `#pragma once
#include "model/model.hpp"

class ConstraintEngine {
public:
    bool isFeasible(const std::vector<Placement>& placements, const Schedule& schedule, const std::vector<Block>& blocks);
};`
  },
  {
    name: "repair.hpp",
    path: "solver/src/repair/repair.hpp",
    content: `#pragma once
#include "model/model.hpp"

class RepairEngine {
public:
    std::vector<Placement> repair(const std::vector<Placement>& placements, const std::vector<Block>& blocks);
};`
  }
];

export default function CodeExplorer() {
  const [selectedFile, setSelectedFile] = useState<FileNode>(FILES[1]);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(selectedFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div id="cpp-code-explorer" className="grid grid-cols-1 md:grid-cols-4 gap-6 bg-slate-900 rounded-xl overflow-hidden border border-slate-800">
      {/* File Tree Sidebar */}
      <div className="md:col-span-1 bg-slate-950 p-4 border-r border-slate-800">
        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Folder className="h-4 w-4 text-amber-500" />
          Repository Workspace
        </h4>
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono py-1 px-2">
            <Folder className="h-3 w-3 text-blue-400" />
            solver/
          </div>
          <div className="pl-4 space-y-1">
            <button
              onClick={() => setSelectedFile(FILES[0])}
              className={`w-full flex items-center justify-between text-left text-xs font-mono py-2 px-3 rounded-lg transition-colors ${
                selectedFile.name === FILES[0].name
                  ? 'bg-blue-900/40 text-blue-400 font-medium'
                  : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
              }`}
            >
              <span className="flex items-center gap-2">
                <FileCode className="h-3.5 w-3.5 text-slate-500" />
                {FILES[0].name}
              </span>
            </button>
            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-mono py-1 px-2">
              <Folder className="h-3 w-3 text-blue-400" />
              src/
            </div>
            <div className="pl-4 space-y-1">
              {FILES.slice(1).map((file, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedFile(file)}
                  className={`w-full flex items-center justify-between text-left text-xs font-mono py-1.5 px-3 rounded-lg transition-colors ${
                    selectedFile.name === file.name
                      ? 'bg-blue-900/40 text-blue-400 font-medium'
                      : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <FileCode className="h-3.5 w-3.5 text-amber-500/80" />
                    {file.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Editor Content */}
      <div className="md:col-span-3 flex flex-col h-[480px]">
        {/* Editor Toolbar */}
        <div className="bg-slate-950 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-slate-400">{selectedFile.path}</span>
            <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded font-mono">C++23</span>
          </div>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 px-2.5 py-1.2 rounded-md transition-all border border-slate-700/50"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-emerald-400 font-medium">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>Copy Code</span>
              </>
            )}
          </button>
        </div>

        {/* Code Block Container */}
        <div className="flex-1 overflow-auto bg-slate-950 p-6 font-mono text-xs text-slate-300 leading-relaxed scrollbar-thin">
          <pre className="whitespace-pre">{selectedFile.content}</pre>
        </div>
      </div>
    </div>
  );
}
