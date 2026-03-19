#include "material/Material.h"

Material::Material()
    : baseColor_(0.7f, 0.7f, 0.7f)
    , metallic_(0.0f)
    , roughness_(0.5f)
{
}

void Material::setBaseColor(float r, float g, float b) {
    baseColor_ = glm::vec3(r, g, b);
}

void Material::setMetallic(float v) {
    metallic_ = glm::clamp(v, 0.0f, 1.0f);
}

void Material::setRoughness(float v) {
    roughness_ = glm::clamp(v, 0.04f, 1.0f);
}
