#include "rink/IceRink.h"
#include "renderer/ShaderSources.h"
#include <cmath>
#include <emscripten.h>

// NHL rink: 200ft x 85ft, 1 unit = 1 foot, centered at origin on XZ plane
static const float RINK_LENGTH = 200.0f;
static const float RINK_WIDTH = 85.0f;
static const float HALF_L = RINK_LENGTH / 2.0f; // 100
static const float HALF_W = RINK_WIDTH / 2.0f;  // 42.5
static const float CORNER_RADIUS = 28.0f;
static const float BOARD_HEIGHT = 3.5f; // ~42 inches
static const float LINE_WIDTH = 1.0f;   // 1 foot wide lines
static const float THIN_LINE = 0.167f;  // 2 inches

// Key positions (from center)
static const float CENTER_X = 0.0f;
static const float BLUE_LINE_X = 25.0f;     // blue lines 25ft from center
static const float GOAL_LINE_X = 89.0f;     // goal lines 11ft from end
static const float FACEOFF_DOT_X = 69.0f;   // end zone faceoff dots
static const float FACEOFF_DOT_Z = 22.0f;   // lateral offset
static const float FACEOFF_CIRCLE_R = 15.0f; // faceoff circle radius
static const float CREASE_RADIUS = 6.0f;
static const float PI = 3.14159265359f;

IceRink::IceRink() : vao_(0), vbo_(0), ebo_(0) {}

IceRink::~IceRink() { destroy(); }

void IceRink::init(Layout layout) {
    shader_.compile(ShaderSources::rinkVertexShader, ShaderSources::rinkFragmentShader);
    layout_ = layout;
    rebuild();
}

void IceRink::setLayout(Layout layout) {
    if (layout_ == layout) return;
    layout_ = layout;
    rebuild();
}

void IceRink::rebuild() {
    // Clean up old buffers
    if (vbo_) { glDeleteBuffers(1, &vbo_); vbo_ = 0; }
    if (ebo_) { glDeleteBuffers(1, &ebo_); ebo_ = 0; }
    if (vao_) { glDeleteVertexArrays(1, &vao_); vao_ = 0; }
    if (markingsVbo_) { glDeleteBuffers(1, &markingsVbo_); markingsVbo_ = 0; }
    if (markingsEbo_) { glDeleteBuffers(1, &markingsEbo_); markingsEbo_ = 0; }
    if (markingsVao_) { glDeleteVertexArrays(1, &markingsVao_); markingsVao_ = 0; }

    // --- Ice surface + boards ---
    {
        std::vector<float> verts;
        std::vector<uint32_t> idx;
        generateIceSurface(verts, idx);
        generateBoards(verts, idx);

        indexCount_ = static_cast<int>(idx.size());
        if (indexCount_ > 0) {
            glGenVertexArrays(1, &vao_);
            glGenBuffers(1, &vbo_);
            glGenBuffers(1, &ebo_);
            glBindVertexArray(vao_);
            glBindBuffer(GL_ARRAY_BUFFER, vbo_);
            glBufferData(GL_ARRAY_BUFFER, verts.size() * sizeof(float), verts.data(), GL_STATIC_DRAW);
            glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, ebo_);
            glBufferData(GL_ELEMENT_ARRAY_BUFFER, idx.size() * sizeof(uint32_t), idx.data(), GL_STATIC_DRAW);
            glEnableVertexAttribArray(0);
            glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, 6 * sizeof(float), (void*)0);
            glEnableVertexAttribArray(1);
            glVertexAttribPointer(1, 3, GL_FLOAT, GL_FALSE, 6 * sizeof(float), (void*)(3 * sizeof(float)));
            glBindVertexArray(0);
        }
    }

    // --- Rink markings (lines, circles, dots) — separate VAO ---
    {
        std::vector<float> verts;
        std::vector<uint32_t> idx;
        generateAllMarkings(verts, idx);

        markingsIndexCount_ = static_cast<int>(idx.size());
        if (markingsIndexCount_ > 0) {
            glGenVertexArrays(1, &markingsVao_);
            glGenBuffers(1, &markingsVbo_);
            glGenBuffers(1, &markingsEbo_);
            glBindVertexArray(markingsVao_);
            glBindBuffer(GL_ARRAY_BUFFER, markingsVbo_);
            glBufferData(GL_ARRAY_BUFFER, verts.size() * sizeof(float), verts.data(), GL_STATIC_DRAW);
            glBindBuffer(GL_ELEMENT_ARRAY_BUFFER, markingsEbo_);
            glBufferData(GL_ELEMENT_ARRAY_BUFFER, idx.size() * sizeof(uint32_t), idx.data(), GL_STATIC_DRAW);
            glEnableVertexAttribArray(0);
            glVertexAttribPointer(0, 3, GL_FLOAT, GL_FALSE, 6 * sizeof(float), (void*)0);
            glEnableVertexAttribArray(1);
            glVertexAttribPointer(1, 3, GL_FLOAT, GL_FALSE, 6 * sizeof(float), (void*)(3 * sizeof(float)));
            glBindVertexArray(0);
        }
    }

    emscripten_log(EM_LOG_CONSOLE, "IceRink built: ice=%d idx, markings=%d idx",
                   indexCount_, markingsIndexCount_);
}

