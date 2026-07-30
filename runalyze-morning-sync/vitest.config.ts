import { defineConfig } from "vitest/config";

// `tsc -p tsconfig.json` emits compiled copies of the tests under dist/.
// Vitest must not discover those: they run from a different directory depth,
// so any fixture path resolved relative to the test file breaks, producing
// failures that look like regressions in the source tests.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    exclude: ["dist/**", "node_modules/**"]
  }
});
