#!/bin/bash
set -e

# Find emsdk - check common locations
if [ -d "/c/Users/$USER/emsdk" ]; then
    EMSDK_DIR="/c/Users/$USER/emsdk"
elif [ -n "$EMSDK" ]; then
    EMSDK_DIR="$EMSDK"
else
    echo "Error: emsdk not found. Set EMSDK environment variable."
    exit 1
fi

EMSCRIPTEN_DIR="$EMSDK_DIR/upstream/emscripten"
export PATH="$EMSCRIPTEN_DIR:$EMSDK_DIR:$PATH"
export EMSDK="$EMSDK_DIR"
export EM_CONFIG="$EMSDK_DIR/.emscripten"

# Add ninja to PATH if installed via pip
PYTHON_SCRIPTS="$(python -c 'import sysconfig; print(sysconfig.get_path("scripts"))' 2>/dev/null || echo "")"
if [ -n "$PYTHON_SCRIPTS" ]; then
    export PATH="$PATH:$PYTHON_SCRIPTS"
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WASM_DIR="$SCRIPT_DIR/../wasm"
OUT_DIR="$SCRIPT_DIR/../public/wasm"

cd "$WASM_DIR"
mkdir -p build
cd build

python "$EMSCRIPTEN_DIR/emcmake.py" cmake .. -G Ninja
ninja

mkdir -p "$OUT_DIR"
cp renderer.js renderer.wasm "$OUT_DIR/"
echo "WASM build complete! Output: $OUT_DIR"
