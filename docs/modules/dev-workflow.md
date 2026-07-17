# AUDEBase 插件开发工作流 & 测试策略

> **创建日期**: 2026-07-13  
> **目的**: 插件开发者的端到端工作流（创建→测试→调试）+ Monorepo 结构。  
> **来源于**: 发现 #25（Monorepo 包结构）+ #26（配置管理）+ #28（Plugin Dev Workflow）+ #29（测试策略）。

---

## 1. Monorepo 包结构

### 1.1 目录结构（9 包）

```
AUDEBase/
├── .env                    # 本地环境变量（复制自 .env.template，Git 忽略）
├── .env.template           # 环境变量模板（Git 跟踪）
├── turbo.json              # Turborepo 构建配置
├── pnpm-workspace.yaml     # pnpm workspace 定义
├── package.json            # 根 package: workspace scripts
├── tsconfig.base.json      # 共享 tsconfig
├── vitest.workspace.ts     # Vitest workspace 配置
│
├── packages/
│   ├── core/               # @audebase/core — 框架内核
│   │   ├── src/
│   │   │   ├── index.ts           # Fastify app + PluginManager + Health + Logging
│   │   │   ├── plugin-manager.ts  # 插件发现与加载
│   │   │   ├── plugin-host.ts     # InlinePluginHost（含 JSON 序列化断言）
│   │   │   ├── db.ts              # Drizzle + DatabaseProvider
│   │   │   ├── config.ts          # 环境变量加载与校验（@fastify/env）
│   │   │   ├── middleware/
│   │   │   │   ├── error-handler.ts  # 全局错误中间件
│   │   │   │   ├── request-id.ts     # X-Request-ID 注入
│   │   │   │   └── rate-limit.ts     # 速率限制
│   │   │   └── __tests__/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── vitest.config.ts
│   │
│   ├── shared-types/       # @audebase/shared-types — 所有共享接口
│   │   ├── src/
│   │   │   ├── index.ts           # barrel export
│   │   │   ├── plugin.types.ts    # Plugin, PluginHost, Manifest 接口
│   │   │   ├── rbac.types.ts      # User, Role, Permission 类型
│   │   │   ├── api.types.ts       # ApiResponse<T>, PaginatedResponse<T>
│   │   │   └── errors.ts          # ErrorCode 枚举 + UserError/SystemError 类
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── rbac/               # @audebase/rbac — RBAC 引擎 + 中间件
│   │   ├── src/
│   │   │   ├── index.ts           # RBAC Plugin（注册中间件）
│   │   │   ├── middleware.ts      # ACL 检查中间件
│   │   │   ├── service.ts         # RBACService（can/assignRole/revokeRole）
│   │   │   └── __tests__/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── vitest.config.ts
│   │
│   ├── audit/              # @audebase/audit — 审计日志 + 中间件
│   │   ├── src/
│   │   │   ├── index.ts           # Audit Plugin
│   │   │   ├── middleware.ts      # 写操作自动记录
│   │   │   ├── service.ts         # AuditService（log/query）
│   │   │   └── __tests__/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── vitest.config.ts
│   │
│   ├── migration/          # @audebase/migration — 迁移引擎
│   │   ├── src/
│   │   │   ├── index.ts           # Migration Plugin
│   │   │   ├── engine.ts          # 三阶段执行（preload/postsync/postload）
│   │   │   ├── scanner.ts         # 扫描 migrations/{version}/ 目录
│   │   │   ├── history.ts         # migration_history 表操作
│   │   │   └── __tests__/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── vitest.config.ts
│   │
│   ├── cli/                # @audebase/cli — aude CLI
│   │   ├── src/
│   │   │   ├── index.ts           # CLI 入口（commander）
│   │   │   ├── commands/
│   │   │   │   ├── dev.ts         # aude dev
│   │   │   │   ├── migrate.ts     # aude db:migrate
│   │   │   │   └── plugin-create.ts # aude plugin:create
│   │   │   └── __tests__/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── vitest.config.ts
│   │
│   ├── i18n/               # @audebase/i18n — 国际化引擎
│   │   ├── src/
│   │   │   ├── index.ts           # i18n Plugin
│   │   │   ├── t.ts               # t() 函数（Core 注入 PluginHost context）
│   │   │   ├── loader.ts          # locale/{lang}.json 加载器
│   │   │   └── __tests__/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── vitest.config.ts
│   │
│   ├── plugin-core/        # @audebase/plugin-core — Bootstrap 插件
│   │   ├── src/
│   │   │   └── index.ts           # PluginCore 类 + install()
│   │   ├── manifest.yaml          # D1.5 插件声明
│   │   ├── locale/
│   │   │   └── zh-CN.json
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── vitest.config.ts
│   │
│   └── admin-ui/           # @audebase/admin-ui — React Admin SPA
│       ├── src/
│       │   ├── main.tsx           # Vite entry
│       │   ├── App.tsx            # Provider Stack + ProLayout
│       │   ├── pages/
│       │   │   ├── LoginPage.tsx
│       │   │   ├── plugins/
│       │   │   │   └── PluginListPage.tsx
│       │   │   ├── users/
│       │   │   │   └── UserListPage.tsx
│       │   │   ├── roles/
│       │   │   │   └── RoleListPage.tsx
│       │   │   └── audit/
│       │   │       └── AuditLogPage.tsx
│       │   ├── providers/
│       │   │   ├── TenantProvider.tsx
│       │   │   ├── UserProvider.tsx
│       │   │   └── ACLProvider.tsx
│       │   └── components/
│       │       ├── ACLGuard.tsx
│       │       └── ErrorFallback.tsx
│       ├── index.html
│       ├── package.json
│       ├── tsconfig.json
│       ├── vite.config.ts
│       └── vitest.config.ts
│
└── plugins/                # 本地开发插件目录（Git 忽略，aude plugin:create 创建于此）
    └── hello/              # 示例: @my/plugin-hello
        ├── src/
        │   └── index.ts
        ├── manifest.yaml
        ├── locale/
        │   └── zh-CN.json
        └── package.json
```

