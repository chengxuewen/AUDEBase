/**
 * plugin-core — Bootstrap plugin that creates initial system data.
 *
 * This is the Odoo `base` module equivalent. It runs before any other plugin
 * and populates the database with core permissions, roles, the admin user,
 * and default menu items.
 *
 * Zero dependencies: does not import from any other @audebase/plugin-* package.
 */
export { install } from "./install";
export type {
  BootstrapMenuItem,
  BootstrapPermission,
  BootstrapRole,
  BootstrapUser,
  PermissionAction,
  PluginDbContext,
  PluginInstallContext,
  PluginLogger,
} from "./install";

/** Manifest metadata consumed by PluginManager */
export const manifest = {
  name: "@audebase/plugin-core",
  version: "1.0.0",
  displayName: "Core Plugin",
  description: "Bootstrap plugin that creates initial system data on first run",
  category: "SYSTEM" as const,
  dependencies: [] as string[],
  runtime: {
    mode: "inline" as const,
    partition: "SYSTEM" as const,
  },
  lifecycle: {
    autoInstall: true,
    hooks: {
      install: "install",
    },
  },
};
