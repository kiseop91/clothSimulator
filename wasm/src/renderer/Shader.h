#pragma once

#include <GLES3/gl3.h>
#include <glm/glm.hpp>
#include <string>
#include <unordered_map>

class Shader {
public:
    Shader();
    ~Shader();

    bool compile(const char* vertSrc, const char* fragSrc);
    void use() const;
    void destroy();

    void setMat4(const std::string& name, const glm::mat4& mat) const;
    void setVec3(const std::string& name, const glm::vec3& vec) const;
    void setFloat(const std::string& name, float value) const;

    GLuint getProgram() const { return program_; }

private:
    GLuint program_;
    mutable std::unordered_map<std::string, GLint> uniformCache_;

    GLint getUniformLocation(const std::string& name) const;
    GLuint compileShader(GLenum type, const char* src);
};
