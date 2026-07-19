import type { WsSubscription } from "./types";

/**
 * In-memory subscription manager.
 * Tracks which clients are subscribed to which collections for which events.
 *
 * Phase 2: pure in-memory. No Redis dependency.
 */
export class RoomsManager {
  /** clientId → subscriptions[] */
  private readonly subscriptions = new Map<string, WsSubscription[]>();

  /**
   * Subscribe a client to collection change events.
   * Replaces any existing subscription for the same collection.
   */
  subscribe(clientId: string, collection: string, events: string[]): void {
    const filtered = events.filter(
      (e): e is "create" | "update" | "delete" =>
        e === "create" || e === "update" || e === "delete",
    );

    const sub: WsSubscription = {
      clientId,
      collection,
      events: filtered,
    };

    const existing = this.subscriptions.get(clientId) ?? [];
    const idx = existing.findIndex((s) => s.collection === collection);

    if (idx >= 0) {
      existing[idx] = sub;
    } else {
      existing.push(sub);
    }

    this.subscriptions.set(clientId, existing);
  }

  /**
   * Unsubscribe a client from a specific collection.
   */
  unsubscribe(clientId: string, collection: string): void {
    const existing = this.subscriptions.get(clientId);
    if (!existing) return;

    const filtered = existing.filter((s) => s.collection !== collection);
    if (filtered.length === 0) {
      this.subscriptions.delete(clientId);
    } else {
      this.subscriptions.set(clientId, filtered);
    }
  }

  /**
   * Get client IDs subscribed to a specific collection and action.
   */
  getSubscribers(collection: string, action: string): string[] {
    const result: string[] = [];

    for (const [, subs] of this.subscriptions) {
      for (const sub of subs) {
        if (
          sub.collection === collection &&
          sub.events.includes(action as "create" | "update" | "delete")
        ) {
          result.push(sub.clientId);
        }
      }
    }

    return result;
  }

  /**
   * Get all subscriptions for a client.
   */
  getClientSubscriptions(clientId: string): readonly WsSubscription[] {
    return this.subscriptions.get(clientId) ?? [];
  }

  /**
   * Remove all subscriptions for a disconnected client.
   */
  removeAll(clientId: string): void {
    this.subscriptions.delete(clientId);
  }

  /**
   * Total number of clients with active subscriptions.
   */
  get clientCount(): number {
    return this.subscriptions.size;
  }
}
