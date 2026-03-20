#include "renderer/Renderer.h"
#include "renderer/ShaderSources.h"

#include "../../third_party/tinygltf/stb_image.h"

#include <emscripten.h>
#include <emscripten/html5.h>
#include <glm/gtc/matrix_transform.hpp>
#include <glm/gtc/type_ptr.hpp>
#include <vector>
#include <string>
#include <cstdlib>
#include <cmath>
#include <cstring>

// Base64 encoding table
static const char base64Chars[] =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

static std::string base64Encode(const std::vector<uint8_t>& data) {
    std::string result;
    result.reserve(((data.size() + 2) / 3) * 4);
    for (size_t i = 0; i < data.size(); i += 3) {
        uint32_t b = (static_cast<uint32_t>(data[i]) << 16);
        if (i + 1 < data.size()) b |= (static_cast<uint32_t>(data[i + 1]) << 8);
        if (i + 2 < data.size()) b |= static_cast<uint32_t>(data[i + 2]);
        result.push_back(base64Chars[(b >> 18) & 0x3F]);
        result.push_back(base64Chars[(b >> 12) & 0x3F]);
        result.push_back((i + 1 < data.size()) ? base64Chars[(b >> 6) & 0x3F] : '=');
        result.push_back((i + 2 < data.size()) ? base64Chars[b & 0x3F] : '=');
    }
    return result;
}

// Global renderer pointer for animation callback
static Renderer* g_renderer = nullptr;
Renderer* getGlobalRenderer() { return g_renderer; }
void setGlobalRenderer(Renderer* r) { g_renderer = r; }

// Animation frame callback
static void animFrameCallback(void* userData) {
    Renderer* renderer = static_cast<Renderer*>(userData);
    if (renderer) {
        renderer->stepAndRender(emscripten_performance_now());
    }
}

Renderer::Renderer()
    : width_(800), height_(600)
    , initialized_(false)
    , surfaceFormat_(wgpu::TextureFormat::BGRA8Unorm)
    , clothMesh_(nullptr)
    , sphereVertexCount_(0), selectedSphereIndex_(-1)
    , shadowMapSize_(1024)
    , hasTexture_(false)
    , wireframeMode_(false)
{
}

Renderer::~Renderer() {
    destroy();
}

bool Renderer::init(const std::string& canvasId) {
    instance_ = wgpu::CreateInstance(nullptr);
    if (!instance_) {
        emscripten_log(EM_LOG_ERROR, "Failed to create WebGPU instance");
        return false;
    }

    // Request adapter
    instance_.RequestAdapter(
        nullptr, wgpu::CallbackMode::AllowSpontaneous,
        [this, canvasId](wgpu::RequestAdapterStatus status, wgpu::Adapter adapter, wgpu::StringView message) {
            if (status != wgpu::RequestAdapterStatus::Success) {
                emscripten_log(EM_LOG_ERROR, "Failed to get WebGPU adapter");
                return;
            }
            adapter_ = adapter;

            wgpu::DeviceDescriptor deviceDesc{};
            deviceDesc.SetUncapturedErrorCallback(
                [](const wgpu::Device&, wgpu::ErrorType type, wgpu::StringView msg) {
                    auto* r = getGlobalRenderer();
                    if (r) r->incrementErrorCount();
                    emscripten_log(EM_LOG_ERROR, "WebGPU error (type=%d): %.*s",
                                   (int)type, (int)msg.length, msg.data);
                });
            deviceDesc.SetDeviceLostCallback(wgpu::CallbackMode::AllowSpontaneous,
                [](const wgpu::Device&, wgpu::DeviceLostReason reason, wgpu::StringView msg) {
                    auto* r = getGlobalRenderer();
                    if (r) r->setDeviceLost();
                    emscripten_log(EM_LOG_ERROR, "WebGPU device lost (reason=%d): %.*s",
                                   (int)reason, (int)msg.length, msg.data);
                });

            adapter_.RequestDevice(
                &deviceDesc, wgpu::CallbackMode::AllowSpontaneous,
                [this, canvasId](wgpu::RequestDeviceStatus status, wgpu::Device device, wgpu::StringView message) {
                    if (status != wgpu::RequestDeviceStatus::Success) {
                        emscripten_log(EM_LOG_ERROR, "Failed to get WebGPU device");
                        return;
                    }
                    device_ = device;
                    queue_ = device_.GetQueue();

                    // Create surface
                    std::string selector = canvasId;
                    if (!selector.empty() && selector[0] != '#') {
                        selector = "#" + selector;
                    }

                    wgpu::EmscriptenSurfaceSourceCanvasHTMLSelector canvasDesc{};
                    canvasDesc.selector = selector.c_str();
                    wgpu::SurfaceDescriptor surfDesc{};
                    surfDesc.nextInChain = &canvasDesc;
                    surface_ = instance_.CreateSurface(&surfDesc);

                    wgpu::SurfaceCapabilities caps{};
                    surface_.GetCapabilities(adapter_, &caps);
                    surfaceFormat_ = caps.formats[0];

                    wgpu::SurfaceConfiguration config{};
                    config.device = device_;
                    config.format = surfaceFormat_;
                    config.usage = wgpu::TextureUsage::RenderAttachment;
                    config.width = width_;
                    config.height = height_;
                    config.alphaMode = wgpu::CompositeAlphaMode::Auto;
                    config.presentMode = wgpu::PresentMode::Fifo;
                    surface_.Configure(&config);

                    // Create depth texture
                    {
                        wgpu::TextureDescriptor desc{};
                        desc.size = {(uint32_t)width_, (uint32_t)height_, 1};
                        desc.format = wgpu::TextureFormat::Depth24Plus;
                        desc.usage = wgpu::TextureUsage::RenderAttachment;
                        depthTexture_ = device_.CreateTexture(&desc);
                        depthView_ = depthTexture_.CreateView();
                    }

                    // Create dummy 1x1 white texture for when no diffuse is loaded
                    createDummyTexture();

                    // Create shadow map resources
                    createShadowResources();

                    // Create pipelines
                    createPipelines();

                    // Init grid
                    grid_.init(device_, surfaceFormat_);

                    // Init sphere wireframe
                    createSphereWireframe();

                    initialized_ = true;

                    // Start render loop
                    setGlobalRenderer(this);
                    emscripten_set_main_loop_arg(animFrameCallback, this, 0, false);

                    emscripten_log(EM_LOG_CONSOLE, "WebGPU Renderer initialized (format=%d)", (int)surfaceFormat_);
                });
        });

    return true; // async init
}

