#include "renderer/Renderer.h"
#include "renderer/ShaderSources.h"

#include <GLES3/gl3.h>
#include <emscripten.h>
#include <emscripten/html5.h>
#include <glm/gtc/matrix_transform.hpp>
#include <glm/gtc/type_ptr.hpp>
#include <vector>
#include <string>
#include <cstdlib>
#include <cmath>

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
static EM_BOOL animFrameCallback(double time, void* userData) {
    Renderer* renderer = static_cast<Renderer*>(userData);
    if (renderer) {
        renderer->stepAndRender(time);
    }
    return EM_TRUE; // Keep looping
}

Renderer::Renderer()
    : width_(800), height_(600)
    , contextHandle_(0)
    , initialized_(false)
    , clothMesh_(nullptr)
    , sphereVao_(0), sphereVbo_(0), sphereVertexCount_(0), selectedSphereIndex_(-1)
{
}

Renderer::~Renderer() {
    destroy();
}

bool Renderer::init(const std::string& canvasId) {
    EmscriptenWebGLContextAttributes attrs;
    emscripten_webgl_init_context_attributes(&attrs);
    attrs.majorVersion = 2;
    attrs.minorVersion = 0;
    attrs.alpha = false;
    attrs.depth = true;
    attrs.stencil = false;
    attrs.antialias = true;
    attrs.preserveDrawingBuffer = true; // Needed for screenshots
    attrs.powerPreference = EM_WEBGL_POWER_PREFERENCE_HIGH_PERFORMANCE;

    std::string selector = canvasId;
    if (!selector.empty() && selector[0] != '#') {
        selector = "#" + selector;
    }

    contextHandle_ = emscripten_webgl_create_context(selector.c_str(), &attrs);
    if (contextHandle_ <= 0) {
        emscripten_log(EM_LOG_ERROR, "Failed to create WebGL2 context on '%s'", selector.c_str());
        return false;
    }

    EMSCRIPTEN_RESULT res = emscripten_webgl_make_context_current(contextHandle_);
    if (res != EMSCRIPTEN_RESULT_SUCCESS) {
        emscripten_log(EM_LOG_ERROR, "Failed to make WebGL2 context current");
        return false;
    }

    emscripten_log(EM_LOG_CONSOLE, "WebGL2 context created successfully");

    // Initialize OpenGL state
    glEnable(GL_DEPTH_TEST);
    glDepthFunc(GL_LESS);
    glEnable(GL_CULL_FACE);
    glCullFace(GL_BACK);
    glViewport(0, 0, width_, height_);

    // Init shaders
    if (!initShaders()) {
        emscripten_log(EM_LOG_ERROR, "Failed to compile shaders");
        return false;
    }

    // Init grid
    grid_.init();

    // Init sphere wireframe mesh
    initSphereWireframe();

    initialized_ = true;

    // Start render loop
    setGlobalRenderer(this);
    emscripten_request_animation_frame_loop(animFrameCallback, this);

    emscripten_log(EM_LOG_CONSOLE, "Renderer initialized");
    return true;
}

bool Renderer::initShaders() {
    if (!pbrShader_.compile(ShaderSources::pbrVertexShader, ShaderSources::pbrFragmentShader)) {
        return false;
    }
    if (!wireShader_.compile(ShaderSources::wireVertexShader, ShaderSources::wireFragmentShader)) {
        return false;
    }
    return true;
}

