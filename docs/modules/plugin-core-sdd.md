# Plugin Core SDD — Phase 1a

> **创建日期**: 2026-07-13  
> **目的**: 为 Phase 1a #0 模块（内核插件 Bootstrap）提供编码前的完整接口定义。  
> **前置阅读**: D1.6, D1.4, D1.7, architecture.md §七  
> **责任人**: Person A

---

## 1. 概述

`@audebase/plugin-core` 是 AUDEBase 的零依赖内核插件，类比 Odoo `base` 模块。它在插件依赖图中优先级最高，负责首次运行时创建核心 Bootstrap 数据。

### 设计原则

- **零依赖**: `dependencies: []`，不依赖任何其他插件
- **不可卸载**: `auto_install: true`，是平台的必备组件
- **幂等安装**: 重复运行 `install()` 不会创建重复数据
- **非业务插件**: 仅包含平台运行必需的初始化数据，不含业务逻辑
- **Bootstrap 入口**: 在 Core 启动流程中，plugin-core 是第一个被加载和安装的插件

### Bootstrap 数据范围

| 数据类型 | 内容 | 说明 |
|---------|------|------|
| 系统租户 | `slug: "system"`, `name: "系统"` | tenant_id = NULL，全局系统租户 |
| 默认角色 | `admin`, `member` | admin 拥有所有系统权限 |
| 管理员用户 | `username: "admin"` | 默认密码强制首次登录修改 |
| 默认菜单结构 | 插件管理、用户管理 | 管理后台基础导航 |
| 核心权限项 | `plugins:*`, `users:*`, `roles:*`, `tenants:*` | RBAC 的基础权限定义 |
| 模块注册表 | 自身写入 `modules` 表 | 标记 plugin-core 为 installed |

---

## 2. Bootstrap 流程

```
Core 启动
  │
  ├─ 1. Fastify 启动（仅 health 路由 + 速率限制中间件）
  │
  ├─ 2. Drizzle DB 连接（pg-pool，默认 10 连接）
  │     └─ 连接失败 → 指数退避重试（1s, 2s, 4s, max 30s）
  │
  ├─ 3. 检查 modules 表是否存在
  │     ├─ 不存在 → 创建核心表（modules, tenants, users, roles, permissions, role_permissions）
  │     └─ 存在 → 跳过表创建
  │
  ├─ 4. 检查 plugin-core 是否已安装（查询 modules 表）
  │     ├─ 已安装（state IN ('installed','loaded','enabled')）
  │     │   └─ 跳过 install()，进入步骤 6
  │     └─ 未安装
  │         │
  │         ├─ 5. 加载并安装 plugin-core
  │         │     ├─ PluginManager.discover() 发现 plugin-core
  │         │     ├─ 执行 afterAdd → beforeLoad → load
  │         │     └─ 执行 install() → 创建 Bootstrap 数据
  │         │
  │         └─ 安装完成后写入 modules 表（state='installed'）
  │
  ├─ 6. MigrationEngine.migrate() — 执行所有待运行迁移
  │
  ├─ 7. 加载其余插件（按依赖拓扑排序，跳过 migration_failed）
  │
  └─ 8. Fastify 注册所有路由 → listen()
```

### 幂等性保证

```typescript
// install() 中的幂等模式
async function install(): Promise<void> {
  // 对每条 Bootstrap 数据使用 INSERT ... ON CONFLICT DO NOTHING
  // 或先 SELECT 检查再 INSERT

  // 示例: 创建系统租户
  await db.insert(tenants)
    .values({ slug: 'system', name: '系统', status: 'active' })
    .onConflictDoNothing({ target: tenants.slug })
    .execute()

  // 示例: 创建 admin 角色
  await db.insert(roles)
    .values({ name: 'admin', description: '系统管理员', tenant_id: null })
    .onConflictDoNothing({ target: [roles.name, roles.tenant_id] })
    .execute()
}
```

---

## 3. Public API Surface

### 3.1 PluginCore

