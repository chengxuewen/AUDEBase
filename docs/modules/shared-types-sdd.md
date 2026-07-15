# Shared Types SDD — Phase 1a

> **创建日期**: 2026-07-13  
> **目的**: 为 Phase 1a Week 0 共享类型包（packages/shared-types/）提供完整的类型定义与导出约定。  
> **前置阅读**: decisions.md G3, G4, D8, D10, D1.12, D14; api-specification.md; api-conventions.md §11; database-schema.md  
> **责任人**: Person A + Person B（协同）

---

## 概述

`@audebase/shared-types` 是 AUDEBase 全局共享类型包，所有 package 通过 `import { X } from '@audebase/shared-types'` 引用。

**设计原则**:
- **零运行时依赖**: 仅使用 TypeScript 内置类型 + Zod（peerDependency）
- **单包方案**: 4 人团队使用单包，Phase 1b 考虑拆分为 `@audebase/shared` + `@audebase/shared-ui`
- **类型即文档**: public API 全部显式类型注解，禁止 `as any` / `@ts-ignore`
- **ErrorCode 集中管理**: 所有模块错误码在 shared-types 的 ErrorCode 枚举中定义

**CLI 名称**: AUDEBase 命令行工具命名为 `aude`，所有 CLI 命令使用 `aude <command>` 格式（如 `aude dev`、`aude db:migrate`）。

---
## 1. 包结构

```
packages/shared-types/
├── src/
│   ├── index.ts              # 统一导出入口
│   ├── errors.ts             # ErrorCode 枚举 + UserError/SystemError 类
│   ├── api.ts                # ApiResponse 信封 + 分页 Meta
│   ├── auth.ts               # JWT payload + Token 类型
│   ├── user.ts               # User 接口
│   ├── role.ts               # Role + Permission 接口
│   ├── plugin.ts             # PluginDescriptor + PluginStatus
│   ├── audit.ts              # AuditLogEntry 接口
│   ├── i18n.ts               # LocaleMap + Namespace 类型
│   └── filter.ts             # Filter 操作符类型
├── package.json
└── tsconfig.json
```

**依赖**: 零运行时依赖，仅使用 TypeScript 内置类型 + Zod（peerDependency）。

---

## 2. 错误码枚举（ErrorCode）

> 来源: api-conventions.md §11.2。所有错误码集中定义，前端 switch-case 统一处理。

```typescript
// packages/shared-types/src/errors.ts

/**
 * 全局错误码枚举
 * 
 * 命名规则: {模块}_{错误类型}
 * 前端使用此枚举统一 switch-case 处理所有 API 错误
 */
export enum ErrorCode {
  // === Auth (认证/授权) ===
  AUTH_INVALID_CREDENTIALS = 'AUTH_INVALID_CREDENTIALS',
  AUTH_TOKEN_EXPIRED = 'AUTH_TOKEN_EXPIRED',
  AUTH_TOKEN_INVALID = 'AUTH_TOKEN_INVALID',
  AUTH_MUST_CHANGE_PASSWORD = 'AUTH_MUST_CHANGE_PASSWORD',
  AUTH_REQUIRED = 'AUTH_REQUIRED',
  FORBIDDEN = 'FORBIDDEN',

  // === Validation（校验） ===
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  CONFLICT = 'CONFLICT',
  NOT_FOUND = 'NOT_FOUND',

  // === Plugin（插件） ===
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

  // === Rate（速率限制） ===
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',

  // === General（通用错误）===
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  DB_UNAVAILABLE = 'DB_UNAVAILABLE',
  REDIS_UNAVAILABLE = 'REDIS_UNAVAILABLE',
  GENERAL_ASSERTION_FAILED = 'GENERAL_ASSERTION_FAILED',
  GENERAL_TIMEOUT = 'GENERAL_TIMEOUT',
}
```

### 错误类层次

