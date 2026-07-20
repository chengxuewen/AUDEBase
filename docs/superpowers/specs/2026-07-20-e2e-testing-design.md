# E2E 自动化测试设计 — AUDEBase 管理后台

**创建日期**: 2026-07-20
**状态**: 设计已确认，待实施
**关联决策**: D6 (Ant Design 5), D16 (ProLayout)

---

## 1. 问题

AUDEBase 管理后台 9 个页面仅通过 React Testing Library mock 测试（22 测试文件），无真实浏览器 E2E 测试。人工回归测试耗时且遗漏 bug。

## 2. 目标

为全部 9 个管理后台页面建立 Playwright E2E 自动化测试，覆盖 CRUD 操作、权限、错误状态、分页等核心交互。测试运行在真实 Docker 后端环境上。

## 3. 架构

```
docker compose up -d (PostgreSQL 16 + Valkey 8)
        ↓
pnpm dev (Fastify :5110 + Vite :5173)
        ↓
pnpm test:e2e (Playwright → 浏览器 → localhost:5173 → API localhost:5110)
        ↓
报告输出 (screenshots, traces, HTML report)
```

### 3.1 端口分配

| 服务 | 端口 | 说明 |
|------|------|------|
| Fastify 后端 | 5110 | Core + 所有插件 |
| Vite 前端 | 5173 | Admin UI dev server |
| PostgreSQL | 5432 | Docker |
| Valkey | 6379 | Docker |

