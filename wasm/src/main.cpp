#include <emscripten.h>
#include <emscripten/bind.h>
#include <emscripten/html5.h>
#include <emscripten/val.h>
#include <string>
#include <cstring>
#include <vector>

#include "renderer/Renderer.h"
#include "loaders/ModelLoader.h"
#include "mesh/Mesh.h"

// Global renderer instance
static Renderer g_rendererInstance;

// ─── Exported Functions ──────────────────────────────────────────────

bool initRenderer(const std::string& canvasId) {
    return g_rendererInstance.init(canvasId);
}

void resizeViewport(int w, int h) {
    g_rendererInstance.resize(w, h);
}

void destroyRenderer() {
    g_rendererInstance.destroy();
}

bool loadModel(const emscripten::val& jsData, int size, const std::string& ext) {
    if (size <= 0) {
        emscripten_log(EM_LOG_ERROR, "loadModel: invalid size");
        return false;
    }

    // Copy data from JS Uint8Array to C++ vector
    std::vector<uint8_t> buffer(size);
    emscripten::val memoryView = emscripten::val::module_property("HEAPU8");
    auto ptr = reinterpret_cast<uintptr_t>(buffer.data());

    // Use the Uint8Array.set method - copy JS typed array into WASM memory
    emscripten::val jsArray = jsData;

    // Convert JS Uint8Array to vector by reading element by element for safety
    // Or use the more efficient approach via memory view
    emscripten::val uint8Array = emscripten::val::global("Uint8Array").new_(jsData);

    // Use vecFromJSArray for efficient conversion
    buffer = emscripten::vecFromJSArray<uint8_t>(uint8Array);

    if (buffer.empty()) {
        emscripten_log(EM_LOG_ERROR, "loadModel: failed to read data from JS");
        return false;
    }

    // Load mesh data from file bytes
    std::vector<MeshData> meshes = ModelLoader::load(buffer.data(), buffer.size(), ext);
    if (meshes.empty()) {
        emscripten_log(EM_LOG_ERROR, "loadModel: no meshes loaded from %s data", ext.c_str());
        return false;
    }

    // Clear previous scene
    g_rendererInstance.getScene().clearScene();

    // Upload meshes to GPU and cache mesh data for collision
    int totalVerts = 0;
    int totalTris = 0;
    for (auto& meshData : meshes) {
        Mesh* mesh = new Mesh();
        mesh->init(g_rendererInstance.getDevice(), meshData);
        mesh->setName("mesh_" + std::to_string(g_rendererInstance.getScene().getMeshes().size()));
        g_rendererInstance.getScene().addMesh(mesh);
        g_rendererInstance.getScene().addMeshData(meshData);
        totalVerts += static_cast<int>(meshData.vertices.size());
        totalTris += static_cast<int>(meshData.indices.size()) / 3;
    }

    emscripten_log(EM_LOG_CONSOLE, "Model loaded: %zu mesh(es), %d vertices, %d triangles",
                   meshes.size(), totalVerts, totalTris);
    return true;
}

// Camera controls
void cameraRotate(float dx, float dy) {
    g_rendererInstance.getCamera().rotate(dx, dy);
}

void cameraZoom(float delta) {
    g_rendererInstance.getCamera().zoom(delta);
}

void cameraPan(float dx, float dy) {
    g_rendererInstance.getCamera().pan(dx, dy);
}

void cameraResetView() {
    g_rendererInstance.getCamera().resetView();
}

// Transform controls
void setPosition(float x, float y, float z) {
    g_rendererInstance.getScene().setPosition(x, y, z);
}

void setRotation(float x, float y, float z) {
    g_rendererInstance.getScene().setRotation(x, y, z);
}

void setScale(float x, float y, float z) {
    g_rendererInstance.getScene().setScale(x, y, z);
}

// Material controls
void setBaseColor(float r, float g, float b) {
    g_rendererInstance.getScene().getMaterial().setBaseColor(r, g, b);
}

void setMetallic(float v) {
    g_rendererInstance.getScene().getMaterial().setMetallic(v);
}

