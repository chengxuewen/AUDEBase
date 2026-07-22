# migration-engine — SDD

**状态**: ✅ SDD 完成
**包**: `@audebase/migration-engine`
**参考**: `docs/superpowers/specs/2026-07-22-phase1a-execution-plan.md` §3.2, D25.6.2–D25.6.7
**依赖**: `@audebase/canonical-schema`
**生成日期**: 2026-07-22

---

## 1. 概要

**职责边界**: NocoBase ↔ Canonical Schema 数据迁移引擎。负责将 NocoBase 业务数据导出为平台无关的 CanonicalSnapshot 格式，以及将 CanonicalSnapshot 导入 NocoBase 数据库。

**设计目标**:
- Canonical Schema 往返闸门：export → import → export → diff，必须 return 0 diffs（D25.6.2）
- Multi-pass FK 导入解决循环依赖（D25.6.4）
- belongsTo 仅存 FK ID，hasMany 不内嵌子记录（D25.6.5）
- diff() 返回结构化 DiffReport，闸门可诊断（D25.6.6）
- 强制 PostgreSQL 16（D25.6.7），利用 SET CONSTRAINTS ALL DEFERRED + REPEATABLE READ

**不在范围内**:
- Odoo/Strapi 等非 NocoBase 源平台的导出（扩展点，Phase 3+）
- Import conflictStrategy（ON CONFLICT UPSERT — Phase 1b）
- 增量同步 / CDC 变更数据捕获
- 数据签名 / 校验和（Phase 2+）

## 2. 接口定义

### 2.1 export.ts (`src/export.ts`)

```typescript
import type { Database } from '@nocobase/server';
import type { CanonicalSnapshot } from '@audebase/canonical-schema';

interface ExportOptions {
  /** 限定导出的 collection 名称列表。省略则导出所有非系统表。 */
  collections?: string[];
  /** 是否排除 NocoBase 系统表。默认 true。 */
  excludeSystemTables?: boolean;
  /** 分批查询大小，默认 1000。 */
  batchSize?: number;
  /** 快照时间点 — 所有查询过滤 createdAt < exportStartTime。不传则 use Date.now()。 */
  exportStartTime?: Date;
}

/**
 * 从 NocoBase 数据库导出为 CanonicalSnapshot。
 *
 * 关联数据策略 (D25.6.5):
 *   - belongsTo: 存储 `{ deviceId: "uuid" }`（仅 FK 值，不内嵌关联对象）
 *   - hasMany: 不内嵌子记录。子记录作为独立 Collection 导出，FK 字段指向父记录 id
 *   - manyToMany: 中间表作为独立 Collection 导出
 *
 * 分页策略: keyset pagination（`WHERE id > lastId ORDER BY id LIMIT batchSize`）
 *           自增 ID 存在时使用 keyset，不存在时 fallback OFFSET。
 */
export async function exportToCanonical(
  db: Database,
  options?: ExportOptions
): Promise<CanonicalSnapshot>;
```

### 2.2 import.ts (`src/import.ts`)

```typescript
interface ImportResult {
  /** 成功导入记录数 */
  imported: number;
  /** 跳过记录数（如重复 id） */
  skipped: number;
  /** 错误详情 */
  errors: Array<{
    collection: string;
    recordId: string;
    message: string;
  }>;
}

interface ImportOptions {
  /** 限定导入的 collection 名称列表。省略则导入 snapshot 中全部 collection。 */
  collections?: string[];
}

/**
 * 将 CanonicalSnapshot 导入 NocoBase 数据库。
 *
 * Multi-pass FK 策略 (D25.6.4):
 *   1. topologicalSort 获取导入顺序
 *   2. PG 事务: BEGIN → SET CONSTRAINTS ALL DEFERRED
 *   3. 无循环依赖的 collection: 顺序 INSERT
 *   4. 有循环/自引用依赖的 collection:
 *      Pass 1: INSERT 所有记录（FK 字段 = NULL）
 *      Pass 2: UPDATE FK 字段为实际值
 *   5. COMMIT（失败 → ROLLBACK）
 *
 * 不在范围内: conflictStrategy（ON CONFLICT UPSERT）— Phase 1b
 */
export async function importFromCanonical(
  db: Database,
  snapshot: CanonicalSnapshot,
  options?: ImportOptions
): Promise<ImportResult>;
```

### 2.3 diff.ts (`src/diff.ts`)

