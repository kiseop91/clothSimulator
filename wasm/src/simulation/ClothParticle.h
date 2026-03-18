#pragma once

#include <glm/glm.hpp>

struct ClothParticle {
    glm::vec3 position;
    glm::vec3 prevPosition;
    glm::vec3 acceleration;
    float invMass;  // 0 = pinned, 1/mass = free
    bool pinned;

    ClothParticle()
        : position(0.0f), prevPosition(0.0f), acceleration(0.0f)
        , invMass(1.0f), pinned(false)
    {}

    ClothParticle(const glm::vec3& pos, bool pin = false)
        : position(pos), prevPosition(pos), acceleration(0.0f)
        , invMass(pin ? 0.0f : 1.0f), pinned(pin)
    {}
};
