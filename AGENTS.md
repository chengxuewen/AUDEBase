# AGENTS.md — AUDEBase Project Knowledge Base

**Generated:** 2026-07-13
**Commit:** `a024b10`
**Branch:** `main`

## OVERVIEW
AUDEBase — 企业应用开发平台。微内核 + 插件热插拔架构，对标 Odoo、NocoBase、云表。当前 Phase 0 完成 — 34+29=63 项审计发现全部落实到文档，可进入 Phase 1a 编码。

## STRUCTURE
```
AUDEBase/
├── .opencode/          # OpenCode 配置（插件、MCP、LSP、instructions）
│   ├── opencode.json   # 主配置：模型、插件、instructions、MCP、LSP
│   ├── agent-guide.md  # AI 代理使用指南（5 层模型体系、OMO 编排）
│   ├── run-node.sh      # MCP/LSP node 包装器（pixi 环境路径解析）
│   ├── agent-model-tiers.md # 模型层级定义文档
│   ├── oh-my-openagent.jsonc # OMO Agent 模型分配配置
│   └── init-mcp-*.mjs  # 6 个 MCP 自动安装脚本（codegraph/antd/drizzle/playwright/openspace/postgres）
├── .agents/
│   ├── rules/          # 84 个编码规则文件（12 语言+common+中文副本）
│   ├── skills/         # 13 个技能（design-system + 8 openspec-* + doc-audit + book-to-skill + test-harness + skill-creator）
│   └── memorys/        # 4 个项目记忆文件（status/conventions/decisions/pitfalls）
├── docs/
│   ├── architecture.md # 架构文档（10 章节，含 MVP 验收标准、Phase 1a/1b 路线图）
│   ├── phase-planning.md # Phase 划分单一真实来源（含 4 人并行分工 + 依赖图）
│   ├── competitive-landscape.md # 39+ 产品竞品调研报告
│   ├── plugin-architecture-analysis.md # 四层信任分组深度分析
│   ├── modules/        # 33 份模块设计/SDD/TDD/约束文档
│   │   ├── tech-stack.md
│   │   ├── plugin-framework.md
│   │   ├── plugin-framework-sdd.md  # SDD: PluginManager API + 生命周期 + mock 约束
│   │   ├── plugin-communication.md
│   │   ├── multi-tenant.md
│   │   ├── file-storage.md
│   │   ├── database-schema.md        # 11 张表完整 DDL + 索引策略
│   │   ├── api-specification.md      # 19 个端点请求/响应格式
│   │   ├── api-conventions.md        # 分页/过滤/排序/错误/速率限制
│   │   ├── dev-workflow.md           # Monorepo + CLI + 测试策略
│   │   ├── frontend-spec.md          # Admin UI 路由 + Build Output
│   │   ├── migration-engine-sdd.md   # SDD: Scanner/Resolver/Executor
│   │   ├── redis-mock-guide.md       # ioredis-mock + BullMQ testMode
│   │   ├── test-seed-strategy.md     # seed factory + transaction rollback
│   │   └── e2e-test-flows.md         # 5 核心 E2E 流程 + Playwright
│   ├── plans/          # 5 份 Phase 1a 执行计划文档（~160KB）
│   └── reference/      # 15 份竞品产品画像
├── package.json        # npm 根配置
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
│ 架构决策 | `.agents/memorys/decisions.md` | D1-D24 + G1-G5
| 编码约定 | `.agents/memorys/conventions.md` | 命名、不可变性、TS 规范 |
| 已知坑点 | `.agents/memorys/pitfalls.md` | MODACS 适配 + 技术栈 + 行业 CVE 教训 |
| 语言规则 | `.agents/rules/{lang}/` | 各语言专属规则 |
| Agent 配置 | `.opencode/opencode.json` | instructions、MCP、LSP |
| Agent 使用指南 | `.opencode/agent-guide.md` | OMO 编排体系、5 层模型路由 |
| 技能注册表 | `SKILL.md` | superpowers + 项目专属技能清单 |
│ 架构文档 | `docs/architecture.md` | 含 MVP 验收标准、Phase 1a/1b 五阶段路线图
| Phase 划分 | `docs/phase-planning.md` | 单一真实来源，4 人并行分工 + 依赖图 |
│ 插件架构分析 | `docs/plugin-architecture-analysis.md` | 四层信任分组 + 通信 + 安全 + 生命周期
│ 竞品调研 | `docs/competitive-landscape.md` | 39+ 产品，五大分类
| 竞品参考 | `docs/reference/` | 15 份详细产品画像（Odoo/NocoBase/ERPNext 等）|
| 数据库 Schema | `docs/modules/database-schema.md` | 11 张表 DDL + 表关系 + 索引策略 |
| API 规范 | `docs/modules/api-specification.md` | 19 个端点请求/响应格式 |
| API 约定 | `docs/modules/api-conventions.md` | 分页/过滤/排序/错误/速率限制 |
│ SDD 文档 | `docs/modules/*-sdd.md` | shared-types、plugin-framework、plugin-core、manifest-engine、migration-engine、rbac、audit、i18n、logging-infra（health-check/admin-ui 待生成）
│ TDD 文档 | `docs/modules/*-tdd.md` | shared-types、plugin-framework、plugin-core、manifest-engine、migration-engine、rbac、audit、i18n、health-check、admin-ui、logging-infra
| 开发工作流 | `docs/modules/dev-workflow.md` | Monorepo + CLI + --watch + 测试策略 |
| Admin UI | `docs/modules/frontend-spec.md` | 路由 + Build Output + 插件加载契约 |
| 实施计划 | `docs/plans/` | 5 份 Phase 1a 执行计划文档（~160KB） |
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

| 模块 | SDD 文档 | TDD 文档 | 状态 | 依赖 |
|------|----------|----------|------|------|
| shared-types | docs/modules/shared-types-sdd.md | docs/modules/shared-types-tdd.md | 📋 SDD+TDD 完成 | 无（Week 0）|
| plugin-framework | docs/modules/plugin-framework-sdd.md | docs/modules/plugin-framework-tdd.md | 📋 SDD+TDD 完成 | 无 |
| plugin-core (Bootstrap) | docs/modules/plugin-core-sdd.md | docs/modules/plugin-core-tdd.md | 📋 SDD+TDD 完成 | plugin-framework |
| manifest-engine | docs/modules/manifest-engine-sdd.md | docs/modules/manifest-engine-tdd.md | 📋 SDD+TDD 完成 | plugin-framework |
| migration-engine | docs/modules/migration-engine-sdd.md | docs/modules/migration-engine-tdd.md | 📋 SDD+TDD 完成 | 无 |
| RBAC 权限引擎 | docs/modules/rbac-sdd.md | docs/modules/rbac-tdd.md | 📋 SDD+TDD 完成 | shared-types |
| 审计日志 | docs/modules/audit-sdd.md | docs/modules/audit-tdd.md | 📋 SDD+TDD 完成 | shared-types |
| 健康检查 | docs/modules/health-check-sdd.md | docs/modules/health-check-tdd.md | 🔲 SDD 待生成 | 无 |
| i18n 国际化 | docs/modules/i18n-sdd.md | docs/modules/i18n-tdd.md | 📋 SDD+TDD 完成 | 无 |
| 管理 UI | docs/modules/admin-ui-sdd.md | docs/modules/admin-ui-tdd.md | 🔲 SDD 待生成 | shared-types |
| 日志/调试 | docs/modules/logging-infra-sdd.md | docs/modules/logging-infra-tdd.md | 📋 SDD+TDD 完成 | 无 |
### TDD 测试计划格式要求

- **AAA 结构**: 所有测试用例遵循 Arrange-Act-Assert 三段式。
- **测试文件命名**: `{module}.test.ts`（单元测试）/ `{module}.spec.ts`（E2E 测试）。
- **覆盖率**: 80% 最低覆盖率，CI 集成覆盖率闸门（见 dev-workflow.md）。
- **种子工厂**: 集成测试使用 test-seed-strategy.md 定义的 seed factory。
- **Mock 约束**: ProcessPluginHost mock 必须满足 5 项约束（async Promise、JSON 序列化/反序列化、30s 超时、延迟注入）。

## Phase 1a MODULE DOCUMENTATION INDEX

_以下索引列出 docs/modules/ 中与 Phase 1a 编码直接相关的所有文档，供 AI 代理在 TDD 编码前参考。_

| 文档 | 类型 | 对应模块 | 决策编号 | 状态 |
|------|------|----------|----------|------|
| `tech-stack.md` | 设计 | 全栈工具链 | D5/D6/D9 | ✅ 已完成 |
| `plugin-framework.md` | 设计 | 插件框架（加载/卸载/热更新） | D1-D1.5 | ✅ 已完成 |
| `plugin-framework-sdd.md` | SDD | PluginManager API + 生命周期 + mock 约束 | D1.2/D1.4 | ✅ 已完成 |
| `plugin-communication.md` | 设计 | 插件间通信（组内/组间） | D1.3 | ✅ 已完成 |
| `multi-tenant.md` | 设计 | 多租户隔离（四阶段） | D4/D4.1 | ✅ 已完成 |
| `database-schema.md` | 设计 | 11 张表 DDL + 索引策略 | D9.1/D10 | ✅ 已完成 |
| `api-specification.md` | 设计 | 19 个端点请求/响应格式 | D1.8 | ✅ 已完成 |
| `api-conventions.md` | 设计 | 分页/过滤/排序/错误/速率限制 | — | ✅ 已完成 |
| `migration-engine-sdd.md` | SDD | Scanner/Resolver/Executor | D1.7 | ✅ 已完成 |
| `frontend-spec.md` | 设计 | Admin UI 路由 + Build Output | D15-D24 | ✅ 已完成 |
| `dev-workflow.md` | 工作流 | Monorepo + CLI + TDD + 测试策略 | — | ✅ 已完成 |
| `test-seed-strategy.md` | 测试 | 种子工厂 + transaction rollback | — | ✅ 已完成 |
| `e2e-test-flows.md` | 测试 | 5 核心 E2E 流程 + Playwright | — | ✅ 已完成 |
| `redis-mock-guide.md` | 测试 | ioredis-mock + BullMQ testMode | D1.10 | ✅ 已完成 |
| `file-storage.md` | 设计 | 文件存储隔离演进 | D4.1 | ✅ 已完成 |

## CODE MAP
_当前无源代码。以下为架构文档中规划的模块：_

| 模块 | 状态 | 规划路径 | SDD | TDD |
|------|------|----------|-----|-----|
| 插件框架 | 🔲 Phase 1a | `packages/plugin-framework/` — D1.1-D1.4 | ✅ plugin-framework-sdd.md | ✅ plugin-framework-tdd.md |
| plugin-core (Bootstrap) | 🔲 Phase 1a | `packages/plugin-core/` — 内核插件，零依赖（D1.6） | ✅ plugin-core-sdd.md | ✅ plugin-core-tdd.md |
| manifest.yaml 系统 | 🔲 Phase 1a | `packages/manifest-engine/` — D1.5 | ✅ manifest-engine-sdd.md | ✅ manifest-engine-tdd.md |
| RBAC 权限引擎 | 🔲 Phase 1a | `packages/rbac/` — 基础 tenant_id + 角色权限（D10） | ✅ rbac-sdd.md | ✅ rbac-tdd.md |
| 插件通信 | 🔲 Phase 1b | `packages/plugin-communication/` — D1.3 | 🔲 待生成 | 🔲 待生成 |
| 审计日志 | 🔲 Phase 1a | `packages/audit/` — D1.12 | ✅ audit-sdd.md | ✅ audit-tdd.md |
| 迁移管理 | 🔲 Phase 1a | `packages/migration/` — D1.7 | ✅ migration-engine-sdd.md | ✅ migration-engine-tdd.md |
| 事件总线 | 🔲 Phase 1b | `packages/event-bus/` — D1.9 | 🔲 待生成 | 🔲 待生成 |
| Schema Engine | 🔲 Phase 2 | `packages/schema-engine/` | 🔲 待生成 | 🔲 待生成 |
| 插件市场 | 🔲 Phase 2 | — | 🔲 待生成 | 🔲 待生成 |
| 工作流引擎 | 🔲 Phase 4 | `packages/workflow-engine/` | 🔲 待生成 | 🔲 待生成 |
| shared-types | 🔲 Phase 1a (Week 0) | `packages/shared-types/` — 公共类型定义 | ✅ shared-types-sdd.md | ✅ shared-types-tdd.md |
| 国际化 (i18n) | 🔲 Phase 1a→1b | `packages/i18n/` — D14 | ✅ i18n-sdd.md | ✅ i18n-tdd.md |
| 健康检查 | 🔲 Phase 1a | `packages/health-check/` - D1.13 | 🔲 待生成 | ✅ health-check-tdd.md |
| 日志/调试基础设施 | 🔲 Phase 1a | `packages/logging-infra/` - 结构化日志 + Core 聚合 | ✅ logging-infra-sdd.md | ✅ logging-infra-tdd.md |

## CONVENTIONS
### AUDEBase 独有
### npm scope
- **去 MODACS 化**: 保持零 MODACS 残留，每次修改后运行 `grep -ri modacs . --exclude-dir=.git --exclude-dir=.sisyphus`
- **精确编辑**: 不全局 MODACS→AUDEBase 替换，使用手术式编辑
- **架构骨架**: `docs/architecture.md` 中内容不足 50% 的章节使用 `TODO: 为 AUDEBase 重写此节` 占位
- **@modacs/* 移除**: 移除所有 `@modacs/*` 引用，不自动替换为 `@AUDEBase/*`

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
- **不必要的文件写入** — 文档文件仅在用户明确要求时创建

## NOTES

- **文档基础设施就绪** — 架构定义完成。8 轮团队审核（R1-R8，累计 185+ 发现全部关闭），2 轮文档交叉审计通过，2 轮交互审计（34+29=63 项全部落实到文档），可进入 Phase 1a 编码
- **从 MODACS 分离** — 2026-07-08 首次提交。无 MODACS 代码共享
- **.sisyphus/** 被 gitignore 排除 — 计划文件、审计报告暂存于此
- **双 package.json** — 根目录用 npm，`.opencode/` 用独立包（插件系统）
- **Agent 超配** - 对于零代码项目，基础设施配置较重。规则（84 个文件）和 MCP 服务器（6 个活动）是为未来开发准备的
- **test 基础设施** — 框架尚未安装。测试计划文档已就绪（11 份 TDD），vitest + @testing-library/react + Playwright 框架安装待 Phase 1a Week 0
