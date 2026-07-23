# AUDEBase Phase 1a 执行计划 — 混合策略

**日期:** 2026-07-22
**决策:** 双 Oracle 审查 + 4 角色团队审查后 — 先证明 Canonical Schema 可行，再渐进抽象
Status: approved, pending implementation

## 0. Prerequisites

Required before any Phase 1a work:

| Item | Requirement | Check |
|------|-------------|-------|
| NocoBase | v2.1.29 (exact) | `yarn create nocobase-app audebase-platform` |
| Database | PostgreSQL 16 (NOT SQLite — plan uses SET CONSTRAINTS, REPEATABLE READ) | `psql -c 'SELECT version()'` must return PostgreSQL |
| Node.js | v22+ | `node -v` |
| Package manager | **双生态并存**: NocoBase 插件用 `yarn`（NocoBase 依赖），AUDEBase 工具包用 `pnpm`（项目标准） | `yarn -v` + `pnpm -v` |
| Plugin scaffold | `yarn pm create @audebase/plugin-3d-printer` | Creates plugin directory skeleton |

All plugins created via NocoBase CLI: `yarn pm create @audebase/plugin-{name}`.
Development: `yarn dev` starts NocoBase with hot reload for all plugins (within the NocoBase app directory).

AUDEBase standalone packages (canonical-schema, migration-engine) remain in the pnpm monorepo at `packages/`. NocoBase plugins live in the NocoBase app's `packages/plugins/` directory under yarn. Cross-ecosystem dependency: `@audebase/canonical-schema` is symlinked into the NocoBase app via workspace protocol or `file:` reference.
## 1. 决策背景

### 1.1 为什么不全量抽象层？

2026-07-22 双 Oracle 并行审查 + 4 角色团队审查（风险猎手 / 范围审计 / 技术挑战 / 极简主义）：

**Oracle 发现（4 CRITICAL）：**

| # | 问题 | 影响 |
|---|------|------|
| O1 | `IDataEngine` 无事务支持 | 业务逻辑无法原子化（创建任务 + 扣材料 + 写日志） |
| O2 | `IDataClient` N+1 查询 | 每个列表页 1+N×2 次 HTTP |
| O3 | `IFileService` 无流式上传 | 3D 模型文件 50-500MB，OOM |
| O4 | Phase 1 时间线 2-3× 低估 | 8-12 周，3D 打印机项目等不起 |

**团队审查发现（5 CRITICAL）：**

| # | 问题 | 后果 | 缓解 |
|---|------|------|------|
| T1 | hasMany 关联数据倒灌 — 导出时子记录既在 records[] 中又在父记录 data 中 | 导入后数据翻倍 | 关联字段只存 ID 数组，不内嵌完整记录 |
| T2 | FK 循环依赖（A→B, B→A）— topologicalSort 直接失败 | 导入阻塞 | Multi-pass：第一遍 INSERT NULL FK → 第二遍 UPDATE FK |
| T3 | 分页导出无快照隔离 — page 1 后新数据写入 | 数据不一致 | 读已提交 + 按 `createdAt < exportStartTime` 过滤 |
| T4 | Agent 零认证 — WebSocket/HTTP 无 token 校验 | 任意客户端可冒充打印机 | Agent 启动时 JWT 登录 → 携带 token |
| T5 | WebSocket 不适合 IoT — 连接管理复杂、亚秒级延迟无必要 | 过度工程 | HTTP polling（每 5 秒 fetch）完全够用 |

结论：**Canonical Schema + IMigrationEngine 才是真正的解耦点，不是 IPlatform 抽象层。**

### 1.2 混合策略

```
Phase 1a (~4 周双人) — 探索期
  3D 打印机 MVP：可直接 import @nocobase/server
  解耦靠 Canonical Schema export/import
  Admin = NocoBase Client（零新增）
  Agent = HTTP polling（非 WebSocket）
  目的：快速交付，探索 NocoBase API 形态，为抽象层设计提供实战输入

Phase 1a→1b 过渡闸门 (1-2 周)
  🔒 强制完成 IPlatformClient 最小可行接口
  🔒 基于 3D 打印机真实调用提取：IDataClient / IAuthClient / ITenantClient
  🔒 实现 adapter-nocobase/client
  🔒 验证闸门：plugin-3d-printer 用例通过 usePlatform() 重放通过

Phase 1b+ (3-4 周) — 正式期
  🚫 禁止新业务插件（OA/ERP/MES）直接 import @nocobase/*
  ✅ 必须通过 IPlatform/usePlatform() 调用平台能力
  旧 plugin-3d-printer 可选迁移（非强制）

Phase 2+ — 持续抽象
  第二个业务应用 → 提取共性 → 接口稳定 v1.0
```

### 1.3 团队审查采纳的削减

| 砍掉的 | 省 | 何时恢复 |
|--------|:---:|---------|
| WebSocket → HTTP polling | 1.5 天 | 亚秒级指令需求时 |
| `diff()` 结构化 → 简易 JSON 对比 | 0.5 天 | 迁移 UI 需要逐记录差异时 |
| `StatsPage.tsx` | 0.5 天 | 运营要求仪表盘时 |
| `costPerKg` 字段 | 忽略 | 成本追踪需求时 |
| Import 选项精简（conflictStrategy/dryRun/batchSize） | 0.3 天 | 冲突场景出现时 |

## 2. Phase 1a 交付物

| 包 | 类型 | 说明 | 校准后 |
|---|------|------|:---:|
| `@audebase/canonical-schema` | 纯 TS 类型包 | CanonicalSnapshot + CanonicalCollection + CanonicalRecord + Zod validators | 1.5 天 |
| `@audebase/migration-engine` | 独立工具 | NocoBase → Canonical Schema export + multi-pass import + 简易 diff | 8 天 |
| `@audebase/plugin-record-rules` | NocoBase 插件 | Poland-notation 解析 + Sequelize WhereOptions + ACL 中间件 | ✅ 已完成 |
| `@audebase/plugin-3d-printer` | NocoBase 插件 | 打印任务 + 设备 + 材料（3 Collections，3 页面，无 Stats） | 10.5 天 |
| 3D 打印机 Agent | Node.js 脚本 | HTTP polling 心跳 + 命令轮询 + 进度上报（~150 行） | 1.5 天 |
| Admin UI | NocoBase Client | 零新增代码 | 0 |

Total: ~23d solo / ~4 weeks dual parallel

### 2.1 并行路径

Person A:
  [Day 1 AM] canonical-schema SDD -> TDD (AI 生成 + 人工 review, 1h)
  [Day 1 PM] canonical-schema 编码 (0.5d)
  [Day 2 AM] migration-engine SDD -> TDD (AI 生成 + review, 2h)
  [Day 2 PM - Day 9] migration-engine 编码 (7.8d)
  [Day 10-11] Agent (1.5d)
  = 10.5d

Person B:
  [Day 1-2] NocoBase env setup + doc reading + SchemaComponent pattern validation
  [Day 3-4] 3 Collection 骨架开发 + NocoBase 字段行为验证
  [Day 5] plugin-record-rules NocoBase 集成测试 (0.5d)
  [Day 6-9] migration-engine SDD review + 对齐 Canonical Schema 接口
  [Day 10 AM] plugin-3d-printer SDD -> TDD (AI 生成 + review, 2h)
  [Day 10 PM - Day 19] plugin-3d-printer 编码 (9.8d)
  = 10d

Gate checkpoint (Day 10): A completes migration-engine + B verifies Canonical Schema alignment -> integration test (1d)
SDD/TDD gate: Day 1 (canonical-schema), Day 2 (migration-engine), Day 10 (plugin-3d-printer) — each must have -sdd.md + -tdd.md completed before coding starts.
Total: ~17 workdays = ~4 weeks
## 3. 包设计

### 3.1 `@audebase/canonical-schema`

```
@audebase/canonical-schema/
├── src/
│   ├── types.ts          # CanonicalSnapshot, CanonicalCollection, CanonicalRecord
│   └── index.ts
├── package.json          # 零 runtime 依赖，仅 TypeScript (devDep)
└── vitest.config.ts
```

