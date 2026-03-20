#pragma once

#include <webgpu/webgpu_cpp.h>
#include <vector>
#include "simulation/ClothSimulation.h"
#include "simulation/CollisionBody.h"

class GpuClothSolver {
public:
    GpuClothSolver();
    ~GpuClothSolver();

    void init(wgpu::Device& device, wgpu::Queue& queue, const ClothSimulation& sim);
    void step(wgpu::Device& device, wgpu::Queue& queue,
              const ClothSimulation& sim, double timeMs,
              const std::vector<CollisionBody>& colliders);
    void destroy();

    bool isInitialized() const { return initialized_; }

    wgpu::Buffer getVertexBuffer() const { return vertexOutputBuffer_; }
    wgpu::Buffer getIndexBuffer() const { return indexBuffer_; }
    int getIndexCount() const { return numTriangles_ * 3; }

    // Upload current CPU particle state to GPU buffers
    void uploadState(wgpu::Queue& queue, const ClothSimulation& sim);

private:
    void createBuffers(wgpu::Device& device, wgpu::Queue& queue, const ClothSimulation& sim);
    void createPipelines(wgpu::Device& device);
    void createBindGroups(wgpu::Device& device);

    // Encode a single-bind-group compute pass
    void encodePass(wgpu::CommandEncoder& encoder,
                    wgpu::ComputePipeline& pipeline,
                    wgpu::BindGroup& bg, uint32_t workgroups);

    bool initialized_ = false;

    int numParticles_ = 0;
    int numSprings_ = 0;
    int numTriangles_ = 0;

    uint32_t dispatchParticles_ = 0;
    uint32_t dispatchSprings_ = 0;
    uint32_t dispatchTriangles_ = 0;
    uint32_t dispatchMax_ = 0;

    // Timing (mirrors CPU accumulator logic)
    double lastTime_ = -1.0;
    double accumulator_ = 0.0;
    static constexpr double FIXED_DT_MS = 16.0;
    static constexpr double MAX_FRAME_DT_MS = 33.0;

    // ─── GPU Buffers ─────────────────────────────────────────────
    wgpu::Buffer positionsBuffer_;       // vec4f (xyz + invMass)
    wgpu::Buffer predictedBuffer_;       // vec4f (xyz + invMass)
    wgpu::Buffer velocitiesBuffer_;      // vec4f
    wgpu::Buffer prevPositionsBuffer_;   // vec4f
    wgpu::Buffer springsBuffer_;         // {u32, u32, f32, u32} packed
    wgpu::Buffer lambdasBuffer_;         // f32 per spring
    wgpu::Buffer jacobiDXBuffer_;        // i32 per particle (atomic)
    wgpu::Buffer jacobiDYBuffer_;        // i32 per particle (atomic)
    wgpu::Buffer jacobiDZBuffer_;        // i32 per particle (atomic)
    wgpu::Buffer jacobiCountBuffer_;     // u32 per particle (atomic)
    wgpu::Buffer normalAccumXBuffer_;    // i32 per particle (atomic)
    wgpu::Buffer normalAccumYBuffer_;    // i32 per particle (atomic)
    wgpu::Buffer normalAccumZBuffer_;    // i32 per particle (atomic)
    wgpu::Buffer texCoordsBuffer_;       // vec2f per particle
    wgpu::Buffer indexBuffer_;           // u32 (Storage | Index)
    wgpu::Buffer vertexOutputBuffer_;    // f32 × 8 per particle (Storage | Vertex)
    wgpu::Buffer collidersBuffer_;       // vec4f × 32
    wgpu::Buffer paramsBuffer_;          // Uniform

    // ─── Compute Pipelines ───────────────────────────────────────
    wgpu::ComputePipeline applyForcesPipeline_;
    wgpu::ComputePipeline resetJacobiPipeline_;
    wgpu::ComputePipeline solveConstraintsPipeline_;
    wgpu::ComputePipeline applyJacobiPipeline_;
    wgpu::ComputePipeline collisionPipeline_;
    wgpu::ComputePipeline updateVelocitiesPipeline_;
    wgpu::ComputePipeline resetNormalsPipeline_;
    wgpu::ComputePipeline accumNormalsPipeline_;
    wgpu::ComputePipeline assembleVertexPipeline_;

    // ─── Bind Groups ─────────────────────────────────────────────
    wgpu::BindGroup applyForcesBG_;
    wgpu::BindGroup resetJacobiBG_;
    wgpu::BindGroup solveConstraintsBG0_;
    wgpu::BindGroup solveConstraintsBG1_;
    wgpu::BindGroup applyJacobiBG_;
    wgpu::BindGroup collisionBG_;
    wgpu::BindGroup updateVelocitiesBG_;
    wgpu::BindGroup resetNormalsBG_;
    wgpu::BindGroup accumNormalsBG_;
    wgpu::BindGroup assembleVertexBG_;

    // ─── CPU-side params struct ──────────────────────────────────
    struct GpuSimParams {
        float gravity[4];       // gx, gy, gz, dt
        float wind[4];          // wx, wy, wz, globalTime
        float simConfig[4];     // damping, friction, clothThickness, numParticles_f32
        uint32_t simConfig2[4]; // numSprings, numTriangles, numColliders, 0
        float groundPlane[4];   // nx, ny, nz, offset
        float compliance[4];    // stretch, shear, bend, 0
    };

    // Packed spring struct for GPU upload
    struct GpuSpring {
        uint32_t particleA;
        uint32_t particleB;
        float restLength;
        uint32_t springType; // 0=STRUCTURAL, 1=SHEAR, 2=BEND
    };
};
