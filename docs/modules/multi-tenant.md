# 多租户架构

> 从 `docs/architecture.md` §五 提取的专题文档。父文档索引见 [architecture.md](../architecture.md)。
> 相关决策：`decisions.md` D4, D4.1

---

## 一、四阶段演进

| 阶段 | 策略 | 隔离级别 | 适用场景 |
|------|------|----------|----------|
| **Phase 1** | 单数据库 + `tenant_id` 字段 | 应用层隔离 | MVP 快速验证 |
| **Phase 1.5** | PostgreSQL Schema-per-tenant | Schema 级隔离 | 中小规模生产（NocoBase 企业版验证） |
| **Phase 2** | Database-per-tenant | 数据库级隔离 | 大客户/高合规需求 |
| **Phase 3** | 混合模式 | 灵活隔离 | 平台规模化运营 |

### Phase 1 实现（MVP）

```sql
-- 所有业务表增加 tenant_id
CREATE TABLE tenants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  status      TEXT DEFAULT 'active',
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  email       TEXT NOT NULL,
  name        TEXT,
  UNIQUE(tenant_id, email)
);
```

**租户上下文传递**：通过 Fastify `request.tenantId` 传递，Drizzle 查询自动附加 `where: eq(table.tenantId, ctx.tenantId)`。

**强制索引规则**：所有业务表必须创建 `(tenant_id, id)` 联合索引作为主键或首个索引。Drizzle 迁移自动检测并拒绝缺少此索引的表。

**PostgreSQL RLS**：Phase 1 共享数据库方案中，PostgreSQL RLS 存在 20-30% 性能退化上限，需基准测试验证。替代方案：Drizzle 中间件注入 WHERE 条件（应用层过滤），性能可控。

### Phase 1.5 Schema-per-tenant（PostgreSQL Schema 隔离）

```sql
-- 每个租户独立 PostgreSQL schema
CREATE SCHEMA tenant_001;
CREATE SCHEMA tenant_002;

-- 共享 schema 放全局数据（模板、配置）
CREATE SCHEMA public;  -- 系统级数据

-- 租户连接时设置 search_path
SET search_path = tenant_001, public;

-- pg_dump 独立备份
pg_dump --schema=tenant_001 > tenant_001_backup.sql
```

**优势**：
- PostgreSQL 原生支持，零外部依赖
- 独立索引统计、VACUUM、备份粒度
- 共享 schema（public）可放模板和全局配置
- NocoBase 企业版验证（`@nocobase/plugin-multi-tenant` 支持 schema 模式）

**迁移**：Phase 1 `tenant_id` 字段 → Phase 1.5 为每个租户创建独立 schema，表结构一致，数据通过 `INSERT INTO tenant_001.users SELECT * FROM public.users WHERE tenant_id = '001'` 迁移。

---

## 二、连接池策略

| 阶段 | 方案 | 连接数 |
|------|------|--------|
| Phase 1 | pg-pool（默认 10 连接） | ≤50（少量测试租户） |
| Phase 1.5 | PgBouncer 统一中间层（schema pooling） | ≤200（100 租户×2 连接） |
| Phase 2 | PgBouncer per-DB 连接池 | 每 DB 独立（大客户专享） |

**PgBouncer 配置**：
- 默认 `pool_size=20`，`max_client_conn=500`
- `pool_mode=transaction`（最高吞吐，与 Drizzle 兼容）
- 监控：慢查询 >100ms 告警，连接等待 >100ms 扩容

---

## 三、资源预算（Phase 3 混合模式）

| 资源 | Phase 1（10 租户） | Phase 2（1000 租户） | 说明 |
|------|------------------|-------------------|------|
| Core 进程 | 256MB | 512MB（under-pressure 阈值） | 每请求注入 tenant_id |
| 连接池 | 10 | 200（PgBouncer pooling） | PG 上限 ~500 |
| Redis | 100MB | 1-2GB（per-tenant key 监控） | pub/sub + cache + queue |
| 文件存储 | 10GB | 1-5TB（MinIO 水平扩展） | content-addressed dedup |
| 审计日志 | 10MB/day | 10GB/day（需归档策略） | 1000 租户×1000req/s |

> ⚠️ 以上为已知限制标注，Phase 3 正式生产前需压力测试验证。Phase 2 Database-per-tenant 受 PG 连接数限制，实际上限约 200 租户。1000+ 租户需 Phase 3 混合模式（小租户 Schema 共享 + 大租户独立 DB）。

---

## 四、文件存储隔离

### Phase 1（本地文件系统）

```
/data/audebase/storage/{tenantId}/attachments/
/data/audebase/storage/{tenantId}/avatars/
/data/audebase/storage/public/           # 共享模板
```

简单、零依赖。Node.js 进程通过路径前缀隔离。MVP 阶段无外部存储依赖。

### Phase 2（DB 元数据 + MinIO 混合，借鉴 Odoo ir.attachment）

```
PostgreSQL: attachments 表
  (id, tenant_id, filename, mime_type, minio_key, sha256, size, created_at)
  → tenant_id 隔离 + Record Rules 自动应用

MinIO/S3: content-addressed Blob
  audebase-blobs/{sha256[:2]}/{sha256}
  → SHA-256 去重节省 40-70% 存储
```

- 大文件（>10MB）通过 presigned URL 直传 MinIO（`{tenant_id}/` 前缀隔离）
- Core API 代理统一管控附件访问权限

