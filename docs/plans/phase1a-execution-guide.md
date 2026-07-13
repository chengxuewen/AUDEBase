# AUDEBase Phase 1a 执行指南

> **创建日期**: 2026-07-13  
> **目的**: 规范 Phase 1a 编码阶段的开发流程、质量门禁和团队协作方式  
> **来源**: decisions.md G5（AI-Driven SDD/TDD 强制性规范）、AGENTS.md §AI-DRIVEN SDD/TDD 工作流、conventions.md、pitfalls.md、testing.md

---

## 目录

1. [AI-Driven SDD/TDD 工作流](#1-ai-driven-sdttdd-工作流)
2. [每日开发节奏](#2-每日开发节奏)
3. [4 人并行工作结构](#3-4-人并行工作结构)
4. [代码质量门禁](#4-代码质量门禁)
5. [Git 分支策略](#5-git-分支策略)
6. [测试金字塔](#6-测试金字塔)
7. [Mock 约束](#7-mock-约束)
8. [错误处理模式](#8-错误处理模式)
9. [模块实现顺序](#9-模块实现顺序)
10. [常见坑点与反模式](#10-常见坑点与反模式)

---

## 1. AI-Driven SDD/TDD 工作流

> **来源**: decisions.md G5、AGENTS.md §AI-DRIVEN SDD/TDD 工作流、conventions.md §SDD/TDD 文档约定

Phase 1a 起，所有模块开发**必须**遵循 AI-Driven SDD/TDD 工作流。这是强制性的开发规范，不是可选项。

### 1.1 四步循环

```
┌─────────────────────────────────────────────────────┐
│  ① SDD 先行                                          │
│  AI 代理根据 architecture.md + phase-planning.md      │
│  生成模块 SDD 文档（8 节标准结构）                      │
└──────────┬──────────────────────────────────────────┘
           ▼
┌─────────────────────────────────────────────────────┐
│  ② TDD 测试计划                                      │
│  AI 代理根据 SDD 接口定义生成测试文件骨架               │
│  （测试计划 + AAA 结构 + 覆盖率目标）                   │
└──────────┬──────────────────────────────────────────┘
           ▼
┌─────────────────────────────────────────────────────┐
│  ③ TDD 编码                                          │
│  RED（写测试→失败）→ GREEN（最小实现→通过）→            │
│  IMPROVE（重构）循环                                  │
└──────────┬──────────────────────────────────────────┘
           ▼
┌─────────────────────────────────────────────────────┐
│  ④ 文档同步                                          │
│  编码完成后更新 .agents/memorys/ 和 AGENTS.md          │
│  （CODEMAP + SDD 索引）                               │
└─────────────────────────────────────────────────────┘
```

### 1.2 SDD 文档标准结构（8 节）

每个 SDD 文档必须包含以下 8 个章节，缺一不可：

| # | 章节 | 内容要求 |
|---|------|----------|
| 1 | **概要** | 模块定位、职责边界、设计目标 |
| 2 | **接口定义** | 所有导出 API 的类型签名、参数描述、返回值 |
| 3 | **生命周期** | 启动/关闭/加载/卸载顺序、钩子函数签名 |
| 4 | **依赖关系** | 对其他模块或外部服务的依赖列表 |
| 5 | **错误码与错误处理** | 错误码枚举、恢复策略、日志级别 |
| 6 | **安全考虑** | 权限检查点、数据过滤规则 |
| 7 | **Mock 约束** | Phase 1 测试用的 mock 接口约束 |
| 8 | **变更记录** | 此文档的版本历史 |

> **来源**: conventions.md §SDD 文档命名与结构

### 1.3 测试计划格式（AAA 结构）

每个测试用例必须遵循 Arrange → Act → Assert 三段式：

```typescript
// ✅ 正确: AAA 结构 + 描述性命名
test('load() 返回插件实例当 manifest 有效时', () => {
  // Arrange
  const manifest = createValidManifest({ name: 'test-plugin' })
  const host = new InlinePluginHost()

  // Act
  const plugin = await pluginManager.load(manifest, host)

  // Assert
  expect(plugin).toBeInstanceOf(PluginInstance)
  expect(plugin.name).toBe('test-plugin')
  expect(plugin.status).toBe('loaded')
})

// ❌ 错误: 无 AAA 结构，模糊命名
test('load plugin', () => {
  const p = await pm.load(m)
  expect(p.name).toBe('test-plugin')
})
```

> **来源**: testing.md §Test Structure (AAA Pattern)、conventions.md §TDD 测试计划格式

### 1.4 测试文件命名约定

| 测试类型 | 命名模式 | 示例 |
|----------|----------|------|
| 单元测试 | `{module}.test.ts` | `plugin-manager.test.ts` |
| 集成测试 | `{module}.spec.ts` | `auth.spec.ts` |
| API Contract 测试 | `{module}.contract.test.ts` | `rbac-api.contract.test.ts` |
| E2E 测试 | `{feature}.e2e.ts` | `plugin-install.e2e.ts` |

### 1.5 例外规则

以下情况可跳过 SDD 生成，但**必须事后补测试**：

- **pure-refactor**: 纯重构，不改变接口签名
- **紧急 hotfix**: 生产缺陷修复（需 lead 确认）

---

## 2. 每日开发节奏

> **来源**: development-workflow.md、testing.md

### 2.1 推荐节奏

```
Morning (09:00-09:30) — 每日同步
  ├─ 更新昨日进展（team_send_message to lead）
  ├─ 查看 teammate 是否有阻塞依赖
  └─ 认领当日任务

Morning (09:30-12:00) — TDD 编码冲刺
  ├─ 1-2 个 RED→GREEN→IMPROVE 循环
  ├─ 每次 IMPROVE 后运行 lint + type-check
  └─ 每次 GREEN 后运行相关单元测试

Afternoon (14:00-16:30) — 集成与验证
  ├─ 运行当前模块全部测试
  ├─ 运行受影响的集成测试
  └─ 修复 CI gate 报错

Evening (16:30-17:30) — 提交与文档
  ├─ git commit（conventional commits）
  ├─ 更新 .agents/memorys/ 状态
  └─ team_send_message 报告完成
```

### 2.2 单模块 TDD 循环示例

以模块 #6（插件框架）为例：

```bash
# Step 1: RED — 写测试，预期失败
# 文件: packages/plugin-framework/__tests__/plugin-manager.test.ts
cat > packages/plugin-framework/__tests__/plugin-manager.test.ts << 'EOF'
import { describe, it, expect } from 'vitest'
import { PluginManager } from '../src/plugin-manager'

describe('PluginManager', () => {
  it('discover() 从目录发现 manifest.yaml', async () => {
    // Arrange
    const manager = new PluginManager({ pluginsDir: '/tmp/test-plugins' })

    // Act
    const manifests = await manager.discover()

    // Assert
    expect(manifests.length).toBeGreaterThan(0)
    expect(manifests[0]).toHaveProperty('name')
    expect(manifests[0]).toHaveProperty('version')
  })
})
EOF

# Step 2: 运行测试 → RED（失败）
npx vitest run packages/plugin-framework/__tests__/plugin-manager.test.ts

# Step 3: GREEN — 写最小实现
# 在 src/plugin-manager.ts 中实现 discover()

# Step 4: 运行测试 → GREEN（通过）
npx vitest run packages/plugin-framework/__tests__/plugin-manager.test.ts

# Step 5: IMPROVE — 重构，保持测试通过
# 提取文件读取逻辑到 findManifests() 工具函数
# 再次运行测试确认通过
```

### 2.3 CI 门禁流程

```
每次 git push → GitHub Actions:
  ├─ lint (Prettier + ESLint) → FAIL 阻断
  ├─ type-check (tsc --noEmit) → FAIL 阻断
  ├─ test (vitest run --coverage) → 覆盖率 < 80% 阻断
  └─ build (turbo build) → FAIL 阻断
```

> **来源**: phase-planning.md §Week 0（GitHub Actions CI 流水线，PR 低于 80% 阻断）

---

## 3. 4 人并行工作结构

> **来源**: phase-planning.md §Phase 1a 4 人并行分工 + 依赖关系图

### 3.1 四轨并行架构

Phase 1a 分为 4 条并行轨道，每条轨道独立开发，仅在依赖边界处进行契约对齐：

```
                  Week 0（基础设施）
                  Turborepo + CI + Docker + shared-types
                  │
        ┌─────────┼──────────┬──────────┐
        ▼         ▼          ▼          ▼
   Person A    Person B   Person C   Person D
   Kernel & CI  Plugin      Data &     Admin UI
                Framework   Auth
```

### 3.2 各轨道职责

| 角色 | 负责模块 | 启动条件 | 主要交付 |
|------|----------|----------|----------|
| **Person A — Kernel & CI** | #1 内核骨架、#3 CLI、#5 迁移管理、#13 日志、#14 速率限制 | Week 0 完成后立即启动 | Fastify 应用、CLI 工具、迁移引擎、pino 日志、速率限制中间件 |
| **Person B — Plugin Framework** | #6 插件框架、#4 plugin-core Bootstrap | #1 和 #2 完成后 | manifest 验证、7 钩子生命周期、InlinePluginHost、Bootstrap 数据 |
| **Person C — Data & Auth** | #2 DB Schema、#7 JWT、#8 RBAC、#9 多租户、#10 审计 | #1 内核骨架完成后 | DDL 脚本、JWT 认证、RBAC 中间件、tenant_id 注入、审计日志 |
| **Person D — Admin UI** | #12 管理 UI、#11 i18n 骨架 | #1 内核、#7 JWT、#8 RBAC 完成后 | ProLayout 骨架、插件管理页、用户管理页、ACLGuard |

### 3.3 跨轨道依赖约束

```
Person A (#1 内核骨架)
  │
  ├──→ Person C (#2 DB Schema, #7 JWT, #8 RBAC)
  │     │
  │     └──→ Person D (#12 管理 UI)
  │
  ├──→ Person B (#6 插件框架, #4 plugin-core)
  │
  └──→ A 内部 (#3 CLI, #5 迁移, #13 日志, #14 速率限制)
```

**协作规则**:

1. **接口契约优先**: 上游模块先输出 TypeScript interface（通过 shared-types），下游模块基于 interface 实现
2. **Mock 先行**: 上游模块未完成时，下游模块使用 mock 实现继续开发（见 §7 Mock 约束）
3. **每日同步**: 每天 09:00 确认接口是否变更，变更后更新 shared-types + 通知下游
4. **独立可测**: 每条轨道维护独立的 vitest 配置文件，确保测试不跨模块泄漏

### 3.4 Person A 内部串行顺序

Person A 负责的 5 个模块有强依赖关系，必须按顺序实现：

```
#1 内核骨架 → #13 日志 → #5 迁移管理 → #3 CLI → #14 速率限制
```

---

## 4. 代码质量门禁

> **来源**: conventions.md、TS coding-style.md、testing.md

### 4.1 硬性门禁（CI 阻断）

| 门禁 | 阈值 | 阻断条件 | 来源 |
|------|------|----------|------|
| **测试覆盖率** | 80% lines | 低于 80% → CI FAIL | testing.md |
| **类型检查** | tsc --noEmit 无错误 | 有类型错误 → CI FAIL | TS coding-style.md |
| **Lint** | ESLint + Prettier | 有 lint 错误 → CI FAIL | phase-planning.md |
| **无 `as any`** | 零容忍 | 发现 `as any` / `@ts-ignore` → CI FAIL | conventions.md |
| **无 `console.log`** | 零容忍 | 发现 `console.log` → CI FAIL | TS coding-style.md |

### 4.2 代码质量红线

```typescript
// ❌ 绝对禁止: as any
function process(data: unknown) {
  const user = data as any  // BLOCKED BY CI
  return user.email
}

// ✅ 正确: unknown + 类型收窄
function process(data: unknown): string {
  if (typeof data === 'object' && data !== null && 'email' in data) {
    return (data as { email: string }).email
  }
  throw new UserError('INVALID_DATA', 'Invalid user data')
}
```

```typescript
// ❌ 绝对禁止: 对象突变
function updateUser(user: User, name: string): User {
  user.name = name  // MUTATION! BLOCKED BY CI
  return user
}

// ✅ 正确: 不可变更新
function updateUser(user: Readonly<User>, name: string): User {
  return { ...user, name }
}
```

```typescript
// ❌ 绝对禁止: 静默吞异常
try {
  await riskyOperation()
} catch (e) {}  // SILENT SWALLOW! BLOCKED BY CI

// ✅ 正确: 显式错误处理
try {
  await riskyOperation()
} catch (e: unknown) {
  logger.error({ err: e }, 'riskyOperation failed')
  throw new UserError('OPERATION_FAILED', 'Operation failed, please retry')
}
```

### 4.3 函数与文件尺寸

| 指标 | 最大值 | 超出处理方式 |
|------|--------|-------------|
| 函数行数 | 50 行 | 提取子函数 |
| 文件行数 | 800 行 | 拆分模块 |
| 嵌套深度 | 4 层 | 使用早期返回 |

> **来源**: conventions.md §代码质量

### 4.4 输入验证

所有系统边界必须使用 Zod 验证：

```typescript
// ✅ 正确: Zod schema 定义 + 类型推导
import { z } from 'zod'

export const CreateUserSchema = z.object({
  email: z.string().email('邮箱格式不正确'),
  name: z.string().min(1).max(100),
  roleId: z.string().uuid(),
})

export type CreateUserInput = z.infer<typeof CreateUserSchema>

// 在路由处理器中
async function createUserHandler(req: FastifyRequest) {
  const input = CreateUserSchema.parse(req.body)  // 快速失败
  // ...
}
```

> **来源**: TS coding-style.md §Input Validation、conventions.md §输入验证

---

## 5. Git 分支策略

> **来源**: git-workflow.md、development-workflow.md

### 5.1 分支模型

```
main
  │
  ├── feat/phase1a-kernel        # Person A: 内核骨架 + CLI + 迁移
  ├── feat/phase1a-plugin-fw     # Person B: 插件框架 + plugin-core
  ├── feat/phase1a-data-auth     # Person C: Schema + JWT + RBAC
  ├── feat/phase1a-admin-ui      # Person D: 管理 UI + i18n
  │
  └── bugfix/{short-description} # bug 修复分支
```

### 5.2 提交信息格式

```
<type>: <#module> <简短描述>

<可选正文: 说明为何这样实现、有何取舍>
```

允许的 type：

| type | 使用场景 |
|------|----------|
| `feat` | 新功能 |
| `fix` | bug 修复 |
| `refactor` | 重构，不改行为 |
| `test` | 添加/修改测试 |
| `docs` | 文档变更 |
| `chore` | 构建/CI/工具 |
| `perf` | 性能优化 |

示例：

```
feat: #6 实现 PluginManager.discover() + manifest.yaml 验证

- 支持从 plugins/ 目录递归发现 manifest.yaml
- 使用 js-yaml 解析，Zod schema 验证必填字段
- 缺失 name/version 时拒绝加载
- 添加单元测试覆盖正常路径和错误路径
```

```
test: #7 添加 JWT refresh token 轮转测试

- 覆盖 refresh token 单次使用后失效
- 覆盖过期 refresh token 返回 401
```

### 5.3 PR 流程

```markdown
## PR 标题: <type>(<#module>): <描述>

### 变更内容
- 实现了什么功能/修复了什么问题
- 涉及的文件和模块

### 测试计划
- [ ] 单元测试已通过
- [ ] 集成测试已通过
- [ ] 覆盖率 >= 80%
- [ ] lint + type-check 通过

### 验收要点
- 参考 phase-planning.md 对应模块验收标准
- 列出已通过和暂未通过的验收项

### 破坏性变更
- 是否有 Breaking Change
- 是否需要下游模块配合修改
```

### 5.4 合并规则

- 每个 PR 必须通过全部 CI 门禁
- 至少 1 人 Code Review 通过
- 使用 Squash Merge 保持 main 分支历史干净
- 合并后删除 feature 分支

---

## 6. 测试金字塔

> **来源**: testing.md、conventions.md §TDD 测试计划格式、phase-planning.md §Week 0

### 6.1 四层测试结构

```
         ╱  E2E ╲          少量（5-10 条/模块）
        ╱  Contract ╲      适量（10-20 条/模块）
       ╱  Integration ╲    较多（20-40 条/模块）
      ╱    Unit Test    ╲  大量（40-80 条/模块）
```

### 6.2 各层详述

| 层 | 工具 | 覆盖内容 | 运行频率 | 目标数量 |
|------|------|----------|----------|----------|
| **Unit** | vitest | 纯函数、工具函数、组件渲染 | 每次文件变更 | 40-80 / 模块 |
| **Integration** | vitest + supertest | API 端点、DB 操作、中间件链 | 每次 commit | 20-40 / 模块 |
| **Contract** | vitest + Zod | API 请求/响应格式、状态码、错误格式 | 每日 | 10-20 / 模块 |
| **E2E** | Playwright | 关键用户流程（安装插件→管理用户→查看日志） | PR 合并前 | 5-10 / 全套 |

### 6.3 各模块测试策略

| 模块 | 测试重点 | 特殊要求 |
|------|----------|----------|
| #1 内核骨架 | 路由注册、/health 端点、DB 连通性 | 需要 Docker Compose PostgreSQL |
| #2 DB Schema | DDL 执行、索引策略、外键约束 | 使用 test-seed-strategy.md 种子工厂 |
| #3 CLI | 命令解析、退出码、stdout 输出 | 使用 execa 测试 CLI 命令 |
| #5 迁移管理 | 三阶段执行顺序、失败跳过、version_gated | 需要 migration_history 表 mock |
| #6 插件框架 | 插件发现、7 钩子链、manifest 验证、InlinePluginHost mock | JSON 序列化往返断言 |
| #7 JWT 认证 | token 签发/验证/过期/撤回、refresh 轮转 | 固定密钥测试 |
| #8 RBAC | 角色分配、权限检查、401/403 响应、审计关联 | 需要 UserRole mock |
| #9 多租户 | tenant_id 自动注入、跨租户隔离 | 验证 WHERE 子句 |
| #10 审计日志 | 写操作记录、字段完整性 | 需要 JWT + RBAC mock |
| #11 i18n 骨架 | t() 函数、useTranslation Hook、zh-CN 翻译 | 纯函数测试 |
| #12 管理 UI | 组件渲染、ACLGuard 可见性、ErrorBoundary 降级 | MockACLWrapper + renderWithProviders |

### 6.4 种子工厂使用

集成测试必须使用 `test-seed-strategy.md` 定义的种子工厂：

```typescript
// ✅ 正确: 使用种子工厂
import { createUser, createTenant } from '@audebase/test-utils'

test('用户只能看到自己租户的数据', async () => {
  // Arrange
  const tenantA = await createTenant({ name: 'Tenant A' })
  const tenantB = await createTenant({ name: 'Tenant B' })
  const userA = await createUser({ tenantId: tenantA.id })
  const userB = await createUser({ tenantId: tenantB.id })

  // Act
  const request = await app.inject({
    method: 'GET',
    url: '/api/users',
    headers: { Authorization: `Bearer ${generateToken(userA)}` },
  })

  // Assert
  const body = request.json()
  expect(body.data.every((u: any) => u.tenantId === tenantA.id)).toBe(true)
  expect(body.data.find((u: any) => u.id === userB.id)).toBeUndefined()
})
```

> **来源**: conventions.md §TDD 测试计划格式（种子工厂引用）

### 6.5 CI 测试命令

```bash
# Week 0 配置后，CI 运行以下命令：
npx vitest run --coverage            # 全部测试 + 覆盖率报告
npx tsc --noEmit                     # 类型检查
npx prettier --check .               # 格式检查
npx eslint .                         # Lint 检查
npx turbo build                      # 构建
```

> **来源**: phase-planning.md §Week 0 — GitHub Actions CI

---

## 7. Mock 约束

> **来源**: pitfalls.md §ProcessPluginHost mock 保真度、conventions.md §Mock 约束、decisions.md D1.2

### 7.1 ProcessPluginHost 五项强制约束

Phase 1a 使用 InlinePluginHost（同进程），但接口必须从 Day 1 模拟跨进程语义。所有 InlinePluginHost mock **必须**满足以下 5 项约束：

| # | 约束 | 要求 | 违反后果 |
|---|------|------|----------|
| C1 | **async Promise** | 所有方法返回 Promise，即使内部是同步实现 | Phase 2 需要重写所有调用方 |
| C2 | **JSON 序列化/反序列化** | 往返断言: `JSON.parse(JSON.stringify(params))` 前后参数不可变 | 丢失非 JSON-safe 类型（Date/Map/BigInt）|
| C3 | **30s 超时** | 所有调用受 AbortSignal / 定时器约束 | Phase 2 process 调用可能永久挂起 |
| C4 | **1-5ms 延迟注入** | 模拟跨进程网络延迟，测试必须以延迟为前提 | 竞态条件在 Phase 2 才暴露 |
| C5 | **延迟注入可切换** | `--strict-plugin-host` 标志开启/关闭延迟 | 单元测试不需要延迟，集成测试需要 |

### 7.2 Mock 实现示例

```typescript
// ✅ 正确: 满足 C1-C5 的 InlinePluginHost mock
class InlinePluginHost implements PluginHost {
  constructor(private options: { strictMode?: boolean } = {}) {}

  async call(method: string, params: unknown): Promise<unknown> {
    const TIMEOUT_MS = 30_000

    // C2: JSON 序列化往返断言
    if (this.options.strictMode) {
      const serialized = JSON.parse(JSON.stringify(params))
      if (JSON.stringify(serialized) !== JSON.stringify(params)) {
        throw new Error('C2 FAILED: params lost JSON roundtrip fidelity')
      }
    }

    // C4: 1-5ms 延迟注入
    if (this.options.strictMode) {
      await new Promise((r) => setTimeout(r, 1 + Math.random() * 4))
    }

    // C3: 30s 超时
    return withTimeout(this.executeMethod(method, params), TIMEOUT_MS)
  }

  private async executeMethod(method: string, params: unknown): Promise<unknown> {
    // 实际方法分发
    return this.handler(method, params)
  }
}

// C1: 所有方法返回 Promise
// 使用处:
const result = await host.call('db.find', { collection: 'users', id: '123' })
```

### 7.3 测试中启用/禁用延迟

```bash
# 单元测试（快速执行）
npx vitest run -- --plugin-host-mode=lax

# 集成测试（验证跨进程语义）
npx vitest run -- --plugin-host-mode=strict
```

### 7.4 Mock 验证断言

```typescript
test('InlinePluginHost 满足 C1-C5 约束', async () => {
  // Arrange
  const handler = vi.fn().mockResolvedValue({ id: '1', name: 'test' })
  const host = new InlinePluginHost({ strictMode: true, handler })

  // Act
  const start = Date.now()
  const result = await host.call('test.method', { data: { key: 'value' } })
  const elapsed = Date.now() - start

  // Assert
  // C1: await 正常工作 — 无断言需要，类型系统保证
  // C2: JSON 往返 — 测试本身验证
  // C3: 有超时保护 — handler 内部有 AbortSignal
  // C4: 延迟在 1-5ms 范围内
  expect(elapsed).toBeGreaterThanOrEqual(1)
  expect(elapsed).toBeLessThanOrEqual(20) // 预留 jitter 余量
  // C5: strictMode 控制延迟
  expect(result).toEqual({ id: '1', name: 'test' })
})
```

> **来源**: pitfalls.md §ProcessPluginHost mock 保真度、conventions.md §Mock 约束

---

## 8. 错误处理模式

> **来源**: conventions.md §错误处理、TS coding-style.md §Error Handling、decisions.md D8（Zod）、pitfalls.md §行业安全教训

### 8.1 错误层次体系

```
UserError          → 预期业务错误（输入验证、权限不足），返回 4xx
SystemError        → 系统级错误（DB 断连、配置缺失），返回 500
ValidationError    → Zod 验证错误，自动转换为 422
```

### 8.2 UserError 实现

```typescript
// shared-types/src/errors.ts
import { ErrorCode } from './error-codes'

export class UserError extends Error {
  public readonly code: ErrorCode
  public readonly statusCode: number
  public readonly details?: unknown

  constructor(code: ErrorCode, message: string, options?: {
    statusCode?: number
    details?: unknown
  }) {
    super(message)
    this.name = 'UserError'
    this.code = code
    this.statusCode = options?.statusCode ?? 400
    this.details = options?.details
  }
}

// 使用示例
import { UserError, ErrorCode } from '@audebase/shared-types'

// ❌ 错误: 使用通用 Error，无错误码
throw new Error('用户不存在')

// ✅ 正确: 使用 UserError，带错误码
throw new UserError(ErrorCode.USER_NOT_FOUND, '用户不存在', { statusCode: 404 })

// ✅ 正确: 在 Fastify 错误处理器中统一捕获
app.setErrorHandler((error, request, reply) => {
  if (error instanceof UserError) {
    return reply.status(error.statusCode).send({
      success: false,
      error: { code: error.code, message: error.message, details: error.details },
    })
  }

  // 未知错误：记录日志，返回通用消息
  request.log.error({ err: error }, 'Unhandled error')
  return reply.status(500).send({
    success: false,
    error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' },
  })
})
```

### 8.3 ErrorCode 枚举

```typescript
// shared-types/src/error-codes.ts
export enum ErrorCode {
  // Auth (AUTH_*)
  INVALID_TOKEN = 'AUTH_INVALID_TOKEN',
  TOKEN_EXPIRED = 'AUTH_TOKEN_EXPIRED',
  INVALID_CREDENTIALS = 'AUTH_INVALID_CREDENTIALS',
  FORBIDDEN = 'AUTH_FORBIDDEN',

  // Validation (VAL_*)
  VALIDATION_ERROR = 'VAL_VALIDATION_ERROR',
  INVALID_INPUT = 'VAL_INVALID_INPUT',

  // Resource (RES_*)
  NOT_FOUND = 'RES_NOT_FOUND',
  ALREADY_EXISTS = 'RES_ALREADY_EXISTS',
  CONFLICT = 'RES_CONFLICT',

  // Plugin (PLG_*)
  PLUGIN_NOT_FOUND = 'PLG_NOT_FOUND',
  PLUGIN_LOAD_FAILED = 'PLG_LOAD_FAILED',
  PLUGIN_DEPENDENCY_MISSING = 'PLG_DEPENDENCY_MISSING',
  MANIFEST_INVALID = 'PLG_MANIFEST_INVALID',

  // System (SYS_*)
  INTERNAL_ERROR = 'SYS_INTERNAL_ERROR',
  DATABASE_ERROR = 'SYS_DATABASE_ERROR',
  EXTERNAL_SERVICE_UNAVAILABLE = 'SYS_EXTERNAL_SERVICE_UNAVAILABLE',

  // Rate Limit (RATE_*)
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',

  // User (USR_*)
  USER_NOT_FOUND = 'USR_NOT_FOUND',
  USER_ALREADY_EXISTS = 'USR_ALREADY_EXISTS',
}
```

> **来源**: decisions.md D8（Zod 边界验证）、AGENTS.md（api-conventions.md §11 错误处理）

### 8.4 pino 结构化日志

```typescript
// ✅ 正确: 使用 pino 结构化日志
import logger from '@audebase/logging'

// 信息日志
logger.info({ userId, action: 'user.login' }, '用户登录成功')

// 错误日志（附加错误对象）
logger.error({ err: error, requestId }, '数据库查询失败')

// 带结构化上下文
logger.warn({
  module: 'plugin-framework',
  pluginName: 'erp',
  duration: 3500,
  threshold: 3000,
}, '插件加载超过阈值')

// ❌ 错误: 使用 console.log
console.log('用户登录成功', userId)  // BLOCKED BY CI
```

### 8.5 X-Request-ID 自动注入

```typescript
// 在 Fastify 插件中
import fp from 'fastify-plugin'
import { randomUUID } from 'node:crypto'

export default fp(async function requestIdPlugin(fastify) {
  fastify.addHook('onRequest', async (request, reply) => {
    const requestId = request.headers['x-request-id'] as string || randomUUID()
    request.id = requestId
    reply.header('X-Request-ID', requestId)
  })
})
```

### 8.6 安全错误处理原则

| 原则 | 说明 | 参考 |
|------|------|------|
| 不泄露内部细节 | 500 错误不返回堆栈 | TS coding-style.md |
| JWT 密钥启动校验 | `assert(process.env.AUDE_JWT_SECRET.length >= 32)` | pitfalls.md §CVE-2025-13877 |
| 输入验证即安全 | Zod schema 验证所有边界输入 | conventions.md §输入验证 |
| 速率限制响应 | 429 + `Retry-After` 头 | phase-planning.md #14 |

---

## 9. 模块实现顺序

> **来源**: phase-planning.md §依赖关系图 + §Phase 1a 4 人并行分工

### 9.1 依赖关系图

```
Week 0 (Turborepo + CI + Docker + shared-types)
  │
  ├─→ #1 内核骨架 (Fastify + Drizzle ORM)
  │     │
  │     ├─→ #2 DB Schema (DDL — Person C 启动)
  │     │     │
  │     │     ├─→ #4 plugin-core Bootstrap (Person B)
  │     │     ├─→ #5 迁移管理 (Person A 继续)
  │     │     ├─→ #7 JWT 认证 (Person C)
  │     │     │     │
  │     │     │     └─→ #8 基础 RBAC (Person C)
  │     │     │           │
  │     │     │           ├─→ #11 i18n 骨架 (Person D)
  │     │     │           └─→ #12 管理 UI (Person D)
  │     │     │
  │     │     ├─→ #9 多租户骨架 (Person C)
  │     │     └─→ #10 审计日志 (Person C)
  │     │
  │     ├─→ #13 日志/调试 (Person A 串行)
  │     ├─→ #14 速率限制 (Person A 串行)
  │     └─→ #15 API 规范与约定 (Person A 串行 → 文档)
  │
  └─→ #6 插件框架 (Person B — 与 #2 并行)
```

### 9.2 Person A — Kernel & CI 串行步骤

```
Week 0 ─→ shared-types ─→ #1 内核骨架 ─→ #13 日志/调试 ─→ #5 迁移管理 ─→ #3 CLI ─→ #14 速率限制
```

| 步骤 | 模块 | 关键交付 | 验收标准 |
|------|------|----------|----------|
| 0 | Week 0 | Turborepo + CI + Docker + shared-types | CI 通过 |
| 1 | #1 内核骨架 | Fastify 应用、DB 连接、/health 端点 | `GET /health` 返回 ok |
| 2 | #13 日志/调试 | pino 配置、X-Request-ID、`GET /api/logs` | JSON 日志格式正确 |
| 3 | #5 迁移管理 | migration_history 表、三阶段引擎、version_gated | 迁移执行顺序正确 |
| 4 | #3 CLI | `aude dev`, `aude db:migrate`, `aude plugin:create` | 三个命令可用 |
| 5 | #14 速率限制 | @fastify/rate-limit、per-IP、/auth/login 5/min | 超限返回 429 |
| 6 | #15 API 规范 | api-specification.md + api-conventions.md 文档 | 文档审核通过 |

### 9.3 Person C — Data & Auth 并行步骤

```
┌→ #2 DB Schema (DDL)
│     │
│     ├─→ #7 JWT 认证 ─→ #8 RBAC
│     │
│     ├─→ #9 多租户骨架
│     └─→ #10 审计日志
```

Person C 的 #7、#9、#10 可并行开发（均依赖 #2），#8 依赖 #7。

### 9.4 Person B — Plugin Framework 步骤

```
等待 #2 DB Schema ─→ #6 插件框架 (PluginManager + InlinePluginHost + manifest) ─→ #4 plugin-core Bootstrap
```

| 步骤 | 模块 | 关键交付 |
|------|------|----------|
| 1 | #6 插件框架 | PluginManager.discover()、load()、7 钩子链、InlinePluginHost |
| 2 | #4 plugin-core Bootstrap | admin 用户、默认角色、系统租户、核心权限、默认菜单 |

### 9.5 Person D — Admin UI 步骤

```
等待 #1 + #7 + #8 ─→ #11 i18n 骨架 ─→ #12 管理 UI
```

| 步骤 | 模块 | 关键交付 |
|------|------|----------|
| 1 | #11 i18n | Core t()、useTranslation Hook、zh-CN 翻译文件 |
| 2 | #12 管理 UI | ProLayout 骨架、Provider Stack、插件管理页、用户管理页、ACLGuard、ErrorBoundary |

### 9.6 关键里程碑

| 里程碑 | 完成条件 | 预计时间 |
|--------|----------|----------|
| M0: 基础设施就绪 | CI 通过、Docker Compose 启动、shared-types 导出 | Week 0 结束 |
| M1: 内核就绪 | /health 返回 ok、CLI 命令可用、日志输出正常 | Week 1 结束 |
| M2: 认证就绪 | 登录/刷新/注销流程完整、RBAC 中间件生效 | Week 2 结束 |
| M3: 插件框架就绪 | 插件可发现、加载、启用/禁用 | Week 3 结束 |
| M4: 管理 UI 就绪 | ProLayout 显示、插件管理页和用户管理页可用 | Week 4 结束 |
| M5: 端到端验收 | 安装插件→管理用户→查看日志 E2E 通过 | Week 5-6 结束 |

---

## 10. 常见坑点与反模式

> **来源**: pitfalls.md（全部章节）

### 10.1 TypeScript 反模式

#### 🚫 反模式: 使用 `as any` 绕过类型系统

```typescript
// ❌ 反模式
const result = await api.call('db.find', { id }) as any
return result.map(...)

// ✅ 正确做法
interface User { id: string; name: string }
const result = await api.call('db.find', { id }) as unknown as User[]
```

#### 🚫 反模式: 使用 `console.log` 调试

```typescript
// ❌ 反模式
console.log('user data:', user)  // CI WILL BLOCK

// ✅ 正确做法
logger.debug({ userId: user.id }, '获取用户数据')
```

#### 🚫 反模式: 静默吞异常

```typescript
// ❌ 反模式
try {
  await riskyOp()
} catch (e) {}  // SILENT SWALLOW

// ✅ 正确做法
try {
  await riskyOp()
} catch (e: unknown) {
  logger.error({ err: e }, 'riskyOp failed')
  throw new UserError(ErrorCode.INTERNAL_ERROR, '操作失败')
}
```

#### 🚫 反模式: 对象突变

```typescript
// ❌ 反模式
config.plugins.push(newPlugin)  // MUTATION
config.mode = 'production'      // MUTATION

// ✅ 正确做法
const newConfig = {
  ...config,
  plugins: [...config.plugins, newPlugin],
  mode: 'production',
}
```

### 10.2 插件架构反模式

#### 🚫 反模式: 插件直连数据库

```typescript
// ❌ 反模式: 绕过 Core API 代理
const result = await db.query('SELECT * FROM users WHERE id = $1', [id])

// ✅ 正确做法: 通过 Core 数据 API
const result = await this.app.db.find('users', { id })
```

> **参考**: pitfalls.md §Core API 代理绕过、NocoBase CVE GHSA-v8vm-cqh8-q87q

#### 🚫 反模式: 忽略 JSON 序列化约束

```typescript
// ❌ 反模式: 传递 Date 对象，Phase 2 会静默丢失
await host.call('order.create', { createdAt: new Date() })

// ✅ 正确做法: 始终使用 JSON-safe 类型
await host.call('order.create', { createdAt: new Date().toISOString() })
```

#### 🚫 反模式: 层级分组命名歧义

```typescript
// ❌ 反模式: 使用 isolation/group
manifest: { isolation: 'process', group: 'erp' }

// ✅ 正确做法: 使用 mode/partition
manifest: { runtime: { mode: 'inline', partition: 'erp' } }
```

> **来源**: pitfalls.md §层级分组命名

### 10.3 前端反模式

#### 🚫 反模式: 动态 import 包装

```typescript
// ❌ 反模式: async 包装破坏 code splitting
router.add('admin.erp.dashboard', {
  component: async () => { return await import('./Dashboard') }
})

// ❌ 反模式: React.lazy 包装导致运行时崩溃
router.add('admin.erp.dashboard', {
  component: React.lazy(() => import('./Dashboard'))
})

// ✅ 正确做法: 直接箭头函数返回 import()
router.add('admin.erp.dashboard', {
  component: lazy: () => import('./Dashboard')
})
```

> **来源**: pitfalls.md §动态 import() 签名反模式、decisions.md D22

#### 🚫 反模式: 租户切换客户端 navigate

```typescript
// ❌ 反模式: CWE-524 信息泄露风险
queryClient.clear()
navigate(`/${newTenantId}/admin`)  // 旧缓存可能闪现

// ✅ 正确做法: 全页重载
onlineManager.setOnline(false)
queryClient.clear()
window.location.href = `/${newTenantId}/admin`
```

> **来源**: pitfalls.md §租户切换 CWE-524 信息泄露

#### 🚫 反模式: 内联权限判断

```tsx
// ❌ 反模式: 内联条件判断
{user.role === 'admin' && <DeleteButton />}

// ✅ 正确做法: 声明式 ACLGuard
<ACLGuard action="delete" resource="user">
  <DeleteButton />
</ACLGuard>

// 或在 Hook 中
const { can } = useACL()
{can('delete', 'user') && <DeleteButton />}
```

> **来源**: conventions.md §前端特定规范

### 10.4 测试反模式

#### 🚫 反模式: 无 AAA 结构

```typescript
// ❌ 反模式: 无 Arrange/Act/Assert
test('test auth', async () => {
  const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'a@b.com', password: '123' } })
  expect(res.statusCode).toBe(200)
  expect(res.json().accessToken).toBeDefined()
})

// ✅ 正确做法: 三段式
test('POST /api/auth/login 返回 access token 当凭据有效时', () => {
  // Arrange
  const credentials = { email: 'admin@audebase.com', password: 'correct-password' }

  // Act
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: credentials,
  })

  // Assert
  expect(response.statusCode).toBe(200)
  expect(response.json()).toHaveProperty('accessToken')
  expect(response.json()).toHaveProperty('refreshToken')
})
```

#### 🚫 反模式: 测试依赖共享状态

```typescript
// ❌ 反模式: 测试间共享变量
let userId: string

test('create user', async () => {
  const user = await createUser()
  userId = user.id  // 副作用泄漏到下一个测试
})

test('get user', async () => {
  const user = await getUser(userId)  // 依赖前一个测试
})

// ✅ 正确做法: 每个测试自给自足
test('create user 创建用户并返回 id', async () => {
  const user = await createUser({ name: 'test' })
  expect(user.id).toBeDefined()
})

test('getUser 返回用户当 id 存在时', async () => {
  const created = await createUser({ name: 'test' })  // 自己创建
  const user = await getUser(created.id)
  expect(user.name).toBe('test')
})
```

> **来源**: conventions.md §TDD 测试计划格式（种子工厂 + transaction rollback）

### 10.5 构建与工具链反模式

#### 🚫 反模式: Drizzle 版本未锁定

```json5
// ❌ 反模式: 宽松版本范围
"drizzle-orm": "^0.45.0"

// ✅ 正确做法: 精确版本锁定
"drizzle-orm": "0.45.3"
"drizzle-kit": "0.30.0"
```

> **来源**: pitfalls.md §Drizzle pre-1.0 风险、decisions.md D9

#### 🚫 反模式: JWT 密钥使用默认值

```typescript
// ❌ 反模式: 默认密钥（CVE-2025-13877 漏洞）
const SECRET = process.env.AUDE_JWT_SECRET || 'default-secret-key'

// ✅ 正确做法: 启动校验
import assert from 'node:assert'
assert(
  process.env.AUDE_JWT_SECRET?.length >= 32,
  'AUDE_JWT_SECRET 必须 >= 32 字符，拒绝默认值'
)
```

> **来源**: pitfalls.md §CVE-2025-13877

### 10.6 流程反模式

#### 🚫 反模式: SDD 未完成即开始编码

```markdown
# ❌ 反模式: "先写着，接口慢慢定"
- 编码到一半发现需要改 SharedTypes → 下游模块阻塞
- 测试不知测什么接口 → 覆盖率虚高但无意义

# ✅ 正确做法: SDD 先行，接口锁定后再编码
1. 写 SDD 文档（8 节）
2. 在 shared-types 中定义接口
3. Lead review SDD
4. 开始 TDD 编码
```

#### 🚫 反模式: 忽略文档同步

```markdown
# ❌ 反模式: 代码合了就完事
- AGENTS.md 的 CODEMAP 还是旧的
- .agents/memorys/status.md 没更新
- 下一个 AI session 不知道模块已实现

# ✅ 正确做法: 编码完成 = 代码 + 文档同步
1. git commit
2. 更新 .agents/memorys/status.md（模块状态 ✅）
3. 更新 AGENTS.md（CODEMAP 中标记编码状态 ✅）
```

> **来源**: decisions.md G5（文档同步作为 definition of done）

---

## 附录 A: 快速参考

### A.1 周报模板

```markdown
## Phase 1a 周报 — W# {周数}

### 完成项
- [模块 #X] 功能描述（链接到 PR）
- [模块 #Y] 功能描述

### 进行中
- [模块 #Z] 剩余工作
- 阻塞项: {描述}（需要 lead 协调）

### 下周计划
- [模块 #X] 下一步
- [模块 #Y] 启动

### 覆盖率
- 模块 X: {覆盖率}%
- 模块 Y: {覆盖率}%
```

### A.2 常用命令

```bash
# 开发
aude dev                    # 启动开发服务器
aude db:migrate             # 执行数据库迁移
aude db:migrate --dry-run   # 预检迁移（CI 中使用）
aude plugin:create <name>   # 生成插件骨架

# 测试
npx vitest run              # 运行全部测试
npx vitest run --coverage   # 运行测试 + 覆盖率
npx vitest watch            # watch 模式
npx vitest run -- --plugin-host-mode=strict  # 严格模式

# 质量
npx tsc --noEmit            # 类型检查
npx eslint .                # Lint
npx prettier --check .      # 格式检查
npx turbo build             # 构建

# Git
git checkout -b feat/phase1a-{track}-{module}
git commit -m "feat: #模块 描述"
git push -u origin HEAD
```

### A.3 安全速查

```bash
# 每次 commit 前（环境变量安全）
grep -rn 'process.env\.' packages/ --include='*.ts' | grep -v 'AUDE_'

# 检查无默认密钥
grep -rn 'default.*secret\|default.*key\|default.*password' packages/ --include='*.ts'

# 检查无 console.log
grep -rn 'console\.log' packages/ --include='*.ts'

# MODACS 残留检查
grep -ri 'modacs' . --exclude-dir=.git --exclude-dir=.sisyphus --exclude-dir=node_modules
```

### A.4 文档索引

| 文档 | 用途 |
|------|------|
| `docs/phase-planning.md` | 模块清单、分工、依赖图、验收标准 |
| `docs/architecture.md` | 系统架构全景 |
| `docs/modules/*-sdd.md` | 各模块 SDD 规格 |
| `docs/modules/*-tdd.md` | 各模块 TDD 测试计划 |
| `docs/modules/database-schema.md` | 11 张表 DDL |
| `docs/modules/api-specification.md` | 19 个端点规范 |
| `docs/modules/api-conventions.md` | 分页/过滤/排序/错误约定 |
| `docs/modules/test-seed-strategy.md` | 种子工厂策略 |
| `docs/modules/e2e-test-flows.md` | 5 核心 E2E 流程 |
| `.agents/memorys/status.md` | 项目状态 |
| `.agents/memorys/decisions.md` | 架构决策记录 |
| `.agents/memorys/conventions.md` | 编码约定 |
| `.agents/memorys/pitfalls.md` | 已知坑点 |

---

> **文档版本**: v1.0  
> **最后更新**: 2026-07-13  
> **责任人**: execution-writer — Phase 1a 执行方法论