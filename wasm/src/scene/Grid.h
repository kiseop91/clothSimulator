#pragma once

#include <GLES3/gl3.h>
#include <glm/glm.hpp>
#include "renderer/Shader.h"

class Grid {
public:
    Grid();
    ~Grid();

    void init();
    void render(const glm::mat4& viewMat, const glm::mat4& projMat);
    void destroy();

    Shader& getShader() { return shader_; }

private:
    GLuint vao_;
    GLuint vbo_;
    int vertexCount_;
    Shader shader_;
};
