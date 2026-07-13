# AUDEBase 前端规范 — Admin UI 路由 & Build Output

> **创建日期**: 2026-07-13  
> **目的**: Admin UI 路由结构、菜单层级、权限绑定、Build Output 组织结构、Core 运行时插件加载。  
> **来源于**: 发现 #30（Admin UI 路由结构）+ 发现 #31（Build Output 结构）。

> **责任人**: Person D</
---

## 1. Admin UI 路由结构

### 1.1 Phase 1a 路由表（4 页 + 登录）

| 路径 | 菜单标签 | 权限 | 组件 | 说明 |
|------|----------|------|------|------|
| `/admin/auth/login` | — | 无 | `LoginPage` | 无 ProLayout 外层（独立布局） |
| `/admin` | 首页 | — | `DashboardRedirect` | 自动跳转 `/admin/settings/plugins` |
| `/admin/settings` | 系统设置 | — | ProLayout 菜单分组（group） |
| `/admin/settings/plugins` | 插件管理 | `plugin:manage` | `PluginListPage` | 列表 + 启用/禁用按钮 |
| `/admin/settings/users` | 用户管理 | `user:manage` | `UserListPage` | ProTable CRUD |
| `/admin/settings/roles` | 角色管理 | `role:manage` | `RoleListPage` | ProTable + 权限勾选 |
| `/admin/settings/audit-logs` | 审计日志 | `audit:read` | `AuditLogPage` | 只读 ProTable |

### 1.2 菜单渲染结构

```
┌──────────────────────────────────────┐
│  AUDEBase  [logo]    [用户头像 ▼]    │  ← ProLayout Header
├──────────┬───────────────────────────┤
│          │                            │
│  🏠 首页  │                            │
│          │                            │
│ ⚙ 系统设置 │  插件管理                 │  ← ProLayout Content
│  └ 插件   │  ┌─────────────────────┐   │
│    管理   │  │ PluginListPage     │   │
│    用户   │  │ ProTable: name,    │   │
│    管理   │  │ state, version     │   │
│    角色   │  │ [启用] [禁用]       │   │
│    管理   │  └─────────────────────┘   │
│          │                            │
│ 📋 审计   │                            │
│    日志   │                            │
└──────────┴───────────────────────────┘
```

### 1.3 路由注册 API

遵循 D16 代码 API 模式：

```typescript
// admin-ui/src/App.tsx — ProLayout 初始化时注册路由
this.app.router.add('settings', { type: 'group', label: '系统设置' })
this.app.router.add('settings.plugins', {
  path: '/admin/settings/plugins',
  component: PluginListPage,
  aclSnippet: 'plugin:manage',
  icon: 'AppstoreOutlined',
})
this.app.router.add('settings.users', {
  path: '/admin/settings/users',
  component: UserListPage,
  aclSnippet: 'user:manage',
  icon: 'UserOutlined',
})
this.app.router.add('settings.roles', {
  path: '/admin/settings/roles',
  component: RoleListPage,
  aclSnippet: 'role:manage',
  icon: 'TeamOutlined',
})
this.app.router.add('settings.audit-logs', {
  path: '/admin/settings/audit-logs',
  component: AuditLogPage,
  aclSnippet: 'audit:read',
  icon: 'FileSearchOutlined',
})
```

### 1.4 Provider Stack

遵循 D18 层级：

```tsx
<TenantProvider>       {/* tenantId, tenantConfig, availableTenants, switchTenant */}
  <UserProvider>       {/* currentUser, login, logout */}
    <ACLProvider>      {/* permissions, can(), canRoute() */}
      <ProLayout       {/* menuDataRender 过滤无权限菜单 */}
        route={...}
        rightContentRender={() => <UserMenu />}
      >
        <Routes>...</Routes>
      </ProLayout>
    </ACLProvider>
  </UserProvider>
</TenantProvider>
```

### 1.5 用户菜单

右上角用户头像下拉（ProLayout `rightContentRender`）:

```
┌──────────────┐
│ 管理员 (admin) │
├──────────────┤
│ 退出登录       │
└──────────────┘
```

**用户菜单不做**（Phase 1a）:
- 切换租户（Phase 1b 多租户管理 UI）
- 个人设置（Phase 2）
- 语言切换器（Phase 1b）