void Renderer::createDummyTexture() {
    wgpu::TextureDescriptor desc{};
    desc.size = {1, 1, 1};
    desc.format = wgpu::TextureFormat::RGBA8Unorm;
    desc.usage = wgpu::TextureUsage::TextureBinding | wgpu::TextureUsage::CopyDst;
    dummyTexture_ = device_.CreateTexture(&desc);
    dummyTextureView_ = dummyTexture_.CreateView();

    uint8_t white[] = {255, 255, 255, 255};
    wgpu::TexelCopyTextureInfo dst{};
    dst.texture = dummyTexture_;
    wgpu::TexelCopyBufferLayout layout{};
    layout.bytesPerRow = 4;
    layout.rowsPerImage = 1;
    wgpu::Extent3D extent = {1, 1, 1};
    queue_.WriteTexture(&dst, white, 4, &layout, &extent);

    // Diffuse sampler
    {
        wgpu::SamplerDescriptor desc{};
        desc.minFilter = wgpu::FilterMode::Linear;
        desc.magFilter = wgpu::FilterMode::Linear;
        desc.mipmapFilter = wgpu::MipmapFilterMode::Linear;
        desc.addressModeU = wgpu::AddressMode::Repeat;
        desc.addressModeV = wgpu::AddressMode::Repeat;
        diffuseSampler_ = device_.CreateSampler(&desc);
    }

    // Start with dummy
    diffuseTexture_ = dummyTexture_;
    diffuseTextureView_ = dummyTextureView_;
}

void Renderer::createShadowResources() {
    // Shadow depth texture
    {
        wgpu::TextureDescriptor desc{};
        desc.size = {(uint32_t)shadowMapSize_, (uint32_t)shadowMapSize_, 1};
        desc.format = wgpu::TextureFormat::Depth32Float;
        desc.usage = wgpu::TextureUsage::RenderAttachment | wgpu::TextureUsage::TextureBinding;
        shadowTexture_ = device_.CreateTexture(&desc);
        shadowTextureView_ = shadowTexture_.CreateView();
    }

    // Shadow sampler (comparison)
    {
        wgpu::SamplerDescriptor desc{};
        desc.compare = wgpu::CompareFunction::Less;
        desc.minFilter = wgpu::FilterMode::Linear;
        desc.magFilter = wgpu::FilterMode::Linear;
        shadowSampler_ = device_.CreateSampler(&desc);
    }
}

