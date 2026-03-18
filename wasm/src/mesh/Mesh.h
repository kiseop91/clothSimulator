#pragma once

#include <GLES3/gl3.h>
#include <glm/glm.hpp>
#include <glm/gtc/matrix_transform.hpp>
#include "mesh/MeshData.h"
#include <string>

class Mesh {
public:
    Mesh();
    ~Mesh();

    void init(const MeshData& data);
    void initDynamic(const MeshData& data);
    void updateVertices(const std::vector<Vertex>& vertices);
    void render();
    void cleanup();

    int getVertexCount() const { return vertexCount_; }
    int getIndexCount() const { return indexCount_; }
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

private:
    void initInternal(const MeshData& data, GLenum vboUsage);

    GLuint vao_;
    GLuint vbo_;
    GLuint ebo_;
    int vertexCount_;
    int indexCount_;
    std::string name_;
    bool visible_;
    bool dynamic_;

    glm::vec3 position_ = glm::vec3(0.0f);
    glm::vec3 rotation_ = glm::vec3(0.0f);
    glm::vec3 scale_ = glm::vec3(1.0f);
};
