#pragma once

namespace ShaderSources {

// --- PBR Vertex Shader ---
static const char* pbrVertexShader = R"glsl(#version 300 es
precision highp float;

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec2 aTexCoord;

uniform mat4 u_model;
uniform mat4 u_view;
uniform mat4 u_projection;
uniform mat4 u_lightSpaceMatrix;

out vec3 vWorldPos;
out vec3 vNormal;
out vec2 vTexCoord;
out vec4 vLightSpacePos;

void main() {
    vec4 worldPos = u_model * vec4(aPosition, 1.0);
    vWorldPos = worldPos.xyz;
    vNormal = mat3(transpose(inverse(u_model))) * aNormal;
    vTexCoord = aTexCoord;
    vLightSpacePos = u_lightSpaceMatrix * worldPos;
    gl_Position = u_projection * u_view * worldPos;
}
)glsl";

// --- PBR Fragment Shader (Cook-Torrance + Shadow + Hemisphere) ---
static const char* pbrFragmentShader = R"glsl(#version 300 es
precision highp float;

in vec3 vWorldPos;
in vec3 vNormal;
in vec2 vTexCoord;
in vec4 vLightSpacePos;

uniform vec3 u_baseColor;
uniform float u_metallic;
uniform float u_roughness;
uniform vec3 u_camPos;
uniform vec3 u_lightPos;
uniform vec3 u_lightColor;

uniform sampler2D u_shadowMap;
uniform bool u_shadowEnabled;

uniform sampler2D u_diffuseMap;
uniform bool u_hasTexture;

uniform vec3 u_ambientTop;
uniform vec3 u_ambientBottom;

uniform float u_uvOffsetU;
uniform float u_uvOffsetV;
uniform float u_uvTilingU;
uniform float u_uvTilingV;

out vec4 fragColor;

const float PI = 3.14159265359;

float distributionGGX(vec3 N, vec3 H, float roughness) {
    float a = roughness * roughness;
    float a2 = a * a;
    float NdotH = max(dot(N, H), 0.0);
    float NdotH2 = NdotH * NdotH;
    float denom = (NdotH2 * (a2 - 1.0) + 1.0);
    denom = PI * denom * denom;
    return a2 / max(denom, 0.0001);
}

float geometrySchlickGGX(float NdotV, float roughness) {
    float r = roughness + 1.0;
    float k = (r * r) / 8.0;
    return NdotV / (NdotV * (1.0 - k) + k);
}

float geometrySmith(vec3 N, vec3 V, vec3 L, float roughness) {
    float NdotV = max(dot(N, V), 0.0);
    float NdotL = max(dot(N, L), 0.0);
    return geometrySchlickGGX(NdotV, roughness) * geometrySchlickGGX(NdotL, roughness);
}

vec3 fresnelSchlick(float cosTheta, vec3 F0) {
    return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

float calcShadow(vec4 lightSpacePos, vec3 N, vec3 L) {
    if (!u_shadowEnabled) return 0.0;

    vec3 projCoords = lightSpacePos.xyz / lightSpacePos.w;
    projCoords = projCoords * 0.5 + 0.5;

    if (projCoords.z > 1.0 || projCoords.x < 0.0 || projCoords.x > 1.0 ||
        projCoords.y < 0.0 || projCoords.y > 1.0) return 0.0;

    float bias = max(0.005 * (1.0 - dot(N, L)), 0.001);
    float currentDepth = projCoords.z;

    float shadow = 0.0;
    vec2 texelSize = 1.0 / vec2(textureSize(u_shadowMap, 0));
    for (int x = -1; x <= 1; x++) {
        for (int y = -1; y <= 1; y++) {
            float pcfDepth = texture(u_shadowMap, projCoords.xy + vec2(x, y) * texelSize).r;
            shadow += currentDepth - bias > pcfDepth ? 1.0 : 0.0;
        }
    }
    return shadow / 9.0;
}

void main() {
    vec3 N = normalize(vNormal);
    vec3 V = normalize(u_camPos - vWorldPos);
    vec3 L = normalize(u_lightPos - vWorldPos);
    vec3 H = normalize(V + L);

    vec2 uv = vTexCoord * vec2(u_uvTilingU, u_uvTilingV) + vec2(u_uvOffsetU, u_uvOffsetV);
    vec3 texColor = texture(u_diffuseMap, uv).rgb;
    vec3 albedo = u_hasTexture ? pow(texColor, vec3(2.2)) : u_baseColor;

    vec3 F0 = vec3(0.04);
    F0 = mix(F0, albedo, u_metallic);

    float NDF = distributionGGX(N, H, u_roughness);
    float G = geometrySmith(N, V, L, u_roughness);
    vec3 F = fresnelSchlick(max(dot(H, V), 0.0), F0);

    vec3 numerator = NDF * G * F;
    float denominator = 4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0) + 0.0001;
    vec3 specular = numerator / denominator;

    vec3 kS = F;
    vec3 kD = (vec3(1.0) - kS) * (1.0 - u_metallic);

    float NdotL = max(dot(N, L), 0.0);

    float dist = length(u_lightPos - vWorldPos);
    float attenuation = 1.0 / (1.0 + 0.00001 * dist * dist);
    vec3 radiance = u_lightColor * attenuation;

    float shadow = calcShadow(vLightSpacePos, N, L);

    vec3 Lo = (kD * albedo / PI + specular) * radiance * NdotL * (1.0 - shadow);

    float hemisphereWeight = dot(N, vec3(0.0, 1.0, 0.0)) * 0.5 + 0.5;
    vec3 ambient = mix(u_ambientBottom, u_ambientTop, hemisphereWeight) * albedo;

    vec3 color = ambient + Lo;
    color = pow(color, vec3(1.0 / 2.2));

    fragColor = vec4(color, 1.0);
}
)glsl";

