# Migration Engine SDD — Phase 1a

> **创建日期**: 2026-07-13  
> **目的**: 为 Phase 1a #5 模块（迁移管理）提供完整的引擎设计。  
> **前置阅读**: D1.7, phase-planning.md §1a #5  
> **责任人**: Person A（建议从 Person B 移交）

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  Migration Engine (packages/migration/src/)              │
│                                                         │
│  ┌──────────┐    ┌──────────┐    ┌──────────────────┐   │
│  │ Scanner  │───▶│ Resolver │───▶│ Executor (3-stage)│   │
│  └──────────┘    └──────────┘    └────────┬─────────┘   │
│       │                │                  │              │
│       ▼                ▼                  ▼              │
│  ┌──────────────────────────────────────────────────┐   │
│  │              migration_history 表                  │   │
│  │  (module_id, version, phase, status, error, ...)   │   │
│  └──────────────────────────────────────────────────┘   │
│                                                         │
│  ┌──────────┐                                          │
│  │ DryRun   │ (CI 预检模式，不执行 SQL)                  │
│  └──────────┘                                          │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Migration File Convention

### 2.1 目录结构

```
packages/plugin-core/migrations/
├── 1.0.0/
│   ├── preload.sql      # DDL: CREATE TABLE, ALTER TABLE
│   ├── postsync.sql     # DML: INSERT, UPDATE, DELETE
│   └── postload.sql     # 后处理: CREATE INDEX, ANALYZE
├── 1.1.0/
│   ├── preload.sql
│   └── postsync.sql     # postload.sql 可选
└── 1.2.0/
    └── preload.sql      # postsync.sql 可选
```

### 2.2 文件规则

| 规则 | 详情 |
|------|------|
| **命名** | 固定文件名：`preload.sql`、`postsync.sql`、`postload.sql` |
| **版本目录** | SemVer（如 `1.0.0`），Core 按版本号升序排序执行 |
| **可选文件** | 每阶段可缺省。无 SQL 变更的版本可以只有空目录或跳过的阶段 |
| **编码** | UTF-8 |
| **事务** | 单个迁移文件在一个事务中执行（失败自动回滚） |
| **禁止** | DROP DATABASE, DROP SCHEMA, TRUNCATE (危险操作白名单拦截) |

### 2.3 与 manifest.yaml 版本的关系

```yaml
# manifest.yaml
version: "1.1.0"     # ← 当前插件版本
```

Core 对比 `migration_history` 表，执行所有 `version > 已记录版本` 的迁移目录。

---

## 3. Public API Surface

### 3.1 MigrationEngine

```typescript
// packages/migration/src/engine.ts

interface MigrationEngine {
  /**
   * 执行所有待运行迁移
   * 
   * 流程:
   * 1. Scanner.discoverMigrations() — 扫描所有插件的 migrations/ 目录
   * 2. Resolver.resolve() — 按 manifest version 排序待执行版本
   * 3. 对每个插件 × 每个待执行版本:
   *    a. preload: 在插件 beforeLoad() 前执行 (DDL)
   *    b. postsync: Core DB 同步后执行 (DML)
   *    c. postload: 插件 load() 后执行 (索引重建)
   * 4. 每次成功写入 migration_history
   * 
   * @param options.mode — 'normal' | 'dry-run'
   */
  migrate(options?: MigrateOptions): Promise<MigrationResult>

  /**
   * 仅检查待运行迁移（不执行 SQL）
   * 用于 CI: aude db:migrate --dry-run
   */
  dryRun(): Promise<MigrationReport>
}

interface MigrateOptions {
  /** 执行模式 */
  mode: 'normal' | 'dry-run'
  /** 仅迁移指定插件（Phase 1b: aude plugin upgrade <name>） */
  pluginName?: string
  /** 目标版本（Phase 1b: 支持回滚到指定版本） */
  targetVersion?: string
}
```

### 3.2 MigrationScanner

```typescript
interface MigrationScanner {
  /**
   * 发现所有插件的迁移文件
   * 
   * 扫描路径: packages/*/migrations/{version}/*.sql
   * 返回: Map<pluginName, MigrationDirectory[]>
   */
  discoverMigrations(): Promise<Map<string, MigrationVersion[]>>
}

interface MigrationVersion {
  /** 版本号 (SemVer) */
  version: string
  /** 迁移目录路径 */
  path: string
  /** 各阶段 SQL 文件 */
  files: {
    preload?: string    // 文件路径
    postsync?: string
    postload?: string
  }
}
```

### 3.3 MigrationResolver

```typescript
interface MigrationResolver {
  /**
   * 解析待执行的迁移版本
   * 
   * 逻辑:
   * 1. 查询 migration_history 获取每个插件的已执行版本
   * 2. 对比 manifest.yaml 的 version 字段
   * 3. 返回待执行的迁移（按插件 + 版本排序）
   * 
   * version_gated: 仅执行 version > 已记录版本的迁移
   */
  resolve(migrations: Map<string, MigrationVersion[]>): Promise<MigrationTask[]>
}

interface MigrationTask {
  pluginName: string
  version: string
  phases: MigrationPhase[]
}

interface MigrationPhase {
  phase: 'preload' | 'postsync' | 'postload'
  sqlFile: string
  sqlContent: string
}
```

