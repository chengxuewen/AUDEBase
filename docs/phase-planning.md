# AUDEBase Phase Planning — 单一真实来源

> **创建日期**: 2026-07-13  
> **目的**: 集中管理所有 Phase 划分、模块归属、依赖关系和验收标准。architecture.md 和 decisions.md 中的 Phase 信息以本文档为准。  
> **来源于**: team-mode 4 人审计（arch-analyst / comp-analyst / risk-analyst / optimizer）24 项发现全部确认，本文档汇总发现 #1-#24 的决策调整。

---

## Phase 总览

| Phase | 代号 | 目标 | 预计工时 | 状态 |
|-------|------|------|:---:|:---:|
| **Week 0** | CI/CD & 基础设施 | Turborepo + Vitest + Playwright + GitHub Actions + Docker Compose + antd 5 兼容性验证 | ~4.5天 | 🔲 待启动 |
| **Phase 1a** | 内核 MVP | 插件框架可用：安装插件 → 管理用户 → 查看日志 端到端流程 | 4-6 周（4 人并行） | 🔲 |
| **Phase 1b** | 平台能力扩展 | EventBus + Cron + 文件上传 + 通知接口 + 迁移管理完整版 | 3-4 周 | 🔲 |
| **Phase 2** | Schema Engine | 动态模型定义 + Schema→DB + Schema→UI + 进程隔离 + Record Rules | 待定 | 🔲 |
| **Phase 3** | 生态与合规 | OpenTelemetry + 插件市场 + Database-per-tenant + 混合模式 | 待定 | 🔲 |
| **Phase 4** | 高可用与业务 | Core HA + 工作流引擎 + 业务插件套件 + 1000+ 租户混合模式 | 待定 | 🔲 |

---

## Week 0 — CI/CD 与基础设施搭建（启动前置条件）

> **来自发现 #3：零 CI/CD + Test Infra 阻塞**
> 所有开发者 Week 1 启动前必须完成。

| 任务 | 输出 | 责任人 | 预计 |
|------|------|:---:|:---:|
| Turborepo + pnpm workspace 初始化 | 根 package.json + turbo.json + packages/ 目录结构 | Person A | 0.5d |
| Vitest 配置 + 覆盖率门禁 | vitest.config.ts（80% lines/thresholds）+ 第一个测试用例 | Person A | 0.5d |
| GitHub Actions CI 流水线 | lint → type-check → test(含 coverage gate) → build 流水线，PR 低于 80% 阻断 | Person A | 0.5d |
| Docker Compose 开发环境 | PostgreSQL + Redis + Adminer 一键启动 | Person A | 0.5d |
| React 19 + antd 5 兼容性验证 | Playwright E2E 覆盖 ProLayout/ProTable/ProForm/ErrorBoundary/Suspense | Person D | 0.5d |
| antd v6 兼容性检测 + 降级预案 | pro-components#8686/#9629 状态记录，fallback 方案写入 pitfalls.md | Person D | 0.5d |
| Prettier + ESLint 配置 | .prettierrc + eslint.config.mjs | Person A | 0.5d |
| Husky pre-commit hook | lint-staged 自动格式检查 | Person A | 0.5d |
| shared-types 初始化 | packages/shared-types/ (User/Role/Permission/Plugin/ErrorCode/ApiResponse) + Zod schema 导出 | Person A | 0.5d |

---

## Phase 1a — 内核 MVP（P0 模块）

**目标**: 从零到一，证明插件架构可行。

### 模块清单（P0-1a）

