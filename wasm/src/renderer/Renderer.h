#pragma once

#include <string>
#include <memory>
#include <vector>
#include "renderer/Shader.h"
#include "scene/Scene.h"
#include "scene/Camera.h"
#include "scene/Grid.h"
#include "rink/IceRink.h"
#include "rink/DrillToken.h"
#include "rink/PathRenderer.h"
#include "animation/DrillAnimator.h"

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

    // Rink
    void setRinkLayout(int layout);

    // Drill tokens
    int addDrillToken(int type, float x, float z, float r, float g, float b);
    void setTokenPosition(int idx, float x, float z);
    void setTokenColor(int idx, float r, float g, float b);
    void removeToken(int idx);
    void clearAllTokens();

    // Paths
    void setDrillPaths(const float* data, int floatCount);
    void clearDrillPaths();

    // Animation
    void setAnimationData(const float* data, int count);
    void setPlaybackTime(float t);
    void clearAnimation();

    // Rendering modes
    void setWireframeMode(bool enabled) { wireframeMode_ = enabled; }
    bool getWireframeMode() const { return wireframeMode_; }

    // Light control
    void setLightPosition(float x, float y, float z) { lightPos_ = glm::vec3(x, y, z); }
    void setLightColor(float r, float g, float b) { lightColor_ = glm::vec3(r, g, b); }
    void setLightIntensity(float v) { lightIntensity_ = v; }
    void setAmbientTop(float r, float g, float b) { ambientTop_ = glm::vec3(r, g, b); }
    void setAmbientBottom(float r, float g, float b) { ambientBottom_ = glm::vec3(r, g, b); }
    const glm::vec3& getLightPos() const { return lightPos_; }

    // Frame time
    float getFrameTimeMs() const { return frameTimeMs_; }

private:
    bool initShaders();
    void initShadowMap();
    void renderShadowPass();

    int width_;
    int height_;
    int contextHandle_;
    bool initialized_;

    Shader pbrShader_;
    Shader wireShader_;
    Shader shadowShader_;
    Scene scene_;
    Camera camera_;
    Grid grid_;
    IceRink rink_;
    PathRenderer pathRenderer_;
    DrillAnimator animator_;

    // Shadow mapping
    GLuint shadowFBO_;
    GLuint shadowDepthTexture_;
    int shadowMapSize_;
    glm::mat4 lightSpaceMatrix_;

    // Wireframe mode
    bool wireframeMode_;

    // Light parameters
    glm::vec3 lightPos_ = glm::vec3(0.0f, 120.0f, 0.0f);
    glm::vec3 lightColor_ = glm::vec3(1.0f, 1.0f, 1.0f);
    float lightIntensity_ = 2.0f;
    glm::vec3 ambientTop_ = glm::vec3(0.5f, 0.55f, 0.6f);
    glm::vec3 ambientBottom_ = glm::vec3(0.3f, 0.3f, 0.35f);

    // Frame timing
    double lastFrameTime_ = 0.0;
    float frameTimeMs_ = 0.0f;
};

// Global instance for the animation frame callback
Renderer* getGlobalRenderer();
void setGlobalRenderer(Renderer* r);
