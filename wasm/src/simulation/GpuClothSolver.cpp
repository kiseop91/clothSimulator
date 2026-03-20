#include "simulation/GpuClothSolver.h"
#include "simulation/ComputeShaderSources.h"
#include <emscripten.h>
#include <cstring>
#include <algorithm>
#include <cmath>

// ─── Helpers ─────────────────────────────────────────────────────────────

static wgpu::Buffer createGpuBuffer(wgpu::Device& device, uint64_t size,
                                     wgpu::BufferUsage usage) {
    wgpu::BufferDescriptor desc{};
    desc.size = size;
    desc.usage = usage;
    return device.CreateBuffer(&desc);
}

static wgpu::Buffer createGpuBufferWithData(wgpu::Device& device,
                                             const void* data, uint64_t size,
                                             wgpu::BufferUsage usage) {
    wgpu::BufferDescriptor desc{};
    desc.size = size;
    desc.usage = usage;
    desc.mappedAtCreation = true;
    auto buffer = device.CreateBuffer(&desc);
    memcpy(buffer.GetMappedRange(), data, size);
    buffer.Unmap();
    return buffer;
}

// S = Storage (read_write), R = ReadOnlyStorage, U = Uniform
struct LayoutEntry {
    uint32_t binding;
    char type; // 'S' = Storage, 'R' = ReadOnlyStorage, 'U' = Uniform
};

static wgpu::BindGroupLayout createBGL(wgpu::Device& device,
                                        const std::vector<LayoutEntry>& entries) {
    std::vector<wgpu::BindGroupLayoutEntry> layoutEntries(entries.size());
    for (size_t i = 0; i < entries.size(); i++) {
        layoutEntries[i] = {};
        layoutEntries[i].binding = entries[i].binding;
        layoutEntries[i].visibility = wgpu::ShaderStage::Compute;
        if (entries[i].type == 'U') {
            layoutEntries[i].buffer.type = wgpu::BufferBindingType::Uniform;
        } else if (entries[i].type == 'R') {
            layoutEntries[i].buffer.type = wgpu::BufferBindingType::ReadOnlyStorage;
        } else {
            layoutEntries[i].buffer.type = wgpu::BufferBindingType::Storage;
        }
    }
    wgpu::BindGroupLayoutDescriptor desc{};
    desc.entryCount = layoutEntries.size();
    desc.entries = layoutEntries.data();
    return device.CreateBindGroupLayout(&desc);
}

struct BufferBinding {
    uint32_t binding;
    wgpu::Buffer buffer;
    uint64_t size;
};

static wgpu::BindGroup createBG(wgpu::Device& device,
                                 wgpu::BindGroupLayout& layout,
                                 const std::vector<BufferBinding>& bindings) {
    std::vector<wgpu::BindGroupEntry> entries(bindings.size());
    for (size_t i = 0; i < bindings.size(); i++) {
        entries[i] = {};
        entries[i].binding = bindings[i].binding;
        entries[i].buffer = bindings[i].buffer;
        entries[i].size = bindings[i].size;
    }
    wgpu::BindGroupDescriptor desc{};
    desc.layout = layout;
    desc.entryCount = entries.size();
    desc.entries = entries.data();
    return device.CreateBindGroup(&desc);
}

static wgpu::ComputePipeline createComputePipeline(
    wgpu::Device& device, const char* shaderSource,
    const std::vector<wgpu::BindGroupLayout>& bgls) {

    wgpu::ShaderSourceWGSL wgslDesc{};
    wgslDesc.code = shaderSource;
    wgpu::ShaderModuleDescriptor smDesc{};
    smDesc.nextInChain = &wgslDesc;
    auto module = device.CreateShaderModule(&smDesc);

    wgpu::PipelineLayoutDescriptor plDesc{};
    plDesc.bindGroupLayoutCount = bgls.size();
    plDesc.bindGroupLayouts = bgls.data();
    auto layout = device.CreatePipelineLayout(&plDesc);

    wgpu::ComputePipelineDescriptor cpDesc{};
    cpDesc.layout = layout;
    cpDesc.compute.module = module;
    cpDesc.compute.entryPoint = "main";
    return device.CreateComputePipeline(&cpDesc);
}

static uint32_t divCeil(uint32_t a, uint32_t b) {
    return (a + b - 1) / b;
}

// ─── Constructor / Destructor ────────────────────────────────────────────

GpuClothSolver::GpuClothSolver() {}
GpuClothSolver::~GpuClothSolver() { destroy(); }

