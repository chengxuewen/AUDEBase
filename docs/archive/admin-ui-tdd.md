# Admin UI TDD 测试策略

> **模块**: `@audebase/admin-ui`  
> **依赖**: React 19, Ant Design 5, @ant-design/pro-components, react-i18next, @tanstack/react-query  
> **更新日期**: 2026-07-13  
> **参考**: D6 (Ant Design 5)、D18 (状态管理)、D19 (ACLProvider/ACLGuard)、D20 (ErrorBoundary)、frontend-spec.md §6、e2e-test-flows.md

---

## 1. 测试策略概述

Admin UI 测试分三层，各层工具和目标不同：

```
┌─────────────────────────────────────────────────────────┐
│  E2E (Playwright) — 5 core flows (auth/plugins/users/    │
│    roles/health) — 真实浏览器 + 真实后端                  │
├─────────────────────────────────────────────────────────┤
│  组件集成测试 (RTL) — jsdom 中渲染完整组件树，mock API   │
│    (MockACLWrapper + MockQueryClient + MockRouter)       │
├─────────────────────────────────────────────────────────┤
│  组件单元测试 (RTL) — 单组件孤立渲染，mock 所有依赖       │
└─────────────────────────────────────────────────────────┘
```

| 测试类型 | 最低用例数 | 环境 |
|---------|:---:|------|
| 组件单元测试 | 10+ | jsdom (RTL + vitest) |
| 组件集成测试 | 6+ | jsdom (RTL + vitest) |
| E2E 测试 | 5 流程 | Playwright + Docker PostgreSQL |

---

## 2. 测试基础设施

### 2.1 test-utils.tsx — 共享测试工具

```
packages/admin-ui/src/__tests__/test-utils.tsx
```

参考 dev-workflow.md §3.6 的 test-utils 和 frontend-spec.md §6 的 MockACLWrapper：

```typescript
import React, { type ReactElement } from 'react'
import { render, type RenderOptions } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nextProvider } from 'react-i18next'
import { ConfigProvider } from 'antd'
import i18n from '../i18n/client'

// ─── MockACLWrapper — 提供 ACLContext ───
interface ACLContextValue {
  can: (action: string, resource: string) => boolean
  canRoute: (snippet: string) => boolean
  permissions: Array<{ action: string; resource: string }>
  isLoading: boolean
}

const defaultACL: ACLContextValue = {
  can: () => true,
  canRoute: () => true,
  permissions: [{ action: 'manage', resource: '*' }],
  isLoading: false,
}

export function createMockACL(overrides: Partial<ACLContextValue> = {}): ACLContextValue {
  return { ...defaultACL, ...overrides }
}

export const MockACLWrapper: React.FC<{
  value?: Partial<ACLContextValue>
  children: React.ReactNode
}> = ({ value = {}, children }) => {
  const aclValue = createMockACL(value)
  return (
    <ACLContext.Provider value={aclValue}>
      {children}
    </ACLContext.Provider>
  )
}

// ─── 通用 renderWithProviders ───
interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  acl?: Partial<ACLContextValue>
  route?: string
  queryClient?: QueryClient
}

export function renderWithProviders(
  ui: ReactElement,
  options: RenderWithProvidersOptions = {},
) {
  const {
    acl = {},
    route = '/',
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },  // 测试中不重试
        mutations: { retry: false },
      },
    }),
    ...renderOptions
  } = options

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <ConfigProvider>
        <I18nextProvider i18n={i18n}>
          <QueryClientProvider client={queryClient}>
            <MockACLWrapper value={acl}>
              <MemoryRouter initialEntries={[route]}>
                {children}
              </MemoryRouter>
            </MockACLWrapper>
          </QueryClientProvider>
        </I18nextProvider>
      </ConfigProvider>
    )
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions })
}

// 重新导出 RTL
export { screen, within, fireEvent, waitFor, act } from '@testing-library/react'
export { userEvent } from '@testing-library/user-event'
```

### 2.2 vitest 配置