void setRoughness(float v) {
    g_rendererInstance.getScene().getMaterial().setRoughness(v);
}

// Layer visibility
void setLayerVisible(const std::string& name, bool visible) {
    for (auto* mesh : g_rendererInstance.getScene().getMeshes()) {
        if (mesh->getName() == name) {
            mesh->setVisible(visible);
            return;
        }
    }
    emscripten_log(EM_LOG_WARN, "setLayerVisible: mesh '%s' not found", name.c_str());
}

// Stats
int getVertexCount() {
    return g_rendererInstance.getScene().getVertexCount();
}

int getFaceCount() {
    return g_rendererInstance.getScene().getFaceCount();
}

int getTriangleCount() {
    return g_rendererInstance.getScene().getTriangleCount();
}

// Screenshot
std::string exportScreenshot() {
    return g_rendererInstance.exportScreenshot();
}

// Cloth simulation
void addClothMesh(float w, float h, int rx, int ry) {
    g_rendererInstance.addClothMesh(w, h, rx, ry);
}

void toggleSimulation(bool running) {
    g_rendererInstance.toggleSimulation(running);
}

void resetCloth() {
    g_rendererInstance.resetCloth();
}

void setGravity(float x, float y, float z) {
    g_rendererInstance.setGravity(x, y, z);
}

void setWindForce(float x, float y, float z) {
    g_rendererInstance.setWindForce(x, y, z);
}

void setClothStiffness(float s) {
    g_rendererInstance.setClothStiffness(s);
}

void setClothDamping(float d) {
    g_rendererInstance.setClothDamping(d);
}

void setClothFriction(float f) {
    g_rendererInstance.setClothFriction(f);
}

void setSelfCollision(bool enabled) {
    g_rendererInstance.setSelfCollision(enabled);
}

void setClothThickness(float t) {
    g_rendererInstance.setClothThickness(t);
}

void setStretchCompliance(float c) {
    g_rendererInstance.setStretchCompliance(c);
}

void setShearCompliance(float c) {
    g_rendererInstance.setShearCompliance(c);
}

void setBendCompliance(float c) {
    g_rendererInstance.setBendCompliance(c);
}

void setNumSubsteps(int n) {
    g_rendererInstance.setNumSubsteps(n);
}

float getStretchCompliance() {
    return g_rendererInstance.getStretchCompliance();
}

float getShearCompliance() {
    return g_rendererInstance.getShearCompliance();
}

float getBendCompliance() {
    return g_rendererInstance.getBendCompliance();
}

int getNumSubsteps() {
    return g_rendererInstance.getNumSubsteps();
}

bool isSimulationRunning() {
    return g_rendererInstance.isSimulationRunning();
}

void setUseGpuSolver(bool use) {
    g_rendererInstance.setUseGpuSolver(use);
}

bool getUseGpuSolver() {
    return g_rendererInstance.getUseGpuSolver();
}

// Horizontal cloth (drop from above)
void addClothMeshHorizontal(float w, float d, int rx, int rz, float h) {
    g_rendererInstance.addClothMeshHorizontal(w, d, rx, rz, h);
}

// Mesh to cloth conversion
void convertMeshToCloth(int meshIndex, int pinMode) {
    g_rendererInstance.convertMeshToCloth(meshIndex, pinMode);
}

int getLoadedMeshCount() {
    return static_cast<int>(g_rendererInstance.getScene().getMeshes().size());
}

std::string getLoadedMeshName(int index) {
    auto& meshes = g_rendererInstance.getScene().getMeshes();
    if (index < 0 || index >= static_cast<int>(meshes.size())) return "";
    return meshes[index]->getName();
}

