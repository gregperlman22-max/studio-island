import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import dts from "vite-plugin-dts";

// Dual-purpose config:
// - `vite` / `vite dev`  -> serves the demo harness from /demo
// - `vite build`         -> builds the library from src/index.ts
const isLibBuild = process.env.BUILD_TARGET === "lib" || process.argv.includes("build");

export default defineConfig({
  plugins: [
    react(),
    ...(isLibBuild ? [dts({ include: ["src"], rollupTypes: false })] : []),
  ],
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
  build: isLibBuild
    ? {
        lib: {
          entry: resolve(__dirname, "src/index.ts"),
          name: "IslandScene",
          formats: ["es", "cjs"],
          fileName: (format) =>
            format === "es" ? "island-scene.js" : "island-scene.cjs",
        },
        rollupOptions: {
          external: ["react", "react-dom", "react/jsx-runtime"],
          output: { globals: { react: "React", "react-dom": "ReactDOM" } },
        },
        sourcemap: true,
        emptyOutDir: true,
      }
    : undefined,
});