void Renderer::initSphereWireframe() {
    // Generate unit sphere wireframe (latitude/longitude lines)
    const int stacks = 12;
    const int slices = 16;
    const float PI = 3.14159265359f;

    std::vector<float> vertices;

    // Latitude lines (horizontal circles)
    for (int i = 1; i < stacks; i++) {
        float phi = PI * static_cast<float>(i) / static_cast<float>(stacks);
        float y = std::cos(phi);
        float r = std::sin(phi);

        for (int j = 0; j < slices; j++) {
            float theta1 = 2.0f * PI * static_cast<float>(j) / static_cast<float>(slices);
            float theta2 = 2.0f * PI * static_cast<float>(j + 1) / static_cast<float>(slices);

            vertices.push_back(r * std::cos(theta1));
            vertices.push_back(y);
            vertices.push_back(r * std::sin(theta1));

            vertices.push_back(r * std::cos(theta2));
            vertices.push_back(y);
            vertices.push_back(r * std::sin(theta2));
        }
    }

    // Longitude lines (vertical arcs)
    for (int j = 0; j < slices; j++) {
        float theta = 2.0f * PI * static_cast<float>(j) / static_cast<float>(slices);

        for (int i = 0; i < stacks; i++) {
            float phi1 = PI * static_cast<float>(i) / static_cast<float>(stacks);
            float phi2 = PI * static_cast<float>(i + 1) / static_cast<float>(stacks);

            vertices.push_back(std::sin(phi1) * std::cos(theta));
            vertices.push_back(std::cos(phi1));
            vertices.push_back(std::sin(phi1) * std::sin(theta));

            vertices.push_back(std::sin(phi2) * std::cos(theta));
            vertices.push_back(std::cos(phi2));
            vertices.push_back(std::sin(phi2) * std::sin(theta));
        }
    }

    sphereVertexCount_ = static_cast<int>(vertices.size() / 3);

    glGenVertexArrays(1, &sphereVao_);
    glGenBuffers(1, &sphereVbo_);

    glBindVertexArray(sphereVao_);
    glBindBuffer(GL_ARRAY_BUFFER, sphereVbo_);
    glBufferData(GL_ARRAY_BUFFER, vertices.size() * sizeof(float), vertices.data(), GL_STATIC_DRAW);

    glEnableVertexAttribArray(0);
    glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, 3 * sizeof(float), (void*)0);

    glBindVertexArray(0);
}

void Renderer::renderCollisionSpheres(const glm::mat4& view, const glm::mat4& proj) {
    if (collisionSpheres_.empty() || sphereVertexCount_ == 0) return;

    wireShader_.use();
    wireShader_.setMat4("u_view", view);
    wireShader_.setMat4("u_projection", proj);
    // Cyan with 50% alpha
    GLint colorLoc = glGetUniformLocation(wireShader_.getProgram(), "u_color");
    glUniform4f(colorLoc, 0.3f, 0.8f, 1.0f, 0.5f);

    glEnable(GL_BLEND);
    glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);
    glDepthMask(GL_FALSE);

    glBindVertexArray(sphereVao_);

    for (int i = 0; i < static_cast<int>(collisionSpheres_.size()); i++) {
        const auto& sphere = collisionSpheres_[i];
        glm::mat4 model = glm::translate(glm::mat4(1.0f), sphere.center);
        model = glm::scale(model, glm::vec3(sphere.radius));
        wireShader_.setMat4("u_model", model);

        // Highlight selected sphere in yellow
        if (i == selectedSphereIndex_) {
            glUniform4f(colorLoc, 1.0f, 0.9f, 0.2f, 0.8f);
        } else {
            glUniform4f(colorLoc, 0.3f, 0.8f, 1.0f, 0.5f);
        }

        glDrawArrays(GL_LINES, 0, sphereVertexCount_);
    }

    glBindVertexArray(0);
    glDepthMask(GL_TRUE);
    glDisable(GL_BLEND);
}

void Renderer::syncCollidersToSim() {
    clothSim_.clearColliders();

    // Add manually placed collision spheres
    for (const auto& sphere : collisionSpheres_) {
        clothSim_.addCollider(sphere);
    }

    // Add bounding spheres from loaded meshes
    const auto& meshDataCache = scene_.getMeshDataCache();
    for (const auto& meshData : meshDataCache) {
        if (meshData.vertices.empty()) continue;

        glm::vec3 center(0.0f);
        for (const auto& v : meshData.vertices) {
            center += v.position;
        }
        center /= static_cast<float>(meshData.vertices.size());

        float maxDist = 0.0f;
        for (const auto& v : meshData.vertices) {
            float dist = glm::length(v.position - center);
            if (dist > maxDist) maxDist = dist;
        }

        clothSim_.addCollider(CollisionBody(center, maxDist + 0.05f));
    }
}

