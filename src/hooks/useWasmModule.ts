import { useState, useEffect, useRef } from "react";
import type { WasmModule } from "../types/wasm.d.ts";

interface UseWasmModuleResult {
  module: WasmModule | null;
  loading: boolean;
  error: string | null;
}

declare global {
  interface Window {
    createRenderer?: (config?: object) => Promise<WasmModule>;
  }
}

export function useWasmModule(): UseWasmModuleResult {
  const [module, setModule] = useState<WasmModule | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const moduleRef = useRef<WasmModule | null>(null);
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    async function loadWasm() {
      try {
        setLoading(true);
        setError(null);

        // MODULARIZE mode: renderer.js defines window.createRenderer as a factory
        const wasmModule = await new Promise<WasmModule>((resolve, reject) => {
          if (window.createRenderer) {
            window.createRenderer().then(resolve).catch(reject);
            return;
          }

          const script = document.createElement("script");
          script.src = "/wasm/renderer.js";
          script.async = true;

          script.onload = () => {
            script.remove(); // Clean up script element from DOM
            if (typeof window.createRenderer === "function") {
              window.createRenderer()
                .then((mod: WasmModule) => resolve(mod))
                .catch((err: Error) => reject(err));
            } else {
              reject(new Error("WASM factory 'createRenderer' not found after loading script"));
            }
          };

          script.onerror = () => {
            reject(
              new Error(
                "Failed to load WASM renderer script. Make sure to build the WASM module first: npm run build:wasm"
              )
            );
          };

          document.head.appendChild(script);
        });

        moduleRef.current = wasmModule;
        setModule(wasmModule);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown error loading WASM module";
        setError(message);
      } finally {
        setLoading(false);
      }
    }

    loadWasm();

    return () => {
      if (moduleRef.current?.destroyRenderer) {
        moduleRef.current.destroyRenderer();
        moduleRef.current = null;
      }
    };
  }, []);

  return { module, loading, error };
}
