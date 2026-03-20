#include "simulation/ClothSimulation.h"
#include "simulation/CollisionBody.h"
#include "loaders/ModelLoader.h"
#include <cstdio>
#include <cstring>
#include <cmath>
#include <fstream>
#include <vector>
#include <string>

// ─── Utility ─────────────────────────────────────────────────────────────

struct TestResult {
    std::string name;
    bool passed;
    int settleFrame;       // -1 if not settled
    int totalFrames;
    float finalMaxVel;
    float finalAvgStretch;
    float finalMaxStretch;
    float finalLowestY;
    float finalEnergy;
    std::string failReason;
};

static std::vector<TestResult> g_results;

void printJSON(const char* scenario, int frame, ClothSimulation& sim, const char* tag = "") {
    glm::vec3 aabbMin, aabbMax;
    sim.getAABB(aabbMin, aabbMax);
    printf("{\"scenario\":\"%s\",\"tag\":\"%s\",\"frame\":%d,"
           "\"maxVel\":%.6f,\"avgVel\":%.6f,\"energy\":%.4f,"
           "\"settled\":%s,\"lowestY\":%.4f,"
           "\"avgStretch\":%.6f,\"maxStretch\":%.6f,"
           "\"aabbMin\":[%.3f,%.3f,%.3f],\"aabbMax\":[%.3f,%.3f,%.3f],"
           "\"particles\":%d,\"springs\":%d}\n",
           scenario, tag, frame,
           sim.getMaxVelocity(), sim.getAvgVelocity(), sim.getKineticEnergy(),
           sim.isSettled() ? "true" : "false", sim.getLowestY(),
           sim.getAvgStretchRatio(), sim.getMaxStretchRatio(),
           aabbMin.x, aabbMin.y, aabbMin.z,
           aabbMax.x, aabbMax.y, aabbMax.z,
           sim.getParticleCount(), sim.getSpringCount());
}

// Run simulation for N frames, report at intervals, return settle frame (-1 if not)
int runSim(ClothSimulation& sim, int maxFrames, const char* name,
           int reportInterval = 50, int settleSkip = 30) {
    double t = 0.0;
    int settleFrame = -1;
    for (int frame = 0; frame < maxFrames; frame++) {
        t += 16.0;
        sim.step(t);

        // Explosion detection
        float mv = sim.getMaxVelocity();
        if (std::isnan(mv) || std::isinf(mv) || mv > 500.0f) {
            printJSON(name, frame, sim, "EXPLODED");
            return -2; // explosion
        }

        if (frame % reportInterval == 0) {
            printJSON(name, frame, sim);
        }
        if (frame > settleSkip && sim.isSettled(0.01f) && settleFrame < 0) {
            settleFrame = frame;
            printJSON(name, frame, sim, "SETTLED");
        }
    }
    if (settleFrame < 0) {
        printJSON(name, maxFrames - 1, sim, "END");
    }
    return settleFrame;
}

// ─── Test Scenarios ──────────────────────────────────────────────────────

// 1. Hanging cloth — top edge pinned, gravity drape
void test_hanging_xpbd() {
    ClothSimulation sim;
    sim.init(2.0f, 2.0f, 30, 30);  // XPBD default
    sim.setRunning(true);

    int sf = runSim(sim, 300, "hanging_xpbd");

    TestResult r;
    r.name = "hanging_xpbd";
    r.totalFrames = 300;
    r.settleFrame = sf;
    r.finalMaxVel = sim.getMaxVelocity();
    r.finalAvgStretch = sim.getAvgStretchRatio();
    r.finalMaxStretch = sim.getMaxStretchRatio();
    r.finalLowestY = sim.getLowestY();
    r.finalEnergy = sim.getKineticEnergy();

    // Pass criteria — XPBD Jacobi has inherent stretch on hanging cloth (gravity load)
    r.passed = (sf > 0) && (r.finalMaxStretch < 0.6f) && (r.finalLowestY >= 0.0f);
    if (sf < 0) r.failReason = sf == -2 ? "EXPLODED" : "NOT_SETTLED";
    else if (r.finalMaxStretch >= 0.6f) r.failReason = "STRETCH_TOO_HIGH";
    g_results.push_back(r);
}

