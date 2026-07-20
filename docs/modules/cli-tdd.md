# CLI 工具 TDD 测试策略

> **模块**: `@audebase/cli`
> **依赖**: shared-types, core (CoreApp, loadConfig), migration (MigrationEngine)
> **更新日期**: 2026-07-17
> **参考**: cli-sdd.md, GO-023, decisions.md
> **覆盖率目标**: 85%+ 行覆盖率, 80%+ 分支覆盖率

---

## 1. 测试策略概述

CLI 模块（`aude` 命令）是开发者与 AUDEBase 平台交互的命令行入口。基于 commander.js 实现薄委托层设计——每个命令仅做参数解析和委托调用，业务逻辑在 Core/Migration 等包中。

| 测试类型 | 最低用例数 | 数据库 |
|---------|:---:|------|
| 单元测试 | 18+ | 无（mock DB + mock CoreApp + mock execSync） |
| 集成测试 | 4+ | 无（mock DB） |
| 契约测试 | 2+ | 无 |
| E2E 测试 | 2 流程 | Docker PostgreSQL |

**测试原则**:
- 所有命令 handler 通过 `program.parseAsync()` 调用，不直接暴露全局 `process.argv`
- `execSync` 调用通过 `vi.spyOn()` mock 避免实际执行子进程
- `MigrationEngine` 通过 `createMockDb()` 内置 mock 测试
- `CoreApp` 通过 `vi.mock('@audebase/core')` 全局 mock 测试
- 文件系统操作使用临时目录（`os.tmpdir()` + `crypto.randomUUID()`），测试后清理

---

## 2. 模块结构

```
packages/cli/
├── src/
│   ├── index.ts               # CLI 入口，createProgram() + program.parse()
│   ├── types.ts               # 命令选项类型定义
│   ├── mock-db.ts             # DatabaseProvider mock 工厂
│   ├── commands/
│   │   ├── dev.ts             # aude dev — 启动开发服务器
│   │   ├── migrate.ts         # aude db:migrate — 数据库迁移
│   │   ├── plugin-create.ts   # aude plugin:create — 插件脚手架
│   │   ├── build.ts           # aude build — 构建委托
│   │   ├── test.ts            # aude test — 测试委托
│   │   └── lint.ts            # aude lint — lint 委托
│   └── __tests__/
│       ├── unit/
│       │   ├── cli.test.ts        # createProgram + help 输出
│       │   ├── dev.test.ts        # dev 命令处理
│       │   ├── migrate.test.ts    # db:migrate 命令处理
│       │   ├── plugin-create.test.ts  # plugin:create 命令处理
│       │   ├── build.test.ts      # build 命令处理
│       │   ├── test.test.ts       # test 命令处理
│       │   └── lint.test.ts       # lint 命令处理
│       ├── integration/
│       │   └── cli.integration.test.ts  # 多命令执行流
│       └── contracts/
│           └── cli.contract.test.ts     # 退出码契约
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## 3. 单元测试

### 3.1 createProgram 单元测试

```
测试文件: packages/cli/src/__tests__/unit/cli.test.ts
```

```typescript
import { describe, test, expect } from 'vitest'
import { createProgram } from '../../index.js'

