import { useState, useCallback, useRef } from 'react';
import {
  type Drill, type DrillObject, type DrillPath, type DrillKeyframe,
  ToolMode, TokenType, PathStyle, RinkLayout,
  createEmptyDrill, TEAM_COLORS,
} from '../types/drill';
import { saveDrill } from '../lib/storage';

export interface DrillEditorState {
  drill: Drill;
  tool: ToolMode;
  selectedObjectId: string | null;
  selectedPathId: string | null;
  drawingPath: { x: number; z: number }[] | null;
  currentColor: [number, number, number];
  isPlaying: boolean;
  playbackTime: number;
  is2D: boolean;
  playbackSpeed: number;
  isLooping: boolean;
  lastKeyframeHint: { objectId: string; time: number } | null;
  isRecording: boolean;
  recordingObjectId: string | null;
  recordedPoints: Array<{ x: number; z: number }> | null;
}

export interface DrillEditorActions {
  setDrill: (drill: Drill) => void;
  setTool: (tool: ToolMode) => void;
  setCurrentColor: (color: [number, number, number]) => void;
  addObject: (x: number, z: number) => DrillObject | null;
  moveObject: (id: string, x: number, z: number) => void;
  removeObject: (id: string) => void;
  selectObject: (id: string | null) => void;
  startPath: (x: number, z: number) => void;
  addPathPoint: (x: number, z: number) => void;
  finishPath: () => void;
  cancelPath: () => void;
  removePath: (id: string) => void;
  selectPath: (id: string | null) => void;
  setRinkLayout: (layout: RinkLayout) => void;
  setDrillName: (name: string) => void;
  clearAll: () => void;
  undo: () => void;
  redo: () => void;
  toggle2D: () => void;
  setPlaying: (playing: boolean) => void;
  setPlaybackTime: (t: number) => void;
  save: () => void;
  // Keyframe actions
  autoKeyframe: (objectId: string, x: number, z: number) => void;
  clearKeyframeHint: () => void;
  addKeyframe: (objectId: string, x: number, z: number, t: number) => void;
  removeKeyframe: (objectId: string, waypointIndex: number) => void;
  updateKeyframeTime: (objectId: string, waypointIndex: number, newT: number) => void;
  setDrillDuration: (seconds: number) => void;
  setPlaybackSpeed: (speed: number) => void;
  setLooping: (loop: boolean) => void;
  stepForward: () => void;
  stepBackward: () => void;
  updatePathSmooth: (id: string, smooth: boolean) => void;
  updateKeyframeSmooth: (objectId: string, smooth: boolean) => void;
  startRecording: () => void;
  addRecordingPoint: (x: number, z: number) => void;
  finishRecording: () => void;
  cancelRecording: () => void;
}

function getTokenTypeForTool(tool: ToolMode): TokenType | null {
  switch (tool) {
    case ToolMode.PLAYER: return TokenType.PLAYER;
    case ToolMode.PUCK: return TokenType.PUCK;
    case ToolMode.CONE: return TokenType.CONE;
    case ToolMode.COACH: return TokenType.COACH;
    default: return null;
  }
}

function getPathStyleForTool(tool: ToolMode): PathStyle | null {
  switch (tool) {
    case ToolMode.PATH_SKATE: return PathStyle.SOLID;
    case ToolMode.PATH_PASS: return PathStyle.DASHED;
    case ToolMode.PATH_SHOOT: return PathStyle.ZIGZAG;
    case ToolMode.PATH_CARRY: return PathStyle.DOTTED;
    case ToolMode.PATH_BACKWARD: return PathStyle.BACKWARD;
    default: return null;
  }
}

