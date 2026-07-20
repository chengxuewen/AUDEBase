# Admin UI SDD - 软件设计文档

> **模块**: `@audebase/admin-ui`
> **版本**: 0.1.0
> **创建日期**: 2026-07-16
> **状态**: Phase 1a 已实现（55 测试通过）
> **依赖**: React 19, Ant Design 5, @tanstack/react-query, react-error-boundary, react-router-dom
> **参考**: D6 (Ant Design 5), D15 (react-i18next), D16 (ProLayout), D17 (加载策略), D18 (状态管理), D19 (ACL), D20 (ErrorBoundary), D21 (Vendor 分组), D22 (懒加载), D23 (Slot), D24 (多租户前端)
> **关联文档**: [admin-ui-tdd.md](admin-ui-tdd.md), [frontend-spec.md](frontend-spec.md), [architecture.md §6](../architecture.md)

---

## 1. 概要

### 1.1 模块定位

Admin UI 是 AUDEBase 平台的管理后台前端模块，提供插件管理、用户管理、角色管理、审计日志查看和登录认证等核心管理功能。基于 React 19 + Ant Design 5 构建，通过 Provider Stack 架构集成权限控制、租户隔离和错误隔离。

### 1.2 职责边界

| 职责 | 说明 |
|------|------|
| 管理后台布局 | 基于 Ant Design Layout 的侧边栏 + 顶栏 + 内容区布局 |
| 权限控制 | 三层权限：菜单级（canRoute）、组件级（ACLGuard）、字段级（D11 后端过滤 + 前端防御） |
| 状态管理 | Provider Stack（TenantProvider → UserProvider → ACLProvider）+ TanStack Query 服务端状态 |
| 错误隔离 | 插件级 ErrorBoundary 捕获崩溃，显示降级 UI |
| 扩展插槽 | SlotRegistry 支持插件注册 UI 组件到预定义位置 |
| 页面组件 | 登录页 + 插件/用户/角色/审计日志管理页 |

### 1.3 设计目标

- **单一 UI 库**: Ant Design 5 为唯一组件库，消除库间主题冲突（D6）
- **故障隔离**: 单个插件/页面崩溃不影响全局布局（D20）
- **权限贯穿**: 所有 UI 元素受 ACL 控制，无权限即不渲染（D19）
- **缓存隔离**: TanStack Query key 强制 `[pluginName, ...]` 前缀（D18）
- **不可变模式**: 所有状态更新返回新对象，不就地修改

---

## 2. 接口定义

### 2.1 Barrel 导出 (`src/index.ts`)

```typescript
// Providers
export { TenantProvider, useTenant } from './providers/TenantProvider.js'
export { ACLProvider, useACL } from './providers/ACLProvider.js'
export { UserProvider, useUser } from './providers/UserProvider.js'

// Components
export { ACLGuard } from './components/ACLGuard.js'
export { PluginErrorBoundary } from './components/PluginErrorBoundary.js'

// Hooks
export { SlotRegistry } from './hooks/SlotRegistry.js'

// Layout
export { AdminLayout } from './layout/AdminLayout.js'

// Pages
export { LoginPage } from './pages/LoginPage.js'
export { PluginListPage } from './pages/plugins/PluginListPage.js'
export { RoleListPage } from './pages/roles/RoleListPage.js'
export { UserListPage } from './pages/users/UserListPage.js'
export { AuditLogPage } from './pages/audit/AuditLogPage.js'
```

### 2.2 TenantProvider (`src/providers/TenantProvider.tsx`)

提供租户上下文，遵循 D24 URL 路径前缀模式。

```typescript
interface TenantInfo {
  id: string
  name: string
}

interface TenantContextValue {
  tenantId: string | null
  availableTenants: TenantInfo[]
  onSwitchTenant?: (tenantId: string) => void
}

interface TenantProviderProps {
  tenantId: string | null
  availableTenants?: TenantInfo[]          // 默认 []
  onSwitchTenant?: (tenantId: string) => void
  children: ReactNode
}

// Hook
function useTenant(): TenantContextValue | null
```

