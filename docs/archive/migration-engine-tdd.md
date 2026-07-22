# Migration Engine TDD 测试策略 — Phase 1a

> **创建日期**: 2026-07-13  
> **目的**: 为 Phase 1a #5 模块（迁移管理）提供完整的 TDD 测试策略与用例设计。  
> **前置阅读**: D1.7, migration-engine-sdd.md, database-schema.md, test-seed-strategy.md  
> **责任人**: Person A (建议从 Person B 移交)  
> **覆盖率目标**: 80% lines（核心路径 engine.ts 强制 80%）

---

## 1. 测试金字塔

```
         ┌──────────────────────┐
         │  E2E (5%)             │  CLI: aude db:migrate 完整执行 + CI dry-run
         │  packages/cli/        │
         │  __tests__/           │
         ├──────────────────────┤
         │  集成测试 (40%)        │  真实 PG + 真实 SQL 文件 + 事务回滚
         │  packages/migration/  │  完整三阶段执行 + 失败 Graceful Skip
         │  __tests__/integration│  + migration_history 表状态追踪
         ├──────────────────────┤
         │  单元测试 (55%)        │  Vitest: Scanner.discoverMigrations,
         │  packages/migration/  │  Resolver.resolve, 危险操作拦截,
         │  __tests__/unit/      │  版本排序, SQL 语法解析
         └──────────────────────┘
```

## 2. 测试边界

| 测试层级 | 范围 | Mock 策略 | 文件位置 |
|---------|------|----------|---------|
| 单元测试 | Scanner, Resolver, 版本排序, 危险操作检测 | mock 文件系统 + mock DB (migration_history) | `packages/migration/src/__tests__/unit/` |
| 集成测试 | 完整 3 阶段执行（preload/postsync/postload） | 真实 PG（事务回滚）+ 真实 SQL 文件（临时目录） | `packages/migration/src/__tests__/integration/` |
| Dry-run | CI 预检 — 读取 SQL 但不执行 | 真实文件系统，不连 PG | `packages/migration/src/__tests__/unit/dry-run.test.ts` |
| CLI 测试 | `aude db:migrate` 命令端到端 | 真实 PG + Docker | `packages/cli/src/__tests__/migrate.test.ts` |

---

## 3. 单元测试设计

### 3.1 MigrationScanner — 文件发现

**测试文件**: `packages/migration/src/__tests__/unit/scanner.test.ts`

```typescript
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { MigrationScanner } from '../../scanner'
import * as fs from 'node:fs/promises'

// mock 文件系统
vi.mock('node:fs/promises')

describe('MigrationScanner', () => {
  let scanner: MigrationScanner

  beforeEach(() => {
    scanner = new MigrationScanner(['/test/packages'])
    vi.clearAllMocks()
  })

  test('空目录应返回空 Map', async () => {
    // Arrange
    vi.mocked(fs.readdir).mockResolvedValue([] as any)

    // Act
    const result = await scanner.discoverMigrations()

    // Assert
    expect(result.size).toBe(0)
  })

  test('应发现单个插件的迁移版本', async () => {
    // Arrange — 模拟文件系统结构:
    // packages/plugin-core/migrations/1.0.0/preload.sql
    // packages/plugin-core/migrations/1.0.0/postsync.sql
    vi.mocked(fs.readdir)
      .mockResolvedValueOnce(['plugin-core'] as any)   // packages/
      .mockResolvedValueOnce(['migrations'] as any)     // plugin-core/
      .mockResolvedValueOnce(['1.0.0'] as any)          // migrations/
      .mockResolvedValueOnce(['preload.sql', 'postsync.sql'] as any)  // 1.0.0/

    vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any)

    // Act
    const result = await scanner.discoverMigrations()

    // Assert
    expect(result.has('@audebase/plugin-core')).toBe(true)
    const versions = result.get('@audebase/plugin-core')!
    expect(versions).toHaveLength(1)
    expect(versions[0].version).toBe('1.0.0')
    expect(versions[0].files.preload).toBeDefined()
    expect(versions[0].files.postsync).toBeDefined()
    expect(versions[0].files.postload).toBeUndefined()
  })

  test('应发现多插件多版本迁移', async () => {
    // Arrange — plugin-core: 1.0.0, 1.1.0; plugin-rbac: 1.0.0
    vi.mocked(fs.readdir)
      .mockResolvedValueOnce(['plugin-core', 'plugin-rbac'] as any)
      // plugin-core
      .mockResolvedValueOnce(['migrations'] as any)
      .mockResolvedValueOnce(['1.0.0', '1.1.0'] as any)
      .mockResolvedValueOnce(['preload.sql'] as any)
      .mockResolvedValueOnce(['preload.sql', 'postsync.sql'] as any)
      // plugin-rbac
      .mockResolvedValueOnce(['migrations'] as any)
      .mockResolvedValueOnce(['1.0.0'] as any)
      .mockResolvedValueOnce(['preload.sql', 'postsync.sql', 'postload.sql'] as any)

    vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any)

    // Act
    const result = await scanner.discoverMigrations()

    // Assert
    expect(result.size).toBe(2)
    expect(result.get('@audebase/plugin-core')).toHaveLength(2)
    expect(result.get('@audebase/plugin-rbac')).toHaveLength(1)
  })

  test('应忽略非 SemVer 版本目录', async () => {
    // Arrange — 存在 'latest' 和 'v1' 等无效版本目录
    vi.mocked(fs.readdir)
      .mockResolvedValueOnce(['plugin-core'] as any)
      .mockResolvedValueOnce(['migrations'] as any)
      .mockResolvedValueOnce(['1.0.0', 'latest', 'v1.0', 'bad-version'] as any)
      .mockResolvedValueOnce(['preload.sql'] as any)
      // 后续 readdir 调用不应发生（因为只有 '1.0.0' 是有效的）

    vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any)

    // Act
    const result = await scanner.discoverMigrations()

    // Assert
    const versions = result.get('@audebase/plugin-core')!
    expect(versions).toHaveLength(1)
    expect(versions[0].version).toBe('1.0.0')
  })

  test('版本目录应升序排序', async () => {
    // Arrange — 版本 2.0.0, 1.0.0, 1.5.0, 1.0.1
    vi.mocked(fs.readdir)
      .mockResolvedValueOnce(['plugin-core'] as any)
      .mockResolvedValueOnce(['migrations'] as any)
      .mockResolvedValueOnce(['2.0.0', '1.0.0', '1.5.0', '1.0.1'] as any)
      // 每个版本目录读取（只关心排序，不关心文件内容）
      .mockResolvedValue(['preload.sql'] as any)

    vi.mocked(fs.stat).mockResolvedValue({ isDirectory: () => true } as any)

    // Act
    const result = await scanner.discoverMigrations()

    // Assert
    const versions = result.get('@audebase/plugin-core')!
    const versionNumbers = versions.map(v => v.version)
    expect(versionNumbers).toEqual(['1.0.0', '1.0.1', '1.5.0', '2.0.0'])
  })
})
```

