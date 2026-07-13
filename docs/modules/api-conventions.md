# AUDEBase API 约定

> **创建日期**: 2026-07-13  
> **目的**: 统一所有 API 端点的分页、过滤、排序、错误响应格式。前后端一致遵循的契约。  
> **来源于**: 发现 #9（分页标准缺失）+ 发现 #19（过滤/排序标准缺失）+ 发现 #22（速率限制作用域）。

---

## 1. 响应格式

### 单条资源

```json
{
  "id": "uuid",
  "field": "value",
  ...
}
```

### 资源列表（分页）

采用 NocoBase 分页格式（发现 #9）：

```json
{
  "data": [ ... ],
  "meta": {
    "count": 42,
    "page": 1,
    "pageSize": 20,
    "totalPages": 3
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `data` | array | 当前页资源列表 |
| `meta.count` | integer | 符合条件的总记录数 |
| `meta.page` | integer | 当前页码（1-based） |
| `meta.pageSize` | integer | 每页条数 |
| `meta.totalPages` | integer | 总页数 = ceil(count / pageSize) |

**约束**:
- 默认 `pageSize=20`，最大 `100`
- 前端 ProTable 请求参数 `current` → 后端接收为 `page`，响应字段使用 `page`（ProTable 兼容转换在前端完成）
- `/api/logs` 特殊处理: 该端点对应固定大小环形缓冲区（最多 100 条）, `meta.count` 表示缓冲区中的记录数而非 DB 总行数, `meta.totalPages` 仍按 `Math.ceil(count / pageSize)` 一致性计算

### 错误响应

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "人类可读的错误描述",
    "details": { ... }  // 可选，校验错误时携带字段级错误
  }
}
```

