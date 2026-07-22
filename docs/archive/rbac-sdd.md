# RBAC & Auth SDD — Phase 1a

> **创建日期**: 2026-07-13  
> **目的**: 为 Phase 1a #8 模块（基础 RBAC + JWT 认证）提供完整的接口定义、数据模型与错误处理契约。  
> **前置阅读**: D8.1, D10, D19; database-schema.md §3-§8; api-specification.md §1-§3; api-conventions.md §5  
> **责任人**: Person C（安全/基础模块）

---

## 1. 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│  Phase 1a RBAC 模块 (packages/rbac/src/)                      │
│                                                             │
│  ┌───────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ AuthService│  │PermissionSvc │  │ ACL Middleware       │  │
│  │ · login   │  │ · can()      │  │ · Fastify onRequest  │  │
│  │ · refresh │  │ · getRoles() │  │ · 注入 req.user      │  │
│  │ · logout  │  │ · assignRole │  │ · 403 on permission  │  │
│  │ · verify  │  │              │  │   denied              │  │
│  └───────────┘  └──────────────┘  └──────────────────────┘  │
│                                                             │
│  ┌──────────────┐                                           │
│  │ AuthController│  (Fastify route handler)                 │
│  │ POST /auth/*  │                                          │
│  └──────────────┘                                           │
│                                                             │
│  数据层                                                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ users | roles | permissions | user_roles              │   │
│  │ role_permissions | refresh_tokens                     │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Public API Surface

### 2.1 AuthService

```typescript
// packages/rbac/src/auth-service.ts

interface AuthService {
  /**
   * 用户登录
   * 
   * 流程:
   * 1. username 查找用户（含 tenant_id 上下文）
   * 2. bcrypt.compare() 校验密码
   * 3. 检查 must_change_password → 返回 AUTH_MUST_CHANGE_PASSWORD
   * 4. 生成 access_token（15min）+ refresh_token（7d）
   * 5. refresh_token SHA-256 哈希存入 refresh_tokens 表
   * 6. 更新 users.last_login_at
   * 7. 写入 audit_log（action='auth:login'）
   * 
   * @throws UserError(AUTH_INVALID_CREDENTIALS) — 用户名或密码错误
   * @throws UserError(AUTH_MUST_CHANGE_PASSWORD) — 需先修改密码
   */
  login(request: LoginRequest): Promise<LoginResponse>

  /**
   * 刷新 access_token
   * 
   * 流程:
   * 1. SHA-256(refresh_token) 查 refresh_tokens 表
   * 2. 校验未过期、未撤销（revoked_at IS NULL）
   * 3. 校验 token_version 一致（JWT payload vs users.token_version）
   * 4. 撤销旧 refresh_token（设置 revoked_at）
   * 5. 生成新 access_token + 新 refresh_token（轮转）
   * 6. 新 refresh_token 哈希存入 refresh_tokens
   * 
   * @throws UserError(AUTH_TOKEN_EXPIRED) — token 过期或已撤销
   */
  refresh(request: RefreshRequest): Promise<RefreshResponse>

  /**
   * 登出
   * 
   * 流程:
   * 1. SHA-256(refresh_token) 查 refresh_tokens 表
   * 2. 设置 revoked_at = NOW()
   * 3. access_token 在过期前仍有效
   * 
   * @throws UserError(AUTH_TOKEN_EXPIRED)
   */
  logout(request: LogoutRequest): Promise<void>

  /**
   * 校验 JWT access_token
   * 
   * 流程:
   * 1. jwt.verify(token, AUDE_JWT_SECRET)
   * 2. 校验 exp 未过期
   * 3. 校验 token_version（JWT payload vs users.token_version）
   * 4. 返回 JwtPayload
   * 
   * @throws UserError(AUTH_TOKEN_EXPIRED) — 过期
   * @throws UserError(AUTH_TOKEN_INVALID) — 格式无效或被撤回
   */
  verifyAccessToken(token: string): Promise<JwtPayload>

  /**
   * 修改用户密码
   * 
   * 流程:
   * 1. 校验 oldPassword（当前用户）或跳过（管理员重置）
   * 2. bcrypt.hash(newPassword) 更新 users.password_hash
   * 3. users.token_version + 1（所有旧 token 失效）
   * 4. 撤销该用户所有 refresh_tokens
   * 5. 设置 must_change_password = false
   * 6. 写入 audit_log（action='auth:password_change'）
   * 
   * @throws UserError(AUTH_INVALID_CREDENTIALS) — 旧密码错误
   */
  changePassword(userId: string, oldPassword: string | null, newPassword: string): Promise<void>
}
```

### 2.2 PermissionService

```typescript
// packages/rbac/src/permission-service.ts

