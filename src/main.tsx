import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import "./index.css";
import App from "./App.tsx";
import { AuthProvider } from "./context/AuthContext.tsx";
import { StorageProvider } from "./context/StorageContext.tsx";
import { RendererProvider } from "./context/RendererContext.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <StorageProvider>
          <RendererProvider>
            <App />
          </RendererProvider>
        </StorageProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