void Renderer::stepAndRender(double time) {
    if (!initialized_) return;

    // Step cloth simulation
    if (clothSim_.isInitialized() && clothSim_.isRunning()) {
        clothSim_.step(time);

        // Update cloth mesh VBO with new positions/normals
        if (clothMesh_) {
            const MeshData& meshData = clothSim_.generateMeshData();
            clothMesh_->updateVertices(meshData.vertices);
        }
    }

    renderFrame();
}

void Renderer::renderFrame() {
    if (!initialized_) return;

    // Dark blue-gray background
    glClearColor(0.11f, 0.11f, 0.18f, 1.0f);
    glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);

    float aspect = (height_ > 0) ? static_cast<float>(width_) / static_cast<float>(height_) : 1.0f;
    glm::mat4 view = camera_.getViewMatrix();
    glm::mat4 proj = camera_.getProjectionMatrix(aspect);

    // Render grid (disable depth write so it doesn't fight with model)
    glDepthMask(GL_FALSE);
    grid_.render(view, proj);
    glDepthMask(GL_TRUE);

    // Render scene meshes (per-mesh transform)
    const auto& meshes = scene_.getMeshes();
    if (!meshes.empty()) {
        pbrShader_.use();

        pbrShader_.setMat4("u_view", view);
        pbrShader_.setMat4("u_projection", proj);

        // Camera and light
        glm::vec3 camPos = camera_.getPosition();
        pbrShader_.setVec3("u_camPos", camPos);
        pbrShader_.setVec3("u_lightPos", glm::vec3(5.0f, 8.0f, 5.0f));
        pbrShader_.setVec3("u_lightColor", glm::vec3(300.0f, 300.0f, 300.0f));

        // Material
        scene_.getMaterial().apply(pbrShader_);

        for (auto* mesh : meshes) {
            if (!mesh->isVisible()) continue;
            glm::mat4 model = mesh->getModelMatrix();
            pbrShader_.setMat4("u_model", model);
            mesh->render();
        }
    }

    // Render cloth mesh (double-sided)
    if (clothMesh_ && clothMesh_->isVisible()) {
        pbrShader_.use();

        // Cloth is in world space, use identity model matrix
        pbrShader_.setMat4("u_model", glm::mat4(1.0f));
        pbrShader_.setMat4("u_view", view);
        pbrShader_.setMat4("u_projection", proj);

        glm::vec3 camPos = camera_.getPosition();
        pbrShader_.setVec3("u_camPos", camPos);
        pbrShader_.setVec3("u_lightPos", glm::vec3(5.0f, 8.0f, 5.0f));
        pbrShader_.setVec3("u_lightColor", glm::vec3(300.0f, 300.0f, 300.0f));

        scene_.getMaterial().apply(pbrShader_);

        // Disable backface culling for cloth (it can fold)
        glDisable(GL_CULL_FACE);
        clothMesh_->render();
        glEnable(GL_CULL_FACE);
    }

    // Render collision sphere wireframes
    renderCollisionSpheres(view, proj);
}

void Renderer::addClothMesh(float width, float height, int resX, int resY) {
    // Clean up existing cloth
    if (clothMesh_) {
        clothMesh_->cleanup();
        delete clothMesh_;
        clothMesh_ = nullptr;
    }

    // Initialize simulation
    clothSim_.init(width, height, resX, resY);

    // Sync all colliders (manual spheres + mesh bounding spheres)
    syncCollidersToSim();

    // Create GPU mesh with dynamic VBO
    const MeshData& initialMesh = clothSim_.generateMeshData();
    clothMesh_ = new Mesh();
    clothMesh_->initDynamic(initialMesh);
    clothMesh_->setName("cloth");

    emscripten_log(EM_LOG_CONSOLE, "Cloth mesh created: %dx%d particles",
                   resX, resY);
}

void Renderer::toggleSimulation(bool running) {
    clothSim_.setRunning(running);
}

void Renderer::resetCloth() {
    clothSim_.reset();

    // Update mesh to initial state
    if (clothMesh_) {
        const MeshData& meshData = clothSim_.generateMeshData();
        clothMesh_->updateVertices(meshData.vertices);
    }
}

