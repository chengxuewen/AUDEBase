# AUDEBase 架构文档

> **版本**: 1.0 | **更新日期**: 2026-07-09 | **状态**: Phase 0 — 架构定义阶段

---

## 目录

1. [产品定位与愿景](#一产品定位与愿景)
2. [核心架构原则](#二核心架构原则)
3. [技术栈决策](#三技术栈决策)
4. [核心模块设计](#四核心模块设计)
5. [多租户架构](#五多租户架构)
6. [前端架构](#六前端架构)
7. [MVP 第一阶段范围](#七mvp-第一阶段范围)
8. [开发路线图](#八开发路线图)
9. [决策记录索引](#九决策记录索引)
10. [参考与来源](#十参考与来源)

---

## 一、产品定位与愿景

**AUDEBase** 是一个面向企业的应用开发平台，对标 Odoo、NocoBase、云表等低代码/无代码平台。

### 1.1 核心定位

- **不是工业控制平台**（旧 MODACS 定位已废弃），而是**企业应用开发平台**
- 目标场景：OA（办公自动化）、ERP（企业资源计划）、MES（制造执行系统）、PLM（产品生命周期管理）、WMS（仓储管理系统）
- 核心理念：**"插件即应用"** — 每个业务系统作为独立插件套件，运行在统一平台上
- 交付形式：开源核心 + 可自托管 + 插件市场

### 1.2 竞品对标

| 产品 | 类型 | 技术栈 | 优势 | AUDEBase 差异化 |
|------|------|--------|------|----------------|
| **Odoo** | 开源 ERP | Python + PostgreSQL | 模块化成熟、社区庞大、20 年积累 | 现代 TS/Node 栈、原生多租户、Schema 驱动 UI |
| **NocoBase** | 无代码平台 | Node.js + React | 微内核架构、Schema Engine、插件热插拔 | 企业级 RBAC、工作流引擎、私有部署优先 |
| **云表** | 低代码平台 | 私有部署 | 国内生态强、业务人员友好 | 开源 + 可自托管 + 插件市场 + 无供应商锁定 |

**NocoBase 是 AUDEBase 最重要的架构参考**：其微内核 + 插件 + Schema 驱动的设计理念与 AUDEBase 目标高度一致。

### 1.3 设计哲学

1. **插件优先** — 平台提供的所有能力（包括管理后台）都是插件
2. **配置优于代码** — Schema 描述模型和 UI，运行时动态渲染
3. **渐进增强** — 从简单 CRUD 到复杂工作流，能力随插件渐进累积
4. **不重新发明轮子** — 积极复用社区验证的组件和模式

---

## 二、核心架构原则

### 2.1 微内核 + 插件热插拔

**决策**：采用 NocoBase 式微内核架构。插件不采用「每插件独立进程」，而采用基于信任度的四层进程分组。

| 层级 | 进程模型 | 崩溃范围 | 示例 |
|------|---------|---------|------|
| SYSTEM | 1 个共享进程 | 整组重启（VS Code 模式） | rbac, schema-engine, logging |
| Domain | 每个业务域 1 个进程 | 该域全部插件 | OA组、ERP组、MES组 |
| Isolated | 每个插件独立进程 | 仅自身 | 第三方插件、计算密集型 |
| Container | Docker Sidecar | 完全隔离 | 不可信第三方 |

**资源**: 50 插件约 8-12 进程 / 0.4-0.7GB（vs 每插件进程 2.5-4GB）

**详情**: [插件架构分析](plugin-architecture-analysis.md#四层信任分组模型)

```
AUDEBase 架构分层
═══════════════════════════════════════════════════════════
  业务插件层    OA Suite  │  ERP Suite  │  MES Suite  │  WMS Suite  │  ...
───────────────────────────────────────────────────────────
  平台服务层    Schema Engine │ RBAC │ Workflow │ Notify │ Audit │ ...
───────────────────────────────────────────────────────────
  内核层        Plugin Manager  │  Dependency Resolver  │  DB Migration
───────────────────────────────────────────────────────────
  基础设施      Node.js  │  PostgreSQL  │  Redis  │  MinIO/S3
═══════════════════════════════════════════════════════════
```

**内核职责**：
- 插件注册、发现、加载/卸载
- 依赖解析与版本约束检查
- 数据库迁移编排
- 应用生命周期管理（启动/停止/优雅退出）

**内核不负责**：
- 任何业务逻辑
- UI 渲染
- 具体数据模型定义

### 2.2 插件即应用

每个业务系统（OA/ERP/MES 等）以插件套件形式存在，通过 `manifest.yaml` 声明。详见 [插件架构分析](plugin-architecture-analysis.md)。

### 2.3 设计原则（详见 decisions.md）

- **不可变性优先（G1）**：永远返回新对象，不就地修改
- **边界验证（D8）**：所有系统边界使用 Zod Schema 验证
- **插件通信**：组内直接函数调用（~0ms），组间 JSON-RPC over stdin/stdout + Redis Pub/Sub。详见 [插件架构分析](plugin-architecture-analysis.md#插件通信架构)
---

## 三、技术栈决策

| 层级 | 选型 | 详情 |
|------|------|------|
| 语言 | TypeScript | [技术栈选型](modules/tech-stack.md) |
| 后端 | Node.js + Fastify | [技术栈选型](modules/tech-stack.md) |
| ORM | Drizzle ORM | [技术栈选型](modules/tech-stack.md) |
| 前端 | React 19 + Tailwind v4 + shadcn/ui + Ant Design 5 | [技术栈选型](modules/tech-stack.md) |
| 数据库 | PostgreSQL 16+ | [技术栈选型](modules/tech-stack.md) |
| 任务队列 | BullMQ + Redis | [技术栈选型](modules/tech-stack.md) |
| 测试 | Vitest + Playwright | [技术栈选型](modules/tech-stack.md) |
| 构建 | Turborepo + tsup + Vite | [技术栈选型](modules/tech-stack.md) |

**关键安全决策**：
- JWT 密钥通过环境变量注入，启动校验 ≥32 字符（参考 NocoBase CVE-2025-13877）
- shadcn/ui 版本锁定 + 私有 registry fork（参考 decisions.md D6.1）

**详细选型理由、替代方案分析、配置参数见 [技术栈选型](modules/tech-stack.md)**
---

## 四、核心模块设计

### 4.1 插件框架

> 详细设计见 [插件框架设计](modules/plugin-framework.md)

采用四层信任分组模型：SYSTEM（平台插件共享进程）、Domain（业务域共享进程）、Isolated（第三方独立进程）、Container（容器隔离）。
50 插件约 8-12 进程 / 0.4-0.7GB（vs 每插件进程 2.5-4GB）。

### 4.2 插件通信与权限

> 详细设计见 [插件通信与权限](modules/plugin-communication.md)

组内直接函数调用，组间 JSON-RPC over stdin/stdout + Redis Pub/Sub。
manifest.exports 契约系统 + Zod schema + ServiceRegistry。
Record Rules + 字段级权限 + Core 数据 API 代理。

### 4.3 Schema Engine

> Phase 2 实现，借鉴 NocoBase Collection System
> 动态模型定义 + Schema→DB 迁移 + Schema→UI 渲染

### 4.4 日志与调试基础设施

> Phase 1 结构化 JSON 日志 + Core 聚合 + inspector 端口
---

## 五、多租户架构

> 详细设计见 [多租户架构](modules/multi-tenant.md)

四阶段演进：tenant_id 字段隔离 → PostgreSQL Schema-per-tenant → Database-per-tenant → 混合模式。
文件存储：Phase 1 本地路径前缀 → Phase 2 DB 元数据 + MinIO（Odoo ir.attachment 模式）。
共享数据模型：NULL（系统级）、UUID 全零（模板租户）、普通 UUID（业务租户）。
---

## 六、前端架构

### 6.1 技术选型

> 详细设计见 [技术栈选型](modules/tech-stack.md)

React 19 + Tailwind v4 + shadcn/ui（通用 UI 组件）+ Ant Design 5（数据密集型页面）。
Phase 1 生产策略：仅 shadcn/ui（~577KB gzip），Ant Design 5 仅限开发环境验证兼容性。

其他技术：React Router v7（路由）、Zustand（状态管理）、TanStack React Query（服务端状态）。

### 6.2 Schema 驱动 UI（Phase 2）

借鉴 NocoBase，通过 JSON Schema 描述页面结构，运行时动态渲染。
Schema → Ant Design ProTable/ProForm/Descriptions 自动映射。
详见 [NocoBase Schema UI](https://docs.nocobase.com/welcome/introduction)。

### 6.3 插件 UI 注册

插件通过 manifest 注册前端页面，路由和菜单由内核自动生成。

### 6.4 设计系统

通过 Tailwind v4 `@theme` 定义设计令牌（色板、间距、圆角、阴影），shadcn/ui 和 Ant Design 5 通过 CSS 变量 / ConfigProvider.theme.token 同步令牌，确保两个 UI 库在同一页面视觉一致。

详见 [技术栈选型](modules/tech-stack.md)
---

## 七、MVP 第一阶段范围

MVP 的目标是**证明插件架构可行**：从零到一，实现"安装插件 → 管理用户 → 查看日志"的端到端流程。

| 模块 | 核心交付 | 优先级 |
|------|----------|--------|
| **插件框架** | 插件发现、加载、manifest 验证、生命周期钩子 | P0 |
| **内核** | Fastify 应用骨架、pnpm workspace 单仓结构、Drizzle 数据库连接 | P0 |
| **基础 RBAC** | 用户 → 角色 → 权限模型、API 中间件拦截 | P0 |
| **日志/调试** | pino 结构化日志、Request ID 追踪、调试 Web UI | P0 |
| **管理后台** | 插件管理页（列表/安装/启用/禁用）、用户管理页（CRUD） | P0 |
| **多租户（基础）** | tenant_id 字段隔离、Drizzle 查询自动过滤 | P1 |

**MVP 不包含**：Schema Engine（P2）、工作流（P3）、插件市场（P2）、通知系统（P2）。

---

## 八、开发路线图

| 阶段 | 内容 | 状态 |
|------|------|------|
| **Phase 0** | 基础设施初始化（配置、文档、代理、编码规范） | ✅ 进行中 |
| **Phase 1** | 插件框架 + RBAC + 日志 + 管理UI + 多租户 + i18n + 生命周期基础 | 🔲 |
| **Phase 2** | Schema Engine + 进程模式 + manifest.exports 契约 + 版本管理 + 5 状态机 + Record Rules + 多租户 Schema 隔离（Phase 1.5） | 🔲 |
| **Phase 3** | 直连通道 + 流式传输 + OpenTelemetry + 请求优先级 + 插件市场 + 多租户 Database-per-tenant（大客户） | 🔲 |
| **Phase 4** | 容器隔离 + Core 高可用 + 工作流引擎 + 业务插件套件 + 多租户混合模式（1000+ 租户） | 🔲 |

---

## 九、决策记录索引

以下架构决策已记录于 `.agents/memorys/decisions.md`：

| ID | 决策 | 状态 | 说明 |
|----|------|------|------|
| D3 | manifest.yaml 声明的模块系统 | 已决策 | 本节定义核心架构 |
| D4 | 多租户数据库级隔离 | 已决策 | Phase 1 tenant_id → Phase 1.5 Schema → Phase 2 Database |
| D4.1 | 文件存储多租户隔离 | 已决策 | Phase 1 本地 → Phase 2 DB元数据+MinIO混合 |
| D5 | TypeScript 主语言 | 已决策 | 全栈 TypeScript |
| D6 | Tailwind CSS v4 + shadcn/ui | 已决策 | 前端样式方案 |
| D8 | Zod 边界验证 | 已决策 | 所有输入验证 |
| D9 | Drizzle ORM | 已决策 | 数据库访问层 |
| G1 | 不可变性优先 | 已决策 | 所有数据操作 |
| G2 | 小文件原则（200-400 行） | 已决策 | 代码组织 |
| G3 | 禁用 `as any` / `@ts-ignore` | 已决策 | 类型安全 |
| G4 | `interface` 优先于 `type` | 已决策 | TypeScript 规范 |

- 插件架构深度分析: [plugin-architecture-analysis.md](plugin-architecture-analysis.md)（848 行，4 轮团队审核，8 项目对比）

---

## 十、参考与来源

### 竞品架构参考

- **Odoo Architecture**: https://www.odoo.com/documentation/master/developer/reference/backend/orm.html
  - 模块声明（`__manifest__.py`）、ORM、ACL + Record Rules、Workflow Engine
- **NocoBase Architecture**: https://docs.nocobase.com/welcome/introduction
  - 微内核设计、插件管理器、Schema Engine、Collection & Field 系统
- **云表**: https://www.yunbiao.com
  - 低代码表格建模、业务人员自助开发模式

### 技术栈参考

- **Fastify**: https://fastify.dev/ — 插件系统、JSON Schema 验证、性能基准
- **Drizzle ORM**: https://orm.drizzle.team/ — Schema 定义、迁移、查询构建
- **pnpm Workspace**: https://pnpm.io/workspaces — Monorepo 管理
- **shadcn/ui**: https://ui.shadcn.com/ — 可复制组件模式
- **Ant Design 5**: https://ant.design/ — 企业级组件库
- **Tailwind CSS v4**: https://tailwindcss.com/ — `@theme` 设计令牌
- **Zod**: https://zod.dev/ — Schema 验证 + TypeScript 类型推导
- **pino**: https://getpino.io/ — 结构化日志
- **PostgreSQL Row Security**: https://www.postgresql.org/docs/current/ddl-rowsecurity.html — 行级安全用于多租户
