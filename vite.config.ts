import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

// The version and build number live in one place, the Xcode project. The app reads them from
// here so it can tell one build from the next (see src/game/keeper.ts: a new build takes a
// new snapshot of the save before it touches it).
function appBuild(): string {
  try {
    const project = readFileSync(new URL("./ios/App/App.xcodeproj/project.pbxproj", import.meta.url), "utf8");
    const version = /MARKETING_VERSION = ([^;]+);/.exec(project)?.[1]?.trim();
    const build = /CURRENT_PROJECT_VERSION = ([^;]+);/.exec(project)?.[1]?.trim();
    if (version && build) return `${version} (${build})`;
  } catch {
    /* no native project here */
  }
  return "dev";
}

// GitHub Pages serves the site under /squishbox/, local dev serves at /.
export default defineConfig({
  base: process.env.PAGES_BASE ?? "/",
  build: { target: "es2022" },
  define: { __APP_BUILD__: JSON.stringify(appBuild()) },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
