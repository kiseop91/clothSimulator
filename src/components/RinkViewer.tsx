import { useRef, useEffect, useCallback, useState } from 'react';
import { useRenderer } from '../context/RendererContext.tsx';
import { Loader, AlertTriangle } from 'lucide-react';

export default function RinkViewer() {
  const { module, wasmLoading, wasmError } = useRenderer();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);
  const isDraggingRef = useRef(false);
  const dragButtonRef = useRef<number>(-1);
  const lastPosRef = useRef({ x: 0, y: 0 });
  const pinchDistRef = useRef(0);

  useEffect(() => {
    if (!module || initializedRef.current) return;
    const success = module.initRenderer('wasm-canvas');
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
    dragButtonRef.current = e.button;
    lastPosRef.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    e.preventDefault();
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDraggingRef.current || !module) return;
    const dx = e.clientX - lastPosRef.current.x;
    const dy = e.clientY - lastPosRef.current.y;
    lastPosRef.current = { x: e.clientX, y: e.clientY };

    if (dragButtonRef.current === 0) {
      module.cameraRotate(dx * 0.5, dy * 0.5);
    } else if (dragButtonRef.current === 2) {
      module.cameraPan(dx * 0.01, dy * 0.01);
    }
  }, [module]);

  const handlePointerUp = useCallback(() => {
    isDraggingRef.current = false;
    dragButtonRef.current = -1;
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchDistRef.current = Math.sqrt(dx * dx + dy * dy);
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!module || e.touches.length !== 2) return;
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const delta = pinchDistRef.current - dist;
    pinchDistRef.current = dist;
    module.cameraZoom(delta * 0.05);
  }, [module]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    module?.cameraZoom(e.deltaY * 0.01);
  }, [module]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-gray-900 overflow-hidden"
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
      <canvas
        id="wasm-canvas"
        ref={canvasRef}
        className="block w-full h-full"
      />

      {wasmLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/80 z-10">
          <Loader size={32} className="text-blue-500 animate-spin mb-3" />
          <span className="text-sm text-gray-400">Loading WASM renderer...</span>
        </div>
      )}

      {wasmError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/80 z-10">
          <AlertTriangle size={32} className="text-red-400 mb-3" />
          <span className="text-sm text-red-400 font-medium mb-1">Renderer Error</span>
          <span className="text-xs text-gray-500 max-w-xs text-center">{wasmError}</span>
        </div>
      )}
    </div>
  );
}