```typescript
/**
 * 用户可恢复错误 — 前端展示 code + message + details
 * 
 * 使用: throw new UserError(ErrorCode.VALIDATION_ERROR, '用户名长度应在 3-100 之间', { field: 'username' })
 */
export class UserError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'UserError'
    // 确保 instanceof 跨模块边界正常工作
    Object.setPrototypeOf(this, UserError.prototype)
  }
}

/**
 * 系统内部错误 — 前端仅看到 INTERNAL_ERROR
 * 原始 cause 写入日志，不返回给前端
 * 
 * 使用: throw new SystemError(ErrorCode.DB_UNAVAILABLE, 'db timeout', originalPgError)
 */
export class SystemError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly cause: unknown
  ) {
    super(message)
    this.name = 'SystemError'
    Object.setPrototypeOf(this, SystemError.prototype)
  }
}

/**
 * 开发断言错误 — 仅开发环境抛出，生产静默降级
 */
export class AssertionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AssertionError'
    Object.setPrototypeOf(this, AssertionError.prototype)
  }
}
```

---

## 3. API 响应信封

```typescript
// packages/shared-types/src/api.ts

import { ErrorCode } from './errors'

/**
 * API 列表响应信封（NocoBase 分页格式）
 */
export interface ApiListResponse<T> {
  data: T[]
  meta: PaginationMeta
}

/**
 * 分页元数据
 */
export interface PaginationMeta {
  /** 符合条件的总记录数 */
  count: number
  /** 当前页码（1-based） */
  page: number
  /** 每页条数 */
  pageSize: number
  /** 总页数 = ceil(count / pageSize) */
  totalPages: number
}

/**
 * API 错误响应信封
 */
export interface ApiErrorResponse {
  error: {
    code: ErrorCode
    message: string
    details?: Record<string, unknown>
  }
}

/**
 * API 分页查询参数
 * 
 * ProTable 兼容：前端 current/pageSize → 后端 page/pageSize
 */
export interface PaginationParams {
  page?: number
  pageSize?: number
}

/**
 * API 排序参数（Directus 前缀格式）
 * 单字段: "created_at"（升序）或 "-created_at"（降序）
 * 多字段: "-created_at,username"
 */
export type SortParam = string

/**
 * API 过滤操作符
 */
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

/**
 * 过滤条件（NocoBase 风格 filter JSON）
 * 示例: {"resource_type":"user","action":{"$in":["create","update"]}}
 */
export type FilterCondition = Record<string, unknown>
```

---

## 4. 认证/授权类型

```typescript
// packages/shared-types/src/auth.ts

/**
 * JWT Access Token Payload
 */
export interface JwtPayload {
  sub: string          // user.id
  tenant_id: string    // 当前租户
  username: string
  roles: string[]      // 角色 slug 列表
  iat: number          // issued at
  exp: number          // expiration
}

/**
 * 登录请求
 */
export interface LoginRequest {
  username: string
  password: string
}

/**
 * 登录响应
 */
export interface LoginResponse {
  access_token: string
  refresh_token: string
  expires_in: number     // 900 秒（15 分钟）
  token_type: 'Bearer'
  user: UserBrief
}

/**
 * 刷新 Token 请求
 */
export interface RefreshRequest {
  refresh_token: string
}

/**
 * 刷新 Token 响应
 */
export interface RefreshResponse {
  access_token: string
  refresh_token: string   // 刷新令牌轮转（旧 token 自动失效）
  expires_in: number
  token_type: 'Bearer'
}

/**
 * 登出请求
 */
export interface LogoutRequest {
  refresh_token: string
}

/**
 * 用户摘要（登录响应中使用，不含敏感字段）
 */
export interface UserBrief {
  id: string
  tenant_id: string
  username: string
  display_name: string
  must_change_password: boolean
  roles: string[]
}
```

---

## 5. 用户/角色/权限类型

```typescript
// packages/shared-types/src/user.ts

export interface User {
  id: string
  tenant_id: string
  username: string
  email: string | null
  display_name: string | null
  avatar_url: string | null
  locale: string            // 默认 'zh-CN'
  is_active: boolean
  must_change_password: boolean
  last_login_at: string | null  // ISO 8601
  roles: RoleBrief[]
  created_at: string
  updated_at: string
}

export interface CreateUserRequest {
  username: string
  email?: string
  password: string
  display_name?: string
  role_ids: string[]         // 初始角色
}

export interface UpdateUserRequest {
  display_name?: string
  email?: string
  is_active?: boolean
  locale?: string
  role_ids?: string[]
  password?: string           // 修改密码
}
```

