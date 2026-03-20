@echo off
echo ========================================
echo  WASM Build + Dev Server (HTTP)
echo ========================================

set EMSDK=C:\Users\user\emsdk
set EMSCRIPTEN=%EMSDK%\upstream\emscripten
set PATH=%EMSCRIPTEN%;%EMSDK%;%PATH%

REM Add ninja from pip to PATH
for /f "delims=" %%i in ('python -c "import sysconfig; print(sysconfig.get_path('scripts'))" 2^>nul') do set PATH=%PATH%;%%i

echo.
echo [1/3] Configuring CMake...
cd /d "%~dp0wasm"
if not exist build mkdir build
cd build

call python "%EMSCRIPTEN%\emcmake.py" cmake .. -G Ninja
if %ERRORLEVEL% neq 0 (
    echo CMake configure FAILED!
    pause
    exit /b 1
)

echo.
echo [2/3] Building WASM...
call ninja
if %ERRORLEVEL% neq 0 (
    echo WASM build FAILED!
    pause
    exit /b 1
)

echo.
echo [3/3] Copying output to public/wasm...
if not exist "%~dp0public\wasm" mkdir "%~dp0public\wasm"
copy /Y renderer.js "%~dp0public\wasm\renderer.js" >nul
copy /Y renderer.wasm "%~dp0public\wasm\renderer.wasm" >nul
echo Copied renderer.js + renderer.wasm to public\wasm\

cd /d "%~dp0"

echo.
echo ========================================
echo  Starting Vite dev server (HTTP)...
echo ========================================
call npx vite --config vite.config.http.ts
