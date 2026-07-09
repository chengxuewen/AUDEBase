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

**决策**：采用 NocoBase 式微内核架构，融合 Odoo 模块声明思想。

插件的生命周期由内核统一管理，插件不感知其他插件的存在——所有跨插件通信通过内核 API 完成。

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

每个业务系统（OA/ERP/MES 等）以**插件套件**的形式存在，通过 `manifest.yaml` 声明：

```yaml
# packages/plugins/oa-core/manifest.yaml
name: "oa-core"
version: "1.0.0"
display_name: "OA 办公自动化"
description: "请假、报销、审批等基础 OA 功能"
dependencies:
  rbac: ">=1.0.0"
  notification: ">=1.0.0"
  workflow: ">=1.0.0"
permissions:
  - "oa.approval.create"
  - "oa.approval.approve"
  - "oa.leave.request"
provides:
  collections:
    - "ApprovalRequest"
    - "LeaveApplication"
  ui_blocks:
    - "oa-dashboard"
    - "oa-approval-center"
runtime:
  mode: process              # inline | process | container
  partition: oa              # SYSTEM | oa | erp | mes | ...
  crash_policy: restart
  max_restarts: 5
  restart_backoff: exponential
  health_check: "plugin:health"
```

**插件设计约束**：
- 禁止直接 `import` 其他插件的模块（使用内核提供的服务定位 API）
- 数据库表仅创建在自己的命名空间下
- 前端页面注册到统一路由表，由内核渲染
- 共享的 UI 组件应提交为平台层包而非插件私有

### 2.3 不可变性优先

所有数据操作遵循不可变性原则：永远返回新对象，不就地修改。详见 `decisions.md` G1。

### 2.4 边界验证

所有系统边界（HTTP API、插件间通信、数据库输入）使用 Zod Schema 进行运行时验证。详见 `decisions.md` D8。

---

## 三、技术栈决策

| 层级 | 选型 | 理由 |
|------|------|------|
| **主语言** | TypeScript | 类型安全、全栈统一、生态最大 |
| **后端运行时** | Node.js + Fastify | Fastify 插件系统与 AUDEBase 插件框架天然契合；内置 JSON Schema 验证；性能 2-3× Express |
| **ORM** | Drizzle ORM | Type-safe、轻量、SQL-like API、自动参数化防注入（详见 decisions.md D9） |
| **前端框架** | React 19 + Tailwind CSS v4 | React 生态最大；Tailwind v4 @theme 语法定义设计令牌（详见 decisions.md D6） |
| **UI 组件** | shadcn/ui + Ant Design 5 | shadcn/ui 负责通用 UI（可复制组件、可定制主题）；antd 负责数据密集型场景（Table/Form/Tree/ProTable） |
| **数据库** | PostgreSQL 16+ | 成熟可靠、Schema 支持、行级安全可用于多租户 |
| **缓存/队列** | Redis / Valkey | 会话存储、消息队列、缓存 |
| **文件存储** | MinIO / S3 兼容 | 插件输出文件、附件存储 |
| **包管理** | pnpm workspace monorepo | 严格依赖隔离、磁盘高效（详见 decisions.md D4） |
| **验证** | Zod | 边界验证 + TypeScript 类型推导（详见 decisions.md D8） |
| **日志** | pino | 结构化 JSON 日志、高性能、Fastify 官方推荐 |

### 3.1 为什么选 Fastify 而非 Express/Koa/NestJS

| 对比维度 | Fastify | Express | NestJS |
|----------|---------|---------|--------|
| 插件系统 | ✅ 原生支持，与 AUDEBase 插件框架对齐 | ❌ 中间件模式，非结构化 | ✅ 模块系统但重量级 |
| 性能 | ✅ 2-3× Express | 基线 | ✅ 与 Fastify 相近 |
| JSON Schema | ✅ 内置，与 Zod 互补 | ❌ 需额外库 | ✅ class-validator |
| 学习曲线 | 低 | 低 | 高（装饰器、DI、模块） |
| 生态 | 快速增长 | 最大 | 快速增长 |

**决策理由**：Fastify 的插件系统与 AUDEBase 的"插件即应用"理念天然契合。每个业务插件可以映射为一个 Fastify 插件实例，享受 Fastify 内置的作用域隔离、生命周期钩子和 JSON Schema 验证能力。

### 3.2 为什么是 shadcn/ui + Ant Design 共存

- **shadcn/ui**：可复制组件（非 npm 依赖），支持通过 CSS 变量深度定制主题，适合通用 UI 场景和品牌化需求
- **Ant Design 5**：企业级组件库，Table/ProTable、Form/ProForm、Tree、Transfer 等数据密集型组件比 shadcn/ui 成熟得多
- **共存原则**：shadcn/ui 负责通用 UI（按钮、对话框、卡片、布局），antd 负责管理页面（数据表格、复杂表单、树形选择）

