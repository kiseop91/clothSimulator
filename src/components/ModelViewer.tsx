import { useRef, useEffect, useCallback, useState } from "react";
import { useRenderer } from "../context/RendererContext.tsx";
import { Loader, AlertTriangle, ZoomIn, ZoomOut, RotateCw, Maximize2, Minimize2, Grid3x3, Box, ArrowUp, Eye, Crosshair } from "lucide-react";

export default function ModelViewer() {
  const { module, wasmLoading, wasmError, bridge } = useRenderer();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);
  const isDraggingRef = useRef(false);
  const dragButtonRef = useRef<number>(-1);
  const lastPosRef = useRef({ x: 0, y: 0 });
  const mouseDownPosRef = useRef({ x: 0, y: 0 });
  const pinchDistRef = useRef(0);
  const isDraggingLightRef = useRef(false);
  const isGrabbingParticleRef = useRef(false);
  const isDraggingClothRef = useRef(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [wireframe, setWireframe] = useState(false);
  const [showFps, setShowFps] = useState(true);
  const [fps, setFps] = useState(0);
  const [frameTime, setFrameTime] = useState(0);
  const [dragOver, setDragOver] = useState(false);

  // Init renderer
  useEffect(() => {
    if (!module || initializedRef.current) return;
    const success = module.initRenderer("wasm-canvas");
    if (success) {
      initializedRef.current = true;
    }
    return () => {
      if (initializedRef.current) {
        module.destroyRenderer();
        initializedRef.current = false;
      }
    };
  }, [module]);

  // Resize observer
  useEffect(() => {
    if (!module || !containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          module.resizeViewport(Math.floor(width), Math.floor(height));
          if (canvasRef.current) {
            canvasRef.current.width = Math.floor(width);
            canvasRef.current.height = Math.floor(height);
          }
        }
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [module]);

  // FPS counter
  useEffect(() => {
    if (!module || !showFps) return;
    const interval = setInterval(() => {
      const ft = module.getFrameTimeMs();
      setFrameTime(ft);
      setFps(ft > 0 ? Math.round(1000 / ft) : 0);
    }, 500);
    return () => clearInterval(interval);
  }, [module, showFps]);

  // Keyboard shortcuts (global)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't capture when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          if (bridge.simulation.clothAdded) {
            bridge.toggleSimulation(!bridge.simulation.running);
          }
          break;
        case 'KeyR':
          if (!e.ctrlKey && !e.metaKey) {
            bridge.resetCloth();
          }
          break;
        case 'KeyF':
          if (!e.ctrlKey && !e.metaKey) {
            if (!document.fullscreenElement) {
              containerRef.current?.requestFullscreen();
              setIsFullscreen(true);
            } else {
              document.exitFullscreen();
              setIsFullscreen(false);
            }
          }
          break;
        case 'Numpad1': // Front view
          module?.cameraResetView();
          break;
        case 'Numpad3': // Side view
          module?.cameraResetView();
          module?.cameraRotate(-180, 0);
          break;
        case 'Numpad7': // Top view
          module?.cameraResetView();
          module?.cameraRotate(0, -120);
          break;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [module, bridge]);

  // Fullscreen change listener
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  // --- Pointer handlers ---
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isDraggingRef.current = true;
    isDraggingLightRef.current = false;
    isGrabbingParticleRef.current = false;
    isDraggingClothRef.current = false;
    dragButtonRef.current = e.button;
    lastPosRef.current = { x: e.clientX, y: e.clientY };
    mouseDownPosRef.current = { x: e.clientX, y: e.clientY };

    if (e.button === 0 && canvasRef.current && module) {
      const rect = canvasRef.current.getBoundingClientRect();
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      const result = module.pickObject(ndcX, ndcY);
      if (result === -3) {
        isDraggingLightRef.current = true;
      } else if (result === -2) {
        // Cloth hit
        if (bridge.simulation.running) {
          const idx = module.grabClothParticle(ndcX, ndcY);
          if (idx >= 0) isGrabbingParticleRef.current = true;
        } else {
          isDraggingClothRef.current = true;
        }
      }
    }

    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    e.preventDefault();
  }, [module, bridge.simulation.running]);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDraggingRef.current || !module) return;
      const dx = e.clientX - lastPosRef.current.x;
      const dy = e.clientY - lastPosRef.current.y;
      lastPosRef.current = { x: e.clientX, y: e.clientY };

      if (isGrabbingParticleRef.current && canvasRef.current) {
        // Sim ON: move grabbed particle
        const rect = canvasRef.current.getBoundingClientRect();
        const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const ndcY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
        module.moveGrabbedParticle(ndcX, ndcY);
      } else if (isDraggingClothRef.current) {
        // Sim OFF: translate whole cloth
        module.translateCloth(dx * 0.01, -dy * 0.01, 0);
      } else if (isDraggingLightRef.current) {
        const lx = module.getLightPositionX() + dx * 0.03;
        const ly = module.getLightPositionY() - dy * 0.03;
        const lz = module.getLightPositionZ();
        bridge.setLightPosition(lx, ly, lz);
      } else if (dragButtonRef.current === 2) {
        // Right-click: camera rotate
        module.cameraRotate(dx * 0.5, dy * 0.5);
      } else if (dragButtonRef.current === 1) {
        // Middle-click: camera pan
        module.cameraPan(dx * 0.01, dy * 0.01);
      }
    },
    [module, bridge]
  );

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (isGrabbingParticleRef.current && module) {
      module.releaseClothParticle();
    }

    const dx = e.clientX - mouseDownPosRef.current.x;
    const dy = e.clientY - mouseDownPosRef.current.y;
    const moved = Math.sqrt(dx * dx + dy * dy);

    if (moved < 3 && dragButtonRef.current === 0
        && !isDraggingLightRef.current && !isGrabbingParticleRef.current
        && !isDraggingClothRef.current && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      bridge.pickObject(ndcX, ndcY);
    }

    isDraggingRef.current = false;
    isDraggingLightRef.current = false;
    isGrabbingParticleRef.current = false;
    isDraggingClothRef.current = false;
    dragButtonRef.current = -1;
  }, [bridge, module]);

  // Pinch zoom
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchDistRef.current = Math.sqrt(dx * dx + dy * dy);
    }
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!module || e.touches.length !== 2) return;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const delta = pinchDistRef.current - dist;
      pinchDistRef.current = dist;
      module.cameraZoom(delta * 0.05);
    },
    [module]
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!module) return;
      module.cameraZoom(e.deltaY * 0.01);
    },
    [module]
  );

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  // --- Drag & Drop ---
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const validExts = ['obj', 'fbx', 'gltf', 'glb', 'stl', 'dae', '3ds'];
      if (!validExts.includes(ext)) continue;

      const buffer = await file.arrayBuffer();
      bridge.loadModel(buffer, ext);
    }
  }, [bridge]);

  // --- Camera presets ---
  const setCameraPreset = useCallback((preset: 'front' | 'side' | 'top' | 'iso') => {
    if (!module) return;
    module.cameraResetView();
    switch (preset) {
      case 'front': // Already default after reset — rotate to face front
        module.cameraRotate(-90, 0);
        break;
      case 'side':
        module.cameraRotate(90, 0);
        break;
      case 'top':
        module.cameraRotate(-90, -120);
        break;
      case 'iso': // Default reset is already isometric-ish
        break;
    }
  }, [module]);

  // --- Toolbar actions ---
  const handleZoomIn = useCallback(() => module?.cameraZoom(-2), [module]);
  const handleZoomOut = useCallback(() => module?.cameraZoom(2), [module]);
  const handleResetView = useCallback(() => module?.cameraResetView(), [module]);

  const handleWireframe = useCallback(() => {
    const next = !wireframe;
    setWireframe(next);
    bridge.setWireframeMode(next);
  }, [wireframe, bridge]);

  const handleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full flex-1 min-h-0 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-lg overflow-hidden border border-gray-700"
      style={{ touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onWheel={handleWheel}
      onContextMenu={handleContextMenu}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Grid background pattern */}
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        <div
          className="w-full h-full"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
      </div>

      <canvas
        id="wasm-canvas"
        ref={canvasRef}
        className="block w-full h-full"
      />

      {/* Drag & Drop overlay */}
      {dragOver && (
        <div className="absolute inset-0 flex items-center justify-center bg-blue-500/20 border-2 border-dashed border-blue-400 z-20 pointer-events-none">
          <div className="bg-gray-900/90 px-6 py-4 rounded-xl text-center">
            <Box className="w-10 h-10 mx-auto mb-2 text-blue-400" />
            <p className="text-blue-300 text-sm font-medium">Drop model file here</p>
            <p className="text-gray-500 text-xs mt-1">OBJ, FBX, GLTF, GLB, STL</p>
          </div>
        </div>
      )}

      {/* No model placeholder */}
      {!wasmLoading && !wasmError && bridge.loadedMeshes.length === 0 && !bridge.simulation.clothAdded && bridge.simulation.collisionSpheres.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center space-y-4">
            <div className="w-32 h-32 mx-auto relative">
              <svg viewBox="0 0 200 200" className="w-full h-full opacity-30">
                <defs>
                  <linearGradient id="cubeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style={{ stopColor: "#60a5fa", stopOpacity: 1 }} />
                    <stop offset="100%" style={{ stopColor: "#a78bfa", stopOpacity: 1 }} />
                  </linearGradient>
                </defs>
                <path
                  d="M 60 80 L 140 80 L 140 160 L 60 160 Z M 80 40 L 160 40 L 160 120 L 80 120 Z M 60 80 L 80 40 M 140 80 L 160 40 M 140 160 L 160 120 M 60 160 L 80 120"
                  stroke="url(#cubeGradient)"
                  strokeWidth="2"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <p className="text-gray-400 text-sm">Drop a model or use Upload</p>
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {wasmLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/80 z-10">
          <Loader size={32} className="text-blue-500 animate-spin mb-3" />
          <span className="text-sm text-gray-400">Loading WASM renderer...</span>
        </div>
      )}

      {/* Error Overlay */}
      {wasmError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/80 z-10">
          <AlertTriangle size={32} className="text-red-400 mb-3" />
          <span className="text-sm text-red-400 font-medium mb-1">Renderer Error</span>
          <span className="text-xs text-gray-500 max-w-xs text-center">{wasmError}</span>
        </div>
      )}

      {/* FPS / Performance overlay */}
      {showFps && !wasmLoading && !wasmError && (
        <div
          className="absolute top-2 left-2 bg-gray-900/70 backdrop-blur-sm text-[10px] font-mono px-2 py-1 rounded select-none cursor-pointer"
          onClick={() => setShowFps(false)}
          title="Click to hide"
        >
          <span className={fps >= 55 ? "text-green-400" : fps >= 30 ? "text-yellow-400" : "text-red-400"}>
            {fps} FPS
          </span>
          <span className="text-gray-500 ml-1.5">{frameTime.toFixed(1)}ms</span>
        </div>
      )}

      {/* Camera preset buttons */}
      <div className="absolute top-2 right-2 flex gap-1">
        {([
          { key: 'front' as const, label: 'F', title: 'Front View' },
          { key: 'side' as const, label: 'S', title: 'Side View' },
          { key: 'top' as const, label: 'T', title: 'Top View' },
          { key: 'iso' as const, label: 'P', title: 'Perspective (Reset)' },
        ]).map((preset) => (
          <button
            key={preset.key}
            onClick={() => setCameraPreset(preset.key)}
            className="bg-gray-800/70 hover:bg-gray-700/80 text-gray-400 hover:text-white text-[10px] font-bold w-6 h-6 rounded flex items-center justify-center backdrop-blur-sm border border-gray-600/30 transition-colors cursor-pointer"
            title={preset.title}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {/* Viewport controls (bottom-right) */}
      <div className="absolute bottom-4 right-4 flex gap-2">
        <button
          onClick={handleZoomIn}
          className="bg-gray-800/80 hover:bg-gray-700/80 text-white p-2 rounded-lg backdrop-blur-sm border border-gray-600/50 transition-colors cursor-pointer"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={handleZoomOut}
          className="bg-gray-800/80 hover:bg-gray-700/80 text-white p-2 rounded-lg backdrop-blur-sm border border-gray-600/50 transition-colors cursor-pointer"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={handleResetView}
          className="bg-gray-800/80 hover:bg-gray-700/80 text-white p-2 rounded-lg backdrop-blur-sm border border-gray-600/50 transition-colors cursor-pointer"
          title="Reset View"
        >
          <RotateCw className="w-4 h-4" />
        </button>
        <button
          onClick={handleWireframe}
          className={`p-2 rounded-lg backdrop-blur-sm border border-gray-600/50 transition-colors cursor-pointer ${
            wireframe ? 'bg-green-600/80 text-white' : 'bg-gray-800/80 hover:bg-gray-700/80 text-white'
          }`}
          title="Toggle Wireframe"
        >
          <Grid3x3 className="w-4 h-4" />
        </button>
        <button
          onClick={handleFullscreen}
          className="bg-gray-800/80 hover:bg-gray-700/80 text-white p-2 rounded-lg backdrop-blur-sm border border-gray-600/50 transition-colors cursor-pointer"
          title={isFullscreen ? "Exit Fullscreen (F)" : "Fullscreen (F)"}
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Axis indicator (bottom-left) */}
      <div className="absolute bottom-4 left-4 bg-gray-800/80 backdrop-blur-sm border border-gray-600/50 rounded-lg p-3 pointer-events-none">
        <div className="relative w-12 h-12">
          <div className="absolute left-6 top-6 w-5 h-0.5 bg-red-500" />
          <div className="absolute left-11 top-5 text-[10px] text-red-500 font-semibold">X</div>
          <div className="absolute left-6 top-1 w-0.5 h-5 bg-green-500" />
          <div className="absolute left-7 top-0 text-[10px] text-green-500 font-semibold">Y</div>
          <div
            className="absolute left-3 top-8 w-4 h-0.5 bg-blue-500"
            style={{ transform: "rotate(-45deg)", transformOrigin: "left center" }}
          />
          <div className="absolute left-2 top-9 text-[10px] text-blue-500 font-semibold">Z</div>
          <div className="absolute left-[22px] top-[22px] w-1 h-1 bg-white rounded-full" />
        </div>
      </div>

      {/* Keyboard shortcuts hint (shows briefly or on hover) */}
      {!wasmLoading && !wasmError && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 opacity-0 hover:opacity-100 transition-opacity duration-300 pointer-events-auto">
          <div className="bg-gray-900/80 backdrop-blur-sm text-[9px] text-gray-500 px-3 py-1.5 rounded-full whitespace-nowrap">
            Space: Play/Pause | R: Reset | F: Fullscreen | RMB: Pan | Scroll: Zoom
          </div>
        </div>
      )}
    </div>
  );
}
