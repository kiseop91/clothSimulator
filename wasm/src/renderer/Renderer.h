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

private:
    bool initShaders();
    void initSphereWireframe();
    void renderCollisionSpheres(const glm::mat4& view, const glm::mat4& proj);
    void syncCollidersToSim();

    int width_;
    int height_;
    int contextHandle_;
    bool initialized_;

    Shader pbrShader_;
    Shader wireShader_;
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
};

// Global instance for the animation frame callback
Renderer* getGlobalRenderer();
void setGlobalRenderer(Renderer* r);