void Renderer::createPipelines() {
    // Compile shaders
    pbrShader_.compile(device_, ShaderSources::pbrShader);
    shadowShader_.compile(device_, ShaderSources::shadowShader);
    wireShader_.compile(device_, ShaderSources::wireShader);

    // Vertex layout for PBR (position + normal + texCoord)
    wgpu::VertexAttribute pbrAttr0{};
    pbrAttr0.format = wgpu::VertexFormat::Float32x3;
    pbrAttr0.offset = offsetof(Vertex, position);
    pbrAttr0.shaderLocation = 0;
    wgpu::VertexAttribute pbrAttr1{};
    pbrAttr1.format = wgpu::VertexFormat::Float32x3;
    pbrAttr1.offset = offsetof(Vertex, normal);
    pbrAttr1.shaderLocation = 1;
    wgpu::VertexAttribute pbrAttr2{};
    pbrAttr2.format = wgpu::VertexFormat::Float32x2;
    pbrAttr2.offset = offsetof(Vertex, texCoord);
    pbrAttr2.shaderLocation = 2;
    std::array<wgpu::VertexAttribute, 3> pbrAttrs = {pbrAttr0, pbrAttr1, pbrAttr2};
    wgpu::VertexBufferLayout pbrVBL{};
    pbrVBL.arrayStride = sizeof(Vertex);
    pbrVBL.attributeCount = pbrAttrs.size();
    pbrVBL.attributes = pbrAttrs.data();

    // PBR bind group layout
    {
        std::array<wgpu::BindGroupLayoutEntry, 5> entries{};
        // 0: uniforms
        entries[0].binding = 0;
        entries[0].visibility = wgpu::ShaderStage::Vertex | wgpu::ShaderStage::Fragment;
        entries[0].buffer.type = wgpu::BufferBindingType::Uniform;
        entries[0].buffer.minBindingSize = sizeof(PBRUniforms);
        // 1: shadow sampler (comparison)
        entries[1].binding = 1;
        entries[1].visibility = wgpu::ShaderStage::Fragment;
        entries[1].sampler.type = wgpu::SamplerBindingType::Comparison;
        // 2: shadow texture
        entries[2].binding = 2;
        entries[2].visibility = wgpu::ShaderStage::Fragment;
        entries[2].texture.sampleType = wgpu::TextureSampleType::Depth;
        entries[2].texture.viewDimension = wgpu::TextureViewDimension::e2D;
        // 3: diffuse sampler
        entries[3].binding = 3;
        entries[3].visibility = wgpu::ShaderStage::Fragment;
        entries[3].sampler.type = wgpu::SamplerBindingType::Filtering;
        // 4: diffuse texture
        entries[4].binding = 4;
        entries[4].visibility = wgpu::ShaderStage::Fragment;
        entries[4].texture.sampleType = wgpu::TextureSampleType::Float;
        entries[4].texture.viewDimension = wgpu::TextureViewDimension::e2D;

        wgpu::BindGroupLayoutDescriptor desc{};
        desc.entryCount = entries.size();
        desc.entries = entries.data();
        pbrBindGroupLayout_ = device_.CreateBindGroupLayout(&desc);
    }

    // PBR uniform buffer
    {
        wgpu::BufferDescriptor desc{};
        desc.size = sizeof(PBRUniforms);
        desc.usage = wgpu::BufferUsage::Uniform | wgpu::BufferUsage::CopyDst;
        pbrUniformBuffer_ = device_.CreateBuffer(&desc);
    }

    rebuildPBRBindGroup();

    // PBR pipeline (front face)
    {
        wgpu::PipelineLayoutDescriptor plDesc{};
        plDesc.bindGroupLayoutCount = 1;
        plDesc.bindGroupLayouts = &pbrBindGroupLayout_;
        auto layout = device_.CreatePipelineLayout(&plDesc);

        wgpu::ColorTargetState colorTarget{};
        colorTarget.format = surfaceFormat_;

        wgpu::FragmentState fragState{};
        fragState.module = pbrShader_.getModule();
        fragState.entryPoint = "fs_main";
        fragState.targetCount = 1;
        fragState.targets = &colorTarget;

        wgpu::DepthStencilState depthStencil{};
        depthStencil.format = wgpu::TextureFormat::Depth24Plus;
        depthStencil.depthWriteEnabled = wgpu::OptionalBool::True;
        depthStencil.depthCompare = wgpu::CompareFunction::Less;

        wgpu::RenderPipelineDescriptor desc{};
        desc.layout = layout;
        desc.vertex.module = pbrShader_.getModule();
        desc.vertex.entryPoint = "vs_main";
        desc.vertex.bufferCount = 1;
        desc.vertex.buffers = &pbrVBL;
        desc.fragment = &fragState;
        desc.primitive.topology = wgpu::PrimitiveTopology::TriangleList;
        desc.primitive.cullMode = wgpu::CullMode::Back;
        desc.depthStencil = &depthStencil;

        pbrPipeline_ = device_.CreateRenderPipeline(&desc);

        // Back face pipeline for cloth pass 1
        desc.primitive.cullMode = wgpu::CullMode::Front;
        // Add depth bias for back faces
        depthStencil.depthBias = 1;
        depthStencil.depthBiasSlopeScale = 1.0f;
        desc.depthStencil = &depthStencil;
        pbrBackfacePipeline_ = device_.CreateRenderPipeline(&desc);
    }

    // Shadow pipeline
    {
        // Shadow bind group layout
        wgpu::BindGroupLayoutEntry entry{};
        entry.binding = 0;
        entry.visibility = wgpu::ShaderStage::Vertex;
        entry.buffer.type = wgpu::BufferBindingType::Uniform;
        entry.buffer.minBindingSize = sizeof(ShadowUniforms);

        wgpu::BindGroupLayoutDescriptor bglDesc{};
        bglDesc.entryCount = 1;
        bglDesc.entries = &entry;
        shadowBindGroupLayout_ = device_.CreateBindGroupLayout(&bglDesc);

        // Shadow uniform buffer
        wgpu::BufferDescriptor bufDesc{};
        bufDesc.size = sizeof(ShadowUniforms);
        bufDesc.usage = wgpu::BufferUsage::Uniform | wgpu::BufferUsage::CopyDst;
        shadowUniformBuffer_ = device_.CreateBuffer(&bufDesc);

        wgpu::PipelineLayoutDescriptor plDesc{};
        plDesc.bindGroupLayoutCount = 1;
        plDesc.bindGroupLayouts = &shadowBindGroupLayout_;
        auto layout = device_.CreatePipelineLayout(&plDesc);

        // Position-only vertex layout
        wgpu::VertexAttribute posAttr{};
        posAttr.format = wgpu::VertexFormat::Float32x3;
        posAttr.offset = 0;
        posAttr.shaderLocation = 0;

        wgpu::VertexBufferLayout shadowVBL{};
        shadowVBL.arrayStride = sizeof(Vertex);
        shadowVBL.attributeCount = 1;
        shadowVBL.attributes = &posAttr;

        wgpu::DepthStencilState depthStencil{};
        depthStencil.format = wgpu::TextureFormat::Depth32Float;
        depthStencil.depthWriteEnabled = wgpu::OptionalBool::True;
        depthStencil.depthCompare = wgpu::CompareFunction::Less;

        wgpu::RenderPipelineDescriptor desc{};
        desc.layout = layout;
        desc.vertex.module = shadowShader_.getModule();
        desc.vertex.entryPoint = "vs_main";
        desc.vertex.bufferCount = 1;
        desc.vertex.buffers = &shadowVBL;
        desc.primitive.topology = wgpu::PrimitiveTopology::TriangleList;
        desc.primitive.cullMode = wgpu::CullMode::Back;
        desc.depthStencil = &depthStencil;
        // Depth-only pass: no color attachments, but fragment stage required for validation
        desc.fragment = nullptr;

        shadowPipeline_ = device_.CreateRenderPipeline(&desc);

        // Create shadow bind group once
        wgpu::BindGroupEntry bgEntry{};
        bgEntry.binding = 0;
        bgEntry.buffer = shadowUniformBuffer_;
        bgEntry.size = sizeof(ShadowUniforms);

        wgpu::BindGroupDescriptor bgDesc2{};
        bgDesc2.layout = shadowBindGroupLayout_;
        bgDesc2.entryCount = 1;
        bgDesc2.entries = &bgEntry;
        shadowBindGroup_ = device_.CreateBindGroup(&bgDesc2);
    }

    // Wire pipeline
    {
        wgpu::BindGroupLayoutEntry entry{};
        entry.binding = 0;
        entry.visibility = wgpu::ShaderStage::Vertex | wgpu::ShaderStage::Fragment;
        entry.buffer.type = wgpu::BufferBindingType::Uniform;
        entry.buffer.minBindingSize = sizeof(WireUniforms);
        wgpu::BindGroupLayoutDescriptor bglDesc{};
        bglDesc.entryCount = 1;
        bglDesc.entries = &entry;
        wireBindGroupLayout_ = device_.CreateBindGroupLayout(&bglDesc);

        // Create separate uniform buffers per draw slot
        for (int i = 0; i < MAX_WIRE_DRAWS; i++) {
            wgpu::BufferDescriptor bufDesc{};
            bufDesc.size = sizeof(WireUniforms);
            bufDesc.usage = wgpu::BufferUsage::Uniform | wgpu::BufferUsage::CopyDst;
            wireUniformBuffers_[i] = device_.CreateBuffer(&bufDesc);
        }

        wgpu::PipelineLayoutDescriptor plDesc{};
        plDesc.bindGroupLayoutCount = 1;
        plDesc.bindGroupLayouts = &wireBindGroupLayout_;
        auto layout = device_.CreatePipelineLayout(&plDesc);

        wgpu::VertexAttribute posAttr{};
        posAttr.format = wgpu::VertexFormat::Float32x3;
        posAttr.offset = 0;
        posAttr.shaderLocation = 0;

        wgpu::VertexBufferLayout wireVBL{};
        wireVBL.arrayStride = 3 * sizeof(float);
        wireVBL.attributeCount = 1;
        wireVBL.attributes = &posAttr;

        wgpu::ColorTargetState colorTarget{};
        colorTarget.format = surfaceFormat_;
        wgpu::BlendState blend{};
        blend.color.srcFactor = wgpu::BlendFactor::SrcAlpha;
        blend.color.dstFactor = wgpu::BlendFactor::OneMinusSrcAlpha;
        blend.alpha.srcFactor = wgpu::BlendFactor::One;
        blend.alpha.dstFactor = wgpu::BlendFactor::OneMinusSrcAlpha;
        colorTarget.blend = &blend;

        wgpu::FragmentState fragState{};
        fragState.module = wireShader_.getModule();
        fragState.entryPoint = "fs_main";
        fragState.targetCount = 1;
        fragState.targets = &colorTarget;

        wgpu::DepthStencilState depthStencil{};
        depthStencil.format = wgpu::TextureFormat::Depth24Plus;
        depthStencil.depthWriteEnabled = wgpu::OptionalBool::False;
        depthStencil.depthCompare = wgpu::CompareFunction::Always;

        wgpu::RenderPipelineDescriptor desc{};
        desc.layout = layout;
        desc.vertex.module = wireShader_.getModule();
        desc.vertex.entryPoint = "vs_main";
        desc.vertex.bufferCount = 1;
        desc.vertex.buffers = &wireVBL;
        desc.fragment = &fragState;
        desc.primitive.topology = wgpu::PrimitiveTopology::LineList;
        desc.depthStencil = &depthStencil;

        wirePipeline_ = device_.CreateRenderPipeline(&desc);
    }

    // Wire bind groups — each bound to its own independent buffer at offset 0
    for (int i = 0; i < MAX_WIRE_DRAWS; i++) {
        wgpu::BindGroupEntry entry{};
        entry.binding = 0;
        entry.buffer = wireUniformBuffers_[i];
        entry.offset = 0;
        entry.size = sizeof(WireUniforms);

        wgpu::BindGroupDescriptor desc{};
        desc.layout = wireBindGroupLayout_;
        desc.entryCount = 1;
        desc.entries = &entry;
        wireBindGroups_[i] = device_.CreateBindGroup(&desc);
    }
}