Core types (zero runtime deps, TypeScript only):

```typescript
interface CanonicalRecord {
  id: string;
  [field: string]: unknown;
}
interface CanonicalCollection {
  name: string;
  records: CanonicalRecord[];
}
interface CanonicalSnapshot {
  version: '1.0';
  exportedAt: string;
  source: { platform: 'nocobase'; version: string };
  collections: CanonicalCollection[];
}
```

Zod validators **retained** (D8 requires Zod at all system boundaries). TS compile-time types + Zod runtime validation for CanonicalSnapshot structure.

#### 3.1.1 实现步骤（1.5 天）

**Step 1 — 初始化包 (15 min)**

```bash
mkdir -p packages/canonical-schema/src
cd packages/canonical-schema
npm init -y --scope=@audebase
```

`package.json`: `"types": "./src/index.ts"`, devDep `typescript`, 零 runtime 依赖。

**Step 2 — 定义类型 (30 min)**

`src/types.ts`: 导出以下三个接口：
- `CanonicalRecord { id: string; [field: string]: unknown }`
- `CanonicalCollection { name: string; records: CanonicalRecord[] }`
- `CanonicalSnapshot { version: '1.0'; exportedAt: string; source: { platform: string; version: string }; collections: CanonicalCollection[] }`

**Step 3 — Zod validators (30 min)**

`src/schema.ts`: Zod schemas for runtime validation:
```typescript
import { z } from 'zod';

const CanonicalRecordSchema = z.object({
  id: z.string(),
}).passthrough(); // allow arbitrary fields

const CanonicalCollectionSchema = z.object({
  name: z.string(),
  records: z.array(CanonicalRecordSchema),
});

export const CanonicalSnapshotSchema = z.object({
  version: z.literal('1.0'),
  exportedAt: z.string().datetime(),
  source: z.object({
    platform: z.enum(['nocobase']),
    version: z.string(),
  }),
  collections: z.array(CanonicalCollectionSchema),
});

export type CanonicalSnapshot = z.infer<typeof CanonicalSnapshotSchema>;
```

`src/index.ts`: re-export both types AND zod schemas from `./types` and `./schema`.

**Step 4 — re-export (10 min)**

Implementation: `export { CanonicalRecord, CanonicalCollection, CanonicalSnapshot } from './types'; export { CanonicalSnapshotSchema } from './schema';`

**Step 5 — 编译验证 (15 min)**
- Run `npx tsc --noEmit`，确认零错误
- Zod validator included (D8 requires Zod at all system boundaries)

**Step 6 — 单元烟雾测试 (20 min)**

`src/types.test.ts`：编写 5 个测试（3 类型 + 2 Zod）：
```typescript
```typescript
// Test 1: CanonicalSnapshot structure
const snap: CanonicalSnapshot = {
  version: '1.0',
  exportedAt: new Date().toISOString(),
  source: { platform: 'nocobase', version: '2.1.29' },
  collections: [{ name: 'test', records: [{ id: '1', foo: 'bar' }] }]
};
expect(snap.version).toBe('1.0');

// Test 2: CanonicalRecord allows arbitrary fields
const rec: CanonicalRecord = { id: 'x', extra: 42, nested: { a: 1 } };
expect(rec.extra).toBe(42);

// Test 3: CanonicalCollection records array
const coll: CanonicalCollection = { name: 'foo', records: [] };
expect(coll.records).toEqual([]);

// Zod validation tests
import { CanonicalSnapshotSchema } from '../src/schema';

// Test 4: valid snapshot passes validation
test('CanonicalSnapshotSchema validates correct snapshot', () => {
  const result = CanonicalSnapshotSchema.safeParse(snap);
  expect(result.success).toBe(true);
});

// Test 5: invalid snapshot rejected
test('CanonicalSnapshotSchema rejects missing version', () => {
  const invalid = { exportedAt: '...', source: {}, collections: [] };
  const result = CanonicalSnapshotSchema.safeParse(invalid);
  expect(result.success).toBe(false);
});
```
```

**Step 7 — 交付验证 (10 min)**
- `npx vitest run` 全部通过（5 tests）
- `npx tsc --noEmit` 零错误

**交付物**: `packages/canonical-schema/` — 纯类型包，零 runtime 依赖。
### 3.2 `@audebase/migration-engine`

```
@audebase/migration-engine/
├── src/
│   ├── export.ts              # NocoBase DB → CanonicalSnapshot
│   ├── import.ts              # CanonicalSnapshot → NocoBase DB (multi-pass FK)
│   ├── diff.ts                # 简易 JSON 对比（剥离元数据 → JSON.stringify ===）
│   ├── topological-sort.ts    # FK 依赖排序 + 循环检测
│   ├── noco-base-tables.ts    # NocoBase 系统表过滤清单
│   └── index.ts
├── package.json               # dep: @audebase/canonical-schema, @nocobase/server
└── vitest.config.ts
```

```typescript
// src/export.ts
async function exportToCanonical(
  db: Database,           // NocoBase Database instance
  options?: {
    collections?: string[];
    excludeMetadata?: boolean;
    batchSize?: number;   // 默认 1000，分批查询避免 OOM
    exportStartTime?: Date; // 快照时间点（读已提交 + createdAt 过滤）
  }
): Promise<CanonicalSnapshot>;

// src/import.ts
async function importFromCanonical(
  db: Database,
  snapshot: CanonicalSnapshot,
  options?: {
    collections?: string[];
  }
): Promise<ImportResult>;

// src/diff.ts
// Strip exportedAt + source.version, then compare per-record
// Returns structured DiffReport with collection/recordId/field-level diffs
async function diffSnapshots(
  a: CanonicalSnapshot,
  b: CanonicalSnapshot
: Promise<DiffReport>;

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

interface ImportResult {
  imported: number;
  skipped: number;
  errors: Array<{ collection: string; recordId: string; message: string }>;
}
```

**关键实现细节：**

1. **关联数据导出策略（修复 T1）**：
   - `belongsTo`：存储 `{ deviceId: "abc-123" }`（仅 FK 值）
   - `hasMany`：不内嵌子记录。子记录作为独立 Collection 导出，通过 FK 字段指向父记录
   - `manyToMany`：中间表作为独立 Collection 导出

2. **Multi-pass FK import (fixes T2 + NOT NULL handling)**:
   - Pass 1: SET CONSTRAINTS ALL DEFERRED -> INSERT all records, FK fields set NULL (or default placeholder)
   - Pass 2: UPDATE FK fields to actual values -> COMMIT
   - Self-reference (parentJobId -> id): same strategy
   - Wrapped in PG transaction (BEGIN...COMMIT/ROLLBACK), auto-rollback on failure
3. **快照隔离（修复 T3）**：
   - 记录 `exportStartTime`，所有查询加 `createdAt < exportStartTime`
   - 使用 PostgreSQL `REPEATABLE READ` 或读已提交

4. **NocoBase 系统表过滤**：
   - 内置过滤清单：`_schema_migrations`, `_schema_collections`, `_schema_fields`, `_schema_views`, `roles`, `rolesResources`, `rolesResourcesActions`, `rolesResourcesScopes`, `users`, `actions`, `collections` 等 ~15+ 张表

5. **FK 拓扑排序 + 循环检测**：
   - 标准 topological sort（Kahn's algorithm）
   - 检测到循环 → 标记为 multi-pass 表 → 按依赖层数分批导入

#### 3.2.1 实现步骤（8 天）

**Step 1 — 初始化包 + 依赖 (30 min)**

```bash
mkdir -p packages/migration-engine/src
cd packages/migration-engine
npm init -y --scope=@audebase
npm install @nocobase/server
```

`package.json`: dep `@audebase/canonical-schema` (workspace link), `@nocobase/server`。
`vitest.config.ts`: 配置 PostgreSQL 测试数据库连接（test DB, 非开发 DB）。

**Step 2 — NocoBase 系统表过滤清单 (1h)**

