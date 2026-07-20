# API Versioning TDD 测试策略

> **模块**: `@audebase/api-versioning`
> **依赖**: `@audebase/shared-types`
> **更新日期**: 2026-07-17
> **参考**: D1.8 (API 版本控制)、api-specification.md、api-conventions.md §4

---

## 1. 测试策略概述

API Versioning 模块为纯路由工具，不依赖外部服务。版本路由表使用标准 Map 结构，所有方法为同步操作。测试策略以单元测试为主，覆盖版本注册、路由注册、版本解析、废弃标记等全部分支。

| 测试类型 | 最低用例数 | 数据库 |
|---------|:---:|------|
| 单元测试 | 15+ | 无（纯内存） |
| 集成测试 | 5+ | 真实 Fastify 实例 |
| 契约测试 | 3+ | 真实 Fastify 实例 |
| E2E 测试 | 0 | 无需 E2E |

---

## 2. 模块结构

```
packages/api-versioning/
├── src/
│   ├── index.ts                    # 公共导出
│   ├── types.ts                    # VersionInfo, VersionedRoute, VersionRegistration
│   ├── api-version-router.ts       # ApiVersionRouter 类
│   ├── route-wrapper.ts            # createVersionedPath, wrapRouteWithVersion
│   ├── deprecation-middleware.ts   # createDeprecationMiddleware
│   └── __tests__/
│       ├── unit/
│       │   ├── api-version-router.test.ts
│       │   ├── route-wrapper.test.ts
│       │   └── deprecation-middleware.test.ts
│       ├── integration/
│       │   └── api-versioning.integration.test.ts
│       └── contracts/
│           └── api-versioning.contract.test.ts
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## 3. 单元测试

### 3.1 ApiVersionRouter — registerVersion

```
测试文件: packages/api-versioning/src/__tests__/unit/api-version-router.test.ts
```

```typescript
import { describe, test, expect, beforeEach } from 'vitest'
import { ApiVersionRouter } from '../../api-version-router'