void Renderer::addCollisionSphere(float x, float y, float z, float radius) {
    collisionSpheres_.emplace_back(glm::vec3(x, y, z), radius);
    syncCollidersToSim();
    emscripten_log(EM_LOG_CONSOLE, "Collision sphere added at (%.2f, %.2f, %.2f) r=%.2f", x, y, z, radius);
}

void Renderer::removeCollisionSphere(int index) {
    if (index < 0 || index >= static_cast<int>(collisionSpheres_.size())) return;
    collisionSpheres_.erase(collisionSpheres_.begin() + index);
    syncCollidersToSim();
    emscripten_log(EM_LOG_CONSOLE, "Collision sphere %d removed", index);
}

void Renderer::addClothMeshHorizontal(float width, float depth, int resX, int resZ, float dropHeight) {
    if (clothMesh_) {
        clothMesh_->cleanup();
        delete clothMesh_;
        clothMesh_ = nullptr;
    }

    clothSim_.initHorizontal(width, depth, resX, resZ, dropHeight);
    syncCollidersToSim();

    const MeshData& initialMesh = clothSim_.generateMeshData();
    clothMesh_ = new Mesh();
    clothMesh_->initDynamic(initialMesh);
    clothMesh_->setName("cloth");

    emscripten_log(EM_LOG_CONSOLE, "Horizontal cloth mesh created: %dx%d at height %.1f",
                   resX, resZ, dropHeight);
}

void Renderer::convertMeshToCloth(int meshIndex, int pinMode) {
    const auto& cache = scene_.getMeshDataCache();
    if (meshIndex < 0 || meshIndex >= static_cast<int>(cache.size())) return;

    // Clean up existing cloth
    if (clothMesh_) {
        clothMesh_->cleanup();
        delete clothMesh_;
        clothMesh_ = nullptr;
    }

    // Initialize cloth simulation from mesh data
    clothSim_.initFromMesh(cache[meshIndex], pinMode);
    syncCollidersToSim();

    // Create dynamic GPU mesh
    const MeshData& initial = clothSim_.generateMeshData();
    clothMesh_ = new Mesh();
    clothMesh_->initDynamic(initial);
    clothMesh_->setName("cloth");

    // Hide original mesh
    auto& meshes = scene_.getMeshes();
    if (meshIndex < static_cast<int>(meshes.size())) {
        meshes[meshIndex]->setVisible(false);
    }

    emscripten_log(EM_LOG_CONSOLE, "Mesh %d converted to cloth (%zu vertices, pinMode=%d)",
                   meshIndex, cache[meshIndex].vertices.size(), pinMode);
}

int Renderer::pickSphere(float ox, float oy, float oz, float dx, float dy, float dz) const {
    glm::vec3 origin(ox, oy, oz);
    glm::vec3 dir(dx, dy, dz);

    int closestIndex = -1;
    float closestT = 1e30f;

    for (int i = 0; i < static_cast<int>(collisionSpheres_.size()); i++) {
        const auto& s = collisionSpheres_[i];
        glm::vec3 oc = origin - s.center;
        float a = glm::dot(dir, dir);
        float b = 2.0f * glm::dot(oc, dir);
        float c = glm::dot(oc, oc) - s.radius * s.radius;
        float discriminant = b * b - 4.0f * a * c;

        if (discriminant >= 0.0f) {
            float t = (-b - std::sqrt(discriminant)) / (2.0f * a);
            if (t < 0.0f) t = (-b + std::sqrt(discriminant)) / (2.0f * a);
            if (t > 0.0f && t < closestT) {
                closestT = t;
                closestIndex = i;
            }
        }
    }

    return closestIndex;
}

