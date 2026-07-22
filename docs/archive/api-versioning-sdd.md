# SDD: API Versioning Module

**Module**: `@audebase/api-versioning`
**Package Path**: `packages/api-versioning/`
**Phase**: Phase 1b
**Status**: SDD Complete
**Decision References**: D1.8, api-specification.md, api-conventions.md, architecture.md

---

## 1. 概要

### 模块定位

API Versioning 模块为 AUDEBase 平台提供 URL 路径版本路由能力。作为 Core 路由注册层的拦截器，在插件注册 API 路由时自动注入主版本号前缀，支持同一资源的多个主版本共存迁移。

### 职责边界

| 范围 | 说明 |
|------|------|
| **负责** | 版本号提取、版本路由注册、版本号路由解析、Deprecated 头注入、版本不存在错误响应 |
| **不负责** | 请求参数版本协商（Accept header）、API 版本自动迁移、数据库 schema 版本控制、插件版本管理 |

### 设计目标

1. **向后兼容** - minor/patch 变更不破坏已有客户端，不引入路由变更
2. **渐进迁移** - 同一资源可同时注册 v1 和 v2，客户端按需升级
3. **零成本未使用** - 未启用版本控制时，路由行为与 Phase 1a 完全一致（`/api/{resource}`）
4. **插件感知** - 与 manifest.yaml 的 `exports.api_version` 字段联动，版本声明即路由注册
5. **废弃协商** - 标记为 deprecated 的版本通过响应头告知客户端，提前 1 个主版本通知

### 相关决策

D1.8 定义路径版本化策略：manifest.exports 中增加 `api_version` 字段（SemVer），Core 通过 URL 路径 `/api/v{major}/{resource}` 路由。Directus `/api/v1/` 和 Strapi `/api/v1/` 为参考实现，SemVer 2.0 为版本号规范。

---

## 2. 接口定义

### VersionInfo

```typescript
interface VersionInfo {
  /** SemVer 版本号，如 "1.0.0"、"2.1.0" */
  version: string
  /** 版本状态 */
  status: 'active' | 'deprecated'
  /** 废弃版本的日落日期（ISO 8601），仅 status=deprecated 时有值 */
  sunsetDate?: string
  /** 建议迁移的目标版本，仅 status=deprecated 时有值 */
  migrationTarget?: string
}
```

### VersionedRoute

```typescript
interface VersionedRoute {
  /** 主版本号 */
  major: number
  /** HTTP 方法 */
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  /** 路由路径（不含版本前缀），如 "/users" */
  path: string
  /** Fastify handler */
  handler: (request: unknown, reply: unknown) => void | Promise<void>
  /** 路由配置（hooks, schema 等） */
  config?: {
    onRequest?: ((request: unknown, reply: unknown) => void | Promise<void>)[]
    schema?: Record<string, unknown>
  }
}
```

### VersionRegistration

```typescript
interface VersionRegistration {
  /** 当前最高主版本号（用于默认路由和 latest 重定向） */
  latestMajor: number
  /** 各主版本的版本信息 */
  versions: Map<number, VersionInfo>
  /** 已注册的路由表 <version, <method:path, handler>> */
  routes: Map<number, Map<string, VersionedRoute>>
}
```

### ApiVersionRouter Class

```typescript
class ApiVersionRouter {
  /**
   * 注册一个 API 版本。
   * latestMajor 自动更新为已注册的最高主版本。
   */
  registerVersion(info: VersionInfo): void

  /**
   * 在指定版本下注册一条路由。
   * path 不包含版本前缀（如 "/users" 而非 "/v1/users"）。
   * 多个版本下可注册相同 path（如 v1 和 v2 各有 /users）。
   */
  registerRoute(version: number, route: VersionedRoute): void

  /**
   * 根据请求解析目标版本号和路由。
   * 返回匹配的 VersionedRoute，或 undefined（版本/路由不存在）。
   */
  resolveVersion(major: number, method: string, path: string): VersionedRoute | undefined

  /**
   * 获取指定主版本的版本信息。
   */
  getVersionInfo(major: number): VersionInfo | undefined

  /**
   * 获取当前 latest 版本号。
   */
  getLatestMajor(): number

  /**
   * 获取所有已注册版本列表。
   */
  getVersions(): VersionInfo[]
}
```