```typescript
interface DiffReport {
  match: boolean;
  diffs: Array<{
    collection: string;
    recordId: string;
    field: string;
    expected: unknown;
    actual: unknown;
  }>;
}

/**
 * 比较两个 CanonicalSnapshot，返回结构化差异报告。
 *
 * 对比策略:
 *   1. 剥离元数据字段: exportedAt, source.version
 *   2. 浮点数容差: Math.abs(a - b) < 1e-10 视为相等
 *   3. NaN/Infinity: Number.isFinite guard，非有限直接标记为 diff
 *   4. 逐 collection → 逐 record → 逐字段浅层对比
 *   5. JSONB/嵌套对象: 浅层比较（深度对比 Phase 2）
 *
 * 闸门条件: match === true && diffs.length === 0
 */
export function diffSnapshots(
  a: CanonicalSnapshot,
  b: CanonicalSnapshot
): DiffReport;
```

### 2.4 topological-sort.ts (`src/topological-sort.ts`)

```typescript
interface CollectionSchema {
  name: string;
  fields: Array<{
    name: string;
    type: string;
    target?: string; // belongsTo target collection name
  }>;
}

/**
 * FK 依赖拓扑排序 (Kahn's algorithm)。
 *
 * 返回: string[][] — 外数组为执行批次（按依赖顺序），内数组为可并行执行的 collection 名称。
 *
 * 循环检测: 检测到循环 → 标记为 multi-pass 表 → 返回时将其从 DAG 中排除，
 *           单独放在额外的 multiPass 批次中。
 */
export function topologicalSort(collections: CollectionSchema[]): {
  batches: string[][];       // 无环依赖批次（外→内 = 先→后执行）
  multiPass: string[];       // 循环依赖表（需 multi-pass FK 导入）
};

/**
 * 检测循环依赖，返回参与循环的 collection 名称列表。
 * 无循环返回 []。
 */
export function detectCycles(collections: CollectionSchema[]): string[];
```

### 2.5 noco-base-tables.ts (`src/noco-base-tables.ts`)

```typescript
/** NocoBase 系统表名称集合（白名单，硬编码 ~15 张表） */
export const SYSTEM_TABLE_NAMES: ReadonlySet<string>;

/** 检查表名是否属于 NocoBase 系统表（case-insensitive） */
export function isSystemTable(tableName: string): boolean;
```

系统表白名单：

| 表名 | 说明 |
|------|------|
| `_schema_migrations` | Schema 迁移记录 |
| `_schema_collections` | Collection 元数据 |
| `_schema_fields` | Field 元数据 |
| `_schema_views` | View 元数据 |
| `roles` | RBAC 角色 |
| `roles_resources` | 角色-资源关联 |
| `roles_resources_actions` | 角色-资源-操作 |
| `roles_resources_scopes` | 角色-资源-范围 |
| `users` | 用户表 |
| `actions` | 操作定义 |
| `collections` | Collection 注册 |
| `plugins` | 插件注册 |
| `migrations` | 迁移历史 |
| `audits` | 审计日志 |
| `refresh_tokens` | JWT Refresh Token |

### 2.6 导出清单 (`src/index.ts`)

```typescript
export { exportToCanonical } from './export';
export type { ExportOptions } from './export';
export { importFromCanonical } from './import';
export type { ImportResult, ImportOptions } from './import';
export { diffSnapshots } from './diff';
export type { DiffReport } from './diff';
export { topologicalSort, detectCycles } from './topological-sort';
export { isSystemTable, SYSTEM_TABLE_NAMES } from './noco-base-tables';
```

## 3. 生命周期

**exportToCanonical**:
1. 从 `db.collections` 获取 NocoBase Collection schemas
2. 调用 `isSystemTable` 过滤系统表
3. 记录 `exportStartTime`（快照时间点，用于 createdAt 过滤）
4. 按 `topologicalSort` 排序后的 collection 顺序遍历
5. 每个 collection：keyset pagination 分批查询（batchSize 默认 1000）
6. 字段处理：belongsTo → FK id，hasMany → 独立 Collection，普通字段 → 原值
7. 组装 CanonicalSnapshot 返回

**importFromCanonical**:
1. `topologicalSort` 获取导入顺序
2. PG 事务 `BEGIN`
3. `SET CONSTRAINTS ALL DEFERRED`
4. Regular collections: 顺序 INSERT
5. Multi-pass collections: Pass 1 INSERT (FK=NULL) → Pass 2 UPDATE FK
6. `COMMIT`（失败 → `ROLLBACK`）
7. 返回 `ImportResult`

**diffSnapshots**: 纯函数，无事务边界。同步执行（无 I/O）。

**错误处理**: 所有数据库操作在 PG 事务中执行。export 查询错误 → throw（调用方决定重试/跳过）。import INSERT 失败 → ROLLBACK 整个事务，返回 `ImportResult.errors`。

## 4. 依赖关系

