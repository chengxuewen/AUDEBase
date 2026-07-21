# AUDEBase NocoBase 迁移 — 校准执行计划

**日期:** 2026-07-21
**来源:** Hyperplan 4 角色对抗式审查（risk-hunter, scope-auditor, tech-challenger, minimalist）
**状态:** Phase 0 启动中

## 1. 审查结论

原始设计文档 `2026-07-21-nocobase-migration-design.md` 的核心方向正确，但严重低估了技术挑战。4 个角色审查后达成以下共识：

### 致命发现

| 发现 | 审查来源 | 影响 |
|------|---------|------|
| **Trust-grouping 架构不可行** | Tech Challenger | NocoBase PluginManager 无进程隔离机制。`worker_threads`/`child_process`/Docker sandbox 需 fork NocoBase 核心代码。**Phase 0-2 放弃。** |
| **Drizzle→Sequelize ORM 鸿沟** | 四人一致 | Record-rules 的 `generateWhereClause()` 输出 PostgreSQL `$1` 占位符。NocoBase 用 Sequelize WhereOptions。**需完全重写 SQL 生成层。** |
| **3 插件 vs 15 包** | Scope Auditor | 迁移方案声称 3 个创新插件，D25.3 实际要求保留 15 个包。**范围低估 5x。** |

### 已被否决的设计假设

| 原假设 | 否决理由 | 新方案 |
|--------|---------|--------|
| Trust-grouping 作为 NocoBase 插件 | PluginManager 不支持进程隔离 | **搁置**，等 NocoBase 支持 plugin-level isolation 后再评估 |
| 用 AUDEBase Saga 工作流替代 NocoBase 工作流 | 破坏 NocoBase 工作流生态 | Saga 作为**补充能力**（跨插件事务），不替代原生引擎 |
| 保留 admin-ui（ProTable/ProForm） | 与 SchemaComponent 两套 UI 框架并行维护 | **用 NocoBase Client**，舍弃自建 admin-ui |
| admin-ui 3 周迁移 | 5,569 行代码 + 架构不兼容 | N/A — 已否决 |
| Phase 1 "1-2 周" | 实际需 4-6 周 | 见下方校准 |

## 2. 技术栈迁移路线

| 层 | AUDEBase (现有) | NocoBase (目标) | 迁移策略 |
|----|----------------|----------------|---------|
| HTTP 框架 | Fastify | Koa | NocoBase 原生，无需迁移 |
| ORM | Drizzle | Sequelize | **Phase 0 核心挑战** — 建立 Drizzle SQL → Sequelize WhereOptions 映射层 |
| 前端 | React 19 + Ant Design 5 + ProLayout | NocoBase Client + SchemaComponent | 放弃自建 admin-ui |
| 构建 | Vite + Turborepo | NocoBase 内置 (webpack/Rspack) | NocoBase 原生 |
| 验证 | Zod | NocoBase utils | 插件内可保留 Zod |
| 测试 | Vitest + Playwright | NocoBase test utils | 逐步迁移 |

## 3. 校准后的 Phase 划分

### Phase 0 — Spike：验证可行性（2 周）

**目标**: 移植 record-rules 到 NocoBase，证明架构可行，做出 go/no-go 决策。

**具体任务**:

| 任务 | 工时 | 产出 |
|------|------|------|
| 安装 NocoBase 开发环境 | 1 天 | 本地 running NocoBase |
| 研究 NocoBase PluginManager API | 2 天 | API 文档笔记 |
| 研究 NocoBase ACL 扩展点（can/canAction/availableAction） | 1 天 | ACL 拦截方案 |
| 研究 Sequelize WhereOptions 格式 | 1 天 | WhereOptions 映射规则 |
| 移植 Poland-notation 解析器（纯逻辑，387 行） | 2 天 | `parseDomainFilter()` 独立为 npm-ready |
| 编写 Sequelize WhereOptions 生成器 | 3 天 | `generateSequelizeWhere(filter)` |
| ACL 中间件集成：拦截 Repository 查询 | 3 天 | 查询自动注入 WHERE |
| 让现有 108 个 record-rules 测试通过 | 2 天 | 全量测试 pass |
| Go/no-go 决策 | 1 天 | 决策文档 |

**Go 条件**: record-rules 插件可在 NocoBase 中正常工作，108 测试全部通过。
**No-go 条件**: Sequelize WhereOptions 映射有不可逾越的技术障碍。

### Phase 1 — 基础插件（4-6 周，仅在 go 后执行）

| 插件 | 内容 | 工时 |
|------|------|------|
| `@audebase/plugin-record-rules` | Phase 0 成果生产化 + 文档 | 1 周 |
| `@audebase/plugin-auth-token-version` | 增强 NocoBase JWT 插件，支持 token_version 撤回 | 1 周 |
| `@audebase/plugin-audit-enhanced` | 从 Drizzle → Sequelize 重写审计适配器 | 2 周 |
| ORM 桥接层 | Drizzle 模型 → Sequelize 模型映射工具 | 2 周 |
| CI/CD 适配 | GitHub Actions 适配 NocoBase 构建体系 | 1 周 |

### Phase 2 — 业务基础（6-8 周，仅在 go 后执行）

| 插件 | 内容 |
|------|------|
| `@audebase/plugin-cron-enhanced` | 增强定时任务 |
| `@audebase/plugin-saga` | Saga 补偿模式（补充能力，不替代 NocoBase 工作流） |
| 文件上传 / 通知 / 健康检查 | 优先使用 NocoBase 原生，仅在差异足够大时自建 |
| 测试迁移 | Vitest → NocoBase test utils（逐模块迁移） |
| 部署适配 | Docker Compose → NocoBase 部署模型 |

### Phase 3 — 业务套件（按需）

OA/ERP/MES 插件直接作为 NocoBase 插件开发，无需迁移。

## 4. 明确放弃

| 项目 | 原因 |
|------|------|
| Trust-grouping | NocoBase PluginManager 无进程隔离架构，实现需 fork 核心 |
| 替代 NocoBase 工作流引擎 | 破坏生态，Saga 作为补充能力 |
| 自建 admin-ui（ProTable/ProForm） | 与 NocoBase SchemaComponent 冲突，维护成本双倍 |
| file-upload / notification / health-check / api-versioning / cron 单独自建 | NocoBase 原生已覆盖，差异化不够 |

## 5. 预期收益

| 指标 | 自建路线 | NocoBase 路线 |
|------|---------|-------------|
| 核心平台开发 | 无限期 | ✅ 现成 |
| 差异化创新 | 3 个架构创新插件 | 3 个架构创新插件 |
| 社区生态 | 1 人 | 200+ 贡献者 |
| 插件市场 | 需自建 | ✅ 现成 |
| 多租户完整隔离 | 需自建 | 企业版可用 |
| 可视化工作流 | 需自建 | ✅ 现成 |

## 6. 存档

原始设计文档保留在 `docs/superpowers/specs/2026-07-21-nocobase-migration-design.md`。

本校准计划替代原 Phase 1-3 时间线。所有工期估计基于实际代码审查（42K 行代码、102 测试文件、0 NocoBase 依赖）和技术深度分析。