describe('ApiVersionRouter.registerVersion', () => {
  let router: ApiVersionRouter

  beforeEach(() => {
    router = new ApiVersionRouter()
  })

  test('注册 v1 后 latestMajor 为 1', () => {
    // Arrange
    const versionInfo = { version: '1.0.0', status: 'active' as const }

    // Act
    router.registerVersion(versionInfo)

    // Assert
    expect(router.getLatestMajor()).toBe(1)
    expect(router.getVersionInfo(1)).toEqual(versionInfo)
  })

  test('注册 v2 后 latestMajor 自动更新为 2', () => {
    // Arrange
    router.registerVersion({ version: '1.0.0', status: 'active' })
    router.registerVersion({ version: '2.0.0', status: 'active' })

    // Act
    const latest = router.getLatestMajor()

    // Assert
    expect(latest).toBe(2)
  })

  test('注册 v3 后已注册的 v1 不受影响', () => {
    // Arrange
    router.registerVersion({ version: '1.0.0', status: 'active' })
    router.registerVersion({ version: '2.0.0', status: 'active' })

    // Act
    router.registerVersion({ version: '3.0.0', status: 'active' })

    // Assert
    expect(router.getVersionInfo(1)).toBeDefined()
    expect(router.getVersionInfo(2)).toBeDefined()
    expect(router.getVersionInfo(3)).toBeDefined()
    expect(router.getLatestMajor()).toBe(3)
  })

  test('重复注册同一版本幂等', () => {
    // Arrange
    router.registerVersion({ version: '1.0.0', status: 'active' })

    // Act
    router.registerVersion({ version: '1.0.0', status: 'active' })

    // Assert
    expect(router.getVersions()).toHaveLength(1)
  })

  test('注册 deprecated 版本时 latestMajor 不变', () => {
    // Arrange
    router.registerVersion({ version: '1.0.0', status: 'active' })
    router.registerVersion({ version: '2.0.0', status: 'deprecated', sunsetDate: '2027-01-01T00:00:00Z', migrationTarget: '3' })

    // Act
    const latest = router.getLatestMajor()

    // Assert
    expect(latest).toBe(2)
    const info = router.getVersionInfo(2)
    expect(info?.status).toBe('deprecated')
    expect(info?.sunsetDate).toBe('2027-01-01T00:00:00Z')
    expect(info?.migrationTarget).toBe('3')
  })
})
```

### 3.2 ApiVersionRouter — registerRoute

```typescript
describe('ApiVersionRouter.registerRoute', () => {
  let router: ApiVersionRouter

  beforeEach(() => {
    router = new ApiVersionRouter()
    router.registerVersion({ version: '1.0.0', status: 'active' })
    router.registerVersion({ version: '2.0.0', status: 'active' })
  })

  test('在 v1 下注册 GET /users', () => {
    // Arrange
    const route = { major: 1, method: 'GET' as const, path: '/users', handler: () => {} }

    // Act
    router.registerRoute(1, route)

    // Assert
    const resolved = router.resolveVersion(1, 'GET', '/users')
    expect(resolved).toBeDefined()
    expect(resolved?.path).toBe('/users')
    expect(resolved?.method).toBe('GET')
  })

  test('v1 和 v2 可注册相同 path 的不同 handler', () => {
    // Arrange
    const handlerV1 = () => 'v1-response'
    const handlerV2 = () => 'v2-response'
    router.registerRoute(1, { major: 1, method: 'GET', path: '/users', handler: handlerV1 })
    router.registerRoute(2, { major: 2, method: 'GET', path: '/users', handler: handlerV2 })

    // Act
    const resolvedV1 = router.resolveVersion(1, 'GET', '/users')
    const resolvedV2 = router.resolveVersion(2, 'GET', '/users')

    // Assert
    expect(resolvedV1?.handler).toBe(handlerV1)
    expect(resolvedV2?.handler).toBe(handlerV2)
  })

  test('在同一版本下注册重复 path+method 覆盖旧路由', () => {
    // Arrange
    const oldHandler = () => 'old'
    const newHandler = () => 'new'
    router.registerRoute(1, { major: 1, method: 'GET', path: '/users', handler: oldHandler })

    // Act
    router.registerRoute(1, { major: 1, method: 'GET', path: '/users', handler: newHandler })

    // Assert
    const resolved = router.resolveVersion(1, 'GET', '/users')
    expect(resolved?.handler).toBe(newHandler)
  })
})
```

### 3.3 ApiVersionRouter — resolveVersion

```typescript
describe('ApiVersionRouter.resolveVersion', () => {
  let router: ApiVersionRouter

  beforeEach(() => {
    router = new ApiVersionRouter()
    router.registerVersion({ version: '1.0.0', status: 'active' })
    router.registerVersion({ version: '2.0.0', status: 'active' })
    router.registerRoute(1, { major: 1, method: 'GET', path: '/users', handler: () => {} })
    router.registerRoute(1, { major: 1, method: 'POST', path: '/users', handler: () => {} })
    router.registerRoute(2, { major: 2, method: 'GET', path: '/users', handler: () => {} })
  })

  test('解析存在的 v1 GET /users 返回路由', () => {
    // Act
    const result = router.resolveVersion(1, 'GET', '/users')

    // Assert
    expect(result).toBeDefined()
    expect(result?.major).toBe(1)
  })

  test('解析存在的 v2 GET /users 返回路由', () => {
    // Act
    const result = router.resolveVersion(2, 'GET', '/users')

    // Assert
    expect(result).toBeDefined()
    expect(result?.major).toBe(2)
  })

  test('解析不存在的版本号返回 undefined', () => {
    // Act
    const result = router.resolveVersion(99, 'GET', '/users')

    // Assert
    expect(result).toBeUndefined()
  })

  test('解析不存在的路径返回 undefined', () => {
    // Act
    const result = router.resolveVersion(1, 'GET', '/nonexistent')

    // Assert
    expect(result).toBeUndefined()
  })

  test('方法不匹配时返回 undefined', () => {
    // Act
    const result = router.resolveVersion(1, 'DELETE', '/users')

    // Assert
    expect(result).toBeUndefined()
  })
})
```

### 3.4 ApiVersionRouter — getVersions & getVersionInfo

```typescript
describe('ApiVersionRouter.getVersions', () => {
  test('无注册版本时返回空数组', () => {
    // Arrange
    const router = new ApiVersionRouter()

    // Act
    const versions = router.getVersions()

    // Assert
    expect(versions).toEqual([])
  })

  test('返回所有注册版本列表', () => {
    // Arrange
    const router = new ApiVersionRouter()
    router.registerVersion({ version: '1.0.0', status: 'active' })
    router.registerVersion({ version: '2.0.0', status: 'deprecated', sunsetDate: '2027-01-01T00:00:00Z', migrationTarget: '3' })

    // Act
    const versions = router.getVersions()

    // Assert
    expect(versions).toHaveLength(2)
    expect(versions[0].version).toBe('1.0.0')
    expect(versions[1].version).toBe('2.0.0')
  })

  test('getVersionInfo 返回未注册版本时返回 undefined', () => {
    // Arrange
    const router = new ApiVersionRouter()

    // Act
    const info = router.getVersionInfo(99)

    // Assert
    expect(info).toBeUndefined()
  })
})
```

### 3.5 createVersionedPath

```
测试文件: packages/api-versioning/src/__tests__/unit/route-wrapper.test.ts
```

```typescript
import { describe, test, expect } from 'vitest'
import { createVersionedPath } from '../../route-wrapper'

