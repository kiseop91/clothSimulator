#include "scene/Scene.h"
#include <glm/gtc/matrix_transform.hpp>

Scene::Scene()
    : position_(0.0f)
    , rotation_(0.0f)
    , scale_(1.0f)
{
}

Scene::~Scene() {
    clearScene();
}

void Scene::addMesh(Mesh* mesh) {
    meshes_.push_back(mesh);
}

void Scene::removeMesh(int index) {
    if (index < 0 || index >= static_cast<int>(meshes_.size())) return;
    meshes_[index]->cleanup();
    delete meshes_[index];
    meshes_.erase(meshes_.begin() + index);
    if (index < static_cast<int>(meshDataCache_.size())) {
        meshDataCache_.erase(meshDataCache_.begin() + index);
    }
}

void Scene::clearScene() {
    for (auto* m : meshes_) {
        m->cleanup();
        delete m;
    }
    meshes_.clear();
    meshDataCache_.clear();
}

glm::mat4 Scene::getModelMatrix() const {
    glm::mat4 model(1.0f);
    model = glm::translate(model, position_);
    model = glm::rotate(model, glm::radians(rotation_.x), glm::vec3(1, 0, 0));
    model = glm::rotate(model, glm::radians(rotation_.y), glm::vec3(0, 1, 0));
    model = glm::rotate(model, glm::radians(rotation_.z), glm::vec3(0, 0, 1));
    model = glm::scale(model, scale_);
    return model;
}

void Scene::setPosition(float x, float y, float z) {
    position_ = glm::vec3(x, y, z);
}

void Scene::setRotation(float x, float y, float z) {
    rotation_ = glm::vec3(x, y, z);
}

void Scene::setScale(float x, float y, float z) {
    scale_ = glm::vec3(x, y, z);
}

int Scene::getVertexCount() const {
    int count = 0;
    for (const auto* m : meshes_) {
        count += m->getVertexCount();
    }
    return count;
}

int Scene::getFaceCount() const {
    // Faces = triangles for triangulated meshes
    return getTriangleCount();
}

int Scene::getTriangleCount() const {
    int count = 0;
    for (const auto* m : meshes_) {
        count += m->getIndexCount() / 3;
    }
    return count;
}