void Renderer::rebuildPBRBindGroup() {
    std::array<wgpu::BindGroupEntry, 5> entries{};
    entries[0].binding = 0;
    entries[0].buffer = pbrUniformBuffer_;
    entries[0].size = sizeof(PBRUniforms);
    entries[1].binding = 1;
    entries[1].sampler = shadowSampler_;
    entries[2].binding = 2;
    entries[2].textureView = shadowTextureView_;
    entries[3].binding = 3;
    entries[3].sampler = diffuseSampler_;
    entries[4].binding = 4;
    entries[4].textureView = diffuseTextureView_;

    wgpu::BindGroupDescriptor desc{};
    desc.layout = pbrBindGroupLayout_;
    desc.entryCount = entries.size();
    desc.entries = entries.data();
    pbrBindGroup_ = device_.CreateBindGroup(&desc);
}

void Renderer::createSphereWireframe() {
    const int stacks = 12;
    const int slices = 16;
    const float PI = 3.14159265359f;
    std::vector<float> vertices;

    for (int i = 1; i < stacks; i++) {
        float phi = PI * float(i) / float(stacks);
        float y = std::cos(phi), r = std::sin(phi);
        for (int j = 0; j < slices; j++) {
            float t1 = 2.0f * PI * float(j) / float(slices);
            float t2 = 2.0f * PI * float(j + 1) / float(slices);
            vertices.push_back(r * std::cos(t1)); vertices.push_back(y); vertices.push_back(r * std::sin(t1));
            vertices.push_back(r * std::cos(t2)); vertices.push_back(y); vertices.push_back(r * std::sin(t2));
        }
    }
    for (int j = 0; j < slices; j++) {
        float theta = 2.0f * PI * float(j) / float(slices);
        for (int i = 0; i < stacks; i++) {
            float p1 = PI * float(i) / float(stacks);
            float p2 = PI * float(i + 1) / float(stacks);
            vertices.push_back(std::sin(p1) * std::cos(theta)); vertices.push_back(std::cos(p1)); vertices.push_back(std::sin(p1) * std::sin(theta));
            vertices.push_back(std::sin(p2) * std::cos(theta)); vertices.push_back(std::cos(p2)); vertices.push_back(std::sin(p2) * std::sin(theta));
        }
    }

    sphereVertexCount_ = static_cast<int>(vertices.size() / 3);

    wgpu::BufferDescriptor desc{};
    desc.size = vertices.size() * sizeof(float);
    desc.usage = wgpu::BufferUsage::Vertex | wgpu::BufferUsage::CopyDst;
    desc.mappedAtCreation = true;
    sphereVbo_ = device_.CreateBuffer(&desc);
    memcpy(sphereVbo_.GetMappedRange(), vertices.data(), desc.size);
    sphereVbo_.Unmap();
}

void Renderer::stepAndRender(double time) {
    if (!initialized_ || deviceLost_) {
        if (deviceLost_) emscripten_cancel_main_loop();
        return;
    }

    double frameStart = emscripten_performance_now();

    if (clothSim_.isInitialized() && clothSim_.isRunning()) {
        if (useGpuSolver_ && gpuSolver_.isInitialized()) {
            // GPU path: compute shader simulation
            gpuSolver_.step(device_, queue_, clothSim_, time, collisionSpheres_);
        } else {
            // CPU fallback
            clothSim_.step(time);
            if (clothMesh_) {
                const MeshData& meshData = clothSim_.generateMeshData();
                clothMesh_->updateVertices(queue_, meshData.vertices);
                clothMesh_->updateWireVertices(queue_, meshData.vertices, meshData.indices);
            }
        }
    }

    renderFrame();

    diag_.frameTimeMs = static_cast<float>(emscripten_performance_now() - frameStart);
    diag_.avgFrameTimeMs = diag_.avgFrameTimeMs * 0.95f + diag_.frameTimeMs * 0.05f;
    frameCount_++;

    // Periodic diagnostics log (~5 seconds at 60fps)
    if (frameCount_ % 300 == 0) {
        emscripten_log(EM_LOG_CONSOLE,
            "[GPU Diag] buffers=%d textures=%d vram=%.1fMB draws=%d frame=%.1fms errors=%d",
            diag_.bufferCount, diag_.textureCount,
            diag_.estimatedVram / (1024.0 * 1024.0),
            diag_.drawCallsPerFrame, diag_.avgFrameTimeMs,
            diag_.errorCount);

        if (diag_.estimatedVram > 512ULL * 1024 * 1024) {
            emscripten_log(EM_LOG_WARN, "[GPU Diag] WARNING: estimated VRAM > 512MB!");
        }
    }
}

void Renderer::renderShadowPass(wgpu::CommandEncoder& encoder) {
    glm::mat4 lightView = glm::lookAt(lightPos_, glm::vec3(0.0f), glm::vec3(0.0f, 1.0f, 0.0f));
    glm::mat4 lightProj = glm::ortho(-10.0f, 10.0f, -10.0f, 10.0f, 0.1f, 30.0f);
    lightSpaceMatrix_ = lightProj * lightView;

    wgpu::RenderPassDepthStencilAttachment depthAttach{};
    depthAttach.view = shadowTextureView_;
    depthAttach.depthClearValue = 1.0f;
    depthAttach.depthLoadOp = wgpu::LoadOp::Clear;
    depthAttach.depthStoreOp = wgpu::StoreOp::Store;

    wgpu::RenderPassDescriptor rpDesc{};
    rpDesc.depthStencilAttachment = &depthAttach;

    auto pass = encoder.BeginRenderPass(&rpDesc);
    pass.SetPipeline(shadowPipeline_);

    // Render scene meshes (reuse shadowBindGroup_ created in createPipelines)
    for (auto* mesh : scene_.getMeshes()) {
        if (!mesh->isVisible()) continue;
        ShadowUniforms su{};
        su.model = mesh->getModelMatrix();
        su.lightSpaceMatrix = lightSpaceMatrix_;
        queue_.WriteBuffer(shadowUniformBuffer_, 0, &su, sizeof(su));
        pass.SetBindGroup(0, shadowBindGroup_);
        pass.SetVertexBuffer(0, mesh->getVertexBuffer());
        pass.SetIndexBuffer(mesh->getIndexBuffer(), wgpu::IndexFormat::Uint32);
        pass.DrawIndexed(mesh->getIndexCount());
    }

    // Render cloth
    if (clothMesh_ && clothMesh_->isVisible()) {
        ShadowUniforms su{};
        su.model = glm::mat4(1.0f);
        su.lightSpaceMatrix = lightSpaceMatrix_;
        queue_.WriteBuffer(shadowUniformBuffer_, 0, &su, sizeof(su));
        pass.SetBindGroup(0, shadowBindGroup_);

        bool gpuActive = useGpuSolver_ && gpuSolver_.isInitialized();
        pass.SetVertexBuffer(0, gpuActive ? gpuSolver_.getVertexBuffer() : clothMesh_->getVertexBuffer());
        pass.SetIndexBuffer(gpuActive ? gpuSolver_.getIndexBuffer() : clothMesh_->getIndexBuffer(), wgpu::IndexFormat::Uint32);
        pass.DrawIndexed(gpuActive ? gpuSolver_.getIndexCount() : clothMesh_->getIndexCount());
    }

    pass.End();
}

