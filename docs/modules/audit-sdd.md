# Audit Log SDD — Phase 1a

> **创建日期**: 2026-07-13  
> **目的**: 为 Phase 1a #10 模块（审计日志）提供完整的数据模型、Core 中间件与查询接口定义。  
> **前置阅读**: D1.12; database-schema.md §9; api-specification.md §5; api-conventions.md §4, §11  
> **责任人**: Person C（安全/基础模块）

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  Audit Log 模块 (packages/audit/src/)                         │
│                                                             │
│  ┌──────────────────┐    ┌─────────────────────────────┐    │
│  │ AuditMiddleware   │───▶│ audit_log 表                  │    │
│  │ (Fastify onSend) │    │ ┌─────────────────────────┐ │    │
│  │ · 拦截写操作      │    │ │ id, tenant_id, actor_id │ │    │
│  │ · 提取请求上下文  │    │ │ action, resource_type,  │ │    │
│  │ · 序列化变更内容  │    │ │ resource_id, old_values │ │    │
│  │ · 异步写入（      │    │ │ new_values, ip, ua,     │ │    │
│  │   不阻塞响应）    │    │ │ request_id, created_at  │ │    │
│  └──────────────────┘    │ └─────────────────────────┘ │    │
│                          └─────────────────────────────┘    │
│  ┌──────────────────┐                                       │
│  │ AuditController   │  (查询接口)                           │
│  │ GET /audit-logs   │                                      │
│  └──────────────────┘                                       │
└─────────────────────────────────────────────────────────────┘
```

**核心原则**:
- 写操作审计是自动的——开发者无需手动调用审计 API
- 读操作不记录（避免日志膨胀，Phase 2 可选敏感读操作审计）
- 异步写入，不阻塞正常响应
- 写失败不中断 API 请求（fallback: 记录 pino error 日志）

---

## 2. Public API Surface

### 2.1 AuditService

```typescript
// packages/audit/src/audit-service.ts

interface AuditService {
  /**
   * 记录审计事件（Core 中间件内部调用）
   * 
   * 由 AuditMiddleware 自动调用，插件开发者通常无需直接使用。
   * 但生命周期事件（install/enable/disable）需显式调用此方法。
   * 
   * 异步写入，不阻塞主请求流程。
   * 写入失败 → logger.error() → 不抛出异常
   * 
   * @param entry 审计事件
   */
  log(entry: AuditLogInput): Promise<void>

  /**
   * 查询审计日志
   * 
   * 支持按 resource_type、action、resource_id、actor_id 过滤
   * 按 created_at DESC 排序
   * 
   * @throws UserError(VALIDATION_ERROR) — filter 格式无效
   */
  query(params: AuditLogQueryParams): Promise<ApiListResponse<AuditLogEntry>>

  /**
   * 获取指定资源的审计历史
   * 
   * 快捷方法，等价于:
   *   query({ filter: { resource_type, resource_id } })
   * 
   * 使用复合索引 idx_audit_log_resource(tenant_id, resource_type, resource_id)
   */
  getResourceHistory(
    resourceType: string,
    resourceId: string,
    pagination: PaginationMeta
  ): Promise<ApiListResponse<AuditLogEntry>>
}
```

### 2.2 AuditMiddleware（Fastify onSend hook）

```typescript
// packages/audit/src/audit-middleware.ts

/**
 * 审计中间件 — 自动记录所有 API 写操作
 * 
 * 注册方式:
 *   fastify.addHook('onSend', auditMiddleware)
 * 
 * 触发条件:
 *   - HTTP 方法: POST | PUT | PATCH | DELETE
 *   - 响应状态码: 2xx（仅成功操作记录审计）
 * 
 * 提取内容:
 *   1. actor_id — 从 req.user.id 获取（需已通过 requireAuth）
 *   2. action — 根据 HTTP 方法映射
 *      POST → 'create', PUT/PATCH → 'update', DELETE → 'delete'
 *   3. resource_type — 从路由元数据获取
 *   4. resource_id — 从响应体中提取（create 操作）或路由参数（update/delete 操作）
 *   5. old_values — 由路由处理器通过 req.auditOldValues 提供（update/delete 前设置）
 *   6. new_values — 从 req.body 获取（去除 password_hash 等敏感字段）
 *   7. ip — 从 req.ip 获取
 *   8. user_agent — 从 req.headers['user-agent'] 获取
 *   9. request_id — 从 req.headers['x-request-id'] 获取
 */