`src/noco-base-tables.ts`：
- 导出 `const SYSTEM_TABLE_NAMES: Set<string>` — 硬编码 ~15 张系统表名
- 导出 `isSystemTable(tableName: string): boolean`
- 白名单 + 动态发现：export 时 warn 未知表 → 操作员确认 → 补入白名单

TDD: 编写 4 个测试：
```
test('system tables are excluded')        // _schema_migrations, users 等被过滤
test('business tables are included')      // print_jobs, devices 不被过滤
test('unknown table logs warning')        // 不在白名单也不在系统表 = warn
test('case-insensitive table name match') // Postgres 默认小写
```

**Step 3 — FK 拓扑排序 (2h)**

`src/topological-sort.ts`：
- `topologicalSort(collections: CollectionSchema[]): string[][]`
  - 输入：NocoBase Collection schemas（含 fields 中 belongsTo/hasMany 关系）
  - 输出：按 FK 依赖分层的批次（内层数组可并行，外层数组顺序执行）
  - 算法：Kahn's algorithm
- `detectCycles(collections): string[]` — 检测循环依赖，返回参与循环的 collection
- 无循环 → 单一有序批次
- 有循环 → 标记为 multi-pass 表
  - 第一遍：INSERT 所有记录，FK 字段设 NULL
  - 第二遍：UPDATE FK 为实际值

TDD: 编写 6 个测试：
```
test('linear dependency: A->B->C sorts C,B,A')
test('no dependencies returns single batch')
test('multiple roots in same batch')           // A,B 都无依赖 → 可并行
test('detected cycle returns multi-pass list') // A->B, B->A
test('self-reference handled as cycle')        // job.parentJobId -> id
test('diamond dependency: D->A, D->B, A->C, B->C')
```

**Step 4 — export.ts (2 天)**

`src/export.ts`：
- `exportToCanonical(db, options?): Promise<CanonicalSnapshot>`
- 实现逻辑：
  1. 从 NocoBase `db.collections` 获取所有 Collection schemas
  2. 过滤系统表（调用 isSystemTable）
  3. 按选项过滤目标 collections
  4. 记录 `exportStartTime = new Date()`
  5. 分批查询（batchSize 默认 1000）：`SELECT * FROM <table> WHERE createdAt < exportStartTime ORDER BY id LIMIT batchSize OFFSET N`
  6. belongsTo 关联 → 仅存 FK ID（如 `{ deviceId: 'uuid' }`）
  7. hasMany/manyToMany → 子记录作为独立 Collection 带 FK 指向父记录
  8. 组装 `CanonicalSnapshot`
- Keyset pagination 优化：`WHERE id > lastId LIMIT 1000`（有自增 ID 时），fallback OFFSET

TDD: 编写 8 个测试：
```
test('exports business collections only')
test('filters by collection name option')
test('belongsTo field stores FK id only')
test('hasMany sub-records exported as separate collection')
test('manyToMany junction table exported')
test('snapshot includes version and source metadata')
test('creates snapshot with exportedAt timestamp')
test('large dataset batched without OOM')    // mock 5000 records, batchSize 1000
```

**Step 5 — diff.ts (1 天)**

`src/diff.ts`：
- `diffSnapshots(a, b): Promise<DiffReport>`
- 实现逻辑：
  1. 剥离元数据字段：`exportedAt`, `source.version`
  2. 规范化值：ISO 8601 时间 → 统一格式；浮点数 → `Math.abs(a-b) < 1e-10` 容差
  3. 逐 collection → 逐 record → 逐字段对比
  4. `Number.isFinite` guard: NaN/Infinity 直接标记为 diff
  5. 生成 `DiffReport { match: boolean, diffs: [...] }`
- 不处理 JSONB 嵌套差异（浅层对比），深度对比 Phase 2

TDD: 编写 6 个测试：
```
test('identical snapshots: match=true, diffs=[]')
test('single field difference: reported correctly')
test('float tolerance 1e-10: 0.1+0.2 equals 0.3')
test('NaN flagged as diff')
test('metadata fields excluded from comparison')
test('record count mismatch across snapshots')
```

**Step 6 — import.ts (2 天)**

`src/import.ts`：
- `importFromCanonical(db, snapshot, options?): Promise<ImportResult>`
- 实现逻辑：
  1. `topologicalSort` 获取导入顺序
  2. PG 事务：`BEGIN`
  3. `SET CONSTRAINTS ALL DEFERRED`
  4. Multi-pass FK：
     - Regular collections: 顺序 INSERT
     - Cycle/multi-pass collections:
       - Pass 1: INSERT 所有记录（FK = NULL）
       - Pass 2: UPDATE FK 为实际值
  5. `COMMIT`（失败 → ROLLBACK）
  6. 返回 `ImportResult { imported, skipped, errors }`
- 不处理：conflictStrategy（如 ON CONFLICT UPSERT）— Phase 1b

TDD: 编写 8 个测试：
```
test('imports snapshot into empty DB')
test('linear FK chain imported in correct order')
test('self-reference FK handled by multi-pass')
test('cycle FK: A->B B->A multi-pass succeeds')
test('transaction rolls back on error')
test('importResult reports error details per record')
test('duplicate id skipped with error entry')
test('NOT NULL FK: nullable pass then UPDATE')
```

**Step 7 — 集成往返测试 (1 天)**

`src/roundtrip.test.ts`：
- 端到端测试：export → import to fresh DB → export again → diff → assert match
- 3 个场景：
  1. 简单表（无 FK）
  2. 有 FK 依赖（devices → print_jobs）
  3. 有循环依赖（parentJobId self-reference）

```
test('roundtrip: simple table data preserved')
test('roundtrip: FK relationships preserved')
test('roundtrip: self-reference FK preserved')
```

**Step 8 — Gate 闸门验证 (30 min)**

```bash
# 1. 启动 NocoBase + 创建测试数据（通过 Admin UI 或 seed 脚本）
yarn dev

# 2. Export
node -e "
  const { exportToCanonical } = require('./packages/migration-engine/src/export');
  exportToCanonical(db).then(s => require('fs').writeFileSync('snap1.json', JSON.stringify(s, null, 2)));
"

# 3. 清空目标 DB → Import
node -e "
  const snap = require('./snap1.json');
  const { importFromCanonical } = require('./packages/migration-engine/src/import');
  importFromCanonical(db, snap).then(r => console.log(r));
"

# 4. Export 第二次 → Diff
node -e "
  const { exportToCanonical } = require('./packages/migration-engine/src/export');
  const { diffSnapshots } = require('./packages/migration-engine/src/diff');
  Promise.all([
    exportToCanonical(db).then(JSON.stringify),
    JSON.parse(require('fs').readFileSync('snap1.json'))
  ]).then(([a, b]) => {
    const r = diffSnapshots(JSON.parse(a), b);
    console.assert(r.match, 'ROUNDTRIP FAILED');
    if (!r.match) r.diffs.forEach(d => console.error(d));
  });
"
```

闸门 Go 条件：`r.match === true && r.diffs.length === 0`。
失败 → 1 周攻关 → 二次闸门 → 降级（接受 NocoBase 紧耦合）。

**交付物**: `packages/migration-engine/` — 3 核心模块 (export/import/diff) + 2 工具 (noco-base-tables/topological-sort)。
### 3.3 `@audebase/plugin-record-rules`

**已完成。** Phase 0 spike 产出，575 行，108 测试。

Phase 1a 仅需迁移为 NocoBase 插件格式，通过 `acl.use()` 注册。

### 3.4 `@audebase/plugin-3d-printer`

```
@audebase/plugin-3d-printer/
├── src/
│   ├── server/
│   │   ├── plugin.ts              # NocoBase Plugin 类
│   │   ├── collections/
│   │   │   ├── print-jobs.ts      # 打印任务 Collection 定义
│   │   │   ├── devices.ts         # 设备 Collection 定义
│   │   │   └── materials.ts       # 材料 Collection 定义
│   │   └── agent/
│   │       └── agent-handler.ts   # HTTP Agent 端点（心跳 + 命令 + 进度）
   |   ├── client/
   │   │   ├── PrintJobsPage.tsx      # NocoBase SchemaComponent page (JSON schema driven, NOT direct JSX)
   │   │   ├── DevicesPage.tsx         # NocoBase SchemaComponent page
   │   │   └── MaterialsPage.tsx       # NocoBase SchemaComponent page
│   └── manifest.yaml
├── package.json
└── vitest.config.ts
```