### 1.2 包依赖图

```
shared-types ◄── core ◄── rbac
    ▲          ▲  ▲     ▲
    │          │  │     │
    ├──────────┘  │     ├── audit
    │             │     ├── migration
    │             │     ├── i18n
    │             │     ├── cli
    │             │     └── plugin-core
    │             │
    └─────────────┴─────────── admin-ui (types only)
```

| 包 | 依赖 | 责任人 |
|----|------|:---:|
| `shared-types` | 无 | 所有人（提交前协调） | User, Role, Permission, Plugin, Manifest, ErrorCode, ApiResponse, PaginationMeta |
| `core` | shared-types | Person A |
| `cli` | core, shared-types | Person A |
| `rbac` | core, shared-types | Person C |
| `audit` | core, shared-types | Person C |
| `migration` | core, shared-types | Person B |
| `i18n` | core, shared-types | Person A |
| `plugin-core` | core, shared-types | Person B |
| `admin-ui` | shared-types | Person D |

### 1.3 命名约定

| 项目 | 约定 |
|------|------|
| npm scope | `@audebase/` |
| Framework 包 | `@audebase/{name}` |
| 插件包 | `@audebase/plugin-{name}` |
| 用户插件 | `@my/plugin-{name}`（非 scope 约定，package.json name 字段） |

---

## 2. 插件开发工作流

### 2.1 创建插件

```bash
# Phase 1a: CLI 脚手架生成插件骨架
npx aude plugin:create @audebase/plugin-hello
# 输出:
#   ✅ Created plugins/hello/
#   ✅   src/index.ts (Plugin class)
#   ✅   manifest.yaml (template)
#   ✅   locale/zh-CN.json
#   ✅   package.json
```

**脚手架产出文件**:

`src/index.ts`:
```typescript
import { Plugin } from '@audebase/core'

export default class HelloPlugin extends Plugin {
  async load(): Promise<void> {
    this.logger.info('HelloPlugin loaded')
  }
}
```

