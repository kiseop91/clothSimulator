#pragma once

#include <webgpu/webgpu_cpp.h>
#include <emscripten.h>
#include <string>
#include <memory>
#include <vector>
#include "renderer/Shader.h"
#include "scene/Scene.h"
#include "scene/Camera.h"
#include "scene/Grid.h"
#include "simulation/ClothSimulation.h"
#include "simulation/CollisionBody.h"
#include "simulation/GpuClothSolver.h"

// PBR uniform block — must match WGSL struct layout
struct PBRUniforms {
    glm::mat4 model;
    glm::mat4 view;
    glm::mat4 projection;
    glm::mat4 lightSpaceMatrix;
    glm::vec3 camPos;       float _pad0;
    glm::vec3 lightPos;     float _pad1;
    glm::vec3 lightColor;   float _pad2;
    glm::vec3 baseColor;    float metallic;
    glm::vec3 ambientTop;   float roughness;
    glm::vec3 ambientBottom; float shadowEnabled;
    glm::vec2 uvOffset;
    glm::vec2 uvTiling;
    float hasTexture;
    float _pad3, _pad4, _pad5;
};

struct ShadowUniforms {
    glm::mat4 model;
    glm::mat4 lightSpaceMatrix;
};

struct WireUniforms {
    glm::mat4 model;
    glm::mat4 view;
    glm::mat4 projection;
    glm::vec4 color;
};

class Renderer {
public:
    Renderer();
    ~Renderer();

    bool init(const std::string& canvasId);
    void stepAndRender(double time);
    void renderFrame();
    void resize(int width, int height);
    void destroy();

    Scene& getScene() { return scene_; }
    Camera& getCamera() { return camera_; }

    int getWidth() const { return width_; }
    int getHeight() const { return height_; }

    std::string exportScreenshot();

    // Cloth simulation
    void addClothMesh(float width, float height, int resX, int resY);
    void addClothMeshHorizontal(float width, float depth, int resX, int resZ, float dropHeight);
    void toggleSimulation(bool running);
    void resetCloth();
    void setGravity(float x, float y, float z) { clothSim_.setGravity(x, y, z); }
    void setWindForce(float x, float y, float z) { clothSim_.setWindForce(x, y, z); }
    void setClothStiffness(float s) { clothSim_.setStiffness(s); }
    void setClothDamping(float d) { clothSim_.setDamping(d); }
    void setClothFriction(float f) { clothSim_.setFriction(f); }
    void setSelfCollision(bool enabled) { clothSim_.setSelfCollision(enabled); }
    void setClothThickness(float t) { clothSim_.setClothThickness(t); }
    void setStretchCompliance(float c) { clothSim_.setStretchCompliance(c); }
    void setShearCompliance(float c) { clothSim_.setShearCompliance(c); }
    void setBendCompliance(float c) { clothSim_.setBendCompliance(c); }
    void setNumSubsteps(int n) { clothSim_.setNumSubsteps(n); }
    float getStretchCompliance() const { return clothSim_.getStretchCompliance(); }
    float getShearCompliance() const { return clothSim_.getShearCompliance(); }
    float getBendCompliance() const { return clothSim_.getBendCompliance(); }
    int getNumSubsteps() const { return clothSim_.getNumSubsteps(); }
    void convertMeshToCloth(int meshIndex, int pinMode);
    bool isSimulationRunning() const { return clothSim_.isRunning(); }
    ClothSimulation& getClothSim() { return clothSim_; }
    void setUseGpuSolver(bool use);
    bool getUseGpuSolver() const { return useGpuSolver_; }
    void setSolverMode(int mode);
    int getSolverMode() const { return static_cast<int>(clothSim_.getSolverMode()); }
    void setConstraintIterations(int n) { clothSim_.setConstraintIterations(n); }
    int getConstraintIterations() const { return clothSim_.getConstraintIterations(); }

    // Collision spheres
    void addCollisionSphere(float x, float y, float z, float radius);
    void removeCollisionSphere(int index);
    int getCollisionSphereCount() const { return static_cast<int>(collisionSpheres_.size()); }

    // Object selection and manipulation
    int pickSphere(float ox, float oy, float oz, float dx, float dy, float dz) const;
    bool pickCloth(float ox, float oy, float oz, float dx, float dy, float dz, float& t) const;
    void setCollisionSpherePosition(int index, float x, float y, float z);
    void translateCloth(float dx, float dy, float dz);

    // Cloth grab interaction
    int grabClothParticle(float ndcX, float ndcY);
    void moveGrabbedParticle(float ndcX, float ndcY);
    void releaseClothParticle();
    void setSelectedSphere(int index) { selectedSphereIndex_ = index; }
    int getSelectedSphere() const { return selectedSphereIndex_; }
    float getCollisionSphereX(int index) const;
    float getCollisionSphereY(int index) const;
    float getCollisionSphereZ(int index) const;

    // Rendering modes
    void setShowCollisionSpheres(bool show) { showCollisionSpheres_ = show; }
    bool getShowCollisionSpheres() const { return showCollisionSpheres_; }

    void setWireframeMode(bool enabled) {
        wireframeMode_ = enabled;
        emscripten_log(EM_LOG_CONSOLE, "[Wire Debug] setWireframeMode: %s", enabled ? "ON" : "OFF");
    }
    bool getWireframeMode() const { return wireframeMode_; }

    // GPU diagnostics accessors
    int getGpuBufferCount() const { return diag_.bufferCount; }
    int getGpuTextureCount() const { return diag_.textureCount; }
    size_t getEstimatedVram() const { return diag_.estimatedVram; }
    int getDrawCallCount() const { return diag_.drawCallsPerFrame; }
    float getFrameTimeMs() const { return diag_.avgFrameTimeMs; }
    int getGpuErrorCount() const { return diag_.errorCount; }
    void incrementErrorCount() { diag_.errorCount++; }
    void setDeviceLost() { deviceLost_ = true; }