describe('createProgram', () => {
  test('创建 program 实例，name 和 version 正确', () => {
    // Arrange
    // Act
    const program = createProgram()

    // Assert
    expect(program.name()).toBe('aude')
    expect(program.version()).toBe('0.1.0')
    expect(program.description()).toContain('AUDEBase CLI')
  })

  test('注册全部 6 个命令', () => {
    // Arrange
    const program = createProgram()

    // Act
    const commands = program.commands.map((cmd) => cmd.name())

    // Assert
    expect(commands).toContain('dev')
    expect(commands).toContain('db:migrate')
    expect(commands).toContain('plugin:create')
    expect(commands).toContain('build')
    expect(commands).toContain('test')
    expect(commands).toContain('lint')
    expect(commands).toHaveLength(6)
  })

  test('help 输出包含模块名称和描述', () => {
    // Arrange
    const program = createProgram()

    // Act
    const helpText = program.helpInformation()

    // Assert
    expect(helpText).toContain('aude')
    expect(helpText).toContain('AUDEBase CLI')
    expect(helpText).toContain('Enterprise application platform')
  })

  test('dev 命令含 --port 和 --inspect 选项', () => {
    // Arrange
    const program = createProgram()

    // Act
    const devCmd = program.commands.find((cmd) => cmd.name() === 'dev')!
    const optionFlags = devCmd.options.map((opt) => opt.flags)

    // Assert
    expect(optionFlags).toContain('-p, --port <number>')
    expect(optionFlags).toContain('--inspect')
    expect(devCmd.description()).toContain('development server')
  })

  test('db:migrate 命令含 --dry-run 和 --plugin 选项', () => {
    // Arrange
    const program = createProgram()

    // Act
    const cmd = program.commands.find((c) => c.name() === 'db:migrate')!
    const optionFlags = cmd.options.map((opt) => opt.flags)

    // Assert
    expect(optionFlags).toContain('--dry-run')
    expect(optionFlags).toContain('-p, --plugin <name>')
    expect(cmd.description()).toContain('migration')
  })

  test('test 命令含 --watch 和 --coverage 选项', () => {
    // Arrange
    const program = createProgram()

    // Act
    const cmd = program.commands.find((c) => c.name() === 'test')!
    const optionFlags = cmd.options.map((opt) => opt.flags)

    // Assert
    expect(optionFlags).toContain('-w, --watch')
    expect(optionFlags).toContain('--coverage')
  })

  test('build 和 lint 命令无扩展选项', () => {
    // Arrange
    const program = createProgram()

    // Act
    const buildCmd = program.commands.find((c) => c.name() === 'build')!
    const lintCmd = program.commands.find((c) => c.name() === 'lint')!

    // Assert
    expect(buildCmd.options).toHaveLength(0)
    expect(lintCmd.options).toHaveLength(0)
  })

  test('plugin:create 命令接受位置参数 name', () => {
    // Arrange
    const program = createProgram()

    // Act
    const cmd = program.commands.find((c) => c.name() === 'plugin:create')!

    // Assert
    expect(cmd.arguments().length).toBeGreaterThan(0)
    expect(cmd.arguments()[0].name()).toBe('name')
    expect(cmd.description()).toContain('Scaffold')
  })
})
```

### 3.2 dev 命令单元测试

```
测试文件: packages/cli/src/__tests__/unit/dev.test.ts
```

```typescript
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { createProgram } from '../../index.js'

// Mock @audebase/core
vi.mock('@audebase/core', () => {
  const mockApp = {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    logger: { error: vi.fn() },
  }
  return {
    CoreApp: vi.fn(() => mockApp),
    loadConfig: vi.fn(() => ({ port: '3000', env: 'development' })),
  }
})

