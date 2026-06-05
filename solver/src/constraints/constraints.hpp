#pragma once

#include "model/model.hpp"

class ConstraintEngine
{
public:
    ConstraintEngine() = default;

    bool isFeasible(const std::vector<Placement>& placements, const Schedule& schedule, const std::vector<Block>& blocks)
    {
        // 1. Dependency constraints validation
        std::unordered_map<int, int> endTimeMap;
        for (const auto& ev : schedule.events)
        {
            endTimeMap[ev.blockId] = ev.endTime;
        }

        std::unordered_map<int, Block> blockMap;
        for (const auto& b : blocks)
        {
            blockMap[b.id] = b;
        }

        for (const auto& ev : schedule.events)
        {
            auto bIt = blockMap.find(ev.blockId);
            if (bIt == blockMap.end()) continue;

            for (int depId : bIt->second.dependencies)
            {
                auto depEndIt = endTimeMap.find(depId);
                if (depEndIt == endTimeMap.end() || depEndIt->second > ev.startTime)
                {
                    return false; // Dependency violated
                }
            }
        }

        // 2. Overlap collision constraints
        for (size_t i = 0; i < placements.size(); ++i)
        {
            const auto& p1 = placements[i];
            auto b1It = blockMap.find(p1.blockId);
            if (b1It == blockMap.end()) continue;

            double w1 = (p1.orientation == 1) ? b1It->second.length : b1It->second.width;
            double l1 = (p1.orientation == 1) ? b1It->second.width : b1It->second.length;

            for (size_t j = i + 1; j < placements.size(); ++j)
            {
                const auto& p2 = placements[j];
                auto b2It = blockMap.find(p2.blockId);
                if (b2It == blockMap.end()) continue;

                double w2 = (p2.orientation == 1) ? b2It->second.length : b2It->second.width;
                double l2 = (p2.orientation == 1) ? b2It->second.width : b2It->second.length;

                bool overlapX = (p1.x < p2.x + w2) && (p1.x + w1 > p2.x);
                bool overlapY = (p1.y < p2.y + l2) && (p1.y + l1 > p2.y);
                bool overlapZ = (p1.z < p2.z + b2It->second.height) && (p1.z + b1It->second.height > p2.z);

                if (overlapX && overlapY && overlapZ)
                {
                    return false; // Physical spatial overlap conflict!
                }
            }
        }

        return true;
    }
};