describe('createVersionedPath', () => {
  test('无版本号时返回 /api/{path}', () => {
    // Act
    const result = createVersionedPath(null, '/users')

    // Assert
    expect(result).toBe('/api/users')
  })

  test('版本号为 1 时返回 /api/v1/{path}', () => {
    // Act
    const result = createVersionedPath(1, '/users')

    // Assert
    expect(result).toBe('/api/v1/users')
  })

  test('版本号为 2 时返回 /api/v2/{path}', () => {
    // Act
    const result = createVersionedPath(2, '/users')

    // Assert
    expect(result).toBe('/api/v2/users')
  })

  test('path 带前缀 /api 时正确处理', () => {
    // Act
    const result = createVersionedPath(1, '/api/users')

    // Assert
    expect(result).toBe('/api/v1/api/users')
  })
})
```

### 3.6 wrapRouteWithVersion

```typescript
import { describe, test, expect, vi } from 'vitest'
import { wrapRouteWithVersion } from '../../route-wrapper'
import { ApiVersionRouter } from '../../api-version-router'

describe('wrapRouteWithVersion', () => {
  test('已注册版本时调用 Fastify route 注册到正确路径', () => {
    // Arrange
    const router = new ApiVersionRouter()
    router.registerVersion({ version: '1.0.0', status: 'active' })
    const mockApp = { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() }
    const route = { major: 1, method: 'GET' as const, path: '/users', handler: () => {} }

    // Act
    wrapRouteWithVersion(mockApp as any, router, route)

    // Assert
    expect(mockApp.get).toHaveBeenCalledWith('/api/v1/users', route.handler)
  })

  test('未注册版本时抛出错误', () => {
    // Arrange
    const router = new ApiVersionRouter()
    const mockApp = { get: vi.fn() }
    const route = { major: 99, method: 'GET' as const, path: '/users', handler: () => {} }

    // Act & Assert
    expect(() => wrapRouteWithVersion(mockApp as any, router, route)).toThrow()
    expect(mockApp.get).not.toHaveBeenCalled()
  })

  test('路由配置（hooks、schema）一起传递', () => {
    // Arrange
    const router = new ApiVersionRouter()
    router.registerVersion({ version: '1.0.0', status: 'active' })
    const mockApp = { get: vi.fn() }
    const config = { onRequest: [vi.fn()], schema: { response: { 200: {} } } }
    const route = { major: 1, method: 'GET' as const, path: '/users', handler: () => {}, config }

    // Act
    wrapRouteWithVersion(mockApp as any, router, route)

    // Assert
    expect(mockApp.get).toHaveBeenCalledWith('/api/v1/users', { onRequest: config.onRequest, schema: config.schema }, route.handler)
  })
})
```

### 3.7 createDeprecationMiddleware

```
测试文件: packages/api-versioning/src/__tests__/unit/deprecation-middleware.test.ts
```

```typescript
import { describe, test, expect, vi } from 'vitest'
import { createDeprecationMiddleware } from '../../deprecation-middleware'
import { ApiVersionRouter } from '../../api-version-router'