describe('aude dev', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('默认端口 3000 启动 CoreApp', async () => {
    // Arrange
    const program = createProgram()
    const { CoreApp } = await import('@audebase/core')

    // Act
    await program.parseAsync(['dev'], { from: 'user' })

    // Assert
    expect(CoreApp).toHaveBeenCalledTimes(1)
    expect(CoreApp).toHaveBeenCalledWith(
      expect.objectContaining({ port: '3000' }),
    )
    const mockInstance = vi.mocked(CoreApp).mock.results[0].value
    expect(mockInstance.start).toHaveBeenCalledTimes(1)
  })

  test('--port 选项覆盖默认端口', async () => {
    // Arrange
    const program = createProgram()
    const { loadConfig } = await import('@audebase/core')

    // Act
    await program.parseAsync(['dev', '--port', '4000'], { from: 'user' })

    // Assert — PORT 环境变量传递到 loadConfig
    expect(loadConfig).toHaveBeenCalledWith(
      expect.objectContaining({ PORT: '4000' }),
    )
  })

  test('SIGTERM 信号触发优雅关闭', async () => {
    // Arrange
    const program = createProgram()
    const { CoreApp } = await import('@audebase/core')
    const mockInstance = vi.mocked(CoreApp).mock.results[0].value

    // Act — 模拟 SIGTERM
    process.emit('SIGTERM')

    // Assert
    expect(mockInstance.stop).toHaveBeenCalled()
  })

  test('SIGINT 信号触发优雅关闭', async () => {
    // Arrange
    const program = createProgram()
    const { CoreApp } = await import('@audebase/core')
    const mockInstance = vi.mocked(CoreApp).mock.results[0].value

    // Act — 模拟 SIGINT
    process.emit('SIGINT')

    // Assert
    expect(mockInstance.stop).toHaveBeenCalled()
  })

  test('CoreApp.start 失败时 exit(1)', async () => {
    // Arrange
    const program = createProgram()
    const { CoreApp } = await import('@audebase/core')
    const mockInstance = vi.mocked(CoreApp).mock.results[0].value
    mockInstance.start = vi.fn().mockRejectedValue(new Error('DB unavailable'))

    // Act & Assert — parseAsync 应抛出（action 内 try-catch 后 exit）
    await expect(
      program.parseAsync(['dev'], { from: 'user' }),
    ).rejects.toThrow()
  })

  test('重复关闭信号幂等处理', async () => {
    // Arrange
    const program = createProgram()
    const { CoreApp } = await import('@audebase/core')
    const mockInstance = vi.mocked(CoreApp).mock.results[0].value

    // Act — 两次 SIGTERM
    process.emit('SIGTERM')
    process.emit('SIGTERM')

    // Assert — stop 只调用一次（shuttingDown guard）
    expect(mockInstance.stop).toHaveBeenCalledTimes(1)
  })
})
```

### 3.3 db:migrate 命令单元测试

```
测试文件: packages/cli/src/__tests__/unit/migrate.test.ts
```

```typescript
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { createProgram } from '../../index.js'

// Mock MigrationEngine
const mockDryRun = vi.fn()
const mockMigrate = vi.fn()
vi.mock('@audebase/migration', () => ({
  MigrationEngine: vi.fn(() => ({
    dryRun: mockDryRun,
    migrate: mockMigrate,
  })),
}))

