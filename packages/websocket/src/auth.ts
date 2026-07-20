import type { WsClient } from "./types";

/**
 * Validates a JWT token and returns client identity.
 * In Phase 2 uses a mock — production would decode JWT and verify
 * against the kernel auth provider.
 *
 * @returns Client identity, or null if token is invalid
 */
export function authenticateWs(token: string): WsClient | null {
  // ponytail: mock auth — production would decode JWT via kernel auth
  if (!token || token.length < 8) {
    return null;
  }

  // For Phase 2, accept any token starting with "mock-" for testing
  // Production: verify JWT signature, check expiry, lookup user
  if (!token.startsWith("mock-")) {
    return null;
  }

  const parts = token.split("-");
  const tenantId = parts[1] ?? "default";
  const userId = parts[2] ?? "unknown";

  return {
    id: `${tenantId}:${userId}`,
    tenantId,
    userId,
    connectedAt: new Date(),
  };
}
