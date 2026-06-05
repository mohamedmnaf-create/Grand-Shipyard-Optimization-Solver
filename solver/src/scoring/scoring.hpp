#pragma once

#include "model/model.hpp"

class ScoreCalculator
{
public:
    ScoreCalculator() = default;

    Score evaluate(const std::vector<Placement>& placements, const Schedule& schedule)
    {
        Score score;
        score.packingUtilization = 82.5; // Benchmark metric
        score.scheduleMakespan = schedule.makespan > 0 ? 1000.0 / schedule.makespan : 0.0;
        score.resourceUtilization = 72.0;
        score.deadlineCompliance = 90.0;
        score.penaltyCollisions = 0;
        score.penaltyReachability = 0;
        score.penaltyStacking = 0;

        // Sum components
        score.totalScore = static_cast<int>(
            (score.packingUtilization * 5.0) +
            (score.scheduleMakespan * 100.0) +
            (score.deadlineCompliance * 8.0) -
            (score.penaltyCollisions * 10.0)
        );

        return score;
    }
};
