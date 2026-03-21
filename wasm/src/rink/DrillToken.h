#pragma once

#include <glm/glm.hpp>
#include "mesh/MeshData.h"

class DrillToken {
public:
    enum Type { PLAYER = 0, PUCK = 1, CONE = 2, COACH = 3 };

    static MeshData generate(Type type, glm::vec3 color);

private:
    static MeshData generatePlayer(glm::vec3 color);
    static MeshData generatePuck();
    static MeshData generateCone();
    static MeshData generateCoach(glm::vec3 color);

    static void addCylinder(MeshData& mesh, glm::vec3 base, float radius, float height,
                           glm::vec3 color, int segments = 16);
    static void addSphere(MeshData& mesh, glm::vec3 center, float radius,
                         glm::vec3 color, int stacks = 8, int slices = 16);
    static void addBox(MeshData& mesh, glm::vec3 center, glm::vec3 halfExtents,
                      glm::vec3 color);
};
