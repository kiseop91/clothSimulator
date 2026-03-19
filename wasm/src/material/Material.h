#pragma once

#include <glm/glm.hpp>

class Material {
public:
    Material();

    void setBaseColor(float r, float g, float b);
    void setMetallic(float v);
    void setRoughness(float v);

    glm::vec3 getBaseColor() const { return baseColor_; }
    float getMetallic() const { return metallic_; }
    float getRoughness() const { return roughness_; }

private:
    glm::vec3 baseColor_;
    float metallic_;
    float roughness_;
};