**Collection 定义（精简后）：**

```typescript
// collections/print-jobs.ts
{
  name: 'print_jobs',
  fields: [
    { name: 'name', type: 'string' },
    { name: 'status', type: 'string', uiSchema: {
      enum: ['queued', 'printing', 'paused', 'completed', 'failed', 'cancelled']
    }},
    { name: 'modelFile', type: 'string' },  // URL/path (NocoBase attachments integration -> Phase 1b)
    { name: 'sliceSettings', type: 'json' },
    { name: 'deviceId', type: 'belongsTo', target: 'devices' },
    { name: 'materialId', type: 'belongsTo', target: 'materials' },
    { name: 'progress', type: 'integer' },   // 0-100
    { name: 'estimatedTime', type: 'integer' },
    { name: 'actualTime', type: 'integer' },
    { name: 'startedAt', type: 'datetime' },
    { name: 'completedAt', type: 'datetime' },
  ]
}

// collections/devices.ts
{
  name: 'devices',
  fields: [
    { name: 'name', type: 'string' },
    { name: 'serialNumber', type: 'string', unique: true },
    { name: 'firmwareVersion', type: 'string' },
    { name: 'status', type: 'string', uiSchema: {
      enum: ['online', 'offline', 'printing', 'error']
    }},
    { name: 'lastHeartbeat', type: 'datetime' },
  ]
}

// collections/materials.ts
{
  name: 'materials',
  fields: [
    { name: 'name', type: 'string' },
    { name: 'type', type: 'string', uiSchema: {
      enum: ['PLA', 'ABS', 'PETG', 'TPU', 'other']
    }},
    { name: 'color', type: 'string' },
    { name: 'diameter', type: 'float' },   // 1.75 or 2.85
    { name: 'remainingWeight', type: 'float' },  // grams
    // costPerKg: 已砍（团队审查）
  ]
}
```

**已砍功能：**
- `StatsPage` — 推迟到运营需要仪表盘时
- `costPerKg` — 推迟到成本追踪需求时
- WebSocket 实时推送 — 改为 HTTP polling

#### 3.4.1 实现步骤（10 天）

**前置条件：** Person B 已在 Day 1-9 完成 NocoBase 环境搭建 + SchemaComponent 模式验证 + 3 个 Collection 骨架。Person B 还需在 Day 1-9 内完成 plugin-record-rules 集成测试（0.5 天）。

**Step 1 — 脚手架 (15 min)**

```bash
yarn pm create @audebase/plugin-3d-printer
```

自动创建目录结构和 `manifest.yaml`、`plugin.ts` 骨架。

**Step 2 — 编写 Collection 定义 (1.5 天)**

`src/server/collections/` 下创建 3 个文件：
- `print-jobs.ts` — 10 字段（含 2 belongsTo + json + integer）
- `devices.ts` — 5 字段（含 unique serialNumber + datetime）
- `materials.ts` — 5 字段（含 float + enum）

每种类型验证 NocoBase 字段行为：
- `string` + `unique: true` → 唯一约束生效？
- `belongsTo` → NocoBase auto-generates FK column？
- `json` → JSONB column created？
- `datetime` → timestamptz？
- `float` → `double precision`？
- `integer` → `integer`？

`plugin.ts` 中注册 Collections：
```typescript
export class Plugin3DPrinter extends Plugin {
  async load() {
    this.db.collection(printJobsSchema);
    this.db.collection(devicesSchema);
    this.db.collection(materialsSchema);
  }
}
```

**Step 3 — 验证 Collections 自动注册 (30 min)**
- 启动 NocoBase：`yarn dev`
- 登录 Admin → Collection Management → 确认 3 个表均存在
- 验证字段类型正确
- 验证 belongsTo 外键自动创建

**Step 4 — 编写 Agent HTTP 端点 (1.5 天)**

`src/server/agent/agent-handler.ts`：
- `POST /api/agent:poll` — 心跳 + 命令轮询
  - 输入：`{ deviceId, status, progress }`
  - 输出：`{ command: 'start'|'pause'|'cancel'|null, jobId?, fileUrl? }`
  - 3 个命令：`start`（分配新任务）、`pause`（暂停当前）、`cancel`（取消当前）
  - 更新 `devices.lastHeartbeat` + `devices.status` + `print_jobs.progress`
  - Token 验证：`ctx.state.currentUser` 从 JWT auth 解析

`plugin.ts` 中注册路由：
```typescript
this.app.resourcer.define({ name: 'agent', actions: { poll } });
```

TDD: 编写 `agent-handler.test.ts`：
```
test('heartbeat updates device.lastHeartbeat and status')
test('returns start command when queued job exists')
test('returns null command when no pending jobs')
test('rejects request without valid JWT token')
test('reports progress updates print_jobs.progress')
test('pause command pauses current job')
```

**Step 5 — 编写 Admin 页面 (3 天)**

3 个页面均使用 NocoBase SchemaComponent 模式（JSON schema 驱动，非手写 JSX）：

**PrintJobsPage (1 天):**
- `src/client/PrintJobsPage.tsx`
- SchemaComponent 定义：Table block + Form block + filter block
- 列：name, status, device, material, progress(进度条), estimatedTime, createdAt
- 筛选：status dropdown, deviceId select
- 表单：所有字段（创建/编辑），modelFile = URL 输入框
- Refresh: 2 秒 polling (ProTable pollInterval)

**DevicesPage (1 天):**
- `src/client/DevicesPage.tsx`
- SchemaComponent 定义：Table block + Form block
- 列：name, serialNumber, status(带颜色 Badge), firmwareVersion, lastHeartbeat(相对时间)
- 筛选：status dropdown
- 表单：name, serialNumber, firmwareVersion

**MaterialsPage (1 天):**
- `src/client/MaterialsPage.tsx`
- SchemaComponent 定义：Table block + Form block
- 列：name, type, color(色块), diameter, remainingWeight
- 筛选：type dropdown
- 表单：所有字段

每个页面 TDD:
```
test('page renders with data from API')
test('create form submits and refreshes table')
test('edit button opens pre-filled form')
test('delete button removes record after confirm')
test('table filters by status/type')
test('progress bar renders with correct percentage')
```

**Step 6 — 集成测试：CRUD (1 天)**

通过 Admin UI 验证：
1. 启动 NocoBase：`yarn dev`
2. 登录 → 3D Printer 菜单
3. 创建 Device → 验证出现在设备列表
4. 创建 Material → 验证出现在材料列表
5. 创建 Print Job（关联设备+材料）→ 验证 FK 选择器有效
6. 编辑 Print Job → 修改 status → 保存
7. 删除 → 确认删除
8. 切换页面间导航 → 菜单高亮正确

**Step 7 — Agent 集成测试 (1 天)**

```bash
# 1. 创建测试设备（通过 API 或 Admin UI）
curl -X POST http://localhost:13000/api/devices:create \
  -H 'Content-Type: application/json' \
  -d '{"name":"Test Printer","serialNumber":"SN-001"}'

# 2. 配置 Agent
cd agent && cat > config.json <<EOF
{
  "serverUrl": "http://localhost:13000",
  "deviceId": "<device-uuid>",
  "password": "agent-password"
}
EOF

# 3. 启动 Agent
node agent.js

# 4. 验证心跳
# 检查 devices.lastHeartbeat 已更新
curl http://localhost:13000/api/devices:get?filter=...

# 5. 创建打印任务 → 验证 Agent 收到 start 命令
curl -X POST http://localhost:13000/api/print_jobs:create \
  -d '{"name":"Test Job","deviceId":"<uuid>","materialId":"<uuid>","modelFile":"https://..."}'

# 6. 5 秒内 Agent 日志应显示：Received start command
```

**Step 8 — 修复与润色 (1 天)**
- 修复 Step 5-7 中发现的任何问题
- UI 对齐：颜色、间距、响应式
- Agent 错误场景：网络断开 → 重连 → 恢复
- 文档：Agent README.md（安装、配置、启动步骤）