---

## 四、核心模块设计

### 4.1 插件框架（Phase 1 — 最高优先级）

**为什么先做**：插件框架是一切的基础。没有它，RBAC、Schema Engine、业务插件都无法挂载到平台上。

**职责**：
- 插件生命周期：安装 → 注册 → 激活 → 禁用 → 卸载 → 升级
- 依赖解析：声明式依赖 + semver 版本约束，解决冲突
- 资源注册：数据模型、API 路由、UI 页面、权限、迁移脚本
- 数据库迁移编排：安装插件时自动执行 DDL 迁移，卸载时可选回滚
- 插件发现：扫描 `packages/plugins/` 目录自动发现本地插件

**参考**：NocoBase PluginManager、Fastify plugin system

**插件进程隔离**：采用四层信任分组模型（详见 [插件架构分析](../plugin-architecture-analysis.md)）：

- **SYSTEM 组**（1 进程）：平台插件（rbac、schema-engine、logging）共享进程，直接函数调用
- **Domain 组**（每域 1 进程）：OA/ERP/MES 等业务域插件共享进程，域内直调
- **Isolated**（每插件独立进程）：第三方/高风险插件（支付、报表等），仅自身崩溃
- **Container**（容器隔离）：不可信插件 Docker Sidecar 隔离

预估资源：50 插件 = 8-12 进程 / 0.4-0.7GB（对比原每插件进程方案节省 75%+ 内存）。
### 4.2 RBAC 权限引擎（Phase 1）

**为什么先做**：任何企业应用的第一需求是权限控制。RBAC 是最广泛接受的模型。

**数据模型**：
```
User ──N:M── Role ──N:M── Permission
                   │
                   └── Resource (e.g., "oa.approval", "oa.leave")
                          └── Action (create/read/update/delete/manage)
```

**实施策略**：
- Phase 1：基础 RBAC（用户→角色→权限），中间件级别 API 拦截
- Phase 2：记录级权限（数据行过滤——类比 Odoo Record Rules）
- Phase 3：字段级权限（敏感字段脱敏或隐藏）

**API 中间件示例**：
```typescript
// Fastify 中间件：自动验证当前用户的权限
app.get('/api/oa/approvals', {
  preHandler: requirePermission('oa.approval.read')
}, async (request) => {
  // 已通过权限校验
})
```

### 4.3 Schema Engine（Phase 2）

**职责**：运行时动态定义数据模型，无需代码生成，变更即时生效。

**核心理念**（借鉴 NocoBase Collection System）：
- **Collection** = 数据库表 + 业务语义
- **Field** = 列 + 类型 + 验证规则 + UI 渲染提示
- **Relation** = hasMany / belongsTo / manyToMany

```typescript
// 定义 Collection 的 Schema
const approvalSchema = defineCollection({
  name: 'approval_requests',
  title: '审批申请',
  fields: [
    { name: 'title', type: 'string', required: true, maxLength: 200 },
    { name: 'amount', type: 'number', min: 0 },
    { name: 'status', type: 'enum', values: ['pending', 'approved', 'rejected'] },
    { name: 'applicant', type: 'relation', target: 'users', relation: 'belongsTo' },
  ],
})

// Schema 自动生成 DDL + Zod 验证 + 前端 Form/Table 配置
```

**自动生成能力**：
- **Schema → DDL**：自动创建/修改数据库表结构（通过 Drizzle migrate）
- **Schema → API**：自动生成 CRUD REST 端点
- **Schema → UI**：自动生成表单和表格配置（驱动前端 Schema-driven UI）

### 4.4 日志与调试基础设施（Phase 1）

**职责**：
- 结构化日志（pino JSON 格式）
- 日志级别：trace / debug / info / warn / error / fatal
- 多输出通道：控制台（开发）、文件（生产）、远程收集（ELK/Loki 可选）
- 请求追踪：每个请求生成唯一 Request ID，贯穿所有日志和下游调用
- 调试面板：Web UI 实时查看日志流、插件状态、系统健康度

### 4.5 通知系统（Phase 2）

- 统一通知抽象层，支持多渠道：站内信、邮件、Webhook、企微/钉钉/飞书
- 插件可注册通知模板，业务插件发送通知时引用模板
- 用户可配置通知偏好（哪些事件、哪些渠道、免打扰时段）

### 4.6 工作流引擎（Phase 3）

- 借鉴 Odoo Workflow、Temporal 模式
- 可视化流程设计器（流程图 → BPMN/JSON）
- 支持：审批流、自动化任务、定时任务
- 状态持久化、失败重试、超时处理

