# AUDEBase 认证模块 SDD (Software Design Document)

> **创建日期**: 2026-07-16
> **状态**: 📋 SDD 完成
> **对应缺口**: GO-022 (HIGH) - JWT 认证模块无 SDD/TDD
> **决策依据**: D8.1 (JWT 密钥管理)、D1.6 (Bootstrap admin 首次强制改密)
> **安全参考**: NocoBase CVE-2025-13877 (CVSS 9.8, 默认 JWT 密钥)
> **包路径**: `packages/auth/` (`@audebase/auth`)
> **当前实现**: 认证逻辑暂存于 `packages/rbac/src/`，待提取为独立 `@audebase/auth` 包

---

## 1. 概要

### 1.1 模块定位

`@audebase/auth` 是 AUDEBase 平台的认证模块，负责用户身份验证、JWT 令牌签发与验证、刷新令牌轮转、密码管理。当前认证逻辑（`AuthService`、`token.ts`）实现在 `@audebase/rbac` 包内，本 SDD 定义将其提取为独立 `@audebase/auth` 包的接口契约。

### 1.2 职责边界

| 职责 | 说明 |
|------|------|
| 用户登录验证 | 凭据校验 → 签发 Access Token + Refresh Token |
| JWT 签发与验证 | HS256 签名，Access Token 15 分钟过期 |
| Refresh Token 轮转 | 每次刷新生成新令牌对，旧令牌撤销 |
| Token 撤回 | `token_version` 递增使所有旧令牌失效 |
| 密码管理 | bcrypt 哈希存储、密码修改、首次强制改密 |
| JWT 密钥校验 | 启动时断言 `AUDE_JWT_SECRET` 存在且 ≥32 字符 |

### 1.3 不包含

- 授权/权限检查（RBAC） → `@audebase/rbac`
- 用户 CRUD 管理 → Core API
- 会话存储（无服务端会话，纯 JWT 无状态）
- OAuth/SSO → Phase 2+

### 1.4 设计目标

1. **无状态**: Access Token 自包含用户身份，无需查 DB 验证
2. **短时令牌**: Access Token 15 分钟，降低泄露风险
3. **可撤回**: `token_version` 机制允许强制失效所有令牌
4. **轮转安全**: Refresh Token 单次使用，旧令牌立即撤销
5. **防默认密钥**: 启动断言密钥存在且足够长（CVE-2025-13877 防范）

---

## 2. 接口定义

### 2.1 Token 工具函数

> 当前实现在 `packages/rbac/src/token.ts`，提取后位于 `packages/auth/src/token.ts`。

#### `signToken(payload, secret, expiresIn): string`

签发 JWT 令牌。

```typescript
function signToken(
  payload: Record<string, unknown>,
  secret: string,
  expiresIn: string, // 格式: `{N}{s|m|h|d}`，如 '15m'、'7d'
): string
```

- **算法**: HS256 (HMAC-SHA-256)
- **令牌结构**: `base64url(header).base64url(payload).base64url(signature)`
- **Header**: `{ "alg": "HS256", "typ": "JWT" }`
- **Payload 自动添加**: `iat` (签发时间戳)、`exp` (过期时间戳)
- **签名计算**: `SHA-256(header.payload + secret)` → base64url
- **校验**: 调用前校验 `secret.length >= 32`，否则抛 `Error`
- **抛出**: `Error` — 密钥长度不足或 `expiresIn` 格式无效

#### `verifyToken(token, secret): JwtPayload & { iat: number; exp: number }`

验证 JWT 令牌并返回解码后的 Payload。

```typescript
function verifyToken(
  token: string,
  secret: string,
): JwtPayload & { iat: number; exp: number }
```

- **验证步骤**: 格式检查（3 段）→ 签名比对 → 过期检查
- **抛出**: `Error('Invalid token format')` / `Error('Invalid token signature')` / `Error('Token expired')`

#### `generateAccessToken(user, jwtSecret): string`

为用户生成 Access Token。

