#include "renderer/Shader.h"
#include <emscripten.h>

Shader::Shader() {}

Shader::~Shader() {
    destroy();
}

bool Shader::compile(wgpu::Device& device, const char* wgslSrc) {
    wgpu::ShaderSourceWGSL wgslDesc{};
    wgslDesc.code = wgslSrc;

    wgpu::ShaderModuleDescriptor desc{};
    desc.nextInChain = &wgslDesc;

    module_ = device.CreateShaderModule(&desc);
    if (!module_) {
        emscripten_log(EM_LOG_ERROR, "Failed to create shader module");
        return false;
    }

    return true;
}

void Shader::destroy() {
    module_ = nullptr;
}