```
packages/admin-ui/vitest.config.ts
```

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    name: 'admin-ui',
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: { modules: { classNameStrategy: 'non-scoped' } },
    coverage: {
      provider: 'v8',
      thresholds: {
        lines: 80,
        branches: 60,
        functions: 70,
      },
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/__tests__/**',
        'src/**/*.test.{ts,tsx}',
        'src/index.tsx',
      ],
    },
  },
})
```

---

## 3. 组件单元测试 (RTL)

### 3.1 PluginListPage — ProTable 渲染

```
测试文件: packages/admin-ui/src/pages/plugins/__tests__/PluginListPage.test.tsx
```

参照 frontend-spec.md §6.1 的 5 个测试用例：

```typescript
import { describe, test, expect, vi } from 'vitest'
import {
  renderWithProviders,
  screen,
  waitFor,
} from '../../../__tests__/test-utils'
import { PluginListPage } from '../PluginListPage'

// Mock TanStack Query hooks
vi.mock('../hooks/usePlugins', () => ({
  usePlugins: () => ({
    data: {
      data: [
        { id: '1', name: '@audebase/plugin-core', display_name: '内核插件', version: '0.1.0', status: 'loaded', category: 'system' },
        { id: '2', name: '@audebase/plugin-rbac', display_name: '权限管理', version: '0.1.0', status: 'loaded', category: 'security' },
      ],
      meta: { count: 2, page: 1, pageSize: 20, totalPages: 1 },
    },
    isLoading: false,
    isError: false,
  }),
}))

describe('PluginListPage', () => {
  test('1. 加载状态：表格显示 loading', async () => {
    // Arrange
    vi.mocked(usePlugins).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as any)

    renderWithProviders(<PluginListPage />)
    // ProTable loading 状态下显示 Spin
    expect(screen.getByText(/加载中/i) || document.querySelector('.ant-spin')).toBeTruthy()
  })

  test('2. 列表渲染：表格显示插件名称和版本', async () => {
    // Arrange & Act
    renderWithProviders(<PluginListPage />)
    await waitFor(() => {
      expect(screen.getByText('内核插件')).toBeTruthy()
      expect(screen.getByText('@audebase/plugin-core')).toBeTruthy()
    })
  })

  test('3. 空状态：无插件时显示空状态', async () => {
    // Arrange
    vi.mocked(usePlugins).mockReturnValue({
      data: { data: [], meta: { count: 0, page: 1, pageSize: 20, totalPages: 0 } },
      isLoading: false,
      isError: false,
    } as any)

    renderWithProviders(<PluginListPage />)
    await waitFor(() => {
      expect(screen.getByText(/暂无/i) || document.querySelector('.ant-empty')).toBeTruthy()
    })
  })

  test('4. 错误状态：API 失败显示错误信息', async () => {
    // Arrange
    vi.mocked(usePlugins).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('网络错误'),
    } as any)

    renderWithProviders(<PluginListPage />)
    await waitFor(() => {
      expect(screen.getByText(/错误|失败|重试/i)).toBeTruthy()
    })
  })

  test('5. 启用/禁用按钮：admin 可见，member 不可见', async () => {
    // Arrange & Act
    // admin 用户 — 按钮可见
    const { unmount } = renderWithProviders(
      <PluginListPage />,
      { acl: { can: () => true } },
    )
    await waitFor(() => {
      expect(screen.queryAllByText(/启用|禁用/).length).toBeGreaterThan(0)
    })

    // 卸载后重新渲染 member 用户
    unmount()
    renderWithProviders(
      <PluginListPage />,
      { acl: { can: (_action, resource) => resource !== 'plugin' } },
    )
    await waitFor(() => {
      // member 无 plugin 权限 — 无启用/禁用按钮
      expect(screen.queryAllByText(/启用|禁用/).length).toBe(0)
    })
  })
})
```

### 3.2 ACLGuard 组件测试

```
测试文件: packages/admin-ui/src/components/__tests__/ACLGuard.test.tsx
```

```typescript
import { describe, test, expect } from 'vitest'
import { renderWithProviders, screen } from '../../__tests__/test-utils'
import { ACLGuard } from '../ACLGuard'

