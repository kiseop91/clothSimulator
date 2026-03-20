cmake_minimum_required(VERSION 3.20)
project(renderer)
set(CMAKE_CXX_STANDARD 17)

# Source files
file(GLOB_RECURSE SOURCES "src/*.cpp")

# Add OpenFBX and libdeflate sources
list(APPEND SOURCES
    "third_party/openfbx/ofbx.cpp"
    "third_party/openfbx/libdeflate.cpp"
)

add_executable(renderer ${SOURCES})

target_include_directories(renderer PRIVATE
    src
    third_party/tinyobjloader
    third_party/tinygltf
    third_party/openfbx
    third_party/glm
)

# Note: TINYOBJLOADER_IMPLEMENTATION, TINYGLTF_IMPLEMENTATION, STB_IMAGE_IMPLEMENTATION,
# STB_IMAGE_WRITE_IMPLEMENTATION are defined in individual .cpp files to avoid ODR violations

# Compile flags for Emscripten
target_compile_options(renderer PRIVATE -sUSE_ZLIB=1 --use-port=emdawnwebgpu)

# Emscripten link flags
set_target_properties(renderer PROPERTIES
    SUFFIX ".js"
    LINK_FLAGS "\
        --use-port=emdawnwebgpu \
        -s USE_ZLIB=1 \
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

# ── Headless simulation test binary (Node.js, no WebGPU) ──
file(GLOB SIM_TEST_SOURCES
    "src/simulation/*.cpp"
    "src/loaders/*.cpp"
)
list(APPEND SIM_TEST_SOURCES
    "test/sim_test.cpp"
    "third_party/openfbx/ofbx.cpp"
    "third_party/openfbx/libdeflate.cpp"
)
# Remove GPU solver (requires WebGPU)
list(FILTER SIM_TEST_SOURCES EXCLUDE REGEX "GpuClothSolver")

add_executable(sim_test ${SIM_TEST_SOURCES})
target_include_directories(sim_test PRIVATE
    src
    third_party/tinyobjloader
    third_party/tinygltf
    third_party/openfbx
    third_party/glm
)
target_compile_options(sim_test PRIVATE -sUSE_ZLIB=1)
set_target_properties(sim_test PROPERTIES
    SUFFIX ".js"
    LINK_FLAGS "\
        -s USE_ZLIB=1 \
        -s MODULARIZE=0 \
        -s ALLOW_MEMORY_GROWTH=1 \
        -s INITIAL_MEMORY=67108864 \
        -s ENVIRONMENT='node' \
        -s EXIT_RUNTIME=1 \
        -s NODERAWFS=1 \
        -O2 \
    "
)
