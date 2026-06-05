#pragma once

#include <vector>
#include <string>
#include <unordered_map>

// Core puzzle structures as specified in prompt

struct Block
{
    int id;

    double width;
    double height;
    double length;

    double weight;

    int dueDate;

    std::vector<int> dependencies;

    // Advanced pre-calculated features for heuristic sorting
    double volume;
    double density;
    double footprint;
    double criticalityScore;
    int dependencyDepth;
};

struct Placement
{
    int blockId;

    double x;
    double y;
    double z;

    int orientation; // 0: Standard, 1: Rotated
};

struct Crane
{
    int id;
    std::string name;
    double capacity;
    double reach;
    double x;
    double y;
    double speed;
};

struct Transporter
{
    int id;
    std::string name;
    double capacity;
    double speed;
};

struct ScheduleEvent
{
    int blockId;
    int startTime;
    int endTime;
    int craneId;
    int transporterId;
    std::string type; // "lift", "transport", "assemble"
};

struct Schedule
{
    std::vector<ScheduleEvent> events;
    int makespan;
};

struct Score
{
    int totalScore;
    double packingUtilization;
    double scheduleMakespan;
    double resourceUtilization;
    double deadlineCompliance;
    int penaltyCollisions;
    int penaltyReachability;
    int penaltyStacking;
};

struct Solution
{
    std::vector<Placement> placements;

    Schedule schedule;

    Score score;
};