```typescript
function generateAccessToken(
  user: {
    id: string
    username: string
    token_version: number
    tenant_id: string | null
    roles?: string[]
  },
  jwtSecret: string,
): string
```

- **过期**: 15 分钟 (`'15m'`)
- **Payload**:

```json
{
  "sub": "user.id",
  "tenant_id": "user.tenant_id ?? ''",
  "username": "user.username",
  "roles": "user.roles ?? []",
  "token_version": "user.token_version",
  "iat": 1700000000,
  "exp": 1700000900
}
```

#### `generateRefreshToken(): string`

生成不透明的 Refresh Token。

```typescript
function generateRefreshToken(): string
```

- **实现**: `crypto.randomBytes(48).toString('hex')` — 96 字符十六进制字符串
- **不含用户信息**: Refresh Token 是不透明令牌，验证时需查 DB

#### `hashToken(token): string`

对令牌进行 SHA-256 哈希，用于 DB 存储。

```typescript
function hashToken(token: string): string
```

- **实现**: `crypto.createHash('sha256').update(token).digest('hex')` — 64 字符十六进制字符串
- **用途**: Refresh Token 存储（不存明文）、密码哈希（当前 mock 阶段）

#### `assertJwtSecret(): void`

启动时断言 `AUDE_JWT_SECRET` 环境变量存在且满足最低长度要求。

```typescript
function assertJwtSecret(): void
```

- **校验**: `process.env.AUDE_JWT_SECRET` 存在且 `length >= 32`
- **抛出**: `Error('AUDE_JWT_SECRET 未设置')` / `Error('AUDE_JWT_SECRET 长度不足: 需要至少 32 字符')`
- **调用时机**: Fastify 启动阶段（bootstrap），在任何 JWT 操作之前

### 2.2 AuthService 类

> 当前实现在 `packages/rbac/src/auth-service.ts`，提取后位于 `packages/auth/src/auth-service.ts`。

```typescript
class AuthService {
  constructor(db: DatabaseProvider, jwtSecret: string)

  /** 设置审计日志回调（用于 DI / 测试） */
  setAuditLogger(fn: (entry: Record<string, unknown>) => void): void

  /** 用户登录 */
  async login(input: LoginInput): Promise<TokenResult>

  /** 刷新 Access Token */
  async refresh(input: { refresh_token: string }): Promise<TokenResult>

  /** 登出（撤销 Refresh Token） */
  async logout(input: { refresh_token: string }): Promise<void>

  /** 验证 Access Token */
  async verifyAccessToken(token: string): Promise<JwtPayload & { iat: number; exp: number }>

  /** 修改密码（递增 token_version 使旧令牌失效） */
  async changePassword(userId: string, oldPassword: string | null, newPassword: string): Promise<void>
}
```

#### `login(input: LoginInput): Promise<TokenResult>`

```typescript
interface LoginInput {
  username: string
  password: string
  ip?: string
  userAgent?: string
}

interface TokenResult {
  access_token: string
  refresh_token: string
  expires_in: number   // 900 (秒, 15 分钟)
  token_type: 'Bearer'
}
```

**流程**:
1. 查询用户 (`db.query.users.findFirst`) — 按 username
2. 用户不存在或 `is_active === false` → `AUTH_INVALID_CREDENTIALS`
3. 密码验证 (`bcrypt.compare`) → 失败则 `AUTH_INVALID_CREDENTIALS`
4. `must_change_password === true` → `AUTH_MUST_CHANGE_PASSWORD`
5. 签发 Access Token (`generateAccessToken`)
6. 生成 Refresh Token (`generateRefreshToken`)，SHA-256 哈希后存入 `refresh_tokens` 表
7. 更新 `users.last_login_at`
8. 记录审计日志
9. 返回 `TokenResult`

**错误码**:
- `AUTH_INVALID_CREDENTIALS` — 用户不存在/未激活/密码错误
- `AUTH_MUST_CHANGE_PASSWORD` — 需首次修改密码 (D1.6)

#### `refresh(input: { refresh_token: string }): Promise<TokenResult>`