`manifest.yaml`:
```yaml
name: @audebase/plugin-hello
version: 0.1.0
display_name: Hello 插件
description: 示例插件
category: demo
license: MIT
entry: src/index.ts
dependencies: []
runtime:
  mode: inline
  partition: SYSTEM
```

### 2.2 开发服务器

```bash
# 启动开发服务器（自动发现 packages/plugin-* + plugins/* 目录）
npx aude dev

# Watch 模式：文件变更 → PluginManager.reload(plugin)
npx aude dev --watch

# 开启 Node.js inspector 调试
npx aude dev --watch --inspect

# 完整开发命令
AUDE_DEV=1 npx aude dev --watch --inspect --strict-plugin-host
```

**Watch 模式行为**（基于 chokidar）:

| 事件 | 触发动作 |
|------|----------|
| 插件 `src/*.ts` 文件变更 | `PluginManager.reload(plugin)` — 重新执行 beforeLoad → load |
| `manifest.yaml` 变更 | 完整重载（re-add → load） |
| `locale/*.json` 新增 | 翻译表增量更新 |
| Core 框架文件变更 | 不支持热重载（需手动重启 `aude dev`） |

**PluginManager.reload() 约束**:
- 仅开发模式生效（`AUDE_DEV=1`）
- 跳过 `install()` 钩子（避免重复创建 Bootstrap 数据）
- 保持 `afterEnable` 状态（不触发状态切换）
- 失败时输出错误日志但不阻塞进程

### 2.3 调试

```
Chrome DevTools → chrome://inspect → Open dedicated DevTools for Node
  ├── 断点调试: src/index.ts 中设断点
  ├── Console: 测试 `await app.pluginManager.getPlugin('hello').unload()`
  └── Network: 无（后端调试，非网络）

VS Code → .vscode/launch.json:
  {
    "type": "node",
    "request": "attach",
    "name": "Attach to AUDEBase",
    "port": 9229,
    "restart": true
  }
  
  启动: AUDE_DEV=1 npx aude dev --inspect → VS Code F5 附加
```

---

## 3. 测试策略

### 3.1 测试金字塔

```
         ┌──────────────┐
         │  E2E (20%)    │  Playwright: 登录 + 插件管理 + 用户管理 + RBAC
         ├──────────────┤
         │  集成 (30%)   │  Fastify.inject(): auth → rbac → audit 链路
         ├──────────────┤
         │  单元 (50%)   │  Vitest: PluginManager, migration engine, RBAC 检查器
         └──────────────┘
```

### 3.2 覆盖率门禁

| 阶段 | 覆盖率 | 说明 |
|------|:---:|------|
| Phase 1a | **60% lines** | MVP 放宽，核心路径 80%（PluginManager / RBAC / Migration） |
| Phase 1b+ | **80% lines** | 全局门禁，CI 强制 |

**Phase 1a 核心路径要求 80%**:

| 模块 | 文件 | 最低要求 |
|------|------|:---:|
| core | plugin-manager.ts | 80% |
| rbac | middleware.ts | 80% |
| migration | engine.ts | 80% |
| audit | middleware.ts | 60% |
| core | db.ts | 60% |

### 3.3 Test Harness (`@audebase/test-utils`)

Phase 1a 将 `test-utils` 内嵌在 `core/src/__tests__/test-utils.ts`，Phase 1b 独立为包。

```typescript
// core/src/__tests__/test-utils.ts
import { buildApp } from '@audebase/core'
import { FastifyInstance } from 'fastify'
import { sql } from 'drizzle-orm'

interface TestApp {
  app: FastifyInstance
  db: DatabaseProvider
  cleanup: () => Promise<void>
}

// 创建隔离的测试 App 实例
export async function createTestApp(): Promise<TestApp> {
  const app = await buildApp({ testing: true })
  const db = app.di.get('db')

  // 开启事务
  await db.execute(sql`BEGIN`)

  return {
    app,
    db,
    cleanup: async () => {
      // 回滚事务 → 测试数据自动丢弃（Odoo SavepointCase 模式）
      await db.execute(sql`ROLLBACK`)
      await app.close()
    }
  }
}

// 创建内存插件（无需文件系统）
export function createTestPlugin(overrides: Partial<PluginManifest>): PluginManifest {
  return {
    name: '@test/plugin',
    version: '0.0.0',
    display_name: 'Test Plugin',
    runtime: { mode: 'inline', partition: 'SYSTEM' },
    ...overrides,
  }
}
```