```typescript
// packages/plugin-core/src/plugin-core.ts

interface PluginCore {
  /**
   * 执行 Bootstrap 数据初始化
   *
   * 按顺序创建:
   * 1. 系统租户 (tenant_id = NULL)
   * 2. 默认角色 (admin, member)
   * 3. 核心权限项 (plugins:*, users:*, roles:*, tenants:*)
   * 4. 角色-权限映射 (admin 拥有所有核心权限)
   * 5. 管理员用户 (username: admin, 强制首次登录修改密码)
   * 6. 默认菜单结构
   * 7. 自身 module 记录 (写入 modules 表)
   *
   * 全部操作在单个数据库事务中执行。失败则回滚。
   * 幂等操作 — 可安全地多次调用。
   *
   * @throws PluginCoreBootstrapError — 事务失败时，包含具体失败阶段和原因
   */
  install(): Promise<void>

  /**
   * 获取 Bootstrap 数据摘要（仅用于验证，不修改数据库）
   *
   * 返回 Bootstrap 数据的"应有"状态。
   * 用于:
   * - CI 验证: 对比实际 DB 状态与预期 Bootstrap 数据
   * - 调试: 检查 Bootstrap 数据完整性
   *
   * @returns BootstrapData — 预期的 Bootstrap 数据清单
   */
  getBootstrapData(): BootstrapData
}
```

### 3.2 BootstrapData

```typescript
interface BootstrapData {
  /** 系统租户配置 */
  systemTenant: {
    slug: string     // "system"
    name: string     // "系统"
    status: string   // "active"
  }

  /** 默认角色定义 */
  defaultRoles: Array<{
    name: string
    description: string
    isSystem: boolean  // admin 和 member 均为 true
  }>

  /** 核心权限项 */
  corePermissions: Array<{
    action: string      // 如 "plugins:install"
    resource: string    // 如 "plugins"
    description: string
  }>

  /** 角色-权限映射（admin 拥有所有核心权限） */
  rolePermissionMap: Map<string, string[]>

  /** 管理员初始配置 */
  adminUser: {
    username: string              // "admin"
    passwordRequired: true        // 强制首次登录修改
    assignedRoles: string[]       // ["admin"]
  }

  /** 默认菜单结构 */
  defaultMenus: Array<{
    key: string
    name: string
    icon?: string
    parentKey?: string
    route?: string
  }>
}
```

### 3.3 PluginHost 扩展（plugin-core 注入的上下文）

```typescript
// plugin-core 安装完成后，以下 context 被注入到所有后续加载的插件中

interface PluginCoreContext {
  /** 系统租户 ID（固定为 NULL） */
  readonly systemTenantId: null

  /** 默认角色名称常量 */
  readonly ROLES: {
    ADMIN: 'admin'
    MEMBER: 'member'
  }

  /** 核心权限 action 常量 */
  readonly PERMISSIONS: {
    PLUGINS_INSTALL: 'plugins:install'
    PLUGINS_ENABLE: 'plugins:enable'
    PLUGINS_DISABLE: 'plugins:disable'
    USERS_CREATE: 'users:create'
    USERS_READ: 'users:read'
    USERS_UPDATE: 'users:update'
    USERS_DELETE: 'users:delete'
    ROLES_CREATE: 'roles:create'
    ROLES_READ: 'roles:read'
    TENANTS_CREATE: 'tenants:create'
    TENANTS_READ: 'tenants:read'
  }
}
```

---

## 4. 数据结构

### 4.1 manifest.yaml

```yaml
# packages/plugin-core/manifest.yaml
name: "@audebase/plugin-core"
version: "1.0.0"
display_name: "内核插件"
description: "AUDEBase 内核 Bootstrap — 首次运行时创建系统租户、默认角色、管理员用户和菜单结构"
category: "SYSTEM"
license: "Apache-2.0"

application:
  entry: "./src/plugin-core.ts"
  author: "AUDEBase Team"

# 零依赖 — 不依赖任何其他插件
dependencies: []

# 不可卸载 — 平台的必备组件
lifecycle:
  auto_install: true

runtime:
  mode: inline
  partition: SYSTEM
  crash_policy: restart

security:
  db_namespace: "public"  # 直接使用 public schema

# plugin-core 无 exports — 通过 PluginCoreContext 注入
# 其他系统插件不"依赖"plugin-core，而是通过注入的上下文获取常量

# 初始数据文件（Bootstrap SQL 种子文件）
data:
  - "./data/001_system_tenant.sql"
  - "./data/002_default_roles.sql"
  - "./data/003_core_permissions.sql"
  - "./data/004_role_permissions.sql"
  - "./data/005_admin_user.sql"
  - "./data/006_default_menus.sql"

# plugin-core 的数据库迁移
models:
  - name: "modules"
    table: "modules"
  - name: "tenants"
    table: "tenants"
  - name: "users"
    table: "users"
  - name: "roles"
    table: "roles"
  - name: "permissions"
    table: "permissions"
  - name: "role_permissions"
    table: "role_permissions"
```

