#include <emscripten.h>
#include <emscripten/bind.h>
#include <emscripten/html5.h>
#include <string>
#include <cstring>
#include <vector>

#include "renderer/Renderer.h"

// Global renderer instance
static Renderer g_rendererInstance;

// --- Exported Functions ---

bool initRenderer(const std::string& canvasId) {
    return g_rendererInstance.init(canvasId);
}

void resizeViewport(int w, int h) {
    g_rendererInstance.resize(w, h);
}

void destroyRenderer() {
    g_rendererInstance.destroy();
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

void setCameraPreset(int preset) {
    g_rendererInstance.getCamera().setPreset(static_cast<Camera::CameraPreset>(preset));
}

// Rink
void setRinkLayout(int layout) {
    g_rendererInstance.setRinkLayout(layout);
}

// Drill tokens
int addDrillToken(int type, float x, float z, float r, float g, float b) {
    return g_rendererInstance.addDrillToken(type, x, z, r, g, b);
}

void setTokenPosition(int idx, float x, float z) {
    g_rendererInstance.setTokenPosition(idx, x, z);
}

void setTokenColor(int idx, float r, float g, float b) {
    g_rendererInstance.setTokenColor(idx, r, g, b);
}

void removeToken(int idx) {
    g_rendererInstance.removeToken(idx);
}

void clearAllTokens() {
    g_rendererInstance.clearAllTokens();
}

// Paths (via pointer to Float32Array data)
void setDrillPaths(uintptr_t ptr, int floatCount) {
    const float* data = reinterpret_cast<const float*>(ptr);
    g_rendererInstance.setDrillPaths(data, floatCount);
}

void clearDrillPaths() {
    g_rendererInstance.clearDrillPaths();
}

// Animation
void setAnimationData(uintptr_t ptr, int count) {
    const float* data = reinterpret_cast<const float*>(ptr);
    g_rendererInstance.setAnimationData(data, count);
}

void setPlaybackTime(float t) {
    g_rendererInstance.setPlaybackTime(t);
}

void clearAnimation() {
    g_rendererInstance.clearAnimation();
}

// Screenshot
std::string exportScreenshot() {
    return g_rendererInstance.exportScreenshot();
}

// Wireframe mode
void setWireframeMode(bool enabled) {
    g_rendererInstance.setWireframeMode(enabled);
}

// Frame time
float getFrameTimeMs() {
    return g_rendererInstance.getFrameTimeMs();
}

// Material controls (for token colors)
void setBaseColor(float r, float g, float b) {
    g_rendererInstance.getScene().getMaterial().setBaseColor(r, g, b);
}

void setMetallic(float v) {
    g_rendererInstance.getScene().getMaterial().setMetallic(v);
}

void setRoughness(float v) {
    g_rendererInstance.getScene().getMaterial().setRoughness(v);
}

// Light control
void setLightPosition(float x, float y, float z) { g_rendererInstance.setLightPosition(x, y, z); }
void setLightColor(float r, float g, float b) { g_rendererInstance.setLightColor(r, g, b); }
void setLightIntensity(float v) { g_rendererInstance.setLightIntensity(v); }
void setAmbientTop(float r, float g, float b) { g_rendererInstance.setAmbientTop(r, g, b); }
void setAmbientBottom(float r, float g, float b) { g_rendererInstance.setAmbientBottom(r, g, b); }

// --- Embind Bindings ---

EMSCRIPTEN_BINDINGS(renderer_module) {
    emscripten::function("initRenderer", &initRenderer);
    emscripten::function("resizeViewport", &resizeViewport);
    emscripten::function("destroyRenderer", &destroyRenderer);

    // Camera
    emscripten::function("cameraRotate", &cameraRotate);
    emscripten::function("cameraZoom", &cameraZoom);
    emscripten::function("cameraPan", &cameraPan);
    emscripten::function("cameraResetView", &cameraResetView);
    emscripten::function("setCameraPreset", &setCameraPreset);

    // Rink
    emscripten::function("setRinkLayout", &setRinkLayout);

    // Tokens
    emscripten::function("addDrillToken", &addDrillToken);
    emscripten::function("setTokenPosition", &setTokenPosition);
    emscripten::function("setTokenColor", &setTokenColor);
    emscripten::function("removeToken", &removeToken);
    emscripten::function("clearAllTokens", &clearAllTokens);

    // Paths
    emscripten::function("setDrillPaths", &setDrillPaths);
    emscripten::function("clearDrillPaths", &clearDrillPaths);

    // Animation
    emscripten::function("setAnimationData", &setAnimationData);
    emscripten::function("setPlaybackTime", &setPlaybackTime);
    emscripten::function("clearAnimation", &clearAnimation);

    // Misc
    emscripten::function("exportScreenshot", &exportScreenshot);
    emscripten::function("setWireframeMode", &setWireframeMode);
    emscripten::function("getFrameTimeMs", &getFrameTimeMs);

    // Material
    emscripten::function("setBaseColor", &setBaseColor);
    emscripten::function("setMetallic", &setMetallic);
    emscripten::function("setRoughness", &setRoughness);

    // Lighting
    emscripten::function("setLightPosition", &setLightPosition);
    emscripten::function("setLightColor", &setLightColor);
    emscripten::function("setLightIntensity", &setLightIntensity);
    emscripten::function("setAmbientTop", &setAmbientTop);
    emscripten::function("setAmbientBottom", &setAmbientBottom);
}
