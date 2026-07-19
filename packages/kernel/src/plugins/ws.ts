import fp from "fastify-plugin";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { WsManager, authenticateWs, type WsClient } from "@audebase/websocket";

// Module-level manager — created during plugin registration
let manager: WsManager | null = null;

declare module "fastify" {
  interface FastifyInstance {
    /** The WebSocket manager instance */
    wsManager: WsManager;
    /**
     * Authenticate a WebSocket token.
     * Default: uses the auth module from @audebase/websocket.
     * Override via WsPluginOptions.authenticate.
     */
    wsAuth: (token: string) => Promise<WsClient | null>;
  }
}

/** Plugin registration options */
export interface WsPluginOptions {
  /**
   * Custom auth function. If not provided, uses the default
   * mock-based authenticator from @audebase/websocket.
   */
  readonly authenticate?: (token: string) => Promise<WsClient | null>;
}

/**
 * wsPlugin — Fastify WebSocket plugin (Phase 2 shim).
 *
 * Phase 2: registers the /ws route and HTTP-based subscribe/unsubscribe
 * endpoints as a shim. The full WebSocket upgrade will use @fastify/websocket
 * in a future Phase.
 */
function wsPluginFn(fastify: FastifyInstance, options: WsPluginOptions = {}): void {
  const authenticator = options.authenticate ?? authenticateWs;

  manager = new WsManager({
    sendToClient: (_clientId, _message) => {
      // ponytail: no-op in Phase 2 shim — real implementation
      // will use ws.send() via @fastify/websocket connection context
    },
  });

  fastify.decorate("wsManager", manager);
  fastify.decorate("wsAuth", authenticator);

  /**
   * GET /ws — WebSocket endpoint health check.
   * In production, this would handle WebSocket upgrade.
   */
  fastify.get("/ws", () => {
    return {
      status: "ok",
      protocol: "websocket",
      connected: manager.connectedCount,
      subscriptions: manager.getRoomsManager().clientCount,
    };
  });

  /**
   * POST /ws/subscribe — Phase 2 shim for the subscribe protocol.
   */
  fastify.post(
    "/ws/subscribe",
    async (
      request: FastifyRequest<{
        Body: { token: string; collection: string; events: string[] };
      }>,
      reply: FastifyReply,
    ) => {
      const { token, collection, events } = request.body;

      if (!token || !collection) {
        return reply.status(400).send({
          type: "error",
          message: "token and collection are required",
        });
      }

      const client = await authenticator(token);
      if (!client) {
        return reply.status(401).send({
          type: "error",
          message: "Invalid authentication token",
        });
      }

      // Register client if not already connected
      if (!manager.isConnected(client.id)) {
        manager.registerClient(client);
      }

      manager.subscribe(client.id, collection, events);

      return reply.send({
        type: "subscribed",
        collection,
        events,
      });
    },
  );

  /**
   * POST /ws/unsubscribe — Phase 2 shim for the unsubscribe protocol.
   */
  fastify.post(
    "/ws/unsubscribe",
    async (
      request: FastifyRequest<{
        Body: { token: string; collection: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { token, collection } = request.body;

      if (!token || !collection) {
        return reply.status(400).send({
          type: "error",
          message: "token and collection are required",
        });
      }

      const client = await authenticator(token);
      if (!client) {
        return reply.status(401).send({
          type: "error",
          message: "Invalid authentication token",
        });
      }

      manager.unsubscribe(client.id, collection);

      return reply.send({
        type: "unsubscribed",
        collection,
      });
    },
  );
}

/**
 * Get the active WebSocket manager (for tests and downstream usage).
 * Returns null if the plugin has not been registered.
 */
export function getWsManager(): WsManager | null {
  return manager;
}

export default fp(wsPluginFn, {
  name: "audebase-ws",
  fastify: "5.x",
});