bool Renderer::pickCloth(float ox, float oy, float oz, float dx, float dy, float dz, float& t) const {
    if (!clothSim_.isInitialized()) return false;

    glm::vec3 aabbMin, aabbMax;
    clothSim_.getAABB(aabbMin, aabbMax);

    // Expand AABB slightly for easier picking
    glm::vec3 padding(0.1f);
    aabbMin -= padding;
    aabbMax += padding;

    glm::vec3 origin(ox, oy, oz);
    glm::vec3 dir(dx, dy, dz);
    glm::vec3 invDir = 1.0f / dir;

    float t1 = (aabbMin.x - origin.x) * invDir.x;
    float t2 = (aabbMax.x - origin.x) * invDir.x;
    float t3 = (aabbMin.y - origin.y) * invDir.y;
    float t4 = (aabbMax.y - origin.y) * invDir.y;
    float t5 = (aabbMin.z - origin.z) * invDir.z;
    float t6 = (aabbMax.z - origin.z) * invDir.z;

    float tmin = std::max(std::max(std::min(t1, t2), std::min(t3, t4)), std::min(t5, t6));
    float tmax = std::min(std::min(std::max(t1, t2), std::max(t3, t4)), std::max(t5, t6));

    if (tmax < 0.0f || tmin > tmax) return false;

    t = (tmin > 0.0f) ? tmin : tmax;
    return true;
}

void Renderer::setCollisionSpherePosition(int index, float x, float y, float z) {
    if (index < 0 || index >= static_cast<int>(collisionSpheres_.size())) return;
    collisionSpheres_[index].center = glm::vec3(x, y, z);
    syncCollidersToSim();
}

void Renderer::translateCloth(float dx, float dy, float dz) {
    clothSim_.translateAll(dx, dy, dz);
    if (clothMesh_) {
        const MeshData& meshData = clothSim_.generateMeshData();
        clothMesh_->updateVertices(meshData.vertices);
    }
}

float Renderer::getCollisionSphereX(int index) const {
    if (index < 0 || index >= static_cast<int>(collisionSpheres_.size())) return 0.0f;
    return collisionSpheres_[index].center.x;
}

float Renderer::getCollisionSphereY(int index) const {
    if (index < 0 || index >= static_cast<int>(collisionSpheres_.size())) return 0.0f;
    return collisionSpheres_[index].center.y;
}

float Renderer::getCollisionSphereZ(int index) const {
    if (index < 0 || index >= static_cast<int>(collisionSpheres_.size())) return 0.0f;
    return collisionSpheres_[index].center.z;
}

void Renderer::resize(int width, int height) {
    width_ = width;
    height_ = height;
    if (initialized_) {
        glViewport(0, 0, width_, height_);
    }
}

void Renderer::destroy() {
    if (!initialized_) return;

    // Clean up cloth
    if (clothMesh_) {
        clothMesh_->cleanup();
        delete clothMesh_;
        clothMesh_ = nullptr;
    }

    // Clean up sphere wireframe
    if (sphereVbo_) { glDeleteBuffers(1, &sphereVbo_); sphereVbo_ = 0; }
    if (sphereVao_) { glDeleteVertexArrays(1, &sphereVao_); sphereVao_ = 0; }

    collisionSpheres_.clear();

    scene_.clearScene();
    grid_.destroy();
    pbrShader_.destroy();
    wireShader_.destroy();

    if (contextHandle_ > 0) {
        emscripten_webgl_destroy_context(contextHandle_);
        contextHandle_ = 0;
    }

    initialized_ = false;
    if (g_renderer == this) {
        g_renderer = nullptr;
    }

    emscripten_log(EM_LOG_CONSOLE, "Renderer destroyed");
}

std::string Renderer::exportScreenshot() {
    if (!initialized_) return "";

    // Read pixels
    std::vector<uint8_t> pixels(width_ * height_ * 4);
    glReadPixels(0, 0, width_, height_, GL_RGBA, GL_UNSIGNED_BYTE, pixels.data());

    // Flip vertically (OpenGL reads bottom-up)
    int rowSize = width_ * 4;
    std::vector<uint8_t> flipped(pixels.size());
    for (int y = 0; y < height_; y++) {
        int srcRow = (height_ - 1 - y) * rowSize;
        int dstRow = y * rowSize;
        std::memcpy(flipped.data() + dstRow, pixels.data() + srcRow, rowSize);
    }

    std::string header = std::to_string(width_) + "," + std::to_string(height_) + ",";
    return header + base64Encode(flipped);
}
