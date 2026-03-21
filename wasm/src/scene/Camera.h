#pragma once

#include <glm/glm.hpp>

class Camera {
public:
    enum CameraPreset { TOP_DOWN = 0, BROADCAST = 1, END_ZONE = 2, FREE = 3 };

    Camera();

    glm::mat4 getViewMatrix() const;
    glm::mat4 getProjectionMatrix(float aspect) const;
    glm::vec3 getPosition() const;

    void rotate(float dx, float dy);
    void zoom(float delta);
    void pan(float dx, float dy);
    void resetView();
    void setPreset(CameraPreset preset);
    void screenToRay(float ndcX, float ndcY, float aspect, glm::vec3& origin, glm::vec3& dir) const;

private:
    float theta_;     // azimuth angle (radians)
    float phi_;       // elevation angle (radians)
    float distance_;  // distance from target
    glm::vec3 target_;

    float fov_;
    float nearPlane_;
    float farPlane_;

    static constexpr float MIN_DISTANCE = 0.5f;
    static constexpr float MAX_DISTANCE = 300.0f;
    static constexpr float PHI_MIN = 0.01f;
    static constexpr float PHI_MAX = 3.04f;
};