void IceRink::generateIceSurface(std::vector<float>& verts, std::vector<uint32_t>& idx) {
    // Ice color: slightly blue-white
    float ir = 0.92f, ig = 0.94f, ib = 0.96f;
    float y = 0.0f;

    // Generate rounded rectangle for ice surface
    // We'll create a simple rectangular surface with rounded corners using segments
    uint32_t base = static_cast<uint32_t>(verts.size() / 6);

    // Center vertex
    verts.insert(verts.end(), {0.0f, y, 0.0f, ir, ig, ib});

    // Generate boundary points (rounded rectangle)
    int segments = 64;
    float straightL = HALF_L - CORNER_RADIUS;
    float straightW = HALF_W - CORNER_RADIUS;

    std::vector<std::pair<float, float>> boundary;

    // Top edge (positive Z, from -X to +X)
    for (int i = 0; i <= segments / 4; i++) {
        float t = static_cast<float>(i) / (segments / 4);
        boundary.push_back({-straightL + t * 2.0f * straightL, HALF_W});
    }
    // Top-right corner
    for (int i = 0; i <= segments / 4; i++) {
        float angle = PI / 2.0f * static_cast<float>(i) / (segments / 4);
        boundary.push_back({straightL + CORNER_RADIUS * sinf(angle),
                           straightW + CORNER_RADIUS * cosf(angle)});
    }
    // Right edge (positive X, from +Z to -Z)
    for (int i = 1; i <= segments / 4; i++) {
        float t = static_cast<float>(i) / (segments / 4);
        boundary.push_back({HALF_L, straightW - t * 2.0f * straightW});
    }
    // Bottom-right corner
    for (int i = 0; i <= segments / 4; i++) {
        float angle = PI / 2.0f * static_cast<float>(i) / (segments / 4);
        boundary.push_back({straightL + CORNER_RADIUS * cosf(angle),
                           -straightW - CORNER_RADIUS * sinf(angle)});
    }
    // Bottom edge (negative Z, from +X to -X)
    for (int i = 1; i <= segments / 4; i++) {
        float t = static_cast<float>(i) / (segments / 4);
        boundary.push_back({straightL - t * 2.0f * straightL, -HALF_W});
    }
    // Bottom-left corner
    for (int i = 0; i <= segments / 4; i++) {
        float angle = PI / 2.0f * static_cast<float>(i) / (segments / 4);
        boundary.push_back({-straightL - CORNER_RADIUS * sinf(angle),
                           -straightW - CORNER_RADIUS * cosf(angle)});
    }
    // Left edge (negative X, from -Z to +Z)
    for (int i = 1; i <= segments / 4; i++) {
        float t = static_cast<float>(i) / (segments / 4);
        boundary.push_back({-HALF_L, -straightW + t * 2.0f * straightW});
    }
    // Top-left corner
    for (int i = 0; i <= segments / 4; i++) {
        float angle = PI / 2.0f * static_cast<float>(i) / (segments / 4);
        boundary.push_back({-straightL - CORNER_RADIUS * cosf(angle),
                           straightW + CORNER_RADIUS * sinf(angle)});
    }

    // Add boundary vertices
    for (auto& [bx, bz] : boundary) {
        verts.insert(verts.end(), {bx, y, bz, ir, ig, ib});
    }

    // Create fan triangles from center
    int n = static_cast<int>(boundary.size());
    for (int i = 0; i < n; i++) {
        idx.push_back(base);
        idx.push_back(base + 1 + i);
        idx.push_back(base + 1 + ((i + 1) % n));
    }
}

