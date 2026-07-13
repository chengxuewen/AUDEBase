# Phase 1a E2E 测试流程

## 核心 5 条流程（Phase 1a 必须）

### 1. auth.e2e.ts — 认证流程

- 正常登录: POST /api/auth/login → 200 + access_token + refresh_token
- 错误密码: POST /api/auth/login → 401 + error code
- 速率限制: 连续 6 次失败登录 → 429 + Retry-After
- Token 刷新: POST /api/auth/refresh → 200 + 新 access_token

### 2. plugins.e2e.ts — 插件管理

- 列表展示: 登录后页面显示已安装插件列表（ProTable）
- 启用插件: 点击启用 → API POST /api/plugins/{name}/enable → 状态变为 enabled
- 禁用插件: 点击禁用 → API POST /api/plugins/{name}/disable → 状态变为 disabled
- 权限控制: member 用户不显示启用/禁用按钮（ACLGuard）

### 3. users.e2e.ts — 用户管理

- 创建用户: 填写表单 → 提交 → 列表刷新显示新用户
- 编辑用户: 点击编辑 → 修改信息 → 保存 → 验证更新
- 删除用户: 点击删除 → 确认 → 列表移除该用户
- 分页: 创建 15+ 用户 → 验证分页功能

### 4. roles.e2e.ts — 角色管理

- 创建角色: 填写角色名 + slug → 提交 → 角色列表显示
- 分配权限: 点击角色 → 勾选权限项 → 保存
- 角色列表: 验证 admin/member 等系统角色存在

### 5. health.e2e.ts — 基础健康检查

- ProLayout 渲染: 侧边栏菜单 + 面包屑
- 菜单导航: 点击"插件管理"→ URL 跳转 + 页面渲染
- 菜单导航: 点击"用户管理"→ URL 跳转 + 页面渲染

## Stretch Goal（Phase 1a 可选）

### 6. audit-logs.e2e.ts — 审计日志只读浏览

### 7. rbac.e2e.ts — 权限隔离（admin 全菜单 vs member 部分菜单）

### 8. error-boundary.e2e.ts — 插件崩溃降级 UI

### 9. multi-tenant.e2e.ts — 租户数据隔离

### 10. rate-limit.e2e.ts — 全局限流 429 响应

## 文件位置

```
packages/admin-ui/__e2e__/
├── auth.e2e.ts
├── plugins.e2e.ts
├── users.e2e.ts
├── roles.e2e.ts
├── health.e2e.ts
├── global-setup.ts      (seed test DB)
├── auth.fixture.ts      (login + storageState)
└── .auth/admin.json     (cached auth state)
```

## Playwright 配置要点

```typescript
// playwright.config.ts
export default defineConfig({
  testDir: './packages/admin-ui/__e2e__',
  globalSetup: './packages/admin-ui/__e2e__/global-setup.ts',
  use: {
    baseURL: 'http://localhost:3000',
    storageState: 'packages/admin-ui/__e2e__/.auth/admin.json',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium' }],
  webServer: {
    command: 'AUDE_DEV=1 npx aude dev --testing',
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
})
```

## 7. Test Data Pre-Seeding Strategy

Each E2E flow spec declares a `preSeed` section listing the minimal data required for that flow to execute. This ensures tests are self-contained, reproducible, and independent of manual database setup.

### preSeed Declaration Pattern

```typescript
// Example: auth.e2e.ts preSeed declaration
export const preSeed = {
  admin: true,
  tenant: 'e2e-tenant',
} as const
```

The preSeed declaration is consumed by a global `seedE2EData()` helper that calls the factory functions defined in `docs/modules/test-seed-strategy.md`. <!-- Seed factory functions defined in test-seed-strategy.md. Actual files created in Phase 1a Week 1. --> Each factory is idempotent — it checks for existing records before inserting.

### Flow-by-Flow Seed Requirements

#### Flow 1: auth.e2e.ts — Authentication

```typescript
export const preSeed = {
  admin: true,  // seedAdminUser(): admin / Admin@123 / token_version=0
}

// Required for:
//   - Normal login (admin + valid password)
//   - Wrong password (admin + incorrect password → 401)
//   - Rate limiting (admin + 6 rapid failed attempts → 429)
//   - Token refresh (admin login → get refresh_token → POST /api/auth/refresh)
```

#### Flow 2: plugins.e2e.ts — Plugin Management

```typescript
export const preSeed = {
  admin: true,      // seedAdminUser() — required for login + UI access
  plugins: 'zero',  // start with 0 plugins; test creates one, verifies list, disables, verifies status change
}

// Required for:
//   - List display: ProTable renders with empty state
//   - Enable plugin: test installs plugin → clicks Enable → POST /api/plugins/{name}/enable → status=loaded
//   - Disable plugin: clicks Disable → POST /api/plugins/{name}/disable → status=disabled
//   - ACL guard: member user (no admin role) sees no Enable/Disable buttons
```

#### Flow 3: users.e2e.ts — User Management

