#pragma once

#include <glm/glm.hpp>
#include <vector>
#include <string>
#include "mesh/Mesh.h"
#include "material/Material.h"

class Scene {
public:
    Scene();
    ~Scene();

    void addMesh(Mesh* mesh);
    void removeMesh(int index);
    void clearScene();

    glm::mat4 getModelMatrix() const;

    // Transform setters
    void setPosition(float x, float y, float z);
    void setRotation(float x, float y, float z);
    void setScale(float x, float y, float z);

    // Stats
    int getVertexCount() const;
    int getFaceCount() const;
    int getTriangleCount() const;

    const std::vector<Mesh*>& getMeshes() const { return meshes_; }
    Material& getMaterial() { return material_; }
    const Material& getMaterial() const { return material_; }

    // Mesh data cache for collision computation
    void addMeshData(const MeshData& data) { meshDataCache_.push_back(data); }
    const std::vector<MeshData>& getMeshDataCache() const { return meshDataCache_; }
    void clearMeshDataCache() { meshDataCache_.clear(); }

private:
    std::vector<Mesh*> meshes_;
    std::vector<MeshData> meshDataCache_;
    Material material_;

    glm::vec3 position_;
    glm::vec3 rotation_; // Euler degrees
    glm::vec3 scale_;
};
