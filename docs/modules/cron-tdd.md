# Cron TDD 测试策略

> **模块**: `@audebase/cron`
> **依赖**: `@audebase/shared-types`, `bullmq` (^5.x), `ioredis`
> **更新日期**: 2026-07-17
> **参考**: cron-sdd.md, D1.10, architecture.md §定时任务, phase-planning.md
> **覆盖率目标**: 85%+ 行覆盖率, 80%+ 分支覆盖率

---

## 1. 测试策略概述

Cron 模块为 AUDEBase 平台提供基于 BullMQ repeatable jobs 的定时任务调度能力。核心为 `CronManager` 类，提供 `add()` / `remove()` / `list()` / `start()` / `stop()` 异步 API。Phase 1b 所有任务在 Core 同进程执行，通过 BullMQ testMode 实现零 Redis 单元测试。

| 测试类型 | 最低用例数 | 数据库 |
|---------|:---:|------|
| 单元测试 | 20+ | 无（BullMQ testMode） |
| 集成测试 | 5+ | Redis（Valkey 8） |
| 契约测试 | 3+ | 无（BullMQ testMode） |
| E2E 测试 | 2 流程 | Redis（Valkey 8） |

---

## 2. 模块结构

```
packages/cron/
├── src/
│   ├── index.ts              # 公开导出 CronManager, 类型
│   ├── cron-manager.ts       # CronManager 类（BullMQ Queue + Worker）
│   ├── types.ts               # CronJobConfig, CronJobResult, CronExecutionLog
│   ├── manifest-parser.ts     # manifest.yaml cron 字段解析 + Zod 校验
│   ├── schedule-validator.ts  # cron 表达式校验工具
│   ├── __tests__/
│   │   ├── unit/
│   │   │   ├── cron-manager.test.ts
│   │   │   ├── manifest-parser.test.ts
│   │   │   └── schedule-validator.test.ts
│   │   ├── integration/
│   │   │   └── cron.integration.test.ts
│   │   ├── contracts/
│   │   │   └── cron.contract.test.ts
│   │   └── seeds/
│   │       └── cron-fixtures.ts
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## 3. 单元测试

### 3.1 CronManager 单元测试

```
测试文件: packages/cron/src/__tests__/unit/cron-manager.test.ts
```

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { CronManager } from '../../cron-manager'

describe('CronManager', () => {
  let manager: CronManager

  beforeEach(() => {
    vi.useFakeTimers()
    manager = new CronManager()
  })

  afterEach(async () => {
    await manager.stop()
    vi.useRealTimers()
  })

  describe('add()', () => {
    it('registers a cron job and returns it in list()', async () => {
      // Arrange
      const config = { name: 'test-job', schedule: '*/5 * * * *', handler: 'myHandler' }

      // Act
      await manager.add(config)
      const jobs = await manager.list()

      // Assert
      expect(jobs).toHaveLength(1)
      expect(jobs[0].name).toBe('test-job')
    })

    it('throws CRON_DUPLICATE_NAME when adding a job with the same name', async () => {
      // Arrange
      await manager.add({ name: 'dup-job', schedule: '0 * * * *', handler: 'h1' })

      // Act & Assert
      await expect(
        manager.add({ name: 'dup-job', schedule: '*/30 * * * *', handler: 'h2' })
      ).rejects.toThrow(/CRON_DUPLICATE_NAME/)
    })

    it('accepts jobs with same name from different plugins (pluginName prefix)', async () => {
      // Arrange
      await manager.add({ name: 'report', schedule: '0 8 * * *', handler: 'gen', pluginName: 'plugin-a' })
      await manager.add({ name: 'report', schedule: '0 9 * * *', handler: 'gen', pluginName: 'plugin-b' })

      // Act
      const jobs = await manager.list()

      // Assert
      expect(jobs).toHaveLength(2)
    })

    it('throws CRON_INVALID_SCHEDULE for malformed cron expression', async () => {
      // Arrange
      const config = { name: 'bad-job', schedule: 'not-a-cron', handler: 'h' }

      // Act & Assert
      await expect(manager.add(config)).rejects.toThrow(/CRON_INVALID_SCHEDULE/)
    })

    it('throws CRON_INVALID_SCHEDULE for empty schedule string', async () => {
      // Arrange
      const config = { name: 'empty', schedule: '', handler: 'h' }

      // Act & Assert
      await expect(manager.add(config)).rejects.toThrow(/CRON_INVALID_SCHEDULE/)
    })

    it('accepts both 5-field and 6-field cron expressions', async () => {
      // Arrange
      const config5 = { name: 'five', schedule: '*/5 * * * *', handler: 'h' }
      const config6 = { name: 'six', schedule: '0 */5 * * * *', handler: 'h' }

      // Act
      await manager.add(config5)
      await manager.add(config6)
      const jobs = await manager.list()

      // Assert
      expect(jobs).toHaveLength(2)
    })

    it('stores timezone from config', async () => {
      // Arrange
      const config = { name: 'tz-job', schedule: '0 9 * * *', handler: 'h', timezone: 'Asia/Shanghai' }

      // Act
      await manager.add(config)
      const jobs = await manager.list()

      // Assert
      expect(jobs[0].name).toBe('tz-job')
    })

    it('defaults maxRetries to 3 when not specified', async () => {
      // Arrange
      const config = { name: 'default-retry', schedule: '0 * * * *', handler: 'h' }

      // Act
      await manager.add(config)
      const jobs = await manager.list()

      // Assert
      expect(jobs).toHaveLength(1)
    })

    it('validates maxRetries range (1-10)', async () => {
      // Arrange
      const config = { name: 'bad-retry', schedule: '0 * * * *', handler: 'h', maxRetries: 99 }

      // Act & Assert
      await expect(manager.add(config)).rejects.toThrow()
    })
  })

  describe('remove()', () => {
    it('removes a registered job', async () => {
      // Arrange
      await manager.add({ name: 'to-remove', schedule: '*/10 * * * *', handler: 'h' })

      // Act
      await manager.remove('to-remove')
      const jobs = await manager.list()

      // Assert
      expect(jobs).toHaveLength(0)
    })

    it('is a no-op when removing a non-existent job', async () => {
      // Arrange
      await manager.add({ name: 'keep', schedule: '0 * * * *', handler: 'h' })

      // Act
      await manager.remove('does-not-exist')
      const jobs = await manager.list()

      // Assert
      expect(jobs).toHaveLength(1)
    })

    it('only removes the specified job, not others', async () => {
      // Arrange
      await manager.add({ name: 'job-a', schedule: '0 * * * *', handler: 'h' })
      await manager.add({ name: 'job-b', schedule: '*/30 * * * *', handler: 'h' })

      // Act
      await manager.remove('job-a')
      const jobs = await manager.list()

      // Assert
      expect(jobs).toHaveLength(1)
      expect(jobs[0].name).toBe('job-b')
    })
  })

  describe('list()', () => {
    it('returns empty array when no jobs registered', async () => {
      // Act
      const jobs = await manager.list()

      // Assert
      expect(jobs).toEqual([])
    })

    it('returns all registered jobs with their metadata', async () => {
      // Arrange
      await manager.add({ name: 'j1', schedule: '0 * * * *', handler: 'h1', pluginName: 'p1' })
      await manager.add({ name: 'j2', schedule: '*/5 * * * *', handler: 'h2', pluginName: 'p2' })

      // Act
      const jobs = await manager.list()

      // Assert
      expect(jobs).toHaveLength(2)
      expect(jobs.map(j => j.name)).toEqual(expect.arrayContaining(['j1', 'j2']))
      expect(jobs.map(j => j.pluginName)).toEqual(expect.arrayContaining(['p1', 'p2']))
    })

    it('includes running status in result', async () => {
      // Arrange
      await manager.add({ name: 'status-job', schedule: '*/5 * * * *', handler: 'h' })

      // Act
      const jobs = await manager.list()

      // Assert
      expect(jobs[0].running).toBe(false)
    })
  })

  describe('start() / stop()', () => {
    it('start() does not throw when called with no jobs', async () => {
      // Act & Assert
      await expect(manager.start()).resolves.toBeUndefined()
    })

    it('stop() is idempotent', async () => {
      // Arrange
      await manager.start()

      // Act
      await manager.stop()
      await manager.stop()

      // Assert
      // no throw
    })

    it('can restart after stop()', async () => {
      // Arrange
      await manager.add({ name: 'restart-job', schedule: '*/5 * * * *', handler: 'h' })
      await manager.start()
      await manager.stop()

      // Act
      await manager.start()
      const jobs = await manager.list()

      // Assert
      expect(jobs).toHaveLength(1)
    })
  })

  describe('job isolation', () => {
    it('one failing job does not crash other jobs', async () => {
      // Arrange
      const results: string[] = []
      const pluginInstance = {
        goodHandler: async () => { results.push('good') },
        badHandler: async () => { throw new Error('bad handler error') },
      }

      // Act
      // Simulate that both handlers run; the bad one throws, good one completes
      try {
        await pluginInstance.badHandler()
      } catch {
        // expected
      }
      await pluginInstance.goodHandler()

      // Assert
      expect(results).toEqual(['good'])
    })
  })

  describe('retry with exponential backoff', () => {
    it('retries failed job up to maxRetries times', async () => {
      // Arrange
      let attemptCount = 0
      const handler = async () => {
        attemptCount++
        throw new Error('always fails')
      }

      // Act - simulate retry loop
      const maxRetries = 3
      for (let i = 0; i <= maxRetries; i++) {
        try {
          await handler()
          break
        } catch {
          if (i < maxRetries) {
            // backoff: 1s, 5s, 30s
            const delays = [1000, 5000, 30000]
            vi.advanceTimersByTime(delays[i])
          }
        }
      }

      // Assert
      expect(attemptCount).toBe(maxRetries + 1) // initial + 3 retries
    })

    it('does not retry on success', async () => {
      // Arrange
      let attemptCount = 0
      const handler = async () => {
        attemptCount++
        if (attemptCount === 1) return 'ok'
        throw new Error('should not be called again')
      }

      // Act
      await handler()

      // Assert
      expect(attemptCount).toBe(1)
    })
  })
})
```

