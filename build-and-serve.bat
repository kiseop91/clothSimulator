@echo off
echo ========================================
echo  WASM Build + Dev Server
echo ========================================

echo.
echo [1/2] Building WASM...
set EMSDK=C:\Users\user\emsdk
set USER=user
call bash scripts/build-wasm.sh
if %ERRORLEVEL% neq 0 (
    echo WASM build FAILED!
    pause
    exit /b 1
)

echo.
echo [2/2] Starting Vite dev server...
call npx vite
