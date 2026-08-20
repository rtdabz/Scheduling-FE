import { defineConfig } from "vitest/config";

// Kept separate from vite.config.ts so the dev-server config (proxy, HMR,
// tunnel hosts) stays untouched by test settings.
export default defineConfig({
  // Keep the vitest cache inside wicars-ui; the default resolution walked up to
  // the repository root, which has no .gitignore.
  cacheDir: "node_modules/.vite",
  test: {
    // jsdom is only needed by the storage/DOM-facing suites; pure logic suites
    // (e.g. the conflict engine and the initial-data mapper) run fine in it too.
    environment: "jsdom",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    restoreMocks: true,
  },
});
