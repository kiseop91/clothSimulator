#include "rink/PathRenderer.h"
#include "renderer/ShaderSources.h"
#include <cmath>
#include <emscripten.h>

static const float PATH_Y = 0.05f;
static const float PI = 3.14159265359f;

PathRenderer::PathRenderer() : vao_(0), vbo_(0) {}

PathRenderer::~PathRenderer() { destroy(); }

void PathRenderer::init() {
    shader_.compile(ShaderSources::pathVertexShader, ShaderSources::pathFragmentShader);

    glGenVertexArrays(1, &vao_);
    glGenBuffers(1, &vbo_);

    glBindVertexArray(vao_);
    glBindBuffer(GL_ARRAY_BUFFER, vbo_);

    // position(3) + color(3) per vertex
    glEnableVertexAttribArray(0);
    glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, 6 * sizeof(float), (void*)0);
    glEnableVertexAttribArray(1);
    glVertexAttribPointer(1, 3, GL_FLOAT, GL_FALSE, 6 * sizeof(float), (void*)(3 * sizeof(float)));

    glBindVertexArray(0);
}

void PathRenderer::setPaths(const float* data, int floatCount) {
    std::vector<float> verts;
    buildVertices(data, floatCount, verts);

    vertexCount_ = static_cast<int>(verts.size() / 6);

    glBindBuffer(GL_ARRAY_BUFFER, vbo_);
    glBufferData(GL_ARRAY_BUFFER, verts.size() * sizeof(float), verts.data(), GL_DYNAMIC_DRAW);
    glBindBuffer(GL_ARRAY_BUFFER, 0);
}

void PathRenderer::addArrowHead(float x, float z, float dirX, float dirZ,
                                float r, float g, float b, std::vector<float>& verts) {
    float len = sqrtf(dirX * dirX + dirZ * dirZ);
    if (len < 0.001f) return;

    float nx = dirX / len;
    float nz = dirZ / len;
    float arrowLen = 3.0f;
    float arrowWidth = 1.5f;

    float tipX = x + nx * arrowLen;
    float tipZ = z + nz * arrowLen;
    float leftX = x - nz * arrowWidth;
    float leftZ = z + nx * arrowWidth;
    float rightX = x + nz * arrowWidth;
    float rightZ = z - nx * arrowWidth;

    // Two lines forming arrow
    verts.insert(verts.end(), {tipX, PATH_Y, tipZ, r, g, b});
    verts.insert(verts.end(), {leftX, PATH_Y, leftZ, r, g, b});
    verts.insert(verts.end(), {tipX, PATH_Y, tipZ, r, g, b});
    verts.insert(verts.end(), {rightX, PATH_Y, rightZ, r, g, b});
}

