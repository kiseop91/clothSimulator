# Rendering Improvements Roadmap

## Current State
- Cook-Torrance PBR (GGX + Schlick + Smith)
- 1024px shadow map with PCF 3×3
- No anti-aliasing, no post-processing
- Simple hemisphere ambient lighting
- Single diffuse texture, no mipmaps
- Two-pass cloth rendering (back+front face)

---

## Quick Wins (1시간 이내)

### 1. MSAA 4x Anti-Aliasing
- WebGPU `multisample.count = 4` on render pipeline
- Create MSAA render target texture, resolve to backbuffer
- Eliminates jagged edges on cloth and geometry

### 2. Shadow Resolution Upgrade
- Increase from 1024 to 2048 or 4096
- Update PCF texel size accordingly (`1.0/2048.0`)
- Better slope-based bias: refine `depthBias` and `depthBiasSlopeScale`

### 3. Mipmap + Anisotropic Filtering
- Generate mipmaps on texture upload (`mipLevelCount = floor(log2(max(w,h))) + 1`)
- Enable anisotropic filtering on sampler (`maxAnisotropy = 16`)
- Significant texture quality improvement at oblique angles

---

## Medium Effort (2~4시간)

### 4. Bloom + Tone Mapping
- Render to F16 intermediate texture (HDR)
- Extract bright pixels (threshold > 1.0)
- Gaussian blur (2-pass separable, 5-7 taps)
- Composite bloom + tone map (ACES/Reinhard) to sRGB output
- Makes specular highlights glow naturally

### 5. Skybox / Environment Map
- Load 6-face cubemap or equirectangular HDR
- Simple skybox shader (sample cubemap at view direction)
- Replace solid clear color with environment
- Provides visual context and can be used for IBL

### 6. Normal Mapping
- Already have TBN space in vertex shader (model matrix * normal)
- Add normal texture binding (binding 5/6)
- Per-fragment normal lookup and perturbation
- Creates micro-surface detail without extra geometry

---

## Advanced (하루+)

### 7. IBL (Image-Based Lighting)
- Prefiltered environment map for specular (mip levels = roughness)
- Irradiance map for diffuse (spherical harmonics or low-res cubemap)
- Split-sum approximation with BRDF LUT
- Replaces hemisphere ambient with physically accurate indirect lighting

### 8. SSAO (Screen-Space Ambient Occlusion)
- Depth + normal G-buffer pass (or read from existing depth)
- Random hemisphere sampling in compute shader
- Bilateral blur for smoothing
- Multiply ambient term by AO factor

### 9. Cloth-Specific Shading
- **Sheen**: Fabric-specific specular (perpendicular to thread direction)
- **SSS (Subsurface Scattering)**: Thin-film translucency based on view-light angle
- **Anisotropic highlights**: Silk/satin directional highlights
- **Transparency**: Alpha blending for sheer fabrics (OIT for order-independence)

### 10. Cascaded Shadow Maps (CSM)
- Split view frustum into 3-4 cascades
- Per-cascade shadow map (2048 each)
- Smooth cascade blending
- Better shadow detail at all distances

---

## Rendering Pipeline Evolution

```
Current:   Scene → Shadow Pass → Main Pass → Backbuffer

Target:    Scene → Shadow Pass (CSM) → G-Buffer Pass
              → SSAO Pass → Lighting Pass (IBL + Direct)
              → Bloom Extract → Bloom Blur → Composite
              → Tone Map → FXAA/MSAA → Backbuffer
```

## References
- [LearnOpenGL PBR](https://learnopengl.com/PBR/Theory)
- [WebGPU Best Practices](https://toji.dev/webgpu-best-practices/)
- [Filament Material Guide](https://google.github.io/filament/Materials.html)
- [ACES Tone Mapping](https://knarkowicz.wordpress.com/2016/01/06/aces-filmic-tone-mapping-curve/)