**流程**:
1. 计算 `hashToken(input.refresh_token)`
2. 查询 `refresh_tokens` 表 — 按 `token_hash`
3. 记录不存在 → `AUTH_TOKEN_INVALID`
4. `revoked_at !== null` → `AUTH_TOKEN_INVALID` (令牌已撤销)
5. `expires_at < now` → `AUTH_TOKEN_EXPIRED` (令牌已过期)
6. 查询关联用户
7. 用户不存在 → `AUTH_TOKEN_INVALID`
8. `token_version` 不匹配 → `AUTH_TOKEN_INVALID` (令牌版本已变更)
9. **撤销旧 Refresh Token** (`revoked_at = now`)
10. **签发新令牌对** (Access Token + Refresh Token，轮转)
11. 新 Refresh Token 哈希存入 DB
12. 返回新 `TokenResult`

**错误码**:
- `AUTH_TOKEN_INVALID` — 令牌不存在/已撤销/用户不存在/版本不匹配
- `AUTH_TOKEN_EXPIRED` — 令牌已过期

#### `logout(input: { refresh_token: string }): Promise<void>`

**流程**:
1. 计算 `hashToken(input.refresh_token)`
2. 查询 `refresh_tokens` 表
3. 记录不存在 → `AUTH_TOKEN_EXPIRED`
4. 设置 `revoked_at = now`
5. 返回 `void`

> **注意**: Logout 仅撤销 Refresh Token。Access Token 在 15 分钟过期前仍有效（无状态 JWT 的固有限制）。

#### `verifyAccessToken(token: string): Promise<JwtPayload & { iat: number; exp: number }>`

**流程**:
1. 调用 `verifyToken(token, this.jwtSecret)`
2. 验证成功 → 返回解码的 Payload
3. 验证失败:
   - 错误消息含 `expired` → `AUTH_TOKEN_EXPIRED`
   - 其他错误 → `AUTH_TOKEN_INVALID`

**错误码**:
- `AUTH_TOKEN_EXPIRED` — 令牌已过期
- `AUTH_TOKEN_INVALID` — 令牌格式无效/签名错误

#### `changePassword(userId, oldPassword, newPassword): Promise<void>`

```typescript
async changePassword(
  userId: string,
  oldPassword: string | null,  // null = 管理员重置，跳过旧密码验证
  newPassword: string,
): Promise<void>
```

**流程**:
1. 查询用户
2. 用户不存在 → `AUTH_INVALID_CREDENTIALS`
3. `oldPassword !== null` 时验证旧密码 → 失败则 `AUTH_INVALID_CREDENTIALS`
4. `bcrypt.hash(newPassword)` 生成新哈希
5. 更新 `users`: `password_hash`、`token_version = token_version + 1`、`must_change_password = false`
6. 记录审计日志
7. 返回 `void`

> **token_version 递增效果**: 所有已签发的 Access Token（含 `token_version` 字段）在下次验证时与 DB 中的 `token_version` 不匹配，被拒绝。Refresh Token 在刷新时检测版本不匹配并拒绝。

### 2.3 数据库接口

> 当前定义在 `packages/rbac/src/types.ts`，提取后由 `@audebase/core` 提供。

```typescript
interface DatabaseProvider {
  query: {
    users: { findFirst: (args?: unknown) => Promise<unknown> }
    refresh_tokens: { findFirst: (args?: unknown) => Promise<unknown> }
  }
  insert: (args: unknown) => Promise<unknown>
  update: (args: unknown) => Promise<unknown>
  delete: (args: unknown) => Promise<unknown>
}

interface UserRecord {
  id: string
  username: string
  password_hash: string
  token_version: number
  is_active: boolean
  must_change_password: boolean
  tenant_id: string | null
}

interface RefreshTokenRecord {
  id: string
  user_id: string
  token_hash: string
  revoked_at: Date | null
  expires_at: Date
}
```

### 2.4 共享类型

> 定义在 `@audebase/shared-types`，见 `packages/shared-types/src/auth.ts`。

