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

# Compile flags for Emscripten (USE_ZLIB needed for libdeflate wrapper)
target_compile_options(renderer PRIVATE -sUSE_ZLIB=1)

# Emscripten link flags
set_target_properties(renderer PROPERTIES
    SUFFIX ".js"
    LINK_FLAGS "\
        -s USE_WEBGL2=1 \
        -s FULL_ES3=1 \
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