void IceRink::generateBoards(std::vector<float>& verts, std::vector<uint32_t>& idx) {
    // Board color: white/light gray
    float br = 0.95f, bg = 0.95f, bb = 0.95f;
    float y0 = 0.0f;
    float y1 = BOARD_HEIGHT;

    float straightL = HALF_L - CORNER_RADIUS;
    float straightW = HALF_W - CORNER_RADIUS;
    int segments = 64;

    // Generate boundary (same as ice surface)
    std::vector<std::pair<float, float>> boundary;

    // Same boundary generation as ice
    for (int i = 0; i <= segments / 4; i++) {
        float t = static_cast<float>(i) / (segments / 4);
        boundary.push_back({-straightL + t * 2.0f * straightL, HALF_W});
    }
    for (int i = 0; i <= segments / 4; i++) {
        float angle = PI / 2.0f * static_cast<float>(i) / (segments / 4);
        boundary.push_back({straightL + CORNER_RADIUS * sinf(angle),
                           straightW + CORNER_RADIUS * cosf(angle)});
    }
    for (int i = 1; i <= segments / 4; i++) {
        float t = static_cast<float>(i) / (segments / 4);
        boundary.push_back({HALF_L, straightW - t * 2.0f * straightW});
    }
    for (int i = 0; i <= segments / 4; i++) {
        float angle = PI / 2.0f * static_cast<float>(i) / (segments / 4);
        boundary.push_back({straightL + CORNER_RADIUS * cosf(angle),
                           -straightW - CORNER_RADIUS * sinf(angle)});
    }
    for (int i = 1; i <= segments / 4; i++) {
        float t = static_cast<float>(i) / (segments / 4);
        boundary.push_back({straightL - t * 2.0f * straightL, -HALF_W});
    }
    for (int i = 0; i <= segments / 4; i++) {
        float angle = PI / 2.0f * static_cast<float>(i) / (segments / 4);
        boundary.push_back({-straightL - CORNER_RADIUS * sinf(angle),
                           -straightW - CORNER_RADIUS * cosf(angle)});
    }
    for (int i = 1; i <= segments / 4; i++) {
        float t = static_cast<float>(i) / (segments / 4);
        boundary.push_back({-HALF_L, -straightW + t * 2.0f * straightW});
    }
    for (int i = 0; i <= segments / 4; i++) {
        float angle = PI / 2.0f * static_cast<float>(i) / (segments / 4);
        boundary.push_back({-straightL - CORNER_RADIUS * cosf(angle),
                           straightW + CORNER_RADIUS * sinf(angle)});
    }

    // Create wall quads along boundary
    uint32_t base = static_cast<uint32_t>(verts.size() / 6);
    int n = static_cast<int>(boundary.size());

    for (int i = 0; i < n; i++) {
        float bx = boundary[i].first;
        float bz = boundary[i].second;
        // Bottom vertex
        verts.insert(verts.end(), {bx, y0, bz, br, bg, bb});
        // Top vertex
        verts.insert(verts.end(), {bx, y1, bz, br, bg, bb});
    }

    for (int i = 0; i < n; i++) {
        int next = (i + 1) % n;
        uint32_t bl = base + i * 2;
        uint32_t tl = base + i * 2 + 1;
        uint32_t br2 = base + next * 2;
        uint32_t tr = base + next * 2 + 1;

        idx.push_back(bl); idx.push_back(br2); idx.push_back(tl);
        idx.push_back(tl); idx.push_back(br2); idx.push_back(tr);
    }
}

void IceRink::generateLine(float x1, float z1, float x2, float z2, float width,
                           float r, float g, float b,
                           std::vector<float>& verts, std::vector<uint32_t>& idx) {
    float y = 0.01f; // slightly above ice
    float dx = x2 - x1;
    float dz = z2 - z1;
    float len = sqrtf(dx * dx + dz * dz);
    if (len < 0.001f) return;

    float nx = -dz / len * width * 0.5f;
    float nz = dx / len * width * 0.5f;

    uint32_t base = static_cast<uint32_t>(verts.size() / 6);
    verts.insert(verts.end(), {x1 + nx, y, z1 + nz, r, g, b});
    verts.insert(verts.end(), {x1 - nx, y, z1 - nz, r, g, b});
    verts.insert(verts.end(), {x2 - nx, y, z2 - nz, r, g, b});
    verts.insert(verts.end(), {x2 + nx, y, z2 + nz, r, g, b});

    idx.push_back(base); idx.push_back(base + 1); idx.push_back(base + 2);
    idx.push_back(base); idx.push_back(base + 2); idx.push_back(base + 3);
}