interface PermissionService {
  /**
   * 检查用户是否有指定权限
   * 
   * 流程:
   * 1. 从 user_roles JOIN role_permissions JOIN permissions 查询
   * 2. 匹配 permission.action 和 permission.resource
   * 3. 'manage' action 包含所有 CRUD 权限
   * 4. 缓存角色-权限映射（内存，TTL 5min）
   * 
   * @returns true 当用户拥有该权限
   */
  can(userId: string, action: PermissionAction, resource: string): Promise<boolean>

  /**
   * 获取用户的所有权限项列表
   * 
   * 用于前端 ACLProvider 初始化和角色管理页面的权限选择器
   */
  getUserPermissions(userId: string): Promise<PermissionBrief[]>

  /**
   * 获取用户角色列表
   */
  getUserRoles(userId: string): Promise<RoleBrief[]>

  /**
   * 为用户分配角色
   * 
   * 流程:
   * 1. 校验角色存在且属于同一 tenant_id
   * 2. INSERT INTO user_roles（幂等：已存在则跳过）
   * 3. 写入 audit_log（action='rbac:assign_role', resource_type='user', resource_id=userId）
   * 4. 清除权限缓存
   */
  assignRole(userId: string, roleId: string): Promise<void>

  /**
   * 撤销用户角色
   * 
   * 流程:
   * 1. DELETE FROM user_roles WHERE user_id=userId AND role_id=roleId
   * 2. 写入 audit_log（action='rbac:revoke_role'）
   * 3. 清除权限缓存
   * 
   * 约束: 不能撤销用户的最后一个角色（至少保留一个角色）
   */
  revokeRole(userId: string, roleId: string): Promise<void>

  /**
   * 获取全部权限项列表
   * 
   * 供角色管理页面的权限选择器使用
   */
  getAllPermissions(): Promise<Permission[]>
}
```

### 2.3 ACL Middleware（Fastify onRequest）

```typescript
// packages/rbac/src/acl-middleware.ts

/**
 * 声明式路由权限装饰器
 * 
 * 使用示例:
 *   fastify.get('/api/users', { preHandler: [requireAuth, acl('read', 'user')] }, handler)
 *   fastify.post('/api/users', { preHandler: [requireAuth, acl('create', 'user')] }, handler)
 *   fastify.get('/api/health', handler)  // 无需认证
 */

/**
 * requireAuth — 验证 JWT token 并注入 req.user
 * 
 * 流程:
 * 1. 从 Authorization header 提取 Bearer token
 * 2. 调用 AuthService.verifyAccessToken()
 * 3. 校验通过 → 注入 req.user = { id, tenant_id, username, roles }
 * 4. 失败 → 返回 401 或 403 (AUTH_MUST_CHANGE_PASSWORD)
 */
interface requireAuth {
  (request: FastifyRequest, reply: FastifyReply): Promise<void>
}

/**
 * acl — 权限校验中间件工厂
 * 
 * 流程:
 * 1. 确保 request 已通过 requireAuth
 * 2. 检查 PermissionService.can(req.user.id, action, resource)
 * 3. admin 角色自动通过所有权限检查
 * 4. 失败 → 返回 403 FORBIDDEN
 * 
 * @param action 所需权限动作
 * @param resource 资源名
 */
function acl(action: PermissionAction, resource: string): FastifyPreHandler

/**
 * injectTenantFilter — 自动注入 tenant_id 过滤
 * 
 * 流程:
 * 1. 从 req.user.tenant_id 获取当前租户上下文
 * 2. 注入到 Drizzle 查询的 WHERE 条件
 * 3. 不接受客户端传入的 tenant_id 参数
 */
interface injectTenantFilter {
  (request: FastifyRequest): void
}
```

### 2.4 JWT 工具函数

```typescript
// packages/rbac/src/jwt.ts

/**
 * 生成 access_token
 * 
 * 算法: HS256, 过期 15 分钟
 * 
 * @throws SystemError — JWT 签名失败
 */
function generateAccessToken(user: User, jwtSecret: string): string

/**
 * 生成 refresh_token
 * 
 * 算法: crypto.randomBytes(48) → hex (96 字符随机字符串)
 * 不编码任何 payload，仅作为 opaque token
 */
function generateRefreshToken(): string

/**
 * SHA-256 哈希（用于 refresh_token 存储）
 */
function hashToken(token: string): string

/**
 * 启动时校验 JWT 密钥
 * 
 * @throws AssertionError — AUDE_JWT_SECRET 未设置或长度不足
 */
function assertJwtSecret(): void  // assert(process.env.AUDE_JWT_SECRET?.length >= 32)
```

---

## 3. 数据模型（与 DB Schema 的映射）

> DDL 以 [database-schema.md](database-schema.md) 为唯一规范。以下描述 RBAC 模块的运行时行为。

### 3.1 Roles 缓存策略

```typescript
// 角色-权限映射内存缓存（TTL 5min）
interface RolePermissionCache {
  get(userId: string): PermissionBrief[] | undefined
  set(userId: string, perms: PermissionBrief[]): void
  invalidate(userId: string): void        // assignRole/revokeRole 时调用
  invalidateAll(): void                   // role_permissions 变更时调用
}
```

### 3.2 Token Version 撤回机制

```
users.token_version 字段用于 token 撤回（D8.1）:

