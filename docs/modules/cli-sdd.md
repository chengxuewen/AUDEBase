# CLI 工具 SDD - Phase 1a

**决策编号**: GO-023
**对应模块**: `packages/cli/` (`@audebase/cli`)
**状态**: 📋 SDD 完成

## 1. 概要

### 1.1 模块定位

AUDEBase CLI 工具（`aude`）是开发者与平台交互的命令行入口。它封装了开发服务器启动、数据库迁移、插件脚手架生成、构建/测试/lint 委托等操作，提供统一的开发者体验。

### 1.2 职责边界

| 职责 | 说明 |
|------|------|
| 开发服务器启动 | `aude dev` - 启动 Core + Admin UI watch 模式（Phase 1a 为 stub） |
| 数据库迁移 | `aude db:migrate [--dry-run]` - 调用 MigrationEngine |
| 插件脚手架 | `aude plugin:create <name>` - 生成插件目录结构 + manifest.yaml |
| 构建委托 | `aude build` - 委托 turbo |
| 测试委托 | `aude test` - 委托 vitest |
| Lint 委托 | `aude lint` - 委托 tsc --noEmit |

### 1.3 设计目标

- **薄委托层**: CLI 命令仅做参数解析和委托调用，业务逻辑在 Core/Migration 等包中
- **用户友好**: 清晰的错误消息、退出码、帮助文本
- **可测试**: 命令处理函数可独立测试，不依赖全局进程状态
- **零外部依赖（除 commander）**: 不引入 chalk/ora 等美化库

### 1.4 技术选型

| 技术 | 选择 | 理由 |
|------|------|------|
| CLI 框架 | commander ^12.0.0 | Node.js 生态标准 CLI 库，类型支持完善 |
| 着色 | 不使用 | Phase 1a 保持零依赖，console.log 原生输出 |
| 环境变量 | Node.js 原生 `process.env` | 不引入 dotenv，Phase 1a 通过 Core config 加载 |

## 2. 接口定义

### 2.1 CLI 入口

```typescript
// packages/cli/src/index.ts

#!/usr/bin/env node

import { Command } from 'commander'

export const program: Command = createProgram()

function createProgram(): Command {
  const program = new Command()
  program
    .name('aude')
    .description('AUDEBase CLI - Enterprise application platform')
    .version('0.1.0')
  // Commands registered via register* functions
  return program
}
```

### 2.2 命令定义

#### `aude dev`

```typescript
interface DevCommandOptions {
  port?: number    // --port <number>, 默认 3000
  inspect?: boolean // --inspect, 启用 Node.js inspector
}

// 注册签名
program.command('dev')
  .description('Start development server (Core + Admin UI)')
  .option('-p, --port <number>', 'server port', '3000')
  .option('--inspect', 'enable Node.js inspector')
  .action(async (options: DevCommandOptions): Promise<void>)
```

#### `aude db:migrate`

```typescript
interface MigrateCommandOptions {
  dryRun?: boolean  // --dry-run, 预检模式
  plugin?: string   // --plugin <name>, 仅迁移指定插件
}

// 注册签名
program.command('db:migrate')
  .description('Run database migrations')
  .option('--dry-run', 'dry-run mode (no SQL executed)')
  .option('-p, --plugin <name>', 'migrate only specified plugin')
  .action(async (options: MigrateCommandOptions): Promise<void>)
```

#### `aude plugin:create <name>`

```typescript
// 注册签名
program.command('plugin:create <name>')
  .description('Scaffold a new plugin')
  .action(async (name: string): Promise<void>)
```

#### `aude build`

```typescript
// 注册签名
program.command('build')
  .description('Build all packages (turbo)')
  .action(async (): Promise<void>)
```

#### `aude test`

```typescript
interface TestCommandOptions {
  watch?: boolean  // --watch
  coverage?: boolean // --coverage
}

// 注册签名
program.command('test')
  .description('Run all tests')
  .option('-w, --watch', 'watch mode')
  .option('--coverage', 'coverage report')
  .action(async (options: TestCommandOptions): Promise<void>)
```

#### `aude lint`

```typescript
// 注册签名
program.command('lint')
  .description('Run linter (tsc --noEmit)')
  .action(async (): Promise<void>)
```

### 2.3 退出码

| 退出码 | 含义 |
|--------|------|
| 0 | 成功 |
| 1 | 执行错误（迁移失败、构建失败等） |
| 2 | 参数解析错误（commander 默认） |

