#include "loaders/ModelLoader.h"
#include "loaders/ObjLoader.h"
#include "loaders/GltfLoader.h"
#include "loaders/FbxLoader.h"
#include <algorithm>
#include <emscripten.h>

LoadResult ModelLoader::load(const uint8_t* data, size_t size, const std::string& ext) {
    std::string lower = ext;
    std::transform(lower.begin(), lower.end(), lower.begin(), ::tolower);

    if (lower == ".obj" || lower == "obj") {
        emscripten_log(EM_LOG_CONSOLE, "Loading OBJ model (%zu bytes)", size);
        return ObjLoader::load(data, size);
    }
    else if (lower == ".gltf" || lower == "gltf" ||
             lower == ".glb" || lower == "glb") {
        emscripten_log(EM_LOG_CONSOLE, "Loading glTF model (%zu bytes)", size);
        return GltfLoader::load(data, size, lower);
    }
    else if (lower == ".fbx" || lower == "fbx") {
        emscripten_log(EM_LOG_CONSOLE, "Loading FBX model (%zu bytes)", size);
        return FbxLoader::load(data, size);
    }

    emscripten_log(EM_LOG_ERROR, "Unsupported model format: %s", ext.c_str());
    return {};
}
