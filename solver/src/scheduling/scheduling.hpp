#pragma once

#include "model/model.hpp"
#include <algorithm>
#include <queue>

class Scheduler
{
private:
    std::vector<Block> blocks;
    std::vector<Crane> cranes;
    std::vector<Transporter> transporters;

public:
    Scheduler(const std::vector<Block>& b, const std::vector<Crane>& c, const std::vector<Transporter>& t)
        : blocks(b), cranes(c), transporters(t) {}

    Schedule generate(const std::vector<Placement>& placements)
    {
        Schedule sched;
        sched.makespan = 0;

        std::unordered_map<int, Placement> placementMap;
        for (const auto& p : placements)
        {
            placementMap[p.blockId] = p;
        }

        std::unordered_map<int, int> blockEndTime;
        std::unordered_map<int, int> craneFreeTime;
        std::unordered_map<int, int> transFreeTime;

        for (const auto& c : cranes) craneFreeTime[c.id] = 0;
        for (const auto& t : transporters) transFreeTime[t.id] = 0;

        // Sort blocks topologically
        std::vector<int> inDegree(blocks.size() + 10, 0);
        std::unordered_map<int, std::vector<int>> adj;

        for (const auto& b : blocks)
        {
            inDegree[b.id] = b.dependencies.size();
            for (int dep : b.dependencies)
            {
                adj[dep].push_back(b.id);
            }
        }

        // Topological queue
        std::queue<int> q;
        for (const auto& b : blocks)
        {
            if (inDegree[b.id] == 0) q.push(b.id);
        }

        while (!q.empty())
        {
            int currId = q.front();
            q.pop();

            // Earliest Start computation
            int depsEnd = 0;
            for (const auto& b : blocks)
            {
                if (b.id == currId)
                {
                    for (int depId : b.dependencies)
                    {
                        depsEnd = std::max(depsEnd, blockEndTime[depId]);
                    }
                    break;
                }
            }

            // Assign resource
            int chosenCrane = cranes.empty() ? 0 : cranes[0].id;
            int chosenTrans = transporters.empty() ? 0 : transporters[0].id;
            int actStart = std::max({depsEnd, craneFreeTime[chosenCrane], transFreeTime[chosenTrans]});
            int duration = 4; // average discrete steps

            int actEnd = actStart + duration;

            craneFreeTime[chosenCrane] = actEnd;
            transFreeTime[chosenTrans] = actEnd;
            blockEndTime[currId] = actEnd;

            sched.events.push_back({
                currId,
                actStart,
                actEnd,
                chosenCrane,
                chosenTrans,
                "lift"
            });

            sched.makespan = std::max(sched.makespan, actEnd);

            for (int nextId : adj[currId])
            {
                inDegree[nextId]--;
                if (inDegree[nextId] == 0)
                {
                    q.push(nextId);
                }
            }
        }

        return sched;
    }
};