---

## 2. Build Output 结构

### 2.1 Monorepo Build 产出

采用 tsc + tsc-alias 模式（NocoBase 兼容路径）：

```
packages/
├── core/
│   ├── dist/              ← tsc --build 产出
│   │   ├── index.js           ← 入口: Fastify app + PluginManager.start()
│   │   ├── plugin-manager.js
│   │   ├── plugin-host.js
│   │   ├── db.js
│   │   ├── config.js
│   │   ├── middleware/
│   │   │   ├── error-handler.js
│   │   │   ├── request-id.js
│   │   │   └── rate-limit.js
│   │   └── plugins/           ← 运行时插件扫描目录
│   │       └── plugin-core/   ← 构建时从 packages/plugin-core/dist/ 复制
│   │
│   └── package.json       ← "main": "dist/index.js"
│
├── rbac/
│   └── dist/
│       └── index.js
│
├── audit/
│   └── dist/
│
├── migration/
│   └── dist/
│
├── cli/
│   └── dist/
│       └── index.js           ← CLI 入口（package.json "bin": "dist/index.js"）
│
├── i18n/
│   └── dist/
│
├── plugin-core/
│   ├── dist/
│   │   ├── index.js
│   │   └── locale/
│   │       └── zh-CN.json
│   └── manifest.yaml          ← build 时显式复制到 dist/
│
└── admin-ui/
    ├── dist/              ← Vite build
    │   ├── index.html
    │   ├── assets/
    │   │   ├── vendor-react-*.js       ← D21 vendor 分组
    │   │   ├── vendor-antd-*.js
    │   │   ├── vendor-i18n-*.js
    │   │   ├── vendor-query-*.js
    │   │   ├── core-admin-*.js         ← admin-ui 自身代码
    │   │   └── core-admin-*.css
    │   └── plugins/                   ← Phase 1b 插件 chunk 代理目录
    ├── index.html
    └── vite.config.ts
```

### 2.2 构建命令链

```bash
# 全量构建（Turborepo 管理依赖图）
pnpm build

# 等价于:
#   1. tsc --build (packages/shared-types → core → rbac/audit/migration/i18n → cli → plugin-core)
#   2. vite build (packages/admin-ui)
#   3. 复制 plugin-core 到 core/dist/plugins/

# 开发模式（仅 TypeScript 类型检查，不产出 dist）
pnpm dev
```

### 2.3 Core 运行时插件发现

```typescript
// core/plugin-manager.ts
import path from 'path'

async function discoverPlugins(): Promise<string[]> {
  const searchPaths: string[] = []

  // 1. 内置内核插件（始终最先加载）
  searchPaths.push(
    path.join(__dirname, 'plugins', 'plugin-core')
  )

  // 2. Monorepo 内插件（开发模式，tsc 产出在 packages/*/dist/）
  if (process.env.AUDE_DEV === '1') {
    const workspaceRoot = path.resolve(__dirname, '../../..')
    searchPaths.push(
      path.join(workspaceRoot, 'packages', 'plugin-*', 'dist')
    )
    // 用户开发插件（plugins/ 目录）
    searchPaths.push(
      path.join(workspaceRoot, 'plugins', '*')
    )
  }

  // 3. 外部安装插件（生产模式，node_modules）
  searchPaths.push(
    path.join(process.cwd(), 'node_modules', '@audebase', 'plugin-*', 'dist')
  )

  return discoverFrom(searchPaths)
}
```

### 2.4 插件加载契约

| 约定 | 值 |
|------|-----|
| 插件入口文件 | `{pluginDir}/index.js`（package.json `"main"`） |
| manifest 位置 | `{pluginDir}/manifest.yaml` |
| 翻译文件位置 | `{pluginDir}/locale/{lang}.json` |
| 入口导出 | `export default class XxxPlugin extends Plugin` |
| Core 引用 | `import { Plugin, PluginManager } from '@audebase/core'` |
| 插件包声明 | `@audebase/core` 为 `peerDependencies` |

