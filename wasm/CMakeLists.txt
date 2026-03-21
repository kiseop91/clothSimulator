cmake_minimum_required(VERSION 3.20)
project(renderer)
set(CMAKE_CXX_STANDARD 17)

# Source files - explicit list (no simulation, no model loaders)
set(SOURCES
    src/main.cpp
    src/renderer/Renderer.cpp
    src/renderer/Shader.cpp
    src/scene/Scene.cpp
    src/scene/Camera.cpp
    src/scene/Grid.cpp
    src/mesh/Mesh.cpp
    src/material/Material.cpp
    src/rink/IceRink.cpp
    src/rink/DrillToken.cpp
    src/rink/PathRenderer.cpp
    src/animation/DrillAnimator.cpp
)

add_executable(renderer ${SOURCES})

target_include_directories(renderer PRIVATE
    src
    third_party/glm
)

# Emscripten link flags
set_target_properties(renderer PROPERTIES
    SUFFIX ".js"
    LINK_FLAGS "\
        -s USE_WEBGL2=1 \
        -s FULL_ES3=1 \
        -s MODULARIZE=1 \
        -s EXPORT_NAME='createRenderer' \
        -s ALLOW_MEMORY_GROWTH=1 \
        -s INITIAL_MEMORY=67108864 \
        -s ENVIRONMENT='web' \
        -s EXPORTED_RUNTIME_METHODS=['ccall','cwrap','HEAPU8'] \
        --bind \
        -s NO_EXIT_RUNTIME=1 \
        -O2 \
    "
)