// ─── Init ────────────────────────────────────────────────────────────────

void GpuClothSolver::init(wgpu::Device& device, wgpu::Queue& queue,
                           const ClothSimulation& sim) {
    destroy();

    const auto& particles = sim.getParticles();
    const auto& springs = sim.getSprings();
    const auto& meshData = sim.getCachedMeshData();

    numParticles_ = static_cast<int>(particles.size());
    numSprings_ = static_cast<int>(springs.size());
    numTriangles_ = static_cast<int>(meshData.indices.size()) / 3;

    if (numParticles_ == 0 || numSprings_ == 0) {
        emscripten_log(EM_LOG_ERROR, "[GPU Solver] Empty simulation data");
        return;
    }

    dispatchParticles_ = divCeil(numParticles_, 256);
    dispatchSprings_ = divCeil(numSprings_, 256);
    dispatchTriangles_ = divCeil(numTriangles_, 256);
    dispatchMax_ = divCeil(std::max(numParticles_, numSprings_), 256);

    createBuffers(device, queue, sim);
    createPipelines(device);
    createBindGroups(device);

    lastTime_ = -1.0;
    accumulator_ = 0.0;
    initialized_ = true;

    emscripten_log(EM_LOG_CONSOLE,
        "[GPU Solver] Initialized: %d particles, %d springs, %d triangles",
        numParticles_, numSprings_, numTriangles_);
}

// ─── Buffer Creation ─────────────────────────────────────────────────────