**反模式**（禁止）:
- ❌ `export function myPlugin(): Plugin` — 必须 export default class
- ❌ `import { Plugin } from '../core/src'` — 必须走 npm scope
- ❌ manifest.yaml 放在 src/ 内 — 必须在包根目录

---

## 3. 构建工具链

### 3.1 工具选型

| 工具 | 用途 | 版本要求 |
|------|------|:---:|
| TypeScript | 类型检查 + 编译 | ^5.7 |
| tsc-alias | 路径别名重映射（`@audebase/*` → `../../shared-types/dist/`） | 最新 |
| Turborepo | 构建编排（依赖图 + 缓存） | ^2.x |
| Vite | Admin UI 构建（React + antd 5） | ^6.x |
| Vitest | 测试运行 | ^2.x |
| Playwright | E2E 测试 | 最新 |

### 3.2 Turbo 配置示例

```json
// turbo.json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["build"],
      "outputs": []
    },
    "type-check": {
      "dependsOn": ["^build"]
    }
  }
}
```

### 3.3 pnpm Workspace 配置

```yaml
# pnpm-workspace.yaml
packages:
  - "packages/*"
  - "plugins/*"
```

---

## 4. 不做（Phase 1a）

| 项目 | 说明 | 所在 Phase |
|------|------|:---:|
| 远程插件代理 | `/plugins/{name}/*` HTTP 端点 | Phase 1b |
| 前端插件 chunk 独立部署 | 插件 admin chunk 独立于 Core build | Phase 1b |
| 插件懒加载路由 | `router.add('...', { lazy: () => import(...) })` | Phase 2 |
| 单文件 bundle | esbuild/tsup 打包 | 不做（保持 NocoBase tsc 模式） |
| Container iframe 隔离 | 前端 iframe 沙箱 | Phase 4 |




---

## 5. 懒加载组件类型契约（Phase 2 预备）

Phase 1a 所有插件通过 Monorepo 构建时打包（D17），不涉及懒加载。以下定义为 Phase 2 引入 `router.add()` 懒加载选项时的类型契约和降级策略。

### 5.1 LazyRoute 接口

遵循 D22 决策：`lazy` 必须为 `() => import()` 箭头函数直接返回，禁止 `async` 包装和 `React.lazy()` 包装。

```typescript
import type { ComponentType } from 'react'

interface LazyRouteComponent {
  lazy: () => Promise<{ default: ComponentType<unknown> }>
  /** Skeleton 组件，加载期间渲染。未指定时使用默认 Skeleton */
  loading?: ComponentType
  /** 降级 UI 组件。未指定时使用默认 ErrorCard */
  error?: ComponentType<{ error: Error; retry: () => void }>
  /** 加载超时时间（ms），默认 10000 */
  timeout?: number
}
```

### 5.2 加载状态行为

| 状态 | 行为 | 说明 |
|------|------|------|
| 加载中 | 渲染 `loading` 组件 | 如未指定，使用默认 Skeleton |
| 加载完成 | 渲染 `default` 导出组件 | 正常挂载到路由位置 |
| 超时 | 渲染 `error` 组件 | `timeout` ms 后 `lazy()` 未 resolve 触发 |
| 模块不存在（404）| 渲染 `error` 组件 | import() 抛出 404 错误 |
| Chunk 加载失败 | 渲染 `error` 组件 | import() 抛出网络/解析错误 |

**默认 Skeleton**（未指定 `loading` 时使用）:

```tsx
import { Skeleton } from 'antd'

const DefaultSkeleton: ComponentType = () => (
  <Skeleton active avatar paragraph={{ rows: 3 }} />
)
```

**加载超时默认值**: 10000ms，可通过 `LazyRouteComponent.timeout` 按路由覆盖。

### 5.3 错误降级策略

错误卡片组件（`ErrorCard`）接收 `error` 对象和 `retry` 回调，根据错误类型展示不同降级 UI。所有错误均记录到 Core 审计日志（`audit_log` 表，action 类型 `plugin:lazy_load_error`），不使用 `console.error`。

#### 5.3.1 超时错误

- **触发条件**: `lazy()` 在 `timeout` ms 内未 resolve
- **ErrorCard 显示**: 插件名称 + "加载超时，请检查网络或稍后重试" + 重试按钮
- **重试行为**: 重新调用 `lazy()`，重置计时器