interface AuditMiddlewareOptions {
  /** 敏感字段黑名单 — 这些字段不会出现在 new_values 中 */
  sensitiveFields?: string[]  // 默认: ['password', 'password_hash', 'token']
}

/**
 * 路由元数据装饰器 — 声明路由的资源类型
 * 
 * 使用:
 *   fastify.post('/api/users', {
 *     config: { auditResource: 'user' }
 *   }, handler)
 */
interface AuditRouteConfig {
  auditResource: string  // 如 'user', 'role', 'plugin'
}
```

### 2.3 审计事件输入类型

```typescript
// packages/audit/src/audit-types.ts

interface AuditLogInput {
  tenant_id: string
  actor_id: string | null       // null = 系统操作
  action: string                // 动作标识
  resource_type: string         // 资源类型
  resource_id: string | null
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  ip: string | null
  user_agent: string | null
  request_id: string | null
}

interface AuditLogQueryParams extends ListQueryParams {
  filter?: {
    action?: string | { $in: string[] }
    resource_type?: string
    resource_id?: string
    actor_id?: string
    /** 时间范围过滤 */
    created_at?: {
      $gte?: string   // ISO 8601
      $lte?: string   // ISO 8601
    }
  }
}
```

---

## 3. 标准动作名称（Action Catalog）

> 所有审计事件使用统一动作标识。模块开发者应使用预定义的动作名，确保日志可查询。

```typescript
// packages/audit/src/action-catalog.ts

/**
 * 标准审计动作枚举
 * 
 * 命名规则: {分类}:{动作}
 * 开发者可扩展自定义动作（如 'erp:purchase_order_approve'），
 * 但公共模块（auth/rbac/lifecycle）必须使用以下预定义值
 */
export const AuditAction = {
  // === Auth（认证） ===
  AUTH_LOGIN:              'auth:login',
  AUTH_LOGOUT:             'auth:logout',
  AUTH_REFRESH_TOKEN:      'auth:refresh_token',
  AUTH_PASSWORD_CHANGE:    'auth:password_change',

  // === CRUD ===
  CREATE:                  'create',
  UPDATE:                  'update',
  DELETE:                  'delete',

  // === Lifecycle（插件生命周期） ===
  LIFECYCLE_INSTALL:      'lifecycle:install',
  LIFECYCLE_UNINSTALL:    'lifecycle:uninstall',
  LIFECYCLE_ENABLE:       'lifecycle:enable',
  LIFECYCLE_DISABLE:      'lifecycle:disable',
  LIFECYCLE_UPGRADE:      'lifecycle:upgrade',       // Phase 1b

  // === RBAC ===
  RBAC_ASSIGN_ROLE:       'rbac:assign_role',
  RBAC_REVOKE_ROLE:       'rbac:revoke_role',
  RBAC_CREATE_ROLE:       'rbac:create_role',
  RBAC_DELETE_ROLE:       'rbac:delete_role',
  RBAC_UPDATE_ROLE:       'rbac:update_role',

  // === System ===
  SYSTEM_STARTUP:         'system:startup',
  SYSTEM_SHUTDOWN:        'system:shutdown',
  SYSTEM_HEALTH_CHECK:    'system:health_check',
  SYSTEM_ERROR:           'error',                   // 非正常操作错误
} as const

export type AuditActionType = typeof AuditAction[keyof typeof AuditAction]
```

---

## 4. 自动审计中间件实现细节

### 4.1 请求→审计事件映射

```typescript
/**
 * 从 Fastify request/response 提取审计事件
 */
