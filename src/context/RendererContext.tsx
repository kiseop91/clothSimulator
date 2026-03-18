import { createContext, useContext, type ReactNode } from "react";
import { useWasmModule } from "../hooks/useWasmModule.ts";
import { useRendererBridge, type RendererBridge } from "../hooks/useRendererBridge.ts";
import type { WasmModule } from "../types/wasm.d.ts";

interface RendererContextValue {
  module: WasmModule | null;
  wasmLoading: boolean;
  wasmError: string | null;
  bridge: RendererBridge;
}

const RendererContext = createContext<RendererContextValue | null>(null);

export function RendererProvider({ children }: { children: ReactNode }) {
  const { module, loading, error } = useWasmModule();
  const bridge = useRendererBridge(module);

  return (
    <RendererContext.Provider
      value={{
        module,
        wasmLoading: loading,
        wasmError: error,
        bridge,
      }}
    >
      {children}
    </RendererContext.Provider>
  );
}

export function useRenderer(): RendererContextValue {
  const ctx = useContext(RendererContext);
  if (!ctx) {
    throw new Error("useRenderer must be used within a RendererProvider");
  }
  return ctx;
}
