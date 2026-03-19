#pragma once

#include <webgpu/webgpu_cpp.h>
#include <string>

class Shader {
public:
    Shader();
    ~Shader();

    bool compile(wgpu::Device& device, const char* wgslSrc);
    wgpu::ShaderModule getModule() const { return module_; }
    void destroy();

private:
    wgpu::ShaderModule module_;
};
