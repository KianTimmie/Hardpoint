import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// Tauri expects a fixed port in dev. SINGLEFILE=1 builds a self-contained demo page.
export default defineConfig({
  base: "./",
  plugins: [react(), ...(process.env.SINGLEFILE ? [viteSingleFile()] : [])],
  clearScreen: false,
  server: { port: 1420, strictPort: true, fs: { allow: ["../.."] } },
  envPrefix: ["VITE_", "TAURI_"],
  build: { target: "es2022" },
});
