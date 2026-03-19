#pragma once

namespace ShaderSources {

// ─── PBR Shader (Vertex + Fragment combined in WGSL) ─────────────────
static const char* pbrShader = R"wgsl(
struct Uniforms {
    model: mat4x4f,
    view: mat4x4f,
    projection: mat4x4f,
    lightSpaceMatrix: mat4x4f,
    camPos: vec3f,
    _pad0: f32,
    lightPos: vec3f,
    _pad1: f32,
    lightColor: vec3f,
    _pad2: f32,
    baseColor: vec3f,
    metallic: f32,
    ambientTop: vec3f,
    roughness: f32,
    ambientBottom: vec3f,
    shadowEnabled: f32,
    uvOffset: vec2f,
    uvTiling: vec2f,
    hasTexture: f32,
    _pad3: f32,
    _pad4: f32,
    _pad5: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var shadowSampler: sampler_comparison;
@group(0) @binding(2) var shadowMap: texture_depth_2d;
@group(0) @binding(3) var diffuseSampler: sampler;
@group(0) @binding(4) var diffuseMap: texture_2d<f32>;

struct VSInput {
    @location(0) position: vec3f,
    @location(1) normal: vec3f,
    @location(2) texCoord: vec2f,
};

struct VSOutput {
    @builtin(position) position: vec4f,
    @location(0) worldPos: vec3f,
    @location(1) normal: vec3f,
    @location(2) texCoord: vec2f,
    @location(3) lightSpacePos: vec4f,
};

@vertex
fn vs_main(in: VSInput) -> VSOutput {
    var out: VSOutput;
    let worldPos = u.model * vec4f(in.position, 1.0);
    out.worldPos = worldPos.xyz;

    // Normal matrix = transpose(inverse(model)) — for uniform scale, just use mat3
    let normalMat = mat3x3f(
        u.model[0].xyz,
        u.model[1].xyz,
        u.model[2].xyz
    );
    out.normal = normalMat * in.normal;
    out.texCoord = in.texCoord;
    out.lightSpacePos = u.lightSpaceMatrix * worldPos;
    out.position = u.projection * u.view * worldPos;
    return out;
}

const PI: f32 = 3.14159265359;

fn distributionGGX(N: vec3f, H: vec3f, roughness: f32) -> f32 {
    let a = roughness * roughness;
    let a2 = a * a;
    let NdotH = max(dot(N, H), 0.0);
    let NdotH2 = NdotH * NdotH;
    let denom = (NdotH2 * (a2 - 1.0) + 1.0);
    return a2 / max(PI * denom * denom, 0.0001);
}

fn geometrySchlickGGX(NdotV: f32, roughness: f32) -> f32 {
    let r = roughness + 1.0;
    let k = (r * r) / 8.0;
    return NdotV / (NdotV * (1.0 - k) + k);
}

fn geometrySmith(N: vec3f, V: vec3f, L: vec3f, roughness: f32) -> f32 {
    let NdotV = max(dot(N, V), 0.0);
    let NdotL = max(dot(N, L), 0.0);
    return geometrySchlickGGX(NdotV, roughness) * geometrySchlickGGX(NdotL, roughness);
}

fn fresnelSchlick(cosTheta: f32, F0: vec3f) -> vec3f {
    return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

fn calcShadow(lightSpacePos: vec4f, N: vec3f, L: vec3f) -> f32 {
    if (u.shadowEnabled < 0.5) { return 0.0; }

    let projCoords = lightSpacePos.xyz / lightSpacePos.w;
    let uv = projCoords.xy * 0.5 + 0.5;
    let depth = projCoords.z * 0.5 + 0.5;

    let bias = max(0.005 * (1.0 - dot(N, L)), 0.001);
    let currentDepth = depth - bias;

    // PCF 3x3 — textureSampleCompare must be called from uniform control flow
    let texelSize = vec2f(1.0 / 1024.0, 1.0 / 1024.0);
    var shadow: f32 = 0.0;
    for (var x: i32 = -1; x <= 1; x++) {
        for (var y: i32 = -1; y <= 1; y++) {
            let offset = vec2f(f32(x), f32(y)) * texelSize;
            shadow += textureSampleCompare(shadowMap, shadowSampler, uv + offset, currentDepth);
        }
    }
    shadow = 1.0 - shadow / 9.0;

    // Apply out-of-bounds check post-hoc via select (no non-uniform branching)
    let outOfBounds = depth > 1.0 || uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0;
    return select(shadow, 0.0, outOfBounds);
}

@fragment
fn fs_main(in: VSOutput) -> @location(0) vec4f {
    let N = normalize(in.normal);
    let V = normalize(u.camPos - in.worldPos);
    let L = normalize(u.lightPos - in.worldPos);
    let H = normalize(V + L);

    // Albedo: texture (sRGB→linear) or base color
    let uv = in.texCoord * u.uvTiling + u.uvOffset;
    let texColor = textureSample(diffuseMap, diffuseSampler, uv).rgb;
    var albedo: vec3f;
    if (u.hasTexture > 0.5) {
        albedo = pow(texColor, vec3f(2.2));
    } else {
        albedo = u.baseColor;
    }

    var F0 = vec3f(0.04);
    F0 = mix(F0, albedo, u.metallic);

    // Cook-Torrance BRDF
    let NDF = distributionGGX(N, H, u.roughness);
    let G = geometrySmith(N, V, L, u.roughness);
    let F = fresnelSchlick(max(dot(H, V), 0.0), F0);

    let numerator = NDF * G * F;
    let denominator = 4.0 * max(dot(N, V), 0.0) * max(dot(N, L), 0.0) + 0.0001;
    let specular = numerator / denominator;

    let kS = F;
    let kD = (vec3f(1.0) - kS) * (1.0 - u.metallic);

    let NdotL = max(dot(N, L), 0.0);

    let dist = length(u.lightPos - in.worldPos);
    let attenuation = 1.0 / (1.0 + 0.001 * dist * dist);
    let radiance = u.lightColor * attenuation;

    // Shadow
    let shadow = calcShadow(in.lightSpacePos, N, L);

    let Lo = (kD * albedo / PI + specular) * radiance * NdotL * (1.0 - shadow);

    // Hemisphere ambient
    let hemisphereWeight = dot(N, vec3f(0.0, 1.0, 0.0)) * 0.5 + 0.5;
    let ambient = mix(u.ambientBottom, u.ambientTop, hemisphereWeight) * albedo;

    var color = ambient + Lo;

    // Gamma correction
    color = pow(color, vec3f(1.0 / 2.2));

    return vec4f(color, 1.0);
}
)wgsl";

// ─── Shadow Depth Shader ─────────────────────────────────────────────
static const char* shadowShader = R"wgsl(
struct ShadowUniforms {
    model: mat4x4f,
    lightSpaceMatrix: mat4x4f,
};

@group(0) @binding(0) var<uniform> u: ShadowUniforms;

@vertex
fn vs_main(@location(0) position: vec3f) -> @builtin(position) vec4f {
    return u.lightSpaceMatrix * u.model * vec4f(position, 1.0);
}
)wgsl";

// ─── Grid Shader ─────────────────────────────────────────────────────
static const char* gridShader = R"wgsl(
struct GridUniforms {
    view: mat4x4f,
    projection: mat4x4f,
};

@group(0) @binding(0) var<uniform> u: GridUniforms;

struct VSOutput {
    @builtin(position) position: vec4f,
    @location(0) worldPos: vec3f,
};

@vertex
fn vs_main(@location(0) pos: vec3f) -> VSOutput {
    var out: VSOutput;
    out.worldPos = pos;
    out.position = u.projection * u.view * vec4f(pos, 1.0);
    return out;
}

@fragment
fn fs_main(in: VSOutput) -> @location(0) vec4f {
    let dist = length(in.worldPos.xz);
    let fade = 1.0 - smoothstep(5.0, 12.0, dist);

    let isAxisX = abs(in.worldPos.z) < 0.05;
    let isAxisZ = abs(in.worldPos.x) < 0.05;

    var color: vec3f;
    if (isAxisX) {
        color = vec3f(0.6, 0.2, 0.2);
    } else if (isAxisZ) {
        color = vec3f(0.2, 0.2, 0.6);
    } else {
        color = vec3f(0.35, 0.35, 0.40);
    }

    return vec4f(color, fade * 0.7);
}
)wgsl";

// ─── Wireframe Shader ────────────────────────────────────────────────
static const char* wireShader = R"wgsl(
struct WireUniforms {
    model: mat4x4f,
    view: mat4x4f,
    projection: mat4x4f,
    color: vec4f,
};

@group(0) @binding(0) var<uniform> u: WireUniforms;

@vertex
fn vs_main(@location(0) position: vec3f) -> @builtin(position) vec4f {
    return u.projection * u.view * u.model * vec4f(position, 1.0);
}

@fragment
fn fs_main() -> @location(0) vec4f {
    return u.color;
}
)wgsl";

} // namespace ShaderSources