### 3.2 MigrationResolver — 待执行迁移解析

**测试文件**: `packages/migration/src/__tests__/unit/resolver.test.ts`

```typescript
import { describe, test, expect } from 'vitest'
import { MigrationResolver } from '../../resolver'
import type { MigrationVersion } from '../../scanner'

// 模拟 migration_history 查询结果
function createMockHistory(records: Array<{ plugin: string; version: string }>) {
  return {
    findMany: async () => records.map(r => ({ moduleId: r.plugin, version: r.version })),
  }
}

describe('MigrationResolver', () => {
  test('无迁移历史时应返回全部版本', async () => {
    // Arrange
    const migrations = new Map<string, MigrationVersion[]>([
      ['plugin-core', [
        { version: '1.0.0', path: '/tmp/1.0.0', files: { preload: 'preload.sql' } },
        { version: '1.1.0', path: '/tmp/1.1.0', files: { preload: 'preload.sql' } },
      ]],
    ])
    const history = createMockHistory([])
    const resolver = new MigrationResolver(history as any)

    // Act
    const tasks = await resolver.resolve(migrations)

    // Assert
    expect(tasks).toHaveLength(2)
    expect(tasks[0].version).toBe('1.0.0')
    expect(tasks[1].version).toBe('1.1.0')
  })

  test('已执行版本应跳过', async () => {
    // Arrange
    const migrations = new Map<string, MigrationVersion[]>([
      ['plugin-core', [
        { version: '1.0.0', path: '/tmp/1.0.0', files: { preload: 'preload.sql' } },
        { version: '1.1.0', path: '/tmp/1.1.0', files: { preload: 'preload.sql' } },
        { version: '1.2.0', path: '/tmp/1.2.0', files: { preload: 'preload.sql' } },
      ]],
    ])
    // 1.0.0 已执行
    const history = createMockHistory([
      { plugin: 'plugin-core', version: '1.0.0' },
    ])
    const resolver = new MigrationResolver(history as any)

    // Act
    const tasks = await resolver.resolve(migrations)

    // Assert
    expect(tasks).toHaveLength(2)
    expect(tasks[0].version).toBe('1.1.0')
    expect(tasks[1].version).toBe('1.2.0')
  })

  test('version_gated: 仅执行 version > 已记录版本', async () => {
    // Arrange — manifest 中 version 为 1.2.0，已执行到 1.1.0
    // 仅 1.2.0 待执行
    const migrations = new Map<string, MigrationVersion[]>([
      ['plugin-core', [
        { version: '1.0.0', path: '/tmp/1.0.0', files: { preload: 'preload.sql' } },
        { version: '1.1.0', path: '/tmp/1.1.0', files: { preload: 'preload.sql' } },
        { version: '1.2.0', path: '/tmp/1.2.0', files: { preload: 'preload.sql' } },
      ]],
    ])
    const history = createMockHistory([
      { plugin: 'plugin-core', version: '1.0.0' },
      { plugin: 'plugin-core', version: '1.1.0' },
    ])
    const resolver = new MigrationResolver(history as any)

    // Act
    const tasks = await resolver.resolve(migrations)

    // Assert
    expect(tasks).toHaveLength(1)
    expect(tasks[0].version).toBe('1.2.0')
  })

  test('多插件应按插件名排序', async () => {
    // Arrange — plugin-core 的迁移应先于 plugin-rbac
    const migrations = new Map<string, MigrationVersion[]>([
      ['plugin-rbac', [
        { version: '1.0.0', path: '/tmp/rbac-1.0.0', files: { preload: 'preload.sql' } },
      ]],
      ['plugin-core', [
        { version: '1.1.0', path: '/tmp/core-1.1.0', files: { preload: 'preload.sql' } },
      ]],
    ])
    const history = createMockHistory([])
    const resolver = new MigrationResolver(history as any)

    // Act
    const tasks = await resolver.resolve(migrations)

    // Assert — plugin-core 在前
    expect(tasks[0].pluginName).toBe('plugin-core')
    expect(tasks[1].pluginName).toBe('plugin-rbac')
  })
})
```

