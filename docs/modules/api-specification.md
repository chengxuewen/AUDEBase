# AUDEBase API 端点规范

> **创建日期**: 2026-07-13  
> **目的**: Phase 1a 全部 API 端点的请求/响应格式定义。4 人并行开发时前后端契约的唯一参考。  
> **来源于**: 发现 #20（API 规范文档缺失）。

---

## 约定

- **Base URL**: `/api`（通过 Core API 代理路由，D12）
- **Content-Type**: `application/json`（除文件上传使用 `multipart/form-data`）
- **认证**: `Authorization: Bearer <access_token>`（15 分钟过期）
- **多租户**: 当前租户上下文通过 JWT payload 的 `tenant_id` 声明确定
- **API 版本**: Phase 1a 使用 `/api/` 前缀；Phase 1b 引入 `/api/v1/` 路径版本控制（D1.8）
- **响应格式**: 单条资源返回对象；列表返回 NocoBase 分页格式 `{ data, meta }`（发现 #9）
- **错误格式**: 统一 `{ error: { code, message, details? } }`

---

## 端点总览

| # | 方法 | 路径 | 认证 | 说明 |
|---|------|------|:---:|------|
| 1 | `POST` | `/api/auth/login` | 否 | 用户登录 |
| 2 | `POST` | `/api/auth/refresh` | 否 | 刷新 access token |
| 3 | `GET` | `/api/users` | 是 | 用户列表 |
| 4 | `POST` | `/api/users` | 是 | 创建用户 |
| 5 | `GET` | `/api/users/{id}` | 是 | 用户详情 |
| 6 | `PATCH` | `/api/users/{id}` | 是 | 更新用户 |
| 7 | `DELETE` | `/api/users/{id}` | 是 | 删除用户 |
| 8 | `GET` | `/api/roles` | 是 | 角色列表 |
| 9 | `POST` | `/api/roles` | 是 | 创建角色 |
| 10 | `GET` | `/api/roles/{id}` | 是 | 角色详情 |
| 11 | `PATCH` | `/api/roles/{id}` | 是 | 更新角色 |
| 12 | `DELETE` | `/api/roles/{id}` | 是 | 删除角色 |
| 13 | `GET` | `/api/plugins` | 是 | 插件列表 |
| 14 | `POST` | `/api/plugins/{name}/enable` | 是 | 启用插件 |
| 15 | `POST` | `/api/plugins/{name}/disable` | 是 | 禁用插件 |
| 16 | `GET` | `/api/audit-logs` | 是 | 审计日志列表 |
| 17 | `GET` | `/api/health` | 否 | 健康检查 |
| 18 | `GET` | `/api/health/ready` | 否 | 就绪检查 |
| 19 | `GET` | `/api/logs` | 是 | 最近日志（调试） |
| 20 | `POST` | `/api/auth/logout` | 是 | 登出（撤销 refresh_token） |
| 21 | `GET` | `/api/permissions` | 是 | 权限列表（角色权限选择器） |
| 22 | `POST` | `/api/plugins/{name}/install` | 是 | 安装插件 |

---

## 1. 认证

### POST /api/auth/login

**请求**:
```json
{
  "username": "admin",
  "password": "admin123"
}
```

**成功响应** (200):
```json
{
  "access_token": "eyJhbG...",
  "refresh_token": "dGhpcyBp...",
  "expires_in": 900,
  "token_type": "Bearer",
  "user": {
    "id": "0192ef0a-...",
    "tenant_id": "0192eeff-...",
    "username": "admin",
    "display_name": "管理员",
    "must_change_password": false,
    "roles": ["admin"]
  }
}
```

**错误响应** (401):
```json
{
  "error": {
    "code": "AUTH_INVALID_CREDENTIALS",
    "message": "用户名或密码错误"
  }
}
```

**速率限制**: 5 次/分钟（发现 #22）

---

### POST /api/auth/refresh

