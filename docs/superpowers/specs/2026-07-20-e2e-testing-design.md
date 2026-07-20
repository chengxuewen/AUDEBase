# E2E 自动化测试设计 — AUDEBase 管理后台

**创建日期**: 2026-07-20
**状态**: 设计已确认，团队审核通过
**关联决策**: D6 (Ant Design 5), D16 (ProLayout)

---

## 1. 问题

AUDEBase 管理后台 9 个页面仅通过 React Testing Library mock 测试（22 测试文件），无真实浏览器 E2E 测试。人工回归测试耗时且遗漏 bug。

## 2. 目标

为全部 9 个管理后台页面建立 Playwright E2E 自动化测试，覆盖 CRUD 操作、权限、错误状态、分页等核心交互。测试运行在真实 Docker 后端环境上。

## 3. 架构

```
本地: docker compose up -d (PostgreSQL 16 + Valkey 8)
CI:   GitHub service containers (postgres:16-alpine + valkey/valkey:8-alpine)
        ↓
pnpm dev (Fastify :3000 + Vite :5173)
        ↓
pnpm test:e2e (Playwright → 浏览器 → localhost:5173 → API localhost:3000)
        ↓
报告输出 (screenshots, traces, HTML report)
```

### 3.1 端口分配

| 服务 | 端口 | 说明 |
|------|------|------|
| Fastify 后端 | 3000 | Core + 所有插件 (AUDE_PORT 环境变量, 默认 3000) |
| Vite 前端 | 5173 | Admin UI dev server |
| PostgreSQL | 5432 | Docker |
| Valkey | 6379 | Docker |

### 3.2 playwright.config.ts

> 更新项目根目录已有的 `playwright.config.ts`。

```typescript
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './packages/admin-ui/__e2e__',
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  use: {
    baseURL: 'http://localhost:5173',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'chromium',
      use: {
        storageState: 'packages/admin-ui/__e2e__/.auth/admin.json',
      },
      dependencies: ['setup'],
    },
  ],
  webServer: [
    {
      command: 'AUDE_PORT=3000 npx aude dev',
      port: 3000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npx vite packages/admin-ui --port 5173',
      port: 5173,
      reuseExistingServer: !process.env.CI,
    },
  ],
})
```

## 4. 目录结构

```
packages/admin-ui/
├── __e2e__/
│   ├── global-setup.ts           # DB 重置 + 种子数据
│   ├── auth.setup.ts             # 登录 → 写入 storageState
│   ├── .auth/
│   │   └── admin.json            # 缓存的登录态 (gitignore)
│   ├── login.e2e.ts              # 登录流程
│   ├── dashboard.e2e.ts          # 仪表盘
│   ├── users.e2e.ts              # 用户 CRUD
│   ├── roles.e2e.ts              # 角色管理
│   ├── plugins.e2e.ts            # 插件管理 (含 PluginList 场景)
│   ├── audit.e2e.ts              # 审计日志
│   ├── extensions.e2e.ts         # 扩展列表
│   └── schema.e2e.ts             # Schema 管理
├── src/
│   └── __tests__/                # 现有 RTL 测试 (保持不变)
└── vitest.config.ts
```

## 5. 测试场景

### 5.1 Phase 1 — MVP (5 文件, ~22 场景, 预计 2-3 分钟)

**优先交付**，覆盖登录、用户 CRUD、角色管理、插件启禁。

#### LoginPage (6 场景)
| 场景 | 操作 | 验证 |
|------|------|------|
| 正常登录 | 输入正确用户名密码 → 点击登录 | 跳转 /admin |
| 错误密码 | 输入错误密码 → 点击登录 | 错误 toast 出现 |
| 空表单 | 不填任何字段 → 点击登录 | 表单校验错误提示 |
| 登出 | 登录后点击登出 | 跳转 /login |
| Token 过期 | 模拟过期 token → 访问页面 | 自动跳转 /login |
| 已登录访问登录页 | 已登录状态访问 /login | 自动跳转 /admin |