**使用示例**:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestApp } from '../test-utils'

describe('RBAC Middleware', () => {
  let test: TestApp

  beforeEach(async () => {
    test = await createTestApp()
  })

  afterEach(async () => {
    await test.cleanup()
  })

  it('should return 403 if user lacks permission', async () => {
    const res = await test.app.inject({
      method: 'POST',
      url: '/api/users',
      headers: { authorization: `Bearer ${memberToken}` },
      payload: { username: 'newuser', password: 'Test1234' }
    })
    expect(res.statusCode).toBe(403)
  })
})
```

### 3.4 测试命令

```bash
# 运行所有测试
pnpm test

# 运行特定包
pnpm --filter @audebase/core test

# Watch 模式
pnpm --filter @audebase/core test -- --watch

# 覆盖率报告
pnpm test:coverage

# E2E tests (requires dev server)
pnpm test:e2e

> See [e2e-test-flows.md](e2e-test-flows.md) for Phase 1a flow specs.

### 3.5 测试文件约定

| 约定 | 说明 |
|------|------|
| 位置 | 与源文件同目录的 `__tests__/` |
| 命名 | `*.test.ts`（单元/集成）、`*.e2e.ts`（E2E） |
| 框架 | Vitest（单元/集成）、Playwright（E2E） |
| 模式 | AAA（Arrange-Act-Assert） |
| Mock | 优先使用 vitest mock，避免 jest-mock-extended 等额外依赖 |
| 测试数据 | 每个测试独立创建，依赖 test harness 事务回滚清理 |


### 3.6 Admin UI 组件测试（React Testing Library）

`@audebase/admin-ui` 包的组件测试使用 Vitest + React Testing Library (RTL) 生态系统。

**依赖**:

```bash
pnpm --filter @audebase/admin-ui add -D \
  @testing-library/react@^16.0.0 \
  @testing-library/jest-dom@^6.0.0 \
  @testing-library/user-event@^14.0.0
```

**`admin-ui/src/test/setup.ts`**:

```typescript
import '@testing-library/jest-dom'

// 抑制 antd 5 CSS-in-JS console 噪音（测试环境不需要样式计算）
const originalWarn = console.warn
console.warn = (...args: unknown[]) => {
  const msg = String(args[0])
  if (msg.includes('[@ant-design/cssinjs]') || msg.includes('findDOMNode')) {
    return
  }
  originalWarn(...args)
}
```

**`admin-ui/vitest.config.ts`**:

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
```

**基础渲染测试 — `PluginListPage` 空状态**:

```typescript
// admin-ui/src/pages/plugins/PluginListPage.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import PluginListPage from './PluginListPage'

// Mock ProTable 数据源 — 返回空插件列表
vi.mock('../../api/plugins', () => ({
  fetchPlugins: vi.fn().mockResolvedValue({ data: [], total: 0 }),
}))

