import type { ChangeCallback, CollectionChangeEvent } from "./types";
import type { WsManager } from "./manager";

/**
 * Creates an event bus adapter callback that forwards
 * CollectionChangeEvent instances to the WebSocket manager.
 *
 * Usage:
 *   const eventBus = new InMemoryEventBus();
 *   const adapter = createEventBusAdapter(wsManager);
 *   eventBus.subscribe("collection.*", adapter);
 */
export function createEventBusAdapter(manager: WsManager): ChangeCallback {
  return (event: CollectionChangeEvent): void => {
    manager.handleChangeEvent(event);
  };
}