### createVersionedPrefix Function

```typescript
/**
 * 创建带版本前缀的 URL 路径。
 * 无版本时为 `/api/{path}`，有版本时为 `/api/v{major}/{path}`。
 */
function createVersionedPath(major: number | null, path: string): string
```

### wrapRouteWithVersion Function

```typescript
/**
 * 将已有的路由注册函数包装为版本感知版。
 * 接收 FastifyInstance 和 VersionedRoute，自动注册到 `/api/v{major}/{path}`。
 * 同时检查版本是否已注册，未注册时抛出错误。
 */
function wrapRouteWithVersion(
  app: FastifyInstance,
  router: ApiVersionRouter,
  route: VersionedRoute,
): void
```

### VersionDeprecationMiddleware

```typescript
/**
 * 对已废弃版本的请求注入 Deprecated 响应头。
 * 附加 Sunset 头指示移除日期。
 */
function createDeprecationMiddleware(
  router: ApiVersionRouter,
): (request: unknown, reply: unknown) => void
```

### Public Exports (index.ts)

```typescript
export { ApiVersionRouter } from './api-version-router.js'
export { createVersionedPath, wrapRouteWithVersion } from './route-wrapper.js'
export { createDeprecationMiddleware } from './deprecation-middleware.js'
export type { VersionInfo, VersionedRoute, VersionRegistration } from './types.js'
```

---

## 3. 生命周期

### 初始化

```
Core 启动
  -> new ApiVersionRouter()
  -> 扫描全部已加载插件的 manifest.exports 中的 api_version 字段
  -> 为每个版本调用 registerVersion()
  -> 插件注册路由时自动调用 wrapRouteWithVersion()
  -> Fastify 注册中间件 createDeprecationMiddleware()
```

### 插件加载时的路由注册

```
插件 load()
  -> 解析 manifest.exports 中的 routes
  -> 对每个 route，提取 api_version 字段（若无则使用默认 "1.0.0"）
  -> 调用 wrapRouteWithVersion(app, router, versionedRoute)
  -> route 注册为 /api/v{major}/{path}
  -> 如果该版本的 latestMajor，同时注册 /api/{path}（无版本别名）
```

### 请求处理流程

```
Request 进入 /api/v2/users
  -> Fastify 匹配路由前缀 /api/v2
  -> router.resolveVersion(2, 'GET', '/users')
  -> 找到 v2 的 /users handler
  -> 若有 deprecated 标记，注入 Deprecated + Sunset 响应头
  -> 执行 handler，返回响应

Request 进入 /api/users（无版本号）
  -> router.getLatestMajor() -> latestMajor = 2
  -> router.resolveVersion(2, 'GET', '/users')
  -> 自动路由到 latest 版本
```

### 废弃版本生命周期

```
Phase 1: api_version "1.0.0" 注册，status=active
Phase 2: api_version "2.0.0" 注册，status=active
         v1 标记为 status=deprecated，sunsetDate 设为 6 个月后
Phase 3: 超过 sunsetDate，v1 路由返回 API_VERSION_DEPRECATED 错误
Phase 4: v1 路由从 router 中移除
```

### 关闭

无特殊关闭逻辑。所有路由随 Fastify 实例关闭释放。

---

## 4. 依赖关系

| 依赖 | 类型 | 用途 |
|------|------|------|
| `@audebase/shared-types` | workspace | `ErrorCode.API_VERSION_NOT_FOUND`、`ErrorCode.API_VERSION_DEPRECATED` |
| `fastify` | peer | FastifyInstance 类型用于路由注册 |

**无额外运行时依赖**。版本路由表使用标准 Map 结构实现。

### Core 集成点

| Core 组件 | 集成方式 |
|-----------|----------|
| `app.ts` registerApiRoutes | 插件路由注册时调用 wrapRouteWithVersion 替代直接 app.get/post |
| manifest.yaml 解析器 | 提取 exports.api_version 字段传入 ApiVersionRouter.registerVersion |
| 全局错误中间件 | 新增 API_VERSION_NOT_FOUND / API_VERSION_DEPRECATED 的错误处理和 HTTP 状态码映射 |