### 3.2 playwright.config.ts

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
  projects: [{ name: 'chromium' }],
  webServer: [
    {
      command: 'pnpm --filter @audebase/core dev --port 5110',
      port: 5110,
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
│   ├── fixtures/
│   │   └── auth.ts              # 登录 fixture (storageState 复用)
│   ├── seeds/
│   │   └── e2e-seed.ts          # admin 用户 + 默认角色 + 测试租户
│   ├── login.e2e.ts             # 登录流程
│   ├── dashboard.e2e.ts         # 仪表盘
│   ├── users.e2e.ts             # 用户 CRUD
│   ├── roles.e2e.ts             # 角色管理
│   ├── plugins.e2e.ts           # 插件管理
│   ├── plugin-list.e2e.ts       # 插件列表
│   ├── audit.e2e.ts             # 审计日志
│   ├── extensions.e2e.ts        # 扩展列表
│   └── schema.e2e.ts            # Schema 管理
└── playwright.config.ts
```

## 5. 测试场景

### 5.1 LoginPage (6 场景)
| 场景 | 操作 | 验证 |
|------|------|------|
| 正常登录 | 输入正确用户名密码 → 点击登录 | 跳转 /admin, token 存储 |
| 错误密码 | 输入错误密码 → 点击登录 | 错误 toast 出现 |
| 空表单 | 不填任何字段 → 点击登录 | 表单校验错误提示 |
| 登出 | 登录后点击登出 | 跳转 /login |
| Token 过期 | 模拟过期 token → 访问页面 | 自动跳转 /login |
| 速率限制 | 连续 5 次错误密码 | 限流提示 |

### 5.2 DashboardPage (3 场景)
| 场景 | 操作 | 验证 |
|------|------|------|
| 默认渲染 | 登录后进入仪表盘 | 统计卡片存在、菜单可用 |
| 菜单导航 | 点击侧边栏菜单项 | 正确跳转到对应页面 |
| 响应式 | 缩小浏览器窗口 | 侧边栏折叠 |

### 5.3 UserManagementPage (7 场景)
| 场景 | 操作 | 验证 |
|------|------|------|
| 列表加载 | 导航到用户管理 | ProTable 渲染、数据出现 |
| 分页 | 点击下一页 | 数据变化 |
| 创建用户 | 点击创建 → 填写表单 → 提交 | 新行出现、成功 toast |
| 编辑用户 | 点击编辑 → 修改邮箱 → 保存 | 行数据更新 |
| 删除用户 | 点击删除 → 确认弹窗 → 确认 | 行消失 |
| 搜索过滤 | 输入搜索关键字 | 过滤后结果显示 |
| 空状态 | 搜索不存在的用户 | 空状态 UI |

### 5.4 RoleManagementPage (6 场景)
| 场景 | 操作 | 验证 |
|------|------|------|
| 角色列表 | 导航到角色管理 | ProTable 渲染 |
| 创建角色 | 创建新角色 | 列表中新增行 |
| 编辑权限 | 点击角色 → 勾选/取消权限 | 权限树状态变化 |
| 删除角色 | 删除角色 → 确认 | 行消失 |
| 空权限 | 创建无权限角色 | 提示无权限 |
| 角色名重复 | 创建重名角色 | 错误提示 |

### 5.5 PluginManagementPage (6 场景)
| 场景 | 操作 | 验证 |
|------|------|------|
| 插件列表 | 导航到插件管理 | 插件卡片/列表渲染 |
| 启用插件 | 点击启用 → 确认 | 状态变为已启用 |
| 禁用插件 | 点击禁用 → 确认 | 状态变为已禁用 |
| 查看详情 | 点击插件 → 详情面板 | 详情内容正确 |
| 搜索插件 | 搜索插件名 | 过滤结果 |
| 加载状态 | 等待插件列表加载 | 加载动画出现→消失 |

### 5.6 PluginListPage (5 场景)
| 场景 | 操作 | 验证 |
|------|------|------|
| 列表渲染 | 导航到插件列表 | 表格出现 |
| 卸载插件 | 点击卸载 → 确认 | 行消失 |
| 卸载失败 | 模拟卸载失败 | 错误 toast |
| 批量操作 | 多选 → 批量启用 | 状态批量变化 |
| 空列表 | 无插件时 | 空状态 UI |

### 5.7 AuditLogPage (5 场景)
| 场景 | 操作 | 验证 |
|------|------|------|
| 列表加载 | 导航到审计日志 | 审计记录渲染 |
| 按资源筛选 | 选择资源类型 | 过滤结果显示 |
| 时间范围 | 选择日期范围 | 过滤结果 |
| 分页 | 切换页码 | 数据变化 |
| 详情展开 | 点击记录展开详情 | 变更前后值显示 |

### 5.8 ExtensionListPage (4 场景)
| 场景 | 操作 | 验证 |
|------|------|------|
| 列表渲染 | 导航到扩展列表 | 扩展卡片/列表出现 |
| 查看详情 | 点击扩展 | 详情面板展示 |
| 搜索 | 搜索扩展名 | 过滤结果 |
| 空状态 | 无扩展时 | 空状态提示 |

### 5.9 SchemaPage (6 场景)
| 场景 | 操作 | 验证 |
|------|------|------|
| Schema 列表 | 导航到 Schema 管理 | Collection 列表渲染 |
| 创建 Collection | 点击新建 → 填写 → 提交 | 新 Collection 出现 |
| 添加字段 | 点击 Collection → 添加字段 | 字段表单渲染、DDL 预览 |
| 编辑字段 | 编辑现有字段 | 字段属性更新 |
| 删除 Collection | 删除 → 确认 | 列表项消失 |
| 字段类型 | 测试各字段类型 (string/number/boolean/date) | 对应正确 antd 组件 |

## 6. 种子数据策略

- **beforeAll**: 通过 API 调用创建 admin 用户、默认角色 (admin/member)、测试租户
- **storageState**: Playwright fixture 缓存登录态，避免每个文件重复登录
- **数据隔离**: 所有创建/修改在测试完成后通过 API 清理

```typescript
// fixtures/auth.ts
export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: 'packages/admin-ui/__e2e__/.auth/admin.json'
    })
    const page = await context.newPage()
    await use(page)
    await context.close()
  }
})
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
        image: postgres:16
        env: { POSTGRES_PASSWORD: audebase_test }
        ports: ['5432:5432']
      valkey:
        image: valkey/valkey:8-alpine
        ports: ['6379:6379']
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install
      - run: pnpm build
      - run: pnpm db:migrate
      - run: pnpm exec playwright install chromium --with-deps
      - run: pnpm test:e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

## 8. package.json 脚本

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

1. 更新 playwright.config.ts (端口 5110/5173, webServer 启动前后端)
2. 创建 `__e2e__/fixtures/auth.ts` (登录 fixture + storageState)
3. 创建 `__e2e__/seeds/e2e-seed.ts` (种子数据)
4. 编写 9 个 .e2e.ts 文件 (~50 场景)
5. 配置 CI workflow
6. 验证本地运行通过
7. 验证 CI 运行通过