// Per-mesh transforms
void setMeshPosition(int index, float x, float y, float z) {
    auto& meshes = g_rendererInstance.getScene().getMeshes();
    if (index >= 0 && index < static_cast<int>(meshes.size()))
        meshes[index]->setMeshPosition(x, y, z);
}
void setMeshRotation(int index, float x, float y, float z) {
    auto& meshes = g_rendererInstance.getScene().getMeshes();
    if (index >= 0 && index < static_cast<int>(meshes.size()))
        meshes[index]->setMeshRotation(x, y, z);
}
void setMeshScale(int index, float x, float y, float z) {
    auto& meshes = g_rendererInstance.getScene().getMeshes();
    if (index >= 0 && index < static_cast<int>(meshes.size()))
        meshes[index]->setMeshScale(x, y, z);
}
float getMeshPositionX(int index) {
    auto& meshes = g_rendererInstance.getScene().getMeshes();
    if (index >= 0 && index < static_cast<int>(meshes.size()))
        return meshes[index]->getMeshPosition().x;
    return 0.0f;
}
float getMeshPositionY(int index) {
    auto& meshes = g_rendererInstance.getScene().getMeshes();
    if (index >= 0 && index < static_cast<int>(meshes.size()))
        return meshes[index]->getMeshPosition().y;
    return 0.0f;
}
float getMeshPositionZ(int index) {
    auto& meshes = g_rendererInstance.getScene().getMeshes();
    if (index >= 0 && index < static_cast<int>(meshes.size()))
        return meshes[index]->getMeshPosition().z;
    return 0.0f;
}
void removeLoadedMesh(int index) {
    g_rendererInstance.getScene().removeMesh(index);
}

// Light control
void setLightPosition(float x, float y, float z) { g_rendererInstance.setLightPosition(x, y, z); }
void setLightColor(float r, float g, float b) { g_rendererInstance.setLightColor(r, g, b); }
void setLightIntensity(float v) { g_rendererInstance.setLightIntensity(v); }
void setAmbientTop(float r, float g, float b) { g_rendererInstance.setAmbientTop(r, g, b); }
void setAmbientBottom(float r, float g, float b) { g_rendererInstance.setAmbientBottom(r, g, b); }
float getLightPositionX() { return g_rendererInstance.getLightPos().x; }
float getLightPositionY() { return g_rendererInstance.getLightPos().y; }
float getLightPositionZ() { return g_rendererInstance.getLightPos().z; }

// UV control
void setUVOffset(float u, float v) { g_rendererInstance.setUVOffset(u, v); }
void setUVTiling(float u, float v) { g_rendererInstance.setUVTiling(u, v); }

// Wireframe mode
void setWireframeMode(bool enabled) {
    g_rendererInstance.setWireframeMode(enabled);
}

// Texture loading
void loadDiffuseTexture(const emscripten::val& jsData, int size) {
    std::vector<uint8_t> buffer = emscripten::vecFromJSArray<uint8_t>(
        emscripten::val::global("Uint8Array").new_(jsData)
    );
    g_rendererInstance.loadDiffuseTexture(buffer.data(), static_cast<int>(buffer.size()));
}

void clearDiffuseTexture() {
    g_rendererInstance.clearDiffuseTexture();
}
void setMeshVisible(int index, bool visible) {
    auto& meshes = g_rendererInstance.getScene().getMeshes();
    if (index >= 0 && index < static_cast<int>(meshes.size()))
        meshes[index]->setVisible(visible);
}

// Collision spheres
void addCollisionSphere(float x, float y, float z, float radius) {
    g_rendererInstance.addCollisionSphere(x, y, z, radius);
}

void removeCollisionSphere(int index) {
    g_rendererInstance.removeCollisionSphere(index);
}

int getCollisionSphereCount() {
    return g_rendererInstance.getCollisionSphereCount();
}

