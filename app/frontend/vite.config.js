import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ command }) => ({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  base: command === "serve" ? "/" : "./",
  build: {
    // Target Electron's Chromium for optimal output
    target: "es2020",
    // Increase chunk warning threshold for POS app
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          // Split heavy vendor libraries into separate chunks
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-charts": ["recharts"],
          "vendor-icons": ["lucide-react"],
        },
      },
    },
    // Enable minification
    minify: "esbuild",
    // Source maps off for production (smaller bundle, faster load)
    sourcemap: false,
  },
}));
