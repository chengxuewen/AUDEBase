import { describe, test, expect, vi } from "vitest";
import { createEventBusAdapter } from "../adapter";
import type { WsManager } from "../manager";
import type { CollectionChangeEvent } from "../types";

describe("createEventBusAdapter", () => {
  const makeMockManager = (): WsManager => {
    return {
      handleChangeEvent: vi.fn(),
    } as unknown as WsManager;
  };

  const makeEvent = (overrides?: Partial<CollectionChangeEvent>): CollectionChangeEvent => ({
    collection: "users",
    action: "create",
    recordId: "rec-1",
    tenantId: "tenant-A",
    ...overrides,
  });

  test("returns a function (ChangeCallback)", () => {
    // Arrange
    const manager = makeMockManager();

    // Act
    const callback = createEventBusAdapter(manager);

    // Assert
    expect(typeof callback).toBe("function");
  });

  test("forwards create event to manager.handleChangeEvent", () => {
    // Arrange
    const manager = makeMockManager();
    const callback = createEventBusAdapter(manager);
    const event = makeEvent({ action: "create", collection: "users" });

    // Act
    callback(event);

    // Assert
    expect(manager.handleChangeEvent).toHaveBeenCalledTimes(1);
    expect(manager.handleChangeEvent).toHaveBeenCalledWith(event);
  });

  test("forwards update event to manager.handleChangeEvent", () => {
    // Arrange
    const manager = makeMockManager();
    const callback = createEventBusAdapter(manager);
    const event = makeEvent({ action: "update", collection: "orders" });

    // Act
    callback(event);

    // Assert
    expect(manager.handleChangeEvent).toHaveBeenCalledTimes(1);
    expect(manager.handleChangeEvent).toHaveBeenCalledWith(event);
  });

  test("forwards delete event to manager.handleChangeEvent", () => {
    // Arrange
    const manager = makeMockManager();
    const callback = createEventBusAdapter(manager);
    const event = makeEvent({ action: "delete", collection: "products" });

    // Act
    callback(event);

    // Assert
    expect(manager.handleChangeEvent).toHaveBeenCalledTimes(1);
    expect(manager.handleChangeEvent).toHaveBeenCalledWith(event);
  });

  test("passes data payload through to manager", () => {
    // Arrange
    const manager = makeMockManager();
    const callback = createEventBusAdapter(manager);
    const event = makeEvent({
      action: "create",
      collection: "invoices",
      data: { amount: 100, currency: "CNY" },
    });

    // Act
    callback(event);

    // Assert
    expect(manager.handleChangeEvent).toHaveBeenCalledWith(event);
    expect(manager.handleChangeEvent).toHaveBeenCalledWith(
      expect.objectContaining({ data: { amount: 100, currency: "CNY" } }),
    );
  });
});
