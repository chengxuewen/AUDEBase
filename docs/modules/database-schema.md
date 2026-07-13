# AUDEBase 数据库表结构设计

> **创建日期**: 2026-07-13  
> **目的**: Phase 1a 完整 DDL 定义，4 人并行开发时的唯一 Schema 参考。  
> **来源于**: 发现 #10（DB Schema 文档缺失）— 6-8 张核心表需在编码前统一定义。

---

## 约定

- **主键**: UUID v4（`gen_random_uuid()` 产生 UUID v4），字段名 `id`
- **租户隔离**: 所有表含 `tenant_id` 列（可 NULL = 系统全局数据）
- **时间戳**: `created_at` / `updated_at`（TIMESTAMPTZ，默认 UTC）
- **软删除**: Phase 1 不实现（避免 Record Rules 未就绪时的过滤漏洞）
- **命名**: 表名 snake_case 复数，列名 snake_case，索引名 `idx_{table}_{col}`
- **Drizzle ORM**: 表结构使用 Drizzle schema 定义，本文档为 Drizzle schema 的人工可读版

---

## 表结构

### 通用约定 — 所有表默认列

以下列存在于除 `migration_history` 外的所有表中：

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| `id` | `UUID` | PK, DEFAULT gen_random_uuid() | 主键 |
| `tenant_id` | `UUID` | NULLABLE, FK → tenants.id | NULL = 系统全局（租户表创建前可为 NULL） |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | 创建时间 |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT NOW() | 更新时间 |
| `created_by` | `UUID` | NULLABLE, FK → users.id | 创建者 |
| `updated_by` | `UUID` | NULLABLE, FK → users.id | 更新者 |

### 0. tenants — 租户表

> 多租户架构的核心表。Phase 1a 单数据库 + tenant_id 隔离（D4）。

```sql
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- 租户标识
    slug VARCHAR(100) UNIQUE NOT NULL,  -- URL 友好标识，如 acme-corp
    name VARCHAR(200) NOT NULL,          -- 显示名称
    domain VARCHAR(500),                  -- 自定义域名（可选）
    
    -- 配置
    config JSONB DEFAULT '{}',            -- 租户级配置（主题、Logo、特性开关）
    
    -- 状态
    status VARCHAR(20) NOT NULL DEFAULT 'active',  -- active | suspended | deleted
    
    -- 时间戳（tenants 表不使用通用列模板，tenant_id 不自引用）
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE tenants IS '租户表 — 多租户隔离的根节点';
COMMENT ON COLUMN tenants.slug IS 'URL 路径前缀，用于 /{tenantId}/admin 路由 (D24)';

CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_status ON tenants(status);
```
---

### 1. modules — 模块注册表

> 对应 Odoo `ir.module.module`。记录所有已安装/已发现的插件元数据。

```sql
CREATE TABLE modules (
    -- 通用列
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID, -- NULL = 系统模块
    
    -- 模块标识
    name VARCHAR(200) NOT NULL,          -- 插件包名，如 @audebase/plugin-core
    version VARCHAR(50) NOT NULL,        -- SemVer，如 1.0.0
    display_name VARCHAR(255) NOT NULL,  -- 显示名称
    
    -- 模块状态
    state VARCHAR(20) NOT NULL DEFAULT 'discovered'
        CHECK (state IN ('discovered', 'installed', 'loaded', 'enabled', 'disabled', 'migration_failed')),
    -- 状态枚举: discovered | installed | loaded | enabled | disabled | migration_failed
    -- Phase 1a 仅用 loaded/disabled；其余状态为 Phase 1b+ 预留
    
    -- manifest 关键字段（缓存）
    category VARCHAR(100),
    description TEXT,
    author VARCHAR(255),
    license VARCHAR(100),
    dependencies JSONB DEFAULT '[]',     -- ["@audebase/plugin-rbac"]
    runtime_mode VARCHAR(20) NOT NULL DEFAULT 'inline',  -- inline | process | container
    runtime_partition VARCHAR(50) NOT NULL DEFAULT 'SYSTEM', -- SYSTEM | oa | erp | ...
    auto_install BOOLEAN DEFAULT false,
    manifest_path VARCHAR(500),          -- 文件系统路径
    
    -- 审计列
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- 约束
    CONSTRAINT uq_modules_name UNIQUE (name)
);

-- 索引
CREATE INDEX idx_modules_tenant ON modules(tenant_id);
CREATE INDEX idx_modules_state ON modules(state);
```

**Collections 表注册**（见 §2 `collections` 表）：插件通过 manifest.yaml 的 `models` 字段声明 Collection，加载时写入 `collections` 表。

---

### 2. collections — 数据模型注册表

> 对应 Odoo `ir.model`。记录所有插件声明的 Collection（数据模型）。

