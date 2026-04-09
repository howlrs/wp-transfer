import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  {
    test: {
      include: ["packages/*/tests/**/*.test.ts"],
      name: "packages",
      coverage: {
        provider: "v8",
        include: ["packages/*/src/**/*.ts"],
        exclude: ["packages/*/src/index.ts"],
        thresholds: {
          lines: 85,
          functions: 85,
          branches: 70,
        },
      },
    },
  },
  {
    test: {
      include: ["apps/*/tests/**/*.test.ts"],
      name: "apps",
    },
  },
]);
