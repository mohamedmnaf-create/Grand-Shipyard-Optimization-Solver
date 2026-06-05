#pragma once

#include "model/model.hpp"
#include "packing/packing.hpp"

class RepairEngine
{
private:
    PackingOptimizer* packingOpt;

public:
    RepairEngine(PackingOptimizer* opt) : packingOpt(opt) {}

    std::vector<Placement> repair(const std::vector<Placement>& placements, const std::vector<Block>& blocks)
    {
        std::vector<Placement> repaired = placements;
        
        // Loop through and incrementally fix overlapping coordinates
        for (auto& pl : repaired)
        {
            const Block* b = nullptr;
            for (const auto& bl : blocks)
            {
                if (bl.id == pl.blockId)
                {
                    b = &bl;
                    break;
                }
            }

            if (!b) continue;

            if (!packingOpt->isValid(*b, pl, repaired))
            {
                // Push it to ground or next best corner
                pl = packingOpt->findPlacement(*b, repaired);
            }
        }

        return repaired;
    }
};
