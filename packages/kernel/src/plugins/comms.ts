import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { ServiceRegistry } from "@audebase/plugin-communication";
import type { IServiceRegistry } from "@audebase/plugin-communication";

/** Module-level reference, set during plugin registration */
let registry: ServiceRegistry | null = null;

declare module "fastify" {
  interface FastifyInstance {
    serviceRegistry: IServiceRegistry;
  }
}

/**
 * Get the current ServiceRegistry instance (for testing / introspection).
 *
 * @internal
 */
export function getServiceRegistry(): ServiceRegistry | null {
  return registry;
}

/**
 * commsPlugin — Fastify Plugin Communication 插件
 *
 * Creates an in-memory ServiceRegistry and decorates the Fastify instance.
 * Plugins register services via `fastify.serviceRegistry.register(...)`.
 *
 * Phase 1b: in-memory only (same process). Phase 2: cross-process via JSON-RPC.
 */
function commsPlugin(fastify: FastifyInstance): void {
  registry = new ServiceRegistry();

  fastify.decorate("serviceRegistry", registry);

  fastify.log.info("plugin communication service registry initialized");
}

export default fp(commsPlugin, {
  name: "audebase-comms",
  fastify: "5.x",
});