#### DashboardPage (5 场景)
| 场景 | 操作 | 验证 |
|------|------|------|
| 默认渲染 | 登录后进入仪表盘 | 统计卡片存在、菜单可用 |
| 菜单导航 | 点击侧边栏菜单项 | 正确跳转到对应页面 |
| Stats API 失败 | Mock API 返回 500 | 错误状态或降级 UI 显示 |
| 空数据 | 无统计数据时 | 空状态或零值正确渲染 |
| 租户切换 | 切换租户 | 数据重新加载、菜单不变 |

#### UserManagementPage (7 场景)
| 场景 | 操作 | 验证 |
|------|------|------|
| 列表加载 | 导航到用户管理 | ProTable 渲染、数据出现 |
| 分页 | 点击下一页 | 数据变化 |
| 创建用户 | 点击创建 → 填写表单 → 提交 | 新行出现、成功 toast |
| 编辑用户 | 点击编辑 → 修改邮箱 → 保存 | 行数据更新 |
| 删除用户 | 点击删除 → 确认弹窗 → 确认 | 行消失 |
| 表单校验 | 重复邮箱/无效格式 → 提交 | 校验错误提示 |
| 搜索过滤 | 输入搜索关键字 | 过滤后结果显示 |

#### RoleManagementPage (6 场景)
| 场景 | 操作 | 验证 |
|------|------|------|
| 角色列表 | 导航到角色管理 | ProTable 渲染 |
| 创建角色 | 创建新角色 | 列表中新增行 |
| 编辑权限 | 点击角色 → 勾选/取消权限 | 权限树状态变化 |
| 删除角色 | 删除角色 → 确认 | 行消失 |
| 角色名重复 | 创建重名角色 | 错误提示 |
| 角色含用户 | 删除已分配用户的角色 | 错误或提示 |

#### plugins.e2e.ts (8 场景 — 合并 PluginManagement + PluginList)
| 场景 | 操作 | 验证 |
|------|------|------|
| 插件列表 | 导航到插件管理 | 插件卡片/表格渲染 |
| 启用插件 | 点击启用 → 确认 | 状态变为已启用 |
| 禁用插件 | 点击禁用 → 确认 | 状态变为已禁用 |
| 启用失败 | Mock API 失败 | 错误 toast + 状态不变 |
| 查看详情 | 点击插件 → 详情面板 | 详情内容正确 |
| 搜索插件 | 搜索插件名 | 过滤结果 |
| 卸载插件 | 点击卸载 → 确认 | 行消失 |
| 批量操作 | 多选 → 批量启用 | 状态批量变化 |

### 5.2 Phase 2 — 完整套件 (+4 文件, ~22 场景)

#### AuditLogPage (5 场景)
| 场景 | 操作 | 验证 |
|------|------|------|
| 列表加载 | 导航到审计日志 | 审计记录渲染 |
| 按资源筛选 | 选择资源类型 | 过滤结果显示 |
| 时间范围 | 选择日期范围 | 过滤结果 |
| 组合筛选 | 资源 + 日期 组合 | 过滤后结果正确 |
| 空状态 | 筛选无结果 | 空状态 UI |

#### ExtensionListPage (4 场景)
| 场景 | 操作 | 验证 |
|------|------|------|
| 列表渲染 | 导航到扩展列表 | 扩展卡片出现 |
| 查看详情 | 点击扩展 | 详情面板展示 |
| 搜索 | 搜索扩展名 | 过滤结果 |
| 空状态 | 无扩展时 | 空状态提示 |

#### SchemaPage (7 场景)
| 场景 | 操作 | 验证 |
|------|------|------|
| Schema 列表 | 导航到 Schema 管理 | Collection 列表渲染 |
| 创建 Collection | 点击新建 → 填写 → 提交 | 新 Collection 出现 |
| 重复名称 | 创建重名 Collection | 校验错误提示 |
| 添加字段 | 点击 Collection → 添加字段 | 字段表单渲染、DDL 预览 |
| 编辑字段 | 编辑现有字段 | 字段属性更新 |
| 删除 Collection | 删除 → 确认 | 列表项消失 |
| DDL 预览 | 添加字段后查看 DDL | DDL 语句与字段定义一致 |

