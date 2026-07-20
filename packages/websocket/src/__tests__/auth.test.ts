import { describe, test, expect } from "vitest";
import { authenticateWs } from "../auth";

describe("authenticateWs", () => {
  describe("invalid tokens", () => {
    test("returns null for empty string", () => {
      // Arrange & Act
      const result = authenticateWs("");
      // Assert
      expect(result).toBeNull();
    });

    test("returns null for short token (< 8 chars)", () => {
      // Arrange & Act
      const result = authenticateWs("short");
      // Assert
      expect(result).toBeNull();
    });

    test("returns null for non-mock token", () => {
      // Arrange & Act
      const result = authenticateWs("Bearer eyJhbGciOiJIUzI1NiJ9...");
      // Assert
      expect(result).toBeNull();
    });

    test("returns null for token exactly 7 chars", () => {
      // Arrange & Act
      const result = authenticateWs("1234567");
      // Assert
      expect(result).toBeNull();
    });
  });

  describe("valid mock tokens", () => {
    test("parses tenantId and userId from mock token", () => {
      // Arrange
      const token = "mock-tenantA-userX";

      // Act
      const result = authenticateWs(token);

      // Assert
      expect(result).not.toBeNull();
      expect(result!.id).toBe("tenantA:userX");
      expect(result!.tenantId).toBe("tenantA");
      expect(result!.userId).toBe("userX");
      expect(result!.connectedAt).toBeInstanceOf(Date);
    });

    test('returns unknown userId when only tenantId provided', () => {
      // Arrange — parts[2] is undefined, so userId defaults to 'unknown'
      const token = 'mock-tenantX';

      // Act
      const result = authenticateWs(token);

      // Assert
      expect(result).not.toBeNull();
      expect(result!.tenantId).toBe('tenantX');
      expect(result!.userId).toBe('unknown');
      expect(result!.id).toBe('tenantX:unknown');
    });

    test('accepts token with multiple dashes in userId', () => {
      // Arrange
      const token = 'mock-tenantB-user-with-dashes';

      // Act
      const result = authenticateWs(token);

      // Assert
      expect(result).not.toBeNull();
      expect(result!.tenantId).toBe('tenantB');
      expect(result!.userId).toBe('user');
    });
  });
});