| 类型 | 说明 |
|------|------|
| `JwtPayload` | `{ sub, tenant_id, username, roles, iat, exp }` |
| `LoginRequest` | `{ username, password }` |
| `LoginResponse` | `{ access_token, refresh_token, expires_in, token_type, user: UserBrief }` |
| `RefreshRequest` | `{ refresh_token }` |
| `RefreshResponse` | `{ access_token, refresh_token, expires_in, token_type }` |
| `LogoutRequest` | `{ refresh_token }` |
| `UserBrief` | `{ id, tenant_id, username, display_name, must_change_password, roles }` |

### 2.5 Zod 验证 Schema

> 定义在 `@audebase/shared-types`，见 `packages/shared-types/src/schemas.ts`。

| Schema | 约束 |
|--------|------|
| `loginSchema` | `username: 3-100 字符`，`password: 8-128 字符` |
| `tokenResponseSchema` | `access_token: non-empty`，`refresh_token: non-empty`，`expires_in: positive int`，`token_type: 'Bearer'` |
| `createUserSchema` | `password: min 8，必须包含大写+小写+数字+特殊字符` |

---

## 3. 生命周期

### 3.1 模块启动

```
Core 启动
  → assertJwtSecret()  // 校验 AUDE_JWT_SECRET
  → new AuthService(db, jwtSecret)  // 注入 DatabaseProvider + 密钥
  → 注册 Fastify 路由: POST /api/auth/login, /api/auth/refresh, /api/auth/logout
  → 注册 requireAuth 中间件（受保护路由）
```

### 3.2 请求生命周期

```
客户端请求
  → Authorization: Bearer <access_token>
  → requireAuth 中间件
    → authService.verifyAccessToken(token)
    → 成功: 注入 req.user = { sub, tenant_id, username, roles }
    → 失败: 401 AUTH_TOKEN_INVALID / AUTH_TOKEN_EXPIRED
  → 路由处理器
```

### 3.3 令牌生命周期

```
登录 → 签发 Access Token (15m) + Refresh Token (7d)
  ↓ Access Token 过期
客户端 → POST /api/auth/refresh { refresh_token }
  → 验证 Refresh Token
  → 撤销旧 Refresh Token
  → 签发新 Access Token + 新 Refresh Token (轮转)
  ↓
客户端 → POST /api/auth/logout { refresh_token }
  → 撤销 Refresh Token
  → Access Token 自然过期 (15m)
```

### 3.4 密码修改 / Token 撤回

```
changePassword(userId, oldPassword, newPassword)
  → bcrypt.hash(newPassword)
  → UPDATE users SET password_hash=..., token_version=token_version+1
  → 所有旧 Access Token: 下次验证时 token_version 不匹配 → 拒绝
  → 所有旧 Refresh Token: 下次刷新时检测版本不匹配 → 拒绝
```

---

## 4. 依赖关系

### 4.1 包依赖

| 依赖 | 类型 | 说明 |
|------|------|------|
| `@audebase/shared-types` | workspace | JwtPayload、LoginRequest、ErrorCode、UserError、Zod schemas |
| `@audebase/core` | workspace | DatabaseProvider 接口（Phase 1a 暂用 rbac/types.ts 本地定义） |
| `bcryptjs` | npm | 密码哈希（cost factor 12） |
| `node:crypto` | stdlib | SHA-256 哈希、randomBytes 生成 Refresh Token |

> **注意**: 当前实现使用 `node:crypto` 手动实现 JWT 签名/验证。生产环境建议迁移至 `jose` 库（标准 JWT 实现，支持更完善的算法集和 JWKS）。迁移时 `signToken`/`verifyToken` 签名不变，仅替换内部实现。

### 4.2 数据库表依赖

| 表 | 用途 |
|----|------|
| `users` | 用户凭据验证、`token_version`、`password_hash`、`must_change_password`、`last_login_at` |
| `refresh_tokens` | Refresh Token 存储（`token_hash`、`expires_at`、`revoked_at`、`user_agent`、`ip`） |

