# AUDEBase 项目状态

**更新日期**: 2026-07-13
**当前阶段**: Phase 0 完成 — 34+29=63 项审计发现全部落实到文档，可进入 Phase 1a 编码

## 项目定位

AUDEBase 是一个面向企业的应用开发平台，对标 Odoo、NocoBase、云表。通过微内核 + 插件热插拔架构，支持 OA、ERP、MES、PLM、WMS 等企业应用的快速开发与部署。

## 模块状态

| 模块 | 状态 | 描述 |
|------|------|------|
| 插件框架 | 🔲 Phase 1a | 四层信任分组（SYSTEM/Domain/Isolated/Container）|
| manifest.yaml 系统 | 🔲 Phase 1a | 统一声明：元数据+runtime+security+exports |
| RBAC 权限引擎 | 🔲 Phase 1a | 基础 tenant_id 过滤 + 角色权限 + 多租户隔离；Phase 1.5 字段级权限；Phase 2 完整 Record Rules（D10）|
| 插件通信 | 🔲 Phase 1b | 组内直调 + 组间 JSON-RPC + Redis Pub/Sub |
| 事件总线 | 🔲 Phase 1b | 应用层 EventBus，同进程直接回调 + 跨进程 Redis Pub/Sub（D1.9）|
| 生命周期管理 | 🔲 Phase 1a | 7 钩子 + 迁移三阶段 + 2 状态（loaded/disabled，5 状态机 Phase 2）|
| 迁移管理 | 🔲 Phase 1a | Odoo 按版本排序 + NocoBase 3 阶段（D1.7）|
| 日志/调试基础设施 | 🔲 Phase 1a | 结构化日志 + Core 聚合 + inspector 端口 |
| 管理 UI | 🔲 Phase 1a | 插件管理 + 用户管理，Ant Design 5 + ProLayout + ProTable/ProForm |
| 前端架构 | ✅ Phase 0 | D6-D24 共 19 项决策，6 项目标验证通过 |
| 国际化 (i18n) | 🔲 Phase 1a→1b | 1a: Core t() + useTranslation 骨架 + zh-CN; 1b: 完整多语言切换器 |
| 审计日志 | 🔲 Phase 1a | API 写操作自动记录（D1.12）|
| 健康检查 | 🔲 Phase 1a | GET /health + /health/ready（D1.13）|
| 定时任务 (Cron) | 🔲 Phase 1b | BullMQ repeatable jobs（D1.10）|
| API 版本控制 | 🔲 Phase 1b | URL 路径 `/api/v{major}/{resource}`（D1.8）|
| 通知系统 | 🔲 Phase 1b 接口 / Phase 2 实现 | NotificationProvider 抽象接口（D1.14）|
| WebSocket | 🔲 Phase 2 | Collection 变更事件订阅（D1.11）|
| Schema Engine | 🔲 Phase 2 | 动态模型定义 + Schema→DB 迁移 + Schema→UI 渲染 |
| 插件间数据扩展 | 🔲 Phase 1b | extends 声明解析 + 字段合并（D12.1）|
| 插件市场 | 🔲 Phase 2 | 在线发现/安装/评分插件 |
| 工作流引擎 | 🔲 Phase 4 | 审批流 + 业务流程自动化 |
| OA/ERP/MES 插件 | 🔲 Phase 3/4 | 业务插件套件 |

## Phase 1a SDD/TDD 文档状态

