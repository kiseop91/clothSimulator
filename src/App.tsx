import { useState, useRef, useCallback } from "react";
import { Upload, Download, Menu, Sun, Moon, Settings } from "lucide-react";
import { useRenderer } from "./context/RendererContext.tsx";
import { loadFile, type LoadedFile } from "./lib/fileLoader.ts";
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
      <div className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center justify-between shrink-0">
        {/* Left Group: Logo + Files */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Box3D className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-white font-semibold text-lg">3D Model Viewer</h1>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setShowFiles(!showFiles)}
              className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-md transition-colors flex items-center gap-2 cursor-pointer"
            >
              <Menu className="w-4 h-4" />
              Files
            </button>
          </div>
        </div>

        {/* Right Group: Upload + Export + Divider + Sun + Settings */}
        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".obj,.gltf,.glb,.fbx,.stl,.dae,.3ds"
            multiple
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex items-center gap-2 font-medium cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            Upload Model
          </button>
          <button
            onClick={handleExport}
            disabled={!module}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors flex items-center gap-2 font-medium disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Export
          </button>

          <div className="w-px h-6 bg-gray-700" />

          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors cursor-pointer"
            title="Toggle Theme"
          >
            {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <button
            onClick={() => setShowProperties(!showProperties)}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors cursor-pointer"
            title="Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - File Panel */}
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

        {/* Center - 3D Viewport */}
        <div className="flex-1 flex flex-col p-4 min-h-0">
          <ModelViewer />
        </div>

        {/* Right Sidebar - Properties Panel */}
        {showProperties && (
          <div className="w-72 flex-shrink-0">
            <PropertiesPanel />
          </div>
        )}
      </div>

      {/* Bottom Status Bar */}
      <StatusBar />
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
