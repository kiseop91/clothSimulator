#pragma once

#include <glm/glm.hpp>

struct CollisionBody {
    glm::vec3 center;
    float radius;

    CollisionBody()
        : center(0.0f), radius(0.0f)
    {}

    CollisionBody(const glm::vec3& c, float r)
        : center(c), radius(r)
    {}
};