**行为**:
- `tenantId` 为 `null` 表示系统租户（tenant_id = NULL）
- `onSwitchTenant` 可选；存在时触发全页重载（D24: `window.location.href`）
- `availableTenants` 默认空数组，Phase 1a 不渲染租户切换器

### 2.3 UserProvider (`src/providers/UserProvider.tsx`)

提供当前用户上下文。

```typescript
interface User {
  id: string
  username: string
  is_active: boolean
  token_version: number                   // D8.1: JWT token 撤回机制
  must_change_password: boolean           // D1.6: admin 首次登录强制改密
  tenant_id: string | null
}

interface UserContextValue {
  user: User | null
  isLoading: boolean
  onLogout?: () => void
}

interface UserProviderProps {
  user: User | null
  isLoading?: boolean                     // 默认 false
  onLogout?: () => void
  children: ReactNode
}

// Hook
function useUser(): UserContextValue | null
```

**行为**:
- `isLoading` 为 `true` 且 `user` 为 `null` 时，渲染 `<Spin />` 全屏加载
- `onLogout` 可选；调用时清除 token 并重定向到登录页

### 2.4 ACLProvider (`src/providers/ACLProvider.tsx`)

提供权限上下文，遵循 D19 三层权限控制体系。

```typescript
interface ACLPermission {
  action: string                          // 如 'create', 'read', 'manage'
  resource: string                        // 如 'plugin', 'user', '*'
}

interface ACLContextValue {
  permissions: ACLPermission[]
  isLoading: boolean
  can: (action: string, resource: string) => boolean
  canRoute: (snippet: string) => boolean
}

interface ACLProviderProps {
  permissions: ACLPermission[]
  isLoading?: boolean                     // 默认 false
  children: ReactNode
}

// Hook
function useACL(): ACLContextValue | null
```

**`can()` 逻辑**:
- `isLoading` 为 `true` 时返回 `false`（加载中不授权，防闪烁）
- 权限匹配规则：`action === 'manage' && resource === '*'` → 全局管理员权限
- 或 `action === p.action && (resource === p.resource || p.resource === '*')`

**`canRoute()` 逻辑**:
- `isLoading` 为 `true` 时返回 `false`
- 存在 `manage:*` 权限或 `permissions.length >= 0` 时返回 `true`

**Provider 依赖**: ACLProvider 必须在 TenantProvider 内部（需 tenantId 获取权限，D18）

### 2.5 ACLGuard (`src/components/ACLGuard.tsx`)

声明式权限守卫组件，包裹需要权限控制的 UI 元素。

```typescript
interface ACLGuardProps {
  action: string                          // 如 'create', 'delete', 'plugin:manage'
  resource: string                        // 如 'user', 'plugin', '*'
  can?: boolean                           // 默认 true；外部预计算权限结果
  isLoading?: boolean                     // 默认 false；ACL 加载状态
  fallback?: ReactElement                 // 默认 null；无权限时的替代 UI
  children: ReactNode
}

function ACLGuard(props: ACLGuardProps): ReactNode
```

**渲染逻辑**:
1. `isLoading === true` → 返回 `null`（不闪烁）
2. `can === false` → 返回 `fallback ?? null`
3. 否则 → 返回 `<>{children}</>`

**使用模式**:
```tsx
// 按钮级权限
<ACLGuard action="delete" resource="user" can={useACL()?.can('delete', 'user')}>
  <Button danger>删除用户</Button>
</ACLGuard>

// 带降级 UI
<ACLGuard action="plugin:manage" resource="plugin" can={hasPerm} fallback={<Text type="secondary">无权限</Text>}>
  <Button>启用</Button>
</ACLGuard>
```

### 2.6 PluginErrorBoundary (`src/components/PluginErrorBoundary.tsx`)

插件级错误边界，使用 react-error-boundary 捕获子组件渲染异常。

```typescript
interface PluginErrorBoundaryProps {
  pluginName: string                      // 插件标识，显示在降级 UI 中
  children: ReactNode
}

function PluginErrorBoundary(props: PluginErrorBoundaryProps): ReactNode
```