describe('createDeprecationMiddleware', () => {
  test('active 版本不注入 Deprecated 头', () => {
    // Arrange
    const router = new ApiVersionRouter()
    router.registerVersion({ version: '1.0.0', status: 'active' })
    const middleware = createDeprecationMiddleware(router)
    const mockReply = { header: vi.fn() }
    const mockRequest = { params: { major: '1' } }

    // Act
    middleware(mockRequest as any, mockReply as any)

    // Assert
    expect(mockReply.header).not.toHaveBeenCalledWith('Deprecated', expect.anything())
  })

  test('deprecated 版本注入 Deprecated + Sunset 头', () => {
    // Arrange
    const router = new ApiVersionRouter()
    router.registerVersion({ version: '1.0.0', status: 'deprecated', sunsetDate: '2027-01-01T00:00:00Z', migrationTarget: '2' })
    const middleware = createDeprecationMiddleware(router)
    const mockReply = { header: vi.fn() }
    const mockRequest = { params: { major: '1' } }

    // Act
    middleware(mockRequest as any, mockReply as any)

    // Assert
    expect(mockReply.header).toHaveBeenCalledWith('Deprecated', 'true')
    expect(mockReply.header).toHaveBeenCalledWith('Sunset', '2027-01-01T00:00:00Z')
  })

  test('响应中注入 X-API-Version 头', () => {
    // Arrange
    const router = new ApiVersionRouter()
    router.registerVersion({ version: '1.0.0', status: 'active' })
    const middleware = createDeprecationMiddleware(router)
    const mockReply = { header: vi.fn() }
    const mockRequest = { params: { major: '1' } }

    // Act
    middleware(mockRequest as any, mockReply as any)

    // Assert
    expect(mockReply.header).toHaveBeenCalledWith('X-API-Version', '1')
  })

  test('未注册版本的中介不设置头', () => {
    // Arrange
    const router = new ApiVersionRouter()
    const middleware = createDeprecationMiddleware(router)
    const mockReply = { header: vi.fn() }
    const mockRequest = { params: { major: '99' } }

    // Act
    middleware(mockRequest as any, mockReply as any)

    // Assert
    expect(mockReply.header).not.toHaveBeenCalled()
  })
})
```

---

## 4. 集成测试

```
测试文件: packages/api-versioning/src/__tests__/integration/api-versioning.integration.test.ts
```

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import Fastify from 'fastify'
import { ApiVersionRouter } from '../../api-version-router'
import { wrapRouteWithVersion } from '../../route-wrapper'
import { createDeprecationMiddleware } from '../../deprecation-middleware'

describe('API Versioning 集成测试', () => {
  let app: ReturnType<typeof Fastify>
  let router: ApiVersionRouter

  beforeEach(async () => {
    app = Fastify()
    router = new ApiVersionRouter()
    router.registerVersion({ version: '1.0.0', status: 'active' })
    router.registerVersion({ version: '2.0.0', status: 'deprecated', sunsetDate: '2099-01-01T00:00:00Z', migrationTarget: '3' })
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  test('v1 和 v2 注册相同路径返回不同 handler 结果', async () => {
    // Arrange
    const handlerV1 = async (_req: any, reply: any) => { return reply.send('v1') }
    const handlerV2 = async (_req: any, reply: any) => { return reply.send('v2') }
    wrapRouteWithVersion(app, router, { major: 1, method: 'GET', path: '/users', handler: handlerV1 })
    wrapRouteWithVersion(app, router, { major: 2, method: 'GET', path: '/users', handler: handlerV2 })

    // Act
    const resV1 = await app.inject({ method: 'GET', url: '/api/v1/users' })
    const resV2 = await app.inject({ method: 'GET', url: '/api/v2/users' })

    // Assert
    expect(resV1.statusCode).toBe(200)
    expect(resV1.body).toBe('v1')
    expect(resV2.statusCode).toBe(200)
    expect(resV2.body).toBe('v2')
  })

  test('无版本号请求默认路由到 latestMajor', async () => {
    // Arrange
    router.registerVersion({ version: '3.0.0', status: 'active' })
    const handlerV3 = async (_req: any, reply: any) => { return reply.send('v3-default') }
    wrapRouteWithVersion(app, router, { major: 3, method: 'GET', path: '/default', handler: handlerV3 })

    // Act
    const res = await app.inject({ method: 'GET', url: '/api/default' })

    // Assert
    expect(res.body).toBe('v3-default')
  })

  test('不存在的版本号返回 404', async () => {
    // Arrange
    wrapRouteWithVersion(app, router, { major: 1, method: 'GET', path: '/users', handler: async (_req: any, reply: any) => reply.send('ok') })

    // Act
    const res = await app.inject({ method: 'GET', url: '/api/v99/users' })

    // Assert
    expect(res.statusCode).toBe(404)
  })

  test('deprecated 版本响应含 Deprecated 头', async () => {
    // Arrange
    app.addHook('onRequest', createDeprecationMiddleware(router))
    wrapRouteWithVersion(app, router, { major: 2, method: 'GET', path: '/items', handler: async (_req: any, reply: any) => reply.send('ok') })

    // Act
    const res = await app.inject({ method: 'GET', url: '/api/v2/items' })

    // Assert
    expect(res.headers['deprecated']).toBe('true')
    expect(res.headers['sunset']).toBeDefined()
    expect(res.headers['x-api-version']).toBe('2')
  })

  test('active 版本无 Deprecated 头', async () => {
    // Arrange
    app.addHook('onRequest', createDeprecationMiddleware(router))
    wrapRouteWithVersion(app, router, { major: 1, method: 'GET', path: '/items', handler: async (_req: any, reply: any) => reply.send('ok') })

    // Act
    const res = await app.inject({ method: 'GET', url: '/api/v1/items' })

    // Assert
    expect(res.headers['deprecated']).toBeUndefined()
    expect(res.headers['x-api-version']).toBe('1')
  })
})
```