#### 5.3.2 模块未找到（HTTP 404）

- **触发条件**: import() 抛出 404 错误
- **ErrorCard 显示**: 插件名称 + "插件未找到，可能已被卸载" + 返回首页链接
- **无重试**: 404 为确定性错误，不提供重试按钮

#### 5.3.3 Chunk 加载失败

- **触发条件**: import() 抛出网络错误、解析错误等非 404 错误
- **ErrorCard 显示**: 插件名称 + "加载失败" + 重试按钮 + 错误摘要（不暴露堆栈）
- **重试策略**: 递增退避（exponential backoff）
  - 第 1 次重试: 1s 后
  - 第 2 次重试: 2s 后
  - 第 3 次重试: 4s 后
  - 最多 3 次重试，全部失败后显示 "加载失败，请联系管理员" 并停止重试

#### 5.3.4 默认 ErrorCard 组件

```typescript
interface ErrorCardProps {
  error: Error
  retry: () => void
}

interface DefaultErrorCardProps extends ErrorCardProps {
  pluginName: string
}
```

```tsx
import { Button, Card, Result, Typography } from 'antd'
import { ReloadOutlined, HomeOutlined } from '@ant-design/icons'

const { Text } = Typography

function is404Error(error: Error): boolean {
  return error.message.includes('404')
    || error.message.includes('Not Found')
}

function isTimeoutError(error: Error): boolean {
  return error.message.includes('timeout')
}

const DefaultErrorCard: ComponentType<DefaultErrorCardProps> = ({
  pluginName,
  error,
  retry,
}) => {
  if (is404Error(error)) {
    return (
      <Card>
        <Result
          status="404"
          title="插件未找到"
          subTitle={`${pluginName} 可能已被卸载`}
          extra={<Button type="primary" icon={<HomeOutlined />} href="/admin">返回首页</Button>}
        />
      </Card>
    )
  }

  if (isTimeoutError(error)) {
    return (
      <Card>
        <Result
          status="warning"
          title="加载超时"
          subTitle={`${pluginName} 加载超时，请检查网络或稍后重试`}
          extra={<Button type="primary" icon={<ReloadOutlined />} onClick={retry}>重试</Button>}
        />
      </Card>
    )
  }

  // Chunk 加载失败
  return (
    <Card>
      <Result
        status="error"
        title="加载失败"
        subTitle={(
          <Text type="secondary" ellipsis={{ tooltip: true }}>
            {error.message}
          </Text>
        )}
        extra={<Button type="primary" icon={<ReloadOutlined />} onClick={retry}>重试</Button>}
      />
    </Card>
  )
}
```

#### 5.3.5 审计日志格式

所有懒加载错误通过 Core `POST /api/v1/audit-logs` 记录，action 类型 `plugin:lazy_load_error`：

```json
{
  "action": "plugin:lazy_load_error",
  "resource_type": "plugin",
  "resource_id": "@audebase/plugin-erp",
  "new_values": {
    "error_type": "timeout | 404 | chunk_load_failure",
    "error_message": "...",
    "retry_count": 2,
    "route": "/admin/erp/purchase"
  }
}
```

### 5.4 与 ErrorBoundary + Suspense 的关系

遵循 D20 决策：每个路由渲染处已包裹 `<ErrorBoundary>`（来自 react-error-boundary）+ `<Suspense>`。

```tsx
// Core router 内部实现（Phase 2 伪代码）
function LazyRouteRenderer({ config }: { config: LazyRouteConfig }) {
  const { lazy, loading: LoadingComp, error: ErrorComp, timeout = 10000 } = config

  // react-error-boundary 捕获 chunk 加载失败和组件渲染异常
  return (
    <ErrorBoundary fallback={<ErrorFallback error={/*...*/} retry={/*...*/} />}>
      <Suspense fallback={<LoadingComp || DefaultSkeleton />}>
        <LazyComponentInner lazy={lazy} timeout={timeout} />
      </Suspense>
    </ErrorBoundary>
  )
}
```

