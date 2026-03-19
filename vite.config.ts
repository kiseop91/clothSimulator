import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'fs';

// HTTPS config: generate certs with mkcert for external WebGPU access
// mkcert 114.203.37.57 localhost 127.0.0.1
const httpsConfig = (() => {
  const certFile = './114.203.37.57+2.pem';
  const keyFile = './114.203.37.57+2-key.pem';
  if (fs.existsSync(certFile) && fs.existsSync(keyFile)) {
    return {
      key: fs.readFileSync(keyFile),
      cert: fs.readFileSync(certFile),
    };
  }
  return undefined;
})();

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    https: httpsConfig,
    host: '0.0.0.0',
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  optimizeDeps: {
    exclude: ['renderer'],
  },
});