**文件下载安全**：Phase 2+ MinIO presigned URL **由 Core 生成**（非 PluginHost）。PluginHost 请求 Core API → Core 验证 tenant_id + 权限 → 返回 5 分钟过期的一次性 presigned URL。PluginHost 不可直接访问 MinIO SDK。参考：Odoo `/web/content` 安全模型。

**参考**：Odoo `ir.attachment` 模式（20 年生产验证）、Nextcloud S3 存储

---

## 五、共享数据模型

| tenant_id | 含义 | 用途 | 示例 |
|-----------|------|------|------|
| `NULL` | 系统数据 | 平台配置、全局模板（所有租户可读） | SMTP 配置、审批模板库、国家列表 |
| `00000000-0000-0000-0000-000000000000` | 模板租户 | 平台团队创建和管理模板数据 | OA 审批流模板、报表模板 |
| 普通 UUID | 业务租户 | 完全隔离的业务数据 | 用户、订单、工单 |

插件可通过 `manifest.models.shared` 声明共享模型（`tenant_id=NULL`）。

**跨租户访问边界**：默认禁止插件直接读取其他租户数据。集团场景需 Core API 代理显式授权（审计日志记录每次跨租户访问）。`tenant_id = NULL` 的系统数据对所有租户只读，写权限仅平台管理员。

---

## 六、组内调用租户安全

组内插件直接函数调用（0ms）必须传递租户上下文：

```typescript
// PluginHost 自动注入的 context
interface PluginContext {
  tenantId: string;
  userId: string;
  roleIds: string[];
  requestId: string;
}

// 组内调用必须传递 context
const result = await otherPlugin.createOrder(context, {
  items: [...]
});
// PluginHost 中间件自动注入 Drizzle WHERE tenant_id 过滤
```

**安全约束**：
- 组内插件调用不经过 Core 路由，但必须通过 PluginHost context 注入 tenant_id
- Drizzle 查询自动附加 `WHERE tenant_id = context.tenantId`
- 开发规范要求所有组件传递 context，lint 规则检查缺失的 context 参数

---

## 七、Phase 1→1.5 迁移路径

1. **准备阶段**：为每个租户在 PostgreSQL 中创建独立 schema
2. **数据迁移**：
   ```sql
   -- 为 tenant_001 创建 schema 并复制数据
   CREATE SCHEMA tenant_001;
   CREATE TABLE tenant_001.users (LIKE public.users INCLUDING ALL);
   INSERT INTO tenant_001.users SELECT * FROM public.users WHERE tenant_id = '001';
   ```
3. **验证**：在 staging 环境运行完整功能测试
4. **切换**：更新连接配置 `search_path = tenant_001, public`
5. **清理**：60 天后删除 public schema 中已迁移的租户数据

### 批量迁移编排

- N 个租户迁移通过 job queue 分批次执行（每批次 10 租户）
- 每租户迁移在事务中完成（失败自动回滚，mark 为 pending）
- 断点续迁：记录已迁移租户列表，中断后从断点继续
- 迁移期间旧 tenant_id 查询仍可工作（public schema 数据不删除）
- 全部迁移完成后，60 天 grace period 后删除 public schema 租户数据

**停机窗口**：中等租户（100K 记录，单表）约 5-15 分钟每租户。大租户（1M+ 记录）或 200+ 租户批量迁移需断点续迁 + 分批次执行，预计数小时到一天。建议 Phase 1→1.5 在低峰期执行。

---

## 八、租户生命周期

### 创建（Provisioning）

1. Phase 1：`INSERT INTO tenants (name, slug) VALUES (...)`
2. Phase 1.5：`CREATE SCHEMA tenant_XXX` + 从模板 schema 复制表结构
3. 可选：加载 `manifest.data` 初始数据

### 关闭（Offboarding）

1. 30 天软删除期（`status = 'suspended'`，数据可恢复）
2. 30 天后硬删除（DROP SCHEMA / DELETE CASCADE）
3. 审计日志保留 1 年

**参考**：Odoo `database_template` 模式、Heroku Postgres follower

### 租户功能开关

`manifest.yaml` 声明可开关的功能模块。Core 根据租户配置注入可用功能列表。

### 开发环境多租户模拟

```yaml
# docker-compose.dev.yml
services:
  postgres:
    environment:
      - TEST_TENANTS=tenant-test-1,tenant-test-2,tenant-test-3
```

---

## 九、竞品对比

| 特性 | Odoo Multi-Company | NocoBase 多租户 | AUDEBase |
|------|-------------------|----------------|----------|
| 隔离级别 | 应用层（`company_id`） | Instance-per-tenant 或 Schema-per-tenant | 四阶段演进：tenant_id → Schema → Database → 混合 |
| 数据隔离 | 共享表 + company_id 过滤 | 独立实例或独立 Schema | 渐进式：从共享表到独立 DB |
| 资源成本 | 低（共享进程） | 高（每租户独立实例） | 可控（渐进式升级，按需隔离） |
| 运维复杂度 | 低 | 高（多实例管理） | 中等（统一 PgBouncer + Core 管理） |
| 文件存储 | 共享 filestore + 目录隔离 | 每个实例独立存储 | 路径前缀 → MinIO content-addressed 去重 |
| 合规能力 | 弱（同表无法物理隔离） | 强（独立实例天然隔离） | 灵活（大客户独立 DB，小租户 Schema） |
| 备份粒度 | 全库备份 | 实例级备份 | Schema 级 / DB 级灵活备份 |

**AUDEBase 差异化**：四阶段演进提供了"渐进式投入"路径——MVP 阶段零额外成本，随业务增长按需升级隔离级别，无需一次性投入高运维成本。
