import { pgTable, uuid, varchar, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * refresh_tokens — JWT Refresh Token 存储表
 *
 * 存储 SHA-256(token) 哈希值。
 * 撤销通过 UPDATE revoked_at 实现。
 */
export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tenant_id: uuid("tenant_id").notNull(),

    token_hash: varchar("token_hash", { length: 255 }).notNull(),
    expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
    revoked_at: timestamp("revoked_at", { withTimezone: true }),

    user_agent: varchar("user_agent", { length: 500 }),
    ip: varchar("ip", { length: 50 }),

    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_refresh_token_hash").on(table.token_hash),
    index("idx_refresh_tokens_user").on(table.user_id),
    index("idx_refresh_tokens_expires").on(table.expires_at),
  ],
);

export type RefreshToken = typeof refreshTokens.$inferSelect;
export type NewRefreshToken = typeof refreshTokens.$inferInsert;
