#pragma once

#include <webgpu/webgpu_cpp.h>
#include <glm/glm.hpp>

struct GridUniforms {
    glm::mat4 view;
    glm::mat4 projection;
};

class Grid {
public:
    Grid();
    ~Grid();

    void init(wgpu::Device& device, wgpu::TextureFormat surfaceFormat);
    void render(wgpu::RenderPassEncoder& pass, wgpu::Queue& queue,
                const glm::mat4& viewMat, const glm::mat4& projMat);
    void destroy();

    wgpu::ShaderModule getShaderModule() const { return shaderModule_; }

private:
    wgpu::Buffer vbo_;
    wgpu::Buffer uniformBuffer_;
    wgpu::BindGroup bindGroup_;
    wgpu::BindGroupLayout bindGroupLayout_;
    wgpu::RenderPipeline pipeline_;
    wgpu::ShaderModule shaderModule_;
    int vertexCount_;
};