async function extractAuditEvent(
  request: FastifyRequest,
  reply: FastifyReply,
  sensitiveFields: string[]
): Promise<AuditLogInput | null> {
  // 1. 仅处理写操作
  const writeMethods = ['POST', 'PUT', 'PATCH', 'DELETE']
  if (!writeMethods.includes(request.method)) return null

  // 2. 仅处理成功响应（2xx）
  if (reply.statusCode < 200 || reply.statusCode >= 300) return null

  // 3. 需已通过认证（除非是登录/刷新端点）
  const isPublicAuthRoute = request.url.startsWith('/api/auth/')
  if (!isPublicAuthRoute && !request.user) return null

  // 4. 提取资源类型（从路由 config 或 URL 推断）
  const resourceType = getResourceType(request)

  // 5. 映射 HTTP 方法 → action
  const action = mapHttpMethodToAction(request.method)

  // 6. 提取 resource_id
  const resourceId = extractResourceId(request, reply)

  // 7. 构建 new_values（去除敏感字段）
  const newValues = request.method !== 'DELETE'
    ? sanitizeBody(request.body as Record<string, unknown>, sensitiveFields)
    : null

  // 8. 获取 old_values（由前置钩子设置）
  const oldValues = (request as any).auditOldValues ?? null

  return {
    tenant_id: request.user?.tenant_id ?? '00000000-0000-0000-0000-000000000000',
    actor_id: request.user?.id ?? null,
    action: isPublicAuthRoute ? extractAuthAction(request) : action,
    resource_type: resourceType,
    resource_id: resourceId,
    old_values: oldValues,
    new_values: newValues,
    ip: request.ip,
    user_agent: request.headers['user-agent'] ?? null,
    request_id: request.headers['x-request-id'] as string ?? null,
  }
}
```

### 4.2 敏感字段过滤

```typescript
// 默认敏感字段黑名单 — new_values 中移除这些字段
const DEFAULT_SENSITIVE_FIELDS = [
  'password',
  'password_hash',
  'token',
  'access_token',
  'refresh_token',
  'token_version',
  'secret',
  'api_key',
]

/**
 * 从对象中递归移除敏感字段
 * 不可变操作 — 返回新对象
 */
function sanitizeBody(
  body: Record<string, unknown>,
  sensitiveFields: string[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(body)) {
    if (sensitiveFields.includes(key)) {
      result[key] = '[REDACTED]'
      continue
    }
    result[key] = body[key]
  }
  return result
}
```

---

## 5. 错误处理

### 5.1 审计写入失败处理

```
审计写入失败 → 不阻塞 API 响应:
  1. 审计事件在后执行（onSend hook）
  2. 写入失败 → logger.error('audit write failed', { error, entry }) → 无异常抛出
  3. API 响应正常返回客户端

审计表不可用:
  1. audit_log 表损坏/不可写 → pino error 日志记录
  2. 不影响任何业务功能
  3. Phase 2: 健康检查报告 audit_log 状态

审计查询:
  - filter 格式无效 → 返回 VALIDATION_ERROR
  - 权限不足 → 返回 FORBIDDEN
  - DB 查询失败 → 返回 INTERNAL_ERROR
```

### 5.2 审计日志膨胀控制

```
Phase 1a:
  - 无自动清理（管理员可手动通过 SQL 清理）
  - 不记录 GET 请求（避免日志膨胀）
  - new_values 仅存储变更字段（PATCH 请求仅记录实际变更的字段）

Phase 2:
  - 按保留期限自动归档（如 90 天）
  - 支持按租户配置保留策略