**校验错误示例**:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "请求参数校验失败",
    "details": {
      "username": "用户名长度应在 3-100 之间",
      "email": "邮箱格式无效"
    }
  }
}
```

---

## 2. 分页参数

### 请求参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|:---:|------|
| `page` | integer | 1 | 页码（1-based） |
| `pageSize` | integer | 20 | 每页条数（最大 100） |

**请求示例**:
```
GET /api/users?page=2&pageSize=50
```

**分页超出范围**: 返回空数组 `{ "data": [], "meta": { "count": 42, "page": 99, "pageSize": 20, "totalPages": 3 } }`（不报错）

---

## 3. 排序

采用 Directus 排序前缀格式（发现 #19）：

| 格式 | 说明 |
|------|------|
| `sort=created_at` | 按 created_at 升序 |
| `sort=-created_at` | 按 created_at 降序（`-` 前缀） |

**多字段排序**: 逗号分隔
```
GET /api/users?sort=-created_at,username
```

**ProTable 兼容**: 前端 ProTable `sorter` 参数自动转换为 `sort` 查询参数（前端适配层完成）。

**默认排序**: 列表端点默认按 `-created_at` 降序。

---

## 4. 过滤

采用 NocoBase 风格 filter JSON（发现 #19）：

### 操作符

| 操作符 | 说明 | 示例 |
|--------|------|------|
| `$eq` | 等于（默认） | `{"is_active": true}` |
| `$ne` | 不等于 | `{"state": {"$ne": "disabled"}}` |
| `$gt` | 大于 | `{"age": {"$gt": 18}}` |
| `$gte` | 大于等于 | `{"created_at": {"$gte": "2026-01-01"}}` |
| `$lt` | 小于 | `{"age": {"$lt": 65}}` |
| `$lte` | 小于等于 | — |
| `$in` | 在集合中 | `{"state": {"$in": ["enabled","installed"]}}` |
| `$nin` | 不在集合中 | `{"state": {"$nin": ["disabled"]}}` |
| `$includes` | 字符串包含（ILIKE %value%） | `{"display_name": {"$includes": "张"}}` |
| `$startsWith` | 字符串前缀匹配 | `{"username": {"$startsWith": "admin"}}` |
| `$null` | 是否为 NULL | `{"tenant_id": {"$null": true}}` |
| `$and` | 逻辑 AND | `{"$and": [{"is_active":true}, {"state":"enabled"}]}` |
| `$or` | 逻辑 OR | `{"$or": [{"state":"enabled"},{"state":"installed"}]}` |

### 请求示例

```
GET /api/audit-logs?filter={"resource_type":"user","action":{"$in":["update","delete"]}}
```

URL 编码后:
```
GET /api/audit-logs?filter=%7B%22resource_type%22%3A%22user%22%2C%22action%22%3A%7B%22%24in%22%3A%5B%22update%22%2C%22delete%22%5D%7D%7D
```

### 实现约束

- filter JSON 在服务端用 Zod schema 校验结构合法性
- 非白名单操作符拒绝并返回 VALIDATION_ERROR
- `tenant_id` 过滤由 Core 自动注入，不接受客户端传入
- 不支持嵌套关联过滤（Phase 2 扩展）

---

## 5. 认证

### Token 传递

```
Authorization: Bearer <access_token>
```

### Token 生命周期（发现 #6）

| Token 类型 | 过期时间 | 存储位置 |
|-----------|:---:|------|
| Access Token | 15 分钟 | 内存（前端） |
| Refresh Token | 7 天 | HttpOnly Cookie 或安全存储 |

### Token 撤回

更新 `users.token_version` → 所有旧 token 失效 → 客户端需用 refresh_token 获取新 access_token。

---

## 6. 速率限制（发现 #22）

### 分层策略

| 端点 | 限制 | 作用域 | 说明 |
|------|:---:|------|------|
| `POST /api/auth/login` | 5/min | per-IP | 防暴力破解 |
| `POST /api/auth/refresh` | 20/min | per-IP | 刷新频率略高 |
| 所有其他端点 | 100/min | per-IP | 全局限制 |

### 速率限制响应头

| 响应头 | 说明 |
|--------|------|
| `X-RateLimit-Limit` | 时间窗口内最大请求数 |
| `X-RateLimit-Remaining` | 剩余可用请求数 |
| `X-RateLimit-Reset` | Unix 时间戳，窗口重置时间 |
| `Retry-After` | 超限后建议等待秒数 |

### 超限响应

```json
{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "请求过于频繁，请稍后再试"
  }
}
```

HTTP 状态码: 429 Too Many Requests

---

## 7. 多租户

### 上下文确定

当前租户上下文通过 JWT access_token payload 的 `tenant_id` 声明确定。

### 请求隔离

- 所有表查询自动注入 `WHERE tenant_id = currentTenantId`（Phase 1a 基础）
- `tenant_id` 不接受客户端通过查询参数传入
- 系统全局资源（`tenant_id IS NULL`）通过特定端点访问（如插件列表、角色列表）

### 租户切换

全页重载（D24）: `onlineManager.setOnline(false)` → `queryClient.clear()` → `window.location.href = '/{newTenantId}/admin'`

---

## 8. 幂等性

- `POST` / `PATCH` / `DELETE` 端点不强制幂等
- 创建操作重复提交可能产生重复资源（Phase 2 引入 idempotency key）
- `GET` / `HEAD` 天然幂等

---

## 9. CORS

Phase 1a: 允许同源请求（CORS 头部由 Fastify CORS 插件管理，仅开发环境允许 localhost:*）。

---

## 10. 请求 ID 追踪

每个 HTTP 请求自动注入 `X-Request-ID` 响应头。所有日志记录包含 requestId 字段用于调试追踪。

---

## 11. 错误处理模式（发现 #27）

采用 Odoo 三层错误 + Stripe 结构化格式。所有错误通过 Core 全局错误中间件统一处理。

### 11.1 错误分类

| 错误类型 | HTTP 范围 | 前端可见 | 日志级别 | 说明 |
|----------|:---:|:---:|:---:|------|
| `UserError` | 4xx | 是（code + message + details） | warn | 用户可恢复错误 |
| `SystemError` | 5xx | 否（仅 INTERNAL_ERROR） | error | 系统错误，cause 仅写日志 |
| `AssertionError` | — | 仅开发环境 | error | 开发断言，生产静默降级 |

`UserError` 示例:
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "用户名长度应在 3-100 之间", "details": { "username": "用户名长度应在 3-100 之间" } } }
```