**交付物**: `packages/plugin-3d-printer/` + `agent/` — 全功能 3D 打印机 MVP。
### 3.5 3D 打印机 Agent

```
agent/
├── agent.js          # Node.js 脚本，~150 行
├── package.json      # 零外部依赖（仅 Node.js 内置 http 模块）
└── config.json       # 云端 URL + 打印机 ID + 认证 token
```

```javascript
// agent.js (pseudocode)
// ponytail: config.json chmod 0600; override via AUDE_DEVICE_ID/AUDE_DEVICE_PASSWORD env vars
const config = require('./config.json');

const BASE = config.serverUrl;
let TOKEN = null;
let TOKEN_AGE = 0;
// JWT login with retry + exponential backoff
async function login() {
  for (let attempt = 0; attempt &lt; 5; attempt++) {
    try {
      const res = await fetch(BASE + '/api/auth:signIn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account: config.deviceId, password: config.password })
      });
      const { data } = await res.json();
      TOKEN_AGE = Date.now;
      return data.token;
    } catch (e) {
      if (attempt === 4) throw e;
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
    }
  }
}

// Startup state recovery after crash
async function recoverState(deviceId, token) {
  const res = await fetch(BASE + '/api/print_jobs:list?filter=' + JSON.stringify({ deviceId, status: 'printing' }), {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  const { data } = await res.json();
  if (data && data.length > 0) currentJob = data[0];
}

// Heartbeat + command polling (every 5s, with error recovery + token refresh)
let currentJob = null;
let consecutiveFailures = 0;
async function poll(deviceId) {
  // Refresh token if older than 10 minutes
  if (Date.now() - TOKEN_AGE > 600_000) {
    TOKEN = await login();
  }
  try {
    const res = await fetch(BASE + '/api/agent:poll', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
  try {
    const res = await fetch(BASE + '/api/agent:poll', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId,
        status: currentJob ? 'printing' : 'idle',
        progress: currentJob ?.progress ?? null
      })
    });
    const { data } = await res.json();
    consecutiveFailures = 0;

    // Handle commands (ponytail: stub, real hardware interaction Phase 1b)
    if (data.command === 'start') startPrint(data.jobId, data.fileUrl);
    if (data.command === 'pause') pausePrint();
    if (data.command === 'cancel') cancelPrint();
  } catch (e) {
    consecutiveFailures++;
    if (consecutiveFailures > 10) {
      console.error('Agent: too many failures, exiting');
      process.exit(1);
    }
  }
}

// Progress reporting (non-fatal, retried next poll)
async function reportProgress(jobId, progress, token) {
  try {
    await fetch(BASE + '/api/print_jobs:update', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ filter: { id: jobId }, values: { progress } })
    });
  } catch (e) { /* progress loss non-fatal, next poll retries */ }
}

// Main loop
(async () => {
  const token = await login();
  await recoverState(config.deviceId, token);
  setInterval(() => poll(config.deviceId, token), 5000);
})();

**团队审查变更：** WebSocket → HTTP polling。消除了 `ws` 依赖，Agent 零外部依赖（仅 Node.js 内置 `fetch`），服务端不再需要 WebSocket 服务器。

#### 3.5.1 实现步骤（1.5 天）

**Step 1 — 创建 agent/ 目录 (5 min)**

```bash
mkdir -p agent
cd agent
npm init -y
```

`package.json`: 零外部依赖（Node.js v22 内置 `fetch`）。`"type": "commonjs"`（require config.json）。

**Step 2 — config.json 模板 (10 min)**

```json
{
  "serverUrl": "http://localhost:13000",
  "deviceId": "<replace-with-device-uuid-from-admin-ui>",
  "password": "<replace-with-device-password>"
}
```

安全性标注：
- `chmod 0600 config.json`
- 覆写方式：环境变量 `AUDE_DEVICE_ID` / `AUDE_DEVICE_PASSWORD`
- Phase 1b：设备证书替代密码

**Step 3 — 实现 login() (30 min)**

- `POST /api/auth:signIn` with `{ account: deviceId, password }`
- 指数退避重试：5 次，2^attempt × 1000ms
- 记录 `TOKEN_AGE = Date.now()`
- 错误处理：不吞错误，5 次后 throw

**Step 4 — 实现 recoverState() (20 min)**
- 启动后查询是否有 in-progress 打印任务
- `GET /api/print_jobs:list?filter={ deviceId, status: 'printing' }`
- 找到 → 恢复 currentJob 引用
- Agent 崩溃重启后不会丢失任务状态

**Step 5 — 实现 poll() (1h)**
- Token 刷新：超过 10 分钟 → `login()` 重新获取
- `POST /api/agent:poll` with `{ deviceId, status, progress }`
- 命令处理：
  - `start` → `startPrint(jobId, fileUrl)`（Phase 1a stub：仅 log）
  - `pause` → `pausePrint()`（Phase 1a stub：仅 log）
  - `cancel` → `cancelPrint()`（Phase 1a stub：仅 log）
- 错误恢复：consecutiveFailures 计数器，超过 10 → `process.exit(1)`

**Step 6 — 实现 reportProgress() (20 min)**
- `POST /api/print_jobs:update` with `{ filter: { id }, values: { progress } }`
- 非致命错误（try/catch，失败仅 log）— 下一次 poll 重试

**Step 7 — 主循环 (15 min)**
- `(async () => { login → recoverState → setInterval(poll, 5000) })()`
- 5 秒间隔对齐服务端 30 秒心跳超时（6 个周期内至少一次成功）

**Step 8 — 集成测试 (30 min)**
- 与 Step 6（plugin-3d-printer 的 Agent 集成测试）同步进行
- 验证：心跳更新 lastHeartbeat、命令接收、进度上报、token 刷新

**交付物**: `agent/agent.js` (~150 行) + `agent/config.json` — 零外部依赖 Agent。
## 4. 数据模型

```
print_jobs ──belongsTo──▶ devices
    │
    └──belongsTo──▶ materials

devices:
  id, name, serialNumber, firmwareVersion, status (online|offline|printing|error),
  lastHeartbeat, createdAt, updatedAt

materials:
  id, name, type (PLA|ABS|PETG|TPU|other), color, diameter (1.75|2.85),
  remainingWeight, createdAt, updatedAt
  // costPerKg: 已砍

print_jobs:
  id, name, status, modelFile (string URL/path), sliceSettings (JSON),
  deviceId (FK→devices), materialId (FK→materials),
  progress (0-100), estimatedTime, actualTime,
  startedAt, completedAt, createdAt, updatedAt
```

## 5. 阶段性验收检查点

每个检查点面向人工 QA — 打开浏览器，按步骤操作，眼见为实。

### M1 — Week 1 验收（Day 5）：平台就绪 + 类型验证

**前置条件：** Person B Day 1-4 完成 NocoBase 环境搭建 + SchemaComponent 模式验证。Person A Day 1-4 完成 canonical-schema 包。

**环境检查：**

```bash
yarn dev                    # NocoBase 启动在 http://localhost:13000
npx tsc --noEmit            # canonical-schema 编译零错误
npx vitest run              # canonical-schema 3 测试通过
```

**UI 验收操作（NocoBase Admin UI -> http://localhost:13000/admin）：**

| # | 操作 | 预期结果 | 实际 |
|---|------|---------|:---:|
| 1.1 | 浏览器打开 `/admin`，用 root 账号登录 | 显示 Dashboard 页面，左侧菜单可见 | [ ] |
| 1.2 | 点击右上角用户头像 -> "用户中心" | 显示当前用户信息 | [ ] |
| 1.3 | 进入 Settings -> Collection Manager | 系统表列表可见（users, roles 等） | [ ] |
| 1.4 | 新建 Collection：`test_roundtrip`，添加 3 个字段（name, count, active） | Collection 创建成功，出现在列表中 | [ ] |
| 1.5 | 在 `test_roundtrip` 中手动创建 5 条记录 | 记录出现在 Table 中，翻页正常 | [ ] |
| 1.6 | 命令行：`npx vitest run packages/canonical-schema/` | 3/3 tests passed | [ ] |
| 1.7 | 命令行：`curl http://localhost:13000/api/health` | 返回 `{"status":"ok"}`
| 1.8 | NocoBase 日志检查：`tail -n 20 storage/logs/nocobase.log` | 无 ERROR 级别日志，启动耗时 < 10s

