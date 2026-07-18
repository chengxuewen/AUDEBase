import {
  pgTable,
  uuid,
  varchar,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

/**
 * users — 用户表
 *
 * 租户隔离: tenant_id NOT NULL
 * 认证: password_hash (bcrypt), token_version (JWT 撤回)
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenant_id: uuid("tenant_id").notNull(),

    username: varchar("username", { length: 100 }).notNull(),
    email: varchar("email", { length: 255 }),
    password_hash: varchar("password_hash", { length: 255 }).notNull(),
    token_version: integer("token_version").notNull().default(1),

    is_active: boolean("is_active").notNull().default(true),
    must_change_password: boolean("must_change_password").notNull().default(false),

    display_name: varchar("display_name", { length: 255 }),
    avatar_url: varchar("avatar_url", { length: 500 }),
    locale: varchar("locale", { length: 10 }).default("zh-CN"),

    last_login_at: timestamp("last_login_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    created_by: uuid("created_by"),
    updated_by: uuid("updated_by"),
  },
  (table) => [
    uniqueIndex("uq_users_username_tenant").on(table.tenant_id, table.username),
    uniqueIndex("uq_users_email_tenant").on(table.tenant_id, table.email),
    index("idx_users_tenant").on(table.tenant_id),
    index("idx_users_active").on(table.tenant_id, table.is_active),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