**降级 UI 行为**:
- 使用 antd `<Result status="error">` 渲染
- 标题: `{pluginName} 异常`
- 副标题: `插件 {pluginName} 发生崩溃`
- 操作按钮: "重试"（`resetErrorBoundary` 重置边界）+ "返回首页"（`<a href="/">`）
- **不暴露错误堆栈**（安全要求，D20）

### 2.7 SlotRegistry (`src/hooks/SlotRegistry.ts`)

UI 扩展插槽注册表，遵循 D23 Registry + Slot 模式。

```typescript
interface SlotEntry {
  component: ComponentType                // React 组件
  order?: number                          // 排序权重，默认 0；升序排列
  key?: string                            // 唯一标识；同 key 后注册覆盖
}

class SlotRegistry {
  /**
   * 注册组件到指定 Slot
   * @param slotName - Slot 名称（dot 命名，如 'header.actions.right'）
   * @param options - 组件 + 排序 + key
   */
  add(slotName: string, options: SlotEntry): void

  /**
   * 获取 Slot 中所有已注册组件（按 order 升序排列）
   * @param slotName - Slot 名称
   * @returns 组件数组，无注册时返回空数组
   */
  get(slotName: string): SlotEntry[]
}
```

**行为**:
- `add()` with `key` → 过滤同 key 已有项，再追加（后注册覆盖）
- `add()` without `key` → 直接追加
- `get()` → 返回排序后的副本（不可变），不暴露内部状态
- 无注册组件时返回 `[]`，渲染 null（不占 DOM 节点）

### 2.8 AdminLayout (`src/layout/AdminLayout.tsx`)

管理后台布局骨架，基于 Ant Design Layout（Sider + Header + Content）。

```typescript
interface AdminLayoutProps {
  canRoute?: (snippet: string) => boolean // 菜单过滤函数
  children?: ReactNode                     // 页面内容
}

interface MenuItem {
  key: string
  label: string
  snippet: string                          // ACL 权限标识
}

function AdminLayout(props: AdminLayoutProps): ReactNode
```

**默认菜单项**:

| key | label | snippet |
|-----|-------|---------|
| `plugins` | 插件管理 | `plugin` |
| `users` | 用户管理 | `user` |

**菜单过滤逻辑**:
- `canRoute` 存在时：`defaultMenuItems.filter(item => canRoute(item.snippet))`
- `canRoute` 不存在时：显示全部菜单项

**布局结构**:
```
Layout (minHeight: 100vh)
├── Sider (dark theme)
│   └── Menu (inline mode)
└── Layout
    ├── Header (white bg, padding 0 16px)
    └── Content (padding 24px) → {children}
```

### 2.9 页面组件

#### 2.9.1 LoginPage (`src/pages/LoginPage.tsx`)

独立布局登录页（无 ProLayout 外层）。

```typescript
interface LoginPageProps {
  onSubmit?: (values: { username: string; password: string }) => void
}

function LoginPage(props: LoginPageProps): ReactNode
```

**UI 结构**: 居中 Card（width 400）+ antd Form（username/password 必填）+ 登录按钮

#### 2.9.2 PluginListPage (`src/pages/plugins/PluginListPage.tsx`)

插件管理列表页，使用 antd Table 渲染。

```typescript
interface PluginItem {
  id: string
  name: string
  display_name: string
  version: string
  status: string                          // 'loaded' | 'disabled'
  category: string
}

function PluginListPage(): ReactNode
```

**状态处理**:
- `isLoading` → `<Spin />`
- `isError` → 错误提示 + 重试按钮
- 空列表 → `<Empty description="暂无插件" />`
- 正常 → antd `<Table>` 渲染

**表格列**: 插件名称、显示名称、版本、状态（Tag 渲染）、分类、操作（启用/禁用按钮）

#### 2.9.3 RoleListPage (`src/pages/roles/RoleListPage.tsx`)

角色管理列表页。

```typescript
interface RoleItem {
  id: string
  name: string
  display_name: string
  permissions: unknown[]
  user_count: number
}

function RoleListPage(): ReactNode
```

**表格列**: 角色名称、显示名称、用户数、操作（编辑/删除按钮）+ 顶部"新建角色"按钮

#### 2.9.4 UserListPage (`src/pages/users/UserListPage.tsx`)