### 3.3 危险操作检测

**测试文件**: `packages/migration/src/__tests__/unit/dangerous-operations.test.ts`

```typescript
import { describe, test, expect } from 'vitest'
import { containsDangerousOperation } from '../../executor'

describe('containsDangerousOperation', () => {
  test('应检测 DROP TABLE', () => {
    // Arrange
    const sql = 'DROP TABLE users;'

    // Act
    const result = containsDangerousOperation(sql)

    // Assert
    expect(result).toBe(true)
  })

  test('应检测 TRUNCATE TABLE', () => {
    // Arrange
    const sql = 'TRUNCATE TABLE audit_log;'

    // Act
    const result = containsDangerousOperation(sql)

    // Assert
    expect(result).toBe(true)
  })

  test('应检测 DROP DATABASE', () => {
    // Arrange
    const sql = 'DROP DATABASE audebase;'

    // Act
    const result = containsDangerousOperation(sql)

    // Assert
    expect(result).toBe(true)
  })

  test('应检测 DROP SCHEMA', () => {
    // Arrange
    const sql = 'DROP SCHEMA public CASCADE;'

    // Act
    const result = containsDangerousOperation(sql)

    // Assert
    expect(result).toBe(true)
  })

  test('正常 DDL 应通过: CREATE TABLE, ALTER TABLE, CREATE INDEX', () => {
    // Arrange
    const safeStatements = [
      'CREATE TABLE test (id UUID PRIMARY KEY);',
      'ALTER TABLE users ADD COLUMN phone VARCHAR(20);',
      'CREATE INDEX idx_users_email ON users(email);',
      'INSERT INTO users (name) VALUES (\'test\');',
      'UPDATE users SET active = true WHERE id = 1;',
    ]

    for (const sql of safeStatements) {
      // Act
      const result = containsDangerousOperation(sql)

      // Assert
      expect(result).toBe(false)
    }
  })

  test('大小写不敏感检测', () => {
    // Arrange
    const sql = 'drop table users;'

    // Act
    const result = containsDangerousOperation(sql)

    // Assert
    expect(result).toBe(true)
  })

  test('多语句中检测危险操作', () => {
    // Arrange
    const sql = `
      CREATE TABLE test (id UUID);
      INSERT INTO test VALUES (1);
      DROP TABLE old_table;
    `

    // Act
    const result = containsDangerousOperation(sql)

    // Assert
    expect(result).toBe(true)
  })
})
```

### 3.4 DryRun 模式

**测试文件**: `packages/migration/src/__tests__/unit/dry-run.test.ts`

