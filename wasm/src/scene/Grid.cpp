#include "scene/Grid.h"
#include "renderer/ShaderSources.h"
#include <vector>

Grid::Grid() : vao_(0), vbo_(0), vertexCount_(0) {}

Grid::~Grid() {
    destroy();
}

void Grid::init() {
    // Compile grid shader
    shader_.compile(ShaderSources::gridVertexShader, ShaderSources::gridFragmentShader);

    // Generate grid lines on XZ plane from -10 to 10, step 1
    std::vector<float> vertices;
    const float extent = 10.0f;
    const float step = 1.0f;

    for (float i = -extent; i <= extent; i += step) {
        // Lines parallel to X axis (along Z)
        vertices.push_back(-extent); vertices.push_back(0.0f); vertices.push_back(i);
        vertices.push_back(extent);  vertices.push_back(0.0f); vertices.push_back(i);

        // Lines parallel to Z axis (along X)
        vertices.push_back(i); vertices.push_back(0.0f); vertices.push_back(-extent);
        vertices.push_back(i); vertices.push_back(0.0f); vertices.push_back(extent);
    }

    vertexCount_ = static_cast<int>(vertices.size() / 3);

    glGenVertexArrays(1, &vao_);
    glGenBuffers(1, &vbo_);

    glBindVertexArray(vao_);

    glBindBuffer(GL_ARRAY_BUFFER, vbo_);
    glBufferData(GL_ARRAY_BUFFER, vertices.size() * sizeof(float), vertices.data(), GL_STATIC_DRAW);

    // aPosition at location 0
    glEnableVertexAttribArray(0);
    glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, 3 * sizeof(float), (void*)0);

    glBindVertexArray(0);
}

void Grid::render(const glm::mat4& viewMat, const glm::mat4& projMat) {
    shader_.use();
    shader_.setMat4("u_view", viewMat);
    shader_.setMat4("u_projection", projMat);

    glEnable(GL_BLEND);
    glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);

    glBindVertexArray(vao_);
    glDrawArrays(GL_LINES, 0, vertexCount_);
    glBindVertexArray(0);

    glDisable(GL_BLEND);
}

void Grid::destroy() {
    shader_.destroy();
    if (vbo_) { glDeleteBuffers(1, &vbo_); vbo_ = 0; }
    if (vao_) { glDeleteVertexArrays(1, &vao_); vao_ = 0; }
}