```typescript
export const preSeed = {
  admin: true,
  tenant: 'e2e-tenant',  // seedTestTenant()
  users: [{
    username: 'pre-seeded-editor',
    role: 'member',
    is_active: true,
  }],  // initial test user present before test runs
}

// Required for:
//   - Create user: test fills form → submit → list shows 'pre-seeded-editor' + new user
//   - Edit user: clicks Edit on 'pre-seeded-editor' → modifies → saves → validates update
//   - Delete user: test creates a 2nd user → deletes it → list reverts to pre-seeded-editor only
//   - Pagination: create 15+ users via API → verify pagination controls appear
```

#### Flow 4: roles.e2e.ts — Role Management

```typescript
export const preSeed = {
  admin: true,
  roles: ['admin', 'member'],  // seedAdminRole() + seedMemberRole() with default permissions
}

// Required for:
//   - Create role: test creates 'auditor' role → submits → role list shows admin, member, auditor
//   - Assign permissions: clicks 'auditor' → checks permission items → saves
//   - Role list: verifies admin and member exist in the list on page load
```

#### Flow 5: health.e2e.ts — Basic Health Check

```typescript
export const preSeed = {} as const  // nothing — no auth needed for /health endpoint

// Required for:
//   - ProLayout render: page loads without authentication
//   - Menu navigation: click menu items → URL updates + page content renders
```

### Playwright Setup/Teardown Integration

Each E2E spec file uses Playwright's `test.beforeEach` to invoke seed data before the test suite runs:

```typescript
// auth.e2e.ts
import { test } from '@playwright/test';
import { seedE2EData } from '../test-helpers/seed-e2e';

export const preSeed = {
  admin: true,
} as const;

test.describe('Auth Flow', () => {
  test.beforeEach(async () => {
    await seedE2EData(preSeed);
  });

  test('normal login returns 200', async ({ page }) => {
    await page.goto('/login');
    await page.fill('[name="username"]', 'admin');
    await page.fill('[name="password"]', 'Admin@123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/admin');
  });
});
```

The `seedE2EData()` helper dispatches to the factory functions defined in `docs/modules/test-seed-strategy.md` (see `test-seed-strategy.md`). <!-- Seed factory functions defined in test-seed-strategy.md. Actual files created in Phase 1a Week 1. --> It uses a database transaction wrapper to guarantee cleanup between test files.

```typescript
// core/src/__tests__/helpers/seed-e2e.ts
import { seedAdminUser } from '../seeds/admin'; // Valid after Phase 1a Week 1 — contract defined in test-seed-strategy.md
import { seedTestTenant } from '../seeds/tenant'; // Valid after Phase 1a Week 1 — contract defined in test-seed-strategy.md

interface PreSeedConfig {
  admin?: boolean;
  tenant?: string;
  plugins?: 'zero';
  users?: Array<{ username: string; role: string; is_active: boolean }>;
  roles?: string[];
}

export async function seedE2EData(config: PreSeedConfig): Promise<void> {
  if (config.admin) {
    await seedAdminUser(testApp);
  }
  if (config.tenant) {
    await seedTestTenant(testApp, config.tenant);
  }
  // ... remaining seed dispatches
}
```

### CI Integration

Phase 1a E2E tests run against a real PostgreSQL instance provisioned by Docker Compose in CI. The full pipeline:

```yaml
# .github/workflows/e2e.yml (excerpt)
jobs:
  e2e:
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: audebase_e2e
          POSTGRES_USER: audebase
          POSTGRES_PASSWORD: audebase_test
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: pnpm install
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
        env:
          DATABASE_URL: postgresql://audebase:audebase_test@localhost:5432/audebase_e2e
```

The `npm run test:e2e` script executes the following sequence:

1. Spin up PostgreSQL container (handled by CI `services` or local `docker compose up -d postgres`)
2. Run database migrations: `aude db:migrate`
3. Execute `global-setup.ts` — sets up storage state (admin auth cookie)
4. Run Playwright test files — each file calls `seedE2EData(preSeed)` in `test.beforeEach`
5. Teardown: Playwright exits; CI tears down PostgreSQL container automatically

For local development, the identical flow runs via:

```bash
docker compose up -d postgres   # start PostgreSQL
npm run test:e2e               # migrate → seed → playwright → reports
docker compose down            # tear down
```

### Design Decisions

| Decision | Rationale |
|----------|-----------|
| Real PostgreSQL, not mock | Phase 1a DDL (table creation, migrations, constraints) only validated against real PG |
| `preSeed` per file | Each flow declares its own deps — no hidden cross-test coupling |
| Idempotent factories | `test.beforeEach` can be called multiple times without duplicate data |
| Transaction-based cleanup | Each test file wraps in a transaction; rollback on completion ensures clean slate for next file |
| No `as any` / `@ts-ignore` in seed helpers | All seed functions return typed records; `PreSeedConfig` interface enforces shape |
| Separate `seedE2EData()` from `createTestApp().seeds` | E2E tests interact with the full running server, not an isolated TestApp instance — seed operates via API or direct DB connection |