```

---

## 6. 测试边界

| 测试层级 | 范围 | 策略 | 文件位置 |
|---------|------|------|---------|
| 单元测试 | AuditService.log(), sanitizeBody(), action 映射 | mock DB | `src/__tests__/unit/` |
| 集成测试 | AuditMiddleware 完整流程（POST/PUT/PATCH/DELETE） | 真实 PG（事务回滚） | `src/__tests__/integration/` |
| E2E 测试 | 用户创建 → audit_log 查询 → 过滤验证 | Playwright + 预播种 | `packages/admin-ui/__e2e__/` |

### 最小测试用例集

1. **POST 自动审计**: POST /api/users → 自动写入 audit_log (action='create', resource_type='user')
2. **PATCH 变更记录**: PATCH /api/users/{id} → old_values + new_values 均非空
3. **DELETE 审计**: DELETE /api/users/{id} → old_values 非空, new_values = null
4. **GET 不记录**: GET /api/users → 不产生审计记录
5. **敏感字段过滤**: POST body 含 password → new_values 中 password = '[REDACTED]'
6. **auth 动作**: login 成功 → action='auth:login' → 失败 → action='auth:login' 仍记录（记录失败登录尝试）
7. **审计查询过滤**: filter={resource_type:'user', action:'create'} → 仅返回匹配记录
8. **查询分页**: page=2&pageSize=10 → 正确分页结果
9. **审计写入失败不阻塞**: mock DB 写入失败 → API 仍返回 200 → pino error 日志记录
10. **ip + user_agent 记录**: 请求携带 X-Forwarded-For 和 User-Agent → 正确记录

---

## 7. 与其他模块的交互

| 消费方 | 接口 | 调用方式 |
|--------|------|---------|
| #1 内核骨架 | `AuditMiddleware` onSend hook | Fastify 自动注册 |
| #6 插件框架 | `AuditService.log()` | 插件生命周期变更时显式调用 |
| #8 RBAC | `AuditService.log()` | 认证事件 + RBAC 角色变更时调用 |
| #11 i18n | 无直接依赖 | — |
| #12 管理 UI | `GET /api/audit-logs` | 审计日志查看页面 |
| Core API 端点 | `AuditMiddleware` | 自动对所有 POST/PUT/PATCH/DELETE 生效 |

---

## 8. 查询索引策略

> DDL 以 [database-schema.md](database-schema.md) §9 为唯一规范。

| 查询模式 | 使用索引 | 示例 |
|---------|---------|------|
| 按资源查询审计历史 | `idx_audit_log_resource(tenant_id, resource_type, resource_id)` | 查看某用户的所有操作记录 |
| 按操作者查询 | `idx_audit_log_actor(tenant_id, actor_id)` | 查看某管理员的操作记录 |
| 按动作类型过滤 | `idx_audit_log_action(action)` | 查看所有登录事件 |
| 时间范围查询 | `idx_audit_log_created(created_at DESC)` | 查看最近 24h 审计事件 |
| 组合查询 | 复合索引 + 其他索引组合 | 查看管理员最近一周对用户的修改 |

---

## 9. Phase 2 扩展预留

| 能力 | Phase 1a 状态 | Phase 2 计划 |
|------|:---:|------|
| 字段级变更 diff | 旧值/新值全量存储 | JSON diff patch 格式（RFC 6902） |
| 审计日志归档 | 不自动清理 | 按保留期限自动归档到对象存储 |
| 敏感读操作审计 | 不记录 GET | 可选敏感资源读操作审计（如 salary 字段读取） |
| 实时审计流 | 无 | WebSocket 推送审计事件（D1.11） |
| 审计日志导出 | 无 | CSV/JSON 导出 |

---

## 10. Open Questions (Phase 1a 期间解决)

- [ ] audit_log 表的 JSONB 列（old_values / new_values）是否需要 GIN 索引（当前仅简单存储，Phase 2 考虑搜索需求）
- [ ] 审计中间件是否需要排除特定端点（如 /api/health、/api/logs）
- [ ] 审计日志针对大字段（如文件内容）的截断策略（当前全量存储，Phase 1a 内容体通常 < 100KB）
- [ ] 多租户下 audit_log 查询是否需要跨租户审计能力（当前仅单租户隔离）

---

## 11. 变更记录

| 版本 | 日期 | 变更内容 |
|------|------|---------|
| v0.1.0 | 2026-07-13 | 初始版本 |