| 依赖 | 类型 | 版本 | 用途 |
|------|:---:|------|------|
| `@audebase/canonical-schema` | runtime | workspace:* | CanonicalSnapshot 类型 + Zod 验证 |
| `@nocobase/server` | runtime | ^2.1.29 | Database 实例（Collection API + Sequelize query） |
| `typescript` | devDep | ^5.x | 编译期类型检查 |
| `vitest` | devDep | ^3.x | 单元测试 |
| `pg` (via nocobase) | transitive | — | PostgreSQL 驱动 |
| `sequelize` (via nocobase) | transitive | — | NocoBase ORM |

**被依赖方**: 独立工具包，不被其他 AUDEBase 包依赖。由人工或 CI 脚本直接调用。

## 5. 错误码与错误处理

| 错误码 | 触发条件 | 恢复策略 |
|--------|---------|---------|
| `SYSTEM_TABLE_FILTERED` | export 尝试导出系统表 | warn → 跳过该表（不阻断） |
| `UNKNOWN_TABLE_WARN` | 表名不在白名单也非系统表 | warn → 操作员确认 → 补入白名单 |
| `EXPORT_TIMEOUT` | 单表查询超时 30s | throw → 调用方减小 batchSize 重试 |
| `EXPORT_OOM` | 内存超过 512MB 阈值 | throw → 调用方减小 batchSize |
| `IMPORT_FK_FAILURE` | FK UPDATE 失败（目标记录不存在） | ROLLBACK → 返回 ImportResult.errors |
| `IMPORT_DUPLICATE_ID` | INSERT 冲突（id 已存在） | 跳过该记录，记录到 errors |
| `IMPORT_CONSTRAINT_VIOLATION` | NOT NULL / UNIQUE 约束违反 | ROLLBACK → 返回 ImportResult.errors |
| `CYCLE_DETECTED` | FK 循环依赖 | 自动降级为 multi-pass 导入 |
| `DIFF_MISMATCH` | 往返闸门失败 | 返回 DiffReport.diffs（每条差异含 collection/recordId/field） |
| `INVALID_SNAPSHOT` | Zod 验证失败 | throw → `CanonicalSnapshotSchema.parse()` 报 ZodError |
| `TRANSACTION_FAILED` | PG 事务 COMMIT 失败 | ROLLBACK 自动执行 |

**日志级别**:
- `warn`: SYSTEM_TABLE_FILTERED, UNKNOWN_TABLE_WARN, DIFF_MISMATCH
- `error`: EXPORT_TIMEOUT, IMPORT_FK_FAILURE, TRANSACTION_FAILED
- `info`: export 开始/完成（含 record count），import 开始/完成（含 imported/skipped）

## 6. 安全考虑

| 安全点 | 措施 |
|--------|------|
| SQL 注入防护 | 所有查询通过 NocoBase Database API（Sequelize 参数化查询），不拼接 SQL 字符串 |
| 系统表隔离 | `SYSTEM_TABLE_NAMES` 硬编码白名单 + `isSystemTable` 过滤，防止导出 NocoBase 内部表 |
| 快照隔离 | `exportStartTime` + `createdAt < exportStartTime` 过滤，配合 PG REPEATABLE READ |
| 数据签名 | Phase 1a 不做签名。Phase 2+ 可加 `signature: string` 字段防止篡改 |
| 事务原子性 | import 全程在 PG 事务中，失败自动 ROLLBACK，不产生部分导入 |
| 输入验证 | importFromCanonical 入口处 `CanonicalSnapshotSchema.parse(snapshot)` (D8) |
| SET CONSTRAINTS | 仅用于 DEFERRED，不执行 DDL（不 GRANT/REVOKE/ALTER） |

## 7. Mock 约束

**NocoBase Database mock**（用于单元测试）:
- 必须实现 `db.collections` 属性（返回 Collection schema 数组）
- 必须实现 `db.getCollection(name).repository.find()` — 返回 Promise<Record[]>
- 必须实现 `db.getCollection(name).repository.create()` — 返回 Promise<Record>
- 必须实现 `db.getCollection(name).repository.update()` — 返回 Promise<void>
- `find()` 必须支持 `filter`, `limit`, `offset`, `order` 参数
- 所有 repository 方法必须 async（返回 Promise）
- 响应数据必须 JSON 序列化/反序列化（模拟真实 I/O）
- 超时设置: 30s

**PG 事务 mock**（用于 import 测试）:
- `db.sequelize.transaction()` → 返回 mock transaction 对象
- mock transaction 支持 `commit()` / `rollback()`
- `SET CONSTRAINTS ALL DEFERRED` → mock 中 no-op

## 8. 变更记录

| 日期 | 版本 | 变更 | 作者 |
|------|------|------|------|
| 2026-07-22 | 1.0 | 初始 SDD：export/import/diff + topological-sort + noco-base-tables | AI Agent |