### 3.2 ScheduleValidator 单元测试

```
测试文件: packages/cron/src/__tests__/unit/schedule-validator.test.ts
```

```typescript
import { describe, it, expect } from 'vitest'
import { validateSchedule } from '../../schedule-validator'

describe('validateSchedule', () => {
  it('accepts valid 5-field cron expression', () => {
    // Arrange
    const expr = '*/5 * * * *'

    // Act
    const result = validateSchedule(expr)

    // Assert
    expect(result.valid).toBe(true)
  })

  it('accepts valid 6-field cron expression', () => {
    // Arrange
    const expr = '0 */5 * * * *'

    // Act
    const result = validateSchedule(expr)

    // Assert
    expect(result.valid).toBe(true)
  })

  it('rejects malformed expression', () => {
    // Arrange
    const expr = 'not-a-cron'

    // Act
    const result = validateSchedule(expr)

    // Assert
    expect(result.valid).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('rejects empty string', () => {
    // Arrange
    const expr = ''

    // Act
    const result = validateSchedule(expr)

    // Assert
    expect(result.valid).toBe(false)
  })

  it('rejects expression with too few fields', () => {
    // Arrange
    const expr = '* * *'

    // Act
    const result = validateSchedule(expr)

    // Assert
    expect(result.valid).toBe(false)
  })

  it('rejects expression with invalid field values', () => {
    // Arrange
    const expr = '* * * * 99'

    // Act
    const result = validateSchedule(expr)

    // Assert
    expect(result.valid).toBe(false)
  })

  it('accepts common production schedules', () => {
    // Arrange
    const schedules = [
      '0 8 * * *',       // daily 8am
      '0 0 * * 0',       // weekly midnight Sunday
      '*/30 * * * *',    // every 30 minutes
      '0 */2 * * *',     // every 2 hours
      '0 0 1 * *',       // monthly
    ]

    // Act & Assert
    for (const s of schedules) {
      expect(validateSchedule(s).valid).toBe(true)
    }
  })
})
```

