import { defineConfig } from "vitest/config";

// v1.1 — separate from vitest.config.ts on purpose: the world-scale
// benchmark (scripts/worldScale.benchmark.ts) is deliberately slow and
// only meant to be run on demand (`npm run benchmark`), never as part of
// the fast suite `npm run test` runs on every delivery.
export default defineConfig({
  test: {
    environment: "node",
    include: ["scripts/**/*.benchmark.ts"],
    testTimeout: 400_000,
  },
});