用户管理列表页。

```typescript
interface UserItem {
  id: string
  username: string
  is_active: boolean
  tenant_id: string | null
  created_at: string
}

function UserListPage(): ReactNode
```

**表格列**: 用户名、状态（Switch 渲染）、租户、操作（编辑/删除按钮）+ 顶部"新建用户"按钮

#### 2.9.5 AuditLogPage (`src/pages/audit/AuditLogPage.tsx`)

审计日志只读列表页。

```typescript
interface AuditLogItem {
  id: string
  tenant_id: string | null
  actor_id: string
  action: string
  resource_type: string
  resource_id: string
  old_values: unknown
  new_values: unknown
  ip: string
  user_agent: string
  created_at: string
}

function AuditLogPage(): ReactNode
```

**表格列**: 操作、资源类型、资源ID、操作人、IP、时间。只读页面，无操作按钮。

### 2.10 数据 Hooks

所有页面级 Hooks 遵循 D18 TanStack Query key 约定：`['@audebase/admin-ui', <resource>]`

| Hook | 文件路径 | queryKey | 返回类型 |
|------|---------|----------|---------|
| `usePlugins` | `pages/plugins/hooks/usePlugins.ts` | `['@audebase/admin-ui', 'plugins']` | `PaginatedResponse<PluginItem>` |
| `useRoles` | `pages/roles/hooks/useRoles.ts` | `['@audebase/admin-ui', 'roles']` | `PaginatedResponse<RoleItem>` |
| `useUsers` | `pages/users/hooks/useUsers.ts` | `['@audebase/admin-ui', 'users']` | `PaginatedResponse<UserItem>` |
| `useAuditLogs` | `pages/audit/hooks/useAuditLogs.ts` | `['@audebase/admin-ui', 'audit-logs']` | `PaginatedResponse<AuditLogItem>` |

**通用返回类型**:
```typescript
interface PaginatedResponse<T> {
  data: T[]
  meta: {
    count: number
    page: number
    pageSize: number
    totalPages: number
  }
}
```

**Phase 1a 占位实现**: 当前 `queryFn` 返回空数据占位。Phase 1a 集成阶段替换为真实 `fetch('/api/v1/...')` 调用。

### 2.11 测试工具 (`src/__tests__/helpers/test-utils.tsx`)

```typescript
interface MockACLWrapperOptions {
  aclPermissions?: Set<string>
}

function renderWithProviders(
  ui: ReactElement,
  options: MockACLWrapperOptions & RenderOptions = {}
): RenderResult
```

**行为**:
- 创建 `QueryClient`（`retry: false`）
- 包裹 `QueryClientProvider` + `MockACLWrapper`
- `MockACLWrapper` 为最小实现：直接返回 children（`ponytail: minimal mock`）
- 重新导出 RTL 工具：`screen`, `within`, `fireEvent`, `waitFor`, `act`, `userEvent`

---

## 3. 生命周期

### 3.1 Provider Stack 初始化顺序

遵循 D18 层级（由外到内初始化）:

```
I18nextProvider.init()           // react-i18next 初始化（D15）
  └─ QueryClientProvider         // TanStack Query 客户端
       └─ TenantProvider          // 租户上下文（D24）
            └─ UserProvider        // 用户上下文（验证 JWT）
                 └─ ACLProvider     // 权限上下文（需 tenantId，D19）
                      └─ AdminLayout // ProLayout 渲染菜单
                           └─ <Outlet /> // 页面路由（ErrorBoundary + Suspense）
```

**依赖约束**: ACLProvider 必须在 TenantProvider 内部（需 tenantId 获取权限）。

### 3.2 启动流程 (Startup)

```
Core 启动
  │
  ├─ Fastify 注册管理 UI 静态文件服务
  │     └─ serve admin-ui/dist/
  │
  ├─ Provider Stack 初始化
  │     ├─ TenantProvider (解析 URL 路径前缀 /{tenantId}/admin)
  │     ├─ UserProvider (验证 JWT, 获取用户信息)
  │     └─ ACLProvider (fetch /api/auth/permissions)
  │
  └─ 管理 UI 渲染完成
       ├─ AdminLayout 渲染侧边栏菜单（canRoute 过滤）
       ├─ 路由解析 -> 首个匹配路由
       └─ Dashboard 重定向 (/admin) -> (/admin/settings/plugins)
```

