import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// SINGLEFILE=1 inlines everything (and the index) into one HTML file for previews.
export default defineConfig({
  base: "./",
  plugins: [react(), ...(process.env.SINGLEFILE ? [viteSingleFile()] : [])],
  server: { port: 5173, fs: { allow: ["../.."] } },
});