```sql
CREATE TABLE collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID, -- NULL = 系统 Collection
    module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
    
    -- Collection 标识
    name VARCHAR(200) NOT NULL,              -- Collection 名，如 'user'、'order'
    table_name VARCHAR(200) NOT NULL,         -- 对应 PG 表名，如 'users'、'orders'
    display_name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- 扩展声明
    extends_collection_id UUID REFERENCES collections(id), -- D12.1 类继承
    is_system BOOLEAN DEFAULT false,         -- 系统 Collection 不可删除
    
    -- 审计
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- 约束
    CONSTRAINT uq_collections_name_tenant UNIQUE (name, tenant_id),
    CONSTRAINT uq_collections_table UNIQUE (table_name)
);

CREATE INDEX idx_collections_module ON collections(module_id);
CREATE INDEX idx_collections_tenant ON collections(tenant_id);
```

---

### 3. users — 用户表

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL, -- 多租户隔离
    
    -- 认证
    username VARCHAR(100) NOT NULL,
    email VARCHAR(255),
    password_hash VARCHAR(255) NOT NULL, -- bcrypt
    token_version INTEGER NOT NULL DEFAULT 1, -- JWT 撤回（发现 #6）
    
    -- 状态
    is_active BOOLEAN NOT NULL DEFAULT true,
    must_change_password BOOLEAN NOT NULL DEFAULT false, -- D1.6: admin 首次强制修改
    
    -- 个人信息
    display_name VARCHAR(255),
    avatar_url VARCHAR(500),
    locale VARCHAR(10) DEFAULT 'zh-CN',
    
    -- 审计
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id),
    
    -- 约束
    CONSTRAINT uq_users_username_tenant UNIQUE (username, tenant_id),
    CONSTRAINT uq_users_email_tenant UNIQUE (email, tenant_id)
);

CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_active ON users(tenant_id, is_active);
```

---

### 4. roles — 角色表

```sql
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID, -- NULL = 系统角色（admin/member）
    
    -- 角色标识
    name VARCHAR(100) NOT NULL,          -- 角色名
    slug VARCHAR(100) NOT NULL,          -- 机器标识，如 'admin'、'member'
    description VARCHAR(500),
    
    -- 状态
    is_system BOOLEAN DEFAULT false,     -- 系统角色不可删除
    
    -- 审计
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- 约束
    CONSTRAINT uq_roles_slug_tenant UNIQUE (slug, tenant_id)
);

CREATE INDEX idx_roles_tenant ON roles(tenant_id);
```

**Phase 1a 预置角色**（plugin-core Bootstrap 创建）:

| slug | name | 说明 |
|------|------|------|
| `admin` | 管理员 | 全部权限 |
| `member` | 成员 | 基础访问权限 |

---

### 5. permissions — 权限项表

```sql
CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID, -- NULL = 系统权限
    
    -- 权限标识
    action VARCHAR(100) NOT NULL,         -- 'create', 'read', 'update', 'delete', 'manage'
    resource VARCHAR(200) NOT NULL,       -- 资源名，如 'plugin', 'user', 'role', 'audit_log'
    display_name VARCHAR(255) NOT NULL,
    module_id UUID REFERENCES modules(id),
    
    -- 审计
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- 约束
    CONSTRAINT uq_permissions_action_resource UNIQUE (action, resource)
);

CREATE INDEX idx_permissions_resource ON permissions(resource);
```

**Phase 1a 预置权限项**:

| action | resource | 说明 |
|--------|----------|------|
| `manage` | `plugin` | 插件管理（安装/卸载/启用/禁用） |
| `manage` | `user` | 用户管理（CRUD） |
| `manage` | `role` | 角色管理 |
| `read` | `audit_log` | 查看审计日志 |
| `read` | `health` | 健康检查 |

---

### 6. user_roles — 用户角色关联

```sql
CREATE TABLE user_roles (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,     -- 冗余：与 users.tenant_id 一致
    
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    assigned_by UUID REFERENCES users(id),
    
    PRIMARY KEY (user_id, role_id)
);

