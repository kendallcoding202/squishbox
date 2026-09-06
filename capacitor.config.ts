import type { CapacitorConfig } from "@capacitor/cli";

// Native shell for the App Store / TestFlight. The web app in dist/ is the whole app.
// Change appId to your own reverse-domain bundle identifier before the first Xcode build.
const config: CapacitorConfig = {
  appId: "com.squishbox.app",
  appName: "Squishbox",
  webDir: "dist",
  ios: {
    contentInset: "never",
    backgroundColor: "#fff4e6",
    scheme: "Squishbox",
  },
};

export default config;