JWT payload 中携带 token_version:
  { sub, tenant_id, username, roles, token_version: 3, iat, exp }

AuthService.verifyAccessToken():
  校验 JWT.payload.token_version === users.token_version
  不一致 → token 已失效 → 返回 AUTH_TOKEN_EXPIRED

撤回方式:
  - 修改密码 → token_version += 1（所有旧 token 失效）
  - 管理员强制登出 → token_version += 1
  - 撤销所有 refresh_tokens（设置 revoked_at）
```

---

## 4. 错误处理契约

### 4.1 标准错误响应

所有 auth/RBAC 错误通过 Core 全局错误中间件统一处理：

| 场景 | 错误码 | HTTP | 说明 |
|------|--------|:---:|------|
| 用户名或密码错误 | `AUTH_INVALID_CREDENTIALS` | 401 | 不区分「用户不存在」和「密码错误」（防枚举） |
| Token 过期 | `AUTH_TOKEN_EXPIRED` | 401 | 需用 refresh_token 刷新 |
| Token 格式无效 | `AUTH_TOKEN_INVALID` | 401 | 篡改或伪造的 token |
| 需修改密码 | `AUTH_MUST_CHANGE_PASSWORD` | 403 | user.must_change_password = true 时 |
| 权限不足 | `FORBIDDEN` | 403 | 无该操作权限 |
| RBAC 角色不存在 | `RBAC_ROLE_NOT_FOUND` | 404 | 分配/删除不存在的角色 |
| 无权限 | `RBAC_PERMISSION_DENIED` | 403 | 用户无权访问该资源 |
| 无法删除系统角色 | `RBAC_CANNOT_DELETE_SYSTEM_ROLE` | 403 | is_system: true 的角色 |

### 4.2 安全约束

```
防暴力破解（登录）:
  - 速率限制: POST /api/auth/login 5 次/分钟 per-IP
  - 连续 3 次失败 → 60s 冷却（不返回详细原因）
  - 不区分「用户不存在」和「密码错误」→ 统一返回 AUTH_INVALID_CREDENTIALS

防 token 枚举:
  - /api/auth/refresh 不区分 token 过期和 token 无效 → 统一返回 AUTH_TOKEN_EXPIRED
  - 不返回 token 内容预览

防权限绕过:
  - tenant_id 从 JWT payload 获取，不接受客户端传入
  - admin 角色检查在 PermissionService 内部处理（不在路由声明级别）
```

---

## 5. Phase 1a 前端 ACL 集成（D19）

### 5.1 ACLProvider Context

```typescript
// packages/admin-ui/src/providers/acl-provider.tsx

interface ACLContextValue {
  /** 当前用户权限列表 */
  permissions: PermissionBrief[]
  /** 权限是否已加载 */
  isLoaded: boolean
  /** 刷新权限（角色变更后调用） */
  refresh(): Promise<void>

  /**
   * 检查操作权限（按钮级）
   * 示例: can('create', 'user') → true/false
   */
  can(action: PermissionAction, resource: string): boolean

  /**
   * 检查路由权限（菜单级）
   * 示例: canRoute('/erp/purchase') → true/false
   */
  canRoute(path: string): boolean

  /**
   * 检查字段可见权限（字段级，Phase 1.5+ 后端实现）
   * 示例: canField('employee', 'salary') → true/false
   */
  canField(resource: string, fieldName: string): boolean
}

/**
 * useACL Hook — 在组件内获取权限上下文
 */
function useACL(): ACLContextValue
```

### 5.2 ACLGuard 组件

```typescript
// packages/admin-ui/src/components/acl-guard.tsx

interface ACLGuardProps {
  /** 所需权限动作 */
  action: PermissionAction
  /** 资源名 */
  resource: string
  /** 无权限时的降级内容（默认 null = 不渲染） */
  fallback?: React.ReactNode
  /** 子组件（有权限时渲染） */
  children: React.ReactNode
}

/**
 * ACLGuard — 声明式权限控制组件
 * 
 * 使用:
 *   <ACLGuard action="create" resource="user">
 *     <Button>新建用户</Button>
 *   </ACLGuard>
 * 
 * ACLProvider 未加载完成时 → render null（避免闪烁）
 * 无权限 → render fallback (默认 null)
 */
