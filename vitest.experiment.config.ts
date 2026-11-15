import { defineConfig } from "vitest/config";

// v1.11.0 — esperimenti evolutivi a richiesta (scripts/*.experiment.ts), separati dal benchmark di scala e dalla suite veloce.
export default defineConfig({
  test: {
    environment: "node",
    include: ["scripts/**/*.experiment.ts"],
    testTimeout: 3_000_000,
  },
});
