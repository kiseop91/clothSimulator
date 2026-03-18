#pragma once

namespace ShaderSources {

// ─── PBR Vertex Shader ───────────────────────────────────────────────
static const char* pbrVertexShader = R"glsl(#version 300 es
precision highp float;

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;

uniform mat4 u_model;
uniform mat4 u_view;
uniform mat4 u_projection;

out vec3 vWorldPos;
out vec3 vNormal;

void main() {
    vec4 worldPos = u_model * vec4(aPosition, 1.0);
    vWorldPos = worldPos.xyz;
    vNormal = mat3(transpose(inverse(u_model))) * aNormal;
    gl_Position = u_projection * u_view * worldPos;
}
)glsl";

// ─── PBR Fragment Shader (Cook-Torrance) ─────────────────────────────
static const char* pbrFragmentShader = R"glsl(#version 300 es
precision highp float;

in vec3 vWorldPos;
in vec3 vNormal;

uniform vec3 u_baseColor;
uniform float u_metallic;
uniform float u_roughness;
uniform vec3 u_camPos;
uniform vec3 u_lightPos;
uniform vec3 u_lightColor;

out vec4 fragColor;

const float PI = 3.14159265359;

// Normal Distribution Function (GGX/Trowbridge-Reitz)
float distributionGGX(vec3 N, vec3 H, float roughness) {
    float a = roughness * roughness;
    float a2 = a * a;
    float NdotH = max(dot(N, H), 0.0);
    float NdotH2 = NdotH * NdotH;

    float denom = (NdotH2 * (a2 - 1.0) + 1.0);
    denom = PI * denom * denom;

    return a2 / max(denom, 0.0001);
}

// Geometry Function (Smith's method with Schlick-GGX)
float geometrySchlickGGX(float NdotV, float roughness) {
    float r = roughness + 1.0;
    float k = (r * r) / 8.0;
    return NdotV / (NdotV * (1.0 - k) + k);
}

float geometrySmith(vec3 N, vec3 V, vec3 L, float roughness) {
    float NdotV = max(dot(N, V), 0.0);
    float NdotL = max(dot(N, L), 0.0);
    float ggx1 = geometrySchlickGGX(NdotV, roughness);
    float ggx2 = geometrySchlickGGX(NdotL, roughness);
    return ggx1 * ggx2;
}

// Fresnel (Schlick approximation)
vec3 fresnelSchlick(float cosTheta, vec3 F0) {
    return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(u_camPos - vWorldPos);
    vec3 L = normalize(u_lightPos - vWorldPos);
    vec3 H = normalize(V + L);

    // F0: reflectance at normal incidence
    vec3 F0 = vec3(0.04);
    F0 = mix(F0, u_baseColor, u_metallic);

    // Cook-Torrance BRDF
    float NDF = distributionGGX(N, H, u_roughness);
    float G = geometrySmith(N, V, L, u_roughness);
    vec3 F = fresnelSchlick(max(dot(H, V), 0.0), F0);

    vec3 numerator = NDF * G * F;
    float denominator = 4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0) + 0.0001;
    vec3 specular = numerator / denominator;

    // Energy conservation
    vec3 kS = F;
    vec3 kD = vec3(1.0) - kS;
    kD *= (1.0 - u_metallic);

    float NdotL = max(dot(N, L), 0.0);

    // Light attenuation
    float dist = length(u_lightPos - vWorldPos);
    float attenuation = 1.0 / (1.0 + 0.01 * dist * dist);
    vec3 radiance = u_lightColor * attenuation;

    vec3 Lo = (kD * u_baseColor / PI + specular) * radiance * NdotL;

    // Ambient
    vec3 ambient = vec3(0.08) * u_baseColor;

    vec3 color = ambient + Lo;

    // Gamma correction
    color = pow(color, vec3(1.0 / 2.2));

    fragColor = vec4(color, 1.0);
}
)glsl";

// ─── Grid Vertex Shader ──────────────────────────────────────────────
static const char* gridVertexShader = R"glsl(#version 300 es
precision highp float;

layout(location = 0) in vec3 aPosition;

uniform mat4 u_view;
uniform mat4 u_projection;

out vec3 vPos;

void main() {
    vPos = aPosition;
    gl_Position = u_projection * u_view * vec4(aPosition, 1.0);
}
)glsl";

// ─── Grid Fragment Shader ────────────────────────────────────────────
static const char* gridFragmentShader = R"glsl(#version 300 es
precision highp float;

in vec3 vPos;

out vec4 fragColor;

void main() {
    float dist = length(vPos.xz);
    float fade = 1.0 - smoothstep(5.0, 12.0, dist);

    // Brighter for center axes
    bool isAxisX = (abs(vPos.z) < 0.05);
    bool isAxisZ = (abs(vPos.x) < 0.05);

    vec3 color;
    if (isAxisX) {
        color = vec3(0.6, 0.2, 0.2); // red-ish X axis
    } else if (isAxisZ) {
        color = vec3(0.2, 0.2, 0.6); // blue-ish Z axis
    } else {
        color = vec3(0.35, 0.35, 0.40);
    }

    fragColor = vec4(color, fade * 0.7);
}
)glsl";

// ─── Wireframe Vertex Shader ────────────────────────────────────────
static const char* wireVertexShader = R"glsl(#version 300 es
precision highp float;

layout(location = 0) in vec3 aPosition;

uniform mat4 u_model;
uniform mat4 u_view;
uniform mat4 u_projection;

void main() {
    gl_Position = u_projection * u_view * u_model * vec4(aPosition, 1.0);
}
)glsl";

// ─── Wireframe Fragment Shader ──────────────────────────────────────
static const char* wireFragmentShader = R"glsl(#version 300 es
precision highp float;

uniform vec4 u_color;

out vec4 fragColor;

void main() {
    fragColor = u_color;
}
)glsl";

} // namespace ShaderSources
