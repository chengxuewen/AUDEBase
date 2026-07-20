import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import {
  EmailNotificationProvider,
  readSmtpConfigFromEnv,
  InAppNotificationProvider,
  NotificationError,
} from "../index";
import type { EmailTransporter } from "../providers/email";
import type { InAppStore } from "../providers/in-app";

// ---------------------------------------------------------------------------
// EmailNotificationProvider
// ---------------------------------------------------------------------------

function createMockTransporter(): EmailTransporter & { sendMail: ReturnType<typeof vi.fn> } {
  const sendMail = vi.fn().mockResolvedValue({ messageId: "msg-1" });
  return { sendMail };
}

describe("EmailNotificationProvider", () => {
  let transporter: ReturnType<typeof createMockTransporter>;
  let provider: EmailNotificationProvider;

  beforeEach(() => {
    transporter = createMockTransporter();
    provider = new EmailNotificationProvider(transporter, { from: "test@audebase.local" });
  });

  test("getChannels returns [email]", () => {
    expect(provider.getChannels()).toEqual(["email"]);
  });

  test("send calls transporter.sendMail with correct options", async () => {
    // Arrange
    const recipient = "user@example.com";
    const template = "welcome";
    const data = { body: "Hello, Alice!", name: "Alice" };

    // Act
    await provider.send(recipient, template, data);

    // Assert
    expect(transporter.sendMail).toHaveBeenCalledTimes(1);
    const call = transporter.sendMail.mock.calls[0]![0];
    expect(call.to).toBe("user@example.com");
    expect(call.from).toBe("test@audebase.local");
    expect(call.subject).toBe("[AUDEBase] welcome");
    expect(call.text).toBe("Hello, Alice!");
  });

  test("send uses html field when data.html is provided", async () => {
    // Arrange
    const data = { body: "plain", html: "<p>rich</p>" };

    // Act
    await provider.send("to@test.com", "alert", data);

    // Assert
    const call = transporter.sendMail.mock.calls[0]![0];
    expect(call.html).toBe("<p>rich</p>");
  });

  test("send defaults html to undefined when not in data", async () => {
    // Arrange
    const data = { body: "just text" };

    // Act
    await provider.send("to@test.com", "alert", data);

    // Assert
    const call = transporter.sendMail.mock.calls[0]![0];
    expect(call.html).toBeUndefined();
  });

  test("send wraps transporter errors as SEND_FAILED", async () => {
    // Arrange
    transporter.sendMail.mockRejectedValue(new Error("SMTP connection refused"));

    // Act & Assert
    await expect(
      provider.send("to@test.com", "alert", {}),
    ).rejects.toThrow(NotificationError);

    await expect(
      provider.send("to@test.com", "alert", {}),
    ).rejects.toThrow(/Email send failed for template "alert": SMTP connection refused/);
  });
});

// ---------------------------------------------------------------------------
// readSmtpConfigFromEnv
// ---------------------------------------------------------------------------