**层级说明**:
- `Suspense` — 处理正常的异步加载等待（渲染 loading/skeleton）
- `ErrorBoundary` — 捕获 chunk 加载失败和组件运行时异常（渲染 error card）
- `LazyComponentInner` — 内部管理超时计时器 + 递增退避重试 + 审计日志

### 5.5 路由注册 API 扩展（Phase 2）

D22 定义的 `router.add()` 懒加载扩展：

```typescript
// Phase 1a: 直接注册
this.app.router.add('settings.plugins', {
  path: '/admin/settings/plugins',
  component: PluginListPage,
  aclSnippet: 'plugin:manage',
})

// Phase 2: 懒加载注册（仅在 Phase 2 支持）
this.app.router.add('erp.purchase', {
  path: '/admin/erp/purchase',
  aclSnippet: 'erp:purchase',
  lazy: () => import('@audebase/plugin-erp/admin/purchase'),
  loading: PurchaseListSkeleton,      // 可选
  error: PurchaseErrorCard,          // 可选
  timeout: 15000,                    // 可选，覆盖默认 10s
})
```

**约束**:
- Phase 1a 不支持 `lazy` / `loading` / `error` / `timeout` 字段 -- 使用会抛出 `PhaseError`
- Phase 2 启用后，`lazy` 和 `component` 互斥：同时指定抛出 `RouterConfigError`

---

## 6. Security

### 6.1 CSP 策略

Phase 1a 管理 UI 通过 Core 提供的 `Content-Security-Policy` 头保护：

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline';
img-src 'self' data:;
font-src 'self';
connect-src 'self';
frame-src 'none';
object-src 'none';
```

**Phase 1b 扩展**: Phase 2 动态 import() 插件 chunk 时，需在 CSP 中追加插件资源源。Phase 4 Container iframe 沙箱 CSP 独立配置。

### 6.2 XSS 防护

- React 默认转义 HTML → 防止 DOM XSS
- antd Typography.Text 自动转义用户输入
- 审计日志显示时使用 `<Text>` 而非 `dangerouslySetInnerHTML`
- 用户头像 URL 使用白名单校验（仅允许 `/static/` 或 CDN 域名）

### 6.3 CSRF 防护

- JWT Bearer Token 模式天然免疫 CSRF（Token 不在 Cookie 中）
- `SameSite=Lax` Cookie 用于 refresh_token 安全存储
- 所有状态变更操作（POST/PUT/PATCH/DELETE）需要有效的 access_token

### 6.4 敏感数据保护

- API 响应不暴露 password_hash、refresh_token_hash
- `new_values` 中敏感字段自动 [REDACTED]（见 audit-sdd.md §4.2）
- 前端日志不输出 JWT token 或用户凭证
- ProTable 数据导出（Phase 2）受权限控制

### 6.5 安全审计

- 所有前端权限检查失败记录到 Core audit_log
- 懒加载错误记录 `plugin:lazy_load_error` 审计事件
- 前端异常通过 `ErrorBoundary` fallback 回调记录审计

---

## 7. Lifecycle

### 7.1 启动 (startup)

```
Core 启动
  │
  ├─ Fastify 注册管理 UI 静态文件服务
  │     └─ serve admin-ui/dist/
  │
  ├─ ACLProvider 初始化
  │     ├─ GET /api/auth/permissions (获取当前用户权限)
  │     └─ 加载完成 → render <Outlet />
  │
  └─ 管理 UI 渲染完成
       ├─ ProLayout 渲染侧边栏菜单
       ├─ 路由解析 → 首个匹配路由
       └─ Dashboard 重定向 (/) → (/admin/settings/plugins)