**请求**:
```json
{
  "refresh_token": "dGhpcyBp..."
}
```

**成功响应** (200):
```json
{
  "access_token": "eyJhbG...",
  "refresh_token": "bmV3IHJl...",
  "expires_in": 900,
  "token_type": "Bearer"
}
```

**错误响应** (401):
```json
{
  "error": {
    "code": "AUTH_TOKEN_EXPIRED",
    "message": "刷新令牌已过期或已撤销"
  }
}
```

---

### POST /api/auth/logout

**请求**:
```json
{
  "refresh_token": "dGhpcyBp..."
}
```

**成功响应** (200):
```json
{
  "success": true
}
```

**错误响应** (401): 同 `/api/auth/refresh`，`AUTH_TOKEN_EXPIRED` 或 `AUTH_TOKEN_INVALID`（Token 格式无效）。

> **说明**: 撤销 refresh_token（设置 `revoked_at` 时间戳）。access_token 在过期前仍有效。刷新令牌轮转时旧令牌自动失效。

---
## 2. 用户管理

### GET /api/users

**查询参数**（发现 #19）:

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `page` | integer | 1 | 页码 |
| `pageSize` | integer | 20 | 每页条数（最大 100） |
| `sort` | string | `-created_at` | 排序字段，`-` 前缀降序 |
| `filter` | JSON string | — | NocoBase 风格 filter JSON |

**请求示例**: `GET /api/users?page=1&pageSize=10&sort=-created_at&filter={"is_active":true}`

**成功响应** (200):
```json
{
  "data": [
    {
      "id": "0192ef0a-...",
      "tenant_id": "0192eeff-...",
      "username": "admin",
      "email": "admin@example.com",
      "display_name": "管理员",
      "is_active": true,
      "must_change_password": false,
      "locale": "zh-CN",
      "last_login_at": "2026-07-13T08:00:00Z",
      "created_at": "2026-07-10T00:00:00Z",
      "updated_at": "2026-07-13T08:00:00Z",
      "roles": [
        { "id": "...", "slug": "admin", "name": "管理员" }
      ]
    }
  ],
  "meta": {
    "count": 42,
    "page": 1,
    "pageSize": 10,
    "totalPages": 5
  }
}
```

> **字段可见性**: `password_hash` 和 `token_version` 永不返回。

---

### POST /api/users

**请求**:
```json
{
  "username": "zhangsan",
  "email": "zhangsan@example.com",
  "password": "SecureP@ss1",
  "display_name": "张三",
  "role_ids": ["uuid-of-member-role"]
}
```

**成功响应** (201):
```json
{
  "id": "0192ef1b-...",
  "tenant_id": "0192eeff-...",
  "username": "zhangsan",
  "email": "zhangsan@example.com",
  "display_name": "张三",
  "is_active": true,
  "must_change_password": false,
  "locale": "zh-CN",
  "created_at": "2026-07-13T10:30:00Z",
  "updated_at": "2026-07-13T10:30:00Z",
  "roles": [
    { "id": "...", "slug": "member", "name": "成员" }
  ]
}
```

---

### GET /api/users/{id}

**成功响应** (200): 同列表项结构。

**错误响应** (404):
```json
{
  "error": { "code": "NOT_FOUND", "message": "用户不存在" }
}
```

---

### PATCH /api/users/{id}

**请求**（仅发送需更新的字段）:
```json
{
  "display_name": "张三（已更新）",
  "is_active": false
}
```

**成功响应** (200): 同详情响应。

---

### DELETE /api/users/{id}

**成功响应** (204): 无响应体。

---

## 3. 角色管理

### GET /api/roles