---

## 五、多租户架构

**决策**：分阶段演进，从简单到完整隔离。

| 阶段 | 策略 | 隔离级别 | 适用场景 |
|------|------|----------|----------|
| **Phase 1** | 单数据库 + `tenant_id` 字段 | 应用层隔离 | MVP 快速验证 |
| **Phase 2** | Database-per-tenant | 数据库级隔离 | 生产环境大客户 |
| **Phase 3** | 混合模式（小租户共享、大租户独立） | 灵活隔离 | 平台规模化运营 |

### Phase 1 实现（MVP）

```sql
-- 所有业务表增加 tenant_id
CREATE TABLE tenants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  status      TEXT DEFAULT 'active',
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  email       TEXT NOT NULL,
  name        TEXT,
  -- ...
  UNIQUE(tenant_id, email)
);

-- Drizzle 查询自动注入 tenant_id
-- 通过 Fastify request context 获取当前租户
```

**租户上下文传递**：通过 Fastify `request.tenantId` 传递，Drizzle 查询自动附加 `where: eq(table.tenantId, ctx.tenantId)`。

---

## 六、前端架构

### 6.1 技术选型

| 技术 | 用途 |
|------|------|
| React 19 | 视图框架 |
| Tailwind CSS v4 | 原子化 CSS，@theme 定义设计令牌 |
| shadcn/ui | 通用 UI 组件（按钮、对话框、布局、导航） |
| Ant Design 5 | 数据密集型组件（Table/ProTable、Form/ProForm、Tree、Transfer） |
| React Router v7 | 路由管理 |
| Zustand | 轻量状态管理 |
| React Query (TanStack) | 服务端状态管理、缓存、自动刷新 |

### 6.2 Schema 驱动 UI

借鉴 NocoBase，通过 Schema 描述页面结构，运行时动态渲染：

```json
{
  "type": "page",
  "title": "用户管理",
  "blocks": [
    {
      "type": "table",
      "collection": "users",
      "columns": ["name", "email", "role", "created_at"],
      "filters": ["role", "status"],
      "actions": ["create", "edit", "delete"]
    }
  ]
}
```

**Schema → 渲染映射**：
- `type: "table"` → Ant Design ProTable
- `type: "form"` → Ant Design ProForm
- `type: "detail"` → Ant Design Descriptions
- `type: "dashboard"` → 自定义 Widget 网格

### 6.3 插件 UI 注册

插件通过 manifests 注册前端页面：

```typescript
// 插件在平台注册后，路由和菜单自动生成
pluginManager.register({
  name: 'oa-core',
  routes: [
    { path: '/oa/approvals', component: 'ApprovalList', menu: '审批中心' },
    { path: '/oa/leave', component: 'LeaveRequest', menu: '请假申请' },
  ],
})
```

### 6.4 设计系统

- 通过 Tailwind v4 `@theme` 定义设计令牌（色板、间距、圆角、阴影）
- shadcn/ui 组件通过 CSS 变量消费设计令牌
- Ant Design 5 通过 `ConfigProvider` 的 `theme.token` 同步令牌
- 确保两个 UI 库在同一个页面上视觉一致

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
| **Phase 1** | MVP：插件框架 + RBAC + 日志 + 最小管理 UI + 多租户基础 | 🔲 |
| **Phase 2** | Schema Engine + 多租户完整实现（Database-per-tenant）+ 插件市场 + 通知系统 | 🔲 |
| **Phase 3** | 首款业务插件（OA Suite）验证平台能力 + 工作流引擎 | 🔲 |
| **Phase 4** | ERP/MES/WMS 插件套件 + 可视化工作流设计器 + BI 报表 | 🔲 |

---

## 九、决策记录索引

以下架构决策已记录于 `.agents/memorys/decisions.md`：

| ID | 决策 | 状态 | 说明 |
|----|------|------|------|
| D3 | manifest.yaml 声明的模块系统 | 已决策 | 本节定义核心架构 |
| D4 | pnpm workspace monorepo | 已决策 | 单仓管理所有包 |
| D5 | TypeScript 主语言 | 已决策 | 全栈 TypeScript |
| D6 | Tailwind CSS v4 + shadcn/ui | 已决策 | 前端样式方案 |
| D8 | Zod 边界验证 | 已决策 | 所有输入验证 |
| D9 | Drizzle ORM | 已决策 | 数据库访问层 |
| G1 | 不可变性优先 | 已决策 | 所有数据操作 |
| G2 | 小文件原则（200-400 行） | 已决策 | 代码组织 |
| G3 | 禁用 `as any` / `@ts-ignore` | 已决策 | 类型安全 |
| G4 | `interface` 优先于 `type` | 已决策 | TypeScript 规范 |

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