**通过标准：** 8/8 [ ] 打勾。

---

### M2 — Week 2 验收（Day 10）：Canonical Schema 往返闸门

**前置条件：** Person A 完成 migration-engine export/import/diff + roundtrip 集成测试。Person B 完成 3 个 Collection 骨架 + plugin-record-rules 集成。

```bash
npx vitest run packages/migration-engine/   # 35 tests passed
```

**UI 验收操作：**

| # | 操作 | 预期结果 | 实际 |
|---|------|---------|:---:|
| 2.1 | Admin UI -> Settings -> Collection Manager | 确认 `print_jobs`、`devices`、`materials` 3 个 Collection 存在 | [ ] |
| 2.2 | 点开 `devices` -> 查看字段列表 | 5 个字段（name, serialNumber, firmwareVersion, status, lastHeartbeat），serialNumber 标记 unique | [ ] |
| 2.3 | 点开 `materials` -> 查看字段列表 | 5 个字段（name, type, color, diameter, remainingWeight），type 为 enum 下拉 | [ ] |
| 2.4 | 点开 `print_jobs` -> 查看字段列表 | 10 个字段，含 deviceId、materialId 两个 belongsTo 关联 | [ ] |
| 2.5 | 在 `devices` 中创建 2 条记录 | 记录出现，serialNumber 唯一 | [ ] |
| 2.6 | 在 `materials` 中创建 3 条记录 | 记录出现，type 下拉选值 | [ ] |
| 2.7 | 在 `print_jobs` 中创建 2 条记录（关联设备和材料） | 创建成功，deviceId/materialId 下拉可选择已有数据 | [ ] |
| 2.8 | **闸门脚本**（命令行） | `r.match === true && r.diffs.length === 0` | [ ] |
| 2.9 | 安全审计：`npm audit --audit-level=critical` 零 CRITICAL | 输出 "0 critical vulnerabilities"
| 2.10 | DB 备份：`pg_dump audebase_dev > snap-pre-gate.sql` | 备份文件生成成功

**2.8 闸门脚本执行方式：**
```bash
# 导出当前 DB -> snap1.json
node scripts/gate-export.js
# 清空测试 DB -> 导入 snap1.json -> 再次导出 -> diff
node scripts/gate-roundtrip.js
# 预期输出: GATE PASSED: roundtrip verified (0 diffs)
```

**通过标准：** 10/10 [ ] 打勾。任一失败 -> 1 周攻关 -> 二次闸门 -> 降级（接受 NocoBase 紧耦合）。

---

### M3 — Week 3 验收（Day 15）：Admin UI 可操作

**前置条件：** Person B 完成 3 个 SchemaComponent 页面。Person A 完成 Agent HTTP 端点。

```bash
npx vitest run packages/plugin-3d-printer/   # 24 tests passed
```

**UI 验收操作（NocoBase Admin UI）：**

| # | 操作 | 预期结果 | 实际 |
|---|------|---------|:---:|
| 3.1 | 左侧菜单出现 "3D Printer" 分组，展开有 3 个子菜单 | Print Jobs / Devices / Materials | [ ] |
| 3.2 | 点击 "Devices" -> 列表页 | Table 显示，列：Name, Serial Number, Status, Firmware, Last Heartbeat | [ ] |
| 3.3 | 点击 "New" 按钮 -> 弹出创建表单 | 表单含 name, serialNumber, firmwareVersion 三个输入框 | [ ] |
| 3.4 | 填写 name="Printer-A", serialNumber="SN-001" -> Submit | Table 刷新，新行出现 | [ ] |
| 3.5 | 重复 3.3-3.4 创建 Printer-B (SN-002) | 两条记录均在列表 | [ ] |
| 3.6 | 点击 Printer-A 行的 "Edit" -> 改 name="Printer-A-Updated" -> Save | Table 中 name 更新 | [ ] |
| 3.7 | 点击 Printer-B 行的 "Delete" -> 确认 | Table 中该行消失 | [ ] |
| 3.8 | 点击 "Materials" -> 列表页 | Table 显示：Name, Type, Color, Diameter, Remaining Weight | [ ] |
| 3.9 | 创建 Material：name="PLA-Black", type=PLA, color="#000000", diameter=1.75, remainingWeight=1000 -> Submit | 记录出现，Type 列显示 "PLA" | [ ] |
| 3.10 | 创建 Material：name="ABS-Red", type=ABS, color="#FF0000", diameter=1.75, remainingWeight=500 -> Submit | 记录出现，Type 列显示 "ABS" | [ ] |
| 3.11 | 点击 "Print Jobs" -> 列表页 | Table 显示：Name, Status, Device, Material, Progress, Est. Time | [ ] |
| 3.12 | 点击 "New" -> 表单中 Device 下拉显示 Printer-A；Material 下拉显示 PLA-Black 和 ABS-Red | 下拉选项正确关联已有数据 | [ ] |
| 3.13 | 选择 Device=Printer-A, Material=PLA-Black, name="Test Job", modelFile="https://example.com/model.stl" -> Submit | 记录出现，status="queued" | [ ] |
| 3.14 | Status 列筛选：点开下拉 -> 选 "queued" | 仅显示 queued 状态的任务 | [ ] |
| 3.15 | Progress 进度条可见（0%） | 进度条渲染，数值显示 "0%" | [ ] |

**通过标准：** 15/15 [ ] 打勾。

---

### M4 — Week 4 验收（Day ~22）：端到端流程闸门

**前置条件：** Person A 完成 Agent 脚本。Person B 完成 M3 修复 + 集成测试对齐。E2E 冒烟套件就绪。

```bash
npx vitest run --coverage                  # 覆盖率 >=80%
npx playwright test tests/e2e/3d-printer-smoke.e2e.ts   # 9/9 passed
```

**UI 验收操作（双窗口并行）：**

| # | 操作 | 预期结果 | 实际 |
|---|------|---------|:---:|
| **Agent 端（终端窗口）** | | | |
| 4.1 | `cd agent && node agent.js` | 输出 "Agent: logged in, deviceId=xxx" | [ ] |
| 4.2 | 持续输出 "Agent: heartbeat OK, status=idle" (每 5 秒) | 心跳正常，无错误 | [ ] |
| **Admin UI 端（浏览器窗口）** | | | |
| 4.3 | 进入 Devices 列表 -> Printer-A 的 Status 显示 "online"（绿色 Badge），Last Heartbeat 最近 30 秒内 | 设备在线状态更新 | [ ] |
| 4.4 | 进入 Print Jobs -> 创建新任务：name="Agent Test"，选 Printer-A + PLA-Black，modelFile=任意URL -> Submit | status="queued" | [ ] |
| **Agent 端** | | | |
| 4.5 | 5 秒内 Agent 输出 "Received start command, jobId=xxx" | 命令接收成功 | [ ] |
| **Admin UI 端** | | | |
| 4.6 | 刷新 Print Jobs 列表 -> "Agent Test" 的 status 变为 "printing" | 状态变更同步 | [ ] |
| **Agent 端 (模拟进度)** | | | |
| 4.7 | Agent 输出 "Progress: 25%", "Progress: 50%", "Progress: 75%", "Progress: 100%" | 进度模拟正常 | [ ] |
| **Admin UI 端** | | | |
| 4.8 | 刷新 -> Progress 显示 100%，status 变为 "completed" | 进度条满，状态完成 | [ ] |
| **Agent 容错测试** | | | |
| 4.9 | `kill` Agent 进程，等 10 秒，重新 `node agent.js` | 输出 "Recovered state: jobId=xxx" | [ ] |
| 4.10 | Admin UI 中 Printer-A 恢复心跳 | Status 恢复 "online" | [ ] |
| **E2E 冒烟** | | | |
| 4.11 | `npx playwright test tests/e2e/3d-printer-smoke.e2e.ts` | 9/9 scenarios passed | [ ] |