**前置条件**:
- JWT access_token 已通过认证（或在登录页）
- ACLProvider 需要 tenantId → 依赖 TenantProvider
- i18n resources 已加载（I18nextProvider 在最外层）

### 3.3 运行时 (Runtime)

- **路由导航**: React Router v7 客户端导航，AdminLayout 自动高亮当前菜单
- **权限过滤**: AdminLayout `canRoute()` 过滤无权限菜单项
- **插件崩溃**: PluginErrorBoundary 捕获 → 渲染降级 UI（D20）→ 侧边栏/顶栏保持正常
- **租户上下文**: TenantProvider 提供 tenantId，所有 API 请求自动携带
- **数据缓存**: TanStack Query 自动缓存 API 响应，key 前缀避免插件间冲突

### 3.4 关闭 (Shutdown)

- **页面关闭/刷新**: React 组件 unmount → TanStack Query cache 自动清理
- **登出**: `UserProvider.onLogout()` → 清除 access_token + refresh_token → 重定向 `/admin/auth/login`
- **租户切换**: `onlineManager.setOnline(false)` → `queryClient.clear()` → `window.location.href` 全页重载（D24）

### 3.5 页面组件状态机

所有列表页（PluginListPage / RoleListPage / UserListPage / AuditLogPage）遵循统一状态机:

```
         ┌──────────┐
初始 ──→ │ isLoading │ ──→ ┌─────────┐
         └────┬─────┘     │  正常    │
              │            │ (Table)  │
              ▼            └─────────┘
         ┌──────────┐          ↑
         │ isError  │          │
         └────┬─────┘    ┌─────┴─────┐
              │          │ 空列表    │
              ▼          │ (Empty)   │
         ┌──────────┐    └───────────┘
         │ 错误+重试 │
         └──────────┘
```

---

## 4. 依赖关系

### 4.1 运行时依赖

| 依赖 | 版本约束 | 用途 | 决策 |
|------|---------|------|------|
| react | ^19 | UI 框架 | D6 |
| react-dom | ^19 | DOM 渲染 | D6 |
| antd | ^5 | UI 组件库（唯一） | D6 |
| @tanstack/react-query | ^5 | 服务端状态管理 | D18 |
| react-error-boundary | ^4 | 错误边界 | D20 |
| react-router-dom | ^7 | 路由 | D16 |

### 4.2 开发依赖

| 依赖 | 用途 |
|------|------|
| vitest | 单元/集成测试 |
| @testing-library/react | 组件测试 |
| @testing-library/jest-dom | DOM 断言扩展 |
| @testing-library/user-event | 用户交互模拟 |
| jsdom | 浏览器环境模拟 |

### 4.3 模块依赖

```
@admin-ui
  ├── @audebase/shared-types (Phase 1a 集成: Zod schema 契约验证)
  └── Core API (Phase 1a 集成: fetch /api/v1/...)
```

### 4.4 被依赖

- `packages/core/` → 静态文件服务 `admin-ui/dist/`
- Core 启动时注册 Admin UI 路由和静态文件中间件

---

## 5. 错误码与错误处理

### 5.1 前端错误分类

| 错误类型 | 处理方式 | 日志级别 |
|---------|---------|---------|
| API 请求失败（网络/500） | 页面显示"加载失败" + 重试按钮 | error |
| API 认证失败（401） | 重定向到登录页 | warn |
| API 权限不足（403） | ACLGuard 渲染 fallback 或 null | info |
| 组件渲染崩溃 | PluginErrorBoundary 捕获，显示降级 UI | error |
| API 响应格式不匹配 | Zod schema 解析失败 → 契约测试拦截 | error |

### 5.2 页面级错误处理模式

所有列表页统一实现三态错误处理:

```typescript
// 1. 加载中
if (isLoading) return <Spin />

// 2. 错误状态
if (isError) return (
  <div>
    <p>加载失败</p>
    <Button>重试</Button>
  </div>
)

// 3. 空状态
if (list.length === 0) return <Empty description="暂无..." />

// 4. 正常渲染
return <Table ... />
```

