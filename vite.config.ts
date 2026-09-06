import { defineConfig } from "vitest/config";

// GitHub Pages serves the site under /squishbox/, local dev serves at /.
export default defineConfig({
  base: process.env.PAGES_BASE ?? "/",
  build: { target: "es2022" },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