void Renderer::renderCollisionSpheres(wgpu::RenderPassEncoder& pass) {
    if (!showCollisionSpheres_ || collisionSpheres_.empty() || sphereVertexCount_ == 0) return;

    pass.SetPipeline(wirePipeline_);
    pass.SetVertexBuffer(0, sphereVbo_);

    for (int i = 0; i < (int)collisionSpheres_.size(); i++) {
        if (wireDrawIndex_ >= MAX_WIRE_DRAWS) break;
        const auto& sphere = collisionSpheres_[i];
        WireUniforms wu{};
        glm::mat4 model = glm::translate(glm::mat4(1.0f), sphere.center);
        model = glm::scale(model, glm::vec3(sphere.radius));
        wu.model = model;
        wu.view = camera_.getViewMatrix();
        float aspect = (height_ > 0) ? float(width_) / float(height_) : 1.0f;
        wu.projection = camera_.getProjectionMatrix(aspect);
        wu.color = (i == selectedSphereIndex_)
            ? glm::vec4(1.0f, 0.9f, 0.2f, 0.8f)
            : glm::vec4(0.3f, 0.8f, 1.0f, 0.5f);

        queue_.WriteBuffer(wireUniformBuffers_[wireDrawIndex_], 0, &wu, sizeof(wu));
        pass.SetBindGroup(0, wireBindGroups_[wireDrawIndex_]);
        wireDrawIndex_++;
        diag_.drawCallsPerFrame++;
        pass.Draw(sphereVertexCount_);
    }
}

