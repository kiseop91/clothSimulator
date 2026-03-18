import { File, Folder, Trash2 } from "lucide-react";
import { formatFileSize } from "../lib/fileLoader.ts";

export interface FileInfo {
  id: string;
  name: string;
  size: number;
  extension: string;
  data: ArrayBuffer;
}

interface MockFileItem {
  id: string;
  name: string;
  type: "file" | "folder";
  size?: string;
}

const mockFiles: MockFileItem[] = [
  { id: "1", name: "Models", type: "folder" },
  { id: "2", name: "character.obj", type: "file", size: "2.4 MB" },
  { id: "3", name: "building.fbx", type: "file", size: "5.1 MB" },
  { id: "4", name: "scene.gltf", type: "file", size: "1.8 MB" },
  { id: "5", name: "Materials", type: "folder" },
];

interface FilePanelProps {
  files: FileInfo[];
  activeFileId: string | null;
  onFileSelect: (file: FileInfo) => void;
  onDeleteFile: (fileId: string) => void;
  onUploadClick: () => void;
}

export default function FilePanel({
  files,
  activeFileId,
  onFileSelect,
  onDeleteFile,
}: FilePanelProps) {
  return (
    <div className="bg-gray-800 border-r border-gray-700 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <h2 className="text-white font-semibold text-sm">Files</h2>
      </div>

      {/* File List */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-2 space-y-1">
          {/* Uploaded Files */}
          {files.length > 0 &&
            files.map((file) => {
              const isActive = file.id === activeFileId;
              return (
                <div
                  key={file.id}
                  className="group"
                >
                  <div
                    onClick={() => onFileSelect(file)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md hover:bg-gray-700/50 cursor-pointer transition-colors ${
                      isActive ? "bg-blue-600/20 text-blue-400" : ""
                    }`}
                  >
                    <File className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-200 truncate">{file.name}</p>
                      <p className="text-xs text-gray-500">
                        {formatFileSize(file.size)} &middot; {file.extension.toUpperCase()}
                      </p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeleteFile(file.id); }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-gray-600 rounded cursor-pointer"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-gray-400" />
                    </button>
                  </div>
                </div>
              );
            })}

          {/* Mock File List */}
          {files.length === 0 &&
            mockFiles.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-gray-700/50 cursor-pointer group transition-colors"
              >
                {item.type === "folder" ? (
                  <Folder className="w-4 h-4 text-blue-400 flex-shrink-0" />
                ) : (
                  <File className="w-4 h-4 text-gray-400 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-200 truncate">{item.name}</p>
                  {item.size && (
                    <p className="text-xs text-gray-500">{item.size}</p>
                  )}
                </div>
                <button
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-gray-600 rounded cursor-pointer"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5 text-gray-400" />
                </button>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