describe('PluginListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders empty state when no plugins are installed', async () => {
    render(<PluginListPage />)

    await waitFor(() => {
      expect(screen.getByText('暂无插件')).toBeInTheDocument()
    })
  })
})
```

**ACL 感知测试 — 角色可见性**:

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ACLProvider, ACLProviderProps } from '../../providers/ACLProvider'
import { PluginListPage } from './PluginListPage'

interface MockACLWrapperProps {
  permissions: string[]
  children: React.ReactNode
}

function MockACLWrapper({ permissions, children }: MockACLWrapperProps) {
  const mockContext: ACLProviderProps = {
    permissions: new Set(permissions),
    can: (action: string) => permissions.includes(action),
    canRoute: (route: string) => permissions.includes(route),
    loading: false,
  }
  return <ACLProvider.Provider value={mockContext}>{children}</ACLProvider.Provider>
}

describe('PluginListPage — ACL', () => {
  it('shows Enable button when user has plugin:manage permission', () => {
    render(
      <MockACLWrapper permissions={['plugin:manage']}>
        <PluginListPage />
      </MockACLWrapper>
    )

    const enableButton = screen.queryByRole('button', { name: /启用/ })
    expect(enableButton).toBeInTheDocument()
  })

  it('hides Enable button when user lacks plugin:manage permission', () => {
    render(
      <MockACLWrapper permissions={[]}>
        <PluginListPage />
      </MockACLWrapper>
    )

    const enableButton = screen.queryByRole('button', { name: /启用/ })
    expect(enableButton).not.toBeInTheDocument()
  })
})
```

**ACL 测试要点**（参见 D19）:
- 使用 `ACLProvider.Provider` 直接注入 mock context，不依赖完整 Provider Stack
- `permissions` 使用 `Set<string>` 以匹配 `useACL().can()` 内部实现
- 权限粒度测试应覆盖：菜单可见性（`canRoute`）、操作按钮可见性（`can`）、字段可见性（D11，Phase 1.5）
- `ACLGuard` 组件可独立测试：无权限时 children 不渲染，`fallback` 渲染指定组件

**测试文件约定**:

| 约定 | 值 |
|------|-----|
| 位置 | `admin-ui/src/**/__tests__/` 或与组件文件同目录 `*.test.tsx` |
| 命名 | `*.test.tsx`（组件）、`*.test.ts`（工具函数/hooks） |
| 框架 | Vitest + jsdom + React Testing Library |
| 模式 | AAA（Arrange-Act-Assert），每个测试独立 setup |
| Mock | `vi.mock()` 隔离 API 层，不发起真实网络请求 |
| 查询优先级 | `getByRole` > `getByLabelText` > `getByText` > `getByTestId`（遵循 RTL 最佳实践） |

### 3.7 UI 交互测试强制规范（2026-07-17 新增）

> **背景**: Phase 1b 发现所有 Admin UI 页面按钮无 onClick、测试仅验证元素存在不验证行为。此规范强制要求所有 UI 功能必须包含交互测试。

#### 3.7.1 交互元素强制规则

- **所有可交互 UI 元素**（按钮、链接、表单提交、菜单项）**必须**绑定 `onClick`/`onSubmit`/`onChange` 等事件处理器，对接真实业务逻辑或 API 调用
- **禁止**渲染纯展示按钮（无 `onClick` 的 `<Button>` 等同于死代码）
- **禁止**使用 `ponytail: mock returns empty array` 替代真实 API 调用--mock 仅限测试环境，生产代码必须调用后端 API
- **AI 代理新增功能时**：每个新页面/组件必须同步编写以下全部测试类型，缺一不可

#### 3.7.2 单元测试强制清单（React Testing Library）

对于每个 UI 页面/组件，以下测试为 **MANDATORY**（非可选）：

| 测试类型 | 要求 | 工具 | 反模式（禁止） |
|---------|------|------|---------------|
| 渲染测试 | 页面正常渲染、数据显示正确 | `render()` + `screen.getByText()` | 仅 `toBeTruthy()` |
| **交互测试** | **`fireEvent.click(button)` 或 `userEvent.click(button)` 验证点击触发预期行为** | RTL `fireEvent`/`userEvent` | ❌ 仅检查按钮存在不检查点击 |
| API 调用测试 | 点击按钮后验证 mock API 被调用（`expect(mockFn).toHaveBeenCalledWith(...)`） | `vi.mock()` + `expect` | ❌ 不 mock API 导致真实网络请求 |
| 表单提交测试 | 填写表单 + 提交 + 验证 API 调用参数 | `userEvent.type()` + `fireEvent.submit()` | ❌ 不填表单直接断言 |
| 错误状态测试 | API 返回错误时验证错误提示展示 | mock API reject + `screen.findByText` | ❌ 仅测 happy path |
| 空状态测试 | 无数据时验证空状态 UI | mock API return `[]` | ❌ 跳过空状态 |