void Renderer::renderFrame() {
    if (!initialized_ || deviceLost_) return;
    diag_.drawCallsPerFrame = 0;
    wireDrawIndex_ = 0;

    wgpu::SurfaceTexture surfaceTexture;
    surface_.GetCurrentTexture(&surfaceTexture);
    if (surfaceTexture.status != wgpu::SurfaceGetCurrentTextureStatus::SuccessOptimal &&
        surfaceTexture.status != wgpu::SurfaceGetCurrentTextureStatus::SuccessSuboptimal) return;

    auto backbuffer = surfaceTexture.texture.CreateView();
    auto encoder = device_.CreateCommandEncoder();

    // Shadow pass
    renderShadowPass(encoder);

    // Main pass
    wgpu::RenderPassColorAttachment colorAttach{};
    colorAttach.view = backbuffer;
    colorAttach.loadOp = wgpu::LoadOp::Clear;
    colorAttach.storeOp = wgpu::StoreOp::Store;
    colorAttach.clearValue = {0.11, 0.11, 0.18, 1.0};

    wgpu::RenderPassDepthStencilAttachment depthAttach{};
    depthAttach.view = depthView_;
    depthAttach.depthClearValue = 1.0f;
    depthAttach.depthLoadOp = wgpu::LoadOp::Clear;
    depthAttach.depthStoreOp = wgpu::StoreOp::Store;

    wgpu::RenderPassDescriptor rpDesc{};
    rpDesc.colorAttachmentCount = 1;
    rpDesc.colorAttachments = &colorAttach;
    rpDesc.depthStencilAttachment = &depthAttach;

    auto pass = encoder.BeginRenderPass(&rpDesc);

    float aspect = (height_ > 0) ? float(width_) / float(height_) : 1.0f;
    glm::mat4 view = camera_.getViewMatrix();
    glm::mat4 proj = camera_.getProjectionMatrix(aspect);

    // Grid
    grid_.render(pass, queue_, view, proj);

    // PBR uniforms helper — uses per-mesh material if available
    auto fillPBR = [&](const glm::mat4& model, const Mesh* meshPtr = nullptr) {
        PBRUniforms pu{};
        pu.model = model;
        pu.view = view;
        pu.projection = proj;
        pu.lightSpaceMatrix = lightSpaceMatrix_;
        pu.camPos = camera_.getPosition();
        pu.lightPos = lightPos_;
        pu.lightColor = lightColor_ * lightIntensity_;
        if (meshPtr && meshPtr->hasDiffuseTexture()) {
            // Per-mesh material
            pu.baseColor = meshPtr->getMaterial().baseColor;
            pu.metallic = meshPtr->getMaterial().metallic;
            pu.roughness = meshPtr->getMaterial().roughness;
            pu.hasTexture = 1.0f;
        } else if (meshPtr) {
            // Per-mesh material, no texture
            pu.baseColor = meshPtr->getMaterial().baseColor;
            pu.metallic = meshPtr->getMaterial().metallic;
            pu.roughness = meshPtr->getMaterial().roughness;
            pu.hasTexture = hasTexture_ ? 1.0f : 0.0f;
        } else {
            // Scene-level material (cloth, etc.)
            pu.baseColor = scene_.getMaterial().getBaseColor();
            pu.metallic = scene_.getMaterial().getMetallic();
            pu.roughness = scene_.getMaterial().getRoughness();
            pu.hasTexture = hasTexture_ ? 1.0f : 0.0f;
        }
        pu.ambientTop = ambientTop_;
        pu.ambientBottom = ambientBottom_;
        pu.shadowEnabled = 1.0f;
        pu.uvOffset = uvOffset_;
        pu.uvTiling = uvTiling_;
        queue_.WriteBuffer(pbrUniformBuffer_, 0, &pu, sizeof(pu));
    };

    // Wireframe diagnostic — log once per toggle
    {
        static bool wireLogOnce = false;
        if (wireframeMode_ && !wireLogOnce) {
            wireLogOnce = true;
            for (auto* mesh : scene_.getMeshes()) {
                emscripten_log(EM_LOG_CONSOLE,
                    "[Wire Debug] renderFrame: mesh='%s' visible=%d wireCount=%d indexCount=%d",
                    mesh->getName().c_str(), mesh->isVisible(),
                    mesh->getWireVertexCount(), mesh->getIndexCount());
            }
            if (clothMesh_) {
                emscripten_log(EM_LOG_CONSOLE,
                    "[Wire Debug] renderFrame: cloth visible=%d wireCount=%d",
                    clothMesh_->isVisible(), clothMesh_->getWireVertexCount());
            }
        }
        if (!wireframeMode_) wireLogOnce = false;
    }

    // Scene meshes
    for (auto* mesh : scene_.getMeshes()) {
        if (!mesh->isVisible()) continue;
        if (wireframeMode_ && mesh->getWireVertexCount() > 0 && wireDrawIndex_ < MAX_WIRE_DRAWS) {
            WireUniforms wu{};
            wu.model = mesh->getModelMatrix();
            wu.view = view;
            wu.projection = proj;
            wu.color = glm::vec4(0.0f, 1.0f, 0.5f, 1.0f);
            queue_.WriteBuffer(wireUniformBuffers_[wireDrawIndex_], 0, &wu, sizeof(wu));
            pass.SetPipeline(wirePipeline_);
            pass.SetBindGroup(0, wireBindGroups_[wireDrawIndex_]);
            pass.SetVertexBuffer(0, mesh->getWireVertexBuffer());
            wireDrawIndex_++;
            diag_.drawCallsPerFrame++;
            pass.Draw(mesh->getWireVertexCount());
        } else {
            fillPBR(mesh->getModelMatrix(), mesh);

            // Use per-mesh texture bind group if available
            wgpu::BindGroup bg = pbrBindGroup_;
            if (mesh->hasDiffuseTexture()) {
                // Build temporary bind group with per-mesh texture
                wgpu::BindGroupEntry entries[5] = {};
                entries[0].binding = 0;
                entries[0].buffer = pbrUniformBuffer_;
                entries[0].size = sizeof(PBRUniforms);
                entries[1].binding = 1;
                entries[1].sampler = shadowSampler_;
                entries[2].binding = 2;
                entries[2].textureView = shadowTextureView_;
                entries[3].binding = 3;
                entries[3].sampler = diffuseSampler_;
                entries[4].binding = 4;
                entries[4].textureView = mesh->getDiffuseTextureView();

                wgpu::BindGroupDescriptor desc{};
                desc.layout = pbrBindGroupLayout_;
                desc.entryCount = 5;
                desc.entries = entries;
                bg = device_.CreateBindGroup(&desc);
            }

            pass.SetPipeline(pbrPipeline_);
            pass.SetBindGroup(0, bg);
            pass.SetVertexBuffer(0, mesh->getVertexBuffer());
            pass.SetIndexBuffer(mesh->getIndexBuffer(), wgpu::IndexFormat::Uint32);
            diag_.drawCallsPerFrame++;
            pass.DrawIndexed(mesh->getIndexCount());
        }
    }

    // Cloth (two-pass or wireframe)
    if (clothMesh_ && clothMesh_->isVisible()) {
        bool gpuActive = useGpuSolver_ && gpuSolver_.isInitialized();
        auto clothVB = gpuActive ? gpuSolver_.getVertexBuffer() : clothMesh_->getVertexBuffer();
        auto clothIB = gpuActive ? gpuSolver_.getIndexBuffer() : clothMesh_->getIndexBuffer();
        int clothIC = gpuActive ? gpuSolver_.getIndexCount() : clothMesh_->getIndexCount();

        // Skip wireframe in GPU mode (v1)
        if (!gpuActive && wireframeMode_ && clothMesh_->getWireVertexCount() > 0 && wireDrawIndex_ < MAX_WIRE_DRAWS) {
            WireUniforms wu{};
            wu.model = glm::mat4(1.0f);
            wu.view = view;
            wu.projection = proj;
            wu.color = glm::vec4(0.0f, 0.8f, 1.0f, 1.0f);
            queue_.WriteBuffer(wireUniformBuffers_[wireDrawIndex_], 0, &wu, sizeof(wu));
            pass.SetPipeline(wirePipeline_);
            pass.SetBindGroup(0, wireBindGroups_[wireDrawIndex_]);
            pass.SetVertexBuffer(0, clothMesh_->getWireVertexBuffer());
            wireDrawIndex_++;
            diag_.drawCallsPerFrame++;
            pass.Draw(clothMesh_->getWireVertexCount());
        } else {
            fillPBR(glm::mat4(1.0f), nullptr);

            // Pass 1: back faces with depth bias
            pass.SetPipeline(pbrBackfacePipeline_);
            pass.SetBindGroup(0, pbrBindGroup_);
            pass.SetVertexBuffer(0, clothVB);
            pass.SetIndexBuffer(clothIB, wgpu::IndexFormat::Uint32);
            diag_.drawCallsPerFrame++;
            pass.DrawIndexed(clothIC);

            // Pass 2: front faces
            pass.SetPipeline(pbrPipeline_);
            pass.SetBindGroup(0, pbrBindGroup_);
            pass.SetVertexBuffer(0, clothVB);
            pass.SetIndexBuffer(clothIB, wgpu::IndexFormat::Uint32);
            diag_.drawCallsPerFrame++;
            pass.DrawIndexed(clothIC);
        }
    }

    // Collision spheres
    renderCollisionSpheres(pass);

    // Light sphere — TEMPORARILY DISABLED FOR DEBUGGING
    // if (sphereVertexCount_ > 0 && wireDrawIndex_ < MAX_WIRE_DRAWS) {
    //     WireUniforms wu{};
    //     wu.model = glm::scale(glm::translate(glm::mat4(1.0f), lightPos_), glm::vec3(0.15f));
    //     wu.view = view;
    //     wu.projection = proj;
    //     wu.color = glm::vec4(1.0f, 1.0f, 0.3f, 0.9f);
    //     queue_.WriteBuffer(wireUniformBuffers_[wireDrawIndex_], 0, &wu, sizeof(wu));
    //     pass.SetPipeline(wirePipeline_);
    //     pass.SetBindGroup(0, wireBindGroups_[wireDrawIndex_]);
    //     pass.SetVertexBuffer(0, sphereVbo_);
    //     wireDrawIndex_++;
    //     diag_.drawCallsPerFrame++;
    //     pass.Draw(sphereVertexCount_);
    // }

    pass.End();

    auto commands = encoder.Finish();
    queue_.Submit(1, &commands);
}

void Renderer::loadDiffuseTexture(const uint8_t* data, int size) {
    int w, h, channels;
    unsigned char* pixels = stbi_load_from_memory(data, size, &w, &h, &channels, 4);
    if (!pixels) {
        emscripten_log(EM_LOG_ERROR, "Failed to decode texture image");
        return;
    }

    // Previous texture is released automatically by RAII when overwritten below

    wgpu::TextureDescriptor desc{};
    desc.size = {(uint32_t)w, (uint32_t)h, 1};
    desc.format = wgpu::TextureFormat::RGBA8Unorm;
    desc.usage = wgpu::TextureUsage::TextureBinding | wgpu::TextureUsage::CopyDst;
    desc.mipLevelCount = 1;
    diffuseTexture_ = device_.CreateTexture(&desc);
    diffuseTextureView_ = diffuseTexture_.CreateView();

    wgpu::TexelCopyTextureInfo dst{};
    dst.texture = diffuseTexture_;
    wgpu::TexelCopyBufferLayout layout{};
    layout.bytesPerRow = w * 4;
    layout.rowsPerImage = h;
    wgpu::Extent3D extent = {(uint32_t)w, (uint32_t)h, 1};
    queue_.WriteTexture(&dst, pixels, w * h * 4, &layout, &extent);

    stbi_image_free(pixels);
    hasTexture_ = true;

    rebuildPBRBindGroup();
    emscripten_log(EM_LOG_CONSOLE, "Texture loaded: %dx%d", w, h);
}

