#include "renderer/Shader.h"
#include <glm/gtc/type_ptr.hpp>
#include <emscripten.h>
#include <vector>

Shader::Shader() : program_(0) {}

Shader::~Shader() {
    destroy();
}

bool Shader::compile(const char* vertSrc, const char* fragSrc) {
    GLuint vert = compileShader(GL_VERTEX_SHADER, vertSrc);
    if (!vert) return false;

    GLuint frag = compileShader(GL_FRAGMENT_SHADER, fragSrc);
    if (!frag) {
        glDeleteShader(vert);
        return false;
    }

    program_ = glCreateProgram();
    glAttachShader(program_, vert);
    glAttachShader(program_, frag);
    glLinkProgram(program_);

    GLint linked;
    glGetProgramiv(program_, GL_LINK_STATUS, &linked);
    if (!linked) {
        GLint len;
        glGetProgramiv(program_, GL_INFO_LOG_LENGTH, &len);
        std::vector<char> log(len);
        glGetProgramInfoLog(program_, len, nullptr, log.data());
        emscripten_log(EM_LOG_ERROR, "Shader link error: %s", log.data());
        glDeleteProgram(program_);
        program_ = 0;
    }

    glDeleteShader(vert);
    glDeleteShader(frag);

    return program_ != 0;
}

void Shader::use() const {
    glUseProgram(program_);
}

void Shader::destroy() {
    if (program_) {
        glDeleteProgram(program_);
        program_ = 0;
    }
    uniformCache_.clear();
}

void Shader::setMat4(const std::string& name, const glm::mat4& mat) const {
    glUniformMatrix4fv(getUniformLocation(name), 1, GL_FALSE, glm::value_ptr(mat));
}

void Shader::setVec3(const std::string& name, const glm::vec3& vec) const {
    glUniform3fv(getUniformLocation(name), 1, glm::value_ptr(vec));
}

void Shader::setFloat(const std::string& name, float value) const {
    glUniform1f(getUniformLocation(name), value);
}

void Shader::setInt(const std::string& name, int value) const {
    glUniform1i(getUniformLocation(name), value);
}

GLint Shader::getUniformLocation(const std::string& name) const {
    auto it = uniformCache_.find(name);
    if (it != uniformCache_.end()) {
        return it->second;
    }
    GLint loc = glGetUniformLocation(program_, name.c_str());
    uniformCache_[name] = loc;
    return loc;
}

GLuint Shader::compileShader(GLenum type, const char* src) {
    GLuint shader = glCreateShader(type);
    glShaderSource(shader, 1, &src, nullptr);
    glCompileShader(shader);

    GLint compiled;
    glGetShaderiv(shader, GL_COMPILE_STATUS, &compiled);
    if (!compiled) {
        GLint len;
        glGetShaderiv(shader, GL_INFO_LOG_LENGTH, &len);
        std::vector<char> log(len);
        glGetShaderInfoLog(shader, len, nullptr, log.data());
        const char* typeStr = (type == GL_VERTEX_SHADER) ? "vertex" : "fragment";
        emscripten_log(EM_LOG_ERROR, "Shader compile error (%s): %s", typeStr, log.data());
        glDeleteShader(shader);
        return 0;
    }

    return shader;
}