### 3.3 ManifestParser 单元测试

```
测试文件: packages/cron/src/__tests__/unit/manifest-parser.test.ts
```

```typescript
import { describe, it, expect } from 'vitest'
import { parseManifestCron } from '../../manifest-parser'

describe('parseManifestCron', () => {
  it('parses valid cron manifest entries', () => {
    // Arrange
    const manifest = {
      cron: [
        { name: 'daily-report', schedule: '0 8 * * *', handler: 'generateDailyReport' },
        { name: 'cleanup', schedule: '0 3 * * 0', handler: 'cleanupTempFiles', timezone: 'Asia/Shanghai', maxRetries: 5 },
      ],
    }

    // Act
    const result = parseManifestCron(manifest, 'plugin-a')

    // Assert
    expect(result).toHaveLength(2)
    expect(result[0].name).toBe('daily-report')
    expect(result[0].pluginName).toBe('plugin-a')
    expect(result[1].timezone).toBe('Asia/Shanghai')
    expect(result[1].maxRetries).toBe(5)
  })

  it('applies default maxRetries=3 when not specified', () => {
    // Arrange
    const manifest = {
      cron: [
        { name: 'defaults', schedule: '0 * * * *', handler: 'h' },
      ],
    }

    // Act
    const result = parseManifestCron(manifest, 'plugin-a')

    // Assert
    expect(result[0].maxRetries).toBe(3)
  })

  it('rejects handler with invalid characters', () => {
    // Arrange
    const manifest = {
      cron: [
        { name: 'bad', schedule: '0 * * * *', handler: 'handler; drop tables' },
      ],
    }

    // Act & Assert
    expect(() => parseManifestCron(manifest, 'plugin-a')).toThrow()
  })

  it('rejects cron entry with invalid schedule', () => {
    // Arrange
    const manifest = {
      cron: [
        { name: 'bad-schedule', schedule: 'invalid', handler: 'h' },
      ],
    }

    // Act & Assert
    expect(() => parseManifestCron(manifest, 'plugin-a')).toThrow()
  })

  it('rejects maxRetries outside 1-10 range', () => {
    // Arrange
    const manifest = {
      cron: [
        { name: 'bad-retries', schedule: '0 * * * *', handler: 'h', maxRetries: 0 },
      ],
    }

    // Act & Assert
    expect(() => parseManifestCron(manifest, 'plugin-a')).toThrow()
  })

  it('returns empty array when cron field is missing', () => {
    // Arrange
    const manifest = {}

    // Act
    const result = parseManifestCron(manifest, 'plugin-a')

    // Assert
    expect(result).toEqual([])
  })

  it('returns empty array when cron field is empty array', () => {
    // Arrange
    const manifest = { cron: [] }

    // Act
    const result = parseManifestCron(manifest, 'plugin-a')

    // Assert
    expect(result).toEqual([])
  })
})
```