## 6. 种子数据与清理策略

### 6.1 策略：DB 级别种子 + 全局清理

不通过 API 逐条创建/删除数据。取而代之：

- **global-setup.ts**: 在测试套件启动前，通过 `pnpm db:migrate` 确保表结构，然后通过 SQL/API 写入种子数据（admin 用户、默认角色 admin/member、测试租户、预注册插件）。
- **auth.setup.ts**: 使用 Playwright 执行一次登录，将 cookie/localStorage 写入 `storageState` 文件。后续所有测试复用此文件，无需重复登录。
- **数据隔离**: 每个测试文件创建的数据在测试结束自行清理（`afterEach` 中删除），或依赖 DB 级别重置（CI 每次启动新容器，本地可手动 `pnpm db:reset`）。
- **CI**: GitHub 每次创建全新 PostgreSQL 容器，天然隔离。

### 6.2 预埋数据清单

| 数据类型 | 用途 | 数量 |
|----------|------|------|
| admin 用户 | 登录、操作主体 | 1 |
| 默认角色 (admin/member) | 权限分配 | 2+ |
| 测试租户 | 多租户测试 | 1 |
| 预注册插件 | PluginManagementPage | 3+ |
| 预置用户 (test1/test2) | User CRUD 测试 | 2+ |

### 6.3 data-testid 命名约定

所有交互元素使用 `data-testid` 属性，避免依赖中文文本或 CSS 类名：

```typescript
// 约定: data-testid="<page>.<element>"
// 示例:
await page.getByTestId('users-create-btn').click()
await page.getByTestId('login-username-input').fill('admin')
await page.getByTestId('plugin-enable-btn-rbac').click()
```

## 7. CI 集成

```yaml
# .github/workflows/e2e.yml
name: E2E Tests
on: [push, pull_request]
jobs:
  e2e:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: audebase
          POSTGRES_PASSWORD: audebase_test
          POSTGRES_DB: audebase_test
        ports: ['5432:5432']
        options: >-
          --health-cmd pg_isready
          --health-interval 5s
          --health-timeout 5s
          --health-retries 5
      valkey:
        image: valkey/valkey:8-alpine
        ports: ['6379:6379']
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install
      - run: pnpm build
      - run: pnpm db:migrate
      - run: npx playwright install --with-deps chromium
      - run: pnpm test:e2e
        env:
          DATABASE_URL: postgresql://audebase:audebase_test@localhost:5432/audebase_test
          REDIS_URL: redis://localhost:6379
          AUDE_JWT_SECRET: ci-e2e-test-jwt-secret-at-least-32-chars-long
          AUDE_PORT: "3000"
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

## 8. package.json 脚本

在根 `package.json` 中新增：

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:report": "playwright show-report"
  }
}
```

## 9. 实施步骤

### Phase 1 — MVP (~22 场景, 5 文件)
1. 更新根目录 `playwright.config.ts` (端口 3000/5173, setup 项目, storageState)
2. 创建 `__e2e__/global-setup.ts` (DB 重置 + 种子数据脚本)
3. 创建 `__e2e__/auth.setup.ts` (登录 → 写入 storageState)
4. 编写 5 个 Phase 1 e2e 文件: login, dashboard, users, roles, plugins
5. 新增 `pnpm test:e2e` 脚本到根 package.json
6. 配置 CI workflow (`.github/workflows/e2e.yml`)
7. 本地验证: `docker compose up -d && pnpm db:migrate && pnpm test:e2e`
8. CI 验证通过

### Phase 2 — 完整套件 (+22 场景, +4 文件)
9. 编写 audit.e2e.ts, extensions.e2e.ts, schema.e2e.ts（dashboard 补充场景已含在 MVP 中）
10. 归档旧的 `docs/modules/e2e-test-flows.md`（被本 spec 取代）
11. 全量回归验证
