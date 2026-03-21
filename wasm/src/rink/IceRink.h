#pragma once

#include <GLES3/gl3.h>
#include <glm/glm.hpp>
#include <vector>
#include "renderer/Shader.h"

class IceRink {
public:
    enum Layout { FULL_RINK = 0, HALF_RINK = 1, NEUTRAL_ZONE = 2, END_ZONE = 3 };

    IceRink();
    ~IceRink();

    void init(Layout layout = FULL_RINK);
    void setLayout(Layout layout);
    void render(const glm::mat4& view, const glm::mat4& proj);
    void destroy();

private:
    void rebuild();
    void generateIceSurface(std::vector<float>& verts, std::vector<uint32_t>& idx);
    void generateBoards(std::vector<float>& verts, std::vector<uint32_t>& idx);
    void generateLine(float x1, float z1, float x2, float z2, float width,
                      float r, float g, float b,
                      std::vector<float>& verts, std::vector<uint32_t>& idx);
    void generateCircle(float cx, float cz, float radius, float lineWidth,
                        float r, float g, float b, int segments,
                        std::vector<float>& verts, std::vector<uint32_t>& idx);
    void generateFilledCircle(float cx, float cz, float radius,
                              float r, float g, float b, int segments,
                              std::vector<float>& verts, std::vector<uint32_t>& idx);
    void generateArc(float cx, float cz, float radius, float lineWidth,
                     float startAngle, float endAngle,
                     float r, float g, float b, int segments,
                     std::vector<float>& verts, std::vector<uint32_t>& idx);
    void generateCrease(float goalLineX, float r, float g, float b,
                        std::vector<float>& verts, std::vector<uint32_t>& idx);
    void generateAllMarkings(std::vector<float>& verts, std::vector<uint32_t>& idx);

    // Ice surface + boards
    GLuint vao_, vbo_, ebo_;
    int indexCount_ = 0;

    // Rink markings (lines, circles, dots) — separate VAO for depth offset
    GLuint markingsVao_ = 0, markingsVbo_ = 0, markingsEbo_ = 0;
    int markingsIndexCount_ = 0;

    Shader shader_;
    Layout layout_ = FULL_RINK;
};
