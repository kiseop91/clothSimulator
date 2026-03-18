import { useRef, useEffect, useCallback, useState } from "react";
import { useRenderer } from "../context/RendererContext.tsx";
import { Loader, AlertTriangle, ZoomIn, ZoomOut, RotateCw, Maximize2, Minimize2, Grid3x3 } from "lucide-react";

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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [wireframe, setWireframe] = useState(false);

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

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    isDraggingRef.current = true;
    isDraggingLightRef.current = false;
    dragButtonRef.current = e.button;
    lastPosRef.current = { x: e.clientX, y: e.clientY };
    mouseDownPosRef.current = { x: e.clientX, y: e.clientY };

    // Check if clicking on light sphere
    if (e.button === 0 && canvasRef.current && module) {
      const rect = canvasRef.current.getBoundingClientRect();
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      const result = module.pickObject(ndcX, ndcY);
      if (result === -3) {
        isDraggingLightRef.current = true;
      }
    }

    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    e.preventDefault();
  }, [module]);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDraggingRef.current || !module) return;
      const dx = e.clientX - lastPosRef.current.x;
      const dy = e.clientY - lastPosRef.current.y;
      lastPosRef.current = { x: e.clientX, y: e.clientY };

      if (isDraggingLightRef.current) {
        // Move light: shift position based on mouse delta
        const lx = module.getLightPositionX() + dx * 0.03;
        const ly = module.getLightPositionY() - dy * 0.03;
        const lz = module.getLightPositionZ();
        bridge.setLightPosition(lx, ly, lz);
      } else if (dragButtonRef.current === 0) {
        module.cameraRotate(dx * 0.5, dy * 0.5);
      } else if (dragButtonRef.current === 2) {
        module.cameraPan(dx * 0.01, dy * 0.01);
      }
    },
    [module, bridge]
  );

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const dx = e.clientX - mouseDownPosRef.current.x;
    const dy = e.clientY - mouseDownPosRef.current.y;
    const moved = Math.sqrt(dx * dx + dy * dy);

    if (moved < 3 && dragButtonRef.current === 0 && !isDraggingLightRef.current && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      bridge.pickObject(ndcX, ndcY);
    }

    isDraggingRef.current = false;
    isDraggingLightRef.current = false;
    dragButtonRef.current = -1;
  }, [bridge]);

  // Pinch zoom for touch
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

  const handleZoomIn = useCallback(() => {
    module?.cameraZoom(-2);
  }, [module]);

  const handleZoomOut = useCallback(() => {
    module?.cameraZoom(2);
  }, [module]);

  const handleResetView = useCallback(() => {
    module?.cameraResetView();
  }, [module]);

  const handleWireframe = useCallback(() => {
    const next = !wireframe;
    setWireframe(next);
    bridge.setWireframeMode(next);
  }, [wireframe, bridge]);

  const handleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
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
    >
      {/* Grid background pattern */}
      <div className="absolute inset-0 opacity-20">
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

      {/* Center placeholder for 3D model */}
      {!wasmLoading && !wasmError && bridge.loadedMeshes.length === 0 && !bridge.simulation.clothAdded && bridge.simulation.collisionSpheres.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
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
            <p className="text-gray-400 text-sm">No model loaded</p>
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

      {/* Viewport controls */}
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
          title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Axis indicator */}
      <div className="absolute bottom-4 left-4 bg-gray-800/80 backdrop-blur-sm border border-gray-600/50 rounded-lg p-3 pointer-events-none">
        <div className="relative w-12 h-12">
          {/* X axis - Red */}
          <div className="absolute left-6 top-6 w-5 h-0.5 bg-red-500" />
          <div className="absolute left-11 top-5 text-[10px] text-red-500 font-semibold">X</div>

          {/* Y axis - Green */}
          <div className="absolute left-6 top-1 w-0.5 h-5 bg-green-500" />
          <div className="absolute left-7 top-0 text-[10px] text-green-500 font-semibold">Y</div>

          {/* Z axis - Blue */}
          <div
            className="absolute left-3 top-8 w-4 h-0.5 bg-blue-500"
            style={{ transform: "rotate(-45deg)", transformOrigin: "left center" }}
          />
          <div className="absolute left-2 top-9 text-[10px] text-blue-500 font-semibold">Z</div>

          {/* Origin point */}
          <div className="absolute left-[22px] top-[22px] w-1 h-1 bg-white rounded-full" />
        </div>
      </div>
    </div>
  );
}
