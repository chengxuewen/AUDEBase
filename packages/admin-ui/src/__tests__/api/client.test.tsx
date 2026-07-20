import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { ApiClient } from "../../api/client";

describe("ApiClient", () => {
  let client: ApiClient;

  beforeAll(() => {
    // jsdom + vitest globals may not provide localStorage
    const s = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => s.get(k) ?? null,
      setItem: (k: string, v: string) => {
        s.set(k, v);
      },
      removeItem: (k: string) => {
        s.delete(k);
      },
      clear: () => {
        s.clear();
      },
      get length() {
        return s.size;
      },
      key: (i: number) => Array.from(s.keys())[i] ?? null,
    });
  });

  beforeEach(() => {
    client = new ApiClient();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe("setToken / getToken", () => {
    it("stores token in localStorage", () => {
      // Arrange
      const token = "test-jwt-token";

      // Act
      client.setToken(token);

      // Assert
      expect(client.getToken()).toBe(token);
      expect(localStorage.getItem("aude_access_token")).toBe(token);
    });

    it("clears token with null", () => {
      // Arrange
      client.setToken("some-token");

      // Act
      client.setToken(null);

      // Assert
      expect(client.getToken()).toBeNull();
      expect(localStorage.getItem("aude_access_token")).toBeNull();
    });
  });

  describe("get", () => {
    it("returns JSON on success", async () => {
      // Arrange
      const data = { id: "1", name: "test" };
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => data,
      } as Response);

      // Act
      const result = await client.get<typeof data>("/test");

      // Assert
      expect(result).toEqual(data);
    });

    it("redirects to /login on 401", async () => {
      // Arrange
      client.setToken("expired-token");
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({}),
      } as Response);

      // Act & Assert
      await expect(client.get("/secure")).rejects.toThrow('Unauthorized');
      expect(client.getToken()).toBeNull();
    });

    it("throws with error message from API", async () => {
      // Arrange
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: { code: "VALIDATION_ERROR", message: "name is required" },
        }),
      } as Response);

      // Act & Assert
      await expect(client.get("/test")).rejects.toThrow('name is required');
    });
  });

  describe("post", () => {
    it("sends JSON body with auth header", async () => {
      // Arrange
      client.setToken("my-token");
      const mockFetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      } as Response);

      // Act
      await client.post("/auth/login", { username: "admin", password: "pass" });

      // Assert
      expect(mockFetch).toHaveBeenCalledWith(
        '/auth/login',
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer my-token",
          }) as HeadersInit,
          body: JSON.stringify({ username: "admin", password: "pass" }),
        }),
      );
    });
  });

  describe("delete", () => {
    it("sends DELETE request", async () => {
      // Arrange
      const mockFetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      } as Response);

      // Act
      await client.delete("/users/123");

      // Assert
      expect(mockFetch).toHaveBeenCalledWith(
        '/users/123',
        expect.objectContaining({ method: "DELETE" }),
      );
    });
  });
});