**通过标准：** 11/11 [ ] 打勾。全部通过 = MVP 验收完成。任一失败 = 回到对应步骤修复 -> 重新验收。

---

### 验收汇总

| 里程碑 | 时间点 | 检查项 | 通过标准 | Go/No-Go |
|--------|:---:|:---:|------|:---:|
| M1 平台就绪 | Day 5 | 8 | 8/8 | -- |
| M2 CS 往返 | Day 10 | 10 | 10/10 | Go / No-Go->降级 |
| M3 UI 可操作 | Day 15 | 15 | 15/15 | -- |
| M4 端到端 | Day ~22 | 11 | 11/11 | Go / No-Go->延期1周修复 |

**Go/No-Go 决策点：**
- M2 失败 -> 降级：接受 NocoBase 紧耦合，放弃跨平台迁移（但仍继续 M3/M4）
- M4 失败 -> 延期 1 周修复 -> 二次 M4。仍失败 -> 仅交付 Admin CRUD（无 Agent 集成）
## 6. 已知风险与缓解

| 风险 | 严重度 | 缓解 |
|------|:---:|------|
| Canonical Schema 假性无损（T1） | CRITICAL | 关联字段只存 ID 数组，不内嵌完整记录 |
| FK 循环依赖导入失败（T2） | CRITICAL | Multi-pass：第一遍 NULL FK → 第二遍 UPDATE |
| 分页导出数据不一致（T3） | CRITICAL | 读已提交 + createdAt < exportStartTime 过滤 |
| Agent 零认证（T4） | CRITICAL | JWT 登录 → 携带 token |
| JSON 丢 bigint（ID > 2^53） | HIGH | NocoBase v2 默认 UUID，记录为已知限制 |
| JSON 丢 timestamptz 时区 | HIGH | 统一序列化为 ISO 8601 + UTC offset |
| Sequelize JSONB 双序列化 | HIGH | 导出时检测 `typeof === 'object'` → 不再 `JSON.stringify` |
| Float diff 假阳性（0.1+0.2≠0.3） | MEDIUM | diff 时使用 `Math.abs(a-b) < 1e-10` 容差比较 |
| 大对象 OOM（STL 文件在 Attachment 表） | MEDIUM | 跳过 attachment 表的 blob 字段，仅导出元数据 |
| SchemaComponent 无法覆盖实时进度条 | MEDIUM | Phase 1a 用 polling 刷新 ProTable（2 秒 interval），Phase 1b 评估 WebSocket 或 NocoBase 自定义 block |
| 多租户隔离模型差异（tenant_id vs Schema） | MEDIUM | Phase 1a 沿用 AUDEBase tenant_id 隔离（已实现）；NocoBase Schema-per-tenant 在 Phase 2 数据模型迁移时评估切换 |
| NocoBase CVE residual risk | HIGH | CI step: npm audit --audit-level=critical + version assertion script for 5 CVEs (CVE-2025-13877/2026-52888/2026-34156/2026-41641/2026-34825) |
| NocoBase version not pinned | HIGH | package.json locks exact: @nocobase/server@2.1.29 + @nocobase/client@2.1.29; Renovate auto minor/patch only |
| Team review: Person A single point of failure | HIGH | Person B Day 1-9 learns NocoBase + validates SchemaComponent pattern + writes 3 Collection skeletons; independent progress if A delays |
| Team review: no integration test budget | HIGH | Add 1d integration alignment checkpoint before 2-week gate (A+B verify Canonical Schema shape matches) |
| Team review: Agent zero error recovery | HIGH | Agent with try/catch + exponential backoff + startup state query (crash recovery); see section 3.5 |
| Team review: Canonical Schema missing constraints/stateMachine | MEDIUM | Add optional constraints (CHECK/UNIQUE) + stateMachine (enum field valid transitions); json fields marked opaque |
| Team review: SchemaComponent vs JSX pattern conflict | MEDIUM | 3 pages use NocoBase SchemaComponent (JSON schema driven); Person B validates pattern Day 1-3; see section 3.4 |
| Team review: export.ts assumes all collections have createdAt | MEDIUM | Read timestamp config dynamically from NocoBase Collection schema; warning + skip filtering for collections without timestamps |
| Team review: NocoBase system table list approximate | LOW | Whitelist + dynamic discovery: Warning unknown tables on export -> operator confirms -> add to whitelist |
| Team review: Offset large offset performance | LOW | Prefer keyset pagination (WHERE id > lastId LIMIT 1000); fallback to offset only without auto-increment id |
| Team review: Float diff NaN/Infinity | LOW | Add Number.isFinite guard before diff; NaN/Infinity marked as diff |
| PostgreSQL required (not SQLite) | HIGH | NocoBase dev defaults to SQLite but plan uses PG-only features. Startup check validates PG connection before any work |
| Agent credentials plaintext in config.json | MEDIUM | config.json chmod 0600; override via AUDE_DEVICE_ID/AUDE_DEVICE_PASSWORD env vars; Phase 1b device certificates |
| 无 DB 备份策略 | HIGH | M2 闸门前创建 pg_dump；roundtrip 测试使用独立 audebase_test DB；门脚本先 backup 后 import
| No test strategy or CI/CD | MEDIUM | Phase 1a: smoke test only (export-import roundtrip). Phase 1b: full 80% coverage + CI pipeline as gate condition |
| 3D printer RBAC not implemented | LOW | Phase 1a MVP: no RBAC (operator role has full access). Phase 1b: NocoBase ACL integration |
## 7. 决策记录

对应架构决策: `D25.6` (`.agents/memorys/decisions.md`) — 以下 P1-P12 为实施层面决策，D25.6 为架构授权。

| ID | 决策 | 理由 |
|----|------|------|
| P1 | Phase 1a 直接使用 NocoBase 插件模式 | 双 Oracle + 团队审查：Canonical Schema 是真正解耦点 |
| P2 | Phase 1b 基于真实使用反馈渐进抽象 | 避免推测性接口设计 |
| P3 | Admin = NocoBase Client | 与校准计划一致，零新增代码 |
| P4 | Agent 用 HTTP polling 替代 WebSocket | 团队审查：IoT 场景无需亚秒级延迟 |
| P5 | 2 周闸门：Canonical Schema 往返验证 | 先证明数据可迁移再投入业务开发 |
| P6 | ~4 周闸门：3D 打印机 MVP 验收 | 团队审查校准后时间线（双人并行 ~4 周） |
| P7 | FK multi-pass 导入策略 | 修复 T2：循环依赖无法拓扑排序 |
| P8 | 关联数据导出仅存 FK，不内嵌 | 修复 T1：hasMany 数据倒灌 |
| P9 | 砍 StatsPage / costPerKg | 极简主义者：省 0.8 天，闸门不受影响。Zod 撤回 — D8 要求所有边界 Zod
| P9a | canonical-schema 保留 Zod（撤销团队审查削减）| D8 要求所有系统边界 Zod 验证，canonical-schema 补充 Zod schemas（+0.5d）
| P10 | diff() 返回结构化 DiffReport | 团队审查：boolean 不可诊断，闸门可验证性要求 |
| P11 | 强制 PostgreSQL（非 SQLite） | 团队审查：SET CONSTRAINTS / REPEATABLE READ 为 PG 专属 |
| P12 | No-Go 回退：1 周攻关 → 二次闸门 → 降级 | 团队审查：无回退路径为计划盲点 |

| P13 | Phase 1a→1b 过渡闸门：抽象层强制 | 3D 打印机为探索期例外（可直 import NocoBase）。Phase 1b+ OA/ERP/MES 必须通过 IPlatform。过渡期提取 IPlatformClient，验证闸门通过后方可进入正式业务开发。|
## 8. Phase 1b+ 后续包路线图

D25.3 标记保留并转化为 NocoBase 插件的 11 个包中，Phase 1a 覆盖 3 个（record-rules / canonical-schema / migration-engine）。剩余 8 个按依赖关系分批：