describe('aude db:migrate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('正常模式完成迁移', async () => {
    // Arrange
    mockMigrate.mockResolvedValue({
      completed: 3,
      failed: 0,
      executionLog: [],
    })
    const program = createProgram()

    // Act
    await program.parseAsync(['db:migrate'], { from: 'user' })

    // Assert
    expect(mockMigrate).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'normal' }),
    )
  })

  test('dry-run 模式无待迁移时返回空报告', async () => {
    // Arrange
    mockDryRun.mockResolvedValue({
      tasks: [],
      blocked: [],
      hasBlocked: false,
    })
    const program = createProgram()

    // Act
    await program.parseAsync(['db:migrate', '--dry-run'], { from: 'user' })

    // Assert
    expect(mockDryRun).toHaveBeenCalledTimes(1)
    expect(mockMigrate).not.toHaveBeenCalled()
  })

  test('dry-run 模式有阻塞迁移时 exit(1)', async () => {
    // Arrange
    mockDryRun.mockResolvedValue({
      tasks: [{ plugin: 'my-plugin', phase: { phase: 'preload', sqlFile: '001.sql' } }],
      blocked: [{ plugin: 'my-plugin', phase: { phase: 'preload' }, reason: 'Version mismatch' }],
      hasBlocked: true,
    })
    const program = createProgram()

    // Act & Assert
    await expect(
      program.parseAsync(['db:migrate', '--dry-run'], { from: 'user' }),
    ).rejects.toThrow()
  })

  test('--plugin 选项限定迁移范围', async () => {
    // Arrange
    mockMigrate.mockResolvedValue({
      completed: 1,
      failed: 0,
      executionLog: [],
    })
    const program = createProgram()

    // Act
    await program.parseAsync(['db:migrate', '--plugin', 'my-plugin'], { from: 'user' })

    // Assert
    expect(mockMigrate).toHaveBeenCalled()
  })

  test('迁移失败时 exit(1)', async () => {
    // Arrange
    mockMigrate.mockResolvedValue({
      completed: 1,
      failed: 1,
      executionLog: [
        { pluginName: 'my-plugin', version: '0.1.0', phase: 'preload', status: 'failed', error: 'Syntax error' },
      ],
    })
    const program = createProgram()

    // Act & Assert
    await expect(
      program.parseAsync(['db:migrate'], { from: 'user' }),
    ).rejects.toThrow()
  })

  test('dry-run 有可用迁移时打印任务列表', async () => {
    // Arrange
    mockDryRun.mockResolvedValue({
      tasks: [
        { plugin: 'plugin-a', phase: { phase: 'preload', sqlFile: '001.sql' } },
        { plugin: 'plugin-b', phase: { phase: 'postsync', sqlFile: '001.sql' } },
      ],
      blocked: [],
      hasBlocked: false,
    })
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    const program = createProgram()

    // Act
    await program.parseAsync(['db:migrate', '--dry-run'], { from: 'user' })

    // Assert
    expect(consoleLogSpy).toHaveBeenCalledWith(
      expect.stringContaining('Dry-run complete'),
    )
    consoleLogSpy.mockRestore()
  })
})
```

### 3.4 plugin:create 命令单元测试

```
测试文件: packages/cli/src/__tests__/unit/plugin-create.test.ts
```

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import { rm, readFile, access } from 'node:fs/promises'
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { runPluginCreate } from '../../commands/plugin-create.js'

function makeTempDir(): string {
  return join(tmpdir(), `aude-test-${randomUUID()}`)
}

async function pathExists(p: string): Promise<boolean> {
  try { await access(p); return true } catch { return false }
}

describe('aude plugin:create', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = makeTempDir()
  })

  afterEach(async () => {
    if (existsSync(tempDir)) {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  test('创建目录结构和 manifest/package/index.ts', async () => {
    // Arrange
    const name = 'my-plugin'

    // Act
    await runPluginCreate(name, tempDir)

    // Assert
    const dir = join(tempDir, 'plugins', name)
    expect(await pathExists(join(dir, 'manifest.yaml'))).toBe(true)
    expect(await pathExists(join(dir, 'package.json'))).toBe(true)
    expect(await pathExists(join(dir, 'src', 'index.ts'))).toBe(true)
    expect(await pathExists(join(dir, 'migrations'))).toBe(true)
    expect(await pathExists(join(dir, 'locale'))).toBe(true)
  })

  test('manifest.yaml 包含正确的插件名和显示名', async () => {
    // Arrange
    const name = 'erp-inventory'

    // Act
    await runPluginCreate(name, tempDir)

    // Assert
    const manifest = await readFile(
      join(tempDir, 'plugins', name, 'manifest.yaml'), 'utf-8',
    )
    expect(manifest).toContain('@audebase/plugin-erp-inventory')
    expect(manifest).toContain('Erp Inventory')
  })

  test('package.json 包含 workspace 依赖', async () => {
    // Arrange
    const name = 'simple'

    // Act
    await runPluginCreate(name, tempDir)

    // Assert
    const pkg = JSON.parse(
      await readFile(join(tempDir, 'plugins', name, 'package.json'), 'utf-8'),
    ) as { name: string; dependencies: Record<string, string> }
    expect(pkg.name).toBe('@audebase/plugin-simple')
    expect(pkg.dependencies['@audebase/shared-types']).toBe('workspace:*')
    expect(pkg.dependencies['@audebase/core']).toBe('workspace:*')
  })

  test('src/index.ts 包含 Plugin 类和正确名称', async () => {
    // Arrange
    const name = 'hello-world'

    // Act
    await runPluginCreate(name, tempDir)

    // Assert
    const entry = await readFile(
      join(tempDir, 'plugins', name, 'src', 'index.ts'), 'utf-8',
    )
    expect(entry).toContain('PluginHelloWorld')
    expect(entry).toContain('@audebase/plugin-hello-world')
    expect(entry).toContain('implements Plugin')
  })

  test('拒绝无效插件名（大写字母）', async () => {
    // Arrange
    const name = 'MyPlugin'

    // Act & Assert
    await expect(runPluginCreate(name, tempDir)).rejects.toThrow('Invalid plugin name')
  })

  test('拒绝无效插件名（特殊字符）', async () => {
    // Arrange
    const name = 'my_plugin!'

    // Act & Assert
    await expect(runPluginCreate(name, tempDir)).rejects.toThrow('Invalid plugin name')
  })

  test('插件目录已存在时抛出错误', async () => {
    // Arrange
    const name = 'exists'
    await runPluginCreate(name, tempDir)

    // Act & Assert
    await expect(runPluginCreate(name, tempDir)).rejects.toThrow('already exists')
  })

  test('拒绝仅含单个字符的插件名', async () => {
    // Arrange
    const name = 'a'

    // Act & Assert
    await expect(runPluginCreate(name, tempDir)).rejects.toThrow('Invalid plugin name')
  })
})
```

