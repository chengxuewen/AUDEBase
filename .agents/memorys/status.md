# AUDEBase 项目状态

**更新日期**: 2026-07-19
**当前阶段**: Phase 4 完成 — 22 packages + Admin UI，752 tests，全部 Phase 完成

## 项目定位

AUDEBase 是一个面向企业的应用开发平台，对标 Odoo、NocoBase、云表。通过微内核 + 插件热插拔架构，支持 OA、ERP、MES、PLM、WMS 等企业应用的快速开发与部署。

## 模块状态

| 模块                   | 状态        | 描述                                                                                                                             |
| ---------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 插件框架               | ✅ Phase 1a | 四层信任分组（SYSTEM/Domain/Isolated/Container），动态加载管线                                                                   |
| manifest.yaml 系统     | ✅ Phase 1a | 统一声明：元数据+runtime+security+exports                                                                                        |
| RBAC 权限引擎          | ✅ Phase 1a | PermissionEngine + rbacGuard 路由守卫 + 粒度权限 (users:read/create/...)；Phase 1.5 字段级权限；Phase 2 完整 Record Rules（D10） |
| 生命周期管理           | ✅ Phase 1a | 7 钩子 + PluginManager + 迁移三阶段 + 2 状态（loaded/disabled）                                                                  |
| 迁移管理               | ✅ Phase 1a | Scanner→Resolver→Executor→Runner，SemVer 排序 + 三阶段（D1.7）                                                                   |
| 日志/调试基础设施      | ✅ Phase 1a | pino 结构化日志 + redaction + X-Request-ID                                                                                       |
| 管理 UI                | ✅ Phase 1a | Login + Dashboard + 用户 CRUD + 角色管理 + 插件管理，Ant Design 5 + ProLayout + ProTable/ProForm                                 |
| 国际化 (i18n)          | ✅ Phase 1a | I18nEngine + Accept-Language + namespace 隔离 + zh-CN；1b: 完整多语言切换器                                                      |
| 审计日志               | ✅ Phase 1a | AuditService + auditCapture onResponse hook（D1.12）                                                                             |
| 健康检查               | ✅ Phase 1a | GET /health + /health/ready（D1.13）                                                                                             |
| 内核 (Kernel)          | ✅ Phase 1a | Fastify + Drizzle + JWT auth + CRUD API + CLI + 多租户中间件 + 插件管线                                                          |
| 插件内核 (plugin-core) | ✅ Phase 1a | Bootstrap 引导数据（admin 用户 + 默认角色 + 系统租户）                                                                           |

## Phase 1a SDD/TDD 文档状态

| 模块             | SDD 文档                   | TDD 测试计划               | 编码状态    | AI 工作流状态   |
| ---------------- | -------------------------- | -------------------------- | ----------- | --------------- |
| shared-types     | ✅ shared-types-sdd.md     | ✅ shared-types-tdd.md     | ✅ Phase 1a | 📋 SDD+TDD 完成 |
| plugin-framework | ✅ plugin-framework-sdd.md | ✅ plugin-framework-tdd.md | ✅ Phase 1a | 📋 SDD+TDD 完成 |
| plugin-core      | ✅ plugin-core-sdd.md      | ✅ plugin-core-tdd.md      | ✅ Phase 1a | 📋 SDD+TDD 完成 |
| manifest-engine  | ✅ manifest-engine-sdd.md  | ✅ manifest-engine-tdd.md  | ✅ Phase 1a | 📋 SDD+TDD 完成 |
| migration-engine | ✅ migration-engine-sdd.md | ✅ migration-engine-tdd.md | ✅ Phase 1a | 📋 SDD+TDD 完成 |
| RBAC 权限引擎    | ✅ rbac-sdd.md             | ✅ rbac-tdd.md             | ✅ Phase 1a | 📋 SDD+TDD 完成 |
| 审计日志         | ✅ audit-sdd.md            | ✅ audit-tdd.md            | ✅ Phase 1a | 📋 SDD+TDD 完成 |
| 健康检查         | ✅ health-check-sdd.md     | ✅ health-check-tdd.md     | ✅ Phase 1a | 📋 SDD+TDD 完成 |
| i18n 国际化      | ✅ i18n-sdd.md             | ✅ i18n-tdd.md             | ✅ Phase 1a | 📋 SDD+TDD 完成 |
| 管理 UI          | ✅ admin-ui-sdd.md         | ✅ admin-ui-tdd.md         | ✅ Phase 1a | 📋 SDD+TDD 完成 |
| 日志/调试        | ✅ logging-infra-sdd.md    | ✅ logging-tdd.md          | ✅ Phase 1a | 📋 SDD+TDD 完成 |