void GpuClothSolver::createBuffers(wgpu::Device& device, wgpu::Queue& queue,
                                    const ClothSimulation& sim) {
    const auto& particles = sim.getParticles();
    const auto& springs = sim.getSprings();
    const auto& meshData = sim.getCachedMeshData();

    auto storageUsage = wgpu::BufferUsage::Storage | wgpu::BufferUsage::CopyDst;

    // ── Particle buffers (vec4f: xyz + invMass) ──
    {
        std::vector<float> posData(numParticles_ * 4);
        std::vector<float> velData(numParticles_ * 4, 0.0f);
        std::vector<float> prevData(numParticles_ * 4);

        for (int i = 0; i < numParticles_; i++) {
            posData[i*4+0] = particles[i].position.x;
            posData[i*4+1] = particles[i].position.y;
            posData[i*4+2] = particles[i].position.z;
            posData[i*4+3] = particles[i].invMass;

            velData[i*4+0] = particles[i].velocity.x;
            velData[i*4+1] = particles[i].velocity.y;
            velData[i*4+2] = particles[i].velocity.z;

            prevData[i*4+0] = particles[i].prevPosition.x;
            prevData[i*4+1] = particles[i].prevPosition.y;
            prevData[i*4+2] = particles[i].prevPosition.z;
            prevData[i*4+3] = particles[i].invMass;
        }

        uint64_t particleBufSize = numParticles_ * 4 * sizeof(float);
        positionsBuffer_ = createGpuBufferWithData(device, posData.data(), particleBufSize, storageUsage);
        predictedBuffer_ = createGpuBufferWithData(device, posData.data(), particleBufSize, storageUsage);
        velocitiesBuffer_ = createGpuBufferWithData(device, velData.data(), particleBufSize, storageUsage);
        prevPositionsBuffer_ = createGpuBufferWithData(device, prevData.data(), particleBufSize, storageUsage);
    }

    // ── Spring buffer ──
    {
        std::vector<GpuSpring> gpuSprings(numSprings_);
        for (int i = 0; i < numSprings_; i++) {
            gpuSprings[i].particleA = static_cast<uint32_t>(springs[i].particleA);
            gpuSprings[i].particleB = static_cast<uint32_t>(springs[i].particleB);
            gpuSprings[i].restLength = springs[i].restLength;
            gpuSprings[i].springType = static_cast<uint32_t>(springs[i].type);
        }
        uint64_t springBufSize = numSprings_ * sizeof(GpuSpring);
        springsBuffer_ = createGpuBufferWithData(device, gpuSprings.data(), springBufSize,
            wgpu::BufferUsage::Storage | wgpu::BufferUsage::CopyDst);
    }

    // ── Solver accumulation buffers ──
    {
        uint64_t springF32Size = numSprings_ * sizeof(float);
        uint64_t particleI32Size = numParticles_ * sizeof(int32_t);
        uint64_t particleU32Size = numParticles_ * sizeof(uint32_t);

        lambdasBuffer_ = createGpuBuffer(device, springF32Size, storageUsage);
        jacobiDXBuffer_ = createGpuBuffer(device, particleI32Size, storageUsage);
        jacobiDYBuffer_ = createGpuBuffer(device, particleI32Size, storageUsage);
        jacobiDZBuffer_ = createGpuBuffer(device, particleI32Size, storageUsage);
        jacobiCountBuffer_ = createGpuBuffer(device, particleU32Size, storageUsage);
    }

    // ── Normal accumulation buffers ──
    {
        uint64_t particleI32Size = numParticles_ * sizeof(int32_t);
        normalAccumXBuffer_ = createGpuBuffer(device, particleI32Size, storageUsage);
        normalAccumYBuffer_ = createGpuBuffer(device, particleI32Size, storageUsage);
        normalAccumZBuffer_ = createGpuBuffer(device, particleI32Size, storageUsage);
    }

    // ── TexCoords buffer ──
    {
        std::vector<float> texData(numParticles_ * 2);
        for (int i = 0; i < numParticles_; i++) {
            texData[i*2+0] = meshData.vertices[i].texCoord.x;
            texData[i*2+1] = meshData.vertices[i].texCoord.y;
        }
        uint64_t texSize = numParticles_ * 2 * sizeof(float);
        texCoordsBuffer_ = createGpuBufferWithData(device, texData.data(), texSize,
            wgpu::BufferUsage::Storage);
    }

    // ── Index buffer (Storage | Index) ──
    {
        uint64_t indexSize = meshData.indices.size() * sizeof(uint32_t);
        indexBuffer_ = createGpuBufferWithData(device, meshData.indices.data(), indexSize,
            wgpu::BufferUsage::Storage | wgpu::BufferUsage::Index | wgpu::BufferUsage::CopyDst);
    }

    // ── Vertex output buffer (Storage | Vertex) ──
    {
        // 8 floats per vertex (position3 + normal3 + texCoord2) = 32 bytes
        uint64_t vertexSize = numParticles_ * 8 * sizeof(float);
        vertexOutputBuffer_ = createGpuBuffer(device, vertexSize,
            wgpu::BufferUsage::Storage | wgpu::BufferUsage::Vertex | wgpu::BufferUsage::CopyDst);
    }

    // ── Colliders buffer (max 32 × vec4f) ──
    {
        uint64_t colliderSize = 32 * 4 * sizeof(float);
        collidersBuffer_ = createGpuBuffer(device, colliderSize, storageUsage);
    }

    // ── Mesh collider BVH + triangle buffers ──
    {
        const auto& meshColliders = sim.getMeshColliders();
        numMeshTris_ = 0;
        numBVHNodes_ = 0;

        // Aggregate all mesh colliders into single buffers
        std::vector<glm::vec4> allTriData;
        std::vector<glm::vec4> allBVHData;

        for (const auto& mc : meshColliders) {
            int triOffset = numMeshTris_;
            int nodeOffset = numBVHNodes_;
            numMeshTris_ += mc.getTriangleCount();
            numBVHNodes_ += mc.getBVHNodeCount();

            // Copy triangle data (no offset needed, indices are absolute)
            const auto& td = mc.getTriangleData();
            allTriData.insert(allTriData.end(), td.begin(), td.end());

            // Copy BVH data with offset adjustments for child indices and triStart
            const auto& bd = mc.getBVHData();
            for (size_t i = 0; i < bd.size() / 3; i++) {
                glm::vec4 n0 = bd[i * 3 + 0]; // aabbMin + leftChild
                glm::vec4 n1 = bd[i * 3 + 1]; // aabbMax + rightChild
                glm::vec4 n2 = bd[i * 3 + 2]; // triStart + triCount

                // Offset child indices
                if (n0.w >= 0.0f) n0.w += static_cast<float>(nodeOffset);
                if (n1.w >= 0.0f) n1.w += static_cast<float>(nodeOffset);
                // Offset triStart
                n2.x += static_cast<float>(triOffset);

                allBVHData.push_back(n0);
                allBVHData.push_back(n1);
                allBVHData.push_back(n2);
            }
        }

        // Ensure minimum buffer size (WebGPU requires > 0)
        if (allTriData.empty()) allTriData.push_back(glm::vec4(0.0f));
        if (allBVHData.empty()) allBVHData.push_back(glm::vec4(0.0f));

        uint64_t triSize = allTriData.size() * sizeof(glm::vec4);
        uint64_t bvhSize = allBVHData.size() * sizeof(glm::vec4);
        meshTriBuffer_ = createGpuBufferWithData(device, allTriData.data(), triSize,
            wgpu::BufferUsage::Storage);
        meshBVHBuffer_ = createGpuBufferWithData(device, allBVHData.data(), bvhSize,
            wgpu::BufferUsage::Storage);

        if (numMeshTris_ > 0) {
            emscripten_log(EM_LOG_CONSOLE,
                "[GPU Solver] Mesh collision: %d tris, %d BVH nodes", numMeshTris_, numBVHNodes_);
        }
    }

    // ── Params uniform buffer ──
    {
        paramsBuffer_ = createGpuBuffer(device, sizeof(GpuSimParams),
            wgpu::BufferUsage::Uniform | wgpu::BufferUsage::CopyDst);
    }
}