// Object selection and manipulation
// Returns: >= 0 = sphere index, -2 = cloth, -3 = light, -1 = nothing
int pickObject(float ndcX, float ndcY) {
    float aspect = (g_rendererInstance.getHeight() > 0)
        ? static_cast<float>(g_rendererInstance.getWidth()) / static_cast<float>(g_rendererInstance.getHeight())
        : 1.0f;
    glm::vec3 origin, dir;
    g_rendererInstance.getCamera().screenToRay(ndcX, ndcY, aspect, origin, dir);

    // Check spheres first (higher priority)
    int sphereIdx = g_rendererInstance.pickSphere(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z);
    if (sphereIdx >= 0) return sphereIdx;

    // Check light sphere (radius 0.3)
    {
        glm::vec3 lp = g_rendererInstance.getLightPos();
        glm::vec3 oc = origin - lp;
        float r = 0.3f;
        float a = glm::dot(dir, dir);
        float b = 2.0f * glm::dot(oc, dir);
        float c = glm::dot(oc, oc) - r * r;
        float disc = b * b - 4.0f * a * c;
        if (disc >= 0.0f) {
            float t = (-b - std::sqrt(disc)) / (2.0f * a);
            if (t < 0.0f) t = (-b + std::sqrt(disc)) / (2.0f * a);
            if (t > 0.0f) return -3; // Light hit
        }
    }

    // Check cloth AABB
    float clothT = 0.0f;
    if (g_rendererInstance.pickCloth(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, clothT)) {
        return -2; // Cloth hit
    }

    return -1; // Nothing hit
}

void setCollisionSpherePosition(int index, float x, float y, float z) {
    g_rendererInstance.setCollisionSpherePosition(index, x, y, z);
}

void translateCloth(float dx, float dy, float dz) {
    g_rendererInstance.translateCloth(dx, dy, dz);
}

void setSelectedSphere(int index) {
    g_rendererInstance.setSelectedSphere(index);
}

float getCollisionSphereX(int index) {
    return g_rendererInstance.getCollisionSphereX(index);
}

float getCollisionSphereY(int index) {
    return g_rendererInstance.getCollisionSphereY(index);
}

float getCollisionSphereZ(int index) {
    return g_rendererInstance.getCollisionSphereZ(index);
}

// GPU diagnostics getters
int getGpuBufferCount() { return g_rendererInstance.getGpuBufferCount(); }
int getGpuTextureCount() { return g_rendererInstance.getGpuTextureCount(); }
int getEstimatedVram() { return static_cast<int>(g_rendererInstance.getEstimatedVram()); }
int getDrawCallCount() { return g_rendererInstance.getDrawCallCount(); }
float getFrameTimeMs() { return g_rendererInstance.getFrameTimeMs(); }
int getGpuErrorCount() { return g_rendererInstance.getGpuErrorCount(); }

// ─── Embind Bindings ─────────────────────────────────────────────────

