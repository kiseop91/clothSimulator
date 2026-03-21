#pragma once

#include <GLES3/gl3.h>
#include <glm/glm.hpp>
#include <vector>
#include "renderer/Shader.h"

class PathRenderer {
public:
    enum Style { SOLID = 0, DASHED = 1, ZIGZAG = 2, DOTTED = 3, BACKWARD = 4 };

    PathRenderer();
    ~PathRenderer();

    void init();
    // JS sends Float32Array: [style, r,g,b, hasArrow, N, x1,z1, x2,z2, ...] repeated
    void setPaths(const float* data, int floatCount);
    void render(const glm::mat4& view, const glm::mat4& proj);
    void clear();
    void destroy();

private:
    void buildVertices(const float* data, int count, std::vector<float>& outVerts);
    void addArrowHead(float x, float z, float dirX, float dirZ,
                      float r, float g, float b, std::vector<float>& verts);

    GLuint vao_, vbo_;
    int vertexCount_ = 0;
    Shader shader_;
};