// ─── Pipeline Creation ───────────────────────────────────────────────────

void GpuClothSolver::createPipelines(wgpu::Device& device) {
    // Pass 1: applyForcesAndPredict — all read_write
    {
        auto bgl = createBGL(device, {{0,'S'},{1,'S'},{2,'S'},{3,'U'}});
        applyForcesPipeline_ = createComputePipeline(device,
            ComputeShaderSources::applyForcesAndPredict, {bgl});
    }

    // Pass 2: resetLambdasAndJacobi — all read_write (atomics)
    {
        auto bgl = createBGL(device, {{0,'S'},{1,'S'},{2,'S'},{3,'S'},{4,'S'},{5,'U'}});
        resetJacobiPipeline_ = createComputePipeline(device,
            ComputeShaderSources::resetLambdasAndJacobi, {bgl});
    }

    // Pass 3: solveConstraints — BG0: positions(R), predicted(R), springs(R), params(U)
    //                            BG1: lambdas(S), jacobiDX/DY/DZ(S), jacobiCount(S)
    {
        auto bgl0 = createBGL(device, {{0,'R'},{1,'R'},{2,'R'},{3,'U'}});
        auto bgl1 = createBGL(device, {{0,'S'},{1,'S'},{2,'S'},{3,'S'},{4,'S'}});
        solveConstraintsPipeline_ = createComputePipeline(device,
            ComputeShaderSources::solveConstraints, {bgl0, bgl1});
    }

    // Pass 4: applyJacobiCorrections — predicted(S), jacobiDX/DY/DZ(R), jacobiCount(R), params(U)
    {
        auto bgl = createBGL(device, {{0,'S'},{1,'R'},{2,'R'},{3,'R'},{4,'R'},{5,'U'}});
        applyJacobiPipeline_ = createComputePipeline(device,
            ComputeShaderSources::applyJacobiCorrections, {bgl});
    }

    // Pass 5: handleCollisions — positions(R), predicted(S), colliders(R), params(U), meshTris(R), meshBVH(R)
    {
        auto bgl = createBGL(device, {{0,'R'},{1,'S'},{2,'R'},{3,'U'},{4,'R'},{5,'R'}});
        collisionPipeline_ = createComputePipeline(device,
            ComputeShaderSources::handleCollisions, {bgl});
    }

    // Pass 6: updateVelocitiesAndCommit — positions(S), predicted(R), velocities(S), prevPositions(S), params(U)
    {
        auto bgl = createBGL(device, {{0,'S'},{1,'R'},{2,'S'},{3,'S'},{4,'U'}});
        updateVelocitiesPipeline_ = createComputePipeline(device,
            ComputeShaderSources::updateVelocitiesAndCommit, {bgl});
    }

    // Pass 7a: resetNormals — all read_write (atomics)
    {
        auto bgl = createBGL(device, {{0,'S'},{1,'S'},{2,'S'},{3,'U'}});
        resetNormalsPipeline_ = createComputePipeline(device,
            ComputeShaderSources::resetNormals, {bgl});
    }

    // Pass 7b: accumulateFaceNormals — positions(R), normalX/Y/Z(S atomics), indices(R), params(U)
    {
        auto bgl = createBGL(device, {{0,'R'},{1,'S'},{2,'S'},{3,'S'},{4,'R'},{5,'U'}});
        accumNormalsPipeline_ = createComputePipeline(device,
            ComputeShaderSources::accumulateFaceNormals, {bgl});
    }

    // Pass 7c: assembleVertexBuffer — positions(R), normalX/Y/Z(R), texCoords(R), vertexOutput(S), params(U)
    {
        auto bgl = createBGL(device, {{0,'R'},{1,'R'},{2,'R'},{3,'R'},{4,'R'},{5,'S'},{6,'U'}});
        assembleVertexPipeline_ = createComputePipeline(device,
            ComputeShaderSources::assembleVertexBuffer, {bgl});
    }
}