| 模块 | SDD 文档 | TDD 测试计划 | 编码状态 | AI 工作流状态 |
|------|---------|-------------|---------|-------------|
| shared-types | ✅ shared-types-sdd.md | ✅ shared-types-tdd.md | 🔲 Week 0 | 📋 SDD+TDD 完成 |
| plugin-framework | ✅ plugin-framework-sdd.md | ✅ plugin-framework-tdd.md | 🔲 Phase 1a | 📋 SDD+TDD 完成 |
| plugin-core | ✅ plugin-core-sdd.md | ✅ plugin-core-tdd.md | 🔲 Phase 1a | 📋 SDD+TDD 完成 |
| manifest-engine | ✅ manifest-engine-sdd.md | ✅ manifest-engine-tdd.md | 🔲 Phase 1a | 📋 SDD+TDD 完成 |
| migration-engine | ✅ migration-engine-sdd.md | ✅ migration-engine-tdd.md | 🔲 Phase 1a | 📋 SDD+TDD 完成 |
| RBAC 权限引擎 | ✅ rbac-sdd.md | ✅ rbac-tdd.md | 🔲 Phase 1a | 📋 SDD+TDD 完成 |
| 审计日志 | ✅ audit-sdd.md | ✅ audit-tdd.md | 🔲 Phase 1a | 📋 SDD+TDD 完成 |
| 健康检查 | ✅ health-check-sdd.md | ✅ health-check-tdd.md | 🔲 Phase 1a | 📋 SDD+TDD 完成 |
| i18n 国际化 | ✅ i18n-sdd.md | ✅ i18n-tdd.md | 🔲 Phase 1a | 📋 SDD+TDD 完成 |
| 管理 UI | ✅ admin-ui-sdd.md | ✅ admin-ui-tdd.md | 🔲 Phase 1a | 📋 SDD+TDD 完成 |
| 日志/调试 | ✅ logging-infra-sdd.md | ✅ logging-tdd.md | 🔲 Phase 1a | 📋 SDD+TDD 完成 |

| 状态图例 | 含义 |
|---------|------|
| ✅ | 已完成 |
| 📋 | 文档就绪 |
| 🔲 | 未开始 |
| 🔴 | 阻塞/缺失 |

**注**: SDD 文档引用 docs/modules/ 目录下的对应文件。TDD 测试计划由 AI 代理在编码前根据 SDD 接口定义生成。详见 AGENTS.md §AI-DRIVEN SDD/TDD 工作流。
## 已知缺失

- 零源代码 — 仅有配置/文档/代理基础设施
- 无 build scripts — `package.json` 无 scripts 字段
- 无测试基础设施 — 规则要求 80% 覆盖率但无测试框架；vitest + @testing-library/react + 种子工厂 + E2E playwright 已在文档中定义
- 架构文档于 2026-07-09 从 MODACS 工业控制架构重写为 AUDEBase 企业平台架构
- shared-types 包未创建 — Phase 1a Week 0 优先任务

## 近期工作

