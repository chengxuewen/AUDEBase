# AUDEBase 项目状态

**更新日期**: 2026-07-10
**当前阶段**: Phase 0 — 架构定义完成，前端架构 4 轮交叉验证通过

## 项目定位

AUDEBase 是一个面向企业的应用开发平台，对标 Odoo、NocoBase、云表。通过微内核 + 插件热插拔架构，支持 OA、ERP、MES、PLM、WMS 等企业应用的快速开发与部署。

## 模块状态

| 模块 | 状态 | 描述 |
|------|------|------|
| 插件框架 | 🔲 Phase 1 | 四层信任分组（SYSTEM/Domain/Isolated/Container）|
| manifest.yaml 系统 | 🔲 Phase 1 | 统一声明：元数据+runtime+security+exports |
| RBAC 权限引擎 | 🔲 Phase 1 | Record Rules + 字段级权限 + 多租户隔离 |
| 插件通信 | 🔲 Phase 1 | 组内直调 + 组间 JSON-RPC + Redis Pub/Sub |
| 生命周期管理 | 🔲 Phase 1 | 7 钩子 + 迁移三阶段 + 5 状态机 |
| 日志/调试基础设施 | 🔲 Phase 1 | 结构化日志 + Core 聚合 + inspector 端口 |
| 管理 UI | 🔲 Phase 1 | 插件管理 + 用户管理，Ant Design 5 + ProLayout + ProTable/ProForm |
| 前端架构 | ✅ Phase 0 | D6-D24 共 19 项决策，6 项目标验证通过 |
| 国际化 (i18n) | 🔲 Phase 1 | NocoBase 命名空间 + react-i18next（双命名空间） |
| Schema Engine | 🔲 Phase 2 | 动态模型定义 + Schema→DB 迁移 + Schema→UI 渲染 |
| 插件市场 | 🔲 Phase 2 | 在线发现/安装/评分插件 |
| 工作流引擎 | 🔲 Phase 4 | 审批流 + 业务流程自动化 |
| OA/ERP/MES 插件 | 🔲 Phase 3/4 | 业务插件套件 |

## 已知缺失

- 零源代码 — 仅有配置/文档/代理基础设施
- 无 build scripts — `package.json` 无 scripts 字段
- 无测试基础设施 — 规则要求 80% 覆盖率但无测试框架
- 架构文档于 2026-07-09 从 MODACS 工业控制架构重写为 AUDEBase 企业平台架构

## 近期工作

- 2026-07-08: 项目从 MODACS 分离，首次提交
- 2026-07-08: 清理所有非意图性 MODACS 引用
- 2026-07-08: 创建 4 个 memorys 文件
- 2026-07-09: 重新定位 — 从工业控制平台转为 Odoo/NocoBase 式企业应用开发平台
- 2026-07-09: architecture.md 完全重写，对齐新架构
- 2026-07-09: decisions.md 更新，废弃旧工业控制决策
- 2026-07-09: 插件架构深度分析：5 轮团队审核，117 项发现全部关闭
- 2026-07-09: 文档 `docs/plugin-architecture-analysis.md` 完成（848 行）
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
- 2026-07-10: architecture.md §六 从 7 行扩展为 12 个子章节（6.1-6.12）
- 2026-07-10: 与 NocoBase/Odoo/Directus/Strapi/Saleor/VS Code 六个项目交叉验证通过
- 2026-07-10: 前端架构可交付 Phase 1 实施