```typescript
import { describe, test, expect } from 'vitest'
import { MigrationExecutor } from '../../executor'
import type { MigrationTask } from '../../resolver'

describe('MigrationExecutor.dryRun', () => {
  test('应报告正常迁移任务', async () => {
    // Arrange
    const executor = new MigrationExecutor({} as any, { mode: 'dry-run' })
    const task: MigrationTask = {
      pluginName: 'plugin-core',
      version: '1.1.0',
      phases: [
        { phase: 'preload', sqlFile: '/tmp/preload.sql', sqlContent: 'CREATE TABLE test (id UUID PRIMARY KEY);' },
      ],
    }

    // Act
    const report = await executor.dryRun(task)

    // Assert
    expect(report.tasks).toHaveLength(1)
    expect(report.blocked).toHaveLength(0)
  })

  test('应拦截危险操作', async () => {
    // Arrange
    const executor = new MigrationExecutor({} as any, { mode: 'dry-run' })
    const task: MigrationTask = {
      pluginName: 'plugin-core',
      version: '1.1.0',
      phases: [
        { phase: 'preload', sqlFile: '/tmp/preload.sql', sqlContent: 'DROP TABLE users;' },
      ],
    }

    // Act
    const report = await executor.dryRun(task)

    // Assert
    expect(report.blocked).toHaveLength(1)
    expect(report.blocked[0].reason).toBe('危险操作')
    expect(report.tasks).toHaveLength(0)
  })

  test('DryRun 不应执行 SQL（无 DB 操作）', async () => {
    // Arrange
    const mockDb = {
      execute: vi.fn(),
    }
    const executor = new MigrationExecutor(mockDb as any, { mode: 'dry-run' })
    const task: MigrationTask = {
      pluginName: 'plugin-core',
      version: '1.1.0',
      phases: [
        { phase: 'preload', sqlFile: '/tmp/preload.sql', sqlContent: 'CREATE TABLE test (id UUID);' },
      ],
    }

    // Act
    await executor.dryRun(task)

    // Assert — dryRun 不应调用 db.execute
    expect(mockDb.execute).not.toHaveBeenCalled()
  })

  test('应返回非 0 退出码当有 blocked 操作', async () => {
    // Arrange
    const executor = new MigrationExecutor({} as any, { mode: 'dry-run' })
    const task: MigrationTask = {
      pluginName: 'plugin-core',
      version: '1.1.0',
      phases: [
        { phase: 'preload', sqlFile: '/tmp/preload.sql', sqlContent: 'TRUNCATE users;' },
      ],
    }

    // Act
    const report = await executor.dryRun(task)

    // Assert
    expect(report.hasBlocked).toBe(true)
  })
})
```

---

## 4. 集成测试设计

### 4.1 完整三阶段执行

**测试文件**: `packages/migration/src/__tests__/integration/migration-execution.integration.test.ts`

**环境要求**: 真实 PostgreSQL（事务回滚）

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { createTestApp, type TestApp } from '../helpers/create-test-app'
import { seedMigrationFiles } from '../seeds/migrations'
import { sql } from 'drizzle-orm'

