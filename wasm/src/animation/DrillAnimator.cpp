#include "animation/DrillAnimator.h"
#include "scene/Scene.h"
#include "mesh/Mesh.h"
#include <emscripten.h>

void DrillAnimator::setAnimations(const float* data, int count) {
    anims_.clear();
    emscripten_log(EM_LOG_CONSOLE, "[Animator] setAnimations: %d floats", count);
    int i = 0;
    while (i + 2 <= count) {
        Anim anim;
        anim.meshIdx = static_cast<int>(data[i]);
        int numWP = static_cast<int>(data[i + 1]);
        i += 2;

        if (i + numWP * 3 > count) break;

        for (int j = 0; j < numWP; j++) {
            Waypoint wp;
            wp.x = data[i + j * 3];
            wp.z = data[i + j * 3 + 1];
            wp.t = data[i + j * 3 + 2];
            anim.waypoints.push_back(wp);
        }
        i += numWP * 3;
        anims_.push_back(anim);
    }
    emscripten_log(EM_LOG_CONSOLE, "[Animator] parsed %d animations", (int)anims_.size());
    for (const auto& a : anims_) {
        emscripten_log(EM_LOG_CONSOLE, "[Animator]   meshIdx=%d, %d waypoints",
                       a.meshIdx, (int)a.waypoints.size());
        for (const auto& wp : a.waypoints) {
            emscripten_log(EM_LOG_CONSOLE, "[Animator]     wp: x=%.1f z=%.1f t=%.3f", wp.x, wp.z, wp.t);
        }
    }
}

void DrillAnimator::setTime(float t) {
    time_ = t;
    if (time_ < 0.0f) time_ = 0.0f;
    if (time_ > 1.0f) time_ = 1.0f;
}

void DrillAnimator::update(Scene& scene) {
    static int logCount = 0;
    const auto& meshes = scene.getMeshes();

    for (const auto& anim : anims_) {
        if (anim.meshIdx < 0 || anim.meshIdx >= static_cast<int>(meshes.size())) continue;
        if (anim.waypoints.empty()) continue;

        // Find the two waypoints we're between
        float x, z;
        if (time_ <= anim.waypoints.front().t) {
            x = anim.waypoints.front().x;
            z = anim.waypoints.front().z;
        } else if (time_ >= anim.waypoints.back().t) {
            x = anim.waypoints.back().x;
            z = anim.waypoints.back().z;
        } else {
            // Linear interpolation
            x = anim.waypoints.back().x;
            z = anim.waypoints.back().z;
            for (size_t i = 0; i + 1 < anim.waypoints.size(); i++) {
                if (time_ >= anim.waypoints[i].t && time_ <= anim.waypoints[i + 1].t) {
                    float dt = anim.waypoints[i + 1].t - anim.waypoints[i].t;
                    float frac = (dt > 0.0001f) ? (time_ - anim.waypoints[i].t) / dt : 0.0f;
                    x = anim.waypoints[i].x + (anim.waypoints[i + 1].x - anim.waypoints[i].x) * frac;
                    z = anim.waypoints[i].z + (anim.waypoints[i + 1].z - anim.waypoints[i].z) * frac;
                    break;
                }
            }
        }

        if (logCount < 10) {
            emscripten_log(EM_LOG_CONSOLE, "[Animator] update t=%.3f, mesh %d → (%.1f, %.1f), meshCount=%d",
                           time_, anim.meshIdx, x, z, (int)meshes.size());
            logCount++;
        }

        // Apply position to mesh (Y stays at current mesh Y)
        Mesh* mesh = meshes[anim.meshIdx];
        glm::vec3 pos = mesh->getMeshPosition();
        mesh->setMeshPosition(x, pos.y, z);
    }
}

void DrillAnimator::clear() {
    anims_.clear();
    time_ = 0.0f;
}