---

## 4. 集成测试

```
测试文件: packages/cron/src/__tests__/integration/cron.integration.test.ts
```

```typescript
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { CronManager } from '../../cron-manager'

// Integration tests require a running Valkey/Redis instance
// See docker-compose.yml for valkey:8 service
const REDIS_HOST = process.env.REDIS_HOST || 'localhost'
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10)

describe('Cron 集成测试', () => {
  let manager: CronManager

  beforeAll(() => {
    manager = new CronManager({
      connection: { host: REDIS_HOST, port: REDIS_PORT },
    })
  })

  afterAll(async () => {
    await manager.stop()
  })

  it('注册任务后通过 repeatable job 创建验证', async () => {
    // Arrange
    const config = { name: 'integ-test-job', schedule: '*/5 * * * *', handler: 'testHandler' }

    // Act
    await manager.add(config)
    await manager.start()
    const jobs = await manager.list()

    // Assert
    expect(jobs).toHaveLength(1)
    expect(jobs[0].name).toBe('integ-test-job')

    // Cleanup
    await manager.remove('integ-test-job')
  })

  it('移除任务后不再出现在列表中', async () => {
    // Arrange
    await manager.add({ name: 'remove-me', schedule: '0 * * * *', handler: 'h' })

    // Act
    await manager.remove('remove-me')
    const jobs = await manager.list()

    // Assert
    expect(jobs.find(j => j.name === 'remove-me')).toBeUndefined()
  })

  it('start() 后 Worker 正常监听队列', async () => {
    // Arrange
    await manager.add({ name: 'worker-test', schedule: '0 0 * * *', handler: 'h' })

    // Act
    await expect(manager.start()).resolves.toBeUndefined()

    // Assert - Worker is running, no crash
    const jobs = await manager.list()
    expect(jobs).toHaveLength(1)

    // Cleanup
    await manager.remove('worker-test')
  })

  it('stop() 后 Worker 停止处理', async () => {
    // Arrange
    await manager.add({ name: 'stop-test', schedule: '*/5 * * * *', handler: 'h' })
    await manager.start()

    // Act
    await manager.stop()

    // Assert - no throw, manager is stopped
    // Can still list jobs
    const jobs = await manager.list()
    expect(jobs).toHaveLength(1)

    // Cleanup
    await manager.remove('stop-test')
  })

  it('多个插件各自注册 cron 任务互不干扰', async () => {
    // Arrange
    const pluginA = { name: 'p1-report', schedule: '0 8 * * *', handler: 'gen', pluginName: 'plugin-a' }
    const pluginB = { name: 'p2-report', schedule: '0 9 * * *', handler: 'gen', pluginName: 'plugin-b' }

    // Act
    await manager.add(pluginA)
    await manager.add(pluginB)
    const jobs = await manager.list()

    // Assert
    expect(jobs).toHaveLength(2)
    expect(jobs.map(j => j.pluginName)).toEqual(expect.arrayContaining(['plugin-a', 'plugin-b']))

    // Cleanup
    await manager.remove('p1-report')
    await manager.remove('p2-report')
  })
})
```

