import { describe, test, expect, beforeEach } from "vitest";
import { NotificationService, NotificationError, type NotificationProvider } from "../index";

/** Fake provider for testing. */
function createFakeProvider(channels: string[]): NotificationProvider {
  return {
    getChannels: () => channels,
    send: async (
      _recipient: string,
      _template: string,
      _data: Record<string, unknown>,
    ): Promise<void> => {
      // no-op
    },
  };
}

function createFailingProvider(): NotificationProvider {
  return {
    getChannels: () => ["sms"],
    send: async () => {
      throw new Error("SMS gateway down");
    },
  };
}

describe("NotificationService", () => {
  let service: NotificationService;

  beforeEach(() => {
    service = new NotificationService();
  });

  describe("registerProvider", () => {
    test("registers channels from the provider", () => {
      const provider = createFakeProvider(["email", "in-app"]);
      service.registerProvider(provider);
      expect(service.listChannels()).toEqual(["email", "in-app"]);
    });

    test("throws on duplicate channel registration", () => {
      const provider1 = createFakeProvider(["email"]);
      const provider2 = createFakeProvider(["email", "sms"]);

      service.registerProvider(provider1);
      expect(() => service.registerProvider(provider2)).toThrow(NotificationError);
      expect(() => service.registerProvider(provider2)).toThrow(
        /Channel "email" already has a registered provider/,
      );
    });

    test("registers multiple providers on different channels", () => {
      service.registerProvider(createFakeProvider(["email"]));
      service.registerProvider(createFakeProvider(["sms"]));
      expect(service.listChannels()).toEqual(["email", "sms"]);
    });
  });

  describe("send", () => {
    test("sends via registered channel", async () => {
      const sendCalls: Array<{
        recipient: string;
        template: string;
        data: Record<string, unknown>;
      }> = [];

      const tracker: NotificationProvider = {
        getChannels: () => ["push"],
        send: async (recipient, template, data) => {
          sendCalls.push({ recipient, template, data });
        },
      };

      service.registerProvider(tracker);

      await service.send("push", "user-1", "welcome", {
        name: "Alice",
      });

      expect(sendCalls).toHaveLength(1);
      expect(sendCalls[0].recipient).toBe("user-1");
      expect(sendCalls[0].template).toBe("welcome");
      expect(sendCalls[0].data).toEqual({ name: "Alice" });
    });

    test("throws CHANNEL_NOT_FOUND for unregistered channel", async () => {
      await expect(service.send("sms", "user-1", "alert", {})).rejects.toThrow(NotificationError);

      await expect(service.send("sms", "user-1", "alert", {})).rejects.toThrow(
        /No provider registered for channel "sms"/,
      );
    });

    test("wraps provider errors with SEND_FAILED", async () => {
      service.registerProvider(createFailingProvider());

      await expect(service.send("sms", "user-1", "alert", {})).rejects.toThrow(NotificationError);

      await expect(service.send("sms", "user-1", "alert", {})).rejects.toThrow(
        /Failed to send notification via sms: SMS gateway down/,
      );
    });
  });

  describe("listChannels", () => {
    test("returns empty for new service", () => {
      expect(service.listChannels()).toEqual([]);
    });

    test("returns all registered channels", () => {
      service.registerProvider(createFakeProvider(["email", "sms", "push"]));
      expect(service.listChannels()).toEqual(["email", "sms", "push"]);
    });
  });
});
