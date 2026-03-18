import { useCallback, useState } from "react";
import { Move, Box, Palette, Layers, Wind, Play, Pause, RotateCcw, Plus, Circle, Trash2, ArrowDown, Shirt, Eye, EyeOff } from "lucide-react";
import { useRenderer } from "../context/RendererContext.tsx";

export default function PropertiesPanel() {
  const { bridge } = useRenderer();

  return (
    <div className="bg-gray-800 border-l border-gray-700 flex flex-col h-full overflow-y-auto">
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-white font-semibold text-sm">Properties</h2>
      </div>

      <div className="p-4 space-y-6">
        {/* Transform Section */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-gray-400 text-xs font-medium uppercase tracking-wide">
            <Move className="w-3.5 h-3.5" />
            <span>Transform</span>
          </div>
          <TransformSection bridge={bridge} />
        </div>

        {/* Mesh Info Section */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-gray-400 text-xs font-medium uppercase tracking-wide">
            <Box className="w-3.5 h-3.5" />
            <span>Mesh Info</span>
          </div>
          <MeshInfoSection bridge={bridge} />
        </div>

        {/* Material Section */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-gray-400 text-xs font-medium uppercase tracking-wide">
            <Palette className="w-3.5 h-3.5" />
            <span>Material</span>
          </div>
          <MaterialSection bridge={bridge} />
        </div>

        {/* Loaded Meshes Section */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-gray-400 text-xs font-medium uppercase tracking-wide">
            <Layers className="w-3.5 h-3.5" />
            <span>Loaded Meshes</span>
          </div>
          <LoadedMeshesSection bridge={bridge} />
        </div>

        {/* Simulation Section */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-gray-400 text-xs font-medium uppercase tracking-wide">
            <Wind className="w-3.5 h-3.5" />
            <span>Cloth Simulation</span>
          </div>
          <SimulationSection bridge={bridge} />
        </div>

        {/* Mesh to Cloth Section */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-gray-400 text-xs font-medium uppercase tracking-wide">
            <Shirt className="w-3.5 h-3.5" />
            <span>Mesh to Cloth</span>
          </div>
          <MeshToClothSection bridge={bridge} />
        </div>

        {/* Collision Spheres Section */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-gray-400 text-xs font-medium uppercase tracking-wide">
            <Circle className="w-3.5 h-3.5" />
            <span>Collision Spheres</span>
          </div>
          <CollisionSpheresSection bridge={bridge} />
        </div>
      </div>
    </div>
  );
}

// --- Transform ---

function TransformSection({ bridge }: { bridge: ReturnType<typeof useRenderer>["bridge"] }) {
  const { transform, setPosition, setRotation, setScale } = bridge;

  return (
    <div className="space-y-2">
      <Vec3Group label="Position" values={transform.position} step={0.1} onChange={(x, y, z) => setPosition(x, y, z)} />
      <Vec3Group label="Rotation" values={transform.rotation} step={1} onChange={(x, y, z) => setRotation(x, y, z)} />
      <Vec3Group label="Scale" values={transform.scale} step={0.1} onChange={(x, y, z) => setScale(x, y, z)} />
    </div>
  );
}

function Vec3Group({
  label,
  values,
  step,
  onChange,
}: {
  label: string;
  values: [number, number, number];
  step: number;
  onChange: (x: number, y: number, z: number) => void;
}) {
  const axes = ["X", "Y", "Z"] as const;

  const handleChange = useCallback(
    (index: number, val: number) => {
      const next: [number, number, number] = [...values];
      next[index] = val;
      onChange(next[0], next[1], next[2]);
    },
    [values, onChange]
  );

  return (
    <div>
      <label className="text-xs text-gray-400 mb-1 block">
        {label}
      </label>
      <div className="grid grid-cols-3 gap-2">
        {axes.map((axis, i) => (
          <input
            key={axis}
            type="number"
            placeholder={axis}
            step={step}
            value={values[i]}
            onChange={(e) => handleChange(i, parseFloat(e.target.value) || 0)}
            className="bg-gray-700 text-white text-xs px-2 py-1.5 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
          />
        ))}
      </div>
    </div>
  );
}

// --- Mesh Info ---

function MeshInfoSection({ bridge }: { bridge: ReturnType<typeof useRenderer>["bridge"] }) {
  const { meshInfo } = bridge;
  const items = [
    { label: "Vertices", value: meshInfo.vertices > 0 ? meshInfo.vertices.toLocaleString() : "\u2014" },
    { label: "Faces", value: meshInfo.faces > 0 ? meshInfo.faces.toLocaleString() : "\u2014" },
    { label: "Triangles", value: meshInfo.triangles > 0 ? meshInfo.triangles.toLocaleString() : "\u2014" },
  ];

  return (
    <div className="space-y-2 text-sm">
      {items.map((item) => (
        <div key={item.label} className="flex justify-between">
          <span className="text-gray-400 text-xs">{item.label}</span>
          <span className="text-gray-200 text-xs font-medium">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

// --- Material ---

function MaterialSection({ bridge }: { bridge: ReturnType<typeof useRenderer>["bridge"] }) {
  const { material, setBaseColor, setMetallic, setRoughness } = bridge;

  const colorHex = rgbToHex(material.baseColor[0], material.baseColor[1], material.baseColor[2]);

  const handleColorChange = useCallback(
    (hex: string) => {
      const [r, g, b] = hexToRgb(hex);
      setBaseColor(r, g, b);
    },
    [setBaseColor]
  );

  return (
    <div className="space-y-2">
      {/* Base Color */}
      <div>
        <label className="text-xs text-gray-400 mb-1 block">Base Color</label>
        <div className="flex gap-2">
          <input
            type="color"
            value={colorHex}
            onChange={(e) => handleColorChange(e.target.value)}
            className="h-8 w-12 rounded border border-gray-600 bg-gray-700 cursor-pointer"
          />
          <input
            type="text"
            value={colorHex}
            onChange={(e) => {
              if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) {
                handleColorChange(e.target.value);
              }
            }}
            className="flex-1 bg-gray-700 text-white text-xs px-2 py-1.5 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Metallic */}
      <div>
        <label className="text-xs text-gray-400 mb-1 block">Metallic</label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={material.metallic}
          onChange={(e) => setMetallic(parseFloat(e.target.value))}
          className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
        />
      </div>

      {/* Roughness */}
      <div>
        <label className="text-xs text-gray-400 mb-1 block">Roughness</label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={material.roughness}
          onChange={(e) => setRoughness(parseFloat(e.target.value))}
          className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
        />
      </div>
    </div>
  );
}

// --- Loaded Meshes ---

function LoadedMeshesSection({ bridge }: { bridge: ReturnType<typeof useRenderer>["bridge"] }) {
  const { loadedMeshes, selectedMeshIndex, selectMesh, deselectMesh, setMeshPosition, removeLoadedMesh, setMeshVisible } = bridge;

  if (loadedMeshes.length === 0) {
    return <p className="text-xs text-gray-500 text-center py-1">No meshes loaded</p>;
  }

  return (
    <div className="space-y-1">
      {loadedMeshes.map((mesh, index) => (
        <div key={index}>
          <div
            onClick={() => selectedMeshIndex === index ? deselectMesh() : selectMesh(index)}
            className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs cursor-pointer transition-colors ${
              selectedMeshIndex === index
                ? "bg-blue-600/30 border border-blue-500/50"
                : "bg-gray-700/50 hover:bg-gray-700"
            }`}
          >
            <Box className={`w-3 h-3 shrink-0 ${selectedMeshIndex === index ? "text-blue-400" : "text-gray-400"}`} />
            <span className="text-gray-200 flex-1 truncate">{mesh.name}</span>
            <button
              onClick={(e) => { e.stopPropagation(); setMeshVisible(index, !mesh.visible); }}
              className="text-gray-500 hover:text-white transition-colors cursor-pointer shrink-0"
              title={mesh.visible ? "Hide" : "Show"}
            >
              {mesh.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); removeLoadedMesh(index); }}
              className="text-gray-500 hover:text-red-400 transition-colors cursor-pointer shrink-0"
              title="Remove mesh"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
          {selectedMeshIndex === index && (
            <div className="mt-1 ml-5 space-y-1">
              <Vec3Group
                label="Position"
                values={[mesh.x, mesh.y, mesh.z]}
                step={0.1}
                onChange={(x, y, z) => setMeshPosition(index, x, y, z)}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// --- Simulation ---

function SimulationSection({ bridge }: { bridge: ReturnType<typeof useRenderer>["bridge"] }) {
  const { simulation, addClothMesh, addClothMeshHorizontal, toggleSimulation, resetCloth, setGravity, setWindForce, setClothStiffness, setClothDamping, setClothFriction, selectCloth, translateCloth } = bridge;

  const [clothWidth, setClothWidth] = useState(3.0);
  const [clothHeight, setClothHeight] = useState(3.0);
  const [clothRes, setClothRes] = useState(30);
  const [dropHeight, setDropHeight] = useState(4.0);

  const handleAddCloth = useCallback(() => {
    addClothMesh(clothWidth, clothHeight, clothRes, clothRes);
  }, [addClothMesh, clothWidth, clothHeight, clothRes]);

  const handleDropCloth = useCallback(() => {
    addClothMeshHorizontal(clothWidth, clothHeight, clothRes, clothRes, dropHeight);
  }, [addClothMeshHorizontal, clothWidth, clothHeight, clothRes, dropHeight]);

  const isClothSelected = simulation.selectedObjectType === 'cloth';

  return (
    <div className="space-y-3">
      {/* Cloth Size Settings */}
      <div className="space-y-2">
        <label className="text-xs text-gray-400 block">Cloth Size</label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] text-gray-500 block">Width</label>
            <input type="number" min={0.5} max={10} step={0.5} value={clothWidth}
              onChange={(e) => setClothWidth(parseFloat(e.target.value) || 0.5)}
              className="w-full bg-gray-700 text-white text-xs px-2 py-1 rounded border border-gray-600 focus:border-blue-500 focus:outline-none" />
          </div>
          <div>
            <label className="text-[10px] text-gray-500 block">Height</label>
            <input type="number" min={0.5} max={10} step={0.5} value={clothHeight}
              onChange={(e) => setClothHeight(parseFloat(e.target.value) || 0.5)}
              className="w-full bg-gray-700 text-white text-xs px-2 py-1 rounded border border-gray-600 focus:border-blue-500 focus:outline-none" />
          </div>
          <div>
            <label className="text-[10px] text-gray-500 block">Resolution</label>
            <input type="number" min={5} max={60} step={5} value={clothRes}
              onChange={(e) => setClothRes(parseInt(e.target.value) || 5)}
              className="w-full bg-gray-700 text-white text-xs px-2 py-1 rounded border border-gray-600 focus:border-blue-500 focus:outline-none" />
          </div>
          <div>
            <label className="text-[10px] text-gray-500 block">Drop Height</label>
            <input type="number" min={1} max={20} step={0.5} value={dropHeight}
              onChange={(e) => setDropHeight(parseFloat(e.target.value) || 1)}
              className="w-full bg-gray-700 text-white text-xs px-2 py-1 rounded border border-gray-600 focus:border-blue-500 focus:outline-none" />
          </div>
        </div>
      </div>

      {/* Hang / Drop buttons — always visible */}
      <div className="flex gap-2">
        <button
          onClick={handleAddCloth}
          className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium px-3 py-1.5 rounded transition-colors cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          Hang
        </button>
        <button
          onClick={handleDropCloth}
          className="flex-1 flex items-center justify-center gap-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium px-3 py-1.5 rounded transition-colors cursor-pointer"
        >
          <ArrowDown className="w-3.5 h-3.5" />
          Drop
        </button>
      </div>

      {/* Play / Pause / Reset — only after cloth added */}
      {simulation.clothAdded && (
        <div className="flex gap-2">
          <button
            onClick={() => toggleSimulation(!simulation.running)}
            className={`flex-1 flex items-center justify-center gap-1.5 text-white text-xs font-medium px-3 py-1.5 rounded transition-colors cursor-pointer ${
              simulation.running
                ? "bg-amber-600 hover:bg-amber-500"
                : "bg-green-600 hover:bg-green-500"
            }`}
          >
            {simulation.running ? (
              <><Pause className="w-3.5 h-3.5" /> Pause</>
            ) : (
              <><Play className="w-3.5 h-3.5" /> Play</>
            )}
          </button>
          <button
            onClick={resetCloth}
            className="flex items-center justify-center gap-1.5 bg-gray-600 hover:bg-gray-500 text-white text-xs font-medium px-3 py-1.5 rounded transition-colors cursor-pointer"
            title="Reset Cloth"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Physics parameters */}
      {simulation.clothAdded && (
        <div className="space-y-2">
          <Vec3Group label="Gravity" values={simulation.gravity} step={0.1} onChange={(x, y, z) => setGravity(x, y, z)} />
          <Vec3Group label="Wind Force" values={simulation.wind} step={0.1} onChange={(x, y, z) => setWindForce(x, y, z)} />

          <div>
            <label className="text-xs text-gray-400 mb-1 block">Stiffness ({simulation.stiffness.toFixed(2)})</label>
            <input type="range" min={0} max={1} step={0.01} value={simulation.stiffness}
              onChange={(e) => setClothStiffness(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">Damping ({simulation.damping.toFixed(3)})</label>
            <input type="range" min={0} max={0.1} step={0.001} value={simulation.damping}
              onChange={(e) => setClothDamping(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
          </div>

          <div>
            <label className="text-xs text-gray-400 mb-1 block">Friction ({simulation.friction.toFixed(2)})</label>
            <input type="range" min={0} max={1} step={0.01} value={simulation.friction}
              onChange={(e) => setClothFriction(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-orange-500" />
          </div>
        </div>
      )}

      {/* Cloth selection & position */}
      {isClothSelected && simulation.clothAdded && (
        <div className="space-y-2 border-t border-gray-700 pt-2">
          <label className="text-xs text-yellow-400 block">Cloth Selected</label>
          <div>
            <label className="text-xs text-gray-400 mb-1 block">Move Offset</label>
            <div className="grid grid-cols-3 gap-2">
              {["X", "Y", "Z"].map((axis, i) => (
                <button key={axis} onClick={() => {
                  const d: [number, number, number] = [0, 0, 0];
                  d[i] = 0.5;
                  translateCloth(d[0], d[1], d[2]);
                }}
                  className="bg-gray-700 hover:bg-gray-600 text-white text-xs px-2 py-1 rounded cursor-pointer">
                  +{axis}
                </button>
              ))}
              {["X", "Y", "Z"].map((axis, i) => (
                <button key={`-${axis}`} onClick={() => {
                  const d: [number, number, number] = [0, 0, 0];
                  d[i] = -0.5;
                  translateCloth(d[0], d[1], d[2]);
                }}
                  className="bg-gray-700 hover:bg-gray-600 text-white text-xs px-2 py-1 rounded cursor-pointer">
                  -{axis}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Collision Spheres ---

function CollisionSpheresSection({ bridge }: { bridge: ReturnType<typeof useRenderer>["bridge"] }) {
  const { simulation, addCollisionSphere, removeCollisionSphere, selectSphere, deselectAll, setCollisionSpherePosition } = bridge;

  const handleAddSphere = useCallback(() => {
    addCollisionSphere(0, 1.5, 0, 0.5);
  }, [addCollisionSphere]);

  const selectedIndex = simulation.selectedObjectType === 'sphere' ? simulation.selectedObjectIndex : -1;

  return (
    <div className="space-y-2">
      <button
        onClick={handleAddSphere}
        className="w-full flex items-center justify-center gap-1.5 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium px-3 py-1.5 rounded transition-colors cursor-pointer"
      >
        <Plus className="w-3.5 h-3.5" />
        Add Sphere
      </button>

      {simulation.collisionSpheres.length > 0 && (
        <div className="space-y-1">
          {simulation.collisionSpheres.map((sphere, index) => (
            <div key={index}>
              <div
                onClick={() => selectedIndex === index ? deselectAll() : selectSphere(index)}
                className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs cursor-pointer transition-colors ${
                  selectedIndex === index
                    ? "bg-yellow-600/30 border border-yellow-500/50"
                    : "bg-gray-700/50 hover:bg-gray-700"
                }`}
              >
                <Circle className={`w-3 h-3 shrink-0 ${selectedIndex === index ? "text-yellow-400" : "text-cyan-400"}`} />
                <span className="text-gray-300 flex-1 truncate">
                  ({sphere.x.toFixed(1)}, {sphere.y.toFixed(1)}, {sphere.z.toFixed(1)}) r={sphere.radius.toFixed(1)}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); removeCollisionSphere(index); }}
                  className="text-gray-500 hover:text-red-400 transition-colors cursor-pointer shrink-0"
                  title="Remove sphere"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
              {selectedIndex === index && (
                <div className="mt-1 ml-5">
                  <Vec3Group
                    label="Position"
                    values={[sphere.x, sphere.y, sphere.z]}
                    step={0.1}
                    onChange={(x, y, z) => setCollisionSpherePosition(index, x, y, z)}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {simulation.collisionSpheres.length === 0 && (
        <p className="text-xs text-gray-500 text-center py-1">No collision spheres</p>
      )}
    </div>
  );
}

// --- Mesh to Cloth ---

function MeshToClothSection({ bridge }: { bridge: ReturnType<typeof useRenderer>["bridge"] }) {
  const { convertMeshToCloth, getLoadedMeshCount, getLoadedMeshName } = bridge;
  const [selectedMesh, setSelectedMesh] = useState(0);
  const [pinMode, setPinMode] = useState(1); // 0=none, 1=top edge

  const meshCount = getLoadedMeshCount();

  const meshOptions = [];
  for (let i = 0; i < meshCount; i++) {
    meshOptions.push({ index: i, name: getLoadedMeshName(i) || `mesh_${i}` });
  }

  const handleConvert = useCallback(() => {
    convertMeshToCloth(selectedMesh, pinMode);
  }, [convertMeshToCloth, selectedMesh, pinMode]);

  if (meshCount === 0) {
    return <p className="text-xs text-gray-500 text-center py-1">Upload a model first</p>;
  }

  return (
    <div className="space-y-2">
      {/* Mesh selector */}
      <div>
        <label className="text-xs text-gray-400 mb-1 block">Target Mesh</label>
        <select
          value={selectedMesh}
          onChange={(e) => setSelectedMesh(parseInt(e.target.value))}
          className="w-full bg-gray-700 text-white text-xs px-2 py-1.5 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
        >
          {meshOptions.map((m) => (
            <option key={m.index} value={m.index}>{m.name}</option>
          ))}
        </select>
      </div>

      {/* Pin mode */}
      <div>
        <label className="text-xs text-gray-400 mb-1 block">Pin Mode</label>
        <select
          value={pinMode}
          onChange={(e) => setPinMode(parseInt(e.target.value))}
          className="w-full bg-gray-700 text-white text-xs px-2 py-1.5 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
        >
          <option value={0}>None (Free Fall)</option>
          <option value={1}>Top Edge (Hang)</option>
        </select>
      </div>

      {/* Convert button */}
      <button
        onClick={handleConvert}
        className="w-full flex items-center justify-center gap-1.5 bg-orange-600 hover:bg-orange-500 text-white text-xs font-medium px-3 py-1.5 rounded transition-colors cursor-pointer"
      >
        <Shirt className="w-3.5 h-3.5" />
        Convert to Cloth
      </button>
    </div>
  );
}

// --- Color Helpers ---

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) =>
    Math.round(Math.min(1, Math.max(0, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return [0.8, 0.8, 0.8];
  return [
    parseInt(result[1], 16) / 255,
    parseInt(result[2], 16) / 255,
    parseInt(result[3], 16) / 255,
  ];
}
