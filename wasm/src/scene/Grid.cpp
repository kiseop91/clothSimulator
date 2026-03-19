#include "scene/Grid.h"
#include "renderer/ShaderSources.h"
#include <vector>
#include <cstring>

Grid::Grid() : vertexCount_(0) {}

Grid::~Grid() {
    destroy();
}

void Grid::init(wgpu::Device& device, wgpu::TextureFormat surfaceFormat) {
    // Compile shader
    {
        wgpu::ShaderSourceWGSL wgslDesc{};
        wgslDesc.code = ShaderSources::gridShader;
        wgpu::ShaderModuleDescriptor desc{};
        desc.nextInChain = &wgslDesc;
        shaderModule_ = device.CreateShaderModule(&desc);
    }

    // Generate grid lines on XZ plane from -10 to 10, step 1
    std::vector<float> vertices;
    const float extent = 10.0f;
    const float step = 1.0f;

    for (float i = -extent; i <= extent; i += step) {
        vertices.push_back(-extent); vertices.push_back(0.0f); vertices.push_back(i);
        vertices.push_back(extent);  vertices.push_back(0.0f); vertices.push_back(i);
        vertices.push_back(i); vertices.push_back(0.0f); vertices.push_back(-extent);
        vertices.push_back(i); vertices.push_back(0.0f); vertices.push_back(extent);
    }

    vertexCount_ = static_cast<int>(vertices.size() / 3);

    // Vertex buffer
    {
        wgpu::BufferDescriptor desc{};
        desc.size = vertices.size() * sizeof(float);
        desc.usage = wgpu::BufferUsage::Vertex | wgpu::BufferUsage::CopyDst;
        desc.mappedAtCreation = true;
        vbo_ = device.CreateBuffer(&desc);
        memcpy(vbo_.GetMappedRange(), vertices.data(), desc.size);
        vbo_.Unmap();
    }

    // Uniform buffer
    {
        wgpu::BufferDescriptor desc{};
        desc.size = sizeof(GridUniforms);
        desc.usage = wgpu::BufferUsage::Uniform | wgpu::BufferUsage::CopyDst;
        uniformBuffer_ = device.CreateBuffer(&desc);
    }

    // Bind group layout
    {
        wgpu::BindGroupLayoutEntry entry{};
        entry.binding = 0;
        entry.visibility = wgpu::ShaderStage::Vertex | wgpu::ShaderStage::Fragment;
        entry.buffer.type = wgpu::BufferBindingType::Uniform;
        entry.buffer.minBindingSize = sizeof(GridUniforms);

        wgpu::BindGroupLayoutDescriptor desc{};
        desc.entryCount = 1;
        desc.entries = &entry;
        bindGroupLayout_ = device.CreateBindGroupLayout(&desc);
    }

    // Bind group
    {
        wgpu::BindGroupEntry entry{};
        entry.binding = 0;
        entry.buffer = uniformBuffer_;
        entry.size = sizeof(GridUniforms);

        wgpu::BindGroupDescriptor desc{};
        desc.layout = bindGroupLayout_;
        desc.entryCount = 1;
        desc.entries = &entry;
        bindGroup_ = device.CreateBindGroup(&desc);
    }

    // Pipeline
    {
        wgpu::PipelineLayoutDescriptor plDesc{};
        plDesc.bindGroupLayoutCount = 1;
        plDesc.bindGroupLayouts = &bindGroupLayout_;
        auto pipelineLayout = device.CreatePipelineLayout(&plDesc);

        wgpu::VertexAttribute attr{};
        attr.format = wgpu::VertexFormat::Float32x3;
        attr.offset = 0;
        attr.shaderLocation = 0;

        wgpu::VertexBufferLayout vbl{};
        vbl.arrayStride = 3 * sizeof(float);
        vbl.stepMode = wgpu::VertexStepMode::Vertex;
        vbl.attributeCount = 1;
        vbl.attributes = &attr;

        wgpu::ColorTargetState colorTarget{};
        colorTarget.format = surfaceFormat;

        wgpu::BlendState blend{};
        blend.color.srcFactor = wgpu::BlendFactor::SrcAlpha;
        blend.color.dstFactor = wgpu::BlendFactor::OneMinusSrcAlpha;
        blend.color.operation = wgpu::BlendOperation::Add;
        blend.alpha.srcFactor = wgpu::BlendFactor::One;
        blend.alpha.dstFactor = wgpu::BlendFactor::OneMinusSrcAlpha;
        blend.alpha.operation = wgpu::BlendOperation::Add;
        colorTarget.blend = &blend;

        wgpu::FragmentState fragState{};
        fragState.module = shaderModule_;
        fragState.entryPoint = "fs_main";
        fragState.targetCount = 1;
        fragState.targets = &colorTarget;

        wgpu::DepthStencilState depthStencil{};
        depthStencil.format = wgpu::TextureFormat::Depth24Plus;
        depthStencil.depthWriteEnabled = wgpu::OptionalBool::False;
        depthStencil.depthCompare = wgpu::CompareFunction::Less;

        wgpu::RenderPipelineDescriptor desc{};
        desc.layout = pipelineLayout;
        desc.vertex.module = shaderModule_;
        desc.vertex.entryPoint = "vs_main";
        desc.vertex.bufferCount = 1;
        desc.vertex.buffers = &vbl;
        desc.fragment = &fragState;
        desc.primitive.topology = wgpu::PrimitiveTopology::LineList;
        desc.depthStencil = &depthStencil;

        pipeline_ = device.CreateRenderPipeline(&desc);
    }
}

void Grid::render(wgpu::RenderPassEncoder& pass, wgpu::Queue& queue,
                  const glm::mat4& viewMat, const glm::mat4& projMat) {
    GridUniforms uniforms{};
    uniforms.view = viewMat;
    uniforms.projection = projMat;
    queue.WriteBuffer(uniformBuffer_, 0, &uniforms, sizeof(uniforms));

    pass.SetPipeline(pipeline_);
    pass.SetBindGroup(0, bindGroup_);
    pass.SetVertexBuffer(0, vbo_);
    pass.Draw(vertexCount_);
}

void Grid::destroy() {
    pipeline_ = nullptr;
    bindGroup_ = nullptr;
    bindGroupLayout_ = nullptr;
    uniformBuffer_ = nullptr;
    vbo_ = nullptr;
    shaderModule_ = nullptr;
}