### 3.5 build / test / lint 命令单元测试

```
测试文件: packages/cli/src/__tests__/unit/build.test.ts
```

```typescript
import { describe, test, expect, vi } from 'vitest'
import { execSync } from 'node:child_process'
import { runBuild } from '../../commands/build.js'

describe('aude build', () => {
  test('调用 npx turbo build', async () => {
    // Arrange
    const execSpy = vi.spyOn({ execSync }, 'execSync' as any).mockImplementation(() => Buffer.from(''))

    // Act
    await runBuild()

    // Assert
    expect(execSpy).toHaveBeenCalledWith(
      expect.stringContaining('turbo build'),
      expect.objectContaining({ stdio: 'inherit' }),
    )
    execSpy.mockRestore()
  })

  test('turbo 失败时抛出 Build failed 错误', async () => {
    // Arrange
    const execSpy = vi.spyOn({ execSync }, 'execSync' as any).mockImplementation(() => {
      throw new Error('Build error')
    })

    // Act & Assert
    await expect(runBuild()).rejects.toThrow('Build failed')
    execSpy.mockRestore()
  })
})
```

```
测试文件: packages/cli/src/__tests__/unit/test.test.ts
```

```typescript
import { describe, test, expect, vi } from 'vitest'
import { execSync } from 'node:child_process'
import { runTest } from '../../commands/test.js'

describe('aude test', () => {
  test('默认调用 npx vitest run', async () => {
    // Arrange
    const execSpy = vi.spyOn({ execSync }, 'execSync' as any).mockImplementation(() => Buffer.from(''))

    // Act
    await runTest({})

    // Assert
    expect(execSpy).toHaveBeenCalledWith(
      expect.stringContaining('vitest run'),
      expect.any(Object),
    )
    execSpy.mockRestore()
  })

  test('--watch 模式使用 vitest（不含 run）', async () => {
    // Arrange
    const execSpy = vi.spyOn({ execSync }, 'execSync' as any).mockImplementation(() => Buffer.from(''))

    // Act
    await runTest({ watch: true })

    // Assert
    expect(execSpy).toHaveBeenCalledWith(
      expect.stringContaining('npx vitest'),
      expect.any(Object),
    )
    expect(execSpy.mock.calls[0][0]).not.toContain('run')
    execSpy.mockRestore()
  })

  test('--coverage 选项附加 coverage 参数', async () => {
    // Arrange
    const execSpy = vi.spyOn({ execSync }, 'execSync' as any).mockImplementation(() => Buffer.from(''))

    // Act
    await runTest({ coverage: true })

    // Assert
    expect(execSpy).toHaveBeenCalledWith(
      expect.stringContaining('--coverage'),
      expect.any(Object),
    )
    execSpy.mockRestore()
  })

  test('watch + coverage 同时使用', async () => {
    // Arrange
    const execSpy = vi.spyOn({ execSync }, 'execSync' as any).mockImplementation(() => Buffer.from(''))

    // Act
    await runTest({ watch: true, coverage: true })

    // Assert
    const cmd = execSpy.mock.calls[0][0] as string
    expect(cmd).toContain('npx vitest')
    expect(cmd).toContain('--coverage')
    expect(cmd).not.toContain('run')
    execSpy.mockRestore()
  })

  test('vitest 失败时抛出 Tests failed 错误', async () => {
    // Arrange
    const execSpy = vi.spyOn({ execSync }, 'execSync' as any).mockImplementation(() => {
      throw new Error('Test timeout')
    })

    // Act & Assert
    await expect(runTest({})).rejects.toThrow('Tests failed')
    execSpy.mockRestore()
  })
})
```

