# Week 0 — CI/CD 与基础设施搭建指南

> **创建日期**: 2026-07-13  
> **来源**: `docs/phase-planning.md` §Week 0、`docs/modules/dev-workflow.md` §1、`docs/modules/tech-stack.md`、`docs/modules/shared-types-sdd.md`、`docs/modules/shared-types-tdd.md`  
> **责任人**: Person A（基础设施）+ Person D（前端兼容性验证）  
> **预计工时**: 4.5 天（并行 2 人）  

---

## 目录

1. [Turborepo + pnpm Workspace 初始化](#1-turborepo--pnpm-workspace-初始化)
2. [TypeScript 基础配置](#2-typescript-基础配置)
3. [Vitest 配置 + 80% 覆盖率门禁](#3-vitest-配置--80-覆盖率门禁)
4. [GitHub Actions CI 流水线](#4-github-actions-ci-流水线)
5. [Docker Compose 开发环境](#5-docker-compose-开发环境)
6. [React 19 + Ant Design 5 兼容性验证](#6-react-19--ant-design-5-兼容性验证)
7. [Prettier + ESLint 配置](#7-prettier--eslint-配置)
8. [Husky Pre-commit Hooks](#8-husky-pre-commit-hooks)
9. [shared-types 包初始化](#9-shared-types-包初始化)
10. [验证清单](#10-验证清单)

---

## 1. Turborepo + pnpm Workspace 初始化

### 1.1 前提条件

确保已安装以下工具版本：

```bash
# 验证已安装版本
node --version            # >= v22.x
pnpm --version            # >= 9.x (推荐 9.15+)
git --version             # >= 2.40
docker --version          # >= 24.x (可选，但推荐)
docker compose version    # >= 2.24 (可选，但推荐)
```

> 参考 `docs/modules/tech-stack.md`: Node.js v22+, pnpm workspace, Turborepo 构建

### 1.2 根 package.json

```bash
# 在项目根目录执行
pnpm init
```

编辑 `package.json`：

```json
{
  "name": "audebase",
  "version": "0.1.0",
  "private": true,
  "description": "AUDEBase — 企业应用开发平台",
  "packageManager": "pnpm@9.15.4",
  "engines": {
    "node": ">=22.0.0",
    "pnpm": ">=9.0.0"
  },
  "scripts": {
    "dev": "pnpm --filter @audebase/core dev",
    "build": "turbo run build",
    "test": "turbo run test",
    "test:coverage": "turbo run test:coverage",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "format": "prettier --write \"packages/*/src/**/*.{ts,tsx,js,jsx,json}\"",
    "format:check": "prettier --check \"packages/*/src/**/*.{ts,tsx,js,jsx,json}\"",
    "clean": "turbo run clean && rm -rf node_modules .turbo",
    "prepare": "husky"
  },
  "devDependencies": {
    "turbo": "^2.3.0",
    "husky": "^9.1.0",
    "lint-staged": "^15.2.0",
    "prettier": "^3.4.0",
    "typescript": "^5.7.0",
    "@types/node": "^22.0.0"
  }
}
```

### 1.3 pnpm-workspace.yaml

```yaml
packages:
  - 'packages/*'
  - 'plugins/*'
```

### 1.4 turbo.json

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": ["tsconfig.base.json", ".env"],
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"],
      "inputs": ["src/**/*.ts", "src/**/*.tsx", "tsconfig.json"]
    },
    "test": {
      "dependsOn": ["build"],
      "inputs": ["src/**/*.ts", "src/**/*.tsx", "vitest.config.ts"]
    },
    "test:coverage": {
      "dependsOn": ["build"],
      "inputs": ["src/**/*.ts", "src/**/*.tsx", "vitest.config.ts"]
    },
    "lint": {
      "inputs": ["src/**/*.ts", "src/**/*.tsx"]
    },
    "typecheck": {
      "dependsOn": ["^build"],
      "inputs": ["src/**/*.ts", "src/**/*.tsx", "tsconfig.json"]
    },
    "clean": {
      "cache": false
    }
  }
}
```

### 1.5 .gitignore

```gitignore
node_modules/
.turbo/
dist/
.env
*.log
coverage/
.sisyphus/
```

> 补充现有 `.gitignore`（当前已排除 `.sisyphus/`，需确保 `dist/` 和 `.turbo/` 也被排除）

### 1.6 初始化验证

```bash
# 安装依赖
pnpm install

# 创建 packages/ 目录结构
mkdir -p packages/core/src
mkdir -p packages/shared-types/src
mkdir -p packages/cli/src
mkdir -p packages/rbac/src
mkdir -p packages/audit/src
mkdir -p packages/migration/src
mkdir -p packages/i18n/src
mkdir -p packages/plugin-core/src
mkdir -p packages/admin-ui/src
mkdir -p plugins

# 验证 workspace 识别
pnpm ls -r --depth -1

# 验证 turbo 可用
npx turbo --version
```

**验证结果示例**:

```
pnpm ls -r --depth -1 应列出所有 packages/ 下的子包
npx turbo --version  应输出 v2.x.x
```

---

## 2. TypeScript 基础配置

### 2.1 tsconfig.base.json（根共享配置）

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "exactOptionalPropertyTypes": false,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "composite": true
  },
  "exclude": ["node_modules", "dist", "coverage"]
}
```

### 2.2 各子包 tsconfig.json（模板）

每个子包在其根目录放置以下 `tsconfig.json`：

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"],
  "exclude": ["src/**/__tests__/**"]
}
```

### 2.3 验证 TypeScript 配置

```bash
# 在任意子包中创建临时测试文件
echo 'const greeting: string = "hello world"; console.log(greeting);' > packages/shared-types/src/test.ts

# 运行类型检查
npx tsc --noEmit -p packages/shared-types/tsconfig.json

# 清理测试文件
rm packages/shared-types/src/test.ts
```

**预期**: 空输出（无错误）

---

## 3. Vitest 配置 + 80% 覆盖率门禁

### 3.1 根级别 vitest.workspace.ts

```typescript
import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  'packages/shared-types/vitest.config.ts',
  'packages/core/vitest.config.ts',
  'packages/cli/vitest.config.ts',
  'packages/rbac/vitest.config.ts',
  'packages/audit/vitest.config.ts',
  'packages/migration/vitest.config.ts',
  'packages/i18n/vitest.config.ts',
  'packages/plugin-core/vitest.config.ts',
  'packages/admin-ui/vitest.config.ts',
])
```

### 3.2 子包 vitest.config.ts 模板

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: '{package-name}',             // 替换为实际包名
    include: ['src/__tests__/**/*.test.ts'],
    environment: 'node',                 // admin-ui 使用 'jsdom'
    globals: true,
    coverage: {
      provider: 'v8',
      enabled: true,
      thresholds: {
        lines: 80,
        branches: 70,
        functions: 80,
        statements: 80,
      },
      include: ['src/**/*.ts'],
      exclude: [
        'src/index.ts',                  // barrel export 豁免
        'src/**/__tests__/**',
      ],
      reporter: ['text', 'lcov', 'html'],
    },
  },
})
```

> **注意**: shared-types 包的覆盖率阈值更高（lines: 95, branches: 90, functions: 100），详见 §9。

### 3.3 根 package.json 添加 vitest 依赖

```bash
pnpm add -D -w vitest@^3.0.0 @vitest/coverage-v8@^3.0.0
```

### 3.4 全局 setup 文件

```typescript
// packages/shared-types/src/__tests__/setup.ts
import { beforeAll, afterAll } from 'vitest'

// 全局测试准备：shared-types 纯类型包无需实际准备
// 实际集成测试的 setup 在各子包中定义

beforeAll(() => {
  // 可在此设置全局 mock 或环境变量
  process.env.AUDE_JWT_SECRET = 'test-jwt-secret-32-chars-minimum!!'
})

afterAll(() => {
  // 清理
})
```

### 3.5 验证 Vitest 配置

```bash
# 创建第一个测试文件
cat > packages/shared-types/src/__tests__/placeholder.test.ts << 'EOF'
import { describe, test, expect } from 'vitest'

describe('vitest workspace', () => {
  test('vitest is configured correctly', () => {
    expect(1 + 1).toBe(2)
  })
})
EOF

# 运行测试
pnpm --filter @audebase/shared-types test

# 清理
rm packages/shared-types/src/__tests__/placeholder.test.ts
```

**验证结果示例**:

```
✓ vitest workspace > vitest is configured correctly
  - 1 passed (XXms)
  - Coverage: 100% (placeholder only, real tests in §9)
```

---

## 4. GitHub Actions CI 流水线

### 4.1 目录结构

```bash
mkdir -p .github/workflows
```

### 4.2 ci.yml — 主 CI 流水线

```yaml
name: CI

on:
  push:
    branches: [main, 'feat/**', 'fix/**']
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

env:
  NODE_VERSION: '22'
  PNPM_VERSION: '9.15.4'
  TURBO_TOKEN: ${{ secrets.TURBO_TOKEN }}
  TURBO_TEAM: ${{ vars.TURBO_TEAM }}

jobs:
  lint:
    name: Lint & Format
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm format:check
      - run: pnpm lint

  typecheck:
    name: Type Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck

  test:
    name: Test & Coverage
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: audebase_test
          POSTGRES_USER: audebase
          POSTGRES_PASSWORD: audebase_test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: valkey/valkey:8
        ports:
          - 6379:6379
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm test:coverage
        env:
          DATABASE_URL: postgres://audebase:audebase_test@localhost:5432/audebase_test
          REDIS_URL: redis://localhost:6379
          AUDE_JWT_SECRET: ci-test-jwt-secret-minimum-32-char!!x
      - name: Upload coverage artifacts
        uses: actions/upload-artifact@v4
        if: always()
        with:
          name: coverage-reports
          path: |
            packages/*/coverage/

  build:
    name: Build
    runs-on: ubuntu-latest
    needs: [lint, typecheck, test]
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
```

### 4.3 覆盖率报告合并

```yaml
# .github/workflows/coverage-summary.yml (可选)
name: Coverage Summary

on:
  workflow_run:
    workflows: ['CI']
    types: [completed]

jobs:
  coverage:
    runs-on: ubuntu-latest
    if: ${{ github.event.workflow_run.conclusion == 'success' }}
    steps:
      - uses: actions/checkout@v4
      - name: Download coverage artifacts
        uses: actions/download-artifact@v4
        with:
          name: coverage-reports
          path: coverage-reports
      - name: Display coverage summary
        run: |
          for dir in coverage-reports/*/; do
            if [ -f "$dir/lcov.info" ]; then
              echo "--- Coverage: $(basename $dir) ---"
              grep -E '^SF:|^LF:|^LH:' "$dir/lcov.info" | head -20
            fi
          done
```

### 4.4 验证 CI 配置

```bash
# 语法验证 (使用 act 本地运行，或者直接 push 测试)
# 本地语法检查
npx action-validator .github/workflows/ci.yml 2>/dev/null || echo "action-validator not installed — check syntax manually"
```

---

## 5. Docker Compose 开发环境

### 5.1 docker-compose.yml

```yaml
version: '3.9'

services:
  postgres:
    image: postgres:16
    container_name: audebase-postgres
    restart: unless-stopped
    ports:
      - '5432:5432'
    environment:
      POSTGRES_DB: audebase
      POSTGRES_USER: audebase
      POSTGRES_PASSWORD: audebase_dev
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./docker/postgres/init:/docker-entrypoint-initdb.d
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U audebase -d audebase']
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: valkey/valkey:8
    container_name: audebase-redis
    restart: unless-stopped
    ports:
      - '6379:6379'
    volumes:
      - redisdata:/data
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 10s
      timeout: 5s
      retries: 5

  adminer:
    image: adminer:latest
    container_name: audebase-adminer
    restart: unless-stopped
    ports:
      - '8080:8080'
    environment:
      ADMINER_DEFAULT_SERVER: postgres
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  pgdata:
  redisdata:
```

### 5.2 PostgreSQL 初始化脚本

```bash
mkdir -p docker/postgres/init
```

```sql
-- docker/postgres/init/01-init.sql
-- AUDEBase 开发环境数据库初始化

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 测试数据库（CI 使用独立数据库，无需在此创建）
```

### 5.3 .env.template（更新）

确保 `.env.template` 中包含 Docker Compose 对应的环境变量：

```bash
# AUDEBase 环境变量模板
# 复制为 .env 并填写实际值

# PostgreSQL
DATABASE_URL=postgres://audebase:audebase_dev@localhost:5432/audebase

# Redis
REDIS_URL=redis://localhost:6379

# JWT 密钥（启动时校验 ≥32 字符，禁止默认值！）
AUDE_JWT_SECRET=change-me-to-a-random-32-char-string!!

# 应用配置
AUDE_PORT=3000
AUDE_HOST=0.0.0.0
AUDE_LOG_LEVEL=debug
AUDE_DEV=true
```

### 5.4 验证 Docker Compose

```bash
# 启动所有服务
docker compose up -d

# 验证 PostgreSQL 健康
docker compose exec postgres pg_isready -U audebase -d audebase

# 验证 Redis 健康
docker compose exec redis redis-cli ping

# 访问 Adminer: http://localhost:8080
#   Server: postgres
#   Username: audebase
#   Password: audebase_dev
#   Database: audebase

# 验证后停止
docker compose down
```

**验证结果示例**:

```
[+] Running 3/3
 ✔ Container audebase-postgres  Started
 ✔ Container audebase-redis     Started
 ✔ Container audebase-adminer   Started
pg_isready: /var/run/postgresql:5432 - accepting connections
PONG
```

---

## 6. React 19 + Ant Design 5 兼容性验证

> **责任人**: Person D  
> **参考**: `docs/modules/tech-stack.md` D6, `docs/modules/frontend-spec.md`, `decisions.md` D15-D24, `docs/modules/dev-workflow.md` §1.1

### 6.1 创建验证项目

```bash
# 创建临时验证项目（不与主 monorepo 混淆）
mkdir -p /tmp/antd5-verification
cd /tmp/antd5-verification

# 初始化
pnpm init
pnpm add react@^19.0.0 react-dom@^19.0.0 antd@^5.24.0
pnpm add -D @types/react @types/react-dom typescript vite @vitejs/plugin-react
```

### 6.2 验证内容

| 待验证组件 | 来源 | 关键点 |
|-----------|------|--------|
| ProLayout 骨架 | D16 | 侧边栏菜单生成、面包屑、暗色模式 |
| ProTable（数据表格） | D6 | 分页、排序、搜索、列配置 |
| ProForm（表单） | D6 | 校验、布局、提交 |
| ErrorBoundary（错误隔离） | D20 | react-error-boundary 包裹 + 降级 UI |
| Suspense + 动态加载 | D20 | React.lazy + Suspense fallback |
| ConfigProvider 主题 | D6 | token 定制、暗色模式切换 |
| Provider Stack（Tenant→User→ACL）| D18 | Provider 嵌套顺序、加载状态 |
| ACLGuard 权限守卫 | D19 | can() + canRoute() + canField() |
| 多命名空间 i18n | D15 | react-i18next 初始化、命名空间切换 |
| findDOMNode 弃用警告 | pitfalls.md | `pro-components#8686` 跟踪 |

### 6.3 验证脚本

```typescript
// /tmp/antd5-verification/src/verify.tsx
import React, { Suspense } from 'react'
import { ConfigProvider, theme } from 'antd'
import { ProLayout } from '@ant-design/pro-layout'
import ProTable from '@ant-design/pro-table'
import type { ProColumns } from '@ant-design/pro-table'
import { ErrorBoundary } from 'react-error-boundary'

// 1. ProLayout 骨架验证
function LayoutVerify() {
  return (
    <ProLayout
      title="AUDEBase"
      logo="https://avatars.githubusercontent.com/u/1"
      layout="mix"
      navTheme="light"
      fixedHeader
    >
      <div>Content Area</div>
    </ProLayout>
  )
}

// 2. ProTable 验证
interface RecordType {
  id: string
  name: string
}

const columns: ProColumns<RecordType>[] = [
  { title: 'ID', dataIndex: 'id', key: 'id' },
  { title: '名称', dataIndex: 'name', key: 'name' },
]

function TableVerify() {
  return (
    <ProTable<RecordType>
      columns={columns}
      request={async () => ({
        data: [{ id: '1', name: 'test' }],
        success: true,
        total: 1,
      })}
      rowKey="id"
      pagination={{ pageSize: 20 }}
    />
  )
}

// 3. ErrorBoundary 验证
function ErrorFallback({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) {
  return (
    <div role="alert">
      <p>组件崩溃: {error.message}</p>
      <button onClick={resetErrorBoundary}>重试</button>
    </div>
  )
}

function BoundaryVerify() {
  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <LayoutVerify />
    </ErrorBoundary>
  )
}

// 4. ConfigProvider 主题验证
function ThemeVerify() {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#1677ff',
          borderRadius: 6,
        },
        algorithm: theme.defaultAlgorithm,
      }}
    >
      <div>主题验证通过</div>
    </ConfigProvider>
  )
}

// 5. Suspense 验证
function SuspenseVerify() {
  const LazyComponent = React.lazy(() => Promise.resolve({ default: () => <div>懒加载内容</div> }))
  return (
    <Suspense fallback={<div>加载中...</div>}>
      <LazyComponent />
    </Suspense>
  )
}

// 6. 综合验证
export default function App() {
  return (
    <ConfigProvider>
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <LayoutVerify />
        <TableVerify />
        <ThemeVerify />
        <SuspenseVerify />
      </ErrorBoundary>
    </ConfigProvider>
  )
}
```

### 6.4 验证 Playwright 测试

```bash
# 安装 Playwright
pnpm add -D @playwright/test
npx playwright install chromium
```

```typescript
// /tmp/antd5-verification/e2e/compatibility.spec.ts
import { test, expect } from '@playwright/test'

test('ProLayout renders with title', async ({ page }) => {
  await page.goto('http://localhost:5173')
  await expect(page.locator('.ant-pro-layout')).toBeVisible()
  await expect(page.locator('text=AUDEBase')).toBeVisible()
})

test('ProTable loads data', async ({ page }) => {
  await page.goto('http://localhost:5173')
  const table = page.locator('.ant-table')
  await expect(table).toBeVisible()
  await expect(page.locator('text=test')).toBeVisible()
})

test('ErrorBoundary shows fallback on crash', async ({ page }) => {
  await page.goto('http://localhost:5173/crash')
  await expect(page.locator('text=组件崩溃')).toBeVisible()
})

test('Suspense shows loading state', async ({ page }) => {
  await page.goto('http://localhost:5173')
  await expect(page.locator('text=加载中...')).toBeVisible()
  await expect(page.locator('text=懒加载内容')).toBeVisible({ timeout: 10000 })
})
```

### 6.5 antd v6 兼容性检测

> 每次 Weekly Sync 前执行一次，结果记录到 `.agents/memorys/pitfalls.md`

```bash
# 检查 pro-components 上游修复状态
echo "=== pro-components#8686 (findDOMNode) ==="
gh issue view 8686 --repo ant-design/pro-components --json state,title,updatedAt

echo "=== pro-components#9629 (antd v6 compat) ==="
gh issue view 9629 --repo ant-design/pro-components --json state,title,updatedAt

echo "=== antd v6 release status ==="
npm view antd versions --json | tail -5
```

### 6.6 降级预案

如果 ProTable/ProForm 在 antd v6 下不兼容，使用原生 antd Table + Form + Layout 组合。

**降级切换条件**:

| 条件 | 动作 |
|------|------|
| pro-components#9629 超 6 个月未修复 | 启动降级讨论 |
| antd v6 发布后 pro-components 跟进 > 2 个月 | 启动降级讨论 |
| CI 中 antd v6 兼容性测试失败 | 自动启用降级路径 |

**降级后工具替换**:

| pro-components | 降级方案 |
|---------------|---------|
| `ProLayout` | `antd Layout` + 自建侧边栏 |
| `ProTable` | `antd Table` + 手工分页 |
| `ProForm` | `antd Form` + 手工校验 |

---

## 7. Prettier + ESLint 配置

### 7.1 .prettierrc

```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 110,
  "tabWidth": 2,
  "arrowParens": "always",
  "endOfLine": "lf",
  "quoteProps": "as-needed",
  "bracketSpacing": true
}
```

### 7.2 .prettierignore

```
node_modules
dist
.turbo
coverage
.sisyphus
pnpm-lock.yaml
```

### 7.3 ESLint 配置

使用 ESLint flat config（eslint.config.mjs）：

```javascript
// eslint.config.mjs
import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      // AUDEBase 专属规则（与 decisions.md 和 conventions.md 对齐）
      'no-console': 'error',                             // 禁止 console.log
      '@typescript-eslint/no-explicit-any': 'error',     // 禁止 as any
      '@typescript-eslint/ban-ts-comment': 'error',      // 禁止 @ts-ignore
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': ['warn', {
        allowExpressions: true,
        allowTypedFunctionExpressions: true,
      }],
      // 不可变模式
      'no-param-reassign': 'error',                      // 禁止参数修改
      'prefer-const': 'error',
      // 导入顺序
      'import/order': ['warn', {
        'newlines-between': 'always',
        alphabetize: { order: 'asc' },
      }],
    },
  },
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/.sisyphus/**',
    ],
  },
)
```

### 7.4 安装依赖

```bash
pnpm add -D -w \
  eslint@^9.0.0 \
  @eslint/js@^9.0.0 \
  typescript-eslint@^8.0.0 \
  eslint-plugin-import@^2.31.0
```

> **注意**: 当前项目根 LSP 配置了 `biome` 但未安装。Phase 1a 使用 ESLint 而非 Biome，`.opencode/opencode.json` 中的 LSP 配置后续再调整。

### 7.5 验证 ESLint + Prettier

```bash
# 创建测试文件
cat > /tmp/test-eslint.ts << 'EOF'
const x: any = 123    // 应报错
console.log(x)        // 应报错
EOF

# 验证 ESLint 检测
npx eslint /tmp/test-eslint.ts

# 验证 Prettier 格式
pnpm format:check
```

**验证结果示例**:

```
/tmp/test-eslint.ts
  1:7  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any
  2:1  error  Unexpected console statement                no-console
```

---

## 8. Husky Pre-commit Hooks

### 8.1 安装 Husky + lint-staged

```bash
# 根目录执行
pnpm add -D -w husky@^9.1.0 lint-staged@^15.2.0

# 初始化 Husky
npx husky init
# 此时应生成 .husky/ 目录及 pre-commit 文件
```

### 8.2 .husky/pre-commit

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

npx lint-staged
```

### 8.3 lint-staged 配置（package.json 中添加）

```json
{
  "lint-staged": {
    "*.{ts,tsx,js,jsx,mjs}": [
      "prettier --write",
      "eslint --fix"
    ],
    "*.{json,yaml,yml,md}": [
      "prettier --write"
    ]
  }
}
```

### 8.4 .husky/commit-msg（可选 — 检查约定式提交格式）

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

# 检查提交消息是否符合 conventional commit 格式
npx --no -- commitlint --edit "$1"
```

安装 commitlint：

```bash
pnpm add -D -w @commitlint/cli @commitlint/config-conventional
```

创建 `commitlint.config.mjs`：

```javascript
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [2, 'always', [
      'feat', 'fix', 'refactor', 'docs', 'test',
      'chore', 'perf', 'ci', 'style',
    ]],
  },
}
```

### 8.5 验证 Husky

```bash
# 验证 pre-commit hook 存在
ls -la .husky/pre-commit

# 测试 hook 执行（临时跳过实际 lint）
echo "test commit message" | npx --no commitlint 2>&1 || true

# 创建一个会触发 hook 的临时提交测试
# （实际验证需 commit 时观察 pre-commit 是否执行）
git add .husky/pre-commit
git commit -m "chore: test husky hook" 2>&1 || echo "Hook blocked (expected if lint fails)"
git reset HEAD~1 2>/dev/null || true  # 撤销测试提交
```

**验证结果示例**:

```
-rwxr-xr-x  .husky/pre-commit
✔ lint-staged 已配置
```

---

## 9. shared-types 包初始化

### 9.1 包结构

按照 `docs/modules/shared-types-sdd.md` §1 定义的目录结构创建：

```bash
mkdir -p packages/shared-types/src/__tests__
```

### 9.2 package.json

```json
{
  "name": "@audebase/shared-types",
  "version": "0.1.0",
  "private": true,
  "description": "AUDEBase 全局共享类型包 — User/Role/Permission/Plugin/ErrorCode/ApiResponse + Zod schema",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "typecheck": "tsc --noEmit"
  },
  "peerDependencies": {
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "zod": "^3.24.0",
    "vitest": "^3.0.0",
    "@vitest/coverage-v8": "^3.0.0",
    "typescript": "^5.7.0"
  }
}
```

### 9.3 tsconfig.json

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/__tests__/**"]
}
```

### 9.4 vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'shared-types',
    include: ['src/__tests__/**/*.test.ts'],
    environment: 'node',
    globals: true,
    // 纯类型包，无 DB/HTTP 依赖，使用 v8 provider
    coverage: {
      provider: 'v8',
      enabled: true,
      thresholds: {
        lines: 95,
        branches: 90,
        functions: 100,
      },
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/**/__tests__/**'],
      reporter: ['text', 'lcov', 'html'],
    },
  },
})
```

> shared-types 覆盖率阈值高于通用的 80%，因为它是纯类型 + Zod schema 包，无副作用，应实现全覆盖。

### 9.5 源文件

根据 `shared-types-sdd.md` 创建以下源文件：

```bash
touch packages/shared-types/src/index.ts
touch packages/shared-types/src/errors.ts
touch packages/shared-types/src/api.ts
touch packages/shared-types/src/auth.ts
touch packages/shared-types/src/user.ts
touch packages/shared-types/src/role.ts
touch packages/shared-types/src/plugin.ts
touch packages/shared-types/src/audit.ts
touch packages/shared-types/src/i18n.ts
touch packages/shared-types/src/filter.ts
touch packages/shared-types/src/health.ts
mkdir -p packages/shared-types/src/schemas
```

#### 9.5.1 src/errors.ts

```typescript
// 来源: shared-types-sdd.md §2
// 完整 ErrorCode 枚举 + UserError / SystemError / AssertionError 类

export enum ErrorCode {
  // === Auth ===
  AUTH_INVALID_CREDENTIALS = 'AUTH_INVALID_CREDENTIALS',
  AUTH_TOKEN_EXPIRED = 'AUTH_TOKEN_EXPIRED',
  AUTH_TOKEN_INVALID = 'AUTH_TOKEN_INVALID',
  AUTH_MUST_CHANGE_PASSWORD = 'AUTH_MUST_CHANGE_PASSWORD',
  FORBIDDEN = 'FORBIDDEN',

  // === Validation ===
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  CONFLICT = 'CONFLICT',
  NOT_FOUND = 'NOT_FOUND',

  // === Plugin ===
  PLUGIN_MIGRATION_FAILED = 'PLUGIN_MIGRATION_FAILED',
  PLUGIN_NOT_FOUND = 'PLUGIN_NOT_FOUND',
  PLUGIN_DEPENDENCY_MISSING = 'PLUGIN_DEPENDENCY_MISSING',
  PLUGIN_ALREADY_INSTALLED = 'PLUGIN_ALREADY_INSTALLED',
  PLUGIN_CIRCULAR_DEPENDENCY = 'PLUGIN_CIRCULAR_DEPENDENCY',
  PLUGIN_LIFECYCLE_ERROR = 'PLUGIN_LIFECYCLE_ERROR',
  PLUGIN_MANIFEST_INVALID = 'PLUGIN_MANIFEST_INVALID',

  // === RBAC ===
  RBAC_ROLE_NOT_FOUND = 'RBAC_ROLE_NOT_FOUND',
  RBAC_PERMISSION_DENIED = 'RBAC_PERMISSION_DENIED',
  RBAC_CANNOT_DELETE_SYSTEM_ROLE = 'RBAC_CANNOT_DELETE_SYSTEM_ROLE',

  // === Rate ===
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',

  // === General ===
  GENERAL_INTERNAL_ERROR = 'GENERAL_INTERNAL_ERROR',
  GENERAL_DB_UNAVAILABLE = 'GENERAL_DB_UNAVAILABLE',
  GENERAL_ASSERTION_FAILED = 'GENERAL_ASSERTION_FAILED',
  GENERAL_TIMEOUT = 'GENERAL_TIMEOUT',
}

export class UserError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'UserError'
    Object.setPrototypeOf(this, UserError.prototype)
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
    }
  }
}

export class SystemError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'SystemError'
    Object.setPrototypeOf(this, SystemError.prototype)
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
    }
  }
}

export class AssertionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AssertionError'
    Object.setPrototypeOf(this, AssertionError.prototype)
  }
}
```

#### 9.5.2 src/api.ts

```typescript
// 来源: shared-types-sdd.md §3
// API 响应信封 + 分页/过滤/排序类型

import { ErrorCode } from './errors'

export interface ApiListResponse<T> {
  data: T[]
  meta: PaginationMeta
}

export interface ApiSingleResponse<T> {
  data: T
}

export interface PaginationMeta {
  count: number
  page: number
  pageSize: number
  totalPages: number
}

export interface ApiErrorResponse {
  error: {
    code: ErrorCode
    message: string
    details?: Record<string, unknown>
  }
}

export interface PaginationParams {
  page?: number
  pageSize?: number
}

export type SortParam = string

export type FilterOperator =
  | '$eq'
  | '$ne'
  | '$gt'
  | '$gte'
  | '$lt'
  | '$lte'
  | '$in'
  | '$nin'
  | '$includes'
  | '$startsWith'
  | '$null'

export type FilterCondition = Record<string, unknown>
```

#### 9.5.3 src/auth.ts

```typescript
// 来源: shared-types-sdd.md §4

export interface JwtPayload {
  sub: string
  tenant_id: string
  username: string
  roles: string[]
  iat: number
  exp: number
}

export interface LoginRequest {
  username: string
  password: string
}

export interface LoginResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: 'Bearer'
  user: UserBrief
}

export interface RefreshRequest {
  refresh_token: string
}

export interface RefreshResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: 'Bearer'
}

export interface LogoutRequest {
  refresh_token: string
}

export interface UserBrief {
  id: string
  tenant_id: string
  username: string
  display_name: string
  must_change_password: boolean
  roles: string[]
}
```

#### 9.5.4 src/user.ts

```typescript
// 来源: shared-types-sdd.md §5

import type { RoleBrief } from './role'

export interface User {
  id: string
  tenant_id: string
  username: string
  email: string | null
  display_name: string | null
  avatar_url: string | null
  locale: string
  is_active: boolean
  must_change_password: boolean
  last_login_at: string | null
  roles: RoleBrief[]
  created_at: string
  updated_at: string
}

export interface CreateUserRequest {
  username: string
  email?: string
  password: string
  display_name?: string
  role_ids: string[]
}

export interface UpdateUserRequest {
  display_name?: string
  email?: string
  is_active?: boolean
  locale?: string
  role_ids?: string[]
  password?: string
}
```

#### 9.5.5 src/role.ts

```typescript
// 来源: shared-types-sdd.md §5

export interface Role {
  id: string
  tenant_id: string | null
  name: string
  slug: string
  description: string | null
  is_system: boolean
  permissions: PermissionBrief[]
  user_count: number
  created_at: string
  updated_at: string
}

export interface CreateRoleRequest {
  name: string
  slug: string
  description?: string
  permission_ids: string[]
}

export interface UpdateRoleRequest {
  name?: string
  description?: string
  permission_ids?: string[]
}

export interface RoleBrief {
  id: string
  slug: string
  name: string
}

export interface Permission {
  id: string
  action: PermissionAction
  resource: string
  display_name: string
  module_id: string | null
}

export type PermissionAction = 'create' | 'read' | 'update' | 'delete' | 'manage'

export interface PermissionBrief {
  action: PermissionAction
  resource: string
}
```

#### 9.5.6 src/plugin.ts

```typescript
// 来源: shared-types-sdd.md §6

export type PluginStatus =
  | 'discovered'
  | 'installed'
  | 'loaded'
  | 'enabled'
  | 'disabled'
  | 'migration_failed'

export type PluginRuntimeMode = 'inline' | 'process' | 'container'

export type PluginPartition = 'SYSTEM' | string

export interface PluginDescriptor {
  id: string
  name: string
  version: string
  display_name: string
  state: PluginStatus
  category: string | null
  description: string | null
  author: string | null
  license: string | null
  dependencies: string[]
  runtime_mode: PluginRuntimeMode
  runtime_partition: PluginPartition
  auto_install: boolean
  installed_at: string | null
}
```

#### 9.5.7 src/audit.ts

```typescript
// 来源: shared-types-sdd.md §7

export type AuditActionCategory =
  | 'auth'
  | 'crud'
  | 'lifecycle'
  | 'rbac'
  | 'system'

export interface AuditLogEntry {
  id: string
  tenant_id: string
  actor: { id: string; username: string } | null
  action: string
  resource_type: string
  resource_id: string | null
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  ip: string | null
  user_agent: string | null
  request_id: string | null
  created_at: string
}
```

#### 9.5.8 src/health.ts

```typescript
// 健康检查响应类型 — 来源: decisions.md D1.13

export interface HealthResponse {
  status: 'ok'
  db: boolean
  redis: boolean
  uptime: number
  version?: string
  timestamp?: string
}

export interface ReadyResponse {
  status: 'ok'
  ready: true
  db: boolean
}
```

#### 9.5.9 src/i18n.ts

```typescript
// 来源: shared-types-sdd.md §8

export type LocaleMap = Record<string, string>

export type LocaleCode = string

export type TranslateFunction = (key: string, params?: Record<string, string>) => string
```

#### 9.5.10 src/filter.ts

```typescript
// 来源: shared-types-sdd.md §9

import type { SortParam, FilterCondition } from './api'

export interface ListQueryParams {
  page?: number
  pageSize?: number
  sort?: SortParam
  filter?: FilterCondition
}
```

#### 9.5.11 src/index.ts（barrel export）

```typescript
// 来源: shared-types-sdd.md

// Errors
export { ErrorCode, UserError, SystemError, AssertionError } from './errors'

// API types
export type {
  ApiListResponse,
  ApiSingleResponse,
  ApiErrorResponse,
  PaginationMeta,
  PaginationParams,
  SortParam,
  FilterOperator,
  FilterCondition,
} from './api'

// Auth types
export type {
  JwtPayload,
  LoginRequest,
  LoginResponse,
  RefreshRequest,
  RefreshResponse,
  LogoutRequest,
  UserBrief,
} from './auth'

// User types
export type { User, CreateUserRequest, UpdateUserRequest } from './user'

// Role & Permission types
export type {
  Role,
  CreateRoleRequest,
  UpdateRoleRequest,
  RoleBrief,
  Permission,
  PermissionAction,
  PermissionBrief,
} from './role'

// Plugin types
export type {
  PluginStatus,
  PluginRuntimeMode,
  PluginPartition,
  PluginDescriptor,
} from './plugin'

// Audit types
export type { AuditActionCategory, AuditLogEntry } from './audit'

// Health types
export type { HealthResponse, ReadyResponse } from './health'

// i18n types
export type { LocaleMap, LocaleCode, TranslateFunction } from './i18n'

// Filter types
export type { ListQueryParams } from './filter'
```

### 9.6 测试文件

按照 `shared-types-tdd.md` 创建测试文件：

#### 9.6.1 src/__tests__/errors.test.ts

```typescript
// 来源: shared-types-tdd.md §3.1 & §3.2
import { describe, test, expect } from 'vitest'
import { ErrorCode, UserError, SystemError, AssertionError } from '../errors'

describe('ErrorCode 枚举', () => {
  test('所有错误码唯一且无重复值', () => {
    const codes = Object.values(ErrorCode)
    const unique = new Set(codes)
    expect(unique.size).toBe(codes.length)
  })

  test('错误码命名使用 UPPER_SNAKE_CASE 格式', () => {
    const codes = Object.values(ErrorCode) as string[]
    for (const code of codes) {
      expect(code).toMatch(/^[A-Z][A-Z_]+[A-Z]$/)
    }
  })

  test('所有错误码均为 string 值', () => {
    const codes = Object.values(ErrorCode)
    for (const code of codes) {
      expect(typeof code).toBe('string')
    }
  })
})

describe('UserError', () => {
  test('构造中包含 code + message + details', () => {
    const err = new UserError(
      ErrorCode.VALIDATION_ERROR,
      '用户名必填',
      { field: 'username' },
    )
    expect(err.code).toBe(ErrorCode.VALIDATION_ERROR)
    expect(err.message).toBe('用户名必填')
    expect(err.details).toEqual({ field: 'username' })
  })

  test('details 可选', () => {
    const err = new UserError(ErrorCode.NOT_FOUND, '资源不存在')
    expect(err.details).toBeUndefined()
  })

  test('继承自 Error', () => {
    const err = new UserError(ErrorCode.FORBIDDEN, '无权限')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(UserError)
  })

  test('toJSON 返回序列化格式', () => {
    const err = new UserError(ErrorCode.VALIDATION_ERROR, 'msg', { k: 'v' })
    const json = err.toJSON()
    expect(json).toEqual({
      code: ErrorCode.VALIDATION_ERROR,
      message: 'msg',
      details: { k: 'v' },
    })
  })
})

describe('SystemError', () => {
  test('构造中包含 code + message + 原始错误', () => {
    const cause = new Error('db timeout')
    const err = new SystemError(ErrorCode.GENERAL_DB_UNAVAILABLE, '数据库连接超时', cause)
    expect(err.code).toBe(ErrorCode.GENERAL_DB_UNAVAILABLE)
    expect(err.message).toBe('数据库连接超时')
    expect(err.cause).toBe(cause)
  })

  test('cause 可选', () => {
    const err = new SystemError(ErrorCode.GENERAL_INTERNAL_ERROR, '内部错误')
    expect(err.cause).toBeUndefined()
  })

  test('继承自 Error', () => {
    const err = new SystemError(ErrorCode.GENERAL_INTERNAL_ERROR, '内部错误')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(SystemError)
  })

  test('toJSON 不暴露 cause 详情', () => {
    const cause = new Error('sensitive')
    const err = new SystemError(ErrorCode.GENERAL_DB_UNAVAILABLE, '数据库不可用', cause)
    const json = err.toJSON()
    expect(json).toEqual({
      code: ErrorCode.GENERAL_DB_UNAVAILABLE,
      message: '数据库不可用',
    })
    expect(json).not.toHaveProperty('cause')
  })
})

describe('AssertionError', () => {
  test('构造中包含消息', () => {
    const err = new AssertionError('开发断言失败')
    expect(err.message).toBe('开发断言失败')
    expect(err.name).toBe('AssertionError')
  })

  test('继承自 Error', () => {
    const err = new AssertionError('test')
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(AssertionError)
  })
})
```

#### 9.6.2 src/__tests__/type-compilation.test.ts

```typescript
// 来源: shared-types-tdd.md §3.4
// 编译时类型断言 — 使用 vitest expectTypeOf
import { describe, test, expectTypeOf } from 'vitest'
import type { User } from '../user'
import type { Role, Permission, RoleBrief, PermissionBrief } from '../role'
import type { PluginDescriptor } from '../plugin'
import type { ApiListResponse, ApiSingleResponse, PaginationMeta, ApiErrorResponse } from '../api'
import type { JwtPayload, LoginResponse, UserBrief } from '../auth'
import type { AuditLogEntry } from '../audit'
import type { HealthResponse, ReadyResponse } from '../health'

describe('编译时类型断言', () => {
  test('ApiListResponse<T> 结构正确', () => {
    expectTypeOf<ApiListResponse<User>>().toMatchTypeOf<{
      data: User[]
      meta: PaginationMeta
    }>()
  })

  test('ApiSingleResponse<T> 包含 data', () => {
    expectTypeOf<ApiSingleResponse<User>>().toMatchTypeOf<{
      data: User
    }>()
  })

  test('PaginationMeta 字段完整', () => {
    expectTypeOf<PaginationMeta>().toMatchTypeOf<{
      count: number
      page: number
      pageSize: number
      totalPages: number
    }>()
  })

  test('ApiErrorResponse 包含 error.code + error.message', () => {
    expectTypeOf<ApiErrorResponse>().toMatchTypeOf<{
      error: { code: string; message: string }
    }>()
  })

  test('User 接口包含所有必填字段', () => {
    expectTypeOf<User>().toMatchTypeOf<{
      id: string
      tenant_id: string
      username: string
      is_active: boolean
      must_change_password: boolean
      created_at: string
      updated_at: string
    }>()
  })

  test('Role 接口包含所有必填字段', () => {
    expectTypeOf<Role>().toMatchTypeOf<{
      id: string
      tenant_id: string | null
      name: string
      slug: string
      is_system: boolean
      created_at: string
      updated_at: string
    }>()
  })

  test('Permission 接口包含 action + resource', () => {
    expectTypeOf<Permission>().toMatchTypeOf<{
      id: string
      action: string
      resource: string
    }>()
  })

  test('PluginDescriptor 包含所有必填字段', () => {
    expectTypeOf<PluginDescriptor>().toMatchTypeOf<{
      id: string
      name: string
      version: string
      display_name: string
      state: string
      runtime_mode: string
      runtime_partition: string
      dependencies: string[]
    }>()
  })

  test('JwtPayload 包含认证必需字段', () => {
    expectTypeOf<JwtPayload>().toMatchTypeOf<{
      sub: string
      tenant_id: string
      username: string
      roles: string[]
      iat: number
      exp: number
    }>()
  })

  test('AuditLogEntry 包含所有必填字段', () => {
    expectTypeOf<AuditLogEntry>().toMatchTypeOf<{
      id: string
      tenant_id: string
      action: string
      resource_type: string
      created_at: string
    }>()
  })

  test('HealthResponse 包含 status + db', () => {
    expectTypeOf<HealthResponse>().toMatchTypeOf<{
      status: string
      db: boolean
      uptime: number
    }>()
  })

  test('RoleBrief 包含基础角色信息', () => {
    expectTypeOf<RoleBrief>().toMatchTypeOf<{
      id: string
      slug: string
      name: string
    }>()
  })

  test('PermissionBrief 包含 action + resource', () => {
    expectTypeOf<PermissionBrief>().toMatchTypeOf<{
      action: 'create' | 'read' | 'update' | 'delete' | 'manage'
      resource: string
    }>()
  })
})
```

#### 9.6.3 src/__tests__/schemas.test.ts

按照 `shared-types-tdd.md` §3.3 创建 Zod schema 测试。由于 shared-types 只导出类型（不导出 schema），schema 定义在 `src/schemas/` 下：

```typescript
// packages/shared-types/src/schemas/common.ts
import { z } from 'zod'

export const uuidSchema = z.string().uuid()
export const tenantIdSchema = z.string().min(1)

export const paginationMetaSchema = z.object({
  count: z.number().int().min(0),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(100),
  totalPages: z.number().int().min(0),
})
```

详细 Zod schema 文件列表（待 Phase 1a 各模块编码时按需补充）：

| 文件 | Schema | 参考 |
|------|--------|------|
| `schemas/auth.ts` | `loginSchema`, `tokenResponseSchema`, `refreshSchema` | api-specification.md |
| `schemas/users.ts` | `createUserSchema`, `updateUserSchema`, `paginatedUsersSchema` | api-specification.md |
| `schemas/roles.ts` | `createRoleSchema`, `updateRoleSchema`, `paginatedRolesSchema` | api-specification.md |
| `schemas/permissions.ts` | `paginatedPermissionsSchema` | api-specification.md |
| `schemas/plugins.ts` | `paginatedPluginsSchema` | api-specification.md |
| `schemas/audit.ts` | `paginatedAuditLogsSchema` | api-specification.md |
| `schemas/health.ts` | `healthResponseSchema`, `readyResponseSchema` | api-specification.md |
| `schemas/errors.ts` | `errorResponseSchema` | api-conventions.md |

### 9.7 安装 shared-types 依赖并验证

```bash
# 安装 shared-types 依赖
cd packages/shared-types
pnpm install
cd ../..

# 类型检查
pnpm --filter @audebase/shared-types typecheck

# 运行测试
pnpm --filter @audebase/shared-types test:coverage

# 验证 barrel export
node -e "
const st = require('./packages/shared-types/src/index.ts');
console.log('Shared types loaded successfully');
"
```

**验证结果示例**:

```
$ pnpm --filter @audebase/shared-types typecheck
> @audebase/shared-types@0.1.0 typecheck .../packages/shared-types
> tsc --noEmit
（无输出 = 类型检查通过）

$ pnpm --filter @audebase/shared-types test:coverage
✓ ErrorCode 枚举 > 所有错误码唯一  (XXms)
✓ ErrorCode 枚举 > 命名使用 UPPER_SNAKE_CASE
... (所有测试通过)
✓ Coverage: 100% (thresholds: lines 95%, branches 90%, functions 100%)
```

---

## 10. 验证清单

### 10.1 基础设施验证（Person A）

| # | 检查项 | 命令 | 预期结果 |
|---|--------|------|---------|
| 1 | pnpm workspace | `pnpm ls -r --depth -1` | 列出所有 9 个子包 |
| 2 | Turborepo | `npx turbo run test --dry-run` | 显示 pipeline 计划 |
| 3 | TypeScript | `npx tsc --noEmit -p packages/shared-types/tsconfig.json` | 无错误 |
| 4 | Vitest | `pnpm --filter @audebase/shared-types test` | 测试通过 |
| 5 | 覆盖率门禁 | `pnpm --filter @audebase/shared-types test:coverage` | 95%+ |
| 6 | ESLint | `npx eslint packages/shared-types/src/` | 无违反规则 |
| 7 | Prettier | `pnpm format:check` | 无格式问题 |
| 8 | Docker Compose | `docker compose up -d && docker compose ps` | 3 容器健康 |
| 9 | Husky | `ls -la .husky/pre-commit` | 文件存在且可执行 |
| 10 | CI 语法 | `.github/workflows/ci.yml` 存在 | YAML 有效 |

### 10.2 前端兼容性验证（Person D）

| # | 检查项 | 命令/操作 | 预期结果 |
|---|--------|----------|---------|
| 1 | React 19 + antd 5 | `pnpm list react antd` | react@19.x, antd@5.x |
| 2 | ProLayout 渲染 | Playwright 测试 | 侧边栏可见，菜单生成正确 |
| 3 | ProTable 数据 | Playwright 测试 | 表格加载、分页正常 |
| 4 | ErrorBoundary | Playwright 测试 | 崩溃时显示降级 UI |
| 5 | Suspense | Playwright 测试 | 加载状态 + 内容渲染 |
| 6 | findDOMNode 警告 | 浏览器 Console | 无 critical 警告 |
| 7 | pro-components#8686 | `gh issue view 8686` | 记录当前状态 |
| 8 | pro-components#9629 | `gh issue view 9629` | 记录当前状态 |

### 10.3 共享类型验证

| # | 检查项 | 命令 | 预期结果 |
|---|--------|------|---------|
| 1 | ErrorCode 枚举 | `test:coverage` | 100% 覆盖，值唯一 |
| 2 | User/Role/Permission | 类型编译测试 | 接口字段完整 |
| 3 | ApiListResponse<T> | 类型编译测试 | 泛型结构正确 |
| 4 | PluginDescriptor | 类型编译测试 | 必填字段完整 |
| 5 | JwtPayload | 类型编译测试 | auth 字段完整 |
| 6 | 跨包引用 | 在 core 中引用 | `import { ErrorCode } from '@audebase/shared-types'` 工作正常 |

### 10.4 最终验证命令

```bash
# 完整的端到端验证脚本
set -e

echo "=== 1. pnpm workspace ==="
pnpm ls -r --depth -1

echo "=== 2. TypeScript 类型检查 ==="
pnpm typecheck

echo "=== 3. Lint + 格式 ==="
pnpm format:check
pnpm lint

echo "=== 4. 测试 + 覆盖率 ==="
pnpm test:coverage

echo "=== 5. Docker 环境 ==="
docker compose up -d
docker compose ps
docker compose down

echo "=== ✅ Week 0 全部通过 ==="
```

---

## 附录 A: 依赖版本汇总

> 参考 `docs/modules/tech-stack.md`

| 工具 | 版本 | 安装方式 |
|------|------|---------|
| Node.js | >= 22.0.0 | 系统安装 |
| pnpm | >= 9.15 | `npm i -g pnpm` |
| Turborepo | ^2.3.0 | devDependency |
| TypeScript | ^5.7.0 | devDependency |
| Vitest | ^3.0.0 | devDependency |
| @vitest/coverage-v8 | ^3.0.0 | devDependency |
| ESLint | ^9.0.0 | devDependency |
| typescript-eslint | ^8.0.0 | devDependency |
| Prettier | ^3.4.0 | devDependency |
| Husky | ^9.1.0 | devDependency |
| lint-staged | ^15.2.0 | devDependency |
| Zod | ^3.24.0 | devDependency |
| Docker Compose | >= 2.24 | 系统安装 |
| PostgreSQL | 16 | Docker 镜像 |
| Valkey (Redis) | 8 | Docker 镜像 |
| Playwright | latest | E2E 验证 |

## 附录 B: 目录结构完整图

```
AUDEBase/
├── .env.template              # 环境变量模板
├── .gitignore                 # Git 忽略规则
├── .prettierrc                # Prettier 配置
├── .prettierignore            # Prettier 忽略
├── .husky/
│   └── pre-commit             # lint-staged 触发
├── .github/
│   └── workflows/
│       └── ci.yml             # GitHub Actions CI（lint → typecheck → test → build）
├── docker-compose.yml         # PostgreSQL + Redis + Adminer
├── docker/
│   └── postgres/
│       └── init/
│           └── 01-init.sql    # 数据库初始化 SQL
├── eslint.config.mjs          # ESLint flat config
├── turbo.json                 # Turborepo pipeline
├── pnpm-workspace.yaml        # Workspace 定义
├── package.json               # 根脚本 + devDependencies
├── tsconfig.base.json         # 共享 TypeScript 配置
├── vitest.workspace.ts        # Vitest workspace 配置
├── commitlint.config.mjs      # 约定式提交检查
│
├── packages/
│   ├── shared-types/          # @audebase/shared-types
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vitest.config.ts
│   │   └── src/
│   │       ├── index.ts           # barrel export
│   │       ├── errors.ts          # ErrorCode + UserError/SystemError
│   │       ├── api.ts             # ApiListResponse, PaginationMeta
│   │       ├── auth.ts            # JwtPayload, LoginRequest
│   │       ├── user.ts            # User, CreateUserRequest
│   │       ├── role.ts            # Role, Permission, PermissionAction
│   │       ├── plugin.ts          # PluginDescriptor, PluginStatus
│   │       ├── audit.ts           # AuditLogEntry
│   │       ├── health.ts          # HealthResponse
│   │       ├── i18n.ts            # LocaleMap, TranslateFunction
│   │       ├── filter.ts          # ListQueryParams
│   │       ├── schemas/           # Zod schemas (按领域分文件)
│   │       │   ├── index.ts       # barrel export
│   │       │   └── common.ts      # uuidSchema, paginationMetaSchema
│   │       └── __tests__/
│   │           ├── errors.test.ts
│   │           ├── schemas.test.ts
│   │           └── type-compilation.test.ts
│   │
│   ├── core/                  # @audebase/core (Phase 1a 编码)
│   ├── cli/                   # @audebase/cli (Phase 1a 编码)
│   ├── rbac/                  # @audebase/rbac (Phase 1a 编码)
│   ├── audit/                 # @audebase/audit (Phase 1a 编码)
│   ├── migration/             # @audebase/migration (Phase 1a 编码)
│   ├── i18n/                  # @audebase/i18n (Phase 1a 编码)
│   ├── plugin-core/           # @audebase/plugin-core (Phase 1a 编码)
│   └── admin-ui/              # @audebase/admin-ui (Phase 1a 编码)
│
└── plugins/                   # 本地开发插件目录 (Git 忽略)
```

---

## 附录 C: 参考文档索引

| 参考文档 | 相关章节 |
|---------|---------|
| `docs/phase-planning.md` §Week 0 | Week 0 任务划分 |
| `docs/modules/dev-workflow.md` §1 | Monorepo 结构、包依赖图 |
| `docs/modules/dev-workflow.md` §3 | CI/CD 策略 |
| `docs/modules/tech-stack.md` | 技术栈版本选型 |
| `docs/modules/shared-types-sdd.md` | shared-types 完整接口定义 |
| `docs/modules/shared-types-tdd.md` | 测试计划、覆盖率、CI 配置 |
| `docs/modules/test-seed-strategy.md` | 测试种子数据策略 |
| `docs/modules/frontend-spec.md` | Admin UI 前端规格 |
| `decisions.md` D6/D6.1/D15-D24 | antd 5 + ProLayout 决策 |
| `decisions.md` D8/D9 | Zod + Drizzle 决策 |
| `decisions.md` G3/G4/G5 | 编码规范决策 |
| `.agents/memorys/pitfalls.md` | findDOMNode、pro-components 兼容性 |

---

> **编写**: week0-writer  
> **版本**: v0.1.0  
> **更新日期**: 2026-07-13