describe('ACLGuard', () => {
  test('有权限 → 渲染 children', () => {
    // Arrange & Act
    renderWithProviders(
      <ACLGuard action="read" resource="user">
        <button>删除用户</button>
      </ACLGuard>,
      { acl: { can: () => true } },
    )
    expect(screen.getByText('删除用户')).toBeTruthy()
  })

  test('无权限 → 不渲染 children (render null)', () => {
    // Arrange & Act
    renderWithProviders(
      <ACLGuard action="delete" resource="user">
        <button>删除用户</button>
      </ACLGuard>,
      { acl: { can: () => false } },
    )
    expect(screen.queryByText('删除用户')).toBeNull()
  })

  test('ACL 加载中 → render null (不闪烁)', () => {
    // Arrange & Act
    const { container } = renderWithProviders(
      <ACLGuard action="read" resource="user">
        <span>content</span>
      </ACLGuard>,
      { acl: { isLoading: true, can: () => false } },
    )
    expect(container.textContent).toBe('')
  })

  test('fallback 属性：无权限时渲染替代内容', () => {
    // Arrange & Act
    renderWithProviders(
      <ACLGuard
        action="delete" resource="user"
        fallback={<span>无权限</span>}
      >
        <button>删除用户</button>
      </ACLGuard>,
      { acl: { can: () => false } },
    )
    expect(screen.getByText('无权限')).toBeTruthy()
  })
})
```

### 3.3 ErrorBoundary 组件测试

```
测试文件: packages/admin-ui/src/components/__tests__/ErrorBoundary.test.tsx
```

```typescript
import { describe, test, expect, vi } from 'vitest'
import { renderWithProviders, screen, waitFor } from '../../__tests__/test-utils'
import { PluginErrorBoundary } from '../PluginErrorBoundary'

function BrokenComponent(): React.ReactElement {
  throw new Error('插件崩溃模拟')
}

describe('PluginErrorBoundary', () => {
  test('子组件崩溃 → 显示降级 UI', async () => {
    // Arrange
    // 抑制 React 错误输出
    vi.spyOn(console, 'error').mockImplementation(() => {})

    renderWithProviders(
      <PluginErrorBoundary pluginName="test-plugin">
        <BrokenComponent />
      </PluginErrorBoundary>,
    )

    await waitFor(() => {
      expect(screen.getByText(/test-plugin/i)).toBeTruthy()
      expect(screen.getByText(/崩溃|异常|错误/i)).toBeTruthy()
    })
  })

  test('降级 UI 包含重试按钮', async () => {
    // Arrange
    vi.spyOn(console, 'error').mockImplementation(() => {})

    renderWithProviders(
      <PluginErrorBoundary pluginName="test-plugin">
        <BrokenComponent />
      </PluginErrorBoundary>,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /重试/i })).toBeTruthy()
    })
  })

  test('降级 UI 包含返回首页链接', async () => {
    // Arrange
    vi.spyOn(console, 'error').mockImplementation(() => {})

    renderWithProviders(
      <PluginErrorBoundary pluginName="test-plugin">
        <BrokenComponent />
      </PluginErrorBoundary>,
    )

    await waitFor(() => {
      expect(screen.getByText(/首页|返回/i)).toBeTruthy()
    })
  })

  test('不暴露错误堆栈', async () => {
    // Arrange
    vi.spyOn(console, 'error').mockImplementation(() => {})

    renderWithProviders(
      <PluginErrorBoundary pluginName="test-plugin">
        <BrokenComponent />
      </PluginErrorBoundary>,
    )

    await waitFor(() => {
      expect(screen.queryByText(/at BrokenComponent/)).toBeNull()
      expect(screen.queryByText(/Error:/)).toBeNull()
    })
  })

  test('正常组件正常渲染', () => {
    // Arrange & Act
    renderWithProviders(
      <PluginErrorBoundary pluginName="test-plugin">
        <span>正常内容</span>
      </PluginErrorBoundary>,
    )
    expect(screen.getByText('正常内容')).toBeTruthy()
  })
})
```

### 3.4 ProLayout 菜单过滤测试

```
测试文件: packages/admin-ui/src/layout/__tests__/AdminLayout.test.tsx
```

```typescript
import { describe, test, expect, vi } from 'vitest'
import { renderWithProviders, screen, waitFor } from '../../__tests__/test-utils'
import { AdminLayout } from '../AdminLayout'