// Ramer-Douglas-Peucker path simplification
function simplifyPath(points: { x: number; z: number }[], epsilon: number): { x: number; z: number }[] {
  if (points.length <= 2) return points;

  // Find point with max distance from line between first and last
  let maxDist = 0;
  let maxIdx = 0;
  const first = points[0];
  const last = points[points.length - 1];
  const dx = last.x - first.x;
  const dz = last.z - first.z;
  const lineLenSq = dx * dx + dz * dz;

  for (let i = 1; i < points.length - 1; i++) {
    let dist: number;
    if (lineLenSq === 0) {
      dist = Math.sqrt((points[i].x - first.x) ** 2 + (points[i].z - first.z) ** 2);
    } else {
      const t = Math.max(0, Math.min(1, ((points[i].x - first.x) * dx + (points[i].z - first.z) * dz) / lineLenSq));
      const projX = first.x + t * dx;
      const projZ = first.z + t * dz;
      dist = Math.sqrt((points[i].x - projX) ** 2 + (points[i].z - projZ) ** 2);
    }
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = simplifyPath(points.slice(0, maxIdx + 1), epsilon);
    const right = simplifyPath(points.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [first, last];
}

// Uniform subsample preserving first and last points
function subsamplePath(points: { x: number; z: number }[], maxCount: number): { x: number; z: number }[] {
  if (points.length <= maxCount) return points;
  const result: { x: number; z: number }[] = [points[0]];
  const step = (points.length - 1) / (maxCount - 1);
  for (let i = 1; i < maxCount - 1; i++) {
    result.push(points[Math.round(i * step)]);
  }
  result.push(points[points.length - 1]);
  return result;
}

const FRAME_DURATION = 1 / 30; // 1 frame at 30fps, normalized later

export function useDrillEditor(initialDrill?: Drill) {
  const [state, setState] = useState<DrillEditorState>({
    drill: initialDrill ?? createEmptyDrill(),
    tool: ToolMode.SELECT,
    selectedObjectId: null,
    selectedPathId: null,
    drawingPath: null,
    currentColor: TEAM_COLORS.red,
    isPlaying: false,
    playbackTime: 0,
    is2D: true,
    playbackSpeed: 1,
    isLooping: true,
    lastKeyframeHint: null,
    isRecording: false,
    recordingObjectId: null,
    recordedPoints: null,
  });

  const undoStack = useRef<Drill[]>([]);
  const redoStack = useRef<Drill[]>([]);

  const pushUndo = useCallback((drill: Drill) => {
    undoStack.current.push(JSON.parse(JSON.stringify(drill)));
    if (undoStack.current.length > 50) undoStack.current.shift();
    redoStack.current = [];
  }, []);

  const setDrill = useCallback((drill: Drill) => {
    setState(prev => {
      pushUndo(prev.drill);
      return { ...prev, drill };
    });
  }, [pushUndo]);

  const setTool = useCallback((tool: ToolMode) => {
    setState(prev => ({
      ...prev,
      tool,
      drawingPath: null,
      isRecording: false,
      recordingObjectId: null,
      recordedPoints: null,
    }));
  }, []);

  const setCurrentColor = useCallback((color: [number, number, number]) => {
    setState(prev => ({ ...prev, currentColor: color }));
  }, []);

  const addObject = useCallback((x: number, z: number): DrillObject | null => {
    let newObj: DrillObject | null = null;
    setState(prev => {
      const tokenType = getTokenTypeForTool(prev.tool);
      if (tokenType === null) return prev;

      pushUndo(prev.drill);

      const obj: DrillObject = {
        id: `obj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: tokenType,
        x, z,
        color: [...prev.currentColor],
      };
      newObj = obj;
      return {
        ...prev,
        drill: {
          ...prev.drill,
          objects: [...prev.drill.objects, obj],
          updatedAt: Date.now(),
        },
        selectedObjectId: obj.id,
      };
    });
    return newObj;
  }, [pushUndo]);

  const moveObject = useCallback((id: string, x: number, z: number) => {
    setState(prev => ({
      ...prev,
      drill: {
        ...prev.drill,
        objects: prev.drill.objects.map(o => o.id === id ? { ...o, x, z } : o),
        updatedAt: Date.now(),
      },
    }));
  }, []);

  const removeObject = useCallback((id: string) => {
    setState(prev => {
      pushUndo(prev.drill);
      return {
        ...prev,
        drill: {
          ...prev.drill,
          objects: prev.drill.objects.filter(o => o.id !== id),
          keyframes: prev.drill.keyframes.filter(kf => kf.objectId !== id),
          updatedAt: Date.now(),
        },
        selectedObjectId: prev.selectedObjectId === id ? null : prev.selectedObjectId,
      };
    });
  }, [pushUndo]);

  const selectObject = useCallback((id: string | null) => {
    setState(prev => ({ ...prev, selectedObjectId: id, selectedPathId: null }));
  }, []);

  const startPath = useCallback((x: number, z: number) => {
    setState(prev => ({ ...prev, drawingPath: [{ x, z }] }));
  }, []);

  const addPathPoint = useCallback((x: number, z: number) => {
    setState(prev => {
      if (!prev.drawingPath) return prev;
      return { ...prev, drawingPath: [...prev.drawingPath, { x, z }] };
    });
  }, []);

  const finishPath = useCallback(() => {
    setState(prev => {
      if (!prev.drawingPath || prev.drawingPath.length < 2) {
        return { ...prev, drawingPath: null };
      }
      const pathStyle = getPathStyleForTool(prev.tool);
      if (pathStyle === null) return { ...prev, drawingPath: null };

      pushUndo(prev.drill);

      const smooth = pathStyle === PathStyle.SOLID ||
                     pathStyle === PathStyle.DOTTED ||
                     pathStyle === PathStyle.BACKWARD;
      const path: DrillPath = {
        id: `path_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        style: pathStyle,
        color: [...prev.currentColor],
        hasArrow: true,
        waypoints: [...prev.drawingPath],
        smooth,
      };

      return {
        ...prev,
        drawingPath: null,
        drill: {
          ...prev.drill,
          paths: [...prev.drill.paths, path],
          updatedAt: Date.now(),
        },
      };
    });
  }, [pushUndo]);

  const cancelPath = useCallback(() => {
    setState(prev => ({ ...prev, drawingPath: null }));
  }, []);

  const removePath = useCallback((id: string) => {
    setState(prev => {
      pushUndo(prev.drill);
      return {
        ...prev,
        drill: {
          ...prev.drill,
          paths: prev.drill.paths.filter(p => p.id !== id),
          updatedAt: Date.now(),
        },
        selectedPathId: prev.selectedPathId === id ? null : prev.selectedPathId,
      };
    });
  }, [pushUndo]);

  const selectPath = useCallback((id: string | null) => {
    setState(prev => ({ ...prev, selectedPathId: id, selectedObjectId: null }));
  }, []);

  const setRinkLayout = useCallback((layout: RinkLayout) => {
    setState(prev => ({
      ...prev,
      drill: { ...prev.drill, rinkLayout: layout, updatedAt: Date.now() },
    }));
  }, []);

  const setDrillName = useCallback((name: string) => {
    setState(prev => ({
      ...prev,
      drill: { ...prev.drill, name, updatedAt: Date.now() },
    }));
  }, []);

  const clearAll = useCallback(() => {
    setState(prev => {
      pushUndo(prev.drill);
      return {
        ...prev,
        drill: { ...prev.drill, objects: [], paths: [], keyframes: [], updatedAt: Date.now() },
        selectedObjectId: null,
        selectedPathId: null,
        drawingPath: null,
      };
    });
  }, [pushUndo]);

  const undo = useCallback(() => {
    setState(prev => {
      if (undoStack.current.length === 0) return prev;
      redoStack.current.push(JSON.parse(JSON.stringify(prev.drill)));
      const drill = undoStack.current.pop()!;
      return { ...prev, drill };
    });
  }, []);

  const redo = useCallback(() => {
    setState(prev => {
      if (redoStack.current.length === 0) return prev;
      undoStack.current.push(JSON.parse(JSON.stringify(prev.drill)));
      const drill = redoStack.current.pop()!;
      return { ...prev, drill };
    });
  }, []);

  const toggle2D = useCallback(() => {
    setState(prev => ({ ...prev, is2D: !prev.is2D }));
  }, []);

  const setPlaying = useCallback((playing: boolean) => {
    setState(prev => ({ ...prev, isPlaying: playing }));
  }, []);

  const setPlaybackTime = useCallback((t: number) => {
    setState(prev => ({ ...prev, playbackTime: t }));
  }, []);

  const save = useCallback(() => {
    setState(prev => {
      saveDrill(prev.drill);
      return prev;
    });
  }, []);

  // --- Keyframe actions ---

  const addKeyframe = useCallback((objectId: string, x: number, z: number, t: number) => {
    setState(prev => {
      pushUndo(prev.drill);
      const keyframes = [...prev.drill.keyframes];
      let kfIndex = keyframes.findIndex(kf => kf.objectId === objectId);

      if (kfIndex === -1) {
        // Create new keyframe track for this object
        keyframes.push({ objectId, waypoints: [{ x, z, t }], smooth: true });
      } else {
        const waypoints = [...keyframes[kfIndex].waypoints];
        // Replace existing waypoint at same time (within tolerance) or insert
        const existingIdx = waypoints.findIndex(wp => Math.abs(wp.t - t) < 0.005);
        if (existingIdx !== -1) {
          waypoints[existingIdx] = { x, z, t };
        } else {
          waypoints.push({ x, z, t });
        }
        // Sort by time
        waypoints.sort((a, b) => a.t - b.t);
        keyframes[kfIndex] = { ...keyframes[kfIndex], waypoints };
      }

      return {
        ...prev,
        drill: { ...prev.drill, keyframes, updatedAt: Date.now() },
      };
    });
  }, [pushUndo]);

  const autoKeyframe = useCallback((objectId: string, x: number, z: number) => {
    setState(prev => {
      pushUndo(prev.drill);
      const t = prev.playbackTime;
      const keyframes = [...prev.drill.keyframes];
      let kfIndex = keyframes.findIndex(kf => kf.objectId === objectId);

      if (kfIndex === -1) {
        // First keyframe for this object: also add t=0 with original position
        const obj = prev.drill.objects.find(o => o.id === objectId);
        const waypoints: Array<{ x: number; z: number; t: number }> = [];
        if (obj && t > 0.005) {
          waypoints.push({ x: obj.x, z: obj.z, t: 0 });
        }
        waypoints.push({ x, z, t });
        keyframes.push({ objectId, waypoints, smooth: true });
      } else {
        const waypoints = [...keyframes[kfIndex].waypoints];
        const existingIdx = waypoints.findIndex(wp => Math.abs(wp.t - t) < 0.005);
        if (existingIdx !== -1) {
          waypoints[existingIdx] = { x, z, t };
        } else {
          waypoints.push({ x, z, t });
        }
        waypoints.sort((a, b) => a.t - b.t);
        keyframes[kfIndex] = { ...keyframes[kfIndex], waypoints };
      }

      return {
        ...prev,
        drill: { ...prev.drill, keyframes, updatedAt: Date.now() },
        lastKeyframeHint: { objectId, time: t * prev.drill.duration },
      };
    });
  }, [pushUndo]);

  const clearKeyframeHint = useCallback(() => {
    setState(prev => ({ ...prev, lastKeyframeHint: null }));
  }, []);

  const removeKeyframe = useCallback((objectId: string, waypointIndex: number) => {
    setState(prev => {
      pushUndo(prev.drill);
      const keyframes = prev.drill.keyframes.map(kf => {
        if (kf.objectId !== objectId) return kf;
        const waypoints = kf.waypoints.filter((_, i) => i !== waypointIndex);
        return { ...kf, waypoints };
      }).filter(kf => kf.waypoints.length > 0);

      return {
        ...prev,
        drill: { ...prev.drill, keyframes, updatedAt: Date.now() },
      };
    });
  }, [pushUndo]);

  const updateKeyframeTime = useCallback((objectId: string, waypointIndex: number, newT: number) => {
    setState(prev => {
      const keyframes = prev.drill.keyframes.map(kf => {
        if (kf.objectId !== objectId) return kf;
        const waypoints = kf.waypoints.map((wp, i) =>
          i === waypointIndex ? { ...wp, t: Math.max(0, Math.min(1, newT)) } : wp
        );
        waypoints.sort((a, b) => a.t - b.t);
        return { ...kf, waypoints };
      });
      return {
        ...prev,
        drill: { ...prev.drill, keyframes, updatedAt: Date.now() },
      };
    });
  }, []);

  const setDrillDuration = useCallback((seconds: number) => {
    setState(prev => ({
      ...prev,
      drill: { ...prev.drill, duration: Math.max(1, seconds), updatedAt: Date.now() },
    }));
  }, []);

  const setPlaybackSpeed = useCallback((speed: number) => {
    setState(prev => ({ ...prev, playbackSpeed: speed }));
  }, []);

  const setLooping = useCallback((loop: boolean) => {
    setState(prev => ({ ...prev, isLooping: loop }));
  }, []);

  const stepForward = useCallback(() => {
    setState(prev => {
      const frameDuration = FRAME_DURATION / prev.drill.duration;
      const newT = Math.min(prev.playbackTime + frameDuration, 1);
      return { ...prev, playbackTime: newT, isPlaying: false };
    });
  }, []);

  const stepBackward = useCallback(() => {
    setState(prev => {
      const frameDuration = FRAME_DURATION / prev.drill.duration;
      const newT = Math.max(prev.playbackTime - frameDuration, 0);
      return { ...prev, playbackTime: newT, isPlaying: false };
    });
  }, []);

  const updatePathSmooth = useCallback((id: string, smooth: boolean) => {
    setState(prev => {
      pushUndo(prev.drill);
      return {
        ...prev,
        drill: {
          ...prev.drill,
          paths: prev.drill.paths.map(p => p.id === id ? { ...p, smooth } : p),
          updatedAt: Date.now(),
        },
      };
    });
  }, [pushUndo]);

  // --- Recording actions ---

  const startRecording = useCallback(() => {
    setState(prev => {
      if (prev.tool !== ToolMode.SELECT || !prev.selectedObjectId || prev.isRecording) return prev;
      const obj = prev.drill.objects.find(o => o.id === prev.selectedObjectId);
      if (!obj) return prev;

      // Get interpolated position as first point
      const kf = prev.drill.keyframes.find(k => k.objectId === obj.id);
      let firstPos = { x: obj.x, z: obj.z };
      if (kf && kf.waypoints.length > 0) {
        const smooth = kf.smooth;
        if (smooth && kf.waypoints.length > 2) {
          // Use spline interpolation — import not available here, use linear fallback
          const t = prev.playbackTime;
          const wps = kf.waypoints;
          if (t <= wps[0].t) firstPos = { x: wps[0].x, z: wps[0].z };
          else if (t >= wps[wps.length - 1].t) firstPos = { x: wps[wps.length - 1].x, z: wps[wps.length - 1].z };
          else {
            for (let i = 0; i < wps.length - 1; i++) {
              if (t >= wps[i].t && t <= wps[i + 1].t) {
                const segT = (t - wps[i].t) / (wps[i + 1].t - wps[i].t);
                firstPos = {
                  x: wps[i].x + (wps[i + 1].x - wps[i].x) * segT,
                  z: wps[i].z + (wps[i + 1].z - wps[i].z) * segT,
                };
                break;
              }
            }
          }
        } else if (kf.waypoints.length > 0) {
          const t = prev.playbackTime;
          const wps = kf.waypoints;
          if (t <= wps[0].t) firstPos = { x: wps[0].x, z: wps[0].z };
          else if (t >= wps[wps.length - 1].t) firstPos = { x: wps[wps.length - 1].x, z: wps[wps.length - 1].z };
          else {
            for (let i = 0; i < wps.length - 1; i++) {
              if (t >= wps[i].t && t <= wps[i + 1].t) {
                const segT = (t - wps[i].t) / (wps[i + 1].t - wps[i].t);
                firstPos = {
                  x: wps[i].x + (wps[i + 1].x - wps[i].x) * segT,
                  z: wps[i].z + (wps[i + 1].z - wps[i].z) * segT,
                };
                break;
              }
            }
          }
        }
      }

      return {
        ...prev,
        isPlaying: false,
        isRecording: true,
        recordingObjectId: prev.selectedObjectId,
        recordedPoints: [firstPos],
      };
    });
  }, []);

  const addRecordingPoint = useCallback((x: number, z: number) => {
    setState(prev => {
      if (!prev.isRecording || !prev.recordedPoints) return prev;
      const last = prev.recordedPoints[prev.recordedPoints.length - 1];
      const dist = Math.sqrt((x - last.x) ** 2 + (z - last.z) ** 2);
      if (dist < 1.5) return prev;
      return { ...prev, recordedPoints: [...prev.recordedPoints, { x, z }] };
    });
  }, []);

  const cancelRecording = useCallback(() => {
    setState(prev => ({
      ...prev,
      isRecording: false,
      recordingObjectId: null,
      recordedPoints: null,
    }));
  }, []);

  const finishRecording = useCallback(() => {
    setState(prev => {
      if (!prev.isRecording || !prev.recordedPoints || !prev.recordingObjectId) {
        return { ...prev, isRecording: false, recordingObjectId: null, recordedPoints: null };
      }
      if (prev.recordedPoints.length < 2) {
        return { ...prev, isRecording: false, recordingObjectId: null, recordedPoints: null };
      }
      // Check object still exists
      const obj = prev.drill.objects.find(o => o.id === prev.recordingObjectId);
      if (!obj) {
        return { ...prev, isRecording: false, recordingObjectId: null, recordedPoints: null };
      }

      // RDP simplification
      const simplified = simplifyPath(prev.recordedPoints, 2.0);
      // Cap at 30 points
      let finalPoints = simplified;
      if (finalPoints.length > 40) {
        finalPoints = subsamplePath(finalPoints, 30);
      }

      // Time distribution (arc length based)
      let startT = prev.playbackTime;
      if (startT >= 0.95) startT = 0;
      const endT = 1.0;

      const cumDist: number[] = [0];
      for (let i = 1; i < finalPoints.length; i++) {
        const dx = finalPoints[i].x - finalPoints[i - 1].x;
        const dz = finalPoints[i].z - finalPoints[i - 1].z;
        cumDist.push(cumDist[i - 1] + Math.sqrt(dx * dx + dz * dz));
      }
      const totalDist = cumDist[cumDist.length - 1];

      const waypoints = finalPoints.map((p, i) => ({
        x: p.x,
        z: p.z,
        t: totalDist > 0 ? startT + (endT - startT) * (cumDist[i] / totalDist) : startT,
      }));

      // Push undo
      pushUndo(prev.drill);

      // Replace or create keyframe track
      const keyframes = [...prev.drill.keyframes];
      const kfIndex = keyframes.findIndex(kf => kf.objectId === prev.recordingObjectId);
      if (kfIndex === -1) {
        keyframes.push({ objectId: prev.recordingObjectId!, waypoints, smooth: true });
      } else {
        keyframes[kfIndex] = { ...keyframes[kfIndex], waypoints, smooth: true };
      }

      return {
        ...prev,
        isRecording: false,
        recordingObjectId: null,
        recordedPoints: null,
        drill: { ...prev.drill, keyframes, updatedAt: Date.now() },
      };
    });
  }, [pushUndo]);

  const updateKeyframeSmooth = useCallback((objectId: string, smooth: boolean) => {
    setState(prev => {
      pushUndo(prev.drill);
      return {
        ...prev,
        drill: {
          ...prev.drill,
          keyframes: prev.drill.keyframes.map(kf => kf.objectId === objectId ? { ...kf, smooth } : kf),
          updatedAt: Date.now(),
        },
      };
    });
  }, [pushUndo]);

  return {
    state,
    actions: {
      setDrill,
      setTool,
      setCurrentColor,
      addObject,
      moveObject,
      removeObject,
      selectObject,
      startPath,
      addPathPoint,
      finishPath,
      cancelPath,
      removePath,
      selectPath,
      setRinkLayout,
      setDrillName,
      clearAll,
      undo,
      redo,
      toggle2D,
      setPlaying,
      setPlaybackTime,
      save,
      autoKeyframe,
      clearKeyframeHint,
      addKeyframe,
      removeKeyframe,
      updateKeyframeTime,
      setDrillDuration,
      setPlaybackSpeed,
      setLooping,
      stepForward,
      stepBackward,
      updatePathSmooth,
      updateKeyframeSmooth,
      startRecording,
      addRecordingPoint,
      finishRecording,
      cancelRecording,
    } as DrillEditorActions,
  };
}