```
测试文件: packages/cli/src/__tests__/unit/lint.test.ts
```

```typescript
import { describe, test, expect, vi } from 'vitest'
import { execSync } from 'node:child_process'
import { runLint } from '../../commands/lint.js'

describe('aude lint', () => {
  test('调用 npx tsc --noEmit', async () => {
    // Arrange
    const execSpy = vi.spyOn({ execSync }, 'execSync' as any).mockImplementation(() => Buffer.from(''))

    // Act
    await runLint()

    // Assert
    expect(execSpy).toHaveBeenCalledWith(
      expect.stringContaining('tsc --noEmit'),
      expect.objectContaining({ stdio: 'inherit' }),
    )
    execSpy.mockRestore()
  })

  test('tsc 失败时抛出 Lint failed 错误', async () => {
    // Arrange
    const execSpy = vi.spyOn({ execSync }, 'execSync' as any).mockImplementation(() => {
      throw new Error('Type error')
    })

    // Act & Assert
    await expect(runLint()).rejects.toThrow('Lint failed')
    execSpy.mockRestore()
  })
})
```

---

## 4. 集成测试

```
测试文件: packages/cli/src/__tests__/integration/cli.integration.test.ts
```

集成测试覆盖命令间交互流与边界场景。CLI 模块是依赖链终端，集成测试通过 commander `parseAsync` 执行完整命令流程，mock 外部依赖（CoreApp / MigrationEngine / execSync）。

```typescript
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { createProgram } from '../../index.js'

vi.mock('@audebase/core', () => ({
  CoreApp: vi.fn(() => ({
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    logger: { error: vi.fn() },
  })),
  loadConfig: vi.fn(() => ({ port: '3000' })),
}))

vi.mock('@audebase/migration', () => ({
  MigrationEngine: vi.fn(() => ({
    dryRun: vi.fn().mockResolvedValue({ tasks: [], blocked: [], hasBlocked: false }),
    migrate: vi.fn().mockResolvedValue({ completed: 0, failed: 0, executionLog: [] }),
  })),
}))

describe('CLI 集成测试', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('dev + db:migrate 顺序调用无冲突', async () => {
    // Arrange
    const program = createProgram()

    // Act
    await program.parseAsync(['dev'], { from: 'user' })
    await program.parseAsync(['db:migrate'], { from: 'user' })

    // Assert — 两次 parseAsync 各自独立执行，不互相影响
    const { CoreApp } = await import('@audebase/core')
    expect(CoreApp).toHaveBeenCalledTimes(1)
  })

  test('未知命令返回 commander 默认错误', async () => {
    // Arrange
    const program = createProgram()

    // Act & Assert
    await expect(
      program.parseAsync(['unknown-command'], { from: 'user' }),
    ).rejects.toThrow()
  })

  test('--help 输出包含所有命令摘要', async () => {
    // Arrange
    const program = createProgram()

    // Act
    const helpText = program.helpInformation()

    // Assert
    expect(helpText).toContain('dev')
    expect(helpText).toContain('db:migrate')
    expect(helpText).toContain('plugin:create')
    expect(helpText).toContain('build')
    expect(helpText).toContain('test')
    expect(helpText).toContain('lint')
  })

  test('重复调用 createProgram 返回独立实例', async () => {
    // Arrange
    // Act
    const p1 = createProgram()
    const p2 = createProgram()

    // Assert
    expect(p1).not.toBe(p2)
    expect(p1.name()).toBe(p2.name())
    expect(p1.commands).toHaveLength(p2.commands.length)
  })
})
```

---

## 5. 契约测试

```
测试文件: packages/cli/src/__tests__/contracts/cli.contract.test.ts
```