// ─── Bind Group Creation ─────────────────────────────────────────────────

void GpuClothSolver::createBindGroups(wgpu::Device& device) {
    uint64_t p4 = numParticles_ * 4 * sizeof(float);
    uint64_t pI32 = numParticles_ * sizeof(int32_t);
    uint64_t pU32 = numParticles_ * sizeof(uint32_t);
    uint64_t sF32 = numSprings_ * sizeof(float);
    uint64_t sSpr = numSprings_ * sizeof(GpuSpring);
    uint64_t pTex = numParticles_ * 2 * sizeof(float);
    uint64_t idxSize = numTriangles_ * 3 * sizeof(uint32_t);
    uint64_t vtxSize = numParticles_ * 8 * sizeof(float);
    uint64_t colSize = 32 * 4 * sizeof(float);
    uint64_t paramSize = sizeof(GpuSimParams);

    // We need to re-derive layouts for each bind group. Use the pipeline's layout.
    // Since we don't store the layouts, create them again (or extract from pipeline).
    // Simpler: re-create layouts matching pipelines.

    // Pass 1: applyForces — all read_write
    {
        auto bgl = createBGL(device, {{0,'S'},{1,'S'},{2,'S'},{3,'U'}});
        applyForcesBG_ = createBG(device, bgl, {
            {0, positionsBuffer_, p4},
            {1, predictedBuffer_, p4},
            {2, velocitiesBuffer_, p4},
            {3, paramsBuffer_, paramSize},
        });
    }

    // Pass 2: resetJacobi — all read_write (atomics)
    {
        auto bgl = createBGL(device, {{0,'S'},{1,'S'},{2,'S'},{3,'S'},{4,'S'},{5,'U'}});
        resetJacobiBG_ = createBG(device, bgl, {
            {0, lambdasBuffer_, sF32},
            {1, jacobiDXBuffer_, pI32},
            {2, jacobiDYBuffer_, pI32},
            {3, jacobiDZBuffer_, pI32},
            {4, jacobiCountBuffer_, pU32},
            {5, paramsBuffer_, paramSize},
        });
    }

    // Pass 3: solveConstraints — BG0: R,R,R,U  BG1: S,S,S,S,S
    {
        auto bgl0 = createBGL(device, {{0,'R'},{1,'R'},{2,'R'},{3,'U'}});
        solveConstraintsBG0_ = createBG(device, bgl0, {
            {0, positionsBuffer_, p4},
            {1, predictedBuffer_, p4},
            {2, springsBuffer_, sSpr},
            {3, paramsBuffer_, paramSize},
        });

        auto bgl1 = createBGL(device, {{0,'S'},{1,'S'},{2,'S'},{3,'S'},{4,'S'}});
        solveConstraintsBG1_ = createBG(device, bgl1, {
            {0, lambdasBuffer_, sF32},
            {1, jacobiDXBuffer_, pI32},
            {2, jacobiDYBuffer_, pI32},
            {3, jacobiDZBuffer_, pI32},
            {4, jacobiCountBuffer_, pU32},
        });
    }

    // Pass 4: applyJacobi — predicted(S), jacobi*(R), params(U)
    {
        auto bgl = createBGL(device, {{0,'S'},{1,'R'},{2,'R'},{3,'R'},{4,'R'},{5,'U'}});
        applyJacobiBG_ = createBG(device, bgl, {
            {0, predictedBuffer_, p4},
            {1, jacobiDXBuffer_, pI32},
            {2, jacobiDYBuffer_, pI32},
            {3, jacobiDZBuffer_, pI32},
            {4, jacobiCountBuffer_, pU32},
            {5, paramsBuffer_, paramSize},
        });
    }

    // Pass 5: handleCollisions — positions(R), predicted(S), colliders(R), params(U), meshTris(R), meshBVH(R)
    {
        uint64_t triSize = std::max(static_cast<uint64_t>(numMeshTris_ * 4), static_cast<uint64_t>(1)) * sizeof(glm::vec4);
        uint64_t bvhSize = std::max(static_cast<uint64_t>(numBVHNodes_ * 3), static_cast<uint64_t>(1)) * sizeof(glm::vec4);
        auto bgl = createBGL(device, {{0,'R'},{1,'S'},{2,'R'},{3,'U'},{4,'R'},{5,'R'}});
        collisionBG_ = createBG(device, bgl, {
            {0, positionsBuffer_, p4},
            {1, predictedBuffer_, p4},
            {2, collidersBuffer_, colSize},
            {3, paramsBuffer_, paramSize},
            {4, meshTriBuffer_, triSize},
            {5, meshBVHBuffer_, bvhSize},
        });
    }

    // Pass 6: updateVelocities — positions(S), predicted(R), velocities(S), prev(S), params(U)
    {
        auto bgl = createBGL(device, {{0,'S'},{1,'R'},{2,'S'},{3,'S'},{4,'U'}});
        updateVelocitiesBG_ = createBG(device, bgl, {
            {0, positionsBuffer_, p4},
            {1, predictedBuffer_, p4},
            {2, velocitiesBuffer_, p4},
            {3, prevPositionsBuffer_, p4},
            {4, paramsBuffer_, paramSize},
        });
    }

    // Pass 7a: resetNormals — all read_write (atomics)
    {
        auto bgl = createBGL(device, {{0,'S'},{1,'S'},{2,'S'},{3,'U'}});
        resetNormalsBG_ = createBG(device, bgl, {
            {0, normalAccumXBuffer_, pI32},
            {1, normalAccumYBuffer_, pI32},
            {2, normalAccumZBuffer_, pI32},
            {3, paramsBuffer_, paramSize},
        });
    }

    // Pass 7b: accumulateFaceNormals — positions(R), normalXYZ(S atomics), indices(R), params(U)
    {
        auto bgl = createBGL(device, {{0,'R'},{1,'S'},{2,'S'},{3,'S'},{4,'R'},{5,'U'}});
        accumNormalsBG_ = createBG(device, bgl, {
            {0, positionsBuffer_, p4},
            {1, normalAccumXBuffer_, pI32},
            {2, normalAccumYBuffer_, pI32},
            {3, normalAccumZBuffer_, pI32},
            {4, indexBuffer_, idxSize},
            {5, paramsBuffer_, paramSize},
        });
    }

    // Pass 7c: assembleVertexBuffer — positions(R), normalXYZ(R), texCoords(R), vertexOut(S), params(U)
    {
        auto bgl = createBGL(device, {{0,'R'},{1,'R'},{2,'R'},{3,'R'},{4,'R'},{5,'S'},{6,'U'}});
        assembleVertexBG_ = createBG(device, bgl, {
            {0, positionsBuffer_, p4},
            {1, normalAccumXBuffer_, pI32},
            {2, normalAccumYBuffer_, pI32},
            {3, normalAccumZBuffer_, pI32},
            {4, texCoordsBuffer_, pTex},
            {5, vertexOutputBuffer_, vtxSize},
            {6, paramsBuffer_, paramSize},
        });
    }
}

