#include "rink/DrillToken.h"
#include <cmath>

static const float PI = 3.14159265359f;

MeshData DrillToken::generate(Type type, glm::vec3 color) {
    switch (type) {
        case PLAYER: return generatePlayer(color);
        case PUCK:   return generatePuck();
        case CONE:   return generateCone();
        case COACH:  return generateCoach(color);
        default:     return generatePlayer(color);
    }
}

void DrillToken::addCylinder(MeshData& mesh, glm::vec3 base, float radius, float height,
                             glm::vec3 color, int segments) {
    uint32_t baseIdx = static_cast<uint32_t>(mesh.vertices.size());
    glm::vec3 top = base + glm::vec3(0.0f, height, 0.0f);

    // Bottom center
    mesh.vertices.push_back({base, glm::vec3(0, -1, 0), glm::vec2(0.5f, 0.5f)});
    // Top center
    mesh.vertices.push_back({top, glm::vec3(0, 1, 0), glm::vec2(0.5f, 0.5f)});

    // Side vertices (bottom ring + top ring)
    for (int i = 0; i <= segments; i++) {
        float angle = 2.0f * PI * static_cast<float>(i) / segments;
        float cs = cosf(angle);
        float sn = sinf(angle);
        glm::vec3 normal(cs, 0.0f, sn);
        glm::vec2 uv(static_cast<float>(i) / segments, 0.0f);

        mesh.vertices.push_back({base + glm::vec3(radius * cs, 0.0f, radius * sn), normal, uv});
        mesh.vertices.push_back({top + glm::vec3(radius * cs, 0.0f, radius * sn), normal, {uv.x, 1.0f}});
    }

    // Set color on all new vertices
    // (color is baked into the material, vertices use position/normal/texcoord)

    // Bottom cap
    for (int i = 0; i < segments; i++) {
        uint32_t a = baseIdx; // center
        uint32_t b = baseIdx + 2 + i * 2;
        uint32_t c = baseIdx + 2 + ((i + 1) % (segments + 1)) * 2;
        mesh.indices.push_back(a);
        mesh.indices.push_back(c);
        mesh.indices.push_back(b);
    }

    // Top cap
    for (int i = 0; i < segments; i++) {
        uint32_t a = baseIdx + 1; // center
        uint32_t b = baseIdx + 3 + i * 2;
        uint32_t c = baseIdx + 3 + ((i + 1) % (segments + 1)) * 2;
        mesh.indices.push_back(a);
        mesh.indices.push_back(b);
        mesh.indices.push_back(c);
    }

    // Side quads
    for (int i = 0; i < segments; i++) {
        uint32_t bl = baseIdx + 2 + i * 2;
        uint32_t tl = baseIdx + 3 + i * 2;
        uint32_t br = baseIdx + 2 + (i + 1) * 2;
        uint32_t tr = baseIdx + 3 + (i + 1) * 2;

        mesh.indices.push_back(bl);
        mesh.indices.push_back(br);
        mesh.indices.push_back(tl);
        mesh.indices.push_back(tl);
        mesh.indices.push_back(br);
        mesh.indices.push_back(tr);
    }
}

void DrillToken::addSphere(MeshData& mesh, glm::vec3 center, float radius,
                           glm::vec3 color, int stacks, int slices) {
    uint32_t baseIdx = static_cast<uint32_t>(mesh.vertices.size());

    for (int i = 0; i <= stacks; i++) {
        float phi = PI * static_cast<float>(i) / stacks;
        for (int j = 0; j <= slices; j++) {
            float theta = 2.0f * PI * static_cast<float>(j) / slices;
            float x = sinf(phi) * cosf(theta);
            float y = cosf(phi);
            float z = sinf(phi) * sinf(theta);

            glm::vec3 pos = center + glm::vec3(x, y, z) * radius;
            glm::vec3 normal(x, y, z);
            glm::vec2 uv(static_cast<float>(j) / slices, static_cast<float>(i) / stacks);

            mesh.vertices.push_back({pos, normal, uv});
        }
    }

    for (int i = 0; i < stacks; i++) {
        for (int j = 0; j < slices; j++) {
            uint32_t a = baseIdx + i * (slices + 1) + j;
            uint32_t b = baseIdx + (i + 1) * (slices + 1) + j;
            uint32_t c = baseIdx + (i + 1) * (slices + 1) + j + 1;
            uint32_t d = baseIdx + i * (slices + 1) + j + 1;

            mesh.indices.push_back(a);
            mesh.indices.push_back(b);
            mesh.indices.push_back(c);
            mesh.indices.push_back(a);
            mesh.indices.push_back(c);
            mesh.indices.push_back(d);
        }
    }
}