void IceRink::generateCircle(float cx, float cz, float radius, float lineWidth,
                             float r, float g, float b, int segments,
                             std::vector<float>& verts, std::vector<uint32_t>& idx) {
    generateArc(cx, cz, radius, lineWidth, 0.0f, 2.0f * PI, r, g, b, segments, verts, idx);
}

void IceRink::generateArc(float cx, float cz, float radius, float lineWidth,
                          float startAngle, float endAngle,
                          float r, float g, float b, int segments,
                          std::vector<float>& verts, std::vector<uint32_t>& idx) {
    float y = 0.01f;
    float inner = radius - lineWidth * 0.5f;
    float outer = radius + lineWidth * 0.5f;

    uint32_t base = static_cast<uint32_t>(verts.size() / 6);

    for (int i = 0; i <= segments; i++) {
        float angle = startAngle + (endAngle - startAngle) * static_cast<float>(i) / segments;
        float cosA = cosf(angle);
        float sinA = sinf(angle);

        verts.insert(verts.end(), {cx + inner * cosA, y, cz + inner * sinA, r, g, b});
        verts.insert(verts.end(), {cx + outer * cosA, y, cz + outer * sinA, r, g, b});
    }

    for (int i = 0; i < segments; i++) {
        uint32_t a = base + i * 2;
        uint32_t b2 = base + i * 2 + 1;
        uint32_t c = base + (i + 1) * 2;
        uint32_t d = base + (i + 1) * 2 + 1;

        idx.push_back(a); idx.push_back(b2); idx.push_back(c);
        idx.push_back(c); idx.push_back(b2); idx.push_back(d);
    }
}

void IceRink::generateFilledCircle(float cx, float cz, float radius,
                                   float r, float g, float b, int segments,
                                   std::vector<float>& verts, std::vector<uint32_t>& idx) {
    float y = 0.01f;
    uint32_t base = static_cast<uint32_t>(verts.size() / 6);

    // Center
    verts.insert(verts.end(), {cx, y, cz, r, g, b});

    for (int i = 0; i <= segments; i++) {
        float angle = 2.0f * PI * static_cast<float>(i) / segments;
        verts.insert(verts.end(), {cx + radius * cosf(angle), y, cz + radius * sinf(angle), r, g, b});
    }

    for (int i = 0; i < segments; i++) {
        idx.push_back(base);
        idx.push_back(base + 1 + i);
        idx.push_back(base + 1 + ((i + 1) % (segments + 1)));
    }
}

void IceRink::generateCrease(float goalLineX, float r, float g, float b,
                             std::vector<float>& verts, std::vector<uint32_t>& idx) {
    // Goal crease: semicircle in front of goal
    float sign = (goalLineX > 0) ? -1.0f : 1.0f; // crease faces center
    float cx = goalLineX;
    float cz = 0.0f;

    // Semicircle arc (crease outline)
    float startAngle = (sign > 0) ? -PI / 2.0f : PI / 2.0f;
    float endAngle = startAngle + PI * sign;
    if (sign > 0) {
        generateArc(cx, cz, CREASE_RADIUS, THIN_LINE * 2.0f,
                    -PI / 2.0f, PI / 2.0f, r, g, b, 24, verts, idx);
    } else {
        generateArc(cx, cz, CREASE_RADIUS, THIN_LINE * 2.0f,
                    PI / 2.0f, 3.0f * PI / 2.0f, r, g, b, 24, verts, idx);
    }
}