```

**前置条件**:
- JWT access_token 已通过认证（或在登录页）
- ACLProvider 需要 tenantId → 依赖 TenantProvider
- i18n resources 已加载（I18nextProvider 在最外层）

### 7.2 运行时 (runtime)

- **路由导航**: React Router v7 客户端导航，ProLayout 自动高亮当前菜单
- **权限过滤**: ProLayout `menuDataRender` 根据 ACLProvider.canRoute() 过滤菜单项
- **插件崩溃**: ErrorBoundary 捕获 → 渲染降级 UI（D20）→ 侧边栏/顶栏保持正常
- **租户上下文**: TenantProvider 提供 tenantId，所有 API 请求自动携带

### 7.3 关闭 (shutdown)

- 页面关闭/刷新: React 组件 unmount → TanStack Query cache 自动清理
- 登出: 清除 access_token + refresh_token → 重定向到 /admin/auth/login
- 懒加载组件: Phase 2 插件懒加载模块按需卸载

### 7.4 Provider Stack 生命周期

遵循 D18 层级顺序（由上到下初始化）：

```
I18nextProvider.init()
  └─ QueryClientProvider
       └─ TenantProvider (fetch tenant config)
            └─ UserProvider (验证 JWT, 获取用户信息)
                 └─ ACLProvider (fetch permissions, 需要 tenantId)
                      └─ ProLayout (render menu)
```

---
## 8. 组件测试

### 6.1 ProTable 组件测试 — PluginList

Admin UI 组件测试遵循 D6（Ant Design 5）、D16（ProLayout）、D19（ACLProvider）架构决策。以下以 `PluginListPage` 为例展示 ProTable 组件测试模式。

**被测试组件** `PluginListPage.tsx` 关键结构：

```tsx
// admin-ui/src/pages/plugins/PluginListPage.tsx
import type { ProColumns } from '@ant-design/pro-table'
import ProTable from '@ant-design/pro-table'
import { useACL } from '../../providers/ACLProvider'
import { ACLGuard } from '../../components/ACLGuard'
import { fetchPlugins } from '../../api/plugins'

interface PluginRecord {
  id: string
  name: string
  version: string
  state: 'loaded' | 'disabled'
  enabled: boolean
}

export function PluginListPage(): React.ReactElement {
  const { can } = useACL()

  const columns: ProColumns<PluginRecord>[] = [
    { title: '名称', dataIndex: 'name', key: 'name' },
    { title: '版本', dataIndex: 'version', key: 'version' },
    {
      title: '操作',
      key: 'actions',
      render: (_, record) => (
        can('plugin:manage')
          ? <ACLGuard action="plugin:manage">
              {record.enabled
                ? <button aria-label="禁用">禁用</button>
                : <button aria-label="启用">启用</button>}
            </ACLGuard>
          : null
      ),
    },
  ]

  return (
    <ProTable<PluginRecord>
      columns={columns}
      request={async (params) => {
        const { data, total } = await fetchPlugins(params)
        return { data, total, success: true }
      }}
      rowKey="id"
      search={false}
    />
  )
}
```

**测试文件** `PluginListPage.test.tsx`:

```typescript
// admin-ui/src/pages/plugins/PluginListPage.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PluginListPage } from './PluginListPage'

// Mock fetchPlugins API（参见 D12: Core 数据 API 代理）
vi.mock('../../api/plugins', () => ({
  fetchPlugins: vi.fn(),
  togglePlugin: vi.fn(),
}))

// Mock useACL Hook
vi.mock('../../providers/ACLProvider', () => ({
  useACL: vi.fn(),
}))

import { fetchPlugins, togglePlugin } from '../../api/plugins'
import { useACL } from '../../providers/ACLProvider'

interface PluginRecord {
  id: string
  name: string
  version: string
  state: 'loaded' | 'disabled'
  enabled: boolean
}