describe('AdminLayout 菜单权限过滤', () => {
  test('admin 显示全部菜单项', async () => {
    // Arrange & Act
    renderWithProviders(<AdminLayout />, {
      acl: { canRoute: () => true },
    })
    await waitFor(() => {
      expect(screen.getByText('插件管理')).toBeTruthy()
      expect(screen.getByText('用户管理')).toBeTruthy()
    })
  })

  test('member 仅显示有权限的菜单项', async () => {
    // Arrange & Act
    renderWithProviders(<AdminLayout />, {
      acl: {
        canRoute: (snippet: string) => !snippet.includes('plugin'),
      },
    })
    await waitFor(() => {
      // 无插件管理菜单
      expect(screen.queryByText('插件管理')).toBeNull()
      // 有用户管理菜单
      expect(screen.getByText('用户管理')).toBeTruthy()
    })
  })
})
```

---

## 4. 组件集成测试 (RTL)

### 4.1 TanStack Query 集成测试

```
测试文件: packages/admin-ui/src/hooks/__tests__/usePlugins.test.tsx
```

```typescript
import { describe, test, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { usePlugins } from '../usePlugins'

describe('usePlugins (TanStack Query 集成)', () => {
  test('queryKey 包含插件名前缀', async () => {
    // Arrange & Act
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })

    const { result } = renderHook(() => usePlugins(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    })

    await waitFor(() => {
      // queryKey 应包含 plugin name 前缀 (D18 约定)
      const queries = queryClient.getQueryCache().getAll()
      expect(queries.length).toBeGreaterThan(0)
      expect(queries[0].queryKey[0]).toBe('@audebase/admin-ui')
    })
  })

  test('API 返回数据自动缓存', async () => {
    // Arrange & Act
    const queryClient = new QueryClient()

    const { result } = renderHook(() => usePlugins(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    })

    await waitFor(() => {
      expect(result.current.data).toBeDefined()
    })
  })
})
```

### 4.2 Slot 注册测试

```typescript
describe('Slot 注册集成测试', () => {
  test('slot.add() 注册的组件在对应 Slot 位置渲染', () => {
    // Arrange & Act
    const slotRegistry = new SlotRegistry()
    slotRegistry.add('header.actions.right', {
      component: () => <span>通知</span>,
      order: 10,
    })

    const components = slotRegistry.get('header.actions.right')
    expect(components).toHaveLength(1)
    expect(components[0].order).toBe(10)
  })

  test('同 key 后注册覆盖', () => {
    // Arrange & Act
    const slotRegistry = new SlotRegistry()
    slotRegistry.add('header.actions.right', {
      component: () => <span>v1</span>,
      key: 'notifications',
    })
    slotRegistry.add('header.actions.right', {
      component: () => <span>v2</span>,
      key: 'notifications',
    })

    const components = slotRegistry.get('header.actions.right')
    expect(components).toHaveLength(1)
  })

  test('无注册组件时渲染 null', () => {
    // Arrange & Act
    const slotRegistry = new SlotRegistry()
    const components = slotRegistry.get('sidebar.bottom')
    expect(components).toHaveLength(0)
  })
})
```

---

## 5. E2E 测试 (Playwright)

E2E 测试完全参照 e2e-test-flows.md 定义的 5 条核心流程：

| 流程 | 文件 | preSeed | 关键用例 |
|------|------|------|----------|
| 认证 | `auth.e2e.ts` | `{ admin: true }` | 登录/错误密码/速率限制/Token刷新 |
| 插件管理 | `plugins.e2e.ts` | `{ admin: true, plugins: 'zero' }` | 列表/启用/禁用/ACL 控制 |
| 用户管理 | `users.e2e.ts` | `{ admin: true, tenant: 'e2e', users: [...] }` | CRUD/分页 |
| 角色管理 | `roles.e2e.ts` | `{ admin: true, roles: ['admin','member'] }` | 创建/分配权限 |
| 健康检查 | `health.e2e.ts` | `{}` | ProLayout 渲染/菜单导航 |

E2E 目录结构、Playwright 配置、preSeed 声明格式详见 e2e-test-flows.md。

---

## 6. 种子数据

### 6.1 前端测试种子

```
packages/admin-ui/src/__tests__/seeds/
├── users.ts       # seedTestUser() — 测试用户 mock
├── plugins.ts     # seedTestPlugins() — 测试插件数据
└── roles.ts       # seedTestRoles() — 测试角色
```

```typescript
// seeds/users.ts
export function seedTestUser(overrides: Partial<User> = {}): User {
  return {
    id: 'test-user-uuid',
    username: 'test-admin',
    token_version: 0,
    is_active: true,
    must_change_password: false,
    tenant_id: null,
    created_at: '2026-07-13T00:00:00Z',
    updated_at: '2026-07-13T00:00:00Z',
    ...overrides,
  }
}