describe('MigrationEngine 集成测试 — 三阶段执行', () => {
  let test: TestApp

  beforeEach(async () => {
    test = await createTestApp()
  })

  afterEach(async () => {
    await test.cleanup() // 事务回滚
  })

  test('完整 preload → postsync → postload 执行', async () => {
    // Arrange — 创建临时迁移文件
    const migrations = {
      preload: 'CREATE TABLE IF NOT EXISTS test_migration (id UUID PRIMARY KEY, name VARCHAR(100));',
      postsync: "INSERT INTO test_migration (id, name) VALUES ('00000000-0000-0000-0000-000000000001', 'seed-data');",
      postload: 'CREATE INDEX IF NOT EXISTS idx_test_migration_name ON test_migration(name);',
    }

    const tmpDir = await seedMigrationFiles(test, 'plugin-core', '1.0.0', migrations)

    // Act
    const engine = test.app.migrationEngine
    const result = await engine.migrate({ mode: 'normal' })

    // Assert
    expect(result.completed).toBeGreaterThanOrEqual(1)

    // 验证表已创建
    const tableExists = await test.db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'test_migration'
      )
    `)
    expect(tableExists).toBeTruthy()

    // 验证数据已插入
    const row = await test.db.execute(sql`
      SELECT name FROM test_migration WHERE id = '00000000-0000-0000-0000-000000000001'
    `)
    expect(row).toBe('seed-data')
  })

  test('preload 成功但 postsync 失败时，preload 的 DDL 应保留（事务内 DDL）', async () => {
    // Arrange
    const migrations = {
      preload: 'CREATE TABLE IF NOT EXISTS test_partial (id UUID PRIMARY KEY);',
      postsync: 'INSERT INTO nonexistent_table VALUES (1);', // 失败
    }
    await seedMigrationFiles(test, 'plugin-core', '1.0.0', migrations)

    // Act
    const engine = test.app.migrationEngine
    await engine.migrate({ mode: 'normal' })

    // Assert — PostgreSQL 事务性 DDL: preload 和 postsync 在同一事务中
    // 因此 postsync 失败 → 整个事务回滚 → preload 的 DDL 也回滚
    const tableExists = await test.db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'test_partial'
      )
    `)
    expect(tableExists).toBeFalsy()

    // 验证 migration_history 记录为 failed
    const history = await test.db.query.migrationHistory.findFirst({
      where: (fields, { eq, and }) =>
        and(
          eq(fields.phase, 'postsync'),
          eq(fields.status, 'failed'),
        ),
    })
    expect(history).toBeDefined()
    expect(history!.errorMessage).toBeDefined()
  })

  test('迁移失败不阻塞其他插件', async () => {
    // Arrange — plugin-core 迁移成功，plugin-rbac 迁移失败
    const coreMigrations = {
      preload: 'CREATE TABLE IF NOT EXISTS test_core (id UUID PRIMARY KEY);',
    }
    const rbacMigrations = {
      preload: 'INVALID SQL SYNTAX !!!!', // 语法错误
    }

    await seedMigrationFiles(test, 'plugin-core', '1.0.0', coreMigrations)
    await seedMigrationFiles(test, 'plugin-rbac', '1.0.0', rbacMigrations)

    // Act
    const engine = test.app.migrationEngine
    const result = await engine.migrate({ mode: 'normal' })

    // Assert — plugin-core 的迁移应成功
    const coreHistory = await test.db.query.migrationHistory.findFirst({
      where: (fields, { eq, and }) =>
        and(eq(fields.moduleId, 'plugin-core'), eq(fields.status, 'success')),
    })
    expect(coreHistory).toBeDefined()

    // plugin-rbac 的迁移应失败
    const rbacHistory = await test.db.query.migrationHistory.findFirst({
      where: (fields, { eq, and }) =>
        and(eq(fields.moduleId, 'plugin-rbac'), eq(fields.status, 'failed')),
    })
    expect(rbacHistory).toBeDefined()
    expect(result.failed).toBeGreaterThanOrEqual(1)
    expect(result.completed).toBeGreaterThanOrEqual(1)
  })

  test('migration_history 状态转换: pending → running → success', async () => {
    // Arrange
    const migrations = {
      preload: 'CREATE TABLE IF NOT EXISTS test_status (id UUID PRIMARY KEY);',
    }
    await seedMigrationFiles(test, 'plugin-core', '1.0.0', migrations)

    // Act
    const engine = test.app.migrationEngine
    await engine.migrate({ mode: 'normal' })

    // Assert — 历史记录中存在 success 状态
    const histories = await test.db.query.migrationHistory.findMany({
      where: (fields, { eq }) => eq(fields.moduleId, 'plugin-core'),
    })
    expect(histories.length).toBeGreaterThanOrEqual(1)
    // 至少有一条 success 记录
    expect(histories.some(h => h.status === 'success')).toBe(true)
  })

  test('已执行版本不应重复执行', async () => {
    // Arrange — 先执行一次迁移
    const migrations = {
      preload: 'CREATE TABLE IF NOT EXISTS test_idempotent (id UUID PRIMARY KEY);',
    }
    await seedMigrationFiles(test, 'plugin-core', '1.0.0', migrations)

    const engine = test.app.migrationEngine
    await engine.migrate({ mode: 'normal' })

    // 清空 history 计数
    const countBefore = await test.db.query.migrationHistory.findMany({
      where: (fields, { eq }) => eq(fields.moduleId, 'plugin-core'),
    })

    // Act — 再次执行迁移
    await engine.migrate({ mode: 'normal' })

    // Assert — 不应新增 history 记录
    const countAfter = await test.db.query.migrationHistory.findMany({
      where: (fields, { eq }) => eq(fields.moduleId, 'plugin-core'),
    })
    expect(countAfter.length).toBe(countBefore.length)
  })
})
```

### 4.2 三阶段执行顺序

```typescript
describe('MigrationEngine — 三阶段顺序', () => {
  let test: TestApp

  beforeEach(async () => {
    test = await createTestApp()
  })

  afterEach(async () => {
    await test.cleanup()
  })

  test('应按照 preload(全部插件) → postsync(全部插件) → postload(全部插件) 顺序执行', async () => {
    // Arrange — 2 个插件各 1 个版本，每版本含 3 阶段
    const phases = {
      preload: 'CREATE TABLE IF NOT EXISTS test_{plugin} (id UUID PRIMARY KEY);',
      postsync: "INSERT INTO test_{plugin} VALUES ('00000000-0000-0000-0000-000000000001');",
      postload: 'CREATE INDEX IF NOT EXISTS idx_test_{plugin}_id ON test_{plugin}(id);',
    }

    await seedMigrationFiles(test, 'plugin-core', '1.0.0', phases)
    await seedMigrationFiles(test, 'plugin-rbac', '1.0.0', phases)

    // Act
    const engine = test.app.migrationEngine
    const result = await engine.migrate({ mode: 'normal' })

    // Assert — 顺序验证: 所有 preload 先于 postsync, 所有 postsync 先于 postload
    const executionOrder = result.executionLog!

    const preloadPhases = executionOrder.filter(e => e.phase === 'preload')
    const postsyncPhases = executionOrder.filter(e => e.phase === 'postsync')
    const postloadPhases = executionOrder.filter(e => e.phase === 'postload')

    // 验证 preload 的序号全部 < postsync 的序号
    const maxPreloadIndex = Math.max(...preloadPhases.map(e => e.order))
    const minPostsyncIndex = Math.min(...postsyncPhases.map(e => e.order))
    expect(maxPreloadIndex).toBeLessThan(minPostsyncIndex)

    // 验证 postsync 的序号全部 < postload 的序号
    const maxPostsyncIndex = Math.max(...postsyncPhases.map(e => e.order))
    const minPostloadIndex = Math.min(...postloadPhases.map(e => e.order))
    expect(maxPostsyncIndex).toBeLessThan(minPostloadIndex)
  })
})
```

---

## 5. 测试种子数据

**种子工厂文件**: `packages/migration/src/__tests__/seeds/migrations.ts`

```typescript
import type { TestApp } from '../helpers/create-test-app'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import * as os from 'node:os'

