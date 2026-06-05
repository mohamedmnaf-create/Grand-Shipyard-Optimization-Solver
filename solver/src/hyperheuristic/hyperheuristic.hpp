#pragma once

#include "model/model.hpp"
#include "packing/packing.hpp"
#include "scheduling/scheduling.hpp"
#include "scoring/scoring.hpp"
#include "repair/repair.hpp"
#include "elite/elite.hpp"
#include "constraints/constraints.hpp"
#include <random>
#include <cmath>
#include <iostream>

struct OperatorStat
{
    std::string name;
    int calls = 0;
    int successes = 0;
    double improvementSum = 0.0;
    double ucbValue = 1.0;
};

class HyperHeuristic
{
private:
    std::unordered_map<std::string, OperatorStat> stats;
    std::mt19937 rng;

public:
    HyperHeuristic()
    {
        stats["LNS"] = {"LNS", 0, 0, 0.0, 1.0};
        stats["SA"] = {"SA", 0, 0, 0.0, 1.0};
        stats["Tabu"] = {"Tabu", 0, 0, 0.0, 1.0};
        stats["GA"] = {"GA", 0, 0, 0.0, 1.0};
        
        std::random_device rd;
        rng.seed(rd());
    }

    std::string selectOperatorUCB()
    {
        std::string bestOp = "LNS";
        double bestVal = -1e9;

        int totalCalls = 0;
        for (const auto& [name, op] : stats)
        {
            totalCalls += op.calls;
        }
        totalCalls = std::max(1, totalCalls);

        double explorationCoeff = 2.0;

        for (const auto& [name, op] : stats)
        {
            double avgReward = (op.calls == 0) ? 1.0 : static_cast<double>(op.successes) / op.calls;
            double explorationValue = std::sqrt(std::log(totalCalls) / (op.calls + 0.1));
            double ucbVal = avgReward + explorationCoeff * explorationValue;

            if (ucbVal > bestVal)
            {
                bestVal = ucbVal;
                bestOp = name;
            }
        }

        return bestOp;
    }

    void updateStats(const std::string& opName, bool isSuccess, double delta)
    {
        auto& op = stats[opName];
        op.calls++;
        if (isSuccess)
        {
            op.successes++;
            op.improvementSum += delta;
        }
    }

    void printReport() const
    {
        std::cout << "\n=============================================\n";
        std::cout << "        HYPER-HEURISTIC OPERATOR SUCCESS LOG\n";
        std::cout << "=============================================\n";
        for (const auto& [name, op] : stats)
        {
            std::cout << " " << name << " -> Calls: " << op.calls
                      << " | Successes: " << op.successes
                      << " | Improv: " << op.improvementSum << "\n";
        }
        std::cout << "=============================================\n";
    }
};
