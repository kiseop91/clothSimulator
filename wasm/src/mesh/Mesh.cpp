#include "mesh/Mesh.h"

Mesh::Mesh()
    : vao_(0), vbo_(0), ebo_(0)
    , vertexCount_(0), indexCount_(0)
    , visible_(true), dynamic_(false)
{
}

Mesh::~Mesh() {
    cleanup();
}

void Mesh::init(const MeshData& data) {
    initInternal(data, GL_STATIC_DRAW);
}

void Mesh::initDynamic(const MeshData& data) {
    dynamic_ = true;
    initInternal(data, GL_DYNAMIC_DRAW);
}

void Mesh::initInternal(const MeshData& data, GLenum vboUsage) {
    vertexCount_ = static_cast<int>(data.vertices.size());
    indexCount_ = static_cast<int>(data.indices.size());

    glGenVertexArrays(1, &vao_);
    glGenBuffers(1, &vbo_);
    glGenBuffers(1, &ebo_);

    glBindVertexArray(vao_);

    // Upload vertex data
    glBindBuffer(GL_ARRAY_BUFFER, vbo_);
    glBufferData(GL_ARRAY_BUFFER,
                 data.vertices.size() * sizeof(Vertex),
                 data.vertices.data(),
                 vboUsage);

    // Upload index data (always static - topology doesn't change)
    glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, ebo_);
    glBufferData(GL_ELEMENT_ARRAY_BUFFER,
                 data.indices.size() * sizeof(uint32_t),
                 data.indices.data(),
                 GL_STATIC_DRAW);

    // aPosition at location 0
    glEnableVertexAttribArray(0);
    glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, sizeof(Vertex),
                          (void*)offsetof(Vertex, position));

    // aNormal at location 1
    glEnableVertexAttribArray(1);
    glVertexAttribPointer(1, 3, GL_FLOAT, GL_FALSE, sizeof(Vertex),
                          (void*)offsetof(Vertex, normal));

    glBindVertexArray(0);
}

void Mesh::updateVertices(const std::vector<Vertex>& vertices) {
    if (!dynamic_ || vbo_ == 0) return;

    glBindBuffer(GL_ARRAY_BUFFER, vbo_);
    glBufferSubData(GL_ARRAY_BUFFER, 0,
                    vertices.size() * sizeof(Vertex),
                    vertices.data());
    glBindBuffer(GL_ARRAY_BUFFER, 0);
}

void Mesh::render() {
    if (!visible_ || indexCount_ == 0) return;

    glBindVertexArray(vao_);
    glDrawElements(GL_TRIANGLES, indexCount_, GL_UNSIGNED_INT, 0);
    glBindVertexArray(0);
}

glm::mat4 Mesh::getModelMatrix() const {
    glm::mat4 model(1.0f);
    model = glm::translate(model, position_);
    model = glm::rotate(model, glm::radians(rotation_.x), glm::vec3(1, 0, 0));
    model = glm::rotate(model, glm::radians(rotation_.y), glm::vec3(0, 1, 0));
    model = glm::rotate(model, glm::radians(rotation_.z), glm::vec3(0, 0, 1));
    model = glm::scale(model, scale_);
    return model;
}

void Mesh::cleanup() {
    if (ebo_) { glDeleteBuffers(1, &ebo_); ebo_ = 0; }
    if (vbo_) { glDeleteBuffers(1, &vbo_); vbo_ = 0; }
    if (vao_) { glDeleteVertexArrays(1, &vao_); vao_ = 0; }
    vertexCount_ = 0;
    indexCount_ = 0;
}