interface MigrationFileSet {
  preload?: string
  postsync?: string
  postload?: string
}

export async function seedMigrationFiles(
  test: TestApp,
  pluginName: string,
  version: string,
  files: MigrationFileSet,
): Promise<string> {
  // 在临时目录创建迁移文件结构
  const tmpDir = path.join(
    os.tmpdir(),
    `aude-migration-test-${Date.now()}`,
    pluginName,
    'migrations',
    version,
  )
  await fs.mkdir(tmpDir, { recursive: true })

  // 替换模板变量
  const replacePlugin = (sql: string) => sql.replace(/\{plugin\}/g, pluginName)

  if (files.preload) {
    await fs.writeFile(path.join(tmpDir, 'preload.sql'), replacePlugin(files.preload))
  }
  if (files.postsync) {
    await fs.writeFile(path.join(tmpDir, 'postsync.sql'), replacePlugin(files.postsync))
  }
  if (files.postload) {
    await fs.writeFile(path.join(tmpDir, 'postload.sql'), replacePlugin(files.postload))
  }

  // 将迁移路径注册到 TestApp
  test.addMigrationScanPath(path.dirname(path.dirname(tmpDir)))
  return tmpDir
}

/**
 * 创建一个已执行迁移的 history 记录（用于测试 resolver）
 */
export async function seedMigrationHistory(
  test: TestApp,
  moduleId: string,
  version: string,
  phase: 'preload' | 'postsync' | 'postload',
  status: 'success' | 'failed' = 'success',
): Promise<void> {
  await test.db.insert(test.schema.migrationHistory).values({
    moduleId,
    version,
    phase,
    filename: `/fake/${version}/${phase}.sql`,
    status,
    executionTimeMs: 42,
    executedAt: new Date(),
  })
}
```

---

## 6. Mock 策略汇总

| 依赖 | 单元测试策略 | 集成测试策略 |
|------|------------|------------|
| PostgreSQL | 不连接 — mock Drizzle | 真实 PG + 事务回滚 |
| 文件系统 (migrations/) | vitest mock (`vi.mock('fs')`) | 真实临时目录 (`os.tmpdir()`) |
| migration_history 表 | mock query 返回（Resolver 测试） | 真实 PG 表（Executor 测试） |
| SQL 执行 | vitest mock (`vi.fn()`) | 真实 `db.execute(sql)` |

---

## 7. 核心路径覆盖率矩阵

| 文件 | 最低覆盖率 | 关键语句 |
|------|:---:|------|
| `engine.ts` | **80%** | migrate(normal), migrate(dry-run), execute 三阶段 |
| `scanner.ts` | **80%** | discoverMigrations, SemVer 解析与排序 |
| `resolver.ts` | **80%** | resolve, version_gated 逻辑 |
| `executor.ts` | **80%** | execute, dryRun, containsDangerousOperation |
| `history.ts` | **70%** | 增删查 migration_history 记录 |

---

## 8. CI 集成

```yaml
# .github/workflows/test.yml (migration 部分)
jobs:
  test-migration:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: audebase_test
          POSTGRES_USER: audebase
          POSTGRES_PASSWORD: audebase_test
        ports: ['5432:5432']

    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @audebase/migration test -- --coverage
        env:
          AUDE_DATABASE_URL: postgres://audebase:audebase_test@localhost:5432/audebase_test
      - name: Dry-run check
        run: pnpm --filter @audebase/cli exec aude db:migrate --dry-run
```

### CI Dry-run 预检

```yaml
- name: Migration Dry-Run
  run: |
    npx aude db:migrate --dry-run
    # 检测危险操作（DROP/TRUNCATE）→ exit code 1 → 阻断 PR