// ─── Encode Helper ───────────────────────────────────────────────────────

void GpuClothSolver::encodePass(wgpu::CommandEncoder& encoder,
                                 wgpu::ComputePipeline& pipeline,
                                 wgpu::BindGroup& bg, uint32_t workgroups) {
    auto pass = encoder.BeginComputePass();
    pass.SetPipeline(pipeline);
    pass.SetBindGroup(0, bg);
    pass.DispatchWorkgroups(workgroups);
    pass.End();
}

// ─── Step (main simulation loop) ─────────────────────────────────────────

void GpuClothSolver::step(wgpu::Device& device, wgpu::Queue& queue,
                           const ClothSimulation& sim, double timeMs,
                           const std::vector<CollisionBody>& colliders) {
    if (!initialized_) return;

    // Timing accumulator (mirrors CPU logic)
    if (lastTime_ < 0.0) {
        lastTime_ = timeMs;
        return;
    }

    double frameDt = timeMs - lastTime_;
    lastTime_ = timeMs;
    if (frameDt > MAX_FRAME_DT_MS) frameDt = MAX_FRAME_DT_MS;

    accumulator_ += frameDt;

    int frameSteps = 0;
    while (accumulator_ >= FIXED_DT_MS && frameSteps < 2) {
        accumulator_ -= FIXED_DT_MS;
        frameSteps++;
    }
    if (accumulator_ > FIXED_DT_MS * 2.0) {
        accumulator_ = 0.0;
    }

    // Even if no sim steps, we still need normals + vertex assembly for rendering
    int numSubsteps = sim.getNumSubsteps();
    int totalSubsteps = frameSteps * numSubsteps;

    // Update params uniform
    float subDt = static_cast<float>(FIXED_DT_MS / 1000.0) / static_cast<float>(numSubsteps);

    GpuSimParams params{};
    params.gravity[0] = sim.getGravity().x;
    params.gravity[1] = sim.getGravity().y;
    params.gravity[2] = sim.getGravity().z;
    params.gravity[3] = subDt;

    params.wind[0] = sim.getWindForce().x;
    params.wind[1] = sim.getWindForce().y;
    params.wind[2] = sim.getWindForce().z;
    params.wind[3] = static_cast<float>(timeMs);

    params.simConfig[0] = sim.getDamping();
    params.simConfig[1] = sim.getFriction();
    params.simConfig[2] = sim.getClothThickness();
    params.simConfig[3] = static_cast<float>(numParticles_);

    params.simConfig2[0] = static_cast<uint32_t>(numSprings_);
    params.simConfig2[1] = static_cast<uint32_t>(numTriangles_);
    params.simConfig2[2] = static_cast<uint32_t>(std::min(static_cast<int>(colliders.size()), 32));
    params.simConfig2[3] = static_cast<uint32_t>(numMeshTris_);

    params.groundPlane[0] = 1.2f;    // SOR omega (1.0=standard Jacobi, 1.2~1.5=over-relax)
    params.groundPlane[1] = 1.0f;
    params.groundPlane[2] = static_cast<float>(numBVHNodes_);  // BVH node count for mesh collision
    params.groundPlane[3] = 0.005f;  // ground Y offset

    params.compliance[0] = sim.getStretchCompliance();
    params.compliance[1] = sim.getShearCompliance();
    params.compliance[2] = sim.getBendCompliance();
    params.compliance[3] = 0.0f;

    queue.WriteBuffer(paramsBuffer_, 0, &params, sizeof(params));

    // Update colliders
    float colliderData[32 * 4] = {};
    int numColliders = std::min(static_cast<int>(colliders.size()), 32);
    for (int i = 0; i < numColliders; i++) {
        colliderData[i*4+0] = colliders[i].center.x;
        colliderData[i*4+1] = colliders[i].center.y;
        colliderData[i*4+2] = colliders[i].center.z;
        colliderData[i*4+3] = colliders[i].radius;
    }
    queue.WriteBuffer(collidersBuffer_, 0, colliderData, sizeof(colliderData));

    // Encode all compute passes
    wgpu::CommandEncoderDescriptor encDesc{};
    auto encoder = device.CreateCommandEncoder(&encDesc);

    // Substep loop
    for (int s = 0; s < totalSubsteps; s++) {
        // Pass 1: Apply forces and predict
        encodePass(encoder, applyForcesPipeline_, applyForcesBG_, dispatchParticles_);

        // Pass 2: Reset lambdas and Jacobi accumulators
        encodePass(encoder, resetJacobiPipeline_, resetJacobiBG_, dispatchMax_);

        // Pass 3: Solve constraints (two bind groups)
        {
            auto pass = encoder.BeginComputePass();
            pass.SetPipeline(solveConstraintsPipeline_);
            pass.SetBindGroup(0, solveConstraintsBG0_);
            pass.SetBindGroup(1, solveConstraintsBG1_);
            pass.DispatchWorkgroups(dispatchSprings_);
            pass.End();
        }

        // Pass 4: Apply Jacobi corrections
        encodePass(encoder, applyJacobiPipeline_, applyJacobiBG_, dispatchParticles_);

        // Pass 5: Handle collisions
        encodePass(encoder, collisionPipeline_, collisionBG_, dispatchParticles_);

        // Pass 6: Update velocities and commit positions
        encodePass(encoder, updateVelocitiesPipeline_, updateVelocitiesBG_, dispatchParticles_);
    }

    // Per-frame: normal calculation + vertex assembly
    encodePass(encoder, resetNormalsPipeline_, resetNormalsBG_, dispatchParticles_);
    encodePass(encoder, accumNormalsPipeline_, accumNormalsBG_, dispatchTriangles_);
    encodePass(encoder, assembleVertexPipeline_, assembleVertexBG_, dispatchParticles_);

    auto commands = encoder.Finish();
    queue.Submit(1, &commands);
}

