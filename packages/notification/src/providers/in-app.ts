import type { NotificationProvider } from "../index";
import { NotificationError } from "../index";
import type { NewNotificationInApp } from "../db/schema";
import { notificationInApp } from "../db/schema";

/**
 * Minimal DB interface — accepts any drizzle-compatible db instance.
 * The real `NodePgDatabase` from drizzle-orm/node-postgres satisfies this.
 */
export interface InAppStore {
  insert<TTable>(
    table: TTable,
  ): {
    values(data: NewNotificationInApp): {
      returning(): Promise<unknown[]>;
    };
  };
}

/**
 * Delivers notifications as in-app records stored in the
 * `notification_in_app` database table.
 */
export class InAppNotificationProvider implements NotificationProvider {
  constructor(private readonly db: InAppStore) {}

  getChannels(): string[] {
    return ["in-app"];
  }

  async send(
    recipient: string,
    template: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    const row: NewNotificationInApp = {
      recipient,
      template,
      data,
      title: typeof data.title === "string" ? data.title : template,
      body: typeof data.body === "string" ? data.body : null,
      link: typeof data.link === "string" ? data.link : null,
    };

    try {
      await this.db
        .insert(notificationInApp)
        .values(row)
        .returning();
    } catch (error: unknown) {
      throw new NotificationError(
        `In-app notification insert failed for template "${template}": ${error instanceof Error ? error.message : "unknown error"}`,
        "SEND_FAILED",
      );
    }
  }
}