```

---

## 9. 验收标准

遵循 phase-planning.md §1a #5 验收标准：

| # | 标准 | 对应测试 |
|---|------|---------|
| 1 | migration_history 表追踪版本 | `resolver.test.ts`: version_gated 逻辑 |
| 2 | preload→postsync→postload 三阶段顺序执行 | `migration-execution.integration.test.ts`: 顺序验证 |
| 3 | 迁移失败时标记 failed → 跳过该插件 → 不阻塞启动 | `migration-execution.integration.test.ts`: Graceful Skip |
| 4 | CI dry-run 预检 | `dry-run.test.ts`: 危险操作拦截 + 语法检测 |

---

## 参考

- [migration-engine-sdd.md](migration-engine-sdd.md) — SDD 接口定义与架构
- [database-schema.md](database-schema.md) — migration_history 表 DDL (§10)
- [test-seed-strategy.md](test-seed-strategy.md) — 测试种子数据工厂
- [dev-workflow.md](dev-workflow.md) — Test Harness 设计
- [phase-planning.md](../phase-planning.md) — Phase 1a 模块清单与验收标准
- [../../.agents/memorys/decisions.md](../../.agents/memorys/decisions.md) — D1.7

---

## 10. 错误码覆盖

根据 migration-engine-sdd.md §5 定义的 5 个错误码：

**测试文件**: `packages/migration/src/__tests__/unit/error-codes.test.ts`

```typescript
import { describe, test, expect } from 'vitest'
import { MigrationExecutor } from '../../executor'
import { containsDangerousOperation } from '../../executor'
import { createTestApp, type TestApp } from '../helpers/create-test-app'

describe('Migration Engine 错误码覆盖', () => {
  let test: TestApp

  beforeEach(async () => {
    test = await createTestApp()
  })

  afterEach(async () => {
    await test.cleanup()
  })

  // MIGRATION_PARSE_ERROR — 迁移文件 SQL 语法错误
  test('SQL 语法错误应抛出 MIGRATION_PARSE_ERROR', async () => {
    // Arrange
    await seedMigrationFiles(test, '@test/plugin', '1.0.0', {
      preload: 'SYNTAX ERROR NOT VALID SQL;',
    })
    const executor = new MigrationExecutor(test.db)

    // Act & Assert
    await expect(executor.execute('@test/plugin', '1.0.0', 'preload')).rejects.toThrow('MIGRATION_PARSE_ERROR')
  })

  // MIGRATION_EXECUTION_ERROR — 迁移执行时运行时错误
  test('迁移执行失败应抛出 MIGRATION_EXECUTION_ERROR', async () => {
    // Arrange
    await seedMigrationFiles(test, '@test/plugin', '1.0.0', {
      preload: 'SELECT FROM nonexistent_table;',
    })
    const executor = new MigrationExecutor(test.db)

    // Act & Assert
    await expect(executor.execute('@test/plugin', '1.0.0', 'preload')).rejects.toThrow('MIGRATION_EXECUTION_ERROR')
  })

  // DANGEROUS_OPERATION — 检测到危险 SQL 操作
  test('DROP TABLE 应触发 DANGEROUS_OPERATION', async () => {
    // Arrange
    await seedMigrationFiles(test, '@test/plugin', '1.0.0', {
      preload: 'DROP TABLE users;',
    })
    const executor = new MigrationExecutor(test.db)

    // Act & Assert
    await expect(executor.execute('@test/plugin', '1.0.0', 'preload')).rejects.toThrow('DANGEROUS_OPERATION')
  })

  // VERSION_MISMATCH — 版本号不一致
  test('重复执行相同版本迁移应抛出 VERSION_MISMATCH', async () => {
    // Arrange — 先执行一次，再尝试重复执行
    await seedMigrationFiles(test, '@test/plugin', '1.0.0', {
      preload: 'CREATE TABLE IF NOT EXISTS test_table (id UUID PRIMARY KEY);',
    })
    const executor = new MigrationExecutor(test.db)
    await executor.execute('@test/plugin', '1.0.0', 'preload')

    // Act & Assert — 重复执行应失败
    await expect(
      executor.execute('@test/plugin', '1.0.0', 'preload'),
    ).rejects.toThrow('VERSION_MISMATCH')
  })

  // MIGRATION_PHASE_ERROR — 阶段执行顺序错误
  test('跳过 postsync 直接执行 postload 应抛出 MIGRATION_PHASE_ERROR', async () => {
    // Arrange
    await seedMigrationFiles(test, '@test/plugin', '1.0.0', {
      preload: 'CREATE TABLE IF NOT EXISTS test_table (id UUID);',
      postload: 'CREATE INDEX IF NOT EXISTS idx_test ON test_table(id);',
    })
    const executor = new MigrationExecutor(test.db)
    await executor.execute('@test/plugin', '1.0.0', 'preload')

    // Act & Assert — 跳过 postsync 直接执行 postload 应报错
    await expect(
      executor.execute('@test/plugin', '1.0.0', 'postload'),
    ).rejects.toThrow('MIGRATION_PHASE_ERROR')
  })
})
```

| 错误码 | 对应测试 | SDD 引用 |
|--------|---------|----------|
| `MIGRATION_PARSE_ERROR` | SQL 语法错误 | migration-engine-sdd.md §5 |
| `MIGRATION_EXECUTION_ERROR` | 迁移执行时运行时错误 | migration-engine-sdd.md §5 |
| `DANGEROUS_OPERATION` | 危险 SQL 操作 (DROP/TRUNCATE) | migration-engine-sdd.md §5 |
| `VERSION_MISMATCH` | 版本号不一致/重复执行 | migration-engine-sdd.md §5 |
| `MIGRATION_PHASE_ERROR` | 阶段执行顺序错误 | migration-engine-sdd.md §5 |

---

## 11. 契约测试

**测试文件**: `packages/migration/src/__tests__/contracts/migration.contract.test.ts`

```typescript
import { describe, test, expect } from 'vitest'
import { createTestApp, type TestApp } from '../helpers/create-test-app'
import { validateContract } from '../../core/src/__tests__/helpers/contract'
import { z } from 'zod'

