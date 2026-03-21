@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion

echo ========================================
echo  Hockey Drill Studio - Build and Serve
echo ========================================
echo.

:: --- emsdk path ---
set "EMSDK_DIR=C:\Users\%USERNAME%\emsdk"
if not exist "%EMSDK_DIR%\upstream\emscripten\emcc.bat" (
    echo ERROR: emsdk not found at %EMSDK_DIR%
    pause
    exit /b 1
)

set "EMSCRIPTEN_DIR=%EMSDK_DIR%\upstream\emscripten"
set "PATH=%EMSCRIPTEN_DIR%;%EMSDK_DIR%;%PATH%"
set "EMSDK=%EMSDK_DIR%"
set "EM_CONFIG=%EMSDK_DIR%\.emscripten"

:: Add node from emsdk
for /d %%D in ("%EMSDK_DIR%\node\*") do set "PATH=%%D\bin;!PATH!"

:: Add ninja from pip
for /f "delims=" %%i in ('python -c "import sysconfig; print(sysconfig.get_path("""scripts"""))" 2^>nul') do set "PATH=!PATH!;%%i"

:: --- WASM Build ---
echo [1/3] Building WASM...
set "WASM_DIR=%~dp0wasm"
set "OUT_DIR=%~dp0public\wasm"

if not exist "%WASM_DIR%\build" mkdir "%WASM_DIR%\build"
cd /d "%WASM_DIR%\build"

call python "%EMSCRIPTEN_DIR%\emcmake.py" cmake .. -G Ninja
if errorlevel 1 (
    echo ERROR: cmake failed
    pause
    exit /b 1
)

call ninja
if errorlevel 1 (
    echo ERROR: ninja build failed
    pause
    exit /b 1
)

echo WASM build OK
echo.

:: --- Copy output ---
echo [2/3] Copying WASM to public/wasm...
if not exist "%OUT_DIR%" mkdir "%OUT_DIR%"
copy /y "%WASM_DIR%\build\renderer.js" "%OUT_DIR%\" >nul
copy /y "%WASM_DIR%\build\renderer.wasm" "%OUT_DIR%\" >nul
echo Copy OK
echo.

:: --- Kill existing processes on ports 5173 and 3001 ---
echo [3/4] Starting AI API server on port 3001...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001 " ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
cd /d "%~dp0"
start "DrillAPI" cmd /c "npx tsx server/index.ts"
echo API server started (port 3001)
echo.

echo [4/4] Starting Vite dev server on port 5173...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5173 " ^| findstr "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
echo.
call npx vite --host --port 5173 --strictPort

pause