---

## 5. 契约测试

```
测试文件: packages/api-versioning/src/__tests__/contracts/api-versioning.contract.test.ts
```

```typescript
import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import Fastify from 'fastify'
import { ApiVersionRouter } from '../../api-version-router'
import { wrapRouteWithVersion } from '../../route-wrapper'

describe('API Versioning 响应形状契约', () => {
  let app: ReturnType<typeof Fastify>
  let router: ApiVersionRouter

  beforeEach(async () => {
    app = Fastify()
    router = new ApiVersionRouter()
    await app.ready()
  })

  afterEach(async () => {
    await app.close()
  })

  test('不存在的版本路径返回 404 JSON 错误形状', async () => {
    // Arrange
    router.registerVersion({ version: '1.0.0', status: 'active' })
    wrapRouteWithVersion(app, router, { major: 1, method: 'GET', path: '/users', handler: async (_req: any, reply: any) => reply.send({ data: [] }) })

    // Act
    const res = await app.inject({ method: 'GET', url: '/api/v99/users' })

    // Assert
    expect(res.statusCode).toBe(404)
    const body = JSON.parse(res.body)
    expect(body).toHaveProperty('error')
    expect(body.error).toHaveProperty('code')
    expect(body.error).toHaveProperty('message')
    expect(body.error.code).toBe('API_VERSION_NOT_FOUND')
  })

  test('不存在的路径返回 404', async () => {
    // Arrange
    router.registerVersion({ version: '1.0.0', status: 'active' })
    wrapRouteWithVersion(app, router, { major: 1, method: 'GET', path: '/users', handler: async (_req: any, reply: any) => reply.send({ data: [] }) })

    // Act
    const res = await app.inject({ method: 'GET', url: '/api/v1/nonexistent' })

    // Assert
    expect(res.statusCode).toBe(404)
  })

  test('成功响应包含 X-API-Version 头', async () => {
    // Arrange
    router.registerVersion({ version: '1.0.0', status: 'active' })
    wrapRouteWithVersion(app, router, { major: 1, method: 'GET', path: '/items', handler: async (_req: any, reply: any) => reply.send({ data: [] }) })

    // Act
    const res = await app.inject({ method: 'GET', url: '/api/v1/items' })

    // Assert
    expect(res.statusCode).toBe(200)
    expect(res.headers['x-api-version']).toBe('1')
  })
})
```