void test_hanging_verlet() {
    ClothSimulation sim;
    sim.setSolverMode(SolverMode::VERLET);
    sim.init(2.0f, 2.0f, 30, 30);
    sim.setRunning(true);

    int sf = runSim(sim, 300, "hanging_verlet");

    TestResult r;
    r.name = "hanging_verlet";
    r.totalFrames = 300;
    r.settleFrame = sf;
    r.finalMaxVel = sim.getMaxVelocity();
    r.finalAvgStretch = sim.getAvgStretchRatio();
    r.finalMaxStretch = sim.getMaxStretchRatio();
    r.finalLowestY = sim.getLowestY();
    r.finalEnergy = sim.getKineticEnergy();

    r.passed = (sf > 0) && (r.finalMaxStretch < 0.8f) && (r.finalLowestY >= 0.0f);
    if (sf < 0) r.failReason = sf == -2 ? "EXPLODED" : "NOT_SETTLED";
    else if (r.finalMaxStretch >= 0.8f) r.failReason = "STRETCH_TOO_HIGH";
    g_results.push_back(r);
}

// 2. Drop on sphere — cloth falls onto collision sphere
void test_drop_sphere() {
    ClothSimulation sim;
    sim.initHorizontal(2.0f, 2.0f, 30, 30, 2.0f);
    sim.addCollider(CollisionBody(glm::vec3(0.0f, 0.5f, 0.0f), 0.5f));
    sim.setDamping(0.05f);
    sim.setRunning(true);

    int sf = runSim(sim, 1000, "drop_sphere");

    TestResult r;
    r.name = "drop_sphere";
    r.totalFrames = 1000;
    r.settleFrame = sf;
    r.finalMaxVel = sim.getMaxVelocity();
    r.finalAvgStretch = sim.getAvgStretchRatio();
    r.finalMaxStretch = sim.getMaxStretchRatio();
    r.finalLowestY = sim.getLowestY();
    r.finalEnergy = sim.getKineticEnergy();

    // Cloth should drape over sphere, lowestY near ground (0.005)
    r.passed = (sf > 0) && (r.finalLowestY >= 0.0f);
    if (sf == -2) r.failReason = "EXPLODED";
    else if (sf < 0) r.failReason = "NOT_SETTLED";
    else if (r.finalLowestY < 0.0f) r.failReason = "PENETRATED_GROUND";
    g_results.push_back(r);
}

// 3. Drop on two spheres — tests draping across gap
void test_drop_two_spheres() {
    ClothSimulation sim;
    sim.initHorizontal(3.0f, 3.0f, 30, 30, 2.5f);
    sim.addCollider(CollisionBody(glm::vec3(-0.8f, 0.5f, 0.0f), 0.4f));
    sim.addCollider(CollisionBody(glm::vec3(0.8f, 0.5f, 0.0f), 0.4f));
    sim.setDamping(0.05f);
    sim.setRunning(true);

    int sf = runSim(sim, 1000, "drop_two_spheres");

    TestResult r;
    r.name = "drop_two_spheres";
    r.totalFrames = 500;
    r.settleFrame = sf;
    r.finalMaxVel = sim.getMaxVelocity();
    r.finalAvgStretch = sim.getAvgStretchRatio();
    r.finalMaxStretch = sim.getMaxStretchRatio();
    r.finalLowestY = sim.getLowestY();
    r.finalEnergy = sim.getKineticEnergy();

    r.passed = (sf > 0) && (r.finalLowestY >= 0.0f);
    if (sf == -2) r.failReason = "EXPLODED";
    else if (sf < 0) r.failReason = "NOT_SETTLED";
    g_results.push_back(r);
}