### 4.3 模块依赖

```
@audebase/shared-types  ← 无依赖（Week 0 基础）
@audebase/auth          ← 依赖 shared-types + DatabaseProvider
@audebase/rbac          ← 依赖 auth (requireAuth 中间件需要 AuthService.verifyAccessToken)
@audebase/core          ← 依赖 auth (路由注册、启动断言)
```

---

## 5. 错误码与错误处理

### 5.1 错误码枚举

> 定义在 `@audebase/shared-types` 的 `ErrorCode` 枚举中。

| 错误码 | HTTP 状态码 | 场景 | 用户消息 |
|--------|------------|------|---------|
| `AUTH_INVALID_CREDENTIALS` | 401 | 用户名/密码错误、用户未激活 | "用户名或密码错误" |
| `AUTH_TOKEN_EXPIRED` | 401 | Access Token 过期、Refresh Token 过期 | "令牌已过期" |
| `AUTH_TOKEN_INVALID` | 401 | 令牌签名无效、格式错误、已撤销、版本不匹配 | "令牌无效" |
| `AUTH_MUST_CHANGE_PASSWORD` | 401 | 首次登录需修改密码 (D1.6) | "必须修改密码" |
| `AUTH_REQUIRED` | 401 | 请求未携带 Authorization 头 | "需要认证" |
| `AUTH_TOKEN_VERSION_MISMATCH` | 401 | `token_version` 不匹配（令牌已被撤回）| "令牌版本不匹配" |

> **注**: `AUTH_TOKEN_VERSION_MISMATCH` 为新增错误码，当前实现将版本不匹配映射为 `AUTH_TOKEN_INVALID`。生产实现应使用专用错误码以便前端区分"令牌被撤回需重新登录"与"令牌被篡改"。

### 5.2 错误处理策略

| 场景 | 策略 |
|------|------|
| 登录失败 | 不区分"用户不存在"与"密码错误"，统一返回 `AUTH_INVALID_CREDENTIALS`（防枚举攻击） |
| 令牌验证失败 | 中间件层捕获 `UserError`，返回 401 + 错误码 |
| DB 查询失败 | 向上传播 `SystemError(DB_UNAVAILABLE)`，Core 全局错误处理器返回 500 |
| 密钥缺失 | `assertJwtSecret()` 在启动阶段抛 `Error`，阻止服务启动 |

### 5.3 审计日志

认证操作通过可注入的 `auditLogger` 回调记录审计事件:

| 事件 | 记录字段 |
|------|---------|
| `login` | `action`, `actor_id`, `ip`, `user_agent` |
| `auth:password_change` | `action`, `actor_id` |

---

## 6. 安全考虑

### 6.1 JWT 密钥管理 (D8.1)

| 要求 | 实现 |
|------|------|
| 密钥来源 | 环境变量 `AUDE_JWT_SECRET` |
| 最小长度 | 32 字符 |
| 默认值 | **拒绝** — 不提供任何默认密钥 |
| 启动校验 | `assertJwtSecret()` 在 Fastify bootstrap 阶段调用 |
| 密钥泄露 | 更换密钥 + 所有用户 `token_version` 递增（强制全量重登录） |

> **CVE-2025-13877 防范**: NocoBase 因使用默认 JWT 密钥导致 CVSS 9.8 任意用户冒充漏洞。AUDEBase 通过启动断言 + 无默认值策略彻底杜绝此风险。

### 6.2 密码安全 (GO-027)

#### 密码哈希

| 参数 | 值 | 说明 |
|------|-----|------|
| 算法 | bcrypt | 工业标准，抗 GPU/ASIC 破解 |
| Cost Factor | 12 | 约 250ms/次验证，平衡安全与性能 |
| 实现 | `bcryptjs` | 纯 JS 实现，无原生编译依赖 |

#### 密码策略

