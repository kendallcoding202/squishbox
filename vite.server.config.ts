import { defineConfig } from "vite";

// Bundles server/index.ts (and the shared game modules it imports) into one Node file.
export default defineConfig({
  build: {
    ssr: "server/index.ts",
    outDir: "server/dist",
    emptyOutDir: true,
    target: "node22",
    rollupOptions: { output: { entryFileNames: "index.js", format: "es" } },
  },
  ssr: { noExternal: true },
});