// 4. High-res cloth — performance/stability stress test
void test_highres() {
    ClothSimulation sim;
    sim.init(2.0f, 2.0f, 50, 50);  // 2500 particles
    sim.setRunning(true);

    int sf = runSim(sim, 200, "highres_50x50", 50);

    TestResult r;
    r.name = "highres_50x50";
    r.totalFrames = 200;
    r.settleFrame = sf;
    r.finalMaxVel = sim.getMaxVelocity();
    r.finalAvgStretch = sim.getAvgStretchRatio();
    r.finalMaxStretch = sim.getMaxStretchRatio();
    r.finalLowestY = sim.getLowestY();
    r.finalEnergy = sim.getKineticEnergy();

    r.passed = (sf != -2); // just don't explode
    if (sf == -2) r.failReason = "EXPLODED";
    g_results.push_back(r);
}

// 5. Wind test — stability under external force
void test_wind() {
    ClothSimulation sim;
    sim.init(2.0f, 2.0f, 25, 25);
    sim.setWindForce(2.0f, 0.0f, 1.0f);
    sim.setRunning(true);

    int sf = runSim(sim, 300, "wind");

    TestResult r;
    r.name = "wind";
    r.totalFrames = 300;
    r.settleFrame = sf;
    r.finalMaxVel = sim.getMaxVelocity();
    r.finalAvgStretch = sim.getAvgStretchRatio();
    r.finalMaxStretch = sim.getMaxStretchRatio();
    r.finalLowestY = sim.getLowestY();
    r.finalEnergy = sim.getKineticEnergy();

    // Wind keeps cloth moving — settle not expected, just no explosion
    r.passed = (sf != -2) && (r.finalMaxStretch < 1.0f);
    if (sf == -2) r.failReason = "EXPLODED";
    else if (r.finalMaxStretch >= 1.0f) r.failReason = "STRETCH_TOO_HIGH";
    g_results.push_back(r);
}

// 6. Strong gravity — stability under extreme force
void test_strong_gravity() {
    ClothSimulation sim;
    sim.init(2.0f, 2.0f, 25, 25);
    sim.setGravity(0.0f, -50.0f, 0.0f);  // 5x normal gravity
    sim.setRunning(true);

    int sf = runSim(sim, 200, "strong_gravity");

    TestResult r;
    r.name = "strong_gravity";
    r.totalFrames = 200;
    r.settleFrame = sf;
    r.finalMaxVel = sim.getMaxVelocity();
    r.finalAvgStretch = sim.getAvgStretchRatio();
    r.finalMaxStretch = sim.getMaxStretchRatio();
    r.finalLowestY = sim.getLowestY();
    r.finalEnergy = sim.getKineticEnergy();

    r.passed = (sf != -2) && (r.finalMaxStretch < 1.5f);
    if (sf == -2) r.failReason = "EXPLODED";
    else if (r.finalMaxStretch >= 1.5f) r.failReason = "STRETCH_TOO_HIGH";
    g_results.push_back(r);
}

// 7. XPBD compliance sweep — varying stiffness
void test_xpbd_compliance_sweep() {
    struct Config {
        float stretch, shear, bend;
        const char* label;
    };
    Config configs[] = {
        {0.0f,    0.0f,    0.0f,    "rigid"},
        {0.0f,    0.0001f, 0.01f,   "default"},
        {0.001f,  0.001f,  0.1f,    "soft"},
        {0.01f,   0.01f,   1.0f,    "very_soft"},
        {0.0f,    0.0f,    0.001f,  "stiff_no_bend"},
    };
    for (auto& cfg : configs) {
        ClothSimulation sim;
        sim.init(2.0f, 2.0f, 20, 20); // XPBD by default
        sim.setStretchCompliance(cfg.stretch);
        sim.setShearCompliance(cfg.shear);
        sim.setBendCompliance(cfg.bend);
        sim.setRunning(true);

        char name[64];
        snprintf(name, sizeof(name), "xpbd_%s", cfg.label);
        int sf = runSim(sim, 200, name, 100);

        TestResult r;
        r.name = name;
        r.totalFrames = 200;
        r.settleFrame = sf;
        r.finalMaxVel = sim.getMaxVelocity();
        r.finalAvgStretch = sim.getAvgStretchRatio();
        r.finalMaxStretch = sim.getMaxStretchRatio();
        r.finalLowestY = sim.getLowestY();
        r.finalEnergy = sim.getKineticEnergy();

        r.passed = (sf != -2);
        if (sf == -2) r.failReason = "EXPLODED";
        g_results.push_back(r);
    }
}