| 批 | 目标 Phase | 包 | 前置条件 |
|----|-----------|----|---------|
| 第 1 批 | Phase 1b | data-extends、audit、file-upload | NocoBase Collection 扩展机制验证通过 |
| 第 2 批 | Phase 2 | notification、cron、plugin-communication | Skip unless NocoBase native proves insufficient in production: no pre-evaluation, no spec. Migrate only when production reveals gaps |
| 第 3 批 | Phase 3 | schema-engine（映射器）、workflow-* | ACL + Collection 体系迁移完成后，评估 D7 ProTable/ProForm 映射器价值；Saga 与 NocoBase 工作流对比后决定 |

D25.3 标记替换为 NocoBase 原生的 11 个包（core、plugin-framework、manifest-engine、auth、i18n 等）：Phase 1a 不做处理。NocoBase 原生功能上线后逐步 Sunset，保留 AUDEBase 版本作为兼容回退层。

## 9. D25 NocoBase 缺口对照

| # | 缺口 | 处置策略 | 目标阶段 |
|---|------|---------|---------|
| #1 | ACL 缺乏 Record Rules | @audebase/plugin-record-rules 已实现（575 行） | Phase 0 Spike |
| #2 | 四层信任分组模型 | 搁置（需 fork NocoBase PluginManager 核心） | — |
| #3 | 插件安全边界弱 | Phase 2 评估 NocoBase 原生安全边界 | Phase 2 |
| #4 | 无原生 Saga 跨插件事务 | 保留 AUDEBase Saga 引擎，Phase 3 评估与 NocoBase 工作流对比 | Phase 3 |
| #5 | Formily 社区不稳定 | D7 自研 ProTable/ProForm 映射器路径，Phase 3 评估 | Phase 3 |
| #6 | 增强 manifest.yaml | NocoBase package.json 为基础，manifest.yaml 作为增强层，Phase 2 评估 | Phase 2 |
| #7 | Core API 代理 | NocoBase 内置 Collection ACL 覆盖，Phase 1b 评估是否需要 AUDEBase 代理层 | Phase 1b |
| #8 | 技术栈差异 (Fastify/Drizzle/pino vs Koa/Sequelize) | Phase 1b 评估是否保留 Drizzle 适配层 | Phase 1b |

## 10. 测试策略

### 10.1 SDD 文档

遵循 AI-Driven SDD/TDD 工作流 (G5)：每个包编码前完成 SDD 文档。

| 包 | SDD 文档 | 生成时机 | 前置条件 |
|----|----------|---------|---------|
| `@audebase/canonical-schema` | `docs/modules/canonical-schema-sdd.md` | Step 1 开始前 | 无（零依赖） |
| `@audebase/migration-engine` | `docs/modules/migration-engine-sdd.md` | Step 1 开始前 | canonical-schema 类型就绪 |
| `@audebase/plugin-record-rules` | 已有（Phase 0 Spike） | — | ✅ 已完成 |
| `@audebase/plugin-3d-printer` | `docs/modules/plugin-3d-printer-sdd.md` | Step 1 开始前 | NocoBase 环境就绪 |
| 3D 打印机 Agent | 合并入 `plugin-3d-printer-sdd.md` §Agent 接口 | 同上 | plugin-3d-printer SDD 完成 |

SDD 结构（8 节）：概要 → 接口定义 → 生命周期 → 依赖 → 错误码 → 安全 → Mock 约束 → 变更记录。

### 10.2 TDD 测试计划

| 包 | TDD 文档 | 预估测试数 | 覆盖目标 |
|----|---------|:---:|:---:|
| canonical-schema | `docs/modules/canonical-schema-tdd.md` | 5 (3 type assertions + 2 Zod validation) | 类型 + 边界验证（编译期 + 运行时）|
| migration-engine | `docs/modules/migration-engine-tdd.md` | 32 (export 8 + diff 6 + import 8 + noco-base 4 + topo 6) + 3 roundtrip | ≥80% |
| plugin-3d-printer | `docs/modules/plugin-3d-printer-tdd.md` | 18 (agent-handler 6 + 3 页面各约 4) | ≥80% |
| Agent | 合并入 `plugin-3d-printer-tdd.md` §Agent | 验证心跳/命令/进度/认证 | ≥80% |

**TDD 文档必备内容：**
- AAA 结构（Arrange-Act-Assert）每个测试用例
- 种子工厂：集成测试使用 `docs/modules/test-seed-strategy.md` 定义的 seed factory + transaction rollback
- Mock 约束：NocoBase `Database` mock 必须满足 async Promise + JSON 序列化 + 30s 超时
- 测试文件命名：`{module}.test.ts`（单元）/ `{module}.integration.test.ts`（集成）
- 覆盖率闸门：CI 集成 80% 最低覆盖率（见 `docs/modules/dev-workflow.md`）

### 10.3 E2E 冒烟测试

利用已有 Playwright 基础设施（`playwright.config.ts` + `tests/e2e/auth.setup.ts` + `tests/e2e/fixtures.ts`）。

**冒烟场景（新增 `tests/e2e/3d-printer-smoke.e2e.ts`，M3 Week 3 编码时创建）：**

| # | 场景 | 操作 | 断言 |
|---|------|------|------|
| E1 | 导航到打印任务 | 登录 → 点击菜单 "3D Printer" → 点击 "Print Jobs" | Table 渲染，列包含 name/status/device/progress |
| E2 | 创建设备 | 导航 Devices → 点击 "New" → 填写 name + serialNumber → Submit | Table 出现新行，serialNumber 匹配 |
| E3 | 创建打印任务 | 导航 Print Jobs → 点击 "New" → 选择设备 + 材料 + 填写 name → Submit | Table 出现新行，status="queued" |
| E4 | 材料 CRUD | 导航 Materials → Create → Edit → Delete | 列表正确更新 |
| E5 | 设备状态变更 | 设备 status: "online" → 手动更新 → "error" | Badge 颜色变化 |
| E6 | Canonical Schema 往返 | 通过 API 触发 export -> import -> 验证数据完整性 | API 返回 200，页面数据一致 |
| E7 | serialNumber 唯一性 | 创建 device (SN-001) -> 再创建同 SN device | 第二个创建失败，显示唯一性错误提示 |
| E8 | material color 渲染 | 创建 material (color=red) -> 查看列表 | Color 列显示色块 |
| E9 | 编辑保存后验证 | 编辑 device name -> Save -> 刷新页面 | name 持久化，未回退 |
**E2E 运行方式：**
```bash
# 需要 NocoBase 运行在 localhost:13000
npx playwright test tests/e2e/3d-printer-smoke.e2e.ts --project=chromium
```

### 10.4 覆盖率闸门

| 闸门 | 触发时机 | 条件 |
|------|---------|------|
| 单元测试闸门 | 每个 Step 完成时 | `npx vitest run` 全部通过 + 新增代码覆盖率 ≥80% |
| 集成测试闸门 | migration-engine Step 7 + plugin-3d-printer Step 6 | roundtrip 测试通过 + UI CRUD 集成测试通过 |
| E2E 冒烟闸门 | Go/No-Go 检查点前 | 9 个 E2E 场景全部通过 |
| 总体覆盖率闸门 | Phase 1a 完成前 | `npx vitest run --coverage` ≥80%（含新增 + 已有代码）|

**CI 集成（Phase 1b）：**
- GitHub Actions workflow: `vitest --coverage` + `playwright test`
- 覆盖率报告上传到 Codecov
- 低于 80% → PR 阻断

### 10.5 测试数据管理

**NocoBase 测试 DB：**
```bash
# 独立测试数据库，不与开发 DB 共用
createdb audebase_test
export DATABASE_URL="postgresql://localhost:5432/audebase_test"
```

**种子策略：**
- 集成测试前：`beforeAll` 中运行 NocoBase `db.sync()` 创建表
- 每个测试：`beforeEach` 中 seed 最小数据集
- 每个测试后：`afterEach` 中 transaction rollback（PG SAVEPOINT）
- 不依赖 Admin UI seed 数据（测试自成一体）