### 4.2 目录结构

```
packages/plugin-core/
├── manifest.yaml
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # 插件入口（导出 PluginCore 类）
│   ├── plugin-core.ts        # PluginCore 实现
│   ├── bootstrap/
│   │   ├── tenant-bootstrap.ts    # 系统租户创建
│   │   ├── role-bootstrap.ts      # 默认角色创建
│   │   ├── permission-bootstrap.ts # 核心权限创建
│   │   ├── user-bootstrap.ts      # admin 用户创建
│   │   └── menu-bootstrap.ts      # 默认菜单创建
│   └── context.ts            # PluginCoreContext 定义
├── data/
│   ├── 001_system_tenant.sql
│   ├── 002_default_roles.sql
│   ├── 003_core_permissions.sql
│   ├── 004_role_permissions.sql
│   ├── 005_admin_user.sql
│   └── 006_default_menus.sql
├── migrations/
│   └── 1.0.0/
│       ├── preload.sql       # Bootstrap 表 DDL
│       └── postload.sql      # 索引和约束
└── locale/
    ├── zh-CN.json
    └── en-US.json
```

### 4.3 数据创建顺序（事务内）

```typescript
// 严格按依赖顺序执行：
// 1. tenants (无依赖)
// 2. roles (无依赖)
// 3. permissions (无依赖)  
// 4. role_permissions (依赖 roles + permissions)
// 5. users (依赖 tenants + roles)
// 6. menus (依赖 tenants)
// 7. modules 表自身记录 (依赖上述全部完成后)
```

---

## 5. 错误处理

### 5.1 错误类型

```typescript
type PluginCoreError =
  | {
      type: 'BOOTSTRAP_FAILED'
      phase: 'tenant' | 'roles' | 'permissions' | 'users' | 'menus' | 'module_record'
      cause: Error
    }
  | {
      type: 'DB_CONNECTION_FAILURE'
      retries: number
      maxRetries: number
      cause: Error
    }
  | {
      type: 'ALREADY_INSTALLED'
      currentState: string  // installed | loaded | enabled
    }
```

### 5.2 错误传播约定

- **DB 连接失败**: 指数退避重试（1s → 2s → 4s，最多 30s），超过重试上限则 Core 启动失败（退出码 1）
- **Bootstrap 事务失败**: 全部回滚，记录 audit_log，Core 启动失败（退出码 1）— plugin-core 安装失败是不可恢复的
- **已安装检测**: 如 plugin-core 已安装，跳过 install()，记录 info 日志后继续加载其他插件
- **单条数据冲突**: 使用 `ON CONFLICT DO NOTHING` 静默跳过，不视为错误

### 5.3 日志记录

```typescript
// plugin-core 安装过程中的关键日志点
logger.info({ phase: 'bootstrap' }, 'plugin-core install() started')
logger.info({ phase: 'bootstrap', step: 'tenants' }, 'creating system tenant')
logger.info({ phase: 'bootstrap', step: 'roles' }, 'creating default roles')
logger.info({ phase: 'bootstrap', step: 'permissions' }, 'creating core permissions')
logger.info({ phase: 'bootstrap', step: 'users' }, 'creating admin user')
logger.info({ phase: 'bootstrap', step: 'menus' }, 'creating default menus')
logger.info({ phase: 'bootstrap' }, 'plugin-core install() completed')

// 幂等调用时
logger.info({ phase: 'bootstrap', state: 'already_installed' }, 'plugin-core already installed, skipping bootstrap')
```

---

## 6. 测试边界

