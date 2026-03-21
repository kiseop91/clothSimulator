#pragma once

#include <glm/glm.hpp>
#include <vector>

class Scene;

class DrillAnimator {
public:
    // JS sends: [meshIdx, numWaypoints, x1,z1,t1, x2,z2,t2, ...] repeated
    void setAnimations(const float* data, int count);
    void setTime(float t);  // 0..1
    void update(Scene& scene);
    void clear();

private:
    struct Waypoint {
        float x, z, t; // position and time (0..1)
    };

    struct Anim {
        int meshIdx;
        std::vector<Waypoint> waypoints;
    };

    std::vector<Anim> anims_;
    float time_ = 0.0f;
};
