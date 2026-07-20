# AUDEBase 项目状态

**更新日期**: 2026-07-17
**当前阶段**: Phase 1b 完成 - 20 包全部实现, 694 测试通过, tsc 全包 clean

## 项目定位

AUDEBase 是一个面向企业的应用开发平台，对标 Odoo、NocoBase、云表。通过微内核 + 插件热插拔架构，支持 OA、ERP、MES、PLM、WMS 等企业应用的快速开发与部署。

## 模块状态

| 模块 | 状态 | 描述 |
|------|------|------|
| 插件框架 | ✅ Phase 1a | 四层信任分组（SYSTEM/Domain/Isolated/Container） - 53 测试通过 |
| manifest.yaml 系统 | ✅ Phase 1a | 统一声明：元数据+runtime+security+exports - 46 测试通过 |
| RBAC 权限引擎 | ✅ Phase 1a | 基础 tenant_id 过滤 + 角色权限 + JWT 认证 - 60 测试通过 |
| 插件通信 | 🔲 Phase 1b | 组内直调 + 组间 JSON-RPC + Redis Pub/Sub |
| 事件总线 | ✅ Phase 1b | 应用层 EventBus，同进程直接回调 + 跨进程 Redis Pub/Sub（D1.9） - 28 测试通过 |
| 生命周期管理 | ✅ Phase 1a | 7 钩子 + 迁移三阶段 + 2 状态（loaded/disabled，5 状态机 Phase 2） |
| 迁移管理 | ✅ Phase 1a | Odoo 按版本排序 + NocoBase 3 阶段（D1.7）- 30 测试通过 |
| 日志/调试基础设施 | ✅ Phase 1a | 结构化日志 + Core 聚合 + inspector 端口 - 34 测试通过 |
| 管理 UI | ✅ Phase 1a | 插件管理 + 用户管理，Ant Design 5 + ProLayout - 55 测试通过 |
| 前端架构 | ✅ Phase 0 | D6-D24 共 19 项决策，6 项目标验证通过 |
| 国际化 (i18n) | ✅ Phase 1a | Core t() + useTranslation 骨架 + zh-CN - 14 测试通过 |
| 审计日志 | ✅ Phase 1a | API 写操作自动记录（D1.12）- 19 测试通过 |
| 健康检查 | ✅ Phase 1a | GET /health + /health/ready（D1.13）- 23 测试通过 |
| 定时任务 (Cron) | ✅ Phase 1b | BullMQ repeatable jobs（D1.10） - 23 测试通过 |
| API 版本控制 | ✅ Phase 1b | URL 路径 /api/v{major}/{resource}（D1.8） - 41 测试通过 |
| 通知系统 | ✅ Phase 1b 接口 | NotificationProvider 抽象接口（D1.14） - 20 测试通过 |
| WebSocket | 🔲 Phase 2 | Collection 变更事件订阅（D1.11） |
| Schema Engine | 🔲 Phase 2 | 动态模型定义 + Schema->DB 迁移 + Schema->UI 渲染 |
| 插件间数据扩展 | ✅ Phase 1b | extends 声明解析 + 字段合并（D12.1） - 29 测试通过 |
| 文件上传 | ✅ Phase 1b | FileUploadService + 内存 AttachmentRepository - 30 测试通过 |
| 插件市场 | 🔲 Phase 2 | 在线发现/安装/评分插件 |
| 工作流引擎 | 🔲 Phase 4 | 审批流 + 业务流程自动化 |
| OA/ERP/MES 插件 | 🔲 Phase 3/4 | 业务插件套件 |
| Core 内核骨架 | ✅ Phase 1a | Fastify bootstrap + 中间件 + 配置 - 34 测试通过 |
| CLI 工具 | ✅ Phase 1a | aude dev/db:migrate/plugin:create - 16 测试通过 |
| JWT 认证 | ✅ Phase 1a | JWT 签发/验证 + token_version - 34 测试通过 |
| 速率限制 | ✅ Phase 1a | 固定窗口计数器限流 - 19 测试通过 |
| shared-types | ✅ Phase 1a | 公共类型定义 - 53 测试通过 |

## Phase 1a SDD/TDD 文档状态

