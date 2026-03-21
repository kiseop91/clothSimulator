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
    return EM_TRUE;
}

Renderer::Renderer()
    : width_(800), height_(600)
    , contextHandle_(0)
    , initialized_(false)
    , shadowFBO_(0), shadowDepthTexture_(0), shadowMapSize_(2048)
    , wireframeMode_(false)
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
    attrs.preserveDrawingBuffer = true;
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

    if (!initShaders()) {
        emscripten_log(EM_LOG_ERROR, "Failed to compile shaders");
        return false;
    }

    // Init ice rink
    rink_.init();

    // Init path renderer
    pathRenderer_.init();

    // Init shadow map
    initShadowMap();

    initialized_ = true;

    // Start render loop
    setGlobalRenderer(this);
    emscripten_request_animation_frame_loop(animFrameCallback, this);

    // Set camera to top-down by default
    camera_.setPreset(Camera::TOP_DOWN);

    emscripten_log(EM_LOG_CONSOLE, "Hockey Drill Studio renderer initialized");
    return true;
}

bool Renderer::initShaders() {
    if (!pbrShader_.compile(ShaderSources::pbrVertexShader, ShaderSources::pbrFragmentShader)) {
        return false;
    }
    if (!wireShader_.compile(ShaderSources::wireVertexShader, ShaderSources::wireFragmentShader)) {
        return false;
    }
    if (!shadowShader_.compile(ShaderSources::shadowVertexShader, ShaderSources::shadowFragmentShader)) {
        emscripten_log(EM_LOG_WARN, "Shadow shader compile failed, shadows disabled");
    }
    return true;
}

void Renderer::initShadowMap() {
    glGenFramebuffers(1, &shadowFBO_);
    glGenTextures(1, &shadowDepthTexture_);

    glBindTexture(GL_TEXTURE_2D, shadowDepthTexture_);
    glTexImage2D(GL_TEXTURE_2D, 0, GL_DEPTH_COMPONENT16, shadowMapSize_, shadowMapSize_,
                 0, GL_DEPTH_COMPONENT, GL_UNSIGNED_SHORT, nullptr);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MIN_FILTER, GL_NEAREST);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_MAG_FILTER, GL_NEAREST);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_S, GL_CLAMP_TO_EDGE);
    glTexParameteri(GL_TEXTURE_2D, GL_TEXTURE_WRAP_T, GL_CLAMP_TO_EDGE);

    glBindFramebuffer(GL_FRAMEBUFFER, shadowFBO_);
    glFramebufferTexture2D(GL_FRAMEBUFFER, GL_DEPTH_ATTACHMENT, GL_TEXTURE_2D, shadowDepthTexture_, 0);

    GLenum drawBuffers = GL_NONE;
    glDrawBuffers(1, &drawBuffers);
    glReadBuffer(GL_NONE);

    glBindFramebuffer(GL_FRAMEBUFFER, 0);
    glBindTexture(GL_TEXTURE_2D, 0);
}

void Renderer::renderShadowPass() {
    if (!shadowShader_.getProgram()) return;

    // Light from above - covers the full rink
    glm::mat4 lightView = glm::lookAt(lightPos_, glm::vec3(0.0f), glm::vec3(0.0f, 0.0f, -1.0f));
    glm::mat4 lightProj = glm::ortho(-110.0f, 110.0f, -50.0f, 50.0f, 0.1f, 250.0f);
    lightSpaceMatrix_ = lightProj * lightView;

    glBindFramebuffer(GL_FRAMEBUFFER, shadowFBO_);
    glViewport(0, 0, shadowMapSize_, shadowMapSize_);
    glClear(GL_DEPTH_BUFFER_BIT);

    shadowShader_.use();
    shadowShader_.setMat4("u_lightSpaceMatrix", lightSpaceMatrix_);

    // Render scene meshes (tokens) to shadow map
    const auto& meshes = scene_.getMeshes();
    for (auto* mesh : meshes) {
        if (!mesh->isVisible()) continue;
        shadowShader_.setMat4("u_model", mesh->getModelMatrix());
        mesh->render();
    }

    glBindFramebuffer(GL_FRAMEBUFFER, 0);
    glViewport(0, 0, width_, height_);
}

void Renderer::stepAndRender(double time) {
    if (!initialized_) return;

    // Frame timing
    if (lastFrameTime_ > 0.0) {
        frameTimeMs_ = static_cast<float>(time - lastFrameTime_);
    }
    lastFrameTime_ = time;

    // Update animation
    animator_.update(scene_);

    renderFrame();
}