| # | 模块 | 核心交付 | 前置依赖 | 发现来源 |
|---|------|----------|----------|----------|
| 1 | **内核骨架** | Fastify 应用、pnpm workspace、Drizzle DB 连接、/health + /health/ready | 无 | — |
| 2 | **数据库 Schema** | 完整 DDL（users, roles, permissions, user_roles, modules, collections, audit_log, migration_history, refresh_tokens）| #1 | 发现 #10 |
| 3 | **CLI 工具** | `aude dev`、`aude db:migrate`、`aude plugin:create`（精简为 3 命令）| #1 | 发现 #18 |
| 4 | **plugin-core Bootstrap** | admin/角色/菜单初始数据 + modules + collections 注册表 | #2 | D1.6、发现 #5 |
| 5 | **迁移管理（基础）** | migration_history 表 + 三阶段 SQL 引擎（preload/postsync/postload）+ CI dry-run | #2 | 发现 #1 |
| 6 | **插件框架** | 插件发现、manifest 验证、7 生命周期钩子、InlinePluginHost（含 JSON 序列化往返断言）| #2 | D1/D1.1/D1.2/D1.4、发现 #7、发现 #8 |
| 7 | **JWT 认证** | access token（15min）+ refresh token（7d）+ token_version 撤回 + login/refresh 端点 | #2、#6 | 发现 #6 |
| 8 | **基础 RBAC** | 用户→角色→权限模型、API 中间件拦截、rbac:assign_role/rbac:revoke_role 审计 | #2、#7 | 发现 #24 |
| 9 | **多租户（骨架）** | 所有表含 tenant_id 列 + Drizzle 自动注入 WHERE tenant_id | #2 | 发现 #4 |
| 10 | **审计日志** | audit_log 表 + Core 中间件自动记录 API 写操作 | #2、#8 | D1.12 |
| 11 | **国际化（骨架）** | Core t() + useTranslation() 挂钩 + zh-CN 翻译文件（无语言切换器）| #6 | 发现 #2 |
| 12 | **管理 UI** | ProLayout 骨架 + 插件管理页（列表/安装/启用/禁用）+ 用户管理页（CRUD）+ Provider Stack（TenantProvider→UserProvider→ACLProvider→ProLayout）| #6、#7、#8 | D16/D18/D19/D20 |
| 13 | **日志/调试** | pino 结构化日志 + X-Request-ID + GET /api/logs（最近 100 条）| #1 | — |
| 14 | **速率限制** | @fastify/rate-limit，per-IP + per-endpoint（全局 100/min，/auth/login 5/min）| #1 | 发现 #22 |
| 15 | **API 规范与约定** | api-specification.md（9 端点）+ api-conventions.md（分页/过滤/排序/错误）| #1 | 发现 #9、#19、#20 |

> **显式延期决策**: AUTO-CRUD API（Collection 自动生成 REST 端点）和 Data Browser（通用 ProTable 数据浏览器）延期至 Phase 2。所有对标产品（Odoo/NocoBase/Directus/Strapi/ERPNext）均在 Day 1 提供这两个能力，但 AUDEBase Phase 1a 优先构建内核基础设施（插件框架 + RBAC + 审计）。Phase 1a 的审计日志查看器（`GET /api/audit-logs` + audit log page）可作为 Data Browser Lite。见 comp-analyst 审计报告。

### Phase 1a 4 人并行分工

| 角色 | 负责模块 | 前置条件 |
|------|----------|----------|
| **Person A — Kernel & CI** | #1 内核骨架、#3 CLI、#5 迁移管理、#13 日志、#14 速率限制、shared-types | Week 0 |
| **Person B — Plugin Framework** | #6 插件框架、#4 plugin-core Bootstrap | #1、#2 |
| **Person C — Data & Auth** | #2 DB Schema、#7 JWT 认证、#8 RBAC、#9 多租户、#10 审计 | #1 |
| **Person D — Admin UI** | #12 管理 UI、#11 i18n 骨架 | #1、#7、#8 |

### Phase 1a 验收标准

| 模块 | P0 必须通过 | 发现 |
|------|------------|:---:|
| 内核骨架 | (1) `GET /health` 返回 `{ status:"ok", db:true, redis:true, uptime:N }` (2) `GET /health/ready` DB 就绪后 200 (3) pnpm workspace packages/ 可相互引用 (4) 启动时 assert(AUDE_JWT_SECRET.length >= 32) | — |
| 插件框架 | (1) `PluginManager.discover()` 发现 manifest.yaml 插件 (2) `plugin.load()` 触发 7 钩子链（afterAdd→beforeLoad→load），首次触发 install→afterEnable (3) manifest name/version 缺失拒绝加载 (4) 插件通过 Core db 代理查询 (5) `--strict-plugin-host` 模式下 JSON.parse(JSON.stringify(params)) 往返断言 | #7、#8 |
| CLI | `aude dev` 启动开发服务器、`aude db:migrate` 执行迁移、`aude plugin:create <name>` 生成插件骨架 | #18 |
| DB Schema | 所有表 DDL 与 database-schema.md 一致，含 tenant_id 列 + 索引 | #10 |
| 迁移管理 | (1) migration_history 表追踪版本 (2) preload→postsync→postload 三阶段执行 (3) 迁移失败时跳过该插件（不阻塞启动）+ 错误日志 | #16 |
| JWT 认证 | (1) POST /api/auth/login 返回 access + refresh token (2) POST /api/auth/refresh 刷新 access token (3) token_version 更新后旧 token 失效 | #6 |
| RBAC | (1) admin 创建角色分配权限 (2) 无效 token → 401 (3) 无权限 → 403 (4) rbac:* 动作写入 audit_log | #24 |
| 多租户 | (1) tenant-A 和 tenant-B 用户数据互不可见 (2) Drizzle 自动注入 WHERE tenant_id = currentTenantId | #4 |
| 审计日志 | (1) API 写操作自动记录到 audit_log (2) 含 actor_id, action, resource_type, resource_id, ip, user_agent | — |
| i18n 骨架 | (1) t('key') 返回 zh-CN 翻译 (2) useTranslation() Hook 可用 (3) 无 UI 语言切换器 | #2 |
| 管理 UI | (1) ProLayout 渲染侧边栏菜单 (2) 插件管理页：列表 + 启用/禁用 (3) 用户管理页：CRUD (4) Provider Stack 层级正确 (5) ACLGuard 控制按钮可见性 (6) 插件崩溃降级 UI | — |
| 日志/调试 | (1) X-Request-ID 自动注入 (2) pino JSON 日志含 timestamp/level/requestId (3) GET /api/logs 返回最近 100 条 | — |
| 速率限制 | (1) 全局 100/min 超限返回 429 + Retry-After (2) /auth/login 5/min | #22 |