describe("readSmtpConfigFromEnv", () => {
  const prev = { ...process.env };

  beforeEach(() => {
    process.env = { ...prev };
  });

  afterEach(() => {
    process.env = prev;
  });

  test("returns config when all required env vars are set", () => {
    // Arrange
    process.env.AUDE_SMTP_HOST = "smtp.example.com";
    process.env.AUDE_SMTP_PORT = "587";
    process.env.AUDE_SMTP_USER = "user";
    process.env.AUDE_SMTP_PASS = "pass";

    // Act
    const config = readSmtpConfigFromEnv();

    // Assert
    expect(config).not.toBeNull();
    expect(config!.host).toBe("smtp.example.com");
    expect(config!.port).toBe(587);
    expect(config!.secure).toBe(false);
    expect(config!.auth.user).toBe("user");
    expect(config!.auth.pass).toBe("pass");
  });

  test("returns secure=true when port is 465", () => {
    // Arrange
    process.env.AUDE_SMTP_HOST = "smtp.example.com";
    process.env.AUDE_SMTP_PORT = "465";

    // Act
    const config = readSmtpConfigFromEnv();

    // Assert
    expect(config!.secure).toBe(true);
  });

  test("returns null when AUDE_SMTP_HOST is missing", () => {
    process.env.AUDE_SMTP_PORT = "587";
    expect(readSmtpConfigFromEnv()).toBeNull();
  });

  test("returns null when AUDE_SMTP_PORT is missing", () => {
    process.env.AUDE_SMTP_HOST = "smtp.example.com";
    expect(readSmtpConfigFromEnv()).toBeNull();
  });

  test("returns null when AUDE_SMTP_PORT is not a number", () => {
    process.env.AUDE_SMTP_HOST = "smtp.example.com";
    process.env.AUDE_SMTP_PORT = "abc";
    expect(readSmtpConfigFromEnv()).toBeNull();
  });

  test("returns config with empty auth when user/pass are missing", () => {
    // Arrange
    process.env.AUDE_SMTP_HOST = "smtp.example.com";
    process.env.AUDE_SMTP_PORT = "25";

    // Act
    const config = readSmtpConfigFromEnv();

    // Assert
    expect(config).not.toBeNull();
    expect(config!.auth.user).toBe("");
    expect(config!.auth.pass).toBe("");
  });
});

// ---------------------------------------------------------------------------
// InAppNotificationProvider
// ---------------------------------------------------------------------------

function createMockStore(): InAppStore & {
  insert: ReturnType<typeof vi.fn>;
} {
  const returning = vi.fn().mockResolvedValue([{ id: "notif-1" }]);
  const values = vi.fn().mockReturnValue({ returning });
  const insert = vi.fn().mockReturnValue({ values });

  return { insert };
}

describe("InAppNotificationProvider", () => {
  let store: ReturnType<typeof createMockStore>;
  let provider: InAppNotificationProvider;

  beforeEach(() => {
    store = createMockStore();
    provider = new InAppNotificationProvider(store);
  });

  test("getChannels returns [in-app]", () => {
    expect(provider.getChannels()).toEqual(["in-app"]);
  });

  test("send inserts a row with correct fields", async () => {
    // Arrange
    const recipient = "user-abc";
    const template = "task-assigned";
    const data = {
      title: "New Task",
      body: "You have a new task",
      link: "/tasks/42",
    };

    // Act
    await provider.send(recipient, template, data);

    // Assert
    expect(store.insert).toHaveBeenCalledTimes(1);
    const callValues = store.insert.mock.calls[0]![0]; // the pgTable arg
    expect(callValues).toBeDefined();

    const valuesArg = store.insert().values.mock.calls[0][0];
    expect(valuesArg.recipient).toBe("user-abc");
    expect(valuesArg.template).toBe("task-assigned");
    expect(valuesArg.title).toBe("New Task");
    expect(valuesArg.body).toBe("You have a new task");
    expect(valuesArg.link).toBe("/tasks/42");
    expect(valuesArg.data).toEqual(data);
  });

  test("send falls back to template name when data.title is missing", async () => {
    // Act
    await provider.send("user-abc", "generic-alert", {});

    // Assert
    const valuesArg = store.insert().values.mock.calls[0][0];
    expect(valuesArg.title).toBe("generic-alert");
  });

  test("send sets body/link to null when not in data", async () => {
    // Act
    await provider.send("user-abc", "simple-alert", { title: "Hi" });

    // Assert
    const valuesArg = store.insert().values.mock.calls[0][0];
    expect(valuesArg.body).toBeNull();
    expect(valuesArg.link).toBeNull();
  });

  test("send wraps DB errors as SEND_FAILED", async () => {
    // Arrange
    store.insert().values.mockReturnValueOnce({
      returning: vi.fn().mockRejectedValueOnce(new Error("connection lost")),
    });

    // Act & Assert
    await expect(
      provider.send("user-abc", "alert", {}),
    ).rejects.toThrow(
      /In-app notification insert failed for template "alert": connection lost/,
    );
  });
});