void IceRink::generateAllMarkings(std::vector<float>& verts, std::vector<uint32_t>& idx) {
    // Colors
    float redR = 0.8f, redG = 0.1f, redB = 0.1f;
    float blueR = 0.1f, blueG = 0.2f, blueB = 0.7f;

    // Center red line (full width)
    generateLine(CENTER_X, -HALF_W, CENTER_X, HALF_W, LINE_WIDTH,
                 redR, redG, redB, verts, idx);

    // Blue lines
    generateLine(-BLUE_LINE_X, -HALF_W, -BLUE_LINE_X, HALF_W, LINE_WIDTH,
                 blueR, blueG, blueB, verts, idx);
    generateLine(BLUE_LINE_X, -HALF_W, BLUE_LINE_X, HALF_W, LINE_WIDTH,
                 blueR, blueG, blueB, verts, idx);

    // Goal lines (red, thin)
    generateLine(GOAL_LINE_X, -HALF_W + 2.0f, GOAL_LINE_X, HALF_W - 2.0f, THIN_LINE * 3.0f,
                 redR, redG, redB, verts, idx);
    generateLine(-GOAL_LINE_X, -HALF_W + 2.0f, -GOAL_LINE_X, HALF_W - 2.0f, THIN_LINE * 3.0f,
                 redR, redG, redB, verts, idx);

    // Center faceoff dot and circle
    generateFilledCircle(CENTER_X, 0.0f, 0.5f, blueR, blueG, blueB, 16, verts, idx);
    generateCircle(CENTER_X, 0.0f, FACEOFF_CIRCLE_R, THIN_LINE * 2.0f,
                   blueR, blueG, blueB, 48, verts, idx);

    // End zone faceoff circles and dots (4 total)
    float dotPositions[][2] = {
        { FACEOFF_DOT_X,  FACEOFF_DOT_Z},
        { FACEOFF_DOT_X, -FACEOFF_DOT_Z},
        {-FACEOFF_DOT_X,  FACEOFF_DOT_Z},
        {-FACEOFF_DOT_X, -FACEOFF_DOT_Z},
    };

    for (auto& pos : dotPositions) {
        // Red faceoff dot
        generateFilledCircle(pos[0], pos[1], 1.0f, redR, redG, redB, 16, verts, idx);
        // Red faceoff circle
        generateCircle(pos[0], pos[1], FACEOFF_CIRCLE_R, THIN_LINE * 2.0f,
                       redR, redG, redB, 48, verts, idx);
    }

    // Neutral zone dots (4 dots at blue line distance, no circles)
    float neutralDots[][2] = {
        { BLUE_LINE_X + 5.0f,  FACEOFF_DOT_Z},
        { BLUE_LINE_X + 5.0f, -FACEOFF_DOT_Z},
        {-BLUE_LINE_X - 5.0f,  FACEOFF_DOT_Z},
        {-BLUE_LINE_X - 5.0f, -FACEOFF_DOT_Z},
    };

    for (auto& pos : neutralDots) {
        generateFilledCircle(pos[0], pos[1], 1.0f, redR, redG, redB, 16, verts, idx);
    }

    // Center ice dot (already done above as center faceoff)

    // Goal creases (light blue fill)
    float creaseR = 0.6f, creaseG = 0.7f, creaseB = 0.9f;
    generateCrease(GOAL_LINE_X, creaseR, creaseG, creaseB, verts, idx);
    generateCrease(-GOAL_LINE_X, creaseR, creaseG, creaseB, verts, idx);
}

void IceRink::render(const glm::mat4& view, const glm::mat4& proj) {
    shader_.use();
    shader_.setMat4("u_view", view);
    shader_.setMat4("u_projection", proj);

    // 1) Draw ice surface + boards
    if (indexCount_ > 0) {
        glBindVertexArray(vao_);
        glDrawElements(GL_TRIANGLES, indexCount_, GL_UNSIGNED_INT, 0);
        glBindVertexArray(0);
    }

    // 2) Draw markings — disable face culling (marking triangles face downward)
    if (markingsIndexCount_ > 0) {
        glDisable(GL_CULL_FACE);
        glEnable(GL_POLYGON_OFFSET_FILL);
        glPolygonOffset(-1.0f, -1.0f);
        glBindVertexArray(markingsVao_);
        glDrawElements(GL_TRIANGLES, markingsIndexCount_, GL_UNSIGNED_INT, 0);
        glBindVertexArray(0);
        glDisable(GL_POLYGON_OFFSET_FILL);
        glEnable(GL_CULL_FACE);
    }
}

void IceRink::destroy() {
    shader_.destroy();
    if (ebo_) { glDeleteBuffers(1, &ebo_); ebo_ = 0; }
    if (vbo_) { glDeleteBuffers(1, &vbo_); vbo_ = 0; }
    if (vao_) { glDeleteVertexArrays(1, &vao_); vao_ = 0; }
    indexCount_ = 0;
    if (markingsEbo_) { glDeleteBuffers(1, &markingsEbo_); markingsEbo_ = 0; }
    if (markingsVbo_) { glDeleteBuffers(1, &markingsVbo_); markingsVbo_ = 0; }
    if (markingsVao_) { glDeleteVertexArrays(1, &markingsVao_); markingsVao_ = 0; }
    markingsIndexCount_ = 0;
}
