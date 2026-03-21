import { useRef, useCallback, useEffect, useState } from 'react';
import type { DrillEditorState, DrillEditorActions } from '../hooks/useDrillEditor';
import type { RendererBridge } from '../hooks/useRendererBridge';
import { ToolMode, TokenType, PathStyle } from '../types/drill';
import { tessellateSpline, interpolateSpline } from '../lib/catmullRom';

// NHL rink dimensions in feet
const RINK_LENGTH = 200;
const RINK_WIDTH = 85;

interface DrillEditorProps {
  state: DrillEditorState;
  actions: DrillEditorActions;
  bridge: RendererBridge;
}

// Convert rink coordinates (feet, centered at 0) to SVG coordinates
function rinkToSvg(x: number, z: number, svgW: number, svgH: number) {
  const sx = (x / RINK_LENGTH + 0.5) * svgW;
  const sy = (-z / RINK_WIDTH + 0.5) * svgH;
  return { sx, sy };
}

// Convert SVG coordinates to rink coordinates
function svgToRink(sx: number, sy: number, svgW: number, svgH: number) {
  const x = (sx / svgW - 0.5) * RINK_LENGTH;
  const z = -(sy / svgH - 0.5) * RINK_WIDTH;
  return { x, z };
}

function colorToHex(c: [number, number, number]) {
  const r = Math.round(c[0] * 255).toString(16).padStart(2, '0');
  const g = Math.round(c[1] * 255).toString(16).padStart(2, '0');
  const b = Math.round(c[2] * 255).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

function getTokenLabel(type: TokenType) {
  switch (type) {
    case TokenType.PLAYER: return 'P';
    case TokenType.PUCK: return '';
    case TokenType.CONE: return 'C';
    case TokenType.COACH: return 'X';
  }
}

function getPathDashArray(style: PathStyle): string {
  switch (style) {
    case PathStyle.SOLID: return '';
    case PathStyle.DASHED: return '12,8';
    case PathStyle.ZIGZAG: return ''; // handled differently
    case PathStyle.DOTTED: return '3,6';
    case PathStyle.BACKWARD: return '16,6';
    default: return '';
  }
}

// Interpolate position from keyframe waypoints at given time t
function interpolatePosition(waypoints: Array<{ x: number; z: number; t: number }>, t: number): { x: number; z: number } | null {
  if (waypoints.length === 0) return null;
  if (waypoints.length === 1) return { x: waypoints[0].x, z: waypoints[0].z };
  if (t <= waypoints[0].t) return { x: waypoints[0].x, z: waypoints[0].z };
  if (t >= waypoints[waypoints.length - 1].t) {
    const last = waypoints[waypoints.length - 1];
    return { x: last.x, z: last.z };
  }
  for (let i = 0; i < waypoints.length - 1; i++) {
    if (t >= waypoints[i].t && t <= waypoints[i + 1].t) {
      const segT = (t - waypoints[i].t) / (waypoints[i + 1].t - waypoints[i].t);
      return {
        x: waypoints[i].x + (waypoints[i + 1].x - waypoints[i].x) * segT,
        z: waypoints[i].z + (waypoints[i + 1].z - waypoints[i].z) * segT,
      };
    }
  }
  return null;
}

export default function DrillEditor({ state, actions, bridge }: DrillEditorProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ id: string; startX: number; startZ: number } | null>(null);
  const svgW = 800;
  const svgH = 340; // aspect ratio ~200:85


  // Auto-clear keyframe hint after 2 seconds
  useEffect(() => {
    if (!state.lastKeyframeHint) return;
    const timer = setTimeout(() => actions.clearKeyframeHint(), 2000);
    return () => clearTimeout(timer);
  }, [state.lastKeyframeHint, actions]);

  const getSvgPoint = useCallback((e: React.MouseEvent) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, z: 0 };
    const rect = svg.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * svgW;
    const sy = ((e.clientY - rect.top) / rect.height) * svgH;
    return svgToRink(sx, sy, svgW, svgH);
  }, []);

  const handleSvgClick = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const { x, z } = getSvgPoint(e);

    const tool = state.tool;
    const isTokenTool = [ToolMode.PLAYER, ToolMode.PUCK, ToolMode.CONE, ToolMode.COACH].includes(tool);
    const isPathTool = [ToolMode.PATH_SKATE, ToolMode.PATH_PASS, ToolMode.PATH_SHOOT, ToolMode.PATH_CARRY, ToolMode.PATH_BACKWARD].includes(tool);

    if (isTokenTool) {
      actions.addObject(x, z);
    } else if (isPathTool) {
      if (!state.drawingPath) {
        actions.startPath(x, z);
      } else {
        actions.addPathPoint(x, z);
      }
    } else if (tool === ToolMode.SELECT) {
      actions.selectObject(null);
      actions.selectPath(null);
    } else if (tool === ToolMode.ERASE) {
      // Find nearest object or path to erase
      const threshold = 8; // feet
      let closestObj: string | null = null;
      let closestDist = threshold;
      for (const obj of state.drill.objects) {
        const dist = Math.sqrt((obj.x - x) ** 2 + (obj.z - z) ** 2);
        if (dist < closestDist) {
          closestDist = dist;
          closestObj = obj.id;
        }
      }
      if (closestObj) {
        actions.removeObject(closestObj);
      }
    }
  }, [state.tool, state.drawingPath, actions, getSvgPoint, state.drill.objects]);

  const handleDoubleClick = useCallback(() => {
    if (state.drawingPath) {
      actions.finishPath();
    }
  }, [state.drawingPath, actions]);

  const handleObjectMouseDown = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (state.tool === ToolMode.SELECT) {
      actions.selectObject(id);
      // Use interpolated position as start, not base position
      const obj = state.drill.objects.find(o => o.id === id);
      if (obj) {
        const pos = getInterpolatedPos(id, obj.x, obj.z);
        dragRef.current = { id, startX: pos.x, startZ: pos.z };
      }
    } else if (state.tool === ToolMode.ERASE) {
      actions.removeObject(id);
    }
  }, [state.tool, state.drill.objects, state.drill.keyframes, state.playbackTime, actions]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current || state.tool !== ToolMode.SELECT) return;
    const { x, z } = getSvgPoint(e);
    actions.moveObject(dragRef.current.id, x, z);
  }, [state.tool, actions, getSvgPoint]);

  const handleMouseUp = useCallback(() => {
    if (dragRef.current) {
      const obj = state.drill.objects.find(o => o.id === dragRef.current!.id);
      if (obj) {
        const dx = obj.x - dragRef.current.startX;
        const dz = obj.z - dragRef.current.startZ;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > 0.5) {
          actions.autoKeyframe(obj.id, obj.x, obj.z);
        }
      }
    }
    dragRef.current = null;
  }, [state.drill.objects, actions]);

  const handlePathClick = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (state.tool === ToolMode.SELECT) {
      actions.selectPath(id);
    } else if (state.tool === ToolMode.ERASE) {
      actions.removePath(id);
    }
  }, [state.tool, actions]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      actions.cancelPath();
      actions.selectObject(null);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (state.selectedObjectId) actions.removeObject(state.selectedObjectId);
      if (state.selectedPathId) actions.removePath(state.selectedPathId);
    } else if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
      if (e.shiftKey) actions.redo();
      else actions.undo();
    }
  }, [state.selectedObjectId, state.selectedPathId, actions]);

  // Get interpolated position (used by both rendering and drag start)
  const getInterpolatedPos = (objId: string, objX: number, objZ: number) => {
    const kf = state.drill.keyframes.find(k => k.objectId === objId);
    if (kf && kf.waypoints.length > 0) {
      const pos = interpolatePosition(kf.waypoints, state.playbackTime);
      if (pos) return pos;
    }
    return { x: objX, z: objZ };
  };

  // Always interpolate from keyframes; skip only for the object being dragged
  const getObjectPosition = (objId: string, objX: number, objZ: number) => {
    if (dragRef.current?.id === objId) {
      return { x: objX, z: objZ };
    }
    return getInterpolatedPos(objId, objX, objZ);
  };

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${svgW} ${svgH}`}
      className="w-full h-full cursor-crosshair"
      preserveAspectRatio="xMidYMid meet"
      onClick={handleSvgClick}
      onDoubleClick={handleDoubleClick}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      style={{ outline: 'none' }}
    >
      {/* Keyframe hint toast */}
      {state.lastKeyframeHint && (
        <g>
          <rect x={svgW / 2 - 60} y={svgH - 30} width={120} height={22} rx={6} fill="#22d3ee" opacity={0.85} />
          <text x={svgW / 2} y={svgH - 15} textAnchor="middle" fill="#000" fontSize="11" fontWeight="bold">
            Keyframe at {state.lastKeyframeHint.time.toFixed(1)}s
          </text>
        </g>
      )}

      {/* Paths */}
      {state.drill.paths.map(path => {
        const points = path.waypoints.map(wp => {
          const { sx, sy } = rinkToSvg(wp.x, wp.z, svgW, svgH);
          return `${sx},${sy}`;
        }).join(' ');
        const color = colorToHex(path.color);
        const dash = getPathDashArray(path.style);
        const isSelected = path.id === state.selectedPathId;

        return (
          <g key={path.id}>
            <polyline
              points={points}
              fill="none"
              stroke={color}
              strokeWidth={isSelected ? 4 : 2.5}
              strokeDasharray={dash}
              strokeLinecap="round"
              strokeLinejoin="round"
              onClick={(e) => handlePathClick(e, path.id)}
              className="cursor-pointer"
              opacity={0.85}
            />
            {/* Arrow at end */}
            {path.hasArrow && path.waypoints.length >= 2 && (() => {
              const last = path.waypoints[path.waypoints.length - 1];
              const prev = path.waypoints[path.waypoints.length - 2];
              const { sx: ex, sy: ey } = rinkToSvg(last.x, last.z, svgW, svgH);
              const { sx: px, sy: py } = rinkToSvg(prev.x, prev.z, svgW, svgH);
              const angle = Math.atan2(ey - py, ex - px);
              const arrowSize = 10;
              const a1x = ex - arrowSize * Math.cos(angle - 0.4);
              const a1y = ey - arrowSize * Math.sin(angle - 0.4);
              const a2x = ex - arrowSize * Math.cos(angle + 0.4);
              const a2y = ey - arrowSize * Math.sin(angle + 0.4);
              return (
                <polygon
                  points={`${ex},${ey} ${a1x},${a1y} ${a2x},${a2y}`}
                  fill={color}
                  opacity={0.85}
                />
              );
            })()}
          </g>
        );
      })}

      {/* Drawing path preview */}
      {state.drawingPath && state.drawingPath.length > 0 && (
        <polyline
          points={state.drawingPath.map(wp => {
            const { sx, sy } = rinkToSvg(wp.x, wp.z, svgW, svgH);
            return `${sx},${sy}`;
          }).join(' ')}
          fill="none"
          stroke={colorToHex(state.currentColor)}
          strokeWidth={2}
          strokeDasharray="4,4"
          opacity={0.6}
        />
      )}

      {/* Objects (tokens) */}
      {state.drill.objects.map(obj => {
        const pos = getObjectPosition(obj.id, obj.x, obj.z);
        const { sx, sy } = rinkToSvg(pos.x, pos.z, svgW, svgH);
        const color = colorToHex(obj.color);
        const isSelected = obj.id === state.selectedObjectId;
        const radius = obj.type === TokenType.PUCK ? 5 : 10;

        // Check if this object has keyframes (for visual indicator)
        const hasKeyframes = state.drill.keyframes.some(kf => kf.objectId === obj.id && kf.waypoints.length > 0);

        return (
          <g
            key={obj.id}
            onMouseDown={(e) => handleObjectMouseDown(e, obj.id)}
            className="cursor-grab active:cursor-grabbing"
          >
            {/* Selection ring */}
            {isSelected && (
              <circle cx={sx} cy={sy} r={radius + 4} fill="none" stroke="#fbbf24" strokeWidth={2} strokeDasharray="4,2" />
            )}
            {/* Keyframe indicator ring */}
            {hasKeyframes && !isSelected && (
              <circle cx={sx} cy={sy} r={radius + 3} fill="none" stroke="#22d3ee" strokeWidth={1} opacity={0.5} />
            )}
            {/* Token shape */}
            {obj.type === TokenType.PUCK ? (
              <circle cx={sx} cy={sy} r={radius} fill="#222" stroke="#555" strokeWidth={1} />
            ) : obj.type === TokenType.CONE ? (
              <polygon
                points={`${sx},${sy - radius} ${sx - radius * 0.8},${sy + radius * 0.6} ${sx + radius * 0.8},${sy + radius * 0.6}`}
                fill="#ff8c00"
                stroke="#cc7000"
                strokeWidth={1}
              />
            ) : (
              <circle cx={sx} cy={sy} r={radius} fill={color} stroke={isSelected ? '#fbbf24' : '#fff'} strokeWidth={1.5} />
            )}
            {/* Label */}
            {getTokenLabel(obj.type) && (
              <text
                x={sx}
                y={sy + 4}
                textAnchor="middle"
                fill="white"
                fontSize="10"
                fontWeight="bold"
                pointerEvents="none"
              >
                {getTokenLabel(obj.type)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