// ─── Upload CPU state to GPU ─────────────────────────────────────────────

void GpuClothSolver::uploadState(wgpu::Queue& queue, const ClothSimulation& sim) {
    if (!initialized_) return;

    const auto& particles = sim.getParticles();
    int n = std::min(static_cast<int>(particles.size()), numParticles_);

    std::vector<float> posData(n * 4);
    std::vector<float> velData(n * 4, 0.0f);
    std::vector<float> prevData(n * 4);

    for (int i = 0; i < n; i++) {
        posData[i*4+0] = particles[i].position.x;
        posData[i*4+1] = particles[i].position.y;
        posData[i*4+2] = particles[i].position.z;
        posData[i*4+3] = particles[i].invMass;

        velData[i*4+0] = particles[i].velocity.x;
        velData[i*4+1] = particles[i].velocity.y;
        velData[i*4+2] = particles[i].velocity.z;

        prevData[i*4+0] = particles[i].prevPosition.x;
        prevData[i*4+1] = particles[i].prevPosition.y;
        prevData[i*4+2] = particles[i].prevPosition.z;
        prevData[i*4+3] = particles[i].invMass;
    }

    uint64_t size = n * 4 * sizeof(float);
    queue.WriteBuffer(positionsBuffer_, 0, posData.data(), size);
    queue.WriteBuffer(predictedBuffer_, 0, posData.data(), size);
    queue.WriteBuffer(velocitiesBuffer_, 0, velData.data(), size);
    queue.WriteBuffer(prevPositionsBuffer_, 0, prevData.data(), size);

    // Reset timing
    lastTime_ = -1.0;
    accumulator_ = 0.0;

    emscripten_log(EM_LOG_CONSOLE, "[GPU Solver] State uploaded (%d particles)", n);
}