```typescript
// packages/shared-types/src/role.ts

export interface Role {
  id: string
  tenant_id: string | null    // NULL = 系统角色
  name: string
  slug: string
  description: string | null
  is_system: boolean          // 系统角色不可删除
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
  resource: string          // 如 'plugin', 'user', 'role', 'audit_log'
  display_name: string
  module_id: string | null
}

export type PermissionAction =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'manage'    // 表示全部 CRUD + 管理

export interface PermissionBrief {
  action: PermissionAction
  resource: string
}
```

---

## 6. 插件类型

```typescript
// packages/shared-types/src/plugin.ts

/**
 * 插件状态枚举
 */
export type PluginStatus =
  | 'discovered'
  | 'installed'
  | 'loaded'
  | 'enabled'
  | 'disabled'
  | 'migration_failed'

/**
 * 插件运行时模式
 */
export type PluginRuntimeMode = 'inline' | 'process' | 'container'

/**
 * 插件信任分区
 */
export type PluginPartition = 'SYSTEM' | string  // Phase 1b+ 支持自定义分区名

/**
 * 插件描述符（modules 表映射）
 */
export interface PluginDescriptor {
  id: string
  name: string              // 包名，如 @audebase/plugin-core
  version: string           // SemVer
  display_name: string
  state: PluginStatus
  category: string | null
  description: string | null
  author: string | null
  license: string | null
  dependencies: string[]    // 依赖插件名列表
  runtime_mode: PluginRuntimeMode
  runtime_partition: PluginPartition
  auto_install: boolean
  installed_at: string | null
}
```

---

## 7. 审计日志类型

```typescript
// packages/shared-types/src/audit.ts

/**
 * 审计日志动作分类
 */
export type AuditActionCategory =
  | 'auth'        // login, logout, refresh_token, password_change
  | 'crud'        // create, read, update, delete
  | 'lifecycle'   // install, uninstall, enable, disable, upgrade
  | 'rbac'        // assign_role, revoke_role, create_role, delete_role
  | 'system'      // startup, shutdown, health_check

export interface AuditLogEntry {
  id: string
  tenant_id: string
  actor: { id: string; username: string } | null  // NULL = 系统操作
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

---

## 8. 国际化类型

```typescript
// packages/shared-types/src/i18n.ts

/**
 * 翻译字典 — 扁平 key-value 映射
 * 
 * key 风格: dot-separated 路径（如 'errors.unauthorized'、'users.create.title'）
 * ICU 消息格式: "已删除 {count} 条记录"
 */
export type LocaleMap = Record<string, string>

/**
 * 语言代码 — ISO 639-1 + 可选 ISO 3166-1 地区码
 */
export type LocaleCode = string  // 如 'zh-CN', 'en-US'

/**
 * 翻译函数签名
 */
export type TranslateFunction = (
  key: string,
  params?: Record<string, string>
) => string
```

---

## 9. 过滤/排序工具类型

```typescript
// packages/shared-types/src/filter.ts

import { SortParam, FilterCondition } from './api'

/**
 * 列表查询通用参数
 */