---

## 5. 错误码与错误处理

| 错误码 | HTTP | 场景 | 恢复策略 |
|--------|------|------|----------|
| `API_VERSION_NOT_FOUND` | 404 | 请求的版本号未注册（如 /api/v3/users 不存在 v3） | 客户端检查已注册版本列表，使用可用版本重试 |
| `API_VERSION_DEPRECATED` | 410 | 请求的版本已过 sunsetDate 被移除 | 客户端升级到 migrationTarget 版本 |

### 404 响应格式

```json
{
  "error": {
    "code": "API_VERSION_NOT_FOUND",
    "message": "API 版本 v3 不存在。可用版本: v1, v2"
  }
}
```

### 410 响应格式

```json
{
  "error": {
    "code": "API_VERSION_DEPRECATED",
    "message": "API 版本 v1 已废弃，请升级到 v2",
    "details": {
      "migrationTarget": "2",
      "availableVersion": "2"
    }
  }
}
```

### 响应头

| Header | 说明 |
|--------|------|
| `Deprecated` | 废弃版本响应中注入，值为 `true` |
| `Sunset` | 废弃版本响应中注入，值为 ISO 8601 日期字符串 |
| `X-API-Version` | 响应中注入当前请求的版本号 |

### Phase 2 扩展（版本列表端点）

```json
// GET /api/versions
{
  "data": [
    { "version": "1.0.0", "status": "deprecated", "sunsetDate": "2027-01-01T00:00:00Z", "migrationTarget": "2" },
    { "version": "2.0.0", "status": "active" }
  ]
}
```

---

## 6. 安全考虑

### 路由劫持防护

- 版本号必须为纯数字（major），Core 路由注册时校验 `/api/v{major}/` 中 major 为 1 位以上正整数
- 拒绝非数字或负数的版本路径（如 `/api/vNaN/users`）
- 拒绝超出版本注册范围的版本号（如已注册 v1-v3，拒绝 v999）

### 版本隔离

- 不同主版本的 handler 运行在同一个 Fastify 进程中，中间件栈一致（auth/rate-limit/audit 对所有版本生效）
- 各插件负责自己注册的版本路由，Core 不校验版本间 handler 的权限差异

### 信息泄露

- `API_VERSION_NOT_FOUND` 仅在 version 已知时才列出可用版本列表
- 不暴露未注册版本的内部信息

### Default 版本安全

- 无版本号请求默认路由到 latestMajor，该行为可在 Fastify 插件注册时由插件显式控制
- 插件不注册 routes 时不做任何默认路由

---

## 7. Mock 约束

### ApiVersionRouter mock 约束

| 约束 | 说明 |
|------|------|
| 纯同步 | `registerVersion()`、`registerRoute()`、`resolveVersion()` 均为同步方法 |
| 内存 Map | 测试使用真实 `ApiVersionRouter` 实例，版本路由表存储在内存 Map 中 |
| 链式构造 | 测试通过 `router.registerVersion()` + `router.registerRoute()` 链式构造测试场景 |
| 隔离 | 每个测试用例创建独立 `ApiVersionRouter` 实例，无共享状态 |

### wrapRouteWithVersion mock 约束

| 约束 | 说明 |
|------|------|
| Fastify 实例 | 测试使用真实 Fastify 实例（通过 `Fastify()` 构造），验证路由是否注册到正确路径 |
| 注入检测 | 测试验证 `inject()` 调用 `/api/v1/users` 和 `/api/v2/users` 返回不同 handler 的结果 |
| 无版本前缀 | 测试验证 `/api/users` 默认路由到 latestMajor |

### createDeprecationMiddleware mock 约束

| 约束 | 说明 |
|------|------|
| Header 检测 | 测试验证 deprecated 版本返回 Deprecated + Sunset 头 |
| Active 版本 | active 版本不应有 Deprecated 头 |
| Sunset 后行为 | 超过 sunsetDate 应返回 410 |

---

## 8. 变更记录

| 日期 | 变更 |
|------|------|
| 2026-07-17 | 初始 SDD 创建 - Phase 1b API 版本控制模块 |