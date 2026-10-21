import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri expects a fixed port in dev.
export default defineConfig({
  base: "./",
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true, fs: { allow: ["../.."] } },
  envPrefix: ["VITE_", "TAURI_"],
  build: { target: "es2022" },
});