| 状态图例 | 含义      |
| -------- | --------- |
| ✅       | 已完成    |
| 📋       | 文档就绪  |
| 🔲       | 未开始    |
| 🔴       | 阻塞/缺失 |

**注**: SDD 文档引用 docs/modules/ 目录下的对应文件。TDD 测试计划由 AI 代理在编码前根据 SDD 接口定义生成。详见 AGENTS.md。

## Phase 1b-4 模块状态

| 模块            | 状态        | 描述                                                   |
| --------------- | ----------- | ------------------------------------------------------ |
| 插件通信        | ✅ Phase 1b | JSON-RPC over stdin/stdout + Redis Pub/Sub（D1.3）     |
| 事件总线        | ✅ Phase 1b | publish/subscribe + Zod payload 校验（D1.9）           |
| 定时任务 (Cron) | ✅ Phase 1b | BullMQ repeatable jobs（D1.10）                        |
| 通知系统        | ✅ Phase 1b | NotificationProvider 抽象接口（D1.14）                 |
| Schema Engine   | ✅ Phase 2  | 动态模型定义 + Schema→DB DDL + Schema→UI 映射（D3/D7） |
| WebSocket       | ✅ Phase 2  | Collection 变更事件订阅（D1.11）                       |
| 工作流核心      | ✅ Phase 4  | Saga 补偿模式 + 幂等性（D13）                          |
| 工作流引擎      | ✅ Phase 4  | 工作流定义与执行引擎                                   |
| 工作流任务      | ✅ Phase 4  | 工作流任务执行器                                       |

**注**: Phase 3（OpenTelemetry + 插件市场 + Database-per-tenant）尚未编码。

## 已知缺失

- MCP 工具链：local-postgres 等待 Docker Compose 连接
- 前端：ProTable/ProForm antd v6 兼容性待跟踪（pro-components#9629）
- 性能：百万级数据性能未经生产验证
- 部署：无 Kubernetes Helm Chart
- 安全：无第三方渗透测试报告

## MCP 工具链

| MCP              | 状态 | 用途                                                 |
| ---------------- | :--: | ---------------------------------------------------- |
| local-codegraph  |  ✅  | 代码探索                                             |
| local-playwright |  ✅  | E2E 浏览器测试                                       |
| local-antd       |  ✅  | Ant Design 5 组件文档（替代 shadcn/tailwind/lucide） |
| local-drizzle    |  ✅  | Drizzle ORM Schema 内省/迁移/查询                    |
| local-postgres   |  ❌  | PostgreSQL 直连（等待 Docker Compose 启动）          |
| local-openspace  |  ✅  | OpenSpace MCP（从 AUDESYS 移植并修复连接问题）       |

## 近期工作