// ─── Upload single particle to GPU ───────────────────────────────────────

void GpuClothSolver::uploadSingleParticle(wgpu::Queue& queue, const ClothSimulation& sim, int index) {
    if (!initialized_ || index < 0 || index >= numParticles_) return;

    const auto& p = sim.getParticles()[index];
    float data[4] = { p.position.x, p.position.y, p.position.z, p.invMass };
    float prevData[4] = { p.prevPosition.x, p.prevPosition.y, p.prevPosition.z, p.invMass };
    uint64_t offset = static_cast<uint64_t>(index) * 16;

    queue.WriteBuffer(positionsBuffer_, offset, data, 16);
    queue.WriteBuffer(predictedBuffer_, offset, data, 16);
    queue.WriteBuffer(prevPositionsBuffer_, offset, prevData, 16);
}

// ─── Destroy ─────────────────────────────────────────────────────────────

void GpuClothSolver::destroy() {
    if (!initialized_) return;

    positionsBuffer_ = nullptr;
    predictedBuffer_ = nullptr;
    velocitiesBuffer_ = nullptr;
    prevPositionsBuffer_ = nullptr;
    springsBuffer_ = nullptr;
    lambdasBuffer_ = nullptr;
    jacobiDXBuffer_ = nullptr;
    jacobiDYBuffer_ = nullptr;
    jacobiDZBuffer_ = nullptr;
    jacobiCountBuffer_ = nullptr;
    normalAccumXBuffer_ = nullptr;
    normalAccumYBuffer_ = nullptr;
    normalAccumZBuffer_ = nullptr;
    texCoordsBuffer_ = nullptr;
    indexBuffer_ = nullptr;
    vertexOutputBuffer_ = nullptr;
    collidersBuffer_ = nullptr;
    paramsBuffer_ = nullptr;

    applyForcesPipeline_ = nullptr;
    resetJacobiPipeline_ = nullptr;
    solveConstraintsPipeline_ = nullptr;
    applyJacobiPipeline_ = nullptr;
    collisionPipeline_ = nullptr;
    updateVelocitiesPipeline_ = nullptr;
    resetNormalsPipeline_ = nullptr;
    accumNormalsPipeline_ = nullptr;
    assembleVertexPipeline_ = nullptr;

    applyForcesBG_ = nullptr;
    resetJacobiBG_ = nullptr;
    solveConstraintsBG0_ = nullptr;
    solveConstraintsBG1_ = nullptr;
    applyJacobiBG_ = nullptr;
    collisionBG_ = nullptr;
    updateVelocitiesBG_ = nullptr;
    resetNormalsBG_ = nullptr;
    accumNormalsBG_ = nullptr;
    assembleVertexBG_ = nullptr;

    initialized_ = false;
}