**成功响应** (200):
```json
{
  "data": [
    {
      "id": "...",
      "tenant_id": null,
      "name": "管理员",
      "slug": "admin",
      "description": "系统管理员，拥有全部权限",
      "is_system": true,
      "permissions": [
        { "action": "manage", "resource": "plugin" },
        { "action": "manage", "resource": "user" }
      ],
      "user_count": 2,
      "created_at": "2026-07-10T00:00:00Z"
    }
  ],
  "meta": {
    "count": 3,
    "page": 1,
    "pageSize": 20,
    "totalPages": 1
  }
}
```

---

### POST /api/roles

**请求**:
```json
{
  "name": "审计员",
  "slug": "auditor",
  "description": "只读审计日志",
  "permission_ids": ["perm-uuid-1", "perm-uuid-2"]
}
```

**成功响应** (201): 同列表项结构。

**审计**: 创建角色时写入 audit_log（action=`rbac:create_role`，发现 #24）。

---

### PATCH /api/roles/{id}

**请求**:
```json
{
  "name": "审计员（已更新）",
  "permission_ids": ["perm-uuid-1"]
}
```

**成功响应** (200): 同详情。

**审计**: 修改角色时写入 audit_log（action=`rbac:assign_role`）。

---

### DELETE /api/roles/{id}

**约束**: `is_system: true` 的角色不可删除。

**成功响应** (204)。

**审计**: 删除角色时写入 audit_log（action=`rbac:delete_role`）。

---

### GET /api/permissions

> 为角色权限选择器 UI 提供全部权限项列表。

**成功响应** (200):
```json
{
  "data": [
    {
      "id": "perm-uuid-1",
      "resource": "user",
      "action": "create",
      "description": "创建用户"
    },
    {
      "id": "perm-uuid-2",
      "resource": "plugin",
      "action": "manage",
      "description": "管理插件（启用/禁用/安装）"
    }
  ]
}
```

> **权限**: 需 `read:permission` 权限。此端点通常返回全部权限（不分页），供角色表单的权限选择器使用。

---
## 4. 插件管理

### GET /api/plugins

**成功响应** (200):
```json
{
  "data": [
    {
      "id": "...",
      "name": "@audebase/plugin-core",
      "version": "1.0.0",
      "display_name": "内核插件",
      "state": "enabled",
      "category": "system",
      "description": "平台内核引导模块",
      "dependencies": [],
      "runtime_mode": "inline",
      "runtime_partition": "SYSTEM",
      "installed_at": "2026-07-10T00:00:00Z"
    }
  ],
  "meta": {
    "count": 5,
    "page": 1,
    "pageSize": 20,
    "totalPages": 1
  }
}
```

---

### POST /api/plugins/{name}/enable

**成功响应** (200):
```json
{
  "id": "...",
  "name": "@audebase/plugin-example",
  "state": "enabled"
}
```

**错误响应** (409):
```json
{
  "error": {
    "code": "PLUGIN_MIGRATION_FAILED",
    "message": "插件迁移失败，无法启用。请检查 migration_history 表",
    "details": { "migration_id": "uuid" }
  }
}
```

**审计**: 写入 audit_log（action=`lifecycle:enable`）。

---

### POST /api/plugins/{name}/disable

**成功响应** (200):
```json
{
  "id": "...",
  "name": "@audebase/plugin-example",
  "state": "disabled"
}
```

**约束**: `auto_install: true` 的插件（如 plugin-core）不可禁用。

**审计**: 写入 audit_log（action=`lifecycle:disable`）。

---

### POST /api/plugins/{name}/install

**请求**:
```json
{}
```

**成功响应** (200):
```json
{
  "success": true,
  "data": {
    "id": "...",
    "name": "@audebase/plugin-example",
    "version": "1.0.0",
    "state": "installed"
  }
}
```

**错误响应** (409):
```json
{
  "error": {
    "code": "CONFLICT",
    "message": "插件已安装"
  }
}
```

**审计**: 写入 audit_log（action=`lifecycle:install`）。

---
## 5. 审计日志

### GET /api/audit-logs

**查询参数**:

| 参数 | 类型 | 说明 |
|------|------|------|
| `page` | integer | 分页 |
| `pageSize` | integer | 每页条数 |
| `sort` | string | 默认 `-created_at` |
| `filter` | JSON | 支持 `action`、`resource_type`、`resource_id`、`actor_id` 过滤 |

**请求示例**: `GET /api/audit-logs?filter={"resource_type":"user","action":"update"}`

**成功响应** (200):
```json
{
  "data": [
    {
      "id": "...",
      "tenant_id": "...",
      "actor": { "id": "...", "username": "admin" },
      "action": "update",
      "resource_type": "user",
      "resource_id": "0192ef1b-...",
      "new_values": { "display_name": "张三（已更新）" },
      "ip": "192.168.1.1",
      "user_agent": "Mozilla/5.0 ...",
      "request_id": "req-abc123",
      "created_at": "2026-07-13T10:35:00Z"
    }
  ],
  "meta": {
    "count": 128,
    "page": 1,
    "pageSize": 20,
    "totalPages": 7
  }
}
```

> **权限**: 需 `read:audit_log` 权限。

---

## 6. 健康检查 & 调试

### GET /api/health

**成功响应** (200):
```json
{
  "status": "ok",
  "db": true,
  "redis": true,
  "uptime": 86400,
  "version": "0.1.0",
  "timestamp": "2026-07-13T10:00:00Z"
}
```

---

### GET /api/health/ready

**成功响应** (200): `{"status":"ready"}`  
**未就绪** (503): `{"status":"not_ready","db":false}`

---

### GET /api/logs

> **说明**: 返回内存环形缓冲区中最近 100 条日志（非持久化存储）。

**成功响应** (200):
```json
{
  "data": [
    {
      "timestamp": "2026-07-13T10:00:00Z",
      "level": "info",
      "requestId": "req-abc123",
      "message": "GET /api/users 200 45ms"
    }
  ],
  "meta": {
    "count": 100,
    "page": 1,
    "pageSize": 100,
    "totalPages": 1
  }
}
```

---

## 速率限制响应

所有端点超限时返回 (429):

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "请求过于频繁，请稍后再试"
  }
}
```

**响应头**: `X-RateLimit-Limit: 100`, `X-RateLimit-Remaining: 0`, `X-RateLimit-Reset: 1750318800`, `Retry-After: 60`

**分层策略**（发现 #22）:

| 端点 | 限制 | 作用域 |
|------|:---:|------|
| `POST /api/auth/login` | 5/min | per-IP |
| 所有其他端点 | 100/min | per-IP |

---

## 错误码参考

| 错误码 | HTTP 状态 | 说明 |
|--------|:---:|------|
| `AUTH_INVALID_CREDENTIALS` | 401 | 用户名或密码错误 |
| `AUTH_TOKEN_EXPIRED` | 401 | Token 过期或已撤销 |
| `AUTH_TOKEN_INVALID` | 401 | Token 格式无效 |
| `AUTH_MUST_CHANGE_PASSWORD` | 403 | 需先修改密码 |
| `FORBIDDEN` | 403 | 权限不足 |
| `NOT_FOUND` | 404 | 资源不存在 |
| `VALIDATION_ERROR` | 400 | 请求参数校验失败 |
| `CONFLICT` | 409 | 资源冲突（如重复用户名） |
| `PLUGIN_MIGRATION_FAILED` | 409 | 插件迁移失败 |
| `RATE_LIMIT_EXCEEDED` | 429 | 请求频率超限 |
| `INTERNAL_ERROR` | 500 | 服务器内部错误 |

---

## 参考

- API 约定: [api-conventions.md](api-conventions.md)（分页、过滤、排序详细格式）
- DB Schema: [database-schema.md](database-schema.md)
- 架构决策: `../../.agents/memorys/decisions.md` — D1.8, D1.12, D1.13, D8.1, D12
- Phase 划分: [phase-planning.md](../phase-planning.md)