export interface ListQueryParams {
  page?: number
  pageSize?: number
  sort?: SortParam
  filter?: FilterCondition
}
```

---

## 10. package.json 定义

```json
{
  "name": "@audebase/shared-types",
  "version": "0.1.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "peerDependencies": {
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "zod": "^3.24.0"
  }
}
```

**注意**: Phase 1a 使用 TypeScript 源码直接引用（main/types 指向 src/index.ts），无需构建步骤。Phase 1b 考虑 `tsup` 构建输出到 dist/。

---

## 11. 错误处理约定

- `UserError` / `SystemError` / `AssertionError` 类定义在 shared-types 中，所有包通过 `import { UserError } from '@audebase/shared-types'` 引用
- 插件只能 throw `UserError` 或 `SystemError`；Core 全局错误中间件拒绝其他 Error 类型直接透传
- `UserError.message` 可返回给前端（对用户可读）；`SystemError.message` 永不返回给前端
- `AssertionError` 仅开发环境抛出，生产环境应在编译时通过 TypeScript `const assertions` 捕获

---

## 12. 测试边界

| 测试层级 | 范围 | 策略 | 文件位置 |
|---------|------|------|---------|
| 类型测试 | 所有接口的类型兼容性 | `expectTypeOf<T>().toMatchTypeOf<U>()` | `src/__tests__/types.test.ts` |
| 错误类测试 | UserError/SystemError 实例化与跨模块 instanceof | 单元测试 | `src/__tests__/errors.test.ts` |
| Zod 兼容测试 | shared-types 中 enum 值与 Zod schema 一致性 | 运行时校验 | CI 中 |

### 最小测试用例集

1. `UserError` 实例化：`new UserError(ErrorCode.VALIDATION_ERROR, 'msg', { field: 'err' })` → 所有属性正确
2. `SystemError` 跨模块 instanceof：从不同包 throw SystemError 仍能被 `catch(e)` 识别
3. `ErrorCode` 枚举值唯一性：所有枚举值不重复
4. `ApiListResponse<User>` 类型兼容性：data 为 User[]，meta 含 count/page/pageSize/totalPages
5. `JwtPayload` 类型包含所有必需字段

---

## 13. 与其他模块的交互

| 消费方 | 使用类型 | 说明 |
|--------|---------|------|
| #1 内核骨架 | `ErrorCode`, `UserError`, `SystemError`, `ApiListResponse`, `PaginationMeta` | 全局错误中间件、API 响应信封 |
| #8 RBAC | `User`, `Role`, `Permission`, `JwtPayload`, `LoginResponse`, `RefreshResponse` | 认证/授权全流程 |
| #10 审计日志 | `AuditLogEntry`, `ErrorCode` | 审计中间件记录与查询 |
| #11 i18n | `LocaleMap`, `LocaleCode`, `TranslateFunction` | 翻译函数签名 |
| #12 管理 UI | 全部接口类型 | 前端类型安全 |
| #6 插件框架 | `PluginDescriptor`, `PluginStatus` | PluginManager 公共 API |

---

## 15. Mock Constraints

Phase 1a 测试中使用 shared-types 的 mock 必须满足以下约束：

### 15.1 UserError / SystemError

- mock 的 `UserError` 实例必须通过 `instanceof UserError` 检查
- 跨模块边界的 `Object.setPrototypeOf(this, UserError.prototype)` 是强制要求
- mock 的 `SystemError.cause` 可用于测试错误链

### 15.2 ErrorCode 枚举

- mock 错误必须使用 ErrorCode 枚举值（禁止直接使用字符串 `'INTERNAL_ERROR'`）
- 新增错误码必须先在 shared-types/src/errors.ts 中添加，再在模块中使用

### 15.3 ApiResponse 信封

- 所有 mock API 响应必须遵循 `ApiListResponse<T>` 或 `ApiErrorResponse` 格式
- mock 分页数据必须包含完整 `PaginationMeta`（count, page, pageSize, totalPages）

### 15.4 PluginDescriptor

- mock 的 `PluginDescriptor` 所有必填字段必须为非空值
- `state` 字段仅限使用 `PluginStatus` 类型中定义的值
- `runtime_mode` 在 Phase 1a 必须为 `'inline'`

### 15.5 JwtPayload

- mock 的 `JwtPayload` 必须包含所有字段（sub, tenant_id, username, roles, iat, exp）
- `iat` < `exp`（签发时间早于过期时间）

### 15.6 FilterCondition

- mock 的 FilterCondition 使用 Directus/NocoBase 前缀格式：`{ field: { $op: value } }`
- 运算符仅限 §3 中定义的 FilterOperator 类型

---

## 16. Open Questions (Phase 1a 期间解决)

- [ ] shared-types 是否应拆分为多个包（如 `@audebase/shared` + `@audebase/shared-ui`）。当前单包方案简单，足够 4 人团队使用
- [ ] `FilterCondition` 的 Zod schema 是否应在 shared-types 中定义（当前仅类型定义，运行时校验在 Core 中）
- [ ] Phase 1b 是否需要将 shared-types 构建产物发布到内部 npm registry（当前仅 workspace 引用）
- [ ] `ErrorCode` 的持久化：是否在 DB 中建表存储错误码（当前仅枚举，不持久化）

---

## 17. 变更记录

| 版本 | 日期 | 变更内容 |
|------|------|---------|
| v0.1.0 | 2026-07-13 | 初始版本 |