void DrillToken::addBox(MeshData& mesh, glm::vec3 center, glm::vec3 half,
                        glm::vec3 color) {
    uint32_t base = static_cast<uint32_t>(mesh.vertices.size());

    // 6 faces, 4 vertices each
    struct Face { glm::vec3 normal; glm::vec3 offsets[4]; };
    Face faces[] = {
        // Front (+Z)
        {{0,0,1}, {{-half.x,-half.y,half.z}, {half.x,-half.y,half.z}, {half.x,half.y,half.z}, {-half.x,half.y,half.z}}},
        // Back (-Z)
        {{0,0,-1}, {{half.x,-half.y,-half.z}, {-half.x,-half.y,-half.z}, {-half.x,half.y,-half.z}, {half.x,half.y,-half.z}}},
        // Top (+Y)
        {{0,1,0}, {{-half.x,half.y,half.z}, {half.x,half.y,half.z}, {half.x,half.y,-half.z}, {-half.x,half.y,-half.z}}},
        // Bottom (-Y)
        {{0,-1,0}, {{-half.x,-half.y,-half.z}, {half.x,-half.y,-half.z}, {half.x,-half.y,half.z}, {-half.x,-half.y,half.z}}},
        // Right (+X)
        {{1,0,0}, {{half.x,-half.y,half.z}, {half.x,-half.y,-half.z}, {half.x,half.y,-half.z}, {half.x,half.y,half.z}}},
        // Left (-X)
        {{-1,0,0}, {{-half.x,-half.y,-half.z}, {-half.x,-half.y,half.z}, {-half.x,half.y,half.z}, {-half.x,half.y,-half.z}}},
    };

    for (auto& face : faces) {
        uint32_t fbase = static_cast<uint32_t>(mesh.vertices.size());
        for (int i = 0; i < 4; i++) {
            mesh.vertices.push_back({center + face.offsets[i], face.normal, glm::vec2(0)});
        }
        mesh.indices.push_back(fbase);
        mesh.indices.push_back(fbase + 1);
        mesh.indices.push_back(fbase + 2);
        mesh.indices.push_back(fbase);
        mesh.indices.push_back(fbase + 2);
        mesh.indices.push_back(fbase + 3);
    }
}

MeshData DrillToken::generatePlayer(glm::vec3 color) {
    MeshData mesh;
    // Body: cylinder from Y=0 to Y=4
    addCylinder(mesh, glm::vec3(0, 0, 0), 1.5f, 4.0f, color, 12);
    // Head: sphere on top
    addSphere(mesh, glm::vec3(0, 5.0f, 0), 1.2f, color, 8, 12);
    return mesh;
}

MeshData DrillToken::generatePuck() {
    MeshData mesh;
    glm::vec3 black(0.1f, 0.1f, 0.1f);
    // Flat cylinder
    addCylinder(mesh, glm::vec3(0, 0, 0), 0.75f, 0.5f, black, 16);
    return mesh;
}

MeshData DrillToken::generateCone() {
    MeshData mesh;
    glm::vec3 orange(1.0f, 0.5f, 0.0f);
    // Truncated cone approximated as cylinder with small top
    addCylinder(mesh, glm::vec3(0, 0, 0), 1.2f, 3.0f, orange, 8);
    return mesh;
}

MeshData DrillToken::generateCoach(glm::vec3 color) {
    MeshData mesh;
    // Box body
    addBox(mesh, glm::vec3(0, 2.5f, 0), glm::vec3(1.5f, 2.5f, 1.0f), color);
    // Head sphere
    addSphere(mesh, glm::vec3(0, 6.0f, 0), 1.2f, color, 8, 12);
    return mesh;
}
