#!/bin/bash
# Download third-party dependencies for WASM 3D renderer
# Run this script from the wasm/third_party/ directory

set -e
BASEDIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Downloading tinyobjloader ==="
curl -fsSL -o "$BASEDIR/tinyobjloader/tiny_obj_loader.h" \
  "https://raw.githubusercontent.com/tinyobjloader/tinyobjloader/release/tiny_obj_loader.h"

echo "=== Downloading tinygltf ==="
curl -fsSL -o "$BASEDIR/tinygltf/tiny_gltf.h" \
  "https://raw.githubusercontent.com/syoyo/tinygltf/release/tiny_gltf.h"

echo "=== Downloading nlohmann/json ==="
curl -fsSL -o "$BASEDIR/tinygltf/json.hpp" \
  "https://raw.githubusercontent.com/nlohmann/json/develop/single_include/nlohmann/json.hpp"

echo "=== Downloading stb_image ==="
curl -fsSL -o "$BASEDIR/tinygltf/stb_image.h" \
  "https://raw.githubusercontent.com/nothings/stb/master/stb_image.h"

echo "=== Downloading stb_image_write ==="
curl -fsSL -o "$BASEDIR/tinygltf/stb_image_write.h" \
  "https://raw.githubusercontent.com/nothings/stb/master/stb_image_write.h"

echo "=== Downloading OpenFBX ==="
curl -fsSL -o "$BASEDIR/openfbx/ofbx.h" \
  "https://raw.githubusercontent.com/nem0/OpenFBX/master/src/ofbx.h"
curl -fsSL -o "$BASEDIR/openfbx/ofbx.cpp" \
  "https://raw.githubusercontent.com/nem0/OpenFBX/master/src/ofbx.cpp"
curl -fsSL -o "$BASEDIR/openfbx/libdeflate.h" \
  "https://raw.githubusercontent.com/nem0/OpenFBX/master/src/libdeflate.h"
curl -fsSL -o "$BASEDIR/openfbx/libdeflate.cpp" \
  "https://raw.githubusercontent.com/nem0/OpenFBX/master/src/libdeflate.cpp"

echo "=== Downloading GLM ==="
curl -fsSL -o "$BASEDIR/glm/glm.zip" \
  "https://github.com/g-truc/glm/releases/download/1.0.1/glm-1.0.1-light.zip"
cd "$BASEDIR/glm"
unzip -o glm.zip
# Move contents so #include <glm/glm.hpp> works
if [ -d "$BASEDIR/glm/glm" ]; then
  echo "GLM extracted correctly - glm/glm.hpp should be available"
else
  echo "WARNING: GLM directory structure may need adjustment"
  ls -la "$BASEDIR/glm/"
fi
rm -f glm.zip

echo ""
echo "=== Verifying downloads ==="
FILES=(
  "$BASEDIR/tinyobjloader/tiny_obj_loader.h"
  "$BASEDIR/tinygltf/tiny_gltf.h"
  "$BASEDIR/tinygltf/json.hpp"
  "$BASEDIR/tinygltf/stb_image.h"
  "$BASEDIR/tinygltf/stb_image_write.h"
  "$BASEDIR/openfbx/ofbx.h"
  "$BASEDIR/openfbx/ofbx.cpp"
  "$BASEDIR/openfbx/libdeflate.h"
  "$BASEDIR/openfbx/libdeflate.cpp"
)
ALL_OK=true
for f in "${FILES[@]}"; do
  SIZE=$(wc -c < "$f" 2>/dev/null || echo 0)
  if [ "$SIZE" -gt 0 ]; then
    echo "  OK: $(basename "$f") ($SIZE bytes)"
  else
    echo "  FAIL: $(basename "$f") is missing or empty"
    ALL_OK=false
  fi
done

if [ -f "$BASEDIR/glm/glm/glm.hpp" ]; then
  echo "  OK: glm/glm.hpp exists"
else
  echo "  FAIL: glm/glm.hpp not found"
  ALL_OK=false
fi

if $ALL_OK; then
  echo ""
  echo "All dependencies downloaded successfully!"
else
  echo ""
  echo "Some downloads failed. Check errors above."
  exit 1
fi