describe('PluginListPage', () => {
  const mockPlugins: PluginRecord[] = [
    { id: '1', name: '@audebase/plugin-core', version: '0.1.0', state: 'loaded', enabled: true },
    { id: '2', name: '@audebase/rbac', version: '0.1.0', state: 'loaded', enabled: true },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    // 默认：有 plugin:manage 权限
    vi.mocked(useACL).mockReturnValue({
      can: (action: string) => action === 'plugin:manage',
      canRoute: () => true,
      permissions: new Set(['plugin:manage']),
      loading: false,
    })
  })

  it('renders plugin list with data from Core API', async () => {
    vi.mocked(fetchPlugins).mockResolvedValue({
      data: mockPlugins,
      total: 2,
    })

    render(<PluginListPage />)

    await waitFor(() => {
      expect(screen.getByText('@audebase/plugin-core')).toBeInTheDocument()
    })
    expect(screen.getByText('@audebase/rbac')).toBeInTheDocument()
  })

  it('renders empty state when API returns no plugins', async () => {
    vi.mocked(fetchPlugins).mockResolvedValue({ data: [], total: 0 })

    render(<PluginListPage />)

    await waitFor(() => {
      expect(screen.getByText('暂无数据')).toBeInTheDocument()
    })
  })

  it('shows Enable/Disable buttons when user has plugin:manage permission', async () => {
    vi.mocked(fetchPlugins).mockResolvedValue({
      data: mockPlugins,
      total: 2,
    })

    render(<PluginListPage />)

    await waitFor(() => {
      expect(screen.getByText('@audebase/plugin-core')).toBeInTheDocument()
    })

    // 已启用的插件显示「禁用」按钮
    const disableButton = screen.getByRole('button', { name: '禁用' })
    expect(disableButton).toBeInTheDocument()
  })

  it('hides action buttons when user lacks plugin:manage permission', async () => {
    vi.mocked(fetchPlugins).mockResolvedValue({
      data: mockPlugins,
      total: 2,
    })
    vi.mocked(useACL).mockReturnValue({
      can: () => false,
      canRoute: () => true,
      permissions: new Set<string>(),
      loading: false,
    })

    render(<PluginListPage />)

    await waitFor(() => {
      expect(screen.getByText('@audebase/plugin-core')).toBeInTheDocument()
    })

    const disableButton = screen.queryByRole('button', { name: '禁用' })
    expect(disableButton).not.toBeInTheDocument()
  })

  it('calls toggle API when Enable button is clicked', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchPlugins).mockResolvedValue({
      data: [
        { id: '3', name: '@audebase/plugin-hello', version: '0.1.0', state: 'disabled', enabled: false },
      ],
      total: 1,
    })

    vi.mocked(togglePlugin).mockResolvedValue({ success: true })

    render(<PluginListPage />)

    await waitFor(() => {
      expect(screen.getByText('@audebase/plugin-hello')).toBeInTheDocument()
    })

    const enableButton = screen.getByRole('button', { name: '启用' })
    await user.click(enableButton)

    expect(togglePlugin).toHaveBeenCalledWith('3', true)
  })
})
```

### 6.2 测试模式总结

| 测试用例 | 覆盖目标 | 关联决策 |
|----------|----------|:---:|
| renders plugin list with data | ProTable 数据渲染 + mock API | D6, D12 |
| renders empty state | 空数据边界条件 | D6 (ProTable) |
| shows Enable/Disable buttons | `can('plugin:manage')` → ACL 控制按钮渲染 | D19 |
| hides action buttons | 无权限时 `renders null` — ACL 守卫正确 | D19 |
| calls toggle API on click | userEvent 交互 + API mock | D12 |

**RTL 查询优先级**（遵循 testing-library 最佳实践）:

| 优先级 | 查询方法 | 适用场景 |
|:---:|------|------|
| 1 | `getByRole` / `queryByRole` | 按钮、输入框等语义化角色 |
| 2 | `getByLabelText` | 表单字段 |
| 3 | `getByText` / `queryByText` | 文本内容 |
| 4 | `getByTestId` | 仅在以上均不适用时使用 |

**vitest mock 约定**:
- API 层 mock: `vi.mock('../../api/plugins')` 隔离网络请求（D12: 所有 DB 操作通过 Core 数据 API 代理）
- ACL mock: `vi.mocked(useACL).mockReturnValue(...)` 注入权限上下文
- 禁止 `vi.mock('antd')` — antd 组件应使用 RTL 真实渲染（D6: Ant Design 5 为唯一 UI 库）
- 禁止 `@ts-ignore` 或 `as unknown as` 绕过类型检查 — mock 返回值必须符合接口定义

---

## 9. 参考

- 架构决策: `../../.agents/memorys/decisions.md` — D16, D17, D18, D19, D20, D21, D22, D23, D24
- API 约定: [api-conventions.md](api-conventions.md)
- 开发工作流: [dev-workflow.md](dev-workflow.md)
- Phase 划分: [phase-planning.md](../phase-planning.md)

---

## 10. 变更记录

| 版本 | 日期 | 变更内容 |
|------|------|---------|
| v0.1.0 | 2026-07-13 | 初始版本 |
