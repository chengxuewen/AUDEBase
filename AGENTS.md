# AGENTS.md — AUDEBase Project Knowledge Base

**Generated:** 2026-07-23
**Commit:** `67caf84`
**Branch:** `main`
**Strategy:** Refine + ProLayout 混合前端 + 自建 15 包底座 — D26（D25 NocoBase 方案已废弃）

## OVERVIEW

AUDEBase — 企业应用开发平台。原为微内核 + 插件热插拔架构（28 packages, 42K 行代码），对标 Odoo、NocoBase。2026-07-23 决策（D26）：放弃 Fork NocoBase，前端采用 Refine 数据层 + ProLayout 外壳 + 自建 Schema→UI 映射器，后端裁剪为 15 包底座（Fastify + Drizzle + PostgreSQL）。四层信任分组因 NocoBase 架构限制搁置评估。

## STRUCTURE

```
AUDEBase/
├── .opencode/          # OpenCode 配置（插件、MCP、LSP、instructions）
│   ├── opencode.json   # 主配置：模型、插件、instructions、MCP、LSP
│   ├── agent-guide.md  # AI 代理使用指南（5 层模型体系、OMO 编排）
│   ├── run-node.sh      # MCP/LSP node 包装器（pixi 环境路径解析）
│   ├── agent-model-tiers.md # 模型层级定义文档
│   ├── oh-my-openagent.jsonc # OMO Agent 模型分配配置
│   ├── init-lsp-wrap.mjs # LSP 包装器初始化脚本
│   └── init-mcp-*.mjs  # 6 个 MCP 自动安装脚本（codegraph/antd/drizzle/playwright/openspace/postgres）
├── .agents/
│   ├── rules/          # 84 个编码规则文件（12 语言+common+中文副本）
│   ├── skills/         # 13 个技能（design-system + 8 openspec-* + doc-audit + book-to-skill + test-harness + skill-creator）
│   └── memorys/        # 4 个项目记忆文件（status/conventions/decisions/pitfalls）
├── docs/
│   ├── architecture.md # 架构文档（14 章节，D26 Refine+ProLayout 混合架构）
│   ├── analysis/       # 竞品调研 + 插件架构分析
│   │   ├── competitive-landscape.md # 39+ 产品竞品调研报告
│   │   ├── plugin-architecture-analysis.md # 四层信任分组深度分析
│   ├── archive/        # 已归档自建架构文档（28 包 SDD/TDD + 设计）
│   ├── guides/         # 快速上手指南
│   ├── modules/        # 活跃参考文档（DB Schema / API / 工作流 / 测试）
│   ├── reference/      # 15 份竞品详细画像
│   ├── superpowers/    # 设计规范与实施计划
│   │   └── specs/
│   │       └── 2026-07-23-refine-hybrid-architecture-design.md  # D26 架构设计
├── package.json        # pnpm workspace 根配置
├── pixi.toml           # Pixi 环境配置（runtime/dev/test 分层）
├── scripts/            # 部署/构建脚本目录
├── SKILL.md            # 技能注册表（superpowers + 项目专属 + agents）
├── README.md           # 项目简介
├── LICENSE             # Apache 2.0
└── .gitignore          # 排除 .sisyphus/
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| 项目状态和阶段 | `.agents/memorys/status.md` | 模块状态表、已知缺失、近期工作 |
│ 架构决策 | `.agents/memorys/decisions.md` | D1-D26 + G1-G5
| 编码约定 | `.agents/memorys/conventions.md` | 命名、不可变性、TS 规范 |
| 已知坑点 | `.agents/memorys/pitfalls.md` | MODACS 适配 + 技术栈 + 行业 CVE 教训 |
| 语言规则 | `.agents/rules/{lang}/` | 各语言专属规则 |
| Agent 配置 | `.opencode/opencode.json` | instructions、MCP、LSP |
| Agent 使用指南 | `.opencode/agent-guide.md` | OMO 编排体系、5 层模型路由 |
| 技能注册表 | `SKILL.md` | superpowers + 项目专属技能清单 |
│ 架构文档 | `docs/architecture.md` | 含 MVP 验收标准、Phase 1a/1b 五阶段路线图
│ D26 实施计划 | `docs/superpowers/plans/2026-07-23-refine-hybrid-implementation-plan.md` | Refine 数据层 + ProLayout 外壳 + Schema→UI 映射器
| 插件架构分析 | `docs/analysis/plugin-architecture-analysis.md` | 四层信任分组 + 通信 + 安全 + 生命周期
| 竞品调研 | `docs/analysis/competitive-landscape.md` | 39+ 产品，五大分类
| 竞品参考 | `docs/reference/` | 15 份详细产品画像（Odoo/NocoBase/ERPNext 等）|
| 数据库 Schema | `docs/modules/database-schema.md` | 11 张表 DDL + 表关系 + 索引策略 |
| API 规范 | `docs/modules/api-specification.md` | 19 个端点请求/响应格式 |
| API 约定 | `docs/modules/api-conventions.md` | 分页/过滤/排序/错误/速率限制 |
│ SDD/TDD 文档 | `docs/archive/*-sdd.md` / `*-tdd.md` | 自建架构 28 包设计参考（已归档）
│ 开发工作流 | `docs/modules/dev-workflow.md` | Monorepo + CLI + --watch + 测试策略
| 通用规则 | `.agents/rules/common/` | 安全、编码风格、测试、Git 工作流 |
| 安全规则 | `.agents/rules/common/security.md` | Secret management、XSS、CSRF |

## AI-DRIVEN SDD/TDD 工作流

AUDEBase 从 Phase 1a 起采用 AI-Driven SDD + TDD 工作流。每个模块进入编码前需完成 SDD 文档定义，所有测试计划遵循 AAA 格式。

### 工作流步骤

1. **SDD 先行**: 模块在编码前由 AI 代理生成 SDD 文档，明确接口契约、生命周期、依赖关系。
2. **TDD 编码**: RED → GREEN → IMPROVE 循环，SDD 定义的 API 先写测试再实现。
3. **SDD 即契约**: SDD 与实现代码以接口/API/生命周期为契约，CI 集成测试验证一致性。
4. **文档同步更新**: 编码完成后同步更新 .agents/memorys/ 和 AGENTS.md，保持 AI 工作流知识一致性。

### Phase 1a 模块 SDD 文档索引

│ 模块 | SDD 文档 | TDD 文档 | 状态 | 依赖
│------|----------|----------|------|------
│ shared-types | docs/archive/shared-types-sdd.md | docs/archive/shared-types-tdd.md | 📋 SDD+TDD 完成 | 无（Week 0）
│ plugin-framework | docs/archive/plugin-framework-sdd.md | docs/archive/plugin-framework-tdd.md | 📋 SDD+TDD 完成 | 无
│ plugin-core (Bootstrap) | docs/archive/plugin-core-sdd.md | docs/archive/plugin-core-tdd.md | 📋 SDD+TDD 完成 | plugin-framework
│ manifest-engine | docs/archive/manifest-engine-sdd.md | docs/archive/manifest-engine-tdd.md | 📋 SDD+TDD 完成 | plugin-framework
│ migration-engine | docs/archive/migration-engine-sdd.md | docs/archive/migration-engine-tdd.md | 📋 SDD+TDD 完成 | 无
│ RBAC 权限引擎 | docs/archive/rbac-sdd.md | docs/archive/rbac-tdd.md | 📋 SDD+TDD 完成 | shared-types
│ 审计日志 | docs/archive/audit-sdd.md | docs/archive/audit-tdd.md | 📋 SDD+TDD 完成 | shared-types
│ 健康检查 | docs/archive/health-check-sdd.md | docs/archive/health-check-tdd.md | ✅ SDD+TDD 完成 | 无
│ i18n 国际化 | docs/archive/i18n-sdd.md | docs/archive/i18n-tdd.md | 📋 SDD+TDD 完成 | 无
│ 管理 UI | docs/archive/admin-ui-sdd.md | docs/archive/admin-ui-tdd.md | ✅ SDD+TDD 完成 | shared-types
│ 日志/调试 | docs/archive/logging-infra-sdd.md | docs/archive/logging-infra-tdd.md | ✅ SDD+TDD 完成 | 无
│ Core 内核骨架 | docs/archive/core-sdd.md | ✅ core-tdd.md | ✅ SDD 完成 | shared-types
│ JWT 认证 | docs/archive/auth-sdd.md | ✅ auth-tdd.md | ✅ SDD 完成 | shared-types
│ CLI 工具 | docs/archive/cli-sdd.md | ✅ cli-tdd.md | ✅ SDD 完成 | 无
│ 速率限制 | docs/archive/rate-limit-sdd.md | ✅ rate-limit-tdd.md | ✅ SDD 完成 | 无

> ⚠️ **归档说明**: 以上 SDD/TDD 文档为 2026-07-17 自建 28 包架构设计参考，已归档至 `docs/archive/`。当前 D26（Refine+ProLayout+15包底座）实施计划见 `docs/superpowers/plans/2026-07-23-refine-hybrid-implementation-plan.md`。
### TDD 测试计划格式要求

- **AAA 结构**: 所有测试用例遵循 Arrange-Act-Assert 三段式。
- **测试文件命名**: `{module}.test.ts`（单元测试）/ `{module}.spec.ts`（E2E 测试）。
- **覆盖率**: 80% 最低覆盖率，CI 集成覆盖率闸门（见 dev-workflow.md）。
- **种子工厂**: 集成测试使用 test-seed-strategy.md 定义的 seed factory。
- **Mock 约束**: ProcessPluginHost mock 必须满足 5 项约束（async Promise、JSON 序列化/反序列化、30s 超时、延迟注入）。

## MODULE DOCUMENTATION INDEX

_自建架构设计文档已归档至 `docs/archive/`。以下为仍活跃的通用参考文档。_

> ⚠️ **归档说明**: 以上 SDD/TDD 文档为 2026-07-17 自建 28 包架构设计参考，已归档至 `docs/archive/`。当前 D26（Refine+ProLayout+15包底座）实施计划见 `docs/superpowers/plans/2026-07-23-refine-hybrid-implementation-plan.md`。

| 文档 | 类型 | 对应模块 | 决策编号 | 状态 |
|------|------|----------|---------|------|
| `database-schema.md` | 设计 | 11 张表 DDL + 索引策略 | D9.1/D10 | ✅ 已完成 |
| `api-specification.md` | 设计 | 19 个端点请求/响应格式 | D1.8 | ✅ 已完成 |
| `api-conventions.md` | 设计 | 分页/过滤/排序/错误/速率限制 | — | ✅ 已完成 |
| `dev-workflow.md` | 工作流 | Monorepo + CLI + TDD + 测试策略 | — | ✅ 已完成 |
| `test-seed-strategy.md` | 测试 | 种子工厂 + transaction rollback | — | ✅ 已完成 |
| `redis-mock-guide.md` | 测试 | ioredis-mock + BullMQ testMode | D1.10 | ✅ 已完成 |

### 已归档设计文档

| 文档 | 路径 | 类型 |
|------|------|------|
| 插件框架 | `docs/archive/plugin-framework.md` | 设计 |
| 插件通信 | `docs/archive/plugin-communication.md` | 设计 |
| 多租户 | `docs/archive/multi-tenant.md` | 设计 |
| Admin UI | `docs/archive/frontend-spec.md` | 设计 |
| 文件存储 | `docs/archive/file-upload-sdd.md` | 设计 |
| plugin-development | `docs/archive/plugin-development.md` | 指南 |
| 28 包 SDD/TDD | `docs/archive/*-sdd.md` / `*-tdd.md` (51 文件) | 参考 |

## CODE MAP
_28 包全部实现（插件市场除外），102 测试文件，tsc 全包 clean。D26 重构中——管理 UI 迁移至 Refine，后端裁剪至 15 包底座。_

| 模块 | 状态 | 规划路径 | SDD | TDD |
|------|------|----------|-----|-----|
| 插件框架 | ✅ Phase 1a | `packages/plugin-framework/` - D1.1-D1.4 | ✅ plugin-framework-sdd.md | ✅ plugin-framework-tdd.md |
| plugin-core (Bootstrap) | ✅ Phase 1a | `packages/plugin-core/` - 内核插件，零依赖（D1.6） | ✅ plugin-core-sdd.md | ✅ plugin-core-tdd.md |
| manifest.yaml 系统 | ✅ Phase 1a | `packages/manifest-engine/` - D1.5 | ✅ manifest-engine-sdd.md | ✅ manifest-engine-tdd.md |
| RBAC 权限引擎 | ✅ Phase 1a | `packages/rbac/` - 基础 tenant_id + 角色权限（D10） | ✅ rbac-sdd.md | ✅ rbac-tdd.md |
| 插件通信 | ✅ Phase 1b | `packages/plugin-communication/` - D1.3 | ❌ 待生成 | ❌ 待生成 |
| 审计日志 | ✅ Phase 1a | `packages/audit/` - D1.12 | ✅ audit-sdd.md | ✅ audit-tdd.md |
| 迁移管理 | ✅ Phase 1a | `packages/migration/` - D1.7 | ✅ migration-engine-sdd.md | ✅ migration-engine-tdd.md |
| 事件总线 | ✅ Phase 1b | `packages/event-bus/` - D1.9 | ✅ event-bus-sdd.md | ✅ event-bus-tdd.md |
| 文件上传 | ✅ Phase 1b | `packages/file-upload/` - FileUploadService + 内存 repo | ✅ file-upload-sdd.md | ✅ file-upload-tdd.md |
| Schema Engine | ✅ Phase 2 | `packages/schema-engine/` - D3/D7 | ✅ schema-engine-sdd.md | ✅ schema-engine-tdd.md |
| WebSocket | ✅ Phase 2 | `packages/websocket/` - D1.11 | ✅ websocket-sdd.md | ✅ websocket-tdd.md |
| 定时任务 (Cron) | ✅ Phase 1b | `packages/cron/` - BullMQ repeatable jobs（D1.10） | ✅ cron-sdd.md | ✅ cron-tdd.md |
| 通知系统 | ✅ Phase 1b 接口 | `packages/notification/` - NotificationProvider 抽象（D1.14） | ✅ notification-sdd.md | ✅ notification-tdd.md |
| API 版本控制 | ✅ Phase 1b | `packages/api-versioning/` - URL 路径版本（D1.8） | ✅ api-versioning-sdd.md | ✅ api-versioning-tdd.md |
| 插件间数据扩展 | ✅ Phase 1b | `packages/data-extends/` - extends 声明解析（D12.1） | ✅ data-extends-sdd.md | ✅ data-extends-tdd.md |
| 插件市场 | 🔲 Phase 2 | - | 🔲 待生成 | 🔲 待生成 |
| 工作流引擎 | ✅ Phase 4 | `packages/workflow-engine/` - D13 | 🔲 待生成 | 🔲 待生成 |
| 工作流核心 | ✅ Phase 4 | `packages/workflow-core/` - D13 | 🔲 待生成 | 🔲 待生成 |
| 工作流任务 | ✅ Phase 4 | `packages/workflow-tasks/` - D13 | 🔲 待生成 | 🔲 待生成 |
| shared-types | ✅ Phase 1a | `packages/shared-types/` - 公共类型定义 | ✅ shared-types-sdd.md | ✅ shared-types-tdd.md |
| 国际化 (i18n) | ✅ Phase 1a | `packages/i18n/` - D14 | ✅ i18n-sdd.md | ✅ i18n-tdd.md |
│ 管理 UI | 🔄 D26 重构中 | `packages/admin-ui/` - Refine + ProLayout + Schema→UI Mapper（D26） | ✅ admin-ui-sdd.md | ✅ admin-ui-tdd.md
| 健康检查 | ✅ Phase 1a | `packages/health-check/` - D1.13 | ✅ health-check-sdd.md | ✅ health-check-tdd.md |
| 日志/调试基础设施 | ✅ Phase 1a | `packages/logging-infra/` - 结构化日志 + Core 聚合 | ✅ logging-infra-sdd.md | ✅ logging-infra-tdd.md |
| Core 内核骨架 | ✅ Phase 1a | `packages/core/` - Fastify bootstrap + 中间件 + 配置（GO-021） | ✅ core-sdd.md | ✅ core-tdd.md |
| CLI 工具 | ✅ Phase 1a | `packages/cli/` - aude dev/db:migrate/plugin:create（GO-023） | ✅ cli-sdd.md | ✅ cli-tdd.md |
| JWT 认证 | ✅ Phase 1a | `packages/auth/` - JWT 签发/验证 + token_version（GO-022） | ✅ auth-sdd.md | ✅ auth-tdd.md |
| 速率限制 | ✅ Phase 1a | `packages/rate-limit/` - 固定窗口计数器限流 | ✅ rate-limit-sdd.md | ✅ rate-limit-tdd.md |
| 插件示例 | ✅ Phase 1a | `packages/plugin-example/` - 开发参考模板 | 🔲 待生成 | 🔲 待生成 |

### D26 15 包底座（2026-07-23 执行计划）

| 模块 | 状态 | 规划路径 | SDD | TDD |
|------|------|----------|-----|-----|
| canonical-schema | 🔲 Phase 2 | `packages/canonical-schema/` - D26 保留，改为 Drizzle 实现 | ✅ | ✅ |
| plugin-3d-printer | 🔲 Phase 1a | `packages/` (TBD) - 3D 打印机 MES MVP | ✅ | ✅ |


## D26 — Refine + ProLayout 混合架构

2026-07-23 决策：放弃 Fork NocoBase。前端 Refine + ProLayout + 自建 Schema→UI 映射器，后端 15 包底座。D25 废弃。

**保留 D25 子决策**：Agent HTTP polling、Canonical Schema 闸门 (Drizzle)、PostgreSQL 16、削减范围。
**保留包 (14)**：core, auth, rbac, schema-engine, plugin-framework, manifest-engine, migration, health-check, logging-infra, shared-types, i18n, audit, cli, rate-limit。
**砍/Phase 2 (11)**：event-bus, websocket, plugin-communication, api-versioning, data-extends, file-upload, workflow-*, notification, cron, plugin-example。

设计见 `docs/superpowers/specs/2026-07-23-refine-hybrid-architecture-design.md`。
实施见 `docs/superpowers/plans/2026-07-23-refine-hybrid-implementation-plan.md`。


## CONVENTIONS

### AUDEBase 独有

### npm scope

- **去 MODACS 化**: 保持零 MODACS 残留，每次修改后运行 `grep -ri modacs . --exclude-dir=.git --exclude-dir=.sisyphus`
- **精确编辑**: 不全局 MODACS→AUDEBase 替换，使用手术式编辑
- **架构骨架**: `docs/architecture.md` 14 章 1039 行，全部章节已展开，无 TODO 占位
- _*@modacs/* 移除_*: 移除所有 `@modacs/*` 引用，不自动替换为 `@AUDEBase/*`

### TypeScript

- 公共 API 显式类型注解
- `interface` 优先于 `type`（对象形状）
- `unknown` > `any`
- Zod 用于边界层模式验证
- 禁止 `as any` / `@ts-ignore` / `console.log`

### 通用

- 不可变性优先（永不突变，总是创建新副本）
- 小文件 > 大文件（200-400 行典型，800 行最大）
- 显式错误处理，无静默吞异常
- 布尔值前缀 `is`/`has`/`should`/`can`

## ANTI-PATTERNS (THIS PROJECT)

- **`as any` / `@ts-ignore`** — 永不使用，零例外
- **`console.log`** — 生产代码禁止
- **静默吞异常** — `catch(e) {}` 绝对不允许
- **对象突变** — 始终返回新对象，永不就地修改
- **全局 MODACS→AUDEBase 替换** — 使用精确的手术式编辑
- **硬编码密钥** — 使用环境变量或密钥管理器
- **不必要的文件写入** - 文档文件仅在用户明确要求时创建
- **纯展示按钮** - 无 `onClick` 的 `<Button>` 等同于死代码，禁止渲染
- **mock 替代真实 API** - 生产代码禁止 `ponytail: mock returns empty array`，必须调用后端 API
- **仅验证元素存在的测试** - 禁止 `expect(button).toBeTruthy()`，必须用 `fireEvent.click()` 验证交互行为

## NOTES

- **Phase 2 完成** — 28 包全部实现, 102 测试文件, tsc 全包 clean。工作流引擎 (Phase 4) 完成
- **D26 决策** — 2026-07-23 转向 Refine+ProLayout+自建15包底座，D25 NocoBase 方案已废弃。详见 `docs/superpowers/specs/2026-07-23-refine-hybrid-architecture-design.md`
- **从 MODACS 分离** - 2026-07-08 首次提交。无 MODACS 代码共享
- **.sisyphus/** 被 gitignore 排除 - 计划文件、审计报告暂存于此
- **双 package.json** - 根目录用 pnpm workspace，`.opencode/` 用独立 npm 包（插件系统）
- **test 基础设施** - vitest 3.0.5 + @testing-library/react 16.2.0 + @playwright/test 1.50.1 已安装。752 tests
- **Docker Compose** - docker-compose.yml 已创建（PostgreSQL 16 + Valkey 8）
- **认证修复** — GET /api/auth/me 端点 + 3 状态阻塞式认证 + verifyAccessToken 按 sub 过滤