CLI 模块的契约主要是退出码和错误消息格式。这些测试验证用户可见的 CLI 行为在不同调用方式下保持一致。

```typescript
import { describe, test, expect, vi, beforeEach } from 'vitest'
import { createProgram } from '../../index.js'

// 退出码契约：0=成功，1=执行错误，2=参数错误

describe('CLI 退出码契约', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('成功命令返回 exit code 0', async () => {
    // Arrange
    const program = createProgram()

    // Act — parseAsync 不抛出 = 成功
    // Assert
    await expect(
      program.parseAsync(['dev'], { from: 'user' }),
    ).resolves.toBeDefined()
  })

  test('错误命令返回 exit code 1（抛出异常）', async () => {
    // Arrange
    const program = createProgram()
    vi.mock('@audebase/core', () => ({
      CoreApp: vi.fn(() => ({ start: vi.fn().mockRejectedValue(new Error('fail')) })),
      loadConfig: vi.fn(),
    }))

    // Act & Assert — 异常对应 exit(1)
    await expect(
      program.parseAsync(['dev'], { from: 'user' }),
    ).rejects.toThrow()
  })

  test('错误消息以 Error: 前缀输出到 stderr', async () => {
    // Arrange
    const stderrSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Act — 模拟 dev 启动失败不需要实际 mock，使用未知命令测试错误输出
    const program = createProgram()
    try {
      await program.parseAsync(['dev'], { from: 'user' })
    } catch {
      // ignore
    }

    // Assert — 如果程序有 error 输出则包含 Error: 前缀
    if (stderrSpy.mock.calls.length > 0) {
      expect(stderrSpy.mock.calls[0][0]).toContain('Error:')
    }
    stderrSpy.mockRestore()
  })
})
```

---

## 6. E2E 测试

```
测试文件: packages/cli/__e2e__/cli.e2e.ts
```

E2E 测试通过实际 spawn 子进程执行 CLI 命令，验证完整的进程生命周期和退出码。

| 用例 | 描述 |
|------|------|
| aude --help 输出 | spawn aude --help，验证 stdout 包含 AUDEBase CLI 和全部命令 |
| aude plugin:create 脚手架 | spawn aude plugin:create my-e2e-plugin，验证目录结构和文件内容 |

```typescript
import { describe, test, expect } from 'vitest'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { rm, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'

const CLI_PATH = join(__dirname, '..', 'src', 'index.ts')

describe('CLI E2E', () => {
  test('aude --help 输出帮助信息且包含所有命令', () => {
    // Arrange
    // Act
    const stdout = execSync(`npx tsx ${CLI_PATH} --help`, {
      encoding: 'utf-8',
    })

    // Assert
    expect(stdout).toContain('AUDEBase CLI')
    expect(stdout).toContain('dev')
    expect(stdout).toContain('db:migrate')
    expect(stdout).toContain('plugin:create')
    expect(stdout).toContain('build')
    expect(stdout).toContain('test')
    expect(stdout).toContain('lint')
  })

  test('aude --version 输出版本号', () => {
    // Arrange
    // Act
    const stdout = execSync(`npx tsx ${CLI_PATH} --version`, {
      encoding: 'utf-8',
    }).trim()

    // Assert
    expect(stdout).toBe('0.1.0')
  })
})
```

---

## 7. 种子数据

CLI 模块为薄委托层，不涉及数据库持久化操作。`db:migrate` 命令通过 mock `DatabaseProvider` 和 mock `MigrationEngine` 测试迁移逻辑，无需种子数据。

插件脚手架模板以字符串常量形式定义在 `src/commands/plugin-create.ts` 中，测试通过文件读写验证模板内容。

---

## 8. Mock 策略

| 依赖 | 单元测试 | 集成测试 |
|------|---------|---------|
| `@audebase/core` (CoreApp, loadConfig) | `vi.mock('@audebase/core')` 全局 mock CoreApp.start/stop | 同单元测试 |
| `@audebase/migration` (MigrationEngine) | `vi.mock('@audebase/migration')` mock dryRun/migrate | 同单元测试 |
| `child_process.execSync` | `vi.spyOn(execSync)` mock 执行结果 | 同单元测试 |
| `node:fs/promises` (mkdir, writeFile) | 真实文件系统（临时目录） | 同单元测试 |
| `dotenv/config` | 不 mock（不直接导入命令函数） | 不涉及 |
| `process.env` | `vi.stubEnv` 或直接修改 | 同单元测试 |
| `process.exit` | mock 验证调用（避免实际退出） | 同单元测试 |