void PathRenderer::buildVertices(const float* data, int count, std::vector<float>& outVerts) {
    int i = 0;
    while (i + 6 <= count) {
        int style = static_cast<int>(data[i]);
        float r = data[i + 1];
        float g = data[i + 2];
        float b = data[i + 3];
        int hasArrow = static_cast<int>(data[i + 4]);
        int n = static_cast<int>(data[i + 5]);
        i += 6;

        if (i + n * 2 > count) break;

        // Collect waypoints
        std::vector<float> wx, wz;
        for (int j = 0; j < n; j++) {
            wx.push_back(data[i + j * 2]);
            wz.push_back(data[i + j * 2 + 1]);
        }
        i += n * 2;

        if (n < 2) continue;

        switch (style) {
            case SOLID:
            default:
                // Straight line segments
                for (int j = 0; j < n - 1; j++) {
                    outVerts.insert(outVerts.end(), {wx[j], PATH_Y, wz[j], r, g, b});
                    outVerts.insert(outVerts.end(), {wx[j+1], PATH_Y, wz[j+1], r, g, b});
                }
                break;

            case DASHED: {
                // Dashed segments with gaps
                float dashLen = 2.0f;
                float gapLen = 1.5f;
                for (int j = 0; j < n - 1; j++) {
                    float dx = wx[j+1] - wx[j];
                    float dz = wz[j+1] - wz[j];
                    float segLen = sqrtf(dx * dx + dz * dz);
                    if (segLen < 0.001f) continue;
                    float nx = dx / segLen;
                    float nz = dz / segLen;

                    float t = 0.0f;
                    bool drawing = true;
                    while (t < segLen) {
                        float step = drawing ? dashLen : gapLen;
                        float end = fminf(t + step, segLen);
                        if (drawing) {
                            outVerts.insert(outVerts.end(), {wx[j] + nx * t, PATH_Y, wz[j] + nz * t, r, g, b});
                            outVerts.insert(outVerts.end(), {wx[j] + nx * end, PATH_Y, wz[j] + nz * end, r, g, b});
                        }
                        t = end;
                        drawing = !drawing;
                    }
                }
                break;
            }

            case ZIGZAG: {
                // Zigzag pattern
                float zigAmp = 1.5f;
                float zigStep = 2.0f;
                for (int j = 0; j < n - 1; j++) {
                    float dx = wx[j+1] - wx[j];
                    float dz = wz[j+1] - wz[j];
                    float segLen = sqrtf(dx * dx + dz * dz);
                    if (segLen < 0.001f) continue;
                    float nx = dx / segLen;
                    float nz = dz / segLen;
                    float px = -nz; // perpendicular
                    float pz = nx;

                    int steps = static_cast<int>(segLen / zigStep);
                    if (steps < 1) steps = 1;
                    float prevX = wx[j], prevZ = wz[j];
                    for (int k = 1; k <= steps; k++) {
                        float t = static_cast<float>(k) / steps;
                        float baseX = wx[j] + dx * t;
                        float baseZ = wz[j] + dz * t;
                        float offset = (k == steps) ? 0.0f : ((k % 2 == 1) ? zigAmp : -zigAmp);
                        float curX = baseX + px * offset;
                        float curZ = baseZ + pz * offset;
                        outVerts.insert(outVerts.end(), {prevX, PATH_Y, prevZ, r, g, b});
                        outVerts.insert(outVerts.end(), {curX, PATH_Y, curZ, r, g, b});
                        prevX = curX;
                        prevZ = curZ;
                    }
                }
                break;
            }

            case DOTTED: {
                // Dotted (very short dashes)
                float dotLen = 0.5f;
                float dotGap = 1.5f;
                for (int j = 0; j < n - 1; j++) {
                    float dx = wx[j+1] - wx[j];
                    float dz = wz[j+1] - wz[j];
                    float segLen = sqrtf(dx * dx + dz * dz);
                    if (segLen < 0.001f) continue;
                    float nx = dx / segLen;
                    float nz = dz / segLen;

                    float t = 0.0f;
                    bool drawing = true;
                    while (t < segLen) {
                        float step = drawing ? dotLen : dotGap;
                        float end = fminf(t + step, segLen);
                        if (drawing) {
                            outVerts.insert(outVerts.end(), {wx[j] + nx * t, PATH_Y, wz[j] + nz * t, r, g, b});
                            outVerts.insert(outVerts.end(), {wx[j] + nx * end, PATH_Y, wz[j] + nz * end, r, g, b});
                        }
                        t = end;
                        drawing = !drawing;
                    }
                }
                break;
            }

            case BACKWARD: {
                // Backward skating: dashed with perpendicular ticks
                float dashLen = 3.0f;
                float gapLen = 1.0f;
                for (int j = 0; j < n - 1; j++) {
                    float dx = wx[j+1] - wx[j];
                    float dz = wz[j+1] - wz[j];
                    float segLen = sqrtf(dx * dx + dz * dz);
                    if (segLen < 0.001f) continue;
                    float nx = dx / segLen;
                    float nz = dz / segLen;
                    float px = -nz;
                    float pz = nx;

                    float t = 0.0f;
                    bool drawing = true;
                    while (t < segLen) {
                        float step = drawing ? dashLen : gapLen;
                        float end = fminf(t + step, segLen);
                        if (drawing) {
                            float sx = wx[j] + nx * t;
                            float sz = wz[j] + nz * t;
                            float ex = wx[j] + nx * end;
                            float ez = wz[j] + nz * end;
                            outVerts.insert(outVerts.end(), {sx, PATH_Y, sz, r, g, b});
                            outVerts.insert(outVerts.end(), {ex, PATH_Y, ez, r, g, b});
                            // Tick at start
                            outVerts.insert(outVerts.end(), {sx - px * 1.0f, PATH_Y, sz - pz * 1.0f, r, g, b});
                            outVerts.insert(outVerts.end(), {sx + px * 1.0f, PATH_Y, sz + pz * 1.0f, r, g, b});
                        }
                        t = end;
                        drawing = !drawing;
                    }
                }
                break;
            }
        }

        // Arrow at end
        if (hasArrow && n >= 2) {
            float dx = wx[n-1] - wx[n-2];
            float dz = wz[n-1] - wz[n-2];
            addArrowHead(wx[n-1], wz[n-1], dx, dz, r, g, b, outVerts);
        }
    }
}

void PathRenderer::render(const glm::mat4& view, const glm::mat4& proj) {
    if (vertexCount_ == 0) return;

    shader_.use();
    shader_.setMat4("u_view", view);
    shader_.setMat4("u_projection", proj);

    glEnable(GL_BLEND);
    glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);

    glBindVertexArray(vao_);
    glDrawArrays(GL_LINES, 0, vertexCount_);
    glBindVertexArray(0);

    glDisable(GL_BLEND);
}

void PathRenderer::clear() {
    vertexCount_ = 0;
    glBindBuffer(GL_ARRAY_BUFFER, vbo_);
    glBufferData(GL_ARRAY_BUFFER, 0, nullptr, GL_DYNAMIC_DRAW);
    glBindBuffer(GL_ARRAY_BUFFER, 0);
}

void PathRenderer::destroy() {
    shader_.destroy();
    if (vbo_) { glDeleteBuffers(1, &vbo_); vbo_ = 0; }
    if (vao_) { glDeleteVertexArrays(1, &vao_); vao_ = 0; }
    vertexCount_ = 0;
}