    // Texture
    void loadDiffuseTexture(const uint8_t* data, int size);
    void clearDiffuseTexture();

    // Light control
    void setLightPosition(float x, float y, float z) { lightPos_ = glm::vec3(x, y, z); }
    void setLightColor(float r, float g, float b) { lightColor_ = glm::vec3(r, g, b); }
    void setLightIntensity(float v) { lightIntensity_ = v; }
    void setAmbientTop(float r, float g, float b) { ambientTop_ = glm::vec3(r, g, b); }
    void setAmbientBottom(float r, float g, float b) { ambientBottom_ = glm::vec3(r, g, b); }
    const glm::vec3& getLightPos() const { return lightPos_; }

    // UV control
    void setUVOffset(float u, float v) { uvOffset_ = glm::vec2(u, v); }
    void setUVTiling(float u, float v) { uvTiling_ = glm::vec2(u, v); }

    // WebGPU accessors for Mesh creation
    wgpu::Device& getDevice() { return device_; }
    wgpu::Queue& getQueue() { return queue_; }

private:
    void createPipelines();
    void createShadowResources();
    void createSphereWireframe();
    void createDummyTexture();
    void renderShadowPass(wgpu::CommandEncoder& encoder);
    void renderCollisionSpheres(wgpu::RenderPassEncoder& pass);
    void syncCollidersToSim();

    int width_;
    int height_;
    bool initialized_;

    // WebGPU core
    wgpu::Instance instance_;
    wgpu::Adapter adapter_;
    wgpu::Device device_;
    wgpu::Queue queue_;
    wgpu::Surface surface_;
    wgpu::TextureFormat surfaceFormat_;

    // Depth
    wgpu::Texture depthTexture_;
    wgpu::TextureView depthView_;

    // Shaders
    Shader pbrShader_;
    Shader shadowShader_;
    Shader wireShader_;

    // Pipelines
    wgpu::RenderPipeline pbrPipeline_;
    wgpu::RenderPipeline pbrBackfacePipeline_;
    wgpu::RenderPipeline wirePipeline_;
    wgpu::RenderPipeline shadowPipeline_;

    // Bind group layouts
    wgpu::BindGroupLayout pbrBindGroupLayout_;
    wgpu::BindGroupLayout shadowBindGroupLayout_;
    wgpu::BindGroupLayout wireBindGroupLayout_;

    // PBR uniform buffer
    wgpu::Buffer pbrUniformBuffer_;
    wgpu::Buffer shadowUniformBuffer_;

    // Shadow map
    wgpu::Texture shadowTexture_;
    wgpu::TextureView shadowTextureView_;
    wgpu::Sampler shadowSampler_;
    int shadowMapSize_;
    glm::mat4 lightSpaceMatrix_;

    // Diffuse texture
    wgpu::Texture diffuseTexture_;
    wgpu::TextureView diffuseTextureView_;
    wgpu::Sampler diffuseSampler_;
    bool hasTexture_;
    wgpu::Texture dummyTexture_;
    wgpu::TextureView dummyTextureView_;

    // PBR bind group (rebuilt when texture changes)
    wgpu::BindGroup pbrBindGroup_;
    void rebuildPBRBindGroup();

    // Scene
    Scene scene_;
    Camera camera_;
    Grid grid_;

    // Cloth simulation
    ClothSimulation clothSim_;
    Mesh* clothMesh_;
    GpuClothSolver gpuSolver_;
    bool useGpuSolver_ = false;

    // Collision sphere visualization
    std::vector<CollisionBody> collisionSpheres_;
    wgpu::Buffer sphereVbo_;
    int sphereVertexCount_;
    int selectedSphereIndex_;
    // Wireframe mode
    bool wireframeMode_;
    bool showCollisionSpheres_ = true;

    // Separate uniform buffers + bind groups per wire draw
    static const int MAX_WIRE_DRAWS = 32;
    int wireDrawIndex_ = 0; // reset each frame
    wgpu::Buffer wireUniformBuffers_[MAX_WIRE_DRAWS];
    wgpu::BindGroup wireBindGroups_[MAX_WIRE_DRAWS];

    // Shadow bind group (created once, reused each frame)
    wgpu::BindGroup shadowBindGroup_;

    // Device lost flag
    bool deviceLost_ = false;

    // GPU diagnostics
    struct GpuDiagnostics {
        int bufferCount = 0;
        int textureCount = 0;
        int bindGroupCount = 0;
        size_t estimatedVram = 0;
        int drawCallsPerFrame = 0;
        float frameTimeMs = 0.0f;
        float avgFrameTimeMs = 0.0f;
        int errorCount = 0;
    };
    GpuDiagnostics diag_;
    int frameCount_ = 0;

    // Light parameters
    glm::vec3 lightPos_ = glm::vec3(5.0f, 8.0f, 5.0f);
    glm::vec3 lightColor_ = glm::vec3(1.0f, 1.0f, 1.0f);
    float lightIntensity_ = 3.0f;
    glm::vec3 ambientTop_ = glm::vec3(0.3f, 0.35f, 0.45f);
    glm::vec3 ambientBottom_ = glm::vec3(0.15f, 0.12f, 0.1f);

    // UV parameters
    glm::vec2 uvOffset_ = glm::vec2(0.0f);
    glm::vec2 uvTiling_ = glm::vec2(1.0f);
};

// Global instance for the animation frame callback
Renderer* getGlobalRenderer();
void setGlobalRenderer(Renderer* r);