### 3.4 MigrationExecutor

```typescript
interface MigrationExecutor {
  /**
   * 执行单个迁移任务
   * 
   * 错误处理（发现 #16）:
   * - 迁移失败 → 回滚当前事务
   * - 标记 migration_history.status = 'failed'
   * - 当前插件标记为 'migration_failed'
   * - 跳过该插件继续加载其他插件
   * - 不阻塞系统启动
   */
  execute(task: MigrationTask): Promise<MigrationResult>
  
  /**
   * Dry-run 模式: 读取 SQL 但不执行
   * 返回: 将要执行的 SQL 列表 + 预计影响
   */
  dryRun(task: MigrationTask): Promise<DryRunReport>
}
```

---

## 4. migration_history 表操作

### 4.1 DDL（规范来源）

> 本表 DDL 以 [database-schema.md](database-schema.md) §10 为规范。以下描述迁移引擎的运行时行为。

```sql
CREATE TABLE migration_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
    
    -- 迁移信息
    version VARCHAR(50) NOT NULL,  -- 已执行的版本号
    phase VARCHAR(20) NOT NULL,    -- preload | postsync | postload
    filename VARCHAR(500),         -- 迁移文件路径
    
    -- 执行结果
    status VARCHAR(20) NOT NULL DEFAULT 'success',
    -- 状态枚举: success | failed | skipped
    error_message TEXT,            -- 失败时记录错误详情
    execution_time_ms INTEGER,     -- 执行耗时
    
    -- 审计
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- 约束
    CONSTRAINT uq_migration_version UNIQUE (module_id, version, phase)
);

CREATE INDEX idx_migration_module ON migration_history(module_id);
CREATE INDEX idx_migration_status ON migration_history(module_id, status);
```

### 4.2 操作模式

```typescript
// 查询已执行版本
SELECT DISTINCT version FROM migration_history
WHERE module_id = $1 AND status = 'completed'
ORDER BY version DESC

// 记录迁移开始
INSERT INTO migration_history (module_id, version, phase, status, started_at)
VALUES ($1, $2, $3, 'running', NOW())

// 记录迁移完成
UPDATE migration_history
SET status = 'completed', completed_at = NOW()
WHERE module_id = $1 AND version = $2 AND phase = $3

// 记录迁移失败（graceful skip）
UPDATE migration_history
SET status = 'failed', error = $4, completed_at = NOW()
WHERE module_id = $1 AND version = $2 AND phase = $3
```

---

## 5. Error Handling

### 5.1 Graceful Skip 策略（发现 #16）

```
Phase 1a 策略: 迁移失败 → 标记 failed + 跳过该插件 → 系统继续启动
Phase 1b  策略: 支持手动回滚 + Admin UI 重试
Phase 2   策略: 自动回滚 + 事件通知
```

### 5.2 错误类型

```typescript
import { ErrorCode } from '@audebase/shared-types'

type MigrationError =
  | { type: ErrorCode; plugin: string; version: string; phase: string; sqlError: string }  // 'SQL_EXECUTION_ERROR'
  | { type: ErrorCode; plugin: string; currentVersion: string; targetVersion: string }    // 'MIGRATION_VERSION_CONFLICT'
  | { type: ErrorCode; plugin: string; version: string; phase: string }                     // 'MIGRATION_DUPLICATE'
  | { type: ErrorCode; plugin: string; sql: string }                                        // 'MIGRATION_DANGEROUS_OP'
  | { type: ErrorCode; plugin: string; version: string; phase: string }                     // 'MIGRATION_MISSING_FILE'
```

### 5.3 错误传播

- 单个迁移失败 → 记录 error → 继续下一个迁移
- migration_history 中 status='failed' 的迁移在后续启动中跳过（已标记失败，不重试）
- CI dry-run 发现错误 → 返回非 0 退出码 → 阻断 PR

---

## 6. Dry-run 模式

### CI 集成

```bash
# GitHub Actions 中的预检步骤
aude db:migrate --dry-run
# 输出示例:
# [plugin-core] 1.1.0 preload: CREATE TABLE... (OK)
# [plugin-core] 1.1.0 postsync: INSERT INTO... (OK)
# [plugin-rbac] 1.0.0 preload: DROP TABLE users (BLOCKED: 危险操作)
# 
# Summary: 3 migrations to run, 1 BLOCKED
# Exit code: 1
```

### 实现

