import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

/**
 * notification_in_app — in-app notification storage.
 * One row per notification delivered to a recipient.
 */
export const notificationInApp = pgTable(
  "notification_in_app",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenant_id: uuid("tenant_id"),

    /** Recipient user/role identifier. */
    recipient: varchar("recipient", { length: 255 }).notNull(),

    /** Template name used to render the content. */
    template: varchar("template", { length: 100 }).notNull(),

    /** Template data payload (JSON). */
    data: jsonb("data").default({}),

    /** Whether the recipient has read this notification. */
    is_read: boolean("is_read").notNull().default(false),

    /** Optional title for display in notification list. */
    title: varchar("title", { length: 500 }),

    /** Optional message body — rendered from template + data. */
    body: text("body"),

    /** Optional link URL for the notification action. */
    link: varchar("link", { length: 2000 }),

    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_notif_tenant_recipient").on(
      table.tenant_id,
      table.recipient,
    ),
    index("idx_notif_unread").on(table.recipient, table.is_read),
  ],
);

export type NotificationInApp = typeof notificationInApp.$inferSelect;
export type NewNotificationInApp = typeof notificationInApp.$inferInsert;
