import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import dts from "vite-plugin-dts";

// Three modes, selected by env:
//   vite / vite dev             -> serves the demo harness from /demo
//   BUILD_TARGET=lib vite build -> builds the library from src/index.ts -> dist/
//   vite build (default)        -> builds the demo harness as a static site
//                                  -> dist-demo/ (deployed to GitHub Pages)
const isLibBuild = process.env.BUILD_TARGET === "lib";

// GitHub Pages serves a project site under /<repo>/. The Pages workflow sets
// DEMO_BASE; local demo builds default to root.
const demoBase = process.env.DEMO_BASE ?? "/";

export default defineConfig({
  base: isLibBuild ? "/" : demoBase,
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
    : {
        // Static demo build for visual review / GitHub Pages.
        outDir: "dist-demo",
        emptyOutDir: true,
        sourcemap: true,
      },
});
