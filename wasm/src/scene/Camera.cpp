#include "scene/Camera.h"
#include <glm/gtc/matrix_transform.hpp>
#include <glm/gtc/matrix_inverse.hpp>
#include <cmath>

static const float PI = 3.14159265359f;

Camera::Camera() {
    fov_ = 45.0f;
    nearPlane_ = 0.1f;
    farPlane_ = 500.0f;
    // Default to top-down view
    setPreset(TOP_DOWN);
}

void Camera::resetView() {
    setPreset(TOP_DOWN);
}

void Camera::setPreset(CameraPreset preset) {
    target_ = glm::vec3(0.0f, 0.0f, 0.0f);

    switch (preset) {
        case TOP_DOWN:
            theta_ = 0.0f;
            phi_ = PHI_MIN;  // nearly straight down
            distance_ = 140.0f;
            break;
        case BROADCAST:
            theta_ = 0.0f;
            phi_ = 0.5f;  // ~30 degrees elevation
            distance_ = 120.0f;
            break;
        case END_ZONE:
            theta_ = PI / 2.0f;
            phi_ = 0.4f;
            distance_ = 80.0f;
            break;
        case FREE:
        default:
            theta_ = 0.785f;
            phi_ = 1.1f;
            distance_ = 100.0f;
            break;
    }
}

glm::vec3 Camera::getPosition() const {
    float x = target_.x + distance_ * sinf(phi_) * sinf(theta_);
    float y = target_.y + distance_ * cosf(phi_);
    float z = target_.z + distance_ * sinf(phi_) * cosf(theta_);
    return glm::vec3(x, y, z);
}

glm::mat4 Camera::getViewMatrix() const {
    return glm::lookAt(getPosition(), target_, glm::vec3(0.0f, 1.0f, 0.0f));
}

glm::mat4 Camera::getProjectionMatrix(float aspect) const {
    return glm::perspective(glm::radians(fov_), aspect, nearPlane_, farPlane_);
}

void Camera::rotate(float dx, float dy) {
    theta_ += dx * 0.01f;
    phi_ -= dy * 0.01f;

    if (phi_ < PHI_MIN) phi_ = PHI_MIN;
    if (phi_ > PHI_MAX) phi_ = PHI_MAX;
}

void Camera::zoom(float delta) {
    distance_ -= delta * 2.0f;
    if (distance_ < MIN_DISTANCE) distance_ = MIN_DISTANCE;
    if (distance_ > MAX_DISTANCE) distance_ = MAX_DISTANCE;
}

void Camera::screenToRay(float ndcX, float ndcY, float aspect, glm::vec3& origin, glm::vec3& dir) const {
    glm::mat4 view = getViewMatrix();
    glm::mat4 proj = getProjectionMatrix(aspect);
    glm::mat4 invVP = glm::inverse(proj * view);

    glm::vec4 nearPt = invVP * glm::vec4(ndcX, ndcY, -1.0f, 1.0f);
    glm::vec4 farPt  = invVP * glm::vec4(ndcX, ndcY,  1.0f, 1.0f);

    nearPt /= nearPt.w;
    farPt  /= farPt.w;

    origin = glm::vec3(nearPt);
    dir = glm::normalize(glm::vec3(farPt) - glm::vec3(nearPt));
}

void Camera::pan(float dx, float dy) {
    glm::vec3 forward = glm::normalize(target_ - getPosition());
    glm::vec3 right = glm::normalize(glm::cross(forward, glm::vec3(0.0f, 1.0f, 0.0f)));
    glm::vec3 up = glm::normalize(glm::cross(right, forward));

    float panSpeed = distance_ * 0.002f;
    target_ += right * (-dx * panSpeed) + up * (dy * panSpeed);
}
