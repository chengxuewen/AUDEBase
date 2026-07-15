# AUDEBase Phase 1a 主计划

> **版本**: 1.0 | **更新日期**: 2026-07-13 | **状态**: 已发布  
> **来源文档**: [phase-planning.md](../phase-planning.md)、[architecture.md](../architecture.md) §七、[status.md](../../.agents/memorys/status.md)、[decisions.md](../../.agents/memorys/decisions.md)  
> **本文档是 Phase 1a 执行的单一真实来源**。所有模块编号、依赖关系、团队分工、时间线以本文档为准。

---

## 目录

1. [Phase 1a 目标与范围](#一phase-1a-目标与范围)
2. [模块清单（15 模块）](#二模块清单15-模块)
3. [依赖关系图](#三依赖关系图)
4. [4 人团队分工表](#四4-人团队分工表)
5. [4-6 周时间线与里程碑](#五4-6-周时间线与里程碑)
6. [风险登记册（Top 10）](#六风险登记册top-10)
7. [各模块完成定义（DoD）](#七各模块完成定义dod)
8. [显式延期决策](#八显式延期决策)
9. [参考文档索引](#九参考文档索引)

---

## 一、Phase 1a 目标与范围

### 1.1 核心目标

**从零到一，证明插件架构可行。** 实现"安装插件 → 管理用户 → 查看日志"的端到端流程。

Phase 1a 交付一个可工作的微内核底座，包括：
- 插件框架（发现、验证、加载、生命周期）
- 内核插件（Bootstrap 数据）
- 数据库迁移管理
- JWT 认证 + 基础 RBAC
- 多租户骨架（行级隔离）
- 审计日志
- 管理 UI（插件管理 + 用户管理）
- 日志/调试基础设施
- CLI 工具
- 健康检查、速率限制、i18n 骨架

### 1.2 范围边界

| 维度 | 包含 | 不包含 |
|------|------|--------|
| **插件模式** | inline 模式（同进程） | process/container 隔离（Phase 2） |
| **权限** | 用户→角色→权限，API 中间件拦截 | Record Rules、字段级权限（Phase 1.5/2） |
| **多租户** | tenant_id 列 + Drizzle 自动注入 | Schema-per-tenant、Database-per-tenant（Phase 1.5/2） |
| **i18n** | Core t() + useTranslation 骨架 + zh-CN | 语言切换器、en-US 翻译（Phase 1b） |
| **UI** | 管理后台 2 页（插件管理 + 用户管理） | Data Browser、AUTO-CRUD（Phase 2） |
| **通信** | 组内直接函数调用 | 事件总线（Phase 1b）、WebSocket（Phase 2） |
| **调度** | CLI 手动迁移 | Cron 定时任务（Phase 1b） |
| **文件** | 无 | 文件上传（Phase 1b） |

### 1.3 前置条件：Week 0

所有 Phase 1a 开发工作**必须**在 Week 0 基础设施完成后启动。Week 0 交付物：

| 任务 | 交付物 | 责任人 |
|------|--------|--------|
| Turborepo + pnpm workspace 初始化 | 根 package.json + turbo.json + packages/ | Person A |
| Vitest 配置 + 覆盖率门禁 | vitest.config.ts（80% lines/thresholds） | Person A |
| GitHub Actions CI 流水线 | lint → type-check → test → build | Person A |
| Docker Compose 开发环境 | PostgreSQL + Redis + Adminer | Person A |
| React 19 + antd 5 兼容性验证 | Playwright E2E 覆盖 | Person D |
| Prettier + ESLint 配置 | .prettierrc + eslint.config.mjs | Person A |
| Husky pre-commit hook | lint-staged 自动格式检查 | Person A |
| **shared-types 初始化** | packages/shared-types/（User/Role/Permission/Plugin/ErrorCode/ApiResponse）| Person A |

> **Week 0 是 Phase 1a 所有并行轨道的阻塞依赖**。Week 0 未完成前，Person B/C/D 无法启动编码。

---

## 二、模块清单（15 模块）

全部 15 个 Phase 1a 模块（编号与 [phase-planning.md](../phase-planning.md) §Phase 1a 完全一致）：

| # | 模块名称 | 核心交付 | 前置依赖 | 参考文档 |
|---|----------|----------|----------|----------|
| **1** | **内核骨架** | Fastify 应用、pnpm workspace、Drizzle DB 连接、/health + /health/ready | 无（依赖 Week 0） | — |
| **2** | **数据库 Schema** | 完整 DDL（users, roles, permissions, user_roles, modules, collections, audit_log, migration_history, refresh_tokens, tenants） | #1 | [database-schema.md](../modules/database-schema.md) |
| **3** | **CLI 工具** | `aude dev`、`aude db:migrate`、`aude plugin:create`（3 命令） | #1 | [dev-workflow.md](../modules/dev-workflow.md) |
| **4** | **plugin-core Bootstrap** | admin/角色/菜单初始数据 + modules + collections 注册表 | #2 | [plugin-core-sdd.md](../modules/plugin-core-sdd.md) |
| **5** | **迁移管理（基础）** | migration_history 表 + 三阶段 SQL 引擎（preload/postsync/postload）+ CI dry-run | #2 | [migration-engine-sdd.md](../modules/migration-engine-sdd.md) |
| **6** | **插件框架** | 插件发现、manifest 验证、7 生命周期钩子、InlinePluginHost（含 JSON 序列化往返断言） | #2 | [plugin-framework-sdd.md](../modules/plugin-framework-sdd.md) |
| **7** | **JWT 认证** | access token（15min）+ refresh token（7d）+ token_version 撤回 + login/refresh 端点 | #2、#6 | [api-specification.md](../modules/api-specification.md) |
| **8** | **基础 RBAC** | 用户→角色→权限模型、API 中间件拦截、rbac:assign_role/rbac:revoke_role 审计 | #2、#7 | [rbac-sdd.md](../modules/rbac-sdd.md) |
| **9** | **多租户（骨架）** | 所有表含 tenant_id 列 + Drizzle 自动注入 WHERE tenant_id | #2 | [multi-tenant.md](../modules/multi-tenant.md) |
| **10** | **审计日志** | audit_log 表 + Core 中间件自动记录 API 写操作 | #2、#8 | [audit-sdd.md](../modules/audit-sdd.md) |
| **11** | **国际化（骨架）** | Core t() + useTranslation() 挂钩 + zh-CN 翻译文件（无语言切换器） | #6 | [i18n-sdd.md](../modules/i18n-sdd.md) |
| **12** | **管理 UI** | ProLayout 骨架 + 插件管理页 + 用户管理页 + Provider Stack | #6、#7、#8 | [admin-ui-sdd.md](../modules/admin-ui-sdd.md) |
| **13** | **日志/调试** | pino 结构化日志 + X-Request-ID + GET /api/logs（最近 100 条） | #1 | [logging-infra-sdd.md](../modules/logging-infra-sdd.md) |
| **14** | **速率限制** | @fastify/rate-limit，per-IP + per-endpoint（全局 100/min，/auth/login 5/min） | #1 | — |
| **15** | **API 规范与约定** | api-specification.md（9 端点）+ api-conventions.md（分页/过滤/排序/错误） | #1 | [api-specification.md](../modules/api-specification.md)、[api-conventions.md](../modules/api-conventions.md) |

### 2.1 已有 SDD/TDD 文档的模块

以下模块在 Phase 0 已生成 SDD + TDD 文档，编码时可直接参考：

| 模块 | SDD | TDD | 状态 |
|------|-----|-----|------|
| #6 插件框架 | ✅ plugin-framework-sdd.md | ✅ plugin-framework-tdd.md | 📋 就绪 |
| #4 plugin-core | ✅ plugin-core-sdd.md | ✅ plugin-core-tdd.md | 📋 就绪 |
| 清单引擎（#6 子模块） | ✅ manifest-engine-sdd.md | ✅ manifest-engine-tdd.md | 📋 就绪 |
| #5 迁移管理 | ✅ migration-engine-sdd.md | ✅ migration-engine-tdd.md | 📋 就绪 |
| #8 RBAC | ✅ rbac-sdd.md | ✅ rbac-tdd.md | 📋 就绪 |
| #10 审计日志 | ✅ audit-sdd.md | ✅ audit-tdd.md | 📋 就绪 |
| #1 健康检查子项 | ✅ health-check-sdd.md | ✅ health-check-tdd.md | 📋 就绪 |
| #11 i18n | ✅ i18n-sdd.md | ✅ i18n-tdd.md | 📋 就绪 |
| #12 管理 UI | ✅ admin-ui-sdd.md | ✅ admin-ui-tdd.md | 📋 就绪 |
| #13 日志/调试 | ✅ logging-infra-sdd.md | ✅ logging-tdd.md | 📋 就绪 |

---

## 三、依赖关系图

### 3.1 模块间依赖

```
┌══════════════════════════════════════════════════════════════┐
│                     Week 0（阻塞所有轨道）                     │
│  Turborepo + CI + Docker + shared-types                      │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│  #1 内核骨架（Fastify + Drizzle + /health）                    │
│  #3 CLI（aude dev/db:migrate/plugin:create）                   │
│  #13 日志/调试（pino + X-Request-ID）                          │
│  #14 速率限制（@fastify/rate-limit）                           │
│  #15 API 规范与约定（文档）                                     │
└──────────┬───────────────────────────────────────────────────┘
           │
           ▼
┌──────────────────────────────────────────────────────────────┐
│  #2 数据库 Schema（DDL 文件 + 索引）                           │
└──────┬──────────┬──────────┬──────────┬──────────────────────┘
       │          │          │          │
       ▼          ▼          ▼          ▼
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────────┐
│ #4       │ │ #5       │ │ #7       │ │ #9 多租户骨架         │
│ plugin-  │ │ 迁移管理  │ │ JWT 认证 │ │（tenant_id 列）       │
│ core     │ │          │ │          │ │                      │
│ Bootstrap│ │          │ │          │ │                      │
└──────────┘ └──────────┘ └────┬─────┘ └──────────────────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ #8 基础 RBAC         │
                    │（用户→角色→权限）     │
                    └──────┬───────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
      ┌───────────┐ ┌───────────┐ ┌──────────────┐
      │ #10       │ │ #11       │ │ #12          │
      │ 审计日志  │ │ i18n 骨架 │ │ 管理 UI      │
      │           │ │           │ │（插件管理 +   │
      │           │ │           │ │  用户管理）   │
      └───────────┘ └───────────┘ └──────────────┘
```

### 3.2 关键路径

```
Week 0 ─→ #1 ─→ #2 ─→ #6 ─→ #7 ─→ #8 ─→ #12  （Person B/D 关键路径）
                └→ #5                          （Person A 并行）
                └→ #4                          （Person B 并行）
                └→ #9                          （Person C 并行）
```

**关键路径总长**：Week 0（4.5d）+ #1（3d）+ #2（3d）+ #6（5d）+ #7（2d）+ #8（3d）+ #12（5d）≈ **21 个工作日 ≈ 4 周**（纯编码时间，不含缓冲）。

---

## 四、4 人团队分工表

### 4.1 角色与模块分配

| 角色 | 负责模块 | 核心技能 | 前置条件 | 预计工时 |
|------|----------|----------|----------|:--------:|
| **Person A — Kernel & CI** | Week 0（Turborepo/CI/Docker/shared-types）+ #1 内核骨架 + #3 CLI + #5 迁移管理 + #13 日志/调试 + #14 速率限制 + #15 API 规范 | Node.js、Fastify、Drizzle、DevOps | 无 | ~12 天 |
| **Person B — Plugin Framework** | #6 插件框架 + #4 plugin-core Bootstrap | 插件架构设计、manifest 解析、生命周期管理 | #1、#2 | ~10 天 |
| **Person C — Data & Auth** | #2 DB Schema + #7 JWT 认证 + #8 RBAC + #9 多租户 + #10 审计日志 | 数据库设计、认证授权、安全 | #1 | ~13 天 |
| **Person D — Admin UI** | #11 i18n 骨架 + #12 管理 UI + Week 0（antd 兼容性验证） | React、Ant Design、前端架构 | #1、#7、#8 | ~10 天 |

### 4.2 协作接口

| 接口 | 生产者 | 消费者 | 契约 |
|------|--------|--------|------|
| shared-types 包 | Person A（Week 0） | 所有人员 | 类型定义 + Zod schema |
| 内核骨架 API | Person A | Person B/C/D | Fastify 路由注册方式、Drizzle 实例 |
| DB Schema DDL | Person C | Person B（#4/#6） | 数据库表结构定义 |
| JWT 中间件 | Person C | Person D（#12） | 认证 token 校验 API |
| RBAC 中间件 | Person C | Person D（#12） | 权限检查 API |
| 插件框架 API | Person B | Person D（#12） | 插件 CRUD 管理端点 |
| PluginHost | Person B | Person D（#11） | i18n t() 注入 |

### 4.3 代码包结构

```
packages/
├── shared-types/          # Person A Week 0 — 公共类型 + Zod schema
├── kernel/                # Person A — Fastify 应用骨架
├── plugin-framework/      # Person B — 插件发现/加载/生命周期
├── manifest-engine/       # Person B — #6 子模块，manifest 解析
├── plugin-core/           # Person B — 内核插件（Bootstrap）
├── migration-engine/      # Person A — 三阶段迁移引擎
├── cli/                   # Person A — aude CLI 工具
├── rbac/                  # Person C — RBAC 权限引擎
├── audit/                 # Person C — 审计日志
├── i18n/                  # Person D — 国际化骨架
├── admin-ui/              # Person D — ProLayout 管理后台
└── logging-infra/         # Person A — 结构化日志
```

---

## 五、4-6 周时间线与里程碑

### 5.1 总览

```
Week 0 ─────┬─────────────────────────────────────────────── 第 0 周
            │  CI/CD 基础设施 + shared-types
            │
Week 1 ─────┼─────────────────────────────────────────────── 第 1 周
            │  #1 内核骨架 + #2 DB Schema + #13 日志
            │  （各轨道并行启动）
            │
Week 2 ─────┼─────────────────────────────────────────────── 第 2 周
            │  #3 CLI + #5 迁移管理 + #6 插件框架 + #7 JWT
            │  #9 多租户 + #14 速率限制 + #15 API 规范
            │
Week 3 ─────┼─────────────────────────────────────────────── 第 3 周
            │  #4 plugin-core + #8 RBAC + #10 审计日志
            │  #11 i18n 骨架
            │
Week 4 ─────┼─────────────────────────────────────────────── 第 4 周
            │  #12 管理 UI（插件管理 + 用户管理）
            │  集成测试 + 端到端验证
            │
Week 5-6 ───┼─────────────────────────────────────────────── 第 5-6 周（缓冲）
            │  修复缺陷 + 补全测试覆盖率 + 文档同步
            │  Phase 1a 验收评审
```

### 5.2 详细周计划

#### 第 0 周 — 基础设施（~4.5 天）

| 日 | Person A | Person D |
|:--:|----------|----------|
| 1 | Turborepo + pnpm workspace + 根 package.json | React 19 + antd 5 兼容性验证（Playwright） |
| 2 | Vitest 配置 + 覆盖率门禁 + 第一个测试 | pro-components#8686/#9629 状态记录 + 降级预案 |
| 3 | GitHub Actions CI 流水线（lint → type-check → test → build）| （空闲，可提前进入 #12 调研） |
| 4 | Docker Compose（PostgreSQL + Redis + Adminer）| （空闲） |
| 5 | shared-types 初始化 + Prettier + ESLint + Husky | （空闲） |

**第 0 周里程碑 🔴：所有基础设施就绪，shared-types 包可被引用。**

> 注意：Person B 和 Person C 在第 0 周处于阻塞状态。建议他们利用这段时间阅读 SDD/TDD 文档、熟悉架构决策、准备开发环境。

#### 第 1 周 — 内核骨架 + DB Schema + 日志

| 日 | Person A（Kernel） | Person B（Plugin） | Person C（Data） | Person D（UI） |
|:--:|-------------------|-------------------|-----------------|---------------|
| 1-2 | #1 内核骨架（Fastify 应用 + Drizzle 连接 + /health + /health/ready） | 阅读 SDD 文档 | #2 DB Schema（users, roles, permissions） | 阅读 SDD 文档 |
| 3 | #13 日志/调试（pino + X-Request-ID） | 阅读 SDD 文档 | #2 DB Schema（user_roles, modules, collections） | 阅读 SDD 文档 |
| 4-5 | #1 集成测试 + 修复 | 阅读 SDD 文档 | #2 DB Schema（audit_log, migration_history, refresh_tokens, tenants） | #12 调研（ProLayout 骨架） |

**第 1 周里程碑 🟡：内核骨架启动成功，DB Schema DDL 完成，CI 流水线通过。**

#### 第 2 周 — 核心框架 + 认证 + 多租户

| 日 | Person A（Kernel） | Person B（Plugin） | Person C（Data） | Person D（UI） |
|:--:|-------------------|-------------------|-----------------|---------------|
| 1-2 | #3 CLI（aude dev, aude db:migrate, aude plugin:create）| #6 插件框架（插件发现 + manifest 验证） | #7 JWT 认证（access + refresh token 端点） | #11 i18n 骨架（t() + useTranslation） |
| 3-4 | #5 迁移管理（migration_history 表 + 三阶段引擎 + CI dry-run）| #6 插件框架（7 生命周期钩子 + InlinePluginHost） | #9 多租户骨架（tenant_id 列 + Drizzle 自动注入） | #11 i18n 骨架（zh-CN 翻译文件） |
| 5 | #14 速率限制 + #15 API 规范文档 | #6 单元测试 | #7 + #9 集成测试 | #11 单元测试 |

**第 2 周里程碑 🟡：CLI 可用，插件框架可发现和加载插件，JWT 认证端点可用，多租户骨架注入生效。**

#### 第 3 周 — RBAC + 审计 + Bootstrap + 迁移就绪

| 日 | Person A（Kernel） | Person B（Plugin） | Person C（Data） | Person D（UI） |
|:--:|-------------------|-------------------|-----------------|---------------|
| 1-2 | #5 迁移管理集成测试 | #4 plugin-core Bootstrap（admin 用户 + 角色 + 菜单数据） | #8 基础 RBAC（用户→角色→权限模型 + API 中间件） | #12 管理 UI（Provider Stack 搭建） |
| 3-4 | #13 日志调试（GET /api/logs）| #4 plugin-core（modules + collections 注册表） | #8 RBAC（rbac:assign_role/rbac:revoke_role 审计写入） | #12 管理 UI（TenantProvider + UserProvider） |
| 5 | 全模块 lint + type-check 修复 | #4 集成测试 | #10 审计日志（audit_log 表 + Core 中间件） | #12 管理 UI（ACLProvider + ProLayout 骨架） |

**第 3 周里程碑 🟢：RBAC 中间件拦截有效，plugin-core Bootstrap 可创建初始数据，审计日志自动记录 API 写操作。**

#### 第 4 周 — 管理 UI + 集成 + E2E

| 日 | Person A（Kernel） | Person B（Plugin） | Person C（Data） | Person D（UI） |
|:--:|-------------------|-------------------|-----------------|---------------|
| 1-2 | 全模块集成测试 | 插件框架 + plugin-core 端到端测试 | RBAC + 审计日志端到端测试 | #12 管理 UI（插件管理页：列表/安装/启用/禁用） |
| 3-4 | 缺陷修复 | 缺陷修复 | 缺陷修复 | #12 管理 UI（用户管理页：CRUD）+ ACLGuard |
| 5 | CI 完整流水线验证 | 文档同步 | 文档同步 | #12 管理 UI（错误隔离降级 UI）+ 集成测试 |

**第 4 周里程碑 🟢：端到端流程可用——安装插件 → 管理用户 → 查看日志。管理 UI 渲染正常。**

#### 第 5-6 周 — 缓冲与验收（如需要）

| 周 | 活动 | 验收标准 |
|:--:|------|----------|
| 5 | 缺陷修复、测试覆盖率补全（目标 80%）、性能优化 | 所有 15 模块 DoD 通过 |
| 6 | Phase 1a 验收评审、文档同步、memorys 更新 | 验收清单逐项核对通过，AGENTS.md 同步更新 |

### 5.3 周会节奏

| 会议 | 频率 | 参与人 | 议程 |
|------|------|--------|------|
| 站会 | 每日 15min | 全员 | 昨日完成、今日计划、阻塞项 |
| 技术评审 | 每周五 1h | 全员 | 代码审查、架构对齐、决策确认 |
| 里程碑评审 | 每里程碑结束 | 全员 | 里程碑验收、风险回顾、下周调整 |

---

## 六、风险登记册（Top 10）

| # | 风险 | 概率 | 影响 | 等级 | 缓解措施 |
|---|------|:----:|:----:|:----:|----------|
| R1 | **Week 0 延迟阻塞所有轨道** | 中 | 极高 | 🔴 | 集中 Person A 全力冲刺 Week 0；Person B/C/D 第 0 周阅读文档/准备环境 |
| R2 | **Drizzle ORM pre-1.0 API 变更** | 中 | 高 | 🟡 | DatabaseProvider 接口抽象隔离；锁定 0.45.x LTS；CI 通知 API 变更 |
| R3 | **插件框架 manifest 格式与 SDD 文档偏差** | 中 | 高 | 🟡 | 编码前校验 manifest 字段与 SDD 一致；CI 集成 manifest schema 验证 |
| R4 | **ProTable/ProForm antd v6 兼容性** | 中 | 中 | 🟡 | Week 0 前置验证；降级预案：原生 antd Table + Form + Layout |
| R5 | **Person D 依赖 #7 JWT 和 #8 RBAC 阻塞** | 高 | 中 | 🟡 | 使用 mock JWT 和 mock RBAC 提前开发 UI；第 2 周即可启动 #12 |
| R6 | **测试覆盖率达不到 80% 门禁** | 中 | 中 | 🟡 | Week 0 配置覆盖率门禁（CI 阻断）；每模块编码时同步写测试，不积压 |
| R7 | **多租户 tenant_id 漏注入导致数据泄露** | 低 | 极高 | 🔴 | Drizzle 自动注入层强制检查；集成测试（tenant-A ↔ tenant-B 互不可见）|
| R8 | **JWT 密钥管理疏忽** | 低 | 极高 | 🔴 | 启动时 assert(AUDE_JWT_SECRET.length >= 32)；拒绝空值/默认值 |
| R9 | **4 人并行协作冲突（代码合并/接口不一致）** | 中 | 中 | 🟡 | shared-types 契约先行；每日站会对齐；Person A 作为技术协调人 |
| R10 | **Phase 1a 范围蔓延** | 高 | 中 | 🟡 | 显式延期决策清单（见§八）；任何新增功能需要 lead 书面批准 |

### 6.1 风险响应策略

| 等级 | 定义 | 响应 |
|:----:|------|------|
| 🔴 严重 | 可能导致 Phase 1a 失败 | 立即上报 lead，暂停非关键工作，集中资源解决 |
| 🟡 高 | 可能导致延期 ≥1 周 | 提前制定缓解措施，每周站会跟踪 |
| 🟢 低 | 可能影响单模块进度 | 模块负责人自行跟踪，周会汇报 |

---

## 七、各模块完成定义（DoD）

每个模块必须满足以下全部条件方可标记为"完成"。

### #1 内核骨架

- [ ] `GET /health` 返回 `{ status:"ok", db:true, redis:true, uptime:N }`
- [ ] `GET /health/ready` DB 就绪后返回 200，否则 503
- [ ] pnpm workspace 中 `packages/*` 可相互引用
- [ ] 启动时 `assert(AUDE_JWT_SECRET.length >= 32)` 拒绝默认值
- [ ] Drizzle 连接池配置正确（pg-pool，默认 10 连接）
- [ ] 测试覆盖率 ≥ 80%

### #2 数据库 Schema

- [ ] DDL 与 [database-schema.md](../modules/database-schema.md) 完全一致
- [ ] 所有表包含 `tenant_id` 列（系统表除外）
- [ ] 索引策略与 database-schema.md 一致（tenant_id 为首列索引）
- [ ] DDL 可重复执行（IF NOT EXISTS 幂等）
- [ ] 测试覆盖率 ≥ 80%

### #3 CLI 工具

- [ ] `aude dev` 启动开发服务器（含 HMR）
- [ ] `aude db:migrate` 执行全量迁移（含 `--dry-run` 预检模式）
- [ ] `aude plugin:create <name>` 生成插件骨架目录
- [ ] CLI 命令帮助信息完整
- [ ] 测试覆盖率 ≥ 80%

### #4 plugin-core Bootstrap

- [ ] 首次运行时创建 admin 用户（默认密码强制首次修改）
- [ ] 创建默认角色（admin/member）
- [ ] 创建系统租户（tenant_id = NULL）
- [ ] 创建默认菜单结构（插件管理/用户管理）
- [ ] 创建核心权限项
- [ ] `dependencies: []` 零依赖，不可卸载
- [ ] 测试覆盖率 ≥ 80%

### #5 迁移管理（基础）

- [ ] `migration_history` 表追踪每个插件的已执行迁移版本
- [ ] 三阶段执行：`preload.sql` → `postsync.sql` → `postload.sql`
- [ ] 迁移按 `manifest.yaml` 中 `version` 字段（SemVer）排序
- [ ] 迁移失败时跳过该插件（不阻塞启动）+ 错误日志
- [ ] CI 支持 `aude db:migrate --dry-run` 预检
- [ ] 测试覆盖率 ≥ 80%

### #6 插件框架

- [ ] `PluginManager.discover()` 发现 `manifest.yaml` 插件
- [ ] `plugin.load()` 触发 7 钩子链（afterAdd → beforeLoad → load，首次 install → afterEnable）
- [ ] `manifest.name` 或 `manifest.version` 缺失时拒绝加载
- [ ] InlinePluginHost 实现 5 项 mock 约束（async Promise、JSON 序列化/反序列化、30s 超时、1-5ms 延迟注入）
- [ ] `--strict-plugin-host` 模式下 `JSON.parse(JSON.stringify(params))` 往返断言
- [ ] 插件通过 Core db 代理查询（不直连数据库）
- [ ] 测试覆盖率 ≥ 80%

### #7 JWT 认证

- [ ] `POST /api/auth/login` 返回 access token + refresh token
- [ ] `POST /api/auth/refresh` 刷新 access token
- [ ] Access token 15 分钟过期，Refresh token 7 天过期
- [ ] `token_version` 更新后旧 token 立即失效
- [ ] Refresh token SHA-256 哈希存储于 `refresh_tokens` 表
- [ ] 无效 token → 401
- [ ] 测试覆盖率 ≥ 80%

### #8 基础 RBAC

- [ ] admin 可创建角色并分配权限
- [ ] API 中间件拦截无权限请求 → 403
- [ ] 无效 token → 401（与 #7 协同）
- [ ] `rbac:assign_role` 和 `rbac:revoke_role` 动作写入 `audit_log`
- [ ] 测试覆盖率 ≥ 80%

### #9 多租户（骨架）

- [ ] 所有业务表包含 `tenant_id` 列
- [ ] Drizzle 查询自动注入 `WHERE tenant_id = currentTenantId`
- [ ] tenant-A 和 tenant-B 用户数据互不可见
- [ ] 系统租户（tenant_id = NULL）表不参与多租户过滤
- [ ] 测试覆盖率 ≥ 80%

### #10 审计日志

- [ ] API 写操作（POST/PUT/PATCH/DELETE）自动记录到 `audit_log` 表
- [ ] 记录包含：`actor_id`、`action`、`resource_type`、`resource_id`、`ip`、`user_agent`
- [ ] 查询审计日志支持 `(tenant_id, resource_type, resource_id)` 复合索引
- [ ] 测试覆盖率 ≥ 80%

### #11 国际化（骨架）

- [ ] `t('key')` 返回 zh-CN 翻译
- [ ] `useTranslation()` Hook 可用（React 组件）
- [ ] 插件类 `this.t()` 可用（通过 PluginHost 注入）
- [ ] 翻译文件为 `locale/{lang}.json` 格式
- [ ] 无 UI 语言切换器（Phase 1b 实现）
- [ ] 测试覆盖率 ≥ 80%

### #12 管理 UI

- [ ] ProLayout 渲染侧边栏菜单（含插件管理和用户管理）
- [ ] 插件管理页：列表展示 + 安装 + 启用/禁用
- [ ] 用户管理页：CRUD（创建/读取/更新/删除）
- [ ] Provider Stack 层级正确：TenantProvider → UserProvider → ACLProvider → ProLayout
- [ ] ACLGuard 控制按钮可见性（无权限按钮隐藏）
- [ ] 插件崩溃时 ErrorBoundary 显示降级 UI（不崩溃全局）
- [ ] 测试覆盖率 ≥ 80%

### #13 日志/调试

- [ ] pino 结构化日志输出 JSON 格式（含 timestamp、level、requestId）
- [ ] X-Request-ID 自动注入所有请求
- [ ] `GET /api/logs` 返回最近 100 条日志
- [ ] 日志级别：开发环境 debug，生产环境 info
- [ ] 测试覆盖率 ≥ 80%

### #14 速率限制

- [ ] 全局 100/min 超限返回 429 + `Retry-After` 头
- [ ] `/api/auth/login` 5/min 超限返回 429
- [ ] `X-RateLimit-*` 响应头包含剩余配额信息
- [ ] 测试覆盖率 ≥ 80%

### #15 API 规范与约定

- [ ] [api-specification.md](../modules/api-specification.md) 记录全部 9 个 Phase 1a 端点
- [ ] [api-conventions.md](../modules/api-conventions.md) 规范分页/过滤/排序/错误格式
- [ ] 所有 API 端点实现与规范文档一致
- [ ] 文档与实现同步（编码完成后更新）

---

## 八、显式延期决策

以下功能经审计确认**延期至 Phase 1b 或更晚**，Phase 1a 不实现：

| 功能 | 目标阶段 | 原因 |
|------|:--------:|------|
| 事件总线（EventBus） | Phase 1b | 非内核 MVP 必需（D1.9） |
| 定时任务（Cron） | Phase 1b | 非内核 MVP 必需（D1.10） |
| 文件上传 | Phase 1b | 非内核 MVP 必需（D4.1） |
| 通知接口 | Phase 1b | 非内核 MVP 必需（D1.14） |
| API 版本路由 | Phase 1b | 非内核 MVP 必需（D1.8） |
| 完整 i18n 多语言切换器 | Phase 1b | 骨架可用即可 |
| 插件间数据扩展（extends） | Phase 1b | 非内核 MVP 必需（D12.1） |
| AUTO-CRUD API | Phase 2 | 非内核 MVP 必需 |
| Data Browser | Phase 2 | 非内核 MVP 必需 |
| WebSocket | Phase 2 | 非内核 MVP 必需（D1.11） |
| Record Rules | Phase 2 | 非内核 MVP 必需（D10） |
| 字段级权限 | Phase 1.5 | 非内核 MVP 必需（D11） |
| Schema Engine | Phase 2 | 非内核 MVP 必需（D3） |
| Saga 跨插件事务 | Phase 4 | 非内核 MVP 必需（D13） |
| 插件市场 | Phase 3 | 非内核 MVP 必需 |

---

## 九、参考文档索引

### 9.1 核心参考

| 文档 | 用途 | 链接 |
|------|------|------|
| Phase 规划 | 单一真实来源，模块编号、依赖、分工 | [phase-planning.md](../phase-planning.md) |
| 架构文档 | 架构总览、MVP 范围、路线图 | [architecture.md](../architecture.md) |
| 项目状态 | 当前状态、已知缺失、近期工作 | [status.md](../../.agents/memorys/status.md) |
| 决策记录 | 48 条架构决策（D1-D24、G1-G5） | [decisions.md](../../.agents/memorys/decisions.md) |
| 编码约定 | 命名、TS 规范、不可变性 | [conventions.md](../../.agents/memorys/conventions.md) |
| 已知坑点 | 反模式、安全教训、架构陷阱 | [pitfalls.md](../../.agents/memorys/pitfalls.md) |

### 9.2 SDD/TDD 文档

| 模块 | SDD | TDD |
|------|-----|-----|
| #6 插件框架 | [plugin-framework-sdd.md](../modules/plugin-framework-sdd.md) | [plugin-framework-tdd.md](../modules/plugin-framework-tdd.md) |
| #4 plugin-core | [plugin-core-sdd.md](../modules/plugin-core-sdd.md) | [plugin-core-tdd.md](../modules/plugin-core-tdd.md) |
| #6 清单引擎 | [manifest-engine-sdd.md](../modules/manifest-engine-sdd.md) | [manifest-engine-tdd.md](../modules/manifest-engine-tdd.md) |
| #5 迁移管理 | [migration-engine-sdd.md](../modules/migration-engine-sdd.md) | [migration-engine-tdd.md](../modules/migration-engine-tdd.md) |
| #8 RBAC | [rbac-sdd.md](../modules/rbac-sdd.md) | [rbac-tdd.md](../modules/rbac-tdd.md) |
| #10 审计日志 | [audit-sdd.md](../modules/audit-sdd.md) | [audit-tdd.md](../modules/audit-tdd.md) |
| 健康检查（#1 子项） | [health-check-sdd.md](../modules/health-check-sdd.md) | [health-check-tdd.md](../modules/health-check-tdd.md) |
| #11 i18n | [i18n-sdd.md](../modules/i18n-sdd.md) | [i18n-tdd.md](../modules/i18n-tdd.md) |
| #12 管理 UI | [admin-ui-sdd.md](../modules/admin-ui-sdd.md) | [admin-ui-tdd.md](../modules/admin-ui-tdd.md) |
| #13 日志/调试 | [logging-infra-sdd.md](../modules/logging-infra-sdd.md) | [logging-tdd.md](../modules/logging-tdd.md) |

### 9.3 设计文档

| 文档 | 模块关联 |
|------|----------|
| [tech-stack.md](../modules/tech-stack.md) | 全栈工具链 |
| [plugin-framework.md](../modules/plugin-framework.md) | #6 插件框架设计 |
| [plugin-communication.md](../modules/plugin-communication.md) | #6 插件通信设计 |
| [multi-tenant.md](../modules/multi-tenant.md) | #9 多租户设计 |
| [database-schema.md](../modules/database-schema.md) | #2 数据库 Schema |
| [api-specification.md](../modules/api-specification.md) | #15 API 规范 |
| [api-conventions.md](../modules/api-conventions.md) | #15 API 约定 |
| [frontend-spec.md](../modules/frontend-spec.md) | #12 前端架构 |
| [dev-workflow.md](../modules/dev-workflow.md) | 开发工作流 |
| [test-seed-strategy.md](../modules/test-seed-strategy.md) | 测试策略 |
| [e2e-test-flows.md](../modules/e2e-test-flows.md) | E2E 测试流程 |
| [redis-mock-guide.md](../modules/redis-mock-guide.md) | Redis Mock 指南 |

---

> **本文档随 Phase 1a 执行持续更新**。每周五里程碑评审后更新周计划进度。  
> 变更历史：2026-07-13 v1.0 创建。