// seeds/plugins.ts
export function seedTestPlugins(count: number = 5): Plugin[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `plugin-uuid-${i}`,
    name: `@audebase/plugin-test-${i}`,
    display_name: `测试插件 ${i}`,
    version: '0.1.0',
    status: i % 2 === 0 ? 'loaded' : 'disabled',
    category: 'test',
    description: `Test plugin ${i}`,
  }))
}
```

### 6.2 后端 (E2E) 种子

使用 e2e-test-flows.md §7 定义的 preSeed 模式和 seedE2EData() helper。

---

## 7. Mock 策略汇总

| 依赖 | 组件单元测试 | 组件集成测试 | E2E |
|------|:---------:|:---------:|:---:|
| ACLProvider | MockACLWrapper | MockACLWrapper | 真实后端 |
| TanStack Query | mock hook | QueryClientProvider wrapper | 真实 API |
| React Router | MemoryRouter | MemoryRouter | 真实路由 |
| react-i18next | I18nextProvider | I18nextProvider | 真实后端 |
| Ant Design | 真实渲染 | 真实渲染 | 真实渲染 |
| 后端 API | vi.fn() / msw | msw (Mock Service Worker) | 真实 Fastify |

**msw 设置示例**（组件集成测试）：

```typescript
// setup.ts — 全局 msw 配置
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'

