import { useState, useRef, useCallback, useEffect } from "react";
import { Upload, Download, Menu, Sun, Moon, Settings, FolderOpen, Eye, Cuboid, Trash2 } from "lucide-react";
import { useRenderer } from "./context/RendererContext.tsx";
import { loadFile, type LoadedFile } from "./lib/fileLoader.ts";
import { loadSceneState, clearSceneState } from "./lib/storage.ts";
import ModelViewer from "./components/ModelViewer.tsx";
import FilePanel from "./components/FilePanel.tsx";
import PropertiesPanel from "./components/PropertiesPanel.tsx";
import StatusBar from "./components/StatusBar.tsx";

interface UploadedFile extends LoadedFile {
  id: string;
}

export default function App() {
  const { module, bridge } = useRenderer();
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [showFiles, setShowFiles] = useState(true);
  const [showProperties, setShowProperties] = useState(true);
  const [darkMode, setDarkMode] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [mobilePanel, setMobilePanel] = useState<'viewer' | 'files' | 'properties'>('viewer');

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  // Restore scene state from LocalStorage (IndexedDB disabled)
  const restoredRef = useRef(false);
  useEffect(() => {
    if (!module || restoredRef.current) return;
    restoredRef.current = true;

    const sceneState = loadSceneState();
    if (sceneState) {
      for (const s of sceneState.collisionSpheres) {
        bridge.addCollisionSphere(s.x, s.y, s.z, s.radius);
      }
      if (sceneState.material) {
        const [r, g, b] = sceneState.material.baseColor;
        bridge.setBaseColor(r, g, b);
        bridge.setMetallic(sceneState.material.metallic);
        bridge.setRoughness(sceneState.material.roughness);
      }
      if (sceneState.clothSettings) {
        const cs = sceneState.clothSettings;
        bridge.setGravity(cs.gravity[0], cs.gravity[1], cs.gravity[2]);
        bridge.setWindForce(cs.wind[0], cs.wind[1], cs.wind[2]);
        bridge.setClothStiffness(cs.stiffness);
        bridge.setClothDamping(cs.damping);
        bridge.setClothFriction(cs.friction);
      }
    }
  }, [module, bridge]);

  const handleUpload = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      for (let i = 0; i < fileList.length; i++) {
        const loaded = await loadFile(fileList[i]);
        const id = `${Date.now()}-${i}`;
        const uploadedFile: UploadedFile = { ...loaded, id };
        setFiles((prev) => [...prev, uploadedFile]);

        if (bridge.loadModel(loaded.data, loaded.extension)) {
          setActiveFileId(id);
        }
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [bridge]
  );

  const handleFileSelect = useCallback(
    (file: UploadedFile) => {
      if (file.id === activeFileId) return;
      if (bridge.loadModel(file.data, file.extension)) {
        setActiveFileId(file.id);
      }
    },
    [activeFileId, bridge]
  );

  const handleDeleteFile = useCallback(
    (fileId: string) => {
      setFiles((prev) => prev.filter((f) => f.id !== fileId));
      if (activeFileId === fileId) {
        setActiveFileId(null);
      }
    },
    [activeFileId]
  );

  const handleExport = useCallback(() => {
    if (!module) return;
    const dataUrl = module.exportScreenshot();
    if (dataUrl) {
      const link = document.createElement("a");
      link.download = "screenshot.png";
      link.href = dataUrl;
      link.click();
    }
  }, [module]);

  return (
    <div className="flex flex-col h-full w-full bg-gray-900 text-gray-200">
      {/* Top Toolbar */}
      <div className="bg-gray-800 border-b border-gray-700 px-2 md:px-4 py-2 md:py-3 flex items-center justify-between shrink-0">
        {/* Left Group */}
        <div className="flex items-center gap-2 md:gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 md:w-8 md:h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Box3D className="w-4 h-4 md:w-5 md:h-5 text-white" />
            </div>
            <h1 className="text-white font-semibold text-sm md:text-lg hidden sm:block">3D Viewer</h1>
          </div>

          {/* Desktop: Files toggle */}
          <button
            onClick={() => setShowFiles(!showFiles)}
            className="hidden md:flex px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-md transition-colors items-center gap-2 cursor-pointer"
          >
            <Menu className="w-4 h-4" />
            Files
          </button>
        </div>

        {/* Right Group */}
        <div className="flex items-center gap-1 md:gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".obj,.gltf,.glb,.fbx,.stl,.dae,.3ds"
            multiple
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />
          {/* Mobile: icon only */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="md:hidden p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors cursor-pointer"
          >
            <Upload className="w-4 h-4" />
          </button>
          {/* Desktop: full button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="hidden md:flex px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors items-center gap-2 font-medium cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            Upload Model
          </button>
          <button
            onClick={handleExport}
            disabled={!module}
            className="hidden md:flex px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors items-center gap-2 font-medium disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
          {/* Mobile: export icon */}
          <button
            onClick={handleExport}
            disabled={!module}
            className="md:hidden p-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors cursor-pointer disabled:opacity-40"
          >
            <Download className="w-4 h-4" />
          </button>

          <div className="w-px h-6 bg-gray-700 hidden md:block" />

          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors cursor-pointer hidden md:block"
            title="Toggle Theme"
          >
            {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <button
            onClick={() => setShowProperties(!showProperties)}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors cursor-pointer hidden md:block"
            title="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
          <button
            onClick={() => {
              clearSceneState();
              window.location.reload();
            }}
            className="p-2 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded-lg transition-colors cursor-pointer"
            title="Clear All Saved Data"
          >
            <Trash2 className="w-4 h-4 md:w-5 md:h-5" />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {isMobile ? (
          /* Mobile: single active panel */
          <div className="flex-1 flex flex-col min-h-0">
            {/* ModelViewer always mounted — hidden via CSS when inactive */}
            <div className={mobilePanel === 'viewer' ? 'flex-1 flex flex-col p-1 min-h-0' : 'hidden'}>
              <ModelViewer />
            </div>
            {mobilePanel === 'files' && (
              <div className="flex-1 overflow-y-auto">
                <FilePanel
                  files={files}
                  activeFileId={activeFileId}
                  onFileSelect={handleFileSelect}
                  onDeleteFile={handleDeleteFile}
                  onUploadClick={() => fileInputRef.current?.click()}
                />
              </div>
            )}
            {mobilePanel === 'properties' && (
              <div className="flex-1 overflow-y-auto">
                <PropertiesPanel />
              </div>
            )}
          </div>
        ) : (
          /* Desktop: 3-panel layout */
          <>
            {showFiles && (
              <div className="w-64 flex-shrink-0">
                <FilePanel
                  files={files}
                  activeFileId={activeFileId}
                  onFileSelect={handleFileSelect}
                  onDeleteFile={handleDeleteFile}
                  onUploadClick={() => fileInputRef.current?.click()}
                />
              </div>
            )}
            <div className="flex-1 flex flex-col p-4 min-h-0">
              <ModelViewer />
            </div>
            {showProperties && (
              <div className="w-72 flex-shrink-0">
                <PropertiesPanel />
              </div>
            )}
          </>
        )}
      </div>

      {/* Mobile Bottom Tab Bar */}
      {isMobile && (
        <div className="bg-gray-800 border-t border-gray-700 flex shrink-0">
          {([
            { key: 'files' as const, icon: FolderOpen, label: 'Files' },
            { key: 'viewer' as const, icon: Cuboid, label: 'Viewer' },
            { key: 'properties' as const, icon: Eye, label: 'Properties' },
          ]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setMobilePanel(tab.key)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2 transition-colors cursor-pointer ${
                mobilePanel === tab.key
                  ? 'text-blue-400 bg-gray-700/50'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <tab.icon className="w-5 h-5" />
              <span className="text-[10px]">{tab.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Desktop Status Bar */}
      {!isMobile && <StatusBar />}
    </div>
  );
}

// Simple 3D Box icon component (matches Figma original)
function Box3D({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}
