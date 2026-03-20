#pragma once

#include <webgpu/webgpu_cpp.h>
#include <glm/glm.hpp>
#include <glm/gtc/matrix_transform.hpp>
#include "mesh/MeshData.h"
#include <string>

class Mesh {
public:
    Mesh();
    ~Mesh();

    void init(wgpu::Device& device, const MeshData& data);
    void initDynamic(wgpu::Device& device, const MeshData& data);
    void updateVertices(wgpu::Queue& queue, const std::vector<Vertex>& vertices);
    void updateWireVertices(wgpu::Queue& queue, const std::vector<Vertex>& vertices, const std::vector<uint32_t>& indices);

    wgpu::Buffer getVertexBuffer() const { return vbo_; }
    wgpu::Buffer getIndexBuffer() const { return ebo_; }
    wgpu::Buffer getWireVertexBuffer() const { return wireVbo_; }
    int getVertexCount() const { return vertexCount_; }
    int getIndexCount() const { return indexCount_; }
    int getWireVertexCount() const { return wireVertexCount_; }
    bool isDynamic() const { return dynamic_; }

    void setName(const std::string& name) { name_ = name; }
    const std::string& getName() const { return name_; }

    void setVisible(bool v) { visible_ = v; }
    bool isVisible() const { return visible_; }

    // Per-mesh transform
    void setMeshPosition(float x, float y, float z) { position_ = glm::vec3(x, y, z); }
    void setMeshRotation(float x, float y, float z) { rotation_ = glm::vec3(x, y, z); }
    void setMeshScale(float x, float y, float z) { scale_ = glm::vec3(x, y, z); }
    const glm::vec3& getMeshPosition() const { return position_; }
    const glm::vec3& getMeshRotation() const { return rotation_; }
    const glm::vec3& getMeshScale() const { return scale_; }
    glm::mat4 getModelMatrix() const;

    void cleanup();

    // Per-mesh material
    void setMaterial(const MaterialData& mat) { material_ = mat; }
    const MaterialData& getMaterial() const { return material_; }
    MaterialData& getMaterial() { return material_; }

    // Per-mesh texture (GPU)
    void setDiffuseTexture(wgpu::Texture tex, wgpu::TextureView view) {
        diffuseTexture_ = tex; diffuseTextureView_ = view; hasDiffuseTexture_ = true;
    }
    wgpu::TextureView getDiffuseTextureView() const { return diffuseTextureView_; }
    bool hasDiffuseTexture() const { return hasDiffuseTexture_; }

private:
    void initInternal(wgpu::Device& device, const MeshData& data);

    wgpu::Buffer vbo_;
    wgpu::Buffer ebo_;
    wgpu::Buffer wireVbo_;
    size_t wireVboSize_ = 0;
    int vertexCount_;
    int indexCount_;
    int wireVertexCount_;
    std::string name_;
    bool visible_;
    bool dynamic_;

    glm::vec3 position_ = glm::vec3(0.0f);
    glm::vec3 rotation_ = glm::vec3(0.0f);
    glm::vec3 scale_ = glm::vec3(1.0f);

    // Per-mesh material & texture
    MaterialData material_;
    wgpu::Texture diffuseTexture_;
    wgpu::TextureView diffuseTextureView_;
    bool hasDiffuseTexture_ = false;
};