`SystemError` 示例（前端看到）:
```json
{ "error": { "code": "INTERNAL_ERROR", "message": "服务器内部错误" } }
```

### 11.2 错误码枚举

| 分类 | 错误码 | HTTP | 说明 |
|------|--------|:---:|------|
| Auth | `AUTH_INVALID_CREDENTIALS` | 401 | 用户名或密码错误 |
| Auth | `AUTH_TOKEN_EXPIRED` | 401 | Token 过期或已撤销 |
| Auth | `AUTH_TOKEN_INVALID` | 401 | Token 格式无效 |
| Auth | `AUTH_MUST_CHANGE_PASSWORD` | 403 | 需先修改密码 |
| Auth | `FORBIDDEN` | 403 | 权限不足 |
| Validation | `VALIDATION_ERROR` | 400 | 请求参数校验失败 |
| Validation | `CONFLICT` | 409 | 资源冲突（如重复用户名） |
| Validation | `NOT_FOUND` | 404 | 资源不存在 |
| Plugin | `PLUGIN_MIGRATION_FAILED` | 409 | 插件迁移失败 |
| Plugin | `PLUGIN_NOT_FOUND` | 404 | 插件不存在 |
| Plugin | `PLUGIN_DEPENDENCY_MISSING` | 409 | 依赖缺失 |
| Plugin | `PLUGIN_ALREADY_INSTALLED` | 409 | 已安装 |
| RBAC | `RBAC_ROLE_NOT_FOUND` | 404 | 角色不存在 |
| RBAC | `RBAC_PERMISSION_DENIED` | 403 | 无权限 |
| Rate | `RATE_LIMIT_EXCEEDED` | 429 | 请求频率超限 |
| System | `INTERNAL_ERROR` | 500 | 服务器内部错误 |
| System | `DB_UNAVAILABLE` | 503 | 数据库不可用 |

`ErrorCode` 枚举定义于 `@audebase/shared-types/errors.ts`。

### 11.3 插件错误传播契约

```
插件代码:
  throw new UserError(ErrorCode.VALIDATION_ERROR, 'msg', { field: 'error' })
  throw SystemError(ErrorCode.DB_UNAVAILABLE, 'db timeout', originalPgError)

Core 全局错误中间件:
  1. UserError  → logger.warn → reply 4xx → 返回 { error: { code, message, details? } }
  2. SystemError → logger.error → reply 5xx → 返回 { error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' } }
  3. unknown Error → logger.error → reply 500 → 同上
```

### 11.4 插件错误约束

| 规则 | 说明 |
|------|------|
| 只能 throw UserError 或 SystemError | Core 中间件拒绝其他 Error 类型直接透传 |
| UserError.message 可返回给前端 | 对用户可读 |
| SystemError.message 永不返回给前端 | 固定返回「服务器内部错误」 |
| 所有 Error 必须携带 ErrorCode | 前端统一 switch-case 处理 |
| 未知 Error 封装为 INTERNAL_ERROR | 原 error 记录到 cause 字段 |

---
---

## 参考

- API 端点规范: [api-specification.md](api-specification.md)（每个端点的具体请求/响应格式）
- DB Schema: [database-schema.md](database-schema.md)（表结构与字段定义）
- 架构决策: `../../.agents/memorys/decisions.md` — D1.8, D4, D8.1, D24
- Phase 划分: [phase-planning.md](../phase-planning.md)