void Renderer::clearDiffuseTexture() {
    diffuseTexture_ = dummyTexture_;
    diffuseTextureView_ = dummyTextureView_;
    hasTexture_ = false;
    rebuildPBRBindGroup();
}

void Renderer::setUseGpuSolver(bool use) {
    if (use == useGpuSolver_) return;

    // GPU solver only works with XPBD mode
    if (use && clothSim_.getSolverMode() != SolverMode::XPBD) {
        emscripten_log(EM_LOG_WARN, "GPU Solver requires XPBD mode");
        return;
    }

    useGpuSolver_ = use;

    if (use && clothSim_.isInitialized()) {
        if (!gpuSolver_.isInitialized()) {
            gpuSolver_.init(device_, queue_, clothSim_);
        } else {
            gpuSolver_.uploadState(queue_, clothSim_);
        }
    }
    emscripten_log(EM_LOG_CONSOLE, "GPU Solver: %s", use ? "ON" : "OFF");
}

void Renderer::setSolverMode(int mode) {
    SolverMode sm = (mode == 0) ? SolverMode::VERLET : SolverMode::XPBD;

    if (sm == SolverMode::VERLET && useGpuSolver_) {
        useGpuSolver_ = false;
        emscripten_log(EM_LOG_CONSOLE, "GPU Solver disabled (Verlet mode)");
    }

    clothSim_.setSolverMode(sm);

    if (sm == SolverMode::XPBD && clothSim_.isInitialized()) {
        gpuSolver_.destroy();
        gpuSolver_.init(device_, queue_, clothSim_);
    }
}

void Renderer::addClothMesh(float width, float height, int resX, int resY) {
    if (clothMesh_) { clothMesh_->cleanup(); delete clothMesh_; clothMesh_ = nullptr; }
    gpuSolver_.destroy();
    clothSim_.init(width, height, resX, resY);
    syncCollidersToSim();
    const MeshData& initial = clothSim_.generateMeshData();
    clothMesh_ = new Mesh();
    clothMesh_->initDynamic(device_, initial);
    clothMesh_->setName("cloth");
    // Initialize GPU solver
    gpuSolver_.init(device_, queue_, clothSim_);
    emscripten_log(EM_LOG_CONSOLE, "Cloth mesh created: %dx%d", resX, resY);
}

void Renderer::addClothMeshHorizontal(float width, float depth, int resX, int resZ, float dropHeight) {
    if (clothMesh_) { clothMesh_->cleanup(); delete clothMesh_; clothMesh_ = nullptr; }
    gpuSolver_.destroy();
    clothSim_.initHorizontal(width, depth, resX, resZ, dropHeight);
    syncCollidersToSim();
    const MeshData& initial = clothSim_.generateMeshData();
    clothMesh_ = new Mesh();
    clothMesh_->initDynamic(device_, initial);
    clothMesh_->setName("cloth");
    gpuSolver_.init(device_, queue_, clothSim_);
    emscripten_log(EM_LOG_CONSOLE, "Horizontal cloth: %dx%d at h=%.1f", resX, resZ, dropHeight);
}

void Renderer::toggleSimulation(bool running) { clothSim_.setRunning(running); }

void Renderer::resetCloth() {
    clothSim_.reset();
    if (clothMesh_) {
        const MeshData& meshData = clothSim_.generateMeshData();
        clothMesh_->updateVertices(queue_, meshData.vertices);
    }
}

void Renderer::convertMeshToCloth(int meshIndex, int pinMode) {
    const auto& cache = scene_.getMeshDataCache();
    if (meshIndex < 0 || meshIndex >= (int)cache.size()) return;
    if (clothMesh_) { clothMesh_->cleanup(); delete clothMesh_; clothMesh_ = nullptr; }
    gpuSolver_.destroy();
    clothSim_.initFromMesh(cache[meshIndex], pinMode);
    syncCollidersToSim();
    const MeshData& initial = clothSim_.generateMeshData();
    clothMesh_ = new Mesh();
    clothMesh_->initDynamic(device_, initial);
    clothMesh_->setName("cloth");
    gpuSolver_.init(device_, queue_, clothSim_);
    auto& meshes = scene_.getMeshes();
    if (meshIndex < (int)meshes.size()) meshes[meshIndex]->setVisible(false);
    emscripten_log(EM_LOG_CONSOLE, "Mesh %d → cloth (%zu verts, pin=%d)", meshIndex, cache[meshIndex].vertices.size(), pinMode);
}

void Renderer::addCollisionSphere(float x, float y, float z, float radius) {
    collisionSpheres_.emplace_back(glm::vec3(x, y, z), radius);
    syncCollidersToSim();
}

void Renderer::removeCollisionSphere(int index) {
    if (index < 0 || index >= (int)collisionSpheres_.size()) return;
    collisionSpheres_.erase(collisionSpheres_.begin() + index);
    syncCollidersToSim();
}

void Renderer::syncCollidersToSim() {
    clothSim_.clearColliders();
    clothSim_.clearMeshColliders();
    for (const auto& s : collisionSpheres_) clothSim_.addCollider(s);
    for (const auto& md : scene_.getMeshDataCache()) {
        if (md.vertices.empty()) continue;
        clothSim_.addMeshCollider(md);  // BVH triangle collision
    }
}

int Renderer::pickSphere(float ox, float oy, float oz, float dx, float dy, float dz) const {
    glm::vec3 origin(ox, oy, oz), dir(dx, dy, dz);
    int closest = -1; float closestT = 1e30f;
    for (int i = 0; i < (int)collisionSpheres_.size(); i++) {
        const auto& s = collisionSpheres_[i];
        glm::vec3 oc = origin - s.center;
        float a = glm::dot(dir, dir), b = 2.0f * glm::dot(oc, dir);
        float c = glm::dot(oc, oc) - s.radius * s.radius;
        float disc = b * b - 4.0f * a * c;
        if (disc >= 0.0f) {
            float t = (-b - std::sqrt(disc)) / (2.0f * a);
            if (t < 0.0f) t = (-b + std::sqrt(disc)) / (2.0f * a);
            if (t > 0.0f && t < closestT) { closestT = t; closest = i; }
        }
    }
    return closest;
}