// 8. Substep sweep — how substep count affects quality
void test_substep_sweep() {
    int substeps[] = {1, 5, 10, 20, 40};
    for (int ns : substeps) {
        ClothSimulation sim;
        sim.init(2.0f, 2.0f, 20, 20);
        sim.setNumSubsteps(ns);
        sim.setRunning(true);

        char name[64];
        snprintf(name, sizeof(name), "substeps_%d", ns);
        int sf = runSim(sim, 200, name, 100);

        TestResult r;
        r.name = name;
        r.totalFrames = 200;
        r.settleFrame = sf;
        r.finalMaxVel = sim.getMaxVelocity();
        r.finalAvgStretch = sim.getAvgStretchRatio();
        r.finalMaxStretch = sim.getMaxStretchRatio();
        r.finalLowestY = sim.getLowestY();
        r.finalEnergy = sim.getKineticEnergy();

        r.passed = (sf != -2) && (r.finalMaxStretch < 1.0f);
        if (sf == -2) r.failReason = "EXPLODED";
        else if (r.finalMaxStretch >= 1.0f) r.failReason = "STRETCH_TOO_HIGH";
        g_results.push_back(r);
    }
}

// 9. Damping sweep
void test_damping_sweep() {
    float dampings[] = {0.0f, 0.01f, 0.03f, 0.05f, 0.1f};
    for (float d : dampings) {
        ClothSimulation sim;
        sim.init(2.0f, 2.0f, 20, 20);
        sim.setDamping(d);
        sim.setRunning(true);

        char name[64];
        snprintf(name, sizeof(name), "damping_%.3f", d);
        int sf = runSim(sim, 200, name, 100);

        TestResult r;
        r.name = name;
        r.totalFrames = 200;
        r.settleFrame = sf;
        r.finalMaxVel = sim.getMaxVelocity();
        r.finalAvgStretch = sim.getAvgStretchRatio();
        r.finalMaxStretch = sim.getMaxStretchRatio();
        r.finalLowestY = sim.getLowestY();
        r.finalEnergy = sim.getKineticEnergy();

        r.passed = (sf != -2);
        if (sf == -2) r.failReason = "EXPLODED";
        g_results.push_back(r);
    }
}

// 10. Tuned XPBD hanging — higher substeps to reduce stretch
void test_hanging_xpbd_tuned() {
    // Test different substep counts for hanging XPBD
    int substepConfigs[] = {20, 30, 40, 60};
    for (int ns : substepConfigs) {
        ClothSimulation sim;
        sim.init(2.0f, 2.0f, 30, 30);
        sim.setNumSubsteps(ns);
        sim.setRunning(true);

        char name[64];
        snprintf(name, sizeof(name), "hang_xpbd_sub%d", ns);
        int sf = runSim(sim, 300, name, 100);

        TestResult r;
        r.name = name;
        r.totalFrames = 300;
        r.settleFrame = sf;
        r.finalMaxVel = sim.getMaxVelocity();
        r.finalAvgStretch = sim.getAvgStretchRatio();
        r.finalMaxStretch = sim.getMaxStretchRatio();
        r.finalLowestY = sim.getLowestY();
        r.finalEnergy = sim.getKineticEnergy();
        r.passed = (sf > 0) && (r.finalMaxStretch < 0.6f);
        if (sf == -2) r.failReason = "EXPLODED";
        else if (sf < 0) r.failReason = "NOT_SETTLED";
        else if (r.finalMaxStretch >= 0.6f) r.failReason = "STRETCH_TOO_HIGH";
        g_results.push_back(r);
    }
}

