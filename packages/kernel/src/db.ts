import { type FastifyBaseLogger } from "fastify";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";

/**
 * DatabaseProvider — Drizzle ORM 数据库访问抽象
 *
 * 封装 pg Pool 和 Drizzle client，所有 DB 操作通过此接口。
 * Phase 1a 使用 PostgreSQL。
 */
export interface DatabaseProvider {
  /** Drizzle ORM 数据库客户端 */
  readonly db: NodePgDatabase;

  /** pg Pool（用于原始查询和健康检查） */
  readonly pool: pg.Pool;

  /** 测试数据库连接是否正常 */
  checkHealth(): Promise<boolean>;

  /** 关闭连接池 */
  close(): Promise<void>;
}

interface DbOptions {
  connectionString: string;
  logger: FastifyBaseLogger;
}

/**
 * 创建 Drizzle ORM 数据库 Provider
 */
export function createDatabaseProvider(options: DbOptions): DatabaseProvider {
  const pool = new pg.Pool({
    connectionString: options.connectionString,
    max: 10,
  });

  pool.on("error", (err: Error) => {
    options.logger.error({ err }, "pg pool unexpected error");
  });

  const db: NodePgDatabase = drizzle(pool);

  const provider: DatabaseProvider = {
    db,
    pool,

    async checkHealth(): Promise<boolean> {
      try {
        await pool.query("SELECT 1");
        return true;
      } catch {
        return false;
      }
    },

    async close(): Promise<void> {
      await pool.end();
    },
  };

  return provider;
}