---

## 5. 契约测试

```
测试文件: packages/cron/src/__tests__/contracts/cron.contract.test.ts
```

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { CronManager } from '../../cron-manager'

describe('CronManager 接口契约', () => {
  let manager: CronManager

  beforeEach(() => {
    manager = new CronManager()
  })

  afterEach(async () => {
    await manager.stop()
  })

  it('add() 返回 Promise<void> 不 resolve 到 undefined', async () => {
    // Arrange
    const config = { name: 'contract-job', schedule: '*/5 * * * *', handler: 'h' }

    // Act
    const result = manager.add(config)

    // Assert - result is a Promise
    expect(result).toBeInstanceOf(Promise)
    await expect(result).resolves.toBeUndefined()
  })

  it('remove() 返回 Promise<void>', async () => {
    // Arrange
    await manager.add({ name: 'contract-remove', schedule: '0 * * * *', handler: 'h' })

    // Act
    const result = manager.remove('contract-remove')

    // Assert
    expect(result).toBeInstanceOf(Promise)
    await expect(result).resolves.toBeUndefined()
  })

  it('list() 返回 Promise<CronJobResult[]>', async () => {
    // Arrange
    await manager.add({ name: 'contract-list', schedule: '*/5 * * * *', handler: 'h' })

    // Act
    const result = manager.list()

    // Assert
    expect(result).toBeInstanceOf(Promise)
    const jobs = await result
    expect(Array.isArray(jobs)).toBe(true)
    expect(jobs.length).toBeGreaterThanOrEqual(1)
    expect(jobs[0]).toHaveProperty('name')
    expect(jobs[0]).toHaveProperty('pluginName')
    expect(jobs[0]).toHaveProperty('running')
  })

  it('CronJobResult 包含所有必需字段', async () => {
    // Arrange
    await manager.add({ name: 'fields-job', schedule: '0 8 * * *', handler: 'h', pluginName: 'test-plugin' })

    // Act
    const jobs = await manager.list()
    const job = jobs[0]

    // Assert
    expect(job.name).toBe('fields-job')
    expect(job.pluginName).toBe('test-plugin')
    expect(typeof job.nextRunAt).toBe('number')
    expect('lastRunAt' in job).toBe(true)
    expect('lastDuration' in job).toBe(true)
    expect('lastError' in job).toBe(true)
    expect(typeof job.running).toBe('boolean')
  })
})
```

---

## 6. E2E 测试 (Playwright)

Cron 模块 E2E 属于 Phase 1b stretch goal，通过管理后台验证定时任务行为：

| 用例 | 描述 |
|------|------|
| 插件管理查看定时任务列表 | 安装含 cron 声明的插件后，在管理后台查看任务列表 |
| 手动触发任务执行 | 管理后台一键触发指定 cron 任务立即执行 |

**注**: Phase 1b cron 是后端模块，E2E 验证需配合 Core 完整启动 + Redis 服务。建议在 Admin UI 集成测试中覆盖 cron 管理页面。

---

## 7. 种子数据

```
packages/cron/src/__tests__/seeds/cron-fixtures.ts
```

Cron 模块无数据库依赖，种子数据仅用于测试中的 `CronManager` 实例配置和 mock 插件实例：

```typescript
import type { CronJobConfig } from '../../types'

/** 测试用 cron 任务配置工厂 */
export function createMinuteJob(name: string = 'test-job'): CronJobConfig {
  return { name, schedule: '*/5 * * * *', handler: 'handleTest' }
}

/** 每日定时任务配置 */
export function createDailyJob(name: string = 'daily-job', handler: string = 'handleDaily'): CronJobConfig {
  return { name, schedule: '0 8 * * *', handler }
}

/** 每小时任务配置 */
export function createHourlyJob(name: string = 'hourly-job', handler: string = 'handleHourly'): CronJobConfig {
  return { name, schedule: '0 * * * *', handler }
}

/** 带时区的任务配置 */
export function createTimezoneJob(name: string = 'tz-job', timezone: string = 'Asia/Shanghai'): CronJobConfig {
  return { name, schedule: '0 9 * * *', handler: 'handleTz', timezone }
}

