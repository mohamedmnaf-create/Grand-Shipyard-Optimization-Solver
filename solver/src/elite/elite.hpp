#pragma once

#include "model/model.hpp"
#include <algorithm>

class ElitePool
{
private:
    size_t maxSize;
    std::vector<Solution> pool;

public:
    ElitePool(size_t size = 5) : maxSize(size) {}

    bool insert(const Solution& sol)
    {
        // Avoid exact scoring matches
        for (const auto& existing : pool)
        {
            if (existing.score.totalScore == sol.score.totalScore)
            {
                return false;
            }
        }

        pool.push_back(sol);
        
        // Sort descending
        std::sort(pool.begin(), pool.end(), [](const Solution& a, const Solution& b) {
            return a.score.totalScore > b.score.totalScore;
        });

        if (pool.size() > maxSize)
        {
            pool.pop_back();
        }

        return pool[0].score.totalScore == sol.score.totalScore;
    }

    Solution getBest() const
    {
        if (pool.empty()) return Solution{};
        return pool[0];
    }

    std::vector<Solution> getPool() const { return pool; }
};