const migrationStatusSchema = z.object({
  plugin: z.string(),
  version: z.string(),
  phase: z.enum(['preload', 'postsync', 'postload']),
  status: z.enum(['pending', 'running', 'success', 'failed']),
  executedAt: z.string().nullable(),
})

describe('CLI db:migrate 契约测试', () => {
  test('dry-run 模式不修改数据库但输出待执行迁移列表', async () => {
    // Arrange & Act
    const { app } = await createTestApp()
    // 执行 dry-run
    const res = await app.cli.execute('db:migrate --dry-run')

    // Assert
    expect(res.output).toContain('DRY RUN')
    const history = await app.db.query.migration_history.findMany()
    expect(history).toHaveLength(0)
  })

  test('正常迁移执行后 migration_history 记录更新', async () => {
    // Arrange
    const { app } = await createTestApp()
    await seedMigrationFiles(app, '@test/plugin', '1.0.0', {
      preload: 'CREATE TABLE IF NOT EXISTS t1 (id UUID PRIMARY KEY);',
      postsync: 'INSERT INTO t1 VALUES (gen_random_uuid());',
      postload: 'CREATE INDEX IF NOT EXISTS idx_t1 ON t1(id);',
    })

    // Act
    await app.cli.execute('db:migrate')

    // Assert
    const history = await app.db.query.migration_history.findMany({
      where: (fields, { eq }) => eq(fields.module_name, '@test/plugin'),
    })
    expect(history).toHaveLength(3)
    expect(history.map(h => h.status)).toEqual(['success', 'success', 'success'])
  })

  test('迁移失败时不阻塞其他插件', async () => {
    // Arrange
    const { app } = await createTestApp()
    await seedMigrationFiles(app, '@test/plugin-bad', '1.0.0', {
      preload: 'THIS_IS_INVALID_SQL;',
    })
    await seedMigrationFiles(app, '@test/plugin-good', '1.0.0', {
      preload: 'CREATE TABLE IF NOT EXISTS t_good (id UUID PRIMARY KEY);',
    })

    // Act
    await app.cli.execute('db:migrate')

    // Assert
    const badHistory = await app.db.query.migration_history.findFirst({
      where: (fields, { eq }) => eq(fields.module_name, '@test/plugin-bad'),
    })
    expect(badHistory?.status).toBe('failed')

    const goodHistory = await app.db.query.migration_history.findFirst({
      where: (fields, { eq }) => eq(fields.module_name, '@test/plugin-good'),
    })
    expect(goodHistory?.status).toBe('success')
  })
})
```

| 契约端点 | 用例 | 验证点 |
|---------|------|-------|
| `db:migrate --dry-run` | 1 | 不写 DB，输出待执行迁移 |
| `db:migrate` | 1 | 三阶段顺序执行，history 记录正确 |
| `db:migrate` (故障) | 1 | 单插件失败不阻塞其余 |

**环境要求**: 真实 PostgreSQL（事务回滚）

---

## 12. 上游 TDD 参考

以下模块依赖 migration-engine 的正确行为：

- [plugin-core-tdd.md](plugin-core-tdd.md) — Bootstrap 依赖 migration_history 表
- [plugin-framework-tdd.md](plugin-framework-tdd.md) — MIGRATION_FAILED 错误码
- [manifest-engine-tdd.md](manifest-engine-tdd.md) — version_gated 字段

共享契约: migration_history 表结构参见 [database-schema.md](database-schema.md)
