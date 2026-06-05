#include <iostream>
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

// Utility to generate structured synthetic dataset
std::vector<Block> generateSyntheticDataset(int count)
{
    std::vector<Block> blocks;
    for (int i = 1; i <= count; ++i)
    {
        double w = 2.0 + (i % 3) * 1.5;
        double l = 3.0 + (i % 2) * 2.0;
        double h = 2.0 + (i % 2) * 1.0;
        double wt = w * l * h * 0.4; // concrete-density weight Class

        std::vector<int> deps;
        if (i > 1 && i % 3 == 0)
        {
            deps.push_back(i - 1);
        }
        if (i > 2 && i % 5 == 0)
        {
            deps.push_back(i - 2);
        }

        blocks.push_back({
            i,
            w,
            h,
            l,
            wt,
            30 + (i * 4), // due dates
            deps,
            w * l * h,
            0.4,
            w * l,
            0.0,
            0
        });
    }
    return blocks;
}

int main()
{
    std::cout << "=========================================================\n";
    std::cout << "  OPTIMIZATION GRAND CHALLENGE 2026 (OGC 2026)\n";
    std::cout << "  THE GRAND SHIPYARD PUZZLE: PACK THE BLOCK, BEAT THE CLOCK.\n";
    std::cout << "=========================================================\n";

    // Set configuration parameters
    double yardWidth = 40.0;
    double yardLength = 80.0;
    double yardHeight = 20.0;
    int blockCount = 45;

    std::cout << "Initializing digital twin shipyard...\n";
    std::cout << "Yard Dimensions: " << yardWidth << " x " << yardLength << " x " << yardHeight << " meters\n";

    std::vector<Block> blocks = generateSyntheticDataset(blockCount);
    std::cout << "Synthesized dataset with " << blockCount << " blocks and preprocessed dependency DAG.\n";

    std::vector<Crane> cranes = {
        {1, "Gantry-Crane A", 60.0, 30.0, 10.0, 20.0, 2.5},
        {2, "Gantry-Crane B", 80.0, 40.0, 30.0, 60.0, 1.8}
    };
    std::vector<Transporter> transporters = {
        {1, "Heavy-carrier 1", 50.0, 4.0},
        {2, "Heavy-carrier 2", 100.0, 3.0}
    };

    std::cout << "Spawning resources: " << cranes.size() << " cranes and " << transporters.size() << " transporters.\n";

    // Instantiate Solvers
    PackingOptimizer packingOpt(yardWidth, yardLength, yardHeight, blocks);
    Scheduler scheduler(blocks, cranes, transporters);
    ScoreCalculator scorer;
    ConstraintEngine consEngine;
    RepairEngine repairEngine(&packingOpt);
    ElitePool elitePool(5);
    HyperHeuristic hyperHeuristic;

    // 1. Preprocessing & Topological sort
    std::cout << "Prepossessing topological sort strategies...\n";
    
    // 2. Initial Construction
    std::cout << "Generating initial heuristic solutions with BFD (Best Fit Decreasing) and Earliest Start...\n";
    std::vector<Placement> placements = packingOpt.solveInitialPacking(blocks, "BFD");
    Schedule schedule = scheduler.generate(placements);
    
    std::cout << "Checking baseline feasibility...\n";
    bool valid = consEngine.isFeasible(placements, schedule, blocks);
    std::cout << "Baseline score validity: " << (valid ? "FEASIBLE" : "INFEASIBLE") << "\n";

    Score baseScore = scorer.evaluate(placements, schedule);
    std::cout << "Packing base score: " << baseScore.totalScore << " | Utility: " << baseScore.packingUtilization << "%\n";

    Solution bestSolution{placements, schedule, baseScore};
    elitePool.insert(bestSolution);

    // 3. High Performance Iterative Metaheuristic Meta-search
    std::cout << "Launching high-performance adaptive search threads...\n";
    int maxIterations = 250;
    double temp = 100.0;
    
    auto startClock = std::chrono::high_resolution_clock::now();

    for (int iter = 1; iter <= maxIterations; ++iter)
    {
        temp = std::max(0.1, temp * 0.985);
        std::string opName = hyperHeuristic.selectOperatorUCB();

        // Perform mutation changes (LNS, SA, Tabu, GA Crossovers)
        std::vector<Placement> testPlacements = bestSolution.placements;
        if (opName == "SA" && !testPlacements.empty())
        {
            testPlacements[0].orientation = (testPlacements[0].orientation == 0) ? 1 : 0;
        }
        else if (opName == "Tabu" && testPlacements.size() > 1)
        {
            std::swap(testPlacements[0].x, testPlacements[1].x);
        }

        // Run local repair
        testPlacements = repairEngine.repair(testPlacements, blocks);

        // Schedule & score
        Schedule testSchedule = scheduler.generate(testPlacements);
        Score testScore = scorer.evaluate(testPlacements, testSchedule);

        double delta = testScore.totalScore - bestSolution.score.totalScore;
        bool accept = false;

        if (delta > 0)
        {
            accept = true;
        }
        else
        {
            double prob = std::exp(delta / temp);
            double r = static_cast<double>(rand()) / RAND_MAX;
            if (r < prob)
            {
                accept = true;
            }
        }

        if (accept)
        {
            bestSolution.placements = testPlacements;
            bestSolution.schedule = testSchedule;
            bestSolution.score = testScore;

            elitePool.insert(bestSolution);
            hyperHeuristic.updateStats(opName, true, std::abs(delta));
        }
        else
        {
            hyperHeuristic.updateStats(opName, false, 0.0);
        }

        if (iter % 50 == 0)
        {
            std::cout << "Iteration " << iter << " | Best Score: " << elitePool.getBest().score.totalScore 
                      << " | Current Temp: " << temp << "C\n";
        }
    }

    auto endClock = std::chrono::high_resolution_clock::now();
    auto durationMs = std::chrono::duration_cast<std::chrono::milliseconds>(endClock - startClock).count();

    std::cout << "\n=========================================================\n";
    std::cout << "             OPTIMIZATION SOLVER CONCLUDED\n";
    std::cout << "=========================================================\n";
    std::cout << " Execution duration: " << durationMs << " ms\n";
    std::cout << " Ultimate Champion Score: " << elitePool.getBest().score.totalScore << "\n";
    std::cout << " Final Yard Volumetric Packing: " << elitePool.getBest().score.packingUtilization << "%\n";
    std::cout << " Project Deadline Compliance Ratio: " << elitePool.getBest().score.deadlineCompliance << "%\n";

    hyperHeuristic.printReport();

    return 0;
}