### 5.3 PluginErrorBoundary 降级策略

- **捕获范围**: 子组件渲染异常（throw in render）
- **降级 UI**: antd `<Result status="error">` + 插件名 + 重试 + 返回首页
- **安全约束**: 不暴露错误堆栈、不暴露错误消息
- **审计记录**: Phase 1a 集成阶段通过 Core `POST /api/v1/audit-logs` 记录（action: `plugin:render_error`）

### 5.4 TanStack Query 错误传播

- `retry: false`（测试环境）/ 默认 3 次（生产环境）
- 查询失败 → `isError: true` → 页面渲染错误状态
- Mutation 失败 → antd `message.error()` 通知用户

---

## 6. 安全考虑

### 6.1 权限检查点

| 检查点 | 机制 | 决策 |
|--------|------|------|
| 菜单渲染 | `AdminLayout.canRoute()` 过滤无权限菜单 | D19 |
| 操作按钮 | `<ACLGuard>` 包裹或 `useACL().can()` 判断 | D19 |
| API 请求 | JWT Bearer Token 认证 | D8.1 |
| 表单字段 | D11 后端过滤 + 前端 ACLGuard 防御层 | D19 |
| 审计日志 | 所有前端权限检查失败记录到 Core audit_log | D1.12 |

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
- `new_values` / `old_values` 中敏感字段自动 `[REDACTED]`（见 audit-sdd.md）
- 前端日志不输出 JWT token 或用户凭证
- PluginErrorBoundary 不暴露错误堆栈给用户

### 6.5 CSP 策略

Phase 1a 通过 Core 提供的 `Content-Security-Policy` 头保护:

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

---

## 7. Mock 约束

### 7.1 MockACLWrapper

测试中替代 ACLProvider 的最小 mock 实现:

```typescript
// 当前实现（ponytail: minimal mock - returns children as-is）
function MockACLWrapper({ children }: { children: ReactNode; permissions: Set<string> }) {
  return <>{children}</>
}
```

**约束**:
- Phase 1a 当前实现为透传 mock（不检查权限）
- 集成阶段升级为接受 `aclPermissions: Set<string>` 并实现 `can()` / `canRoute()` 逻辑
- 测试需要精确权限控制时，直接 mock `useACL` Hook（`vi.mocked(useACL).mockReturnValue(...)`）

### 7.2 测试环境 Polyfill

`src/__tests__/setup.ts` 提供以下 jsdom 环境补丁:

| Polyfill | 原因 | 实现 |
|----------|------|------|
| `window.matchMedia` | antd 响应式组件依赖 | 返回 `matches: false` 的 mock |
| `window.ResizeObserver` | antd Layout/Table 依赖 | 空 `observe/unobserve/disconnect` |

### 7.3 全局测试清理

```typescript
// setup.ts
afterEach(() => {
  cleanup()      // RTL 自动卸载组件
})
```

### 7.4 vi.mock 辅助

`setup.ts` 提供 `globalThis.__wrapMockResult` 辅助函数，自动将 vi.mock 工厂返回值中的函数属性包装为 `vi.fn()`，支持 `.mockReturnValue()` 链式调用。

### 7.5 QueryClient 测试配置

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false },    // 测试中不重试
    mutations: { retry: false },
  },
})
```

### 7.6 renderWithProviders 约束

- 包裹 `QueryClientProvider` + `MockACLWrapper`
- 不包裹 `MemoryRouter`（当前实现不包含路由；需路由时测试自行添加）
- 不包裹 `ConfigProvider`（当前实现不包含 antd 主题；需主题时测试自行添加）
- 不包裹 `I18nextProvider`（当前实现不包含 i18n；需翻译时测试自行添加）

---

## 8. 变更记录

| 版本 | 日期 | 变更内容 |
|------|------|---------|
| v0.1.0 | 2026-07-16 | 初始 SDD 文档，对齐已实现源码（55 测试通过）+ D15-D24 决策 + admin-ui-tdd.md 测试计划 |