| 规则 | 值 | 来源 |
|------|-----|------|
| 最小长度 | 8 字符 | `loginSchema` / `createUserSchema` |
| 最大长度 | 128 字符 | `loginSchema` |
| 复杂度 | 必须包含大写+小写+数字+特殊字符 | `createUserSchema` regex |
| 存储格式 | `$2b$12$...` (bcrypt hash) | `users.password_hash` |
| 首次登录 | 强制修改密码 | D1.6 Bootstrap, `must_change_password = true` |

#### 锁定策略 (Phase 1a 基础版)

| 参数 | 值 | 说明 |
|------|-----|------|
| 登录速率限制 | 5 次/分钟 (per-IP) | API 层 `@fastify/rate-limit` |
| 连续失败锁定 | Phase 1b | 记录失败次数 → 超阈值临时锁定账户 |

### 6.3 Refresh Token 安全

| 措施 | 说明 |
|------|------|
| 不透明令牌 | 96 字符随机 hex，不含用户信息 |
| SHA-256 哈希存储 | DB 不存明文，仅存 `token_hash` |
| 单次使用轮转 | 每次刷新生成新令牌对，旧令牌立即撤销 |
| 7 天过期 | `expires_at` 字段，过期后不可刷新 |
| 撤销机制 | `revoked_at` 时间戳，Logout / 刷新时设置 |
| UNIQUE 约束 | `refresh_tokens.token_hash` 唯一索引，防重复 |

### 6.4 token_version 撤回机制

```
用户修改密码 / 管理员强制下线
  → UPDATE users SET token_version = token_version + 1
  → 所有已签发 Access Token 中的 token_version < DB 值
  → verifyAccessToken: 校验 payload.token_version === users.token_version
  → refresh: 校验 stored token 对应的 user.token_version 一致
  → 不匹配 → AUTH_TOKEN_VERSION_MISMATCH
```

> **当前实现限制**: Access Token 验证（`verifyAccessToken`）目前不检查 `token_version`（纯 JWT 验证无 DB 查询）。生产实现应在 `requireAuth` 中间件或 `verifyAccessToken` 中增加 `token_version` 比对（需查 DB 或缓存）。

### 6.5 防枚举攻击

- 登录失败统一返回 `AUTH_INVALID_CREDENTIALS`，不区分用户不存在与密码错误
- 错误消息不泄露用户是否存在
- 登录端点速率限制 5 次/分钟 (per-IP)

### 6.6 传输安全

- Access Token 通过 `Authorization: Bearer <token>` 头传输
- Refresh Token 通过请求体传输（不放在 URL 参数中）
- 生产环境强制 HTTPS（反向代理层 / HSTS 头）

---

## 7. Mock 约束

### 7.1 DatabaseProvider Mock

测试中 `DatabaseProvider` 使用 mock 实现，满足以下约束:

| 约束 | 说明 |
|------|------|
| `query.users.findFirst()` | 返回 mock `UserRecord` 或 `undefined` |
| `query.refresh_tokens.findFirst()` | 返回 mock `RefreshTokenRecord` 或 `undefined` |
| `insert()` | 记录调用参数，返回 `undefined` |
| `update()` | 记录调用参数，返回 `undefined` |

### 7.2 密码验证 Mock

> 当前实现（`packages/rbac/src/auth-service.ts` 末尾）使用 mock 密码验证:
> - `$2b$` 前缀的哈希视为 bcrypt mock，接受密码 `'Admin@123'`
> - 其他情况直接比较明文
>
> **生产实现必须替换为** `bcrypt.compare(plain, hash)` / `bcrypt.hash(plain, 12)`。

### 7.3 JWT 签名 Mock

当前实现使用 `node:crypto` 手动实现 HS256 签名。测试时:
- 使用固定密钥（≥32 字符）如 `'test-secret-key-for-unit-tests-32+'`
- `signToken` / `verifyToken` 对称使用，无需 mock 底层签名

### 7.4 审计日志 Mock

- `setAuditLogger(fn)` 注入测试回调
- 测试中捕获调用参数，断言审计事件字段

### 7.5 测试密钥约束

