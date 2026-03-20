#include "scene/Camera.h"
#include <glm/gtc/matrix_transform.hpp>
#include <glm/gtc/matrix_inverse.hpp>
#include <cmath>

Camera::Camera() {
    resetView();
    fov_ = 45.0f;
    nearPlane_ = 0.1f;
    farPlane_ = 200.0f;
}

void Camera::resetView() {
    theta_ = 0.785f;    // ~45 degrees azimuth
    phi_ = 1.1f;        // ~63 degrees elevation
    distance_ = 5.0f;
    target_ = glm::vec3(0.0f, 0.5f, 0.0f);
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

    // Clamp phi to avoid flipping
    if (phi_ < PHI_MIN) phi_ = PHI_MIN;
    if (phi_ > PHI_MAX) phi_ = PHI_MAX;
}

void Camera::zoom(float delta) {
    distance_ -= delta * 0.5f;
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
    // Compute camera-local right and up vectors
    glm::vec3 forward = glm::normalize(target_ - getPosition());
    glm::vec3 right = glm::normalize(glm::cross(forward, glm::vec3(0.0f, 1.0f, 0.0f)));
    glm::vec3 up = glm::normalize(glm::cross(right, forward));

    float panSpeed = distance_ * 0.25f;
    target_ += right * (-dx * panSpeed) + up * (dy * panSpeed);
}
