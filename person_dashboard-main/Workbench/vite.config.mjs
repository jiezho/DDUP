import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { workbenchApiPlugin } from "./server/vite-plugin-workbench.mjs";

export default defineConfig({
  cacheDir: process.env.VITE_CACHE_DIR || "node_modules/.vite",
  build: {
    outDir: "dist/client",
    // Rebuild the client directory from scratch so public assets can be copied
    // repeatedly on Windows. Sibling dist/server and dist/.openai outputs are
    // outside this outDir and are recreated by prepare-sites-build.mjs.
    emptyOutDir: true,
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    // This server exposes local Vault reads, note persistence, and a confirmed
    // Codex write action. Keep it loopback-only by default.
    host: "127.0.0.1",
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [
    react(),
    ...(process.env.VITE_WORKBENCH_HOSTED === "true" ? [] : [workbenchApiPlugin()]),
  ],
});
