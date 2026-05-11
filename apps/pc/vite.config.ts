import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@ddup/shared": path.resolve(__dirname, "../../packages/shared/src")
    }
  },
  server: {
    port: 5174,
    proxy: {
      "/healthz": {
        target: "http://localhost:8000",
        changeOrigin: true
      },
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true
      }
    }
  }
});