void Renderer::renderFrame() {
    if (!initialized_) return;

    // Shadow pass
    renderShadowPass();

    // Main pass
    glClearColor(0.15f, 0.18f, 0.22f, 1.0f);
    glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);

    float aspect = (height_ > 0) ? static_cast<float>(width_) / static_cast<float>(height_) : 1.0f;
    glm::mat4 view = camera_.getViewMatrix();
    glm::mat4 proj = camera_.getProjectionMatrix(aspect);

    // Render ice rink (opaque, with depth)
    rink_.render(view, proj);

    // Render drill tokens (PBR meshes)
    const auto& meshes = scene_.getMeshes();
    if (!meshes.empty()) {
        pbrShader_.use();
        pbrShader_.setMat4("u_view", view);
        pbrShader_.setMat4("u_projection", proj);

        glm::vec3 camPos = camera_.getPosition();
        pbrShader_.setVec3("u_camPos", camPos);
        pbrShader_.setVec3("u_lightPos", lightPos_);
        pbrShader_.setVec3("u_lightColor", lightColor_ * lightIntensity_);

        // Shadow
        pbrShader_.setMat4("u_lightSpaceMatrix", lightSpaceMatrix_);
        bool shadowEnabled = (shadowDepthTexture_ != 0 && shadowShader_.getProgram() != 0);
        pbrShader_.setInt("u_shadowEnabled", shadowEnabled ? 1 : 0);
        if (shadowEnabled) {
            glActiveTexture(GL_TEXTURE0);
            glBindTexture(GL_TEXTURE_2D, shadowDepthTexture_);
            pbrShader_.setInt("u_shadowMap", 0);
        }

        pbrShader_.setInt("u_hasTexture", 0);

        // Hemisphere ambient
        pbrShader_.setVec3("u_ambientTop", ambientTop_);
        pbrShader_.setVec3("u_ambientBottom", ambientBottom_);

        // UV defaults
        pbrShader_.setFloat("u_uvOffsetU", 0.0f);
        pbrShader_.setFloat("u_uvOffsetV", 0.0f);
        pbrShader_.setFloat("u_uvTilingU", 1.0f);
        pbrShader_.setFloat("u_uvTilingV", 1.0f);

        scene_.getMaterial().apply(pbrShader_);

        for (auto* mesh : meshes) {
            if (!mesh->isVisible()) continue;
            pbrShader_.setMat4("u_model", mesh->getModelMatrix());
            mesh->render();
        }
    }

    // Render paths (GL_LINES, on top of ice)
    glDepthMask(GL_FALSE);
    pathRenderer_.render(view, proj);
    glDepthMask(GL_TRUE);
}

// --- Rink ---

void Renderer::setRinkLayout(int layout) {
    rink_.setLayout(static_cast<IceRink::Layout>(layout));
}

// --- Drill Tokens ---

int Renderer::addDrillToken(int type, float x, float z, float r, float g, float b) {
    MeshData meshData = DrillToken::generate(static_cast<DrillToken::Type>(type), glm::vec3(r, g, b));

    Mesh* mesh = new Mesh();
    mesh->init(meshData);
    // Raise tokens above ice surface (Y=0) to prevent z-fighting
    float tokenY = 0.15f;
    mesh->setMeshPosition(x, tokenY, z);
    mesh->setName("token_" + std::to_string(scene_.getMeshes().size()));

    // Set material color
    scene_.getMaterial().setBaseColor(r, g, b);

    scene_.addMesh(mesh);
    return static_cast<int>(scene_.getMeshes().size()) - 1;
}

void Renderer::setTokenPosition(int idx, float x, float z) {
    auto& meshes = scene_.getMeshes();
    if (idx >= 0 && idx < static_cast<int>(meshes.size())) {
        glm::vec3 pos = meshes[idx]->getMeshPosition();
        meshes[idx]->setMeshPosition(x, pos.y, z);
    }
}

void Renderer::setTokenColor(int idx, float r, float g, float b) {
    // Color is applied via material when rendering
    // For per-token colors, we'd need per-mesh materials.
    // For now, we'll handle it at the shader level through the material.
    (void)idx; (void)r; (void)g; (void)b;
}

void Renderer::removeToken(int idx) {
    scene_.removeMesh(idx);
}

void Renderer::clearAllTokens() {
    scene_.clearScene();
}

// --- Paths ---

void Renderer::setDrillPaths(const float* data, int floatCount) {
    pathRenderer_.setPaths(data, floatCount);
}

void Renderer::clearDrillPaths() {
    pathRenderer_.clear();
}

// --- Animation ---

void Renderer::setAnimationData(const float* data, int count) {
    animator_.setAnimations(data, count);
}

void Renderer::setPlaybackTime(float t) {
    animator_.setTime(t);
}

void Renderer::clearAnimation() {
    animator_.clear();
}

// --- Resize / Destroy / Screenshot ---

void Renderer::resize(int width, int height) {
    width_ = width;
    height_ = height;
    if (initialized_) {
        glViewport(0, 0, width_, height_);
    }
}

void Renderer::destroy() {
    if (!initialized_) return;

    // Clean up shadow map
    if (shadowDepthTexture_) { glDeleteTextures(1, &shadowDepthTexture_); shadowDepthTexture_ = 0; }
    if (shadowFBO_) { glDeleteFramebuffers(1, &shadowFBO_); shadowFBO_ = 0; }

    scene_.clearScene();
    rink_.destroy();
    pathRenderer_.destroy();
    grid_.destroy();
    pbrShader_.destroy();
    wireShader_.destroy();
    shadowShader_.destroy();

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

    std::vector<uint8_t> pixels(width_ * height_ * 4);
    glReadPixels(0, 0, width_, height_, GL_RGBA, GL_UNSIGNED_BYTE, pixels.data());

    // Flip vertically
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