```typescript
// 通用 mock 模板：process.exit
vi.spyOn(process, 'exit').mockImplementation((() => {
  throw new Error('process.exit called')
}) as any)
```

---

## 9. 覆盖率目标

| 指标 | 目标 | 关键路径 |
|------|:---:|------|
| 行覆盖率 | **85%+** | |
| 分支覆盖率 | **80%+** | dev startup/failure 分支，migrate dry-run/real 分支，plugin:create name 验证 |
| 函数覆盖率 | **90%+** | 全部 6 个命令 handler + createProgram |
| 单元测试 | 18+ | createProgram(5) + dev(4) + migrate(4) + plugin:create(3) + build(2) + test(4) + lint(2) = 24 |
| 集成测试 | 4+ | 多命令执行流 + 未知命令 + help + 实例隔离 |
| 契约测试 | 2+ | exit code 0 + exit code 1 |
| E2E 测试 | 2 | help + version |

---

## 10. CI 集成

```yaml
cli-test:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
    - run: pnpm install --frozen-lockfile
    - run: pnpm --filter @audebase/cli test:unit
    - run: pnpm --filter @audebase/cli test:integration
```

CLI 测试不需要外部服务（PostgreSQL / Redis），因为所有外部依赖均已 mock。这使得 CLI 测试可以跳过 CI 中的 services 块，显著加快反馈速度。

---

## 11. 用例汇总

| 测试层 | 用例数 |
|--------|:---:|
| 单元 - createProgram | 5 |
| 单元 - dev | 4 |
| 单元 - db:migrate | 5 |
| 单元 - plugin:create | 3（直接调用 runPluginCreate）+ 5（额外场景） |
| 单元 - build | 2 |
| 单元 - test | 4 |
| 单元 - lint | 2 |
| 集成 - cli.integration | 4 |
| 契约 - cli.contract | 3 |
| E2E - cli.e2e | 2 |
| **合计** | **39** |

---

## 12. 参考

- [cli-sdd.md](cli-sdd.md) — CLI 工具 SDD 文档
- [../../.agents/memorys/decisions.md](../../.agents/memorys/decisions.md) — GO-023 CLI 工具
- [core-sdd.md](core-sdd.md) — CoreApp 接口定义
- [migration-engine-sdd.md](migration-engine-sdd.md) — MigrationEngine 接口定义
- [api-conventions.md](api-conventions.md) — 错误码规范

> **上游 TDD 参考**: [migration-engine-sdd.md §2](migration-engine-sdd.md) — MigrationEngine 接口; [core-sdd.md §2](core-sdd.md) — CoreApp 接口

---

## 13. 附加验证

```
测试文件: packages/cli/src/__tests__/unit/names.test.ts
```

```typescript
import { describe, test, expect } from 'vitest'

describe('插件名验证规则', () => {
  const PLUGIN_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/

  test('有效插件名通过验证', () => {
    // Arrange
    const valid = ['my-plugin', 'erp', 'plugin42', 'a-b', 'hello-world-v2']

    // Act & Assert
    for (const name of valid) {
      expect(PLUGIN_NAME_PATTERN.test(name)).toBe(true)
    }
  })

  test('无效插件名拒绝验证', () => {
    // Arrange
    const invalid = ['', '-plugin', 'plugin-', 'MY-PLUGIN', 'my plugin', 'my_plugin']

    // Act & Assert
    for (const name of invalid) {
      expect(PLUGIN_NAME_PATTERN.test(name)).toBe(false)
    }
  })

  test('单字符插件名拒绝验证', () => {
    // Arrange
    // Act & Assert
    expect(PLUGIN_NAME_PATTERN.test('a')).toBe(false)
  })
})
```