| 模块 | SDD 文档 | TDD 测试计划 | 编码状态 | AI 工作流状态 |
|------|---------|-------------|---------|-------------|
| shared-types | ✅ shared-types-sdd.md | ✅ shared-types-tdd.md | ✅ 53 测试通过 | ✅ 完成 |
| plugin-framework | ✅ plugin-framework-sdd.md | ✅ plugin-framework-tdd.md | ✅ 53 测试通过 | ✅ 完成 |
| plugin-core | ✅ plugin-core-sdd.md | ✅ plugin-core-tdd.md | ✅ 28 测试通过 | ✅ 完成 |
| manifest-engine | ✅ manifest-engine-sdd.md | ✅ manifest-engine-tdd.md | ✅ 46 测试通过 | ✅ 完成 |
| migration-engine | ✅ migration-engine-sdd.md | ✅ migration-engine-tdd.md | ✅ 30 测试通过 | ✅ 完成 |
| RBAC 权限引擎 | ✅ rbac-sdd.md | ✅ rbac-tdd.md | ✅ 60 测试通过 | ✅ 完成 |
| 审计日志 | ✅ audit-sdd.md | ✅ audit-tdd.md | ✅ 19 测试通过 | ✅ 完成 |
| 健康检查 | ✅ health-check-sdd.md | ✅ health-check-tdd.md | ✅ 23 测试通过 | ✅ 完成 |
| i18n 国际化 | ✅ i18n-sdd.md | ✅ i18n-tdd.md | ✅ 14 测试通过 | ✅ 完成 |
| 管理 UI | ✅ admin-ui-sdd.md | ✅ admin-ui-tdd.md | ✅ 55 测试通过 | ✅ 完成 |
| 日志/调试 | ✅ logging-infra-sdd.md | ✅ logging-infra-tdd.md | ✅ 34 测试通过 | ✅ 完成 |
| Core 内核骨架 | ✅ core-sdd.md | 🔲 待生成 | ✅ 34 测试通过 | ✅ 完成 |
| JWT 认证 | ✅ auth-sdd.md | 🔲 待生成 | ✅ 34 测试通过 | ✅ 完成 |
| CLI 工具 | ✅ cli-sdd.md | 🔲 待生成 | ✅ 16 测试通过 | ✅ 完成 |
| 速率限制 | ✅ rate-limit-sdd.md | 🔲 待生成 | ✅ 19 测试通过 | ✅ 完成 |

| 状态图例 | 含义 |
|---------|------|
| ✅ | 已完成 |
| 📋 | 文档就绪 |
| 🔲 | 未开始 |
| 🔴 | 阻塞/缺失 |

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

- 零源代码 - 仅有配置/文档/代理基础设施
- 无 build scripts - package.json 无 scripts 字段（待 Phase 1a Week 0）
- 无测试基础设施 - 规则要求 80% 覆盖率但无测试框架；vitest + testing-library/react + 种子工厂 + E2E playwright 已在文档中定义
- shared-types 包未创建 - Phase 1a Week 0 优先任务
- package-lock.json + package.json 已出现在工作目录中（来自 npm install），尚未纳入版本控制（待 Week 0 统一初始化）
- pixi bootstrap 脚本已创建但 .bat 跨平台尚未对齐（5 项 C + 5 项 H 留待 Phase 1a Windows 环境）
- 架构文档于 2026-07-09 从 MODACS 工业控制架构重写为 AUDEBase 企业平台架构
- MCP 工具链已优化但依赖未安装（首次启动时 auto-install）：local-antd（@jzone-mcp/antd-components-mcp）、local-drizzle（@iflow-mcp/defrex-drizzle-mcp）