// 11. Constraint iteration sweep — how many Jacobi iters help
void test_constraint_iter_sweep() {
    // Temporarily need to expose constraintIters_ — use setConstraintIterations
    int iters[] = {1, 2, 3, 5};
    for (int ci : iters) {
        ClothSimulation sim;
        sim.init(2.0f, 2.0f, 30, 30);
        sim.setConstraintIterations(ci);
        sim.setRunning(true);

        char name[64];
        snprintf(name, sizeof(name), "xpbd_iter%d", ci);
        int sf = runSim(sim, 200, name, 100);

        TestResult r;
        r.name = name;
        r.totalFrames = 200;
        r.settleFrame = sf;
        r.finalMaxVel = sim.getMaxVelocity();
        r.finalAvgStretch = sim.getAvgStretchRatio();
        r.finalMaxStretch = sim.getMaxStretchRatio();
        r.finalLowestY = sim.getLowestY();
        r.finalEnergy = sim.getKineticEnergy();
        r.passed = (sf != -2);
        if (sf == -2) r.failReason = "EXPLODED";
        g_results.push_back(r);
    }
}

// 12. Drop sphere with XPBD — compare to Verlet
void test_drop_sphere_xpbd() {
    ClothSimulation sim;
    sim.initHorizontal(2.0f, 2.0f, 30, 30, 2.0f);
    sim.addCollider(CollisionBody(glm::vec3(0.0f, 0.5f, 0.0f), 0.5f));
    sim.setDamping(0.03f);
    sim.setRunning(true);

    int sf = runSim(sim, 1000, "drop_sphere_xpbd");

    TestResult r;
    r.name = "drop_sphere_xpbd";
    r.totalFrames = 1000;
    r.settleFrame = sf;
    r.finalMaxVel = sim.getMaxVelocity();
    r.finalAvgStretch = sim.getAvgStretchRatio();
    r.finalMaxStretch = sim.getMaxStretchRatio();
    r.finalLowestY = sim.getLowestY();
    r.finalEnergy = sim.getKineticEnergy();
    r.passed = (sf > 0) && (r.finalLowestY >= 0.0f);
    if (sf == -2) r.failReason = "EXPLODED";
    else if (sf < 0) r.failReason = "NOT_SETTLED";
    g_results.push_back(r);
}

