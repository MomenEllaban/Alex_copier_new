import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // The CODE-AUDIT suites import every route module, so a single test can
    // spend seconds loading code. Under parallel load that overran vitest's
    // 5s default and failed intermittently even though nothing was wrong.
    testTimeout: 20_000,
  },
});