CREATE INDEX idx_user_roles_role ON user_roles(role_id);
CREATE INDEX idx_user_roles_tenant ON user_roles(tenant_id);
```

---

### 7. role_permissions — 角色权限关联

```sql
CREATE TABLE role_permissions (
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    tenant_id UUID,             -- NULL = 系统级授权
    
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    PRIMARY KEY (role_id, permission_id)
);
```

---

### 8. refresh_tokens — JWT Refresh Token 存储

> 来自发现 #6：JWT 生命周期不完整。

```sql
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL,
    
    token_hash VARCHAR(255) NOT NULL,    -- SHA-256(token)
    expires_at TIMESTAMPTZ NOT NULL,     -- 7 天过期
    revoked_at TIMESTAMPTZ,              -- NULL = 有效
    
    user_agent VARCHAR(500),
    ip VARCHAR(50),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- 约束
    CONSTRAINT uq_refresh_token_hash UNIQUE (token_hash)
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at) WHERE revoked_at IS NULL;
```

---

### 9. audit_log — 审计日志

> 来自 D1.12 + 发现 #24（rbac:* 动作扩展）。

```sql
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL,
    
    -- 审计事件
    actor_id UUID REFERENCES users(id),        -- 操作用户（NULL = 系统操作）
    action VARCHAR(100) NOT NULL,              -- 动作标识
    -- 动作分类:
    --   auth: login, logout, refresh_token, password_change
    --   crud: create, read, update, delete
    --   lifecycle: install, uninstall, enable, disable, upgrade  -- upgrade 为 Phase 1b
    --   plugin: install, uninstall, enable, disable  -- Phase 1a 插件动作（与 lifecycle 分开）
    --   rbac: assign_role, revoke_role, create_role, delete_role
    --   system: startup, shutdown, health_check
    
    resource_type VARCHAR(200) NOT NULL,       -- 资源类型: 'user', 'role', 'plugin', 'audit_log'
    resource_id UUID,                          -- 资源 ID
    
    -- 变更记录
    old_values JSONB,                          -- 变更前值（仅 update/delete）
    new_values JSONB,                          -- 变更后值（仅 create/update）
    
    -- 请求上下文
    ip VARCHAR(50),
    user_agent VARCHAR(500),
    request_id VARCHAR(100),                   -- X-Request-ID
    
    -- 审计
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 索引（D1.12：复合索引支持按资源查询）
CREATE INDEX idx_audit_log_tenant ON audit_log(tenant_id);
CREATE INDEX idx_audit_log_resource ON audit_log(tenant_id, resource_type, resource_id);
CREATE INDEX idx_audit_log_actor ON audit_log(tenant_id, actor_id);
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_created ON audit_log(created_at DESC);
```

---

### 10. migration_history — 迁移追踪

> 来自 D1.7 + 发现 #1（迁移管理 1b→1a）。

```sql
CREATE TABLE migration_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
    
    -- 迁移信息
    version VARCHAR(50) NOT NULL,  -- 已执行的版本号
    phase VARCHAR(20) NOT NULL,    -- preload | postsync | postload
    filename VARCHAR(500),         -- 迁移文件路径
    
    -- 执行结果
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    -- 状态枚举: pending | running | success | failed | skipped
    CHECK (status IN ('pending', 'running', 'success', 'failed', 'skipped')),
    error_message TEXT,            -- 失败时记录错误详情
    execution_time_ms INTEGER,     -- 执行耗时
    
    -- 审计
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- 约束
    CONSTRAINT uq_migration_version UNIQUE (module_id, version, phase)
);

CREATE INDEX idx_migration_module ON migration_history(module_id);
CREATE INDEX idx_migration_status ON migration_history(module_id, status);
```

**迁移失败策略**（发现 #16）: 标记 status='failed' → 当前插件标记为 `migration_failed` → 跳过该插件继续加载其他插件 → 日志记录错误详情 → 不阻塞系统启动。

---

## 完整表关系图（文本版）

```
modules ──1:N──> collections    (模块声明数据模型)
modules ──1:N──> migration_history (模块迁移记录)
modules ──1:N──> permissions    (模块声明权限项)

tenants ──1:N──> users          (租户拥有用户)
tenants ──1:N──> roles          (租户拥有角色)
tenants ──1:N──> modules        (租户安装的模块)
tenants ──1:N──> collections    (租户的数据模型)
tenants ──1:N──> audit_log      (租户审计记录)
tenants ──1:N──> permissions    (租户级权限)

users ──1:N──> refresh_tokens   (用户持有刷新令牌)

roles ──N:M──> permissions      (via role_permissions)

users ──1:N──> audit_log        (用户操作审计)

-- 所有表 (除 migration_history 外) 通过 tenant_id 关联租户隔离
```

---

## 表汇总

| # | 表名 | 用途 | Phase | 关键约束 |
|---|------|------|:---:|------|
| 0 | `tenants` | 租户信息 | 1a | slug UNIQUE |
| 1 | `modules` | 插件元数据注册表 | 1a | name UNIQUE |
| 2 | `collections` | 数据模型注册表 | 1a | (name, tenant_id) UNIQUE, table_name UNIQUE |
| 3 | `users` | 用户账户 | 1a | (username, tenant_id) UNIQUE, token_version |
| 4 | `roles` | RBAC 角色 | 1a | (slug, tenant_id) UNIQUE |
| 5 | `permissions` | RBAC 权限项 | 1a | (action, resource) UNIQUE |
| 6 | `user_roles` | 用户↔角色关联 | 1a | PK(user_id, role_id) |
| 7 | `role_permissions` | 角色↔权限关联 | 1a | PK(role_id, permission_id) |
| 8 | `refresh_tokens` | JWT 刷新令牌 | 1a | token_hash UNIQUE |
| 9 | `audit_log` | 审计日志 | 1a | 复合索引(tenant, resource_type, resource_id) |
| 10 | `migration_history` | 迁移版本追踪 | 1a | (module_id, version, phase) UNIQUE |

---

## 参考

- 架构决策: `../../.agents/memorys/decisions.md` — D1.6, D1.7, D1.12, D4, D8.1, D10, D12.1
- Phase 划分: [phase-planning.md](../phase-planning.md)
- API 规范: [api-specification.md](api-specification.md)（端点与 DB 字段对应）