export const server = setupServer(
  http.get('/api/plugins', () => {
    return HttpResponse.json({
      data: seedTestPlugins(3),
      meta: { count: 3, page: 1, pageSize: 20, totalPages: 1 },
    })
  }),
  http.post('/api/auth/login', () => {
    return HttpResponse.json({
      access_token: 'mock-token',
      refresh_token: 'mock-refresh',
      expires_in: 900,
      token_type: 'Bearer',
    })
  }),
)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
```

---

## 8. 覆盖率目标

| 指标 | 目标 | 说明 |
|------|:---:|------|
| 行覆盖率 | **80%+** | 对齐项目统一标准（testing.md） |
| 分支覆盖率 | **70%+** | 权限分支、加载/错误/空状态分支 |
| 函数覆盖率 | **80%+** | 页面组件 + hooks + 工具函数 |
| E2E | 5 流程 | 参照 e2e-test-flows.md |

**豁免项**（不计入覆盖率）：
- `src/index.tsx`（入口文件）
- `src/__tests__/**`（测试代码本身）
- `*.d.ts`（类型声明文件）

---

## 9. CI 集成

```yaml
admin-ui-test:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
    - run: pnpm install --frozen-lockfile
    - run: pnpm --filter @audebase/admin-ui test:unit
    - run: pnpm --filter @audebase/admin-ui test:coverage

admin-ui-e2e:
  runs-on: ubuntu-latest
  services:
    postgres:
      image: postgres:16-alpine
      env:
        POSTGRES_DB: audebase_e2e
        POSTGRES_USER: audebase
        POSTGRES_PASSWORD: audebase_test
      ports: ["5432:5432"]
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
    - run: pnpm install --frozen-lockfile
    - run: npx playwright install --with-deps chromium
    - run: npm run test:e2e
      env:
        DATABASE_URL: postgresql://audebase:audebase_test@localhost:5432/audebase_e2e
        AUDE_JWT_SECRET: ci-test-secret-at-least-32-characters-long
```

---

## 10. 用例汇总

| 测试类型 | 文件 | 用例数 |
|---------|------|:---:|
| 组件单元 | `PluginListPage.test.tsx` | 5 |
| 组件单元 | `ACLGuard.test.tsx` | 4 |
| 组件单元 | `ErrorBoundary.test.tsx` | 5 |
| 组件单元 | `AdminLayout.test.tsx` | 2 |
| 组件集成 | `usePlugins.test.tsx` | 2 |
| 组件集成 | Slot 注册 | 3 |
| E2E | `auth.e2e.ts` | 4 |
| E2E | `plugins.e2e.ts` | 4 |
| E2E | `users.e2e.ts` | 4 |
| E2E | `roles.e2e.ts` | 3 |
| E2E | `health.e2e.ts` | 2 |
| **合计** | | **38+** |

---

## 11. 反模式防范

| 禁止 | 正确做法 |
|------|---------|
| `as any` / `@ts-ignore` | 使用 proper typing + `unknown` 收窄 |
| `console.log` 在测试中 | 使用 vitest 断言 |
| 测试间共享可变状态 | 每个 test 独立 mock 重置 |
| 直接渲染 `<Route>` 组件 | 使用 `this.app.router.add()` API (D16) |
| 内联条件权限判断 | 使用 `ACLGuard` 或 `useACL().can()` (D19) |

---

## 12. 参考

- [frontend-spec.md](frontend-spec.md) §6 — 组件测试 (ProTable/RTL)
- [e2e-test-flows.md](e2e-test-flows.md) — 5 核心 E2E 流程
- [dev-workflow.md](dev-workflow.md) §3.6 — test-utils.tsx (MockACLWrapper)
- [test-seed-strategy.md](test-seed-strategy.md) — 种子数据工厂
- [redis-mock-guide.md](redis-mock-guide.md) — Redis/BullMQ mock
- [../../.agents/memorys/decisions.md](../../.agents/memorys/decisions.md) — D6-D24 前端决策

---

## 13. 契约测试

Admin UI 契约测试验证前端消费的 API 响应形状，基于 shared-types 定义的 Zod schema。

**测试文件**: `packages/admin-ui/src/__tests__/contracts/admin-api.contract.test.ts`

```typescript
import { describe, test, expect } from 'vitest'
import { z } from 'zod'
import { 
  pluginListSchema,
  paginatedUsersSchema, 
  paginatedRolesSchema,
  errorResponseSchema,
} from '@audebase/shared-types'
import { renderHook } from '@testing-library/react'
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'

// Mock Service Worker 模拟后端
const server = setupServer(
  http.get('/api/plugins', () => {
    return HttpResponse.json({
      data: [{ id: '1', name: '@audebase/plugin-core', displayName: 'Core', status: 'enabled', mode: 'inline', partition: 'SYSTEM', dependencies: [] }],
      meta: { count: 1, page: 1, pageSize: 20, totalPages: 1 },
    })
  }),
  http.get('/api/users', () => {
    return HttpResponse.json({
      data: [{ id: 'uuid-1', username: 'admin', is_active: true, created_at: '2026-01-01T00:00:00Z' }],
      meta: { count: 1, page: 1, pageSize: 20, totalPages: 1 },
    })
  }),
)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => server.resetHandlers())
afterAll(() => server.close())

describe('Admin API 契约测试', () => {
  test('GET /api/plugins 响应匹配 pluginListSchema', async () => {
    // Arrange & Act
    // Arrange
    const res = await fetch('/api/plugins')
    
    // Act
    const json = await res.json()

    // Assert
    expect(() => pluginListSchema.parse(json)).not.toThrow()
    expect(json.meta.count).toBe(1)
  })

  test('GET /api/users 响应匹配 paginatedUsersSchema', async () => {
    // Arrange & Act
    // Arrange & Act
    const res = await fetch('/api/users')
    const json = await res.json()

    // Assert
    expect(() => paginatedUsersSchema.parse(json)).not.toThrow()
  })

  test('401 响应匹配 errorResponseSchema', async () => {
    // Arrange
    // Arrange
    server.use(
      http.get('/api/plugins', () => {
        return HttpResponse.json({ error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } }, { status: 401 })
      }),
    )

    // Act
    const res = await fetch('/api/plugins')
    const json = await res.json()

    // Assert
    expect(res.status).toBe(401)
    expect(() => errorResponseSchema.parse(json)).not.toThrow()
  })
})
```

---

## 14. 上游 TDD 参考

以下模块定义了 Admin UI 依赖的契约：

- [shared-types-tdd.md](shared-types-tdd.md) — Zod schema 定义 (pluginListSchema/paginatedUsersSchema)
- [rbac-tdd.md](rbac-tdd.md) — Auth API 契约 (login/token)
- [plugin-framework-tdd.md](plugin-framework-tdd.md) — Plugin API 契约
- [audit-tdd.md](audit-tdd.md) — Audit API 契约
- [health-check-tdd.md](health-check-tdd.md) — Health API 契约
- [i18n-tdd.md](i18n-tdd.md) — i18n API 契约
