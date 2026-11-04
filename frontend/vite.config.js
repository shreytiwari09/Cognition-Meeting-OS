import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  // 5174, not Vite's default 5173, so it doesn't collide with other local Vite apps.
  // The extension's bridge script (extension/manifest.json) and the backend's CORS default expect this port.
  server: { port: 5174, strictPort: true },
})