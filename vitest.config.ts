import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

const packagesDir = resolve(__dirname, "packages");
export default defineConfig({
  // Resolve @audebase/* workspace packages to their local directories
  resolve: {
    alias: {
      "@audebase/audit": resolve(packagesDir, "audit/src"),
      "@audebase/health-check": resolve(packagesDir, "health-check/src"),
      "@audebase/i18n": resolve(packagesDir, "i18n/src"),
      "@audebase/logging-infra": resolve(packagesDir, "logging-infra/src"),
      "@audebase/manifest-engine": resolve(packagesDir, "manifest-engine/src"),
      "@audebase/migration-engine": resolve(packagesDir, "migration-engine/src"),
      "@audebase/plugin-core": resolve(packagesDir, "plugin-core/src"),
      "@audebase/plugin-framework": resolve(packagesDir, "plugin-framework/src"),
      "@audebase/rbac": resolve(packagesDir, "rbac/src"),
      "@audebase/shared-types": resolve(packagesDir, "shared-types/src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["packages/*/src/**/*.test.ts", "packages/*/src/**/*.spec.ts"],
    exclude: ["node_modules", "dist", ".turbo"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      include: ["packages/*/src/**/*.ts"],
      exclude: [
        "packages/*/src/**/*.test.ts",
        "packages/*/src/**/*.spec.ts",
        "packages/*/src/**/index.ts",
        "packages/*/src/**/__tests__/**",
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