## 3. 生命周期

### 3.1 CLI 启动流程

```
1. Node.js 执行 src/index.ts (shebang #!/usr/bin/env node)
2. createProgram() 创建 commander Program 实例
3. 注册所有命令（dev, db:migrate, plugin:create, build, test, lint）
4. program.parse(process.argv) 解析命令行参数
5. commander 路由到对应 command action
6. action 执行：
   a. 解析选项
   b. 调用对应包 API（MigrationEngine, child_process.execSync 等）
   c. 输出结果到 stdout/stderr
   d. process.exit(0) 或 process.exit(1)
```

### 3.2 错误处理流程

```
1. 命令 action 中 try/catch 捕获所有错误
2. 错误消息输出到 stderr（console.error）
3. process.exit(1)
4. commander 自身参数错误由 commander 处理（输出 help + exit 2）
```

## 4. 依赖关系

### 4.1 包依赖

| 依赖包 | 用途 |
|--------|------|
| `@audebase/shared-types` | 共享类型（如需要） |
| `@audebase/core` | Core 日志/健康检查 API（Phase 1a 仅类型依赖） |
| `@audebase/migration` | MigrationEngine 用于 `aude db:migrate` |
| `commander` ^12.0.0 | CLI 框架 |

### 4.2 运行时依赖（通过 child_process）

| 命令 | 委托目标 |
|------|----------|
| `aude build` | `turbo build` (via execSync) |
| `aude test` | `vitest run` (via execSync) |
| `aude lint` | `tsc --noEmit` (via execSync) |

### 4.3 依赖图位置

```
shared-types ◄── core ◄── cli
                     ▲
                     │
                 migration
```

CLI 依赖 core 和 migration，但不被其他包依赖。CLI 是依赖链的终端。

## 5. 错误码与错误处理

### 5.1 错误类型

| 错误场景 | 处理方式 | 退出码 |
|----------|----------|--------|
| 迁移执行失败 | 输出失败详情 + exit(1) | 1 |
| 迁移 dry-run 发现阻塞 | 输出阻塞列表 + exit(1) | 1 |
| 插件目录已存在 | 输出错误消息 + exit(1) | 1 |
| 构建/测试/lint 失败 | execSync 抛错被捕获 + exit(1) | 1 |
| commander 参数错误 | commander 自动处理 | 2 |
| 未知命令 | commander 自动处理 | 2 |

### 5.2 错误消息规范

- 所有错误消息以 `Error:` 前缀输出到 stderr
- 包含足够的上下文信息（哪个插件、哪个阶段失败）
- 不暴露内部堆栈（Phase 1a 简单输出 error.message）

## 6. 安全考虑

### 6.1 命令注入防护

- `aude build/test/lint` 使用 `execSync` 执行固定命令，不接受用户输入拼接
- `aude plugin:create <name>` 对插件名进行校验（仅允许 `[a-z0-9-]`），防止路径遍历

### 6.2 文件系统操作

- `aude plugin:create` 仅在 `plugins/` 目录下创建，不写任意路径
- 创建目录前检查是否已存在，拒绝覆写

### 6.3 环境变量

- CLI 不直接读取敏感环境变量（JWT secret 等）
- `aude dev` 启动 Core 时由 Core config 负责环境变量校验

## 7. Mock 约束

### 7.1 测试策略

- CLI 命令测试使用 `commander` 的 `Command` 实例，不依赖全局 `process.argv`
- 测试通过直接调用 `program.parseAsync(['node', 'aude', ...args])` 执行命令
- `execSync` 调用通过 mock 替换，避免实际执行构建命令
- `MigrationEngine` 通过注入 mock `DatabaseProvider` 测试

### 7.2 Mock 接口约束

```typescript
// 测试用 mock DatabaseProvider
const mockDb: DatabaseProvider = {
  execute: async (_sql: string) => undefined,
  insert: async (_table: string, _data: Record<string, unknown>) => undefined,
  query: {
    migration_history: {
      findMany: async () => [],
    },
  },
}
```

### 7.3 文件系统测试

- `plugin:create` 测试使用临时目录（`os.tmpdir()` + `crypto.randomUUID()`）
- 测试后清理临时目录

## 8. 变更记录

| 日期 | 变更 | 作者 |
|------|------|------|
| 2026-07-16 | SDD 创建 - Phase 1a 初始版本 | AI Agent |
