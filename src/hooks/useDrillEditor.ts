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
    setState(prev => ({ ...prev, tool, drawingPath: null }));
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

      const path: DrillPath = {
        id: `path_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        style: pathStyle,
        color: [...prev.currentColor],
        hasArrow: true,
        waypoints: [...prev.drawingPath],
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
        keyframes.push({ objectId, waypoints: [{ x, z, t }] });
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
        keyframes.push({ objectId, waypoints });
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
    } as DrillEditorActions,
  };
}
