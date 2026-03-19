#pragma once

#include <string>
#include <memory>
#include <vector>
#include "renderer/Shader.h"
#include "scene/Scene.h"
#include "scene/Camera.h"
#include "scene/Grid.h"
#include "simulation/ClothSimulation.h"
#include "simulation/CollisionBody.h"

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
    void convertMeshToCloth(int meshIndex, int pinMode);
    bool isSimulationRunning() const { return clothSim_.isRunning(); }
    ClothSimulation& getClothSim() { return clothSim_; }

    // Collision spheres
    void addCollisionSphere(float x, float y, float z, float radius);
    void removeCollisionSphere(int index);
    int getCollisionSphereCount() const { return static_cast<int>(collisionSpheres_.size()); }

    // Object selection and manipulation
    int pickSphere(float ox, float oy, float oz, float dx, float dy, float dz) const;
    bool pickCloth(float ox, float oy, float oz, float dx, float dy, float dz, float& t) const;
    void setCollisionSpherePosition(int index, float x, float y, float z);
    void translateCloth(float dx, float dy, float dz);
    void setSelectedSphere(int index) { selectedSphereIndex_ = index; }
    int getSelectedSphere() const { return selectedSphereIndex_; }
    float getCollisionSphereX(int index) const;
    float getCollisionSphereY(int index) const;
    float getCollisionSphereZ(int index) const;

    // Rendering modes
    void setWireframeMode(bool enabled) { wireframeMode_ = enabled; }
    bool getWireframeMode() const { return wireframeMode_; }

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

private:
    bool initShaders();
    void initSphereWireframe();
    void initShadowMap();
    void renderShadowPass();
    void renderCollisionSpheres(const glm::mat4& view, const glm::mat4& proj);
    void syncCollidersToSim();

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

    // Cloth simulation
    ClothSimulation clothSim_;
    Mesh* clothMesh_;

    // Collision sphere visualization
    std::vector<CollisionBody> collisionSpheres_;
    GLuint sphereVao_;
    GLuint sphereVbo_;
    int sphereVertexCount_;
    int selectedSphereIndex_;

    // Shadow mapping
    GLuint shadowFBO_;
    GLuint shadowDepthTexture_;
    int shadowMapSize_;
    glm::mat4 lightSpaceMatrix_;

    // Wireframe mode
    bool wireframeMode_;

    // Diffuse texture
    GLuint diffuseTexture_;
    bool hasTexture_;

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