#### 3.7.3 E2E 测试强制清单（Playwright）

对于每个 CRUD 资源（用户/角色/插件等），以下 E2E 流程为 **MANDATORY**：

| 流程 | 操作 | 验证 |
|------|------|------|
| 列表查看 | 登录 -> 导航到列表页 | 表格渲染、数据可见 |
| **创建** | 点击创建按钮 -> 填写表单 -> 提交 | 新记录出现在列表 |
| **编辑** | 点击编辑按钮 -> 修改字段 -> 保存 | 列表数据更新 |
| **删除** | 点击删除按钮 -> 确认 | 记录从列表消失 |

#### 3.7.4 测试命名约定

- 交互测试: `test('clicks create button opens modal/form')`
- API 调用测试: `test('submitting form calls create API with correct payload')`
- 错误状态: `test('shows error message when API returns 400')`
- 空状态: `test('renders empty state when no data available')`
- E2E: `test('user can create and delete a role')`

#### 3.7.5 禁止的反模式

```typescript
// ❌ FORBIDDEN: 仅验证按钮存在
const button = container.querySelector('button')
expect(button).toBeTruthy()

// ❌ FORBIDDEN: 按钮 onClick 为空或 undefined
<Button>创建用户</Button>  // 无 onClick

// ❌ FORBIDDEN: mock 数据替代真实 API
const useExtensions = () => { return [] }  // ponytail: mock

// ✅ CORRECT: 验证点击行为
const handleClick = vi.fn()
render(<Button onClick={handleClick}>创建</Button>)
fireEvent.click(screen.getByRole('button', { name: /创建/ }))
expect(handleClick).toHaveBeenCalledOnce()

// ✅ CORRECT: 验证 API 调用
const mockCreate = vi.fn().mockResolvedValue({ id: '1' })
vi.mock('../../api/users', () => ({ createUser: mockCreate }))
// ... render form, fill, submit ...
expect(mockCreate).toHaveBeenCalledWith({ username: 'test', email: 'test@test.com' })
```

#### 3.7.6 AI 代理工作流集成

AI 代理在新增 UI 功能时必须：
1. **编码前**: SDD 中声明所有交互元素及其预期行为
2. **编码时**: 每个交互元素必须绑定事件处理器
3. **测试时**: 按 §3.7.2 清单逐项编写单元测试
4. **E2E 时**: 按 §3.7.3 清单覆盖完整 CRUD 流程
5. **提交前**: 验证所有测试通过，覆盖率达标

---

## 4. 配置管理（Phase 1a）

### 4.1 环境变量

参见项目根目录 `.env.template` — Phase 1a 全量环境变量模板。

**关键规则**:
- `AUDE_JWT_SECRET` 启动时 assert 非空且 ≥32 字符，否则拒绝启动
- `AUDE_DEV=1` 启用 chokidar watch + 详细日志
- `AUDE_STRICT_PLUGIN_HOST=1` 强制 PluginHost mock JSON 序列化往返断言

### 4.2 配置加载优先级（Phase 1b+）

```
环境变量 > 租户 JSON (config/{tenant_id}.json) > 插件 JSON > 全局 default.json
```

Phase 1a 仅使用环境变量，JSON 配置文件在 Phase 1b 引入。

---

## 参考

- 架构决策: `../../.agents/memorys/decisions.md` — D1, D1.2, D1.4, D1.7
- Monorepo 包结构: 本文 §1
- 插件框架: [plugin-framework.md](plugin-framework.md)
- API 约定: [api-conventions.md](api-conventions.md)
- Frontend Spec: [frontend-spec.md](frontend-spec.md)
- Phase 划分: [phase-planning.md](../phase-planning.md)
- Seed Data Strategy: [test-seed-strategy.md](test-seed-strategy.md)