EMSCRIPTEN_BINDINGS(renderer_module) {
    emscripten::function("initRenderer", &initRenderer);
    emscripten::function("resizeViewport", &resizeViewport);
    emscripten::function("destroyRenderer", &destroyRenderer);
    emscripten::function("loadModel", &loadModel);
    emscripten::function("cameraRotate", &cameraRotate);
    emscripten::function("cameraZoom", &cameraZoom);
    emscripten::function("cameraPan", &cameraPan);
    emscripten::function("cameraResetView", &cameraResetView);
    emscripten::function("setPosition", &setPosition);
    emscripten::function("setRotation", &setRotation);
    emscripten::function("setScale", &setScale);
    emscripten::function("setBaseColor", &setBaseColor);
    emscripten::function("setMetallic", &setMetallic);
    emscripten::function("setRoughness", &setRoughness);
    emscripten::function("setLayerVisible", &setLayerVisible);
    emscripten::function("getVertexCount", &getVertexCount);
    emscripten::function("getFaceCount", &getFaceCount);
    emscripten::function("getTriangleCount", &getTriangleCount);
    emscripten::function("exportScreenshot", &exportScreenshot);

    // Cloth simulation
    emscripten::function("addClothMesh", &addClothMesh);
    emscripten::function("toggleSimulation", &toggleSimulation);
    emscripten::function("resetCloth", &resetCloth);
    emscripten::function("setGravity", &setGravity);
    emscripten::function("setWindForce", &setWindForce);
    emscripten::function("setClothStiffness", &setClothStiffness);
    emscripten::function("setClothDamping", &setClothDamping);
    emscripten::function("setClothFriction", &setClothFriction);
    emscripten::function("setSelfCollision", &setSelfCollision);
    emscripten::function("setClothThickness", &setClothThickness);
    emscripten::function("setStretchCompliance", &setStretchCompliance);
    emscripten::function("setShearCompliance", &setShearCompliance);
    emscripten::function("setBendCompliance", &setBendCompliance);
    emscripten::function("setNumSubsteps", &setNumSubsteps);
    emscripten::function("getStretchCompliance", &getStretchCompliance);
    emscripten::function("getShearCompliance", &getShearCompliance);
    emscripten::function("getBendCompliance", &getBendCompliance);
    emscripten::function("getNumSubsteps", &getNumSubsteps);
    emscripten::function("isSimulationRunning", &isSimulationRunning);
    emscripten::function("setUseGpuSolver", &setUseGpuSolver);
    emscripten::function("getUseGpuSolver", &getUseGpuSolver);

    // Horizontal cloth
    emscripten::function("addClothMeshHorizontal", &addClothMeshHorizontal);

    // Mesh to cloth conversion
    emscripten::function("convertMeshToCloth", &convertMeshToCloth);
    emscripten::function("getLoadedMeshCount", &getLoadedMeshCount);
    emscripten::function("getLoadedMeshName", &getLoadedMeshName);

    // Per-mesh transforms
    emscripten::function("setMeshPosition", &setMeshPosition);
    emscripten::function("setMeshRotation", &setMeshRotation);
    emscripten::function("setMeshScale", &setMeshScale);
    emscripten::function("getMeshPositionX", &getMeshPositionX);
    emscripten::function("getMeshPositionY", &getMeshPositionY);
    emscripten::function("getMeshPositionZ", &getMeshPositionZ);
    emscripten::function("removeLoadedMesh", &removeLoadedMesh);
    emscripten::function("setMeshVisible", &setMeshVisible);

    // Light control
    emscripten::function("setLightPosition", &setLightPosition);
    emscripten::function("setLightColor", &setLightColor);
    emscripten::function("setLightIntensity", &setLightIntensity);
    emscripten::function("setAmbientTop", &setAmbientTop);
    emscripten::function("setAmbientBottom", &setAmbientBottom);
    emscripten::function("getLightPositionX", &getLightPositionX);
    emscripten::function("getLightPositionY", &getLightPositionY);
    emscripten::function("getLightPositionZ", &getLightPositionZ);

    // UV control
    emscripten::function("setUVOffset", &setUVOffset);
    emscripten::function("setUVTiling", &setUVTiling);

    // Rendering modes
    emscripten::function("setWireframeMode", &setWireframeMode);
    emscripten::function("loadDiffuseTexture", &loadDiffuseTexture);
    emscripten::function("clearDiffuseTexture", &clearDiffuseTexture);

    // Collision spheres
    emscripten::function("addCollisionSphere", &addCollisionSphere);
    emscripten::function("removeCollisionSphere", &removeCollisionSphere);
    emscripten::function("getCollisionSphereCount", &getCollisionSphereCount);

    // Object selection and manipulation
    emscripten::function("pickObject", &pickObject);
    emscripten::function("setCollisionSpherePosition", &setCollisionSpherePosition);
    emscripten::function("translateCloth", &translateCloth);
    emscripten::function("setSelectedSphere", &setSelectedSphere);
    emscripten::function("getCollisionSphereX", &getCollisionSphereX);
    emscripten::function("getCollisionSphereY", &getCollisionSphereY);
    emscripten::function("getCollisionSphereZ", &getCollisionSphereZ);

    // GPU diagnostics
    emscripten::function("getGpuBufferCount", &getGpuBufferCount);
    emscripten::function("getGpuTextureCount", &getGpuTextureCount);
    emscripten::function("getEstimatedVram", &getEstimatedVram);
    emscripten::function("getDrawCallCount", &getDrawCallCount);
    emscripten::function("getFrameTimeMs", &getFrameTimeMs);
    emscripten::function("getGpuErrorCount", &getGpuErrorCount);
}