// --- Shadow Depth Vertex Shader ---
static const char* shadowVertexShader = R"glsl(#version 300 es
precision highp float;

layout(location = 0) in vec3 aPosition;

uniform mat4 u_model;
uniform mat4 u_lightSpaceMatrix;

void main() {
    gl_Position = u_lightSpaceMatrix * u_model * vec4(aPosition, 1.0);
}
)glsl";

// --- Shadow Depth Fragment Shader ---
static const char* shadowFragmentShader = R"glsl(#version 300 es
precision highp float;

out vec4 fragColor;

void main() {
    fragColor = vec4(gl_FragCoord.z, 0.0, 0.0, 1.0);
}
)glsl";

// --- Grid Vertex Shader ---
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

// --- Grid Fragment Shader ---
static const char* gridFragmentShader = R"glsl(#version 300 es
precision highp float;

in vec3 vPos;

out vec4 fragColor;

void main() {
    float dist = length(vPos.xz);
    float fade = 1.0 - smoothstep(5.0, 12.0, dist);

    bool isAxisX = (abs(vPos.z) < 0.05);
    bool isAxisZ = (abs(vPos.x) < 0.05);

    vec3 color;
    if (isAxisX) {
        color = vec3(0.6, 0.2, 0.2);
    } else if (isAxisZ) {
        color = vec3(0.2, 0.2, 0.6);
    } else {
        color = vec3(0.35, 0.35, 0.40);
    }

    fragColor = vec4(color, fade * 0.7);
}
)glsl";

// --- Wireframe Vertex Shader ---
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

// --- Wireframe Fragment Shader ---
static const char* wireFragmentShader = R"glsl(#version 300 es
precision highp float;

uniform vec4 u_color;

out vec4 fragColor;

void main() {
    fragColor = u_color;
}
)glsl";

// --- Rink Vertex Shader (vertex color) ---
static const char* rinkVertexShader = R"glsl(#version 300 es
precision highp float;

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aColor;

uniform mat4 u_view;
uniform mat4 u_projection;

out vec3 vColor;

void main() {
    vColor = aColor;
    gl_Position = u_projection * u_view * vec4(aPosition, 1.0);
}
)glsl";

// --- Rink Fragment Shader ---
static const char* rinkFragmentShader = R"glsl(#version 300 es
precision highp float;

in vec3 vColor;

out vec4 fragColor;

void main() {
    fragColor = vec4(vColor, 1.0);
}
)glsl";

// --- Path Vertex Shader (position + color per vertex) ---
static const char* pathVertexShader = R"glsl(#version 300 es
precision highp float;

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aColor;

uniform mat4 u_view;
uniform mat4 u_projection;

out vec3 vColor;

void main() {
    vColor = aColor;
    gl_Position = u_projection * u_view * vec4(aPosition, 1.0);
}
)glsl";

// --- Path Fragment Shader ---
static const char* pathFragmentShader = R"glsl(#version 300 es
precision highp float;

in vec3 vColor;

out vec4 fragColor;

void main() {
    fragColor = vec4(vColor, 1.0);
}
)glsl";

} // namespace ShaderSources