- 2026-07-08: 项目从 MODACS 分离，首次提交
- 2026-07-08: 清理所有非意图性 MODACS 引用
- 2026-07-08: 创建 4 个 memorys 文件
- 2026-07-09: 重新定位 — 从工业控制平台转为 Odoo/NocoBase 式企业应用开发平台
- 2026-07-09: architecture.md 完全重写，对齐新架构
- 2026-07-09: decisions.md 更新，废弃旧工业控制决策
- 2026-07-09: 插件架构深度分析：5 轮团队审核，117 项发现全部关闭
- 2026-07-09: 文档 docs/plugin-architecture-analysis.md 完成
- 2026-07-09: 对比 NocoBase/Odoo/VS Code/Erlang/K8s 等 8 个主流项目
- 2026-07-09: 核心架构决策：四层信任分组、manifest.exports 契约、Record Rules、Saga 事务（D1-D14）
- 2026-07-09: 技术栈审核：4 人团队，21 项发现全部关闭（D6.1/D8.1/D9.1）
- 2026-07-09: architecture.md 新增技术栈工具链（BullMQ/Vitest/Turborepo/Valkey）
- 2026-07-09: 4 次 git 提交（main 分支）
- 2026-07-09: 多租户架构审核（R6）：4 人团队，22 项发现 + 14 验证修正点，全部关闭
- 2026-07-09: decisions.md: D4 更新（四阶段演进）+ D4.1 新增（文件存储隔离：本地路径 → MinIO/S3 content-addressed）
- 2026-07-09: architecture.md 扩展至完整的四阶段多租户设计（含连接池策略、资源预算、共享数据模型、文件存储、迁移路径）
- 2026-07-09: 6 轮团队审核完成（R1-R6），累计 139+ 发现
- 2026-07-10: 前端架构全面重写：从 Tailwind+shadcn 改为纯 Ant Design 5 + ProLayout
- 2026-07-10: 4 轮团队审核（R1-R4），累计 40 项发现全部关闭
- 2026-07-10: decisions.md 新增 D15-D24（10 项前端决策），D6-D14 多项更新
- 2026-07-10: architecture.md 扩展为 12 个子章节（6.1-6.12）
- 2026-07-10: 与 NocoBase/Odoo/Directus/Strapi/Saleor/VS Code 六个项目交叉验证通过
- 2026-07-10: 前端架构可交付 Phase 1 实施
- 2026-07-10: 竞品调研完成：39+ 产品竞品报告（competitive-landscape.md）+ 15 份详细产品画像参考文档（docs/reference/）
- 2026-07-10: 文档交叉审计完成：32 项发现（5 CRITICAL + 10 HIGH + 14 MEDIUM + 3 LOW），全部确认并修复
- 2026-07-10: decisions.md 新增 D1.6-D1.14（内核插件、迁移管理、API 版本、事件总线、Cron、WebSocket、审计日志、健康检查、通知接口）
- 2026-07-10: docs/modules/ 新增 tech-stack.md + file-storage.md，完善已有 3 份模块文档
- 2026-07-10: decisions.md 新增 D12.1（插件间数据模型扩展）、D10 补充 Domain Filter 语法规范
- 2026-07-10: architecture.md 第三轮审计（阶段优化）：Phase 1 拆分为 1a/1b 五阶段路线图
- 2026-07-13: 10 项 Q&A 交互审计完成，全部确认并落实到文档
- 2026-07-17: Phase 1a 编码完成 — 12 packages (kernel, shared-types, plugin-framework, plugin-core, manifest-engine, migration-engine, RBAC, audit, i18n, health-check, logging-infra, admin-ui)，384 tests
- 2026-07-17: kernel 模块完成 — Fastify + Drizzle + JWT auth + CRUD API + CLI + 启动管线
- 2026-07-17: admin-ui 完成 — Login + Dashboard + 用户 CRUD + 角色管理 + 插件管理，Ant Design 5 + ProLayout + ProTable/ProForm
- 2026-07-18: P1.5 集成冲刺完成 — 插件加载管线（动态 manifest 扫描）、多租户中间件（X-Tenant-Id）、RBAC 路由守卫（所有 CRUD 端点）、Admin UI 真实 API 接入
- 2026-07-18: Phase 1a 收尾 — RoomManagementPage、tenant CLI、E2E smoke test、文档同步
- 2026-07-13: team-mode 5 人审计完成（29 项发现：7C/8H/10M/4L），全部确认并修复
- 2026-07-13: 新增 SDD 文档 7 份，TDD 文档 11 份，约束文档 4 份更新
- 2026-07-13: team-mode 5 人文档审计（107 项发现：18C/36H/34M/19L）+ 5 人修复团队（46 份 MD 全部修复到位）
- 2026-07-13: docs/plans/ 创建 5 份 Phase 1a 执行计划文档（~160KB）
- 2026-07-14: Git 提交 fc572f6 — 47 文件，+21K 行：7 SDD + 11 TDD + 5 执行计划 + 4 约束文档更新
- 2026-07-14: MCP 工具链优化 — 移除 4 个无关 MCP（remote-qt-docs、local-shadcn、local-tailwind、local-lucide），新增 Ant Design 5 MCP 和 Drizzle ORM MCP，local-postgres 暂时禁用
- 2026-07-14: book-to-skill 技能集成 — 从 virgiliojr94/book-to-skill 克隆到 .agents/skills/（41 文件，5680 行 Python）
- 2026-07-14: OpenSpace MCP 移植 — 从 AUDESYS 移植 init-mcp-openspace.mjs
- 2026-07-14: pixi bootstrap 基础设施 — pixi.toml 配置、bootstrap.sh/bat（一步启动开发环境）、pixi-init.sh/bat（pixi 安装+版本锁定）、pixi-shell.sh/bat（环境激活）、_common.sh（SCRIPT_DIR 公共模块）
- 2026-07-14: 部署流水线 — deploy-pack.py（pixi-pack 打包）+ deploy-unpack.py（pixi-unpack 解包+跨平台激活提示）+ archive-source.sh
- 2026-07-14: MCP 工具链完善 — 新增 local-antd + local-drizzle init 脚本（auto-install），修复 local-openspace 连接问题（-32000: Connection closed 根因：pixi run 需 task + win-64 平台解析失败）
- 2026-07-14: .gitignore 清理 — 添加 coverage/、.env*、*.log 忽略；移除 drizzle.config.ts 忽略 + 21 行遗留模式（xemacs/MinGW/Visual Studio）
- 2026-07-14: 部署流水线审计 — 4 人团队，19 项发现全部修复（shell/.bat 脚本优化、pixi-pack 集成、跨平台对齐）
- 2026-07-14: pixi 配置+脚本审计 — 4 人团队，68 项发现（9C+20H+21M+18L），修复全部 29 项 CRITICAL+HIGH（pixi.toml feature 环境、异常处理、错误边界）