| 测试层级 | 范围 | Mock 策略 | 文件位置 |
|---------|------|----------|---------|
| 单元测试 | install() 幂等性、getBootstrapData() 正确性、BootstrapData 数据一致性 | mock Drizzle DB（内存 SQLite） | `src/__tests__/unit/` |
| 集成测试 | 完整 bootstrap 流程：空 DB → Core 启动 → plugin-core 加载 → 所有数据创建 | 真实 PG（事务回滚） | `src/__tests__/integration/` |
| E2E 测试 | 首次启动完整流程（启动 → 登录 admin → 强制改密 → 显示菜单） | 真实 PG + 真实 Fastify | `packages/admin-ui/__e2e__/` |

### 最小测试用例集

1. **首次安装**: 空 DB → install() → 验证 1 租户、2 角色、N 权限、1 用户、M 菜单全部创建
2. **二次安装幂等**: 首次安装成功后再次 install() → 数据未重复（计数不变）
3. **Bootstrap 数据完整性**: `getBootstrapData()` 返回的数据与 install() 实际创建的数据一致
4. **DB 连接重试**: 模拟 DB 短暂不可用 → 验证退避重试 → 恢复后成功安装
5. **事务回滚**: 模拟 install() 中途失败 → 验证 DB 回到空状态（无残留数据）
6. **modules 表已存在（非首次启动）**: modules 表存在且 plugin-core 状态为 installed → install() 跳过
7. **admin 密码强制修改**: 创建 admin 用户后 → `password_reset_required = true` → 首次登录返回 403 提示改密

---

## 7. 实现约束

- **不可使用 `console.log`**: 所有日志通过注入的 `logger`（pino 实例）
- **类型安全**: 禁止 `as any` / `@ts-ignore`，公共 API 使用显式类型注解
- **不可变性**: BootstrapData 和 PluginCoreContext 为只读对象，安装后不可修改
- **事务边界**: install() 所有写操作在单个 PostgreSQL 事务中执行，全部成功或全部回滚
- **零依赖**: plugin-core 的 `dependencies: []` 硬约束 — 不能 import 任何其他 `@audebase/plugin-*` 包
- **注入 Context**: plugin-core 不通过 import 导出类型，而是通过 Core 将 `PluginCoreContext` 注入到后续加载插件的 `PluginHost` 中
- **SQL 种子文件**: `data/` 目录中的 SQL 文件仅用于参考，install() 使用 Drizzle Query API 执行（支持 ON CONFLICT 和事务）

---

## 8. 与其他模块的交互

| 调用方/被调用方 | 接口 | 调用方式 |
|----------------|------|---------|
| #1 内核骨架 (Core) | `PluginManager.install('@audebase/plugin-core')` | Core bootstrap 流程直接调用 |
| #5 迁移管理 | `MigrationEngine.migrate()` | plugin-core 安装后在 Core bootstrap 流程中调用 |
| #6 插件框架 | `PluginManager` 加载机制 | plugin-core 是首个被 PluginManager 加载和安装的插件 |
| #8 RBAC | `PluginCoreContext.ROLES` / `PluginCoreContext.PERMISSIONS` | 通过 PluginHost 注入的 context |
| #10 审计日志 | `audit_log` 表 | plugin-core 安装事件自动写入审计日志 |
| #11 i18n | `locale/zh-CN.json` → `'client'` namespace | plugin-core 提供全局共享的 'client' 命名空间翻译 |
| #12 管理 UI | Bootstrap 创建的菜单/用户/角色 | 管理后台读取这些数据 |
---

## 9. Open Questions (Phase 1a 期间解决)

- [ ] admin 默认密码生成策略：随机生成并输出到启动日志，还是使用环境变量 `AUDE_ADMIN_PASSWORD`？
- [ ] plugin-core 自身的数据库升级：plugin-core 1.0.0 → 1.1.0 的迁移由 MigrationEngine 处理，是否需要特殊处理（如迁移前备份）？
- [ ] Bootstrap 数据的 `tenant_id` 处理：所有 Bootstrap 数据 `tenant_id = NULL` 是否足够？是否需要支持系统租户 `id = uuid`？
- [ ] admin 用户密码强制修改的 UI 流程：首次登录重定向到改密页面的路由定义

---

## 10. 变更记录

| 版本 | 日期 | 变更内容 |
|------|------|---------|
| v0.1.0 | 2026-07-13 | 初始版本 |
