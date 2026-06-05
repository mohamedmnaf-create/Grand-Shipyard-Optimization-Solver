#pragma once

#include "model/model.hpp"

class PackingOptimizer
{
private:
    double yardWidth;
    double yardLength;
    double yardHeight;
    std::unordered_map<int, Block> blockMap;

public:
    PackingOptimizer(double width, double length, double height, const std::vector<Block>& blocks)
        : yardWidth(width), yardLength(length), yardHeight(height)
    {
        for (const auto& b : blocks)
        {
            blockMap[b.id] = b;
        }
    }

    std::vector<Placement> solveInitialPacking(const std::vector<Block>& blocks, const std::string& strategy)
    {
        std::vector<Placement> placements;
        std::vector<Block> sorted = blocks;

        if (strategy == "FFD" || strategy == "BFD")
        {
            std::sort(sorted.begin(), sorted.end(), [](const Block& a, const Block& b) {
                return (a.width * a.length * a.height) > (b.width * b.length * b.height);
            });
        }

        for (const auto& block : sorted)
        {
            Placement placement = findPlacement(block, placements);
            placements.push_back(placement);
        }

        return placements;
    }

    Placement findPlacement(const Block& block, const std::vector<Placement>& current)
    {
        Placement best{block.id, 0.0, 0.0, 0.0, 0};
        double bestVal = -1e9;

        // Candidate location testing: Corner-based approach or coordinate discretization
        std::vector<std::pair<double, double>> candidates = {{0.0, 0.0}};

        for (const auto& pl : current)
        {
            auto it = blockMap.find(pl.blockId);
            if (it == blockMap.end()) continue;
            double w = (pl.orientation == 1) ? it->second.length : it->second.width;
            double l = (pl.orientation == 1) ? it->second.width : it->second.length;

            candidates.push_back({pl.x + w, pl.y});
            candidates.push_back({pl.x, pl.y + l});
            candidates.push_back({pl.x + w, pl.y + l});
        }

        for (const auto& cand : candidates)
        {
            for (int orient = 0; orient <= 1; ++orient)
            {
                Placement test{block.id, cand.first, cand.second, 0.0, orient};
                if (isValid(block, test, current))
                {
                    double score = evaluate(block, test);
                    if (score > bestVal)
                    {
                        bestVal = score;
                        best = test;
                    }
                }
            }
        }

        return best;
    }

    bool isValid(const Block& block, const Placement& test, const std::vector<Placement>& current)
    {
        double tw = (test.orientation == 1) ? block.length : block.width;
        double tl = (test.orientation == 1) ? block.width : block.length;

        if (test.x < 0 || test.x + tw > yardWidth) return false;
        if (test.y < 0 || test.y + tl > yardLength) return false;

        // Collision check
        for (const auto& pl : current)
        {
            auto it = blockMap.find(pl.blockId);
            if (it == blockMap.end()) continue;
            double cw = (pl.orientation == 1) ? it->second.length : it->second.width;
            double cl = (pl.orientation == 1) ? it->second.width : it->second.length;

            bool xOverlap = (test.x < pl.x + cw) && (test.x + tw > pl.x);
            bool yOverlap = (test.y < pl.y + cl) && (test.y + tl > pl.y);

            if (xOverlap && yOverlap) return false;
        }

        return true;
    }

    double evaluate(const Block& b, const Placement& p)
    {
        // Minimize coordinate footprints, prefer corner packings
        return -0.05 * (p.x + p.y) - 0.2 * p.z + 0.1 * b.weight;
    }
};