**Phase 1a 不包含**: EventBus（→1b）、Cron（→1b）、完整 i18n 切换器（→1b）、文件上传（→1b）、通知接口（→1b）、WebSocket（→P2）、Record Rules（→P2）、字段级权限（→P2）、Saga（→P4）、Schema Engine（→P2）。

---

## Phase 1b — 平台能力扩展

| # | 模块 | 交付物 | 前置依赖 |
|---|------|--------|----------|
| 1 | **事件总线** | Core EventBus publish/subscribe、同进程回调、Zod payload 校验 | Phase 1a |
| 2 | **定时任务** | BullMQ repeatable jobs、manifest cron 声明、`this.app.cron.add()` API | Phase 1a |
| 3 | **文件上传** | 本地存储 + attachment 元数据表 + POST /api/files（含 magic bytes、白名单、20MB 上限、路径穿越防护）| Phase 1a、发现 #21 |
| 4 | **通知接口** | NotificationProvider 抽象接口（send(recipient, template, data)）| Phase 1a |
| 5 | **API 版本路由** | /api/v{major}/{resource} 路径版本 | Phase 1a |
| 6 | **迁移管理（CLI upgrade + Admin UI）** | `aude plugin upgrade` CLI 命令、Admin UI "升级" 按钮 | Phase 1a #5 |
| 7 | **多租户管理 UI** | 租户创建/切换/配置页面 | Phase 1a #9、#12 |
| 8 | **国际化（完整）** | 多语言切换器 + en-US 翻译 + locale/{lang}.json 懒加载 | Phase 1a #11 |
| 9 | 插件间数据扩展 | extends 声明解析 + Core CollectionRegistry 字段合并（D12.1） | Phase 1a #6 |

---

## Phase 2 — Schema Engine

| 模块 | 说明 |
|------|------|
|| Schema Engine | 动态 Collection + Field 定义、Schema→DB DDL 自动迁移、Schema→UI 映射器 |
|| **Auto-CRUD API** | Collection 定义后自动生成 REST CRUD 端点（对标 NocoBase/Directus/Odoo） |
|| **Data Browser** | 通用 ProTable 数据浏览器，可浏览任意 DB 表（对标 Directus Data Studio） |
|| 进程模式 + Container 隔离 | Isolated 独立进程、Container iframe+postMessage |
| manifest.exports 契约验证 | Zod schema 类型校验 + ServiceRegistry |
| 5 状态机 | loaded/installed/upgrading/disabling/disabled |
| 完整 Record Rules | Odoo domain filter + 字段级权限 |
| WebSocket | Collection 变更事件订阅 |
| 通知渠道实现 | Email（nodemailer）+ InApp + Webhook |
| 多租户 Schema 隔离（Phase 1.5） | PostgreSQL Schema-per-tenant |

---

## 依赖关系图（Phase 1a 内部）

```
Week 0 (Turborepo + CI + Docker) 
  │
  ├─→ #1 内核骨架 (Fastify + Drizzle)
  │     │
  │     ├─→ #2 DB Schema (DDL 文件)
  │     ├─→ #3 CLI (aude dev/db:migrate/plugin:create)
  │     ├─→ #13 日志/调试
  │     ├─→ #14 速率限制
  │     └─→ #15 API 规范与约定
  │
  └─→ #2 DB Schema
        │
        ├─→ #4 plugin-core Bootstrap (admin/roles/menus)
        ├─→ #5 迁移管理
        ├─→ #7 JWT 认证
        │     │
        │     └─→ #8 基础 RBAC
        │           │
        │           └─→ #11 i18n 骨架
        │
        ├─→ #9 多租户骨架 (tenant_id)
        └─→ #10 审计日志

Person D:
  Week 0 → #12 管理 UI (依赖 #7 JWT + #8 RBAC)
```

---

## 参考

- 架构文档: [architecture.md](architecture.md) §七、§八
- 决策记录: `../.agents/memorys/decisions.md`（48 条决策）
- 项目状态: `../.agents/memorys/status.md`
- 审计摘要: 见本文件 §Phase 总览、发现 #1-#24