- 2026-07-08: 项目从 MODACS 分离，首次提交
- 2026-07-08: 清理所有非意图性 MODACS 引用
- 2026-07-08: 创建 4 个 memorys 文件
- 2026-07-09: 重新定位 — 从工业控制平台转为 Odoo/NocoBase 式企业应用开发平台
- 2026-07-09: architecture.md 完全重写，对齐新架构
- 2026-07-09: decisions.md 更新，废弃旧工业控制决策
- 2026-07-09: 插件架构深度分析：5 轮团队审核，117 项发现全部关闭
- 2026-07-09: 文档 `docs/plugin-architecture-analysis.md` 完成
- 2026-07-09: 对比 NocoBase/Odoo/VS Code/Erlang/K8s 等 8 个主流项目
- 2026-07-09: 核心架构决策：四层信任分组、manifest.exports 契约、Record Rules、Saga 事务（D1-D14）
- 2026-07-09: 技术栈审核：4 人团队，21 项发现全部关闭（D6.1/D8.1/D9.1）
- 2026-07-09: architecture.md 新增技术栈工具链（BullMQ/Vitest/Turborepo/Valkey）
- 2026-07-09: 4 次 git 提交（main 分支）
- 2026-07-09: 多租户架构审核（R6）：4 人团队，22 项发现 + ~14 验证修正点，全部关闭
- 2026-07-09: decisions.md: D4 更新（四阶段演进）+ D4.1 新增（文件存储隔离：本地路径 → MinIO/S3 content-addressed）
- 2026-07-09: architecture.md §五 扩展至完整的四阶段多租户设计（含连接池策略、资源预算、共享数据模型、文件存储、迁移路径）
- 2026-07-09: 6 轮团队审核完成（R1-R6），累计 139+ 发现
- 2026-07-10: 前端架构全面重写：从 Tailwind+shadcn 改为纯 Ant Design 5 + ProLayout
- 2026-07-10: 4 轮团队审核（R1-R4），累计 40 项发现全部关闭
- 2026-07-10: decisions.md 新增 D15-D24（10 项前端决策），D6-D14 多项更新
- 2026-07-10: architecture.md §六 扩展为 12 个子章节（6.1-6.12）
- 2026-07-10: 与 NocoBase/Odoo/Directus/Strapi/Saleor/VS Code 六个项目交叉验证通过
- 2026-07-10: 前端架构可交付 Phase 1 实施
- 2026-07-10: 完成竞品调研：39+ 产品竞品报告（competitive-landscape.md）+ 15 份详细产品画像参考文档（docs/reference/）
- 2026-07-10: 文档交叉审计完成：32 项发现（5 CRITICAL + 10 HIGH + 14 MEDIUM + 3 LOW），全部确认并修复
- 2026-07-10: decisions.md 新增 D1.6-D1.14（内核插件、迁移管理、API 版本、事件总线、Cron、WebSocket、审计日志、健康检查、通知接口）
- 2026-07-10: docs/modules/ 新增 tech-stack.md + file-storage.md，完善已有 3 份模块文档
- 2026-07-10: decisions.md 新增 D12.1（插件间数据模型扩展）、D10 补充 Domain Filter 语法规范
- 2026-07-10: architecture.md §七~§十 二次交叉审计：~46 项发现全部修复（§七 P0 补充 7 模块、§八 路线图同步、§九 索引表重写、§十 参考补全）
- 2026-07-10: architecture.md 第三轮审计（阶段优化）：Phase 1 拆分为 1a/1b 五阶段路线图、P0 表扩展、补充 JWT/CLI/速率限制/文件上传 4 模块、验收标准完善
- 2026-07-13: 发现 #25-#34 Q&A 交互审计完成，10 项全部确认并落实到文档：.env.template、dev-workflow.md、frontend-spec.md、api-conventions.md §11 错误处理
- 2026-07-13: team-mode 5 人审计完成（arch-analyst / tdd-analyst / test-analyst / comp-analyst / optimizer），29 项发现全部确认并修复：
  - **CRITICAL 7 项**: D1.9 EventBus Phase 1→1b、plugin-framework.md 生命周期同步、RBAC 行修正、tenants 表补充、plugin-framework-sdd.md、migration-engine-sdd.md、CI 覆盖率闸门
  - **HIGH 8 项**: architecture.md §7.1 验收标准、D12.1 延期至 1b、人员任务重分配、shared-types Week 0、test-seed-strategy.md、e2e-test-flows.md、AUTO-CRUD + Data Browser 延期至 Phase 2
  - **MEDIUM 10 项**: decisions.md Phase 1→1a/1b 批量修正、ErrorCode 确认 shared-types、D11 阶段声明、D1.10 Cron 1b、redis-mock-guide.md、集成测试边界 + API contract 测试、E2E 数据预播种、RTL 配置 + 组件测试示例、懒加载契约完善
- 2026-07-13: 新增文档汇总：phase-planning.md、database-schema.md、api-specification.md、api-conventions.md、plugin-framework-sdd.md、migration-engine-sdd.md、test-seed-strategy.md、e2e-test-flows.md、redis-mock-guide.md
- 2026-07-13: 修正文档汇总：architecture.md、decisions.md、competitive-landscape.md、file-storage.md（安全清单）、plugin-framework.md（生命周期）、status.md（模块表）
- 2026-07-13: 新增 SDD 文档 7 份：shared-types-sdd、plugin-core-sdd、manifest-engine-sdd、rbac-sdd、audit-sdd、i18n-sdd、logging-infra-sdd（docs/modules/ 总计 33 份）
- 2026-07-13: 新增 TDD 文档 11 份：plugin-framework、migration-engine、plugin-core、manifest-engine、rbac、audit、logging、i18n、health-check、admin-ui、shared-types
- 2026-07-13: 更新 4 份约束文档：AGENTS.md（AI-Driven SDD/TDD 工作流章节）、conventions.md（SDD/TDD 文档约定）、status.md（SDD/TDD 状态表）、decisions.md（G5 AI-Driven SDD/TDD 强制规范）
- 2026-07-13: team-mode 5 人文档审计（arch-coherence/sdd-quality/tdd-quality/meta-coherence/design-integration），107 项发现（18C/36H/34M/19L），Q&A 15 轮全部决策确定
- 2026-07-13: team-mode 5 人修复团队（meta-doc-fixer/arch-doc-fixer/sdd-fixer/tdd-fixer/design-doc-fixer），46 份 MD 文档全部修复到位
- 2026-07-13: docs/plans/ 创建 5 份 Phase 1a 执行计划文档（~160KB）：master-plan（31.9K）+ week0（52.5K）+ execution-guide（39.1K）+ acceptance-checklist（35.5K）+ README（1.9K）