| 约束 | 值 |
|------|-----|
| 测试密钥 | `'test-secret-key-for-unit-tests-32+'` (≥32 字符) |
| 禁止使用 | `process.env.AUDE_JWT_SECRET` 真实值 |
| `assertJwtSecret()` 测试 | 设置/清除 `process.env.AUDE_JWT_SECRET` 验证抛出行为 |

---

## 8. 变更记录

| 日期 | 版本 | 变更 | 作者 |
|------|------|------|------|
| 2026-07-16 | 1.0 | 初始 SDD 创建。从 `@audebase/rbac` 提取认证逻辑为独立 `@audebase/auth` 包的接口契约。覆盖 GO-022 缺口。 | AI Agent |

---

## 附录 A: API 端点摘要

> 完整请求/响应格式见 `docs/modules/api-specification.md`。

| 方法 | 路径 | 认证 | 速率限制 | 说明 |
|------|------|:---:|---------|------|
| POST | `/api/auth/login` | 否 | 5/min (per-IP) | 用户登录 |
| POST | `/api/auth/refresh` | 否 | — | 刷新 Access Token |
| POST | `/api/auth/logout` | 是 | — | 登出（撤销 Refresh Token） |

## 附录 B: 数据库表摘要

> 完整 DDL 见 `docs/modules/database-schema.md`。

### users 表（认证相关字段）

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| `id` | UUID | PK | 用户 ID |
| `username` | VARCHAR(100) | NOT NULL, UNIQUE(tenant_id) | 用户名 |
| `password_hash` | VARCHAR(255) | NOT NULL | bcrypt 哈希 (`$2b$12$...`) |
| `token_version` | INTEGER | NOT NULL, DEFAULT 1 | JWT 撤回版本号 |
| `is_active` | BOOLEAN | NOT NULL, DEFAULT true | 账户激活状态 |
| `must_change_password` | BOOLEAN | NOT NULL, DEFAULT false | 首次强制改密 (D1.6) |
| `tenant_id` | UUID | NOT NULL | 租户隔离 |
| `last_login_at` | TIMESTAMPTZ | NULLABLE | 最后登录时间 |

### refresh_tokens 表

| 列 | 类型 | 约束 | 说明 |
|----|------|------|------|
| `id` | UUID | PK | 令牌记录 ID |
| `user_id` | UUID | NOT NULL, FK→users | 关联用户 |
| `tenant_id` | UUID | NOT NULL | 租户隔离 |
| `token_hash` | VARCHAR(255) | NOT NULL, UNIQUE | SHA-256(令牌) |
| `expires_at` | TIMESTAMPTZ | NOT NULL | 过期时间 (7 天) |
| `revoked_at` | TIMESTAMPTZ | NULLABLE | 撤销时间 (NULL=有效) |
| `user_agent` | VARCHAR(500) | NULLABLE | 客户端 UA |
| `ip` | VARCHAR(50) | NULLABLE | 客户端 IP |

## 附录 C: 从 @audebase/rbac 提取的文件清单

提取 `@audebase/auth` 包时，以下文件从 `packages/rbac/src/` 迁移:

| 源文件 | 目标文件 | 说明 |
|--------|---------|------|
| `token.ts` | `packages/auth/src/token.ts` | JWT 工具函数（全部） |
| `auth-service.ts` | `packages/auth/src/auth-service.ts` | AuthService 类 |
| `types.ts` (UserRecord, RefreshTokenRecord, DatabaseProvider) | `packages/auth/src/types.ts` | 认证相关类型（RBAC 类型保留在 rbac） |
| `middleware.ts` (requireAuth) | `packages/auth/src/middleware.ts` | 认证中间件（ACL 中间件保留在 rbac） |
| `__tests__/token.test.ts` | `packages/auth/src/__tests__/token.test.ts` | 令牌测试 |
| `__tests__/auth.service.test.ts` | `packages/auth/src/__tests__/auth.service.test.ts` | AuthService 测试 |

提取后 `@audebase/rbac` 保留: `RBACService`、`record-rules.ts`、`aclMiddleware`、RBAC 相关类型。