```typescript
async function dryRun(task: MigrationTask): Promise<DryRunReport> {
  const report: DryRunReport = { tasks: [], blocked: [] }

  for (const phase of task.phases) {
    // 1. 读取 SQL 文件
    // 2. 语法检查：所有 SQL 可解析
    // 3. 安全检查：无不安全操作（DROP TABLE, TRUNCATE, DROP DATABASE）
    // 4. 不执行 SQL
    // 5. 记录将要执行的操作

    if (containsDangerousOperation(phase.sqlContent)) {
      report.blocked.push({ plugin: task.pluginName, phase, reason: '危险操作' })
    } else {
      report.tasks.push({ plugin: task.pluginName, phase, sql: firstLine(phase.sqlContent) })
    }
  }

  return report
}
```

---

## 7. 三阶段执行上下文

| 阶段 | 执行时机 | 可用上下文 | 典型用途 |
|------|---------|----------|---------|
| **preload** | 所有插件 beforeLoad() 前 | 仅 Core DB 连接 | CREATE TABLE, ALTER TABLE, ADD COLUMN |
| **postsync** | Core DB 同步完成后 | Core DB + Drizzle schema 已同步 | INSERT, UPDATE, DELETE 数据迁移 |
| **postload** | 所有插件 load() 完成后 | 全系统就绪 | CREATE INDEX, ANALYZE, 数据校验 |

### 执行顺序示例（3 个插件，各 1 个新版本）

```
Phase 1: preload  (所有插件)
  plugin-core 1.1.0 preload
  plugin-rbac 1.0.0 preload
  plugin-audit 1.0.0 preload

Phase 2: Core DB 同步

Phase 3: postsync  (所有插件)
  plugin-core 1.1.0 postsync
  plugin-rbac 1.0.0 postsync
  plugin-audit 1.0.0 postsync

Phase 4: 所有插件 load()

Phase 5: postload  (所有插件)
  plugin-core 1.1.0 postload
  plugin-rbac 1.0.0 postload
  plugin-audit 1.0.0 postload
```

---

## 8. 与 Core Bootstrap 的集成

```
Core 启动
  │
  ├─ 1. Fastify 启动（仅 health 路由）
  │
  ├─ 2. Drizzle DB 连接
  │
  ├─ 3. 检查 migration_history 表是否存在
  │     └─ 不存在 → 创建核心表（modules, migration_history, tenants）
  │
  ├─ 4. 加载 plugin-core
  │
  ├─ 5. MigrationEngine.migrate() — 执行所有待运行迁移
  │     └─ 单插件失败 → 跳过 → 标记 migration_failed
  │
  ├─ 6. 加载剩余插件（跳过 migration_failed 的插件）
  │
  └─ 7. Fastify 注册所有路由 → listen()
```
---

## 9. 与其他模块的交互

| 消费方 | 接口 | 调用方式 |
|--------|------|---------|
| #1 内核骨架 (Core) | `MigrationEngine.migrate()` | Core bootstrap 在 plugin-core 安装后调用 |
| #4 plugin-core Bootstrap | `MigrationEngine.migrate()` | plugin-core 安装完成后 Core 执行迁移 |
| #6 插件框架 | `PluginHost` 无直接依赖 | migration_failed 状态通过 PluginManager 状态机制传播 |
| #10 审计日志 | `migration_history` 表 | 每次迁移执行写入 migration_history |
| #13 日志/调试 | `pino` logger | 迁移执行中记录 info/error 日志 |
| CLI (`aude db:migrate`) | MigrationEngine 全部公共 API | `aude db:migrate` + `--dry-run` |

---

## 10. Test Boundaries

| 测试层级 | 范围 | 策略 | 文件位置 |
|---------|------|------|---------|
| 单元测试 | Scanner.discoverMigrations(), Resolver.resolve() | mock 文件系统和 DB | `src/__tests__/unit/` |
| 集成测试 | 完整 3 阶段执行 | 真实 PG（事务回滚） | `src/__tests__/integration/` |
| Dry-run | CI 预检 | 真实文件系统，不执行 SQL | CI 中 |

### 最小测试用例集

1. `discoverMigrations()`: 空目录、单插件、多插件、无效版本目录
2. `resolve()`: 无待执行迁移、1 个新版本、3 个新版本（跨阶段排序）
3. `migrate()`: 正常三阶段执行、preload 成功但 postsync 失败、postload 失败不阻塞后续插件
4. `dryRun()`: 正常迁移、危险操作拦截、无效 SQL 检测
5. migration_history 写入: 状态转换 pending→running→completed、失败时状态为 failed

---

## 11. Open Questions (Phase 1a 期间解决)

- [ ] 迁移文件是否支持参数化（`${tenant_id}` 等值替换）
- [ ] 迁移文件是否支持 `.js` 格式（JavaScript 编程式迁移，Phase 1a 只支持 `.sql`）
- [ ] 大表迁移超时处理策略（> 30s 的大型 ALTER TABLE）
- [ ] pg_dump 快照存储路径与保留策略

---

## 12. 变更记录

| 版本 | 日期 | 变更内容 |
|------|------|---------|
| v0.1.0 | 2026-07-13 | 初始版本 |