// 12. Mesh collision — GLB file
void test_drop_mesh(const char* filepath) {
    std::ifstream file(filepath, std::ios::binary);
    if (!file) {
        printf("{\"error\":\"cannot open %s\"}\n", filepath);
        return;
    }
    std::vector<uint8_t> data((std::istreambuf_iterator<char>(file)),
                               std::istreambuf_iterator<char>());
    std::string path(filepath);
    std::string ext = path.substr(path.rfind('.'));

    LoadResult result = ModelLoader::load(data.data(), data.size(), ext);
    if (result.meshes.empty()) {
        printf("{\"error\":\"no meshes in %s\"}\n", filepath);
        return;
    }

    // Compute mesh AABB to position cloth above it
    glm::vec3 meshMin(1e30f), meshMax(-1e30f);
    int totalTris = 0;
    for (auto& md : result.meshes) {
        for (auto& v : md.vertices) {
            meshMin = glm::min(meshMin, v.position);
            meshMax = glm::max(meshMax, v.position);
        }
        totalTris += static_cast<int>(md.indices.size()) / 3;
    }
    printf("{\"info\":\"mesh_aabb\",\"min\":[%.3f,%.3f,%.3f],\"max\":[%.3f,%.3f,%.3f],\"tris\":%d}\n",
           meshMin.x, meshMin.y, meshMin.z, meshMax.x, meshMax.y, meshMax.z, totalTris);

    // Size cloth to cover mesh
    glm::vec3 meshSize = meshMax - meshMin;
    float clothW = std::max(meshSize.x, meshSize.z) * 1.5f;
    float dropH = meshMax.y + meshSize.y * 0.5f + 1.0f;

    ClothSimulation sim;
    sim.initHorizontal(clothW, clothW, 30, 30, dropH);
    // Center cloth over mesh
    glm::vec3 meshCenter = (meshMin + meshMax) * 0.5f;
    sim.translateAll(meshCenter.x, 0.0f, meshCenter.z);

    for (auto& md : result.meshes) {
        sim.addMeshCollider(md);
    }
    sim.setRunning(true);

    int sf = runSim(sim, 500, "drop_mesh", 50, 60);

    TestResult r;
    r.name = "drop_mesh";
    r.totalFrames = 500;
    r.settleFrame = sf;
    r.finalMaxVel = sim.getMaxVelocity();
    r.finalAvgStretch = sim.getAvgStretchRatio();
    r.finalMaxStretch = sim.getMaxStretchRatio();
    r.finalLowestY = sim.getLowestY();
    r.finalEnergy = sim.getKineticEnergy();

    // lowestY should be above mesh bottom (not penetrating)
    r.passed = (sf != -2) && (r.finalLowestY > meshMin.y - 0.5f);
    if (sf == -2) r.failReason = "EXPLODED";
    else if (r.finalLowestY <= meshMin.y - 0.5f) r.failReason = "MESH_PENETRATION";
    else if (sf < 0) r.failReason = "NOT_SETTLED";
    g_results.push_back(r);
}

// ─── Summary Report ──────────────────────────────────────────────────────

void printSummary() {
    printf("\n========== TEST SUMMARY ==========\n");
    int passed = 0, failed = 0;
    for (auto& r : g_results) {
        const char* status = r.passed ? "PASS" : "FAIL";
        if (r.passed) passed++; else failed++;
        printf("[%s] %-25s settle=%3d/%d  maxVel=%.4f  avgStr=%.4f  maxStr=%.4f  lowY=%.3f",
               status, r.name.c_str(), r.settleFrame, r.totalFrames,
               r.finalMaxVel, r.finalAvgStretch, r.finalMaxStretch, r.finalLowestY);
        if (!r.passed) printf("  reason=%s", r.failReason.c_str());
        printf("\n");
    }
    printf("==================================\n");
    printf("TOTAL: %d passed, %d failed, %d total\n", passed, failed, (int)g_results.size());
    printf("==================================\n");
}

// ─── Main ────────────────────────────────────────────────────────────────

int main(int argc, char** argv) {
    const char* scenario = argc > 1 ? argv[1] : "all";
    const char* meshPath = argc > 2 ? argv[2] : nullptr;

    if (strcmp(scenario, "all") == 0 || strcmp(scenario, "basic") == 0) {
        test_hanging_xpbd();
        test_hanging_verlet();
        test_drop_sphere();
        test_drop_two_spheres();
    }
    if (strcmp(scenario, "all") == 0 || strcmp(scenario, "stress") == 0) {
        test_highres();
        test_wind();
        test_strong_gravity();
    }
    if (strcmp(scenario, "all") == 0 || strcmp(scenario, "sweep") == 0) {
        test_xpbd_compliance_sweep();
        test_substep_sweep();
        test_damping_sweep();
    }
    if (strcmp(scenario, "all") == 0 || strcmp(scenario, "drape") == 0) {
        test_hanging_xpbd_tuned();
        test_constraint_iter_sweep();
        test_drop_sphere_xpbd();
    }
    if (strcmp(scenario, "drop_mesh") == 0 && meshPath) {
        test_drop_mesh(meshPath);
    }

    printSummary();
    return 0;
}