function ACLGuard({ action, resource, fallback, children }: ACLGuardProps): React.ReactNode
```

### 5.3 Provider Stack 顺序（D18）

```typescript
// 正确嵌套顺序
<I18nextProvider>
  <QueryClientProvider>
    <TenantProvider>              {/* 提供 tenantId */}
      <UserProvider>              {/* 提供 userId */}
        <ACLProvider>             {/* 需要 tenantId 获取权限 → 必须在 TenantProvider 内 */}
          <ProLayout>
            <Outlet />            {/* 插件路由 */}
          </ProLayout>
        </ACLProvider>
      </UserProvider>
    </TenantProvider>
  </QueryClientProvider>
</I18nextProvider>
```

---

## 6. 测试边界

| 测试层级 | 范围 | 策略 | 文件位置 |
|---------|------|------|---------|
| 单元测试 | AuthService.verifyAccessToken(), PermissionService.can(), jwt 工具函数 | mock DB, mock bcrypt | `src/__tests__/unit/` |
| 集成测试 | 完整 login→refresh→logout 流程, ACL 中间件 | 真实 PG（事务回滚） | `src/__tests__/integration/` |
| E2E 测试 | 登录页 → 用户管理页权限控制 | Playwright + 预播种数据 | `packages/admin-ui/__e2e__/` |

### 最小测试用例集

1. **login**: 正确凭据返回 tokens → 错误密码返回 401 → must_change_password 返回 403
2. **refresh**: 有效 refresh_token 返回新 tokens → 过期 token 返回 401 → 旧 token 被撤销后不可再用
3. **logout**: refresh_token 被撤销 → 后续 refresh 返回 401
4. **token 撤回**: password_change → token_version+1 → 旧 access_token 返回 401
5. **permission check**: admin 全部通过 → member 无 plugin 管理权限 → 未知资源返回 false
6. **ACL middleware**: 无 token 返回 401 → 无效 token 返回 401 → 无权限返回 403 → 有权限放行
7. **ACLProvider**: 加载中 render null → 加载完成显示有权限内容 → 无权限内容不渲染
8. **JWT 密钥校验**: AUDE_JWT_SECRET 缺失/短于32字符 → 启动断言失败，拒绝启动
9. **速率限制**: 5/min 内正常 → 第6次返回 429 → 窗口重置后恢复
10. **system role**: admin/member 角色 is_system=true → 不可删除 → 尝试删除返回 403

---

## 7. 与 Core Bootstrap 的集成

```
Core 启动
  │
  ├─ 1. assertJwtSecret() — 校验 AUDE_JWT_SECRET ≥ 32 字符
  │
  ├─ 2. Drizzle DB 连接
  │
  ├─ 3. MigrationEngine.migrate()
  │
  ├─ 4. plugin-core.install() — 创建 admin 用户 + admin/member 角色 + 默认权限
  │     ├─ admin 角色 → assign ALL permissions
  │     ├─ member 角色 → assign read:user + read:health
  │     └─ admin 用户 → assign admin 角色 + must_change_password=true
  │
  ├─ 5. 加载 rbac 插件
  │     ├─ 注册 AuthController 路由 (POST /auth/login, /auth/refresh, /auth/logout)
  │     ├─ 注册 ACL middleware
  │     └─ 注入 PermissionService 到 PluginHost context
  │
  └─ 6. 加载其余插件
```

---

## 8. 与其他模块的交互

| 消费方 | 接口 | 调用方式 |
|--------|------|---------|
| #1 内核骨架 | `requireAuth`, `acl()` middleware | Fastify route preHandler 装饰 |
| #6 插件框架 | `PluginHost` 无直接依赖 | RBAC 不处理插件生命周期 |
| #10 审计日志 | `AuthService.*` → `audit_log` | 认证事件写入审计日志 |
| #11 i18n | 错误消息翻译 | `t('errors.unauthorized')` 等 |
| #12 管理 UI | `ACLProvider`, `useACL()`, `ACLGuard` | 前端权限控制 |
| 所有 API 端点 | `requireAuth` + `acl()` middleware | 路由级权限保护 |

---

## 9. Open Questions (Phase 1a 期间解决)

- [ ] admin 角色权限是否应固化在代码中（当前方案: plugin-core Bootstrap 创建），还是通过 DB seed 管理
- [ ] 角色缓存 TTL（当前 5min）是否合理，角色变更是否需 WebSocket 推送（Phase 2）
- [ ] Phase 1.5 Record Rules (D10) 的 CLI 命令设计（`aude rule:create` / `aude rule:list`）
- [ ] 多租户下的角色共享策略：系统角色（tenant_id=NULL）是否对所有租户可见（当前方案: 是，但租户可基于系统角色创建租户专属角色）
- [ ] refresh_token 存储扩展：是否需支持设备追踪（device_id 字段，Phase 2）

---

## 10. 变更记录

| 版本 | 日期 | 变更内容 |
|------|------|---------|
| v0.1.0 | 2026-07-13 | 初始版本 |
