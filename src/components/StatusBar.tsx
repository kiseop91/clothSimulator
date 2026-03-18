import { useRenderer } from "../context/RendererContext.tsx";

export default function StatusBar() {
  const { wasmLoading, wasmError } = useRenderer();

  let statusLabel = "Ready";
  let statusDetail = "No model loaded";
  if (wasmLoading) {
    statusLabel = "Loading";
    statusDetail = "WASM...";
  } else if (wasmError) {
    statusLabel = "Error";
    statusDetail = wasmError;
  }

  return (
    <div className="bg-gray-800 border-t border-gray-700 px-4 py-2 flex items-center justify-between text-xs text-gray-400">
      <div className="flex items-center gap-4">
        <span>{statusLabel}</span>
        <span className="text-gray-600">|</span>
        <span>{statusDetail}</span>
      </div>
      <div className="flex items-center gap-4">
        <span>Supported formats: OBJ, FBX, GLTF, GLB, STL, DAE, 3DS</span>
      </div>
    </div>
  );
}