- GO-003 (FIXED): Fastify 全局错误处理器规范 - core-sdd.md 已定义中间件链含 errorHandler
- GO-004 (FIXED): Redis 健康检查 - health-check 模块已实现 checkRedis() PING 检查
- GO-005 (FIXED): tenant_id 自动注入机制 - core-sdd.md 已定义 tenant 中间件注入路径
- GO-006 (FIXED): JWT token_version 字段 - auth-sdd.md 已定义类型/默认值/更新逻辑
- GO-007 (FIXED): Zod 边界验证清单 - core-sdd.md 已定义 API 入口验证点
- GO-008 (FIXED): Core 数据代理 D12 实现 - core-sdd.md 已定义 DatabaseProvider 接口
- GO-009~016 (MEDIUM): Renovate 配置/Drizzle 升级路径/插件资源预算/pg-pool 调优/文件清理/RLS 评估/Error Boundary UI/packages 目录 - Phase 1a 编码时处理
- GO-017~020 (LOW): pixi lock 多平台/migration_failed 恢复流程/租户切换竞态/CVE 监控流程 - Phase 1a 编码时处理
- GO-021 (FIXED): Core 内核骨架 SDD - core-sdd.md 已生成（928 行）
- GO-022 (FIXED): JWT 认证模块 SDD - auth-sdd.md 已生成（640 行）
- GO-025 (FIXED): 环境变量 schema - core-sdd.md 已定义 AUDE_JWT_SECRET/DATABASE_URL/REDIS_URL/PORT/NODE_ENV
- GO-023 (FIXED): CLI 工具 SDD - cli-sdd.md 已生成
- GO-024 (FIXED): Rate Limiting 模块 SDD - rate-limit-sdd.md 已生成
- GO-026 (MEDIUM): 无 CI/CD 流水线定义
- GO-027 (FIXED): 密码策略规范 - auth-sdd.md 已定义 bcrypt cost 12 + 最小长度
- GO-028 (MEDIUM): 多租户无 SDD（multi-tenant.md 是设计文档非 SDD）
- GO-029 (FIXED): 优雅关闭程序 - core-sdd.md 已定义 SIGTERM 处理
- GO-030 (FIXED): CORS 配置规范 - core-sdd.md 已定义 CORS 中间件
- GO-031 (MEDIUM): phase1a-master-plan.md L109 误标 admin-ui-sdd.md 为 ✅
- GO-032 (FIXED): Docker Compose 开发环境配置 - docker-compose.yml 已创建（PostgreSQL 16 + Valkey）
- PA-001 (HIGH, FIXED): 测试文件命名三方不一致 - conventions.md 和 execution-guide 已对齐
- PA-002 (HIGH, FIXED): admin-ui-tdd 覆盖率 70% -> 80% 对齐项目标准
- PA-003 (HIGH): rbac-tdd 20+ 存根测试用例缺少真实 AAA 结构 - Phase 1a 编码时补充
- PA-004 (HIGH): packages/ 目录结构三方不一致 - master-plan 说独立目录, execution-guide 说 packages/core/, AGENTS.md CODE MAP 独立目录 - 待 Phase 1a Week 0 确认
- PV-013 (MEDIUM, FIXED): pitfalls.md L59 引用 frontend-spec.md §6 已修正为 dev-workflow.md §3.6
- PV-015 (HIGH, FIXED): run-node.sh wrapper 已记录在 pitfalls.md MCP 集成相关章节
- PV-017 (MEDIUM, FIXED): openspace MCP pitfall 已更新，补充 run-node.sh 包装器调用说明

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
- 2026-07-15: OpenCode 配置修复 - 创建 run-node.sh 包装器解决 pixi node PATH 传播问题（所有 MCP/LSP 通过包装器启动，子进程继承 pixi 环境 PATH）
- 2026-07-15: pixi.toml 新增 pip>=24.0 依赖 - 修复 OpenSpace MCP 安装中 pip 模块缺失问题（pixi conda-forge python 不含 pip）
- 2026-07-15: doc-audit 第一轮 6 维度审计完成 - 105 项发现（6C/17H/24M/17L + 40 项丢失明细），修复全部 6 CRITICAL + 17 HIGH（agent-guide.md 重写、AGENTS.md MCP/技能/模块文档数修正、opencode.json cpp 规则删除、SDD 状态修正、pixi 行号修正、GO-003~008 记录为已知缺口）
- 2026-07-15: test-harness 技能移植 - 从 AUDESYS 适配到 AUDEBase（Rust/Cargo -> TypeScript/Vitest/Playwright），883 行
- 2026-07-15: skill-creator 技能移植 - 从 AUDESYS 适配到 AUDEBase（Rust/Cargo/FlatBuffers -> TypeScript/SDD/manifest.yaml，3 输入模式），13 个技能全部目录形式
- 2026-07-15: doc-audit 第二轮 6 维度审计完成 - 62 项发现（0C/16H/~28M/~18L），修复全部 16 HIGH + 批量 MEDIUM/LOW（14 文件编辑，13 项修复）
- 2026-07-15: skill-creator 技能移植 - 从 AUDESYS 适配到 AUDEBase（Rust/Cargo/FlatBuffers -> TypeScript/SDD/manifest.yaml，3 输入模式：SDD spec / TypeScript API / Manifest validation），13 个技能全部目录形式
- 2026-07-15: doc-audit 第二轮 6 维度审计完成 - 62 项发现（0C/16H/~28M/~18L），修复全部 16 HIGH + 批量 MEDIUM/LOW
- 2026-07-15: doc-audit 第三轮交互审计完成 - 51 项发现（1C/11H/26M/13L），修复全部 CRITICAL+HIGH（12 项），批量修复 MEDIUM/LOW（12 项），其余记录为已知缺口
- 2026-07-16: Phase 1a 全部完成 - 14 包实现，497 单元测试 + 13 集成测试通过，tsc 全包 clean
- 2026-07-17: Phase 1b 全部完成 - 6 新包实现（event-bus/cron/file-upload/notification/api-versioning/data-extends）+ 4 轨道 UI 集成（多租户/i18n/数据扩展 UI）+ 6 包接入 CoreApp，694 测试通过
