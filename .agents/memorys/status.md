# AUDEBase 项目状态

**更新日期**: 2026-07-09
**当前阶段**: Phase 0 — 架构定义完成，文档基础设施就绪

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
| 管理 UI | 🔲 Phase 1 | 插件管理 + 用户管理，验证端到端流程 |
| 国际化 (i18n) | 🔲 Phase 1 | NocoBase 命名空间模式 + JSON 翻译 |
| 多租户 | 🔲 Phase 1 | tenant_id 字段隔离（Phase 2 Database-per-tenant）|
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
- 2026-07-09: 插件架构深度分析：4 轮团队审核，96 项发现全部关闭
- 2026-07-09: 文档 `docs/plugin-architecture-analysis.md` 完成（848 行）
- 2026-07-09: 对比 NocoBase/Odoo/VS Code/Erlang/K8s 等 8 个主流项目
- 2026-07-09: 核心架构决策：四层信任分组、manifest.exports 契约、Record Rules、Saga 事务