bool Renderer::pickCloth(float ox, float oy, float oz, float dx, float dy, float dz, float& t) const {
    if (!clothSim_.isInitialized()) return false;
    glm::vec3 aabbMin, aabbMax;
    clothSim_.getAABB(aabbMin, aabbMax);
    glm::vec3 pad(0.1f);
    aabbMin -= pad; aabbMax += pad;
    glm::vec3 origin(ox, oy, oz), dir(dx, dy, dz), invDir = 1.0f / dir;
    float t1 = (aabbMin.x - origin.x) * invDir.x, t2 = (aabbMax.x - origin.x) * invDir.x;
    float t3 = (aabbMin.y - origin.y) * invDir.y, t4 = (aabbMax.y - origin.y) * invDir.y;
    float t5 = (aabbMin.z - origin.z) * invDir.z, t6 = (aabbMax.z - origin.z) * invDir.z;
    float tmin = std::max(std::max(std::min(t1, t2), std::min(t3, t4)), std::min(t5, t6));
    float tmax = std::min(std::min(std::max(t1, t2), std::max(t3, t4)), std::max(t5, t6));
    if (tmax < 0.0f || tmin > tmax) return false;
    t = (tmin > 0.0f) ? tmin : tmax;
    return true;
}

void Renderer::setCollisionSpherePosition(int index, float x, float y, float z) {
    if (index < 0 || index >= (int)collisionSpheres_.size()) return;
    collisionSpheres_[index].center = glm::vec3(x, y, z);
    syncCollidersToSim();
}

void Renderer::translateCloth(float dx, float dy, float dz) {
    clothSim_.translateAll(dx, dy, dz);
    if (clothMesh_) {
        const MeshData& meshData = clothSim_.generateMeshData();
        clothMesh_->updateVertices(queue_, meshData.vertices);
    }
}

// ─── Cloth Grab Interaction ──────────────────────────────────────────────

int Renderer::grabClothParticle(float ndcX, float ndcY) {
    if (!clothSim_.isInitialized()) return -1;
    float aspect = (height_ > 0) ? static_cast<float>(width_) / static_cast<float>(height_) : 1.0f;
    glm::vec3 origin, dir;
    camera_.screenToRay(ndcX, ndcY, aspect, origin, dir);

    int index = clothSim_.findNearestParticleToRay(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z);
    if (index >= 0) {
        clothSim_.grabParticle(index);
        if (useGpuSolver_ && gpuSolver_.isInitialized()) {
            gpuSolver_.uploadSingleParticle(queue_, clothSim_, index);
        }
    }
    return index;
}

void Renderer::moveGrabbedParticle(float ndcX, float ndcY) {
    int index = clothSim_.getGrabbedParticle();
    if (index < 0) return;

    float aspect = (height_ > 0) ? static_cast<float>(width_) / static_cast<float>(height_) : 1.0f;

    // Get camera forward vector and particle's current depth
    glm::vec3 camPos = camera_.getPosition();
    glm::mat4 view = camera_.getViewMatrix();
    const auto& particles = clothSim_.getParticles();
    glm::vec3 particlePos = particles[index].position;

    // Compute depth along view forward
    glm::vec3 viewForward = -glm::vec3(view[0][2], view[1][2], view[2][2]);
    float depth = glm::dot(particlePos - camPos, viewForward);

    // Generate ray from new NDC
    glm::vec3 origin, dir;
    camera_.screenToRay(ndcX, ndcY, aspect, origin, dir);

    // Find point on ray at same depth
    float denom = glm::dot(dir, viewForward);
    if (std::abs(denom) < 1e-6f) return;
    float t = depth / denom;
    glm::vec3 newPos = origin + t * dir;

    clothSim_.moveParticle(index, newPos.x, newPos.y, newPos.z);

    if (useGpuSolver_ && gpuSolver_.isInitialized()) {
        gpuSolver_.uploadSingleParticle(queue_, clothSim_, index);
    }
}

void Renderer::releaseClothParticle() {
    int index = clothSim_.getGrabbedParticle();
    clothSim_.releaseParticle();
    if (index >= 0 && useGpuSolver_ && gpuSolver_.isInitialized()) {
        gpuSolver_.uploadSingleParticle(queue_, clothSim_, index);
    }
}

float Renderer::getCollisionSphereX(int index) const { return (index >= 0 && index < (int)collisionSpheres_.size()) ? collisionSpheres_[index].center.x : 0.0f; }
float Renderer::getCollisionSphereY(int index) const { return (index >= 0 && index < (int)collisionSpheres_.size()) ? collisionSpheres_[index].center.y : 0.0f; }
float Renderer::getCollisionSphereZ(int index) const { return (index >= 0 && index < (int)collisionSpheres_.size()) ? collisionSpheres_[index].center.z : 0.0f; }

void Renderer::resize(int width, int height) {
    width_ = width; height_ = height;
    if (!initialized_) return;

    // Recreate surface
    wgpu::SurfaceConfiguration config{};
    config.device = device_;
    config.format = surfaceFormat_;
    config.usage = wgpu::TextureUsage::RenderAttachment;
    config.width = width_;
    config.height = height_;
    config.alphaMode = wgpu::CompositeAlphaMode::Auto;
    config.presentMode = wgpu::PresentMode::Fifo;
    surface_.Configure(&config);

    // Release previous depth texture before creating new one
    depthView_ = nullptr;
    depthTexture_ = nullptr;

    // Recreate depth texture
    wgpu::TextureDescriptor desc{};
    desc.size = {(uint32_t)width_, (uint32_t)height_, 1};
    desc.format = wgpu::TextureFormat::Depth24Plus;
    desc.usage = wgpu::TextureUsage::RenderAttachment;
    depthTexture_ = device_.CreateTexture(&desc);
    depthView_ = depthTexture_.CreateView();
}

void Renderer::destroy() {
    if (!initialized_) return;

    // Mark as not initialized FIRST to prevent in-flight render callbacks
    // from using resources during cleanup (stepAndRender checks this flag)
    initialized_ = false;

    emscripten_cancel_main_loop();

    gpuSolver_.destroy();
    if (clothMesh_) { clothMesh_->cleanup(); delete clothMesh_; clothMesh_ = nullptr; }
    collisionSpheres_.clear();

    grid_.destroy();
    pbrShader_.destroy();
    shadowShader_.destroy();
    wireShader_.destroy();
    scene_.clearScene();

    // WebGPU objects are released automatically by RAII (C++ wgpu::* destructors)
    // when the Renderer object is destroyed or re-initialized.
    // Do NOT explicitly set them to nullptr here — doing so can cause
    // GPU driver crashes if commands referencing them are still in-flight.

    if (g_renderer == this) g_renderer = nullptr;

    emscripten_log(EM_LOG_CONSOLE, "Renderer destroyed");
}

std::string Renderer::exportScreenshot() {
    // TODO: implement with WebGPU buffer readback
    return "";
}