---

## 6. E2E 测试

API Versioning 模块为纯路由工具，无 UI 交互，不涉及 E2E 测试。版本路由行为完全由集成测试覆盖。

---

## 7. 种子数据

API Versioning 模块不依赖数据库，无种子数据需求。测试场景通过 `ApiVersionRouter.registerVersion()` + `ApiVersionRouter.registerRoute()` 链式构造。

---

## 8. Mock 策略

| 依赖 | 单元测试 | 集成测试 |
|------|---------|---------|
| Fastify 实例 | 无（mock app 对象） | 真实 Fastify() |
| 外部存储 | 无（纯内存 Map） | 无（纯内存 Map） |
| 数据库 | 无 | 无 |
| 网络 | 无 | 无 |

所有测试使用纯内存 `ApiVersionRouter` 实例，无需外部服务。

---

## 9. 覆盖率目标

| 指标 | 目标 | 关键路径 |
|------|:---:|------|
| 行覆盖率 | **85%+** | |
| 分支覆盖率 | **80%+** | resolveVersion 查找/未找到分支、wrapRouteWithVersion 版本检查分支 |
| 函数覆盖率 | **90%+** | registerVersion/registerRoute/resolveVersion/getVersionInfo/getLatestMajor/getVersions |

---

## 10. CI 集成

```yaml
api-versioning-test:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
    - run: pnpm install --frozen-lockfile
    - run: pnpm --filter @audebase/api-versioning test:unit
    - run: pnpm --filter @audebase/api-versioning test:integration
```

无外部服务依赖，CI 仅需 Node.js + pnpm。

---

## 11. 用例汇总

| 测试层 | 用例数 |
|--------|:---:|
| 单元 - ApiVersionRouter.registerVersion | 5 |
| 单元 - ApiVersionRouter.registerRoute | 4 |
| 单元 - ApiVersionRouter.resolveVersion | 5 |
| 单元 - ApiVersionRouter.getVersions | 3 |
| 单元 - createVersionedPath | 4 |
| 单元 - wrapRouteWithVersion | 3 |
| 单元 - createDeprecationMiddleware | 4 |
| 集成 - api-versioning.integration | 5 |
| 契约 - api-versioning.contract | 3 |
| **合计** | **36** |

---

## 12. 参考

- [api-versioning-sdd.md](api-versioning-sdd.md) — SDD 接口定义与生命周期
- [api-specification.md](api-specification.md) — API 端点规范
- [api-conventions.md](api-conventions.md) §4 — 版本控制约定
- [../../.agents/memorys/decisions.md](../../.agents/memorys/decisions.md) — D1.8 API 版本控制

> **上游 TDD 参考**: [shared-types-tdd.md §3.1](shared-types-tdd.md) — ErrorCode 枚举

---