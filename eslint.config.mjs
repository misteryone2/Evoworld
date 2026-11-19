import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// G3 — ESLint 9 flat config. The repository pins ESLint 9 but had no config,
// so `npm run lint` exited 2 before reading any source file. The Next.js
// packages already ship flat configs; this file only composes them and keeps
// generated/build artifacts out of the lint scope.
export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Next 16 ships React Hooks plugin rules that did not exist when this
    // codebase was written. Disabling just these two keeps the configuration
    // usable on ESLint 9 without a broad React rewrite unrelated to G3.
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
    },
  },
  {
    // Test fixtures deliberately cast anatomical edge cases; `any` is the
    // existing convention there and changing it would alter expectations.
    files: ["tests/**/*.{ts,tsx}", "scripts/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  globalIgnores([
    "**/node_modules/**",
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);