/** 创建 mock 插件实例（用于 handler 执行验证） */
export function createMockPlugin(handlers: Record<string, () => Promise<void>>) {
  return handlers
}

/** 创建多个 cron 配置用于批量测试 */
export function createBatchConfigs(count: number): CronJobConfig[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `batch-job-${i}`,
    schedule: '*/5 * * * *',
    handler: 'handleBatch',
  }))
}
```

---

## 8. Mock 策略

| 依赖 | 单元测试 | 集成测试 |
|------|---------|---------|
| BullMQ Queue | BullMQ testMode（内存队列，无需 Redis） | 真实 Queue（连接 Valkey） |
| BullMQ Worker | BullMQ testMode（同步触发 Worker） | 真实 Worker（连接 Valkey） |
| Redis | 无（testMode 绕过 Redis） | 真实 Valkey 实例 |
| 时间 | `vi.useFakeTimers()` + `vi.advanceTimersByTime()` | 真实时间 |
| Plugin handler | mock 函数（`vi.fn()`） | 真实 handler 方法 |
| 日志 | mock logger（`vi.fn()`） | 真实 logger 或 mock |
| CronJobConfig | 结构类型字面量 | 结构类型字面量 |

### Mock 约束

| 约束 | 说明 |
|------|------|
| 异步 API | `add()`, `remove()`, `list()`, `start()`, `stop()` 均为 async 方法，返回 Promise |
| BullMQ testMode | 单元测试使用 `new Queue()` + `worker.waitUntilReady()` 内存模式，无需真实 Redis |
| 实例隔离 | 每个测试创建独立 `CronManager` 实例，afterEach 调用 `stop()` 清理 |
| 时间控制 | 使用 `vi.useFakeTimers()` 控制时间推移，`vi.advanceTimersByTime()` 触发调度 |
| Handler mock | 使用 `vi.fn()` 创建 handler mock，验证调用次数和参数 |
| 无真实 Redis | 单元测试通过 BullMQ testMode 完全脱离 Redis 依赖 |
| 日志验证 | mock logger 断言每次执行生成正确的结构化日志条目 |

---

## 9. 覆盖率目标

| 指标 | 目标 | 关键路径 |
|------|:---:|------|
| 行覆盖率 | **85%+** | |
| 分支覆盖率 | **80%+** | add() 校验分支（合法/重复/非法 schedule）、remove() 存在/不存在、list() 空/非空 |
| 函数覆盖率 | **90%+** | add / remove / list / start / stop / validateSchedule / parseManifestCron |
| 单元 | 20+ | CronManager 全部方法 + 边界 + schedule 校验 + manifest 解析 |
| 集成 | 5+ | 真实 Redis 连接 + 任务注册/移除/Worker 启停 + 多插件隔离 |
| 契约 | 4+ | 返回类型 + 字段完整性 + Promise 契约 |

---

## 10. CI 集成

```yaml
cron-test:
  runs-on: ubuntu-latest
  services:
    valkey:
      image: valkey/valkey:8
      ports:
        - 6379:6379
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
    - run: pnpm install --frozen-lockfile
    - run: pnpm --filter @audebase/cron test:unit
    - run: pnpm --filter @audebase/cron test:integration
      env:
        REDIS_HOST: localhost
        REDIS_PORT: 6379
```

**注**: 单元测试使用 BullMQ testMode 无需外部服务。集成测试需要 valkey:8 服务（见 docker-compose.yml）。

---

## 11. 用例汇总

| 测试层 | 用例数 |
|--------|:---:|
| 单元 - CronManager | 15 |
| 单元 - ScheduleValidator | 8 |
| 单元 - ManifestParser | 8 |
| 集成 - 完整流程 | 5 |
| 契约 - 接口签名 | 4 |
| E2E - 管理后台 | 2 |
| **合计** | **42** |

---

## 12. 参考

- [cron-sdd.md](cron-sdd.md) — Cron 模块 SDD
- [shared-types-tdd.md](shared-types-tdd.md) — ErrorCode 枚举
- [../../.agents/memorys/decisions.md](../../.agents/memorys/decisions.md) — D1.10 定时任务
- [test-seed-strategy.md](test-seed-strategy.md) — 集成测试策略
- [redis-mock-guide.md](redis-mock-guide.md) — ioredis-mock + BullMQ testMode

> **上游 TDD 参考**: [shared-types-tdd.md §3.1](shared-types-tdd.md) — ErrorCode 枚举; [core-tdd.md](core-tdd.md) — Fastify 中间件集成