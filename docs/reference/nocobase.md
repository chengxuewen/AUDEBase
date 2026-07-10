# NocoBase — 产品画像

> **分析日期**: 2026-07-10 | **分类**: 插件化应用平台 | **AUDEBase 相关度**: ⭐⭐⭐⭐⭐ (最直接对标)
>
> **分析目的**: 作为 AUDEBase 架构设计的核心对标产品，深度剖析其技术架构、设计决策、历史教训和商业化路径，为 AUDEBase Phase 1+ 的架构决策提供实证参考。

---

## 目录

1. [产品概述](#1-产品概述)
2. [技术架构深度分析](#2-技术架构深度分析)
3. [核心功能](#3-核心功能)
4. [市场与社区](#4-市场与社区)
5. [版本演进与关键变化](#5-版本演进与关键变化)
6. [历史教训与已知问题](#6-历史教训与已知问题)
7. [商业化与许可模式](#7-商业化与许可模式)
8. [未来发展](#8-未来发展)
9. [AUDEBase 可借鉴点](#9-audebase-可借鉴点)
10. [关键数据速查](#10-关键数据速查)

---

## 1. 产品概述

### 1.1 一句话定位

**NocoBase 是一个开源 AI 驱动的无代码/低代码开发平台，采用微内核 + 插件架构，用于快速构建企业级业务系统。**

### 1.2 核心设计理念

NocoBase 遵循 **"80% 无代码 + 20% 扩展开发"** 的分层策略：

- **80% 无代码层**：面向业务人员，通过可视化拖拽完成数据建模、页面搭建、工作流编排。无需编程能力即可构建完整业务系统。
- **20% 低代码层**：面向开发者，通过插件机制扩展平台能力。当内置功能不满足需求时，开发者可编写自定义插件补充业务逻辑。
- **AI 增强层**（v2.0 新增）：AI 员工作为角色嵌入业务流程，在特定环节提供翻译、分析、调研等智能辅助。

### 1.3 团队与发展历程

| 时间 | 里程碑 |
|------|--------|
| 2018 | 技术预研启动 |
| 2021 年 3 月 | 正式开源，GitHub 首次公开 |
| 2022 年 6 月 | 首个商业客户（Yuqi Tech 为 UUL 物流构建系统）|
| 2024 年 5 月 | v1.0-alpha 发布，首个稳定版本 |
| 2024 年 7-8 月 | 客户案例密集公布（UUL 物流、HouseWell 房地产）|
| 2025 年 11 月 | v2.0-alpha 发布，引入 FlowEngine + AI 员工 |
| 2025 年 12 月 | CVE-2025-13877 披露（CVSS 9.8 JWT 默认密钥漏洞）|
| 2026 年 2 月 15 日 | v2.0 正式发布，许可证与定价策略重大调整 |
| 2026 年 6 月 | GHSA-v8vm-cqh8-q87q 披露（SQL Collection 黑名单绕过）|

**创始团队**：中国团队，母公司注册于香港。核心开发团队规模紧凑，社区驱动开发模式。

### 1.4 对标关系

在无代码/低代码赛道中，NocoBase 的定位介于：

- **Odoo**（企业级单体架构，功能完备但定制成本高）→ NocoBase 更轻量、更灵活
- **Salesforce**（SaaS 订阅模式，生态强大但锁定效应强）→ NocoBase 自托管 + 一次性买断
- **NocoDB / Baserow**（Airtable 开源替代，表格数据库）→ NocoBase 层级更高，面向完整业务系统
- **Directus / Strapi**（无头 CMS）→ NocoBase 更偏向业务应用而非内容管理
- **Appsmith / Tooljet**（低代码仪表板）→ NocoBase 数据模型驱动，非页面驱动

---

## 2. 技术架构深度分析

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────┐
│                    前端层 (Browser)                   │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │  v1 页面引擎  │  │  v2 FlowEngine│  │  插件前端   │ │
│  │  (Formily)   │  │  (Model+Flow) │  │  (React)   │ │
│  └──────────────┘  └──────────────┘  └────────────┘ │
├─────────────────────────────────────────────────────┤
│                  HTTP/REST API 层                     │
├─────────────────────────────────────────────────────┤
│                    后端层 (Node.js)                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │
│  │PluginMgr │ │  ACL     │ │Workflow  │ │Actions │ │
│  │(微内核)   │ │ (权限)   │ │(工作流)  │ │(CRUD)  │ │
│  └──────────┘ └──────────┘ └──────────┘ └────────┘ │
├─────────────────────────────────────────────────────┤
│                    数据层                             │
│  ┌──────────────────────────────────────────────┐   │
│  │  Sequelize ORM → MySQL / PostgreSQL / SQLite  │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### 2.2 后端架构

#### 2.2.1 运行时与框架

| 组件 | 技术选型 | 说明 |
|------|----------|------|
| 运行时 | Node.js | JavaScript 运行时 |
| HTTP 框架 | **Koa** | 轻量级中间件框架，Express 精神继承者 |
| 语言 | TypeScript | 全栈类型安全 |
| ORM | **Sequelize** (v1/v2) | 成熟的关系型 ORM，支持 MySQL/PostgreSQL/SQLite |
| 数据库 | MySQL / PostgreSQL / SQLite | 以 MySQL 为主要支持，PostgreSQL 为推荐选项 |

> **架构洞察**：NocoBase 选择 Koa 而非 Express/Fastify。Koa 的洋葱模型中间件与插件化的请求处理流程天然契合。但这也意味着 NocoBase 未利用 Fastify 的 JSON Schema 验证和原生插件系统——这对 AUDEBase 选择 Fastify 是一个验证点：Fastify 在插件化原生支持和性能方面优于 Koa。

#### 2.2.2 插件管理器 (PluginManager)

NocoBase 的 PluginManager 是微内核架构的核心，所有功能（包括 ACL、工作流、UI 编辑器）皆作为插件运行——这是 **WordPress "一切皆插件"** 模式的 Node.js 实现。

**完整生命周期链**：

```
staticImport() → 实例化 → afterAdd() → beforeLoad() → load() → install() → afterEnable()
                                                           ↑ 仅首次激活
                        afterDisable() → remove()
```

| 生命周期方法 | 执行时机 | 用途 |
|-------------|----------|------|
| `staticImport()` | 插件加载前（静态方法） | 不依赖实例的初始化，如注册类型映射 |
| `afterAdd()` | 插件实例加入 PluginManager 后立即执行 | 基础初始化，此时并非所有插件都已就绪 |
| `beforeLoad()` | 所有已启用插件的 `beforeLoad()` 并行执行完毕 | 注册数据库模型、监听 DB 事件、注册中间件 |
| `load()` | 所有 `beforeLoad()` 完成后执行 | 注册资源、API 接口等核心业务逻辑。**注意**：此时 DB 尚未同步，不可执行数据库操作 |
| `install()` | 插件首次启用时执行（仅一次） | 初始化表结构、插入初始数据。后续版本变更使用 Migration |
| `afterEnable()` | 插件启用后 | 启用后的后置逻辑 |
| `afterDisable()` | 插件禁用后 | 清理资源 |
| `remove()` | 插件移除时 | 最终的清理工作 |

**迁移三阶段**：

NocoBase 的数据库迁移分为三个阶段执行，这与 Odoo 的迁移模式类似：

```
beforeLoad 迁移 → DB 同步 (afterSync) → afterLoad 迁移
```

1. **beforeLoad 迁移**：在所有 `beforeLoad()` 执行前运行，用于修改表结构
2. **afterSync 迁移**：在 Sequelize `sync()` 完成后运行，用于数据填充
3. **afterLoad 迁移**：在所有 `load()` 完成后运行，用于后处理逻辑

> **AUDEBase 对齐状态**：D1.4（插件生命周期）已决策 7 钩子 + 3 阶段迁移，与 NocoBase 高度一致。

#### 2.2.3 权限系统 (ACL)

NocoBase 的 ACL 系统是其权限模型的核心，支持三种粒度的权限控制：

| 粒度 | 说明 | 实现方式 |
|------|------|----------|
| **菜单级** | 控制用户可见的菜单项 | 通过 `aclSnippet` 声明 + ACLProvider 自动过滤 |
| **操作级** | 控制用户可执行的操作（CRUD） | 资源 → 操作 → 角色 的权限矩阵 |
| **字段级** | 控制用户可见/可编辑的字段 | 字段级 ACL 声明 + API 响应自动过滤 |

**前端权限集成**：
- `ACLProvider` Context 包裹整个应用
- `useACL()` Hook 提供 `can()` 方法进行声明式权限检查
- 菜单自动根据权限过滤显示

> **架构差异**：NocoBase 的权限模型类似于 RBAC + 字段级过滤。AUDEBase 采用 Odoo 的 Record Rules 模式（D10），通过 domain filter 表达式实现记录级权限，比 NocoBase 的基于角色的操作权限更灵活——例如可实现 "用户仅能查看自己部门的、金额<10万的采购单" 这类数据级过滤。

#### 2.2.4 资源管理器 (Resource Manager)

NocoBase 将所有的数据操作抽象为 **资源 (Resource)** 和 **操作 (Action)** 模型：

- **Collection 自动生成 Resource**：每个数据表自动生成对应的 resource，提供标准的 CRUD action
- **自定义 Action**：开发者可通过 `resourceManager.registerAction()` 注册自定义操作
- **中间件链**：每个 action 可配置前置/后置中间件

```
资源: users
  ├── action: list     (GET /api/users:list)
  ├── action: get      (GET /api/users:get?filterByTk=1)
  ├── action: create   (POST /api/users:create)
  ├── action: update   (POST /api/users:update?filterByTk=1)
  └── action: destroy  (POST /api/users:destroy?filterByTk=1)
```

REST API 自动生成是 NocoBase 的核心竞争力之一——定义数据模型后，CRUD API 立即可用，无需手写任何后端代码。

### 2.3 前端架构（v1 vs v2 对比）

NocoBase 的前端是架构演进最剧烈的部分，v1 到 v2 的变化代表了一次根本性的技术路线调整。

#### 2.3.1 v1 前端（Formily 时代，~2021-2024）

| 组件 | 技术选型 | 职责 |
|------|----------|------|
| UI 框架 | React | 组件化渲染 |
| UI 组件库 | **Ant Design 5** | 企业级 UI 组件（表格、表单、布局） |
| 表单引擎 | **Formily** (阿里巴巴开源) | Schema 驱动表单渲染，JSON Schema → 动态表单 |
| 微前端加载 | **requirejs AMD** | 插件前端模块按需加载（已淘汰技术） |
| 布局系统 | 自建 layout | 非 ProLayout，纯自定义布局 |
| 状态管理 | 自建 Provider Stack | ACLProvider、CollectionProvider 等 Context 链 |

**Formily 角色**：

Formily 是 v1 前端低代码能力的核心引擎。它将 JSON Schema 动态渲染为交互式表单，支持：
- Schema 驱动的字段排列、校验、联动逻辑
- 丰富的字段类型（文本框、选择器、关联选择、子表格等）
- x-reactions 表达式实现字段间响应式联动

但 Formily 也有明显局限：
- **学习曲线陡峭**：JSON Schema + x-reactions 表达式体系复杂，非标准前端开发者难以掌握
- **性能瓶颈**：复杂表单的 Schema 解析与渲染存在性能问题
- **供应商锁定**：深度绑定 Formily，迁移成本极高
- **Alibaba 社区依赖**：Formily 维护节奏与 NocoBase 需求不完全同步

#### 2.3.2 v2 前端（FlowEngine 时代，2024-至今）

v2 的核心变化是 **用自研 FlowEngine 替代 Formily**，从根本上重构了前端低代码架构。

**FlowEngine 核心概念**：

```
FlowEngine = Model (可配置组件模型) + Flow (配置流程)
```

- **Model**：是一个抽象组件模型，负责管理组件的 Props 和状态、定义渲染方法、托管和执行 Flows、统一处理事件分发和生命周期。Model 是组件的 "逻辑大脑"。
- **Flow**：是为 Model 服务的逻辑流。它将属性或事件逻辑分解为有序的步骤 (Steps)，按流的方式渐进式应用到组件。Flow 的逻辑是动态、可配置、可复用的。

**生动类比**：
- 组件是水车 (Water Wheel)，需要水流驱动才能转动
- Model 是水车的底座和控制器，负责接收水流并驱动运转
- Flow 是水流，依次流经每个 Step，驱动组件不断变化和响应

**Model 与 React 组件的对比**：

| 能力 | React 组件 | FlowModel |
|------|-----------|-----------|
| 渲染 UI | `render()` | `render()` |
| 状态管理 | `state` / `setState` | 通过 props 和模型树结构管理 |
| 生命周期 | `componentDidMount` 等 | `onInit`, `onMount`, `onUnmount` |
| 响应变化 | `componentDidUpdate` | `onBeforeAutoFlows`, `onAfterAutoFlows` |
| 错误处理 | `componentDidCatch` | `onAutoFlowsError` |
| 子组件 | JSX 嵌套 | `setSubModel` / `addSubModel` 显式设置子模型 |
| 动态行为 | 事件绑定、状态更新 | 注册和调度 Flow |
| 持久化 | 无内置机制 | `model.save()` 与后端集成 |
| 多实例复用 | 手动处理 | `createFork`（如表格每行动态渲染） |
| 引擎管理 | 无 | FlowEngine 统一注册、加载、管理 |

**FlowModel 核心能力**：

1. **registerFlow** — 注册 Flow 定义配置流程
2. **applyFlow / dispatchEvent** — 执行或触发 Flow
3. **openFlowSettings** — 打开 Flow 步骤的配置面板
4. **save / saveStepParams()** — 持久化模型配置
5. **createFork** — 复用单个模型逻辑实现多次渲染

**FlowModel 基类层级**：

| 基类 | 用途 |
|------|------|
| `BlockModel` | 基础块 |
| `DataBlockModel` | 自行获取数据的块 |
| `CollectionBlockModel` | 绑定到 Collection，自动获取数据 |
| `TableBlockModel` | 完整表格块（字段列、操作栏等）— 最常用 |
| `FieldModel` | 字段组件 |
| `ActionModel` | 操作按钮 |

**v2 前端其他关键变化**：

- **页面系统重构**：可创建 v1 和 v2 两种页面，v2 页面使用 FlowEngine 驱动
- **Block 和 Modal 可引用复用**：v1 的 copy/reference 功能有限且 bug 多，v2 彻底重定义
- **前端加载演进**：从 requirejs AMD 逐步迁移到 ESM 动态 `import()`
- **多应用/多空间前端**：支持子应用的独立前端路由和状态管理

#### 2.3.3 布局方案

NocoBase 的布局采用**自建 layout 系统**，**不使用 Ant Design ProLayout 作为主框架**（仅在部分场景使用 @ant-design/pro-layout）。这与 AUDEBase 的选择（D16 决策使用 ProLayout 作为管理后台骨架）不同：

| 对比维度 | NocoBase | AUDEBase |
|---------|----------|----------|
| 布局方案 | 自建 layout 系统 | @ant-design/pro-layout |
| 优势 | 完全可控，无第三方依赖变更风险 | 开箱即用，零开发成本 |
| 劣势 | 自建成本高，需自行处理响应式/暗色模式/多级菜单 | 依赖 ProLayout 内部实现（如 findDOMNode 问题） |
| NocoBase 经验 | v1/v2 均自建，NocoBase 社区已验证可独立构建完整后台 |

> **AUDEBase 的差异化选择理由**：ProLayout 已被 NocoBase 部分验证可用，零开发成本优势显著。已知的 findDOMNode 问题（pro-components#8686）也已记录在 pitfalls.md。

### 2.4 数据架构

#### 2.4.1 Collection + Field 元数据驱动

NocoBase 的数据架构核心是 **元数据驱动 (Metadata-Driven)**：

```
Collection (数据表抽象) → Field (字段抽象) → Block (UI 块抽象)
```

- **Collection**：定义一个数据表，包含字段定义、索引、关联关系
- **Field**：支持 30+ 字段类型（文本、数字、关联、附件、JSON、Markdown 等）
- **数据与 UI 彻底解耦**：同一个 Collection 可被多个 Block 以不同方式展示（表格、表单、卡片、日历、甘特图）

**多数据源支持**：
- 主数据库（MySQL / PostgreSQL / SQLite）
- 外部数据库（通过 Database Connection 连接远程数据库）
- 第三方 API（通过 HTTP Collection 将外部 API 映射为数据表）

**SQL Collection**（v1.7+）：允许直接编写 SQL 查询创建虚拟数据表，适合复杂报表和跨表聚合。

#### 2.4.2 自动 REST API

每个 Collection 自动生成标准 RESTful API：

```
GET    /api/{collection}:list        → 列表查询（分页、过滤、排序）
GET    /api/{collection}:get         → 单条查询
POST   /api/{collection}:create      → 创建记录
POST   /api/{collection}:update      → 更新记录
POST   /api/{collection}:destroy     → 删除记录
```

API 自动映射 ACL 权限、字段过滤、关联数据加载。这是 NocoBase 低代码体验的核心——**"定义数据模型 = API 就绪"**。

### 2.5 插件系统

#### 2.5.1 "一切皆插件"

NocoBase 的插件哲学是将平台的所有功能（包括 ACL、工作流、UI 编辑器、认证、审计日志）都实现为插件：

```
packages/
├── core/               # 核心框架（微内核）
│   ├── acl/            # 权限插件
│   ├── actions/        # CRUD action 插件
│   ├── collection-manager/  # 数据表管理
│   └── ...
└── plugins/            # 功能插件（100+）
    ├── workflow/       # 工作流引擎
    ├── auth/           # 认证
    ├── ui-editor/      # UI 编辑器
    ├── multi-app/      # 多应用管理
    ├── comments/       # 评论
    └── ...
```

**插件结构**：

```
my-plugin/
├── package.json           # npm 包声明
├── src/
│   ├── client/            # 前端代码
│   │   ├── index.tsx      # 前端入口
│   │   └── components/    # React 组件
│   └── server/            # 后端代码
│       ├── plugin.ts      # 插件类（extends Plugin）
│       ├── collections/   # 数据模型定义
│       └── actions/       # 自定义 action
└── locales/               # 国际化
```

**插件安装位置**：
- **开发模式**：`packages/plugins/` 目录（Monorepo 内开发）
- **生产模式**：`storage/plugins/` 目录（运行时通过 PluginManager 上传安装）

#### 2.5.2 插件加载策略

- **v1.x**：所有插件共享单个 Node.js 进程。优点：简单、低开销；缺点：无故障隔离、资源竞争。
- **v2.x 多应用**：主应用可选择子应用独立进程或共享进程。独立进程提供 DB 级别隔离，适合多租户场景。

> **AUDEBase 的差异化**：NocoBase 的插件无安全隔离机制，这是其最大的架构弱点之一。AUDEBase 的四层信任分组模型（D1.1）从根本上解决了这个问题——SYSTEM/Domain/Isolated/Container 分层隔离 + 组内直调/组间 JSON-RPC。

---

## 3. 核心功能

### 3.1 可视化 UI 编辑器

所见即所得 (WYSIWYG) 的拖拽式页面搭建：

- **Block 体系**：表格、表单、详情、日历、甘特图、图表、Markdown 等 20+ Block 类型
- **拖拽布局**：拖拽 Block 到页面，调整位置和大小
- **关联数据**：在同一页面展示主表和关联表的数据（例如：客户详情页 + 关联订单表格）
- **弹窗编辑**：支持弹窗表单新建/编辑记录，保持上下文

### 3.2 工作流引擎

NocoBase 的内置工作流引擎覆盖三大场景：

- **审批流**：多级审批、条件分支、会签/或签
- **自动化**：触发器（创建/更新/删除记录、定时触发）→ 节点（发送通知、调用 API、执行 SQL、更新数据）
- **定时任务**：Cron 表达式驱动的周期性任务

**工作流节点类型**：
- 计算节点（JavaScript 表达式）
- SQL 节点（执行 SQL 并处理结果）
- HTTP 请求节点（调用外部 API）
- 通知节点（站内信、邮件）
- 人工节点（审批、填写表单）
- 并行分支（多节点同时执行）

### 3.3 数据可视化

- 内置 **ECharts** 图表引擎
- 支持 **SQL 配置** 和 **JSON 配置** 两种图表定义方式
- 图表类型：柱状图、折线图、饼图、雷达图、散点图、仪表盘
- 图表随数据实时更新，支持筛选条件联动

### 3.4 AI 员工（v2.0 新增）

NocoBase 2.0 引入了角色化 AI 助理概念——**AI 员工 (AI Employees)**：

| AI 员工角色 | 职责 | 使用场景 |
|------------|------|---------|
| **翻译员** | 多语言内容翻译 | 产品描述多语言化、客户沟通翻译 |
| **分析员** | 数据分析和洞察生成 | 销售数据趋势分析、异常检测 |
| **调研员** | 信息检索与知识整合 | 市场调研报告生成、竞品信息汇总 |

AI 员工作为**工作流节点**嵌入业务流程，不是独立聊天界面——它们在需要时自动触发，完成特定任务后将结果注入业务流程。这种 "AI 嵌入流程" 的模式比 "AI Chatbot" 模式更贴近企业实际需求。

### 3.5 国际化 (i18n)

- 支持 **20+ 语言**
- **命名空间隔离**：每个插件使用 `@nocobase/plugin-{name}` 作为命名空间
- **全局共享命名空间**：`client` 命名空间承载通用 UI 字符串（如 "保存"、"取消"、"确认删除"）
- 翻译文件结构：`locale/{lang}.json`
- 前端使用 `react-i18next`

> **AUDEBase 对齐状态**：D15（前端 i18n）已决策采用相同模式——双命名空间（插件包名 + `client` 共享命名空间）+ react-i18next。

### 3.6 插件市场

- **100+ 插件**：覆盖审批、数据大屏、报表、甘特图、Markdown 编辑、文件管理、短信通知等
- 内置插件：免费开源
- 商业插件：一次性买断，无按用户收费
- v2.0 起商业版调整为 License 授权模式（见 [7. 商业化](#7-商业化与许可模式)）

---

## 4. 市场与社区

### 4.1 GitHub 数据

| 指标 | 数据（截至 2026-07） |
|------|---------------------|
| Stars | ~22,000 |
| 主要语言 | TypeScript |
| 许可证 | Apache 2.0（核心开源）+ 商业 License（商业插件） |
| 贡献者 | 数十位代码贡献者 |

### 4.2 用户案例

| 客户 | 行业 | 场景 | 亮点 |
|------|------|------|------|
| **HouseWell** (日本) | 房地产 | 从 Salesforce 迁移到 NocoBase | 替换 Salesforce + Kintone，成本大幅降低，从系统用户转型为行业方案提供商 |
| **任拓数据 (Nint)** | 数据服务 | 数字化转型核心工具 | 调研 50+ 系统后选择 NocoBase，固化 30+ 流程，关闭 140+ 应用入口 |
| **UUL 物流** | 国际物流 | 全套物流交付系统 | 预计节省 70% 开发成本（原预算 1000-2000 万 CNY → < 30%），4 个月完成财务系统 |
| **中石化五建** | 工程建设 | 项目管理系统 | 快速搭建定制化项目管理平台 |
| **Second-Brain** (香港) | AI/金融 | 金融 AI 知识系统 | 全离线部署，插件化更新规避安全审计，2 周完成初始交付，累计开发近 20 个插件 |

### 4.3 社区规模

- **商业客户**：全球 50+ 国家有商业订单
- **社区活跃度**：GitHub Issues/Discussions 活跃，中文和英文社区并重
- **文档质量**：v1 文档完善，v2 文档仍在追赶开发速度

### 4.4 行业认可

- 中国开源无代码领域 Star 数最高的项目之一
- 被多家企业选为核心数字化基础设施
- 在"替换 Salesforce/Kintone"场景中展现出竞争力

---

## 5. 版本演进与关键变化

### 5.1 版本时间线

```
v0.x  (2021-2023)    早期开发，快速迭代，API 不稳定
  │
v1.0-alpha (2024-05) 首个稳定版本，Formily 表单引擎时代
  │
v1.7.0              性能优化（百万级数据索引和缓存优化）
  │                   安全修复（CVE-2025-13877 修复于 v1.9.23）
  │
v2.0-alpha (2025-11) 架构重构：FlowEngine 替代 Formily
  │                   新增：AI 员工、多应用/多空间
  │
v2.0 (2026-02-15)    正式发布，许可策略大调整
```

### 5.2 v1 → v2 关键变更

| 维度 | v1.x | v2.x |
|------|------|------|
| **前端低代码引擎** | Formily (阿里巴巴开源) | FlowEngine (自研) |
| **表单驱动** | Schema → Formily 渲染 | Model + Flow 驱动 |
| **页面类型** | 仅 v1 页面 | 可创建 v1 和 v2 两种页面 |
| **AI 能力** | 无 | AI 员工（翻译员/分析员/调研员）|
| **多应用** | 基础支持，共享单进程 | 独立进程/DB，资源监控 |
| **多空间** | 无 | 逻辑隔离，同一实例内多空间 |
| **微前端加载** | requirejs AMD | 逐步迁移到 ESM 动态 import() |
| **商业许可** | 插件一次性买断 | License 授权（商业版） |

### 5.3 FlowEngine 架构深度解析

FlowEngine 代表了 NocoBase 从 "表单驱动的低代码" 到 "流程驱动的低代码" 的范式转变。

**为什么替换 Formily？**

1. **供应商锁定风险**：Formily 由阿里巴巴维护，NocoBase 无法控制其路线图
2. **性能局限**：复杂 Schema 解析在大型应用中出现性能瓶颈
3. **灵活度不足**：Formily 本质是表单引擎，不适合驱动完整的页面逻辑
4. **学习成本**：JSON Schema + x-reactions 体系对插件开发者不友好

**FlowEngine 的设计哲学**：

> 传统低代码引擎：Schema → 渲染 → 表单/页面
> FlowEngine：Model (组件逻辑单元) + Flow (配置流程) → 可编排的组件系统

核心创新在于将 "配置" 从 "渲染" 中解耦：Flow 负责定义配置流程（用户如何配置组件），Model 负责承载渲染和运行时逻辑。两者通过 Flow 的 Step 机制有序结合。

**FlowEngine 的实际影响**：

- **插件开发简化**：开发者不再需要学习 Formily 的 Schema 语法和 x-reactions
- **可复用性提升**：Block 和 Modal 可自由引用和复用
- **性能改善**：Model 粒度的渲染比 Schema 全量解析更高效
- **渐进式迁移**：v1 页面继续可用，v2 页面使用新引擎，允许平滑过渡

---

## 6. 历史教训与已知问题

### 6.1 安全事件

#### CVE-2025-13877 (CVSS 9.8) — JWT 默认密钥漏洞

**发现时间**：2025 年 12 月 9 日

**漏洞本质**：
NocoBase 官方 Docker 一键部署配置中使用了**公开的默认 JWT 密钥** (`APP_KEY`)。攻击者可以使用该密钥伪造任意用户的 JWT Token（包括管理员），实现：
- 完全绕过认证
- 冒充任意用户
- 获取管理员权限
- 访问敏感业务数据
- 创建/修改/删除用户

**影响范围**：
- v1 ≤ 1.9.21
- v1.0-beta ≤ 1.9.0-beta.17
- v2.0-alpha ≤ 2.0.0-alpha.51

**修复方案**（v1.9.23 / v2.0-alpha.52）：
- 禁止回退到公开默认值
- 强制执行 `APP_KEY` 环境变量显式设置或加密随机生成
- 生成的安全密钥持久化存储，受限文件权限
- 无效或弱密钥值立即触发启动失败

**根因分类**：CWE-321（硬编码加密密钥）、CWE-1320（错误消息保护不当）

> **AUDEBase 对策**：D8.1（JWT 密钥管理）已决策。AUDEBase 启动时执行 `assert(process.env.AUDE_JWT_SECRET.length >= 32)`，拒绝默认值。这是从 NocoBase CVE-2025-13877 直接吸取的教训——CVSS 9.8 级别的漏洞源于一个看似微小的配置失误。

#### GHSA-v8vm-cqh8-q87q (CVE-2026-52888) — SQL Collection 黑名单绕过

**发现时间**：2026 年 6 月 8 日

**漏洞本质**：
`plugin-collection-sql` 的 `checkSQL()` 函数使用**关键词黑名单**（黑名单）来阻止危险的 SQL 查询。但黑名单不完整——未阻止 PostgreSQL 系统目录表 (`pg_shadow`, `pg_roles`, `pg_stat_activity`) 和 NocoBase 自身的 `users` 表直接访问。

拥有 admin 角色的用户可通过 SQL Collection 功能：
- 导出 PostgreSQL 密码哈希 (`pg_shadow`)
- 读取所有 NocoBase 用户密码哈希 (`users.password`)
- 枚举完整数据库 schema (`information_schema`)

**为什么 admin 不应该有这些权限**：
NocoBase 的 admin 是应用层角色，管理的是工作流、Collection 和 UI。不是数据库管理员。SQL Collection 的 `checkSQL()` 本应强制执行这个边界，但黑名单设计的固有缺陷导致了绕过。

**修复建议**：
1. **短期**：扩展黑名单增加系统表名（但不完备）
2. **推荐**：用白名单（允许列表）替代黑名单——只允许访问用户定义的 Collection 表
3. **纵深防御**：使用受限的只读数据库用户，排除 `pg_shadow` 权限

**根因分类**：黑名单 vs 白名单设计的经典反模式

> **AUDEBase 对策**：D12（Core 数据 API 代理）已决策。所有 DB 操作通过 Core 代理，统一注入 tenant_id + record_rules + 字段过滤，防止插件绕过权限。只有声明 `security.db_direct: true` 的 Isolated 插件可获得独立 PG 连接——这是从 NocoBase GHSA-v8vm-cqh8-q87q 的直接教训中学习的设计。

#### 其他安全漏洞

| 编号 | 严重程度 | 描述 |
|------|---------|------|
| GHSA-wrwh-c28m-9jjh (CVE-2026-41641) | CVSS 7.2 (High) | `sqlCollection:update` 缺少 `checkSQL()` 调用，允许更新时注入危险 SQL |
| GHSA-vx58-fwwq-5g8j (CVE-2026-34825) | High | 工作流 SQL 节点模板变量直接拼接 SQL（非参数化），导致注入 |

### 6.2 技术教训

#### Formily 依赖风险与迁移代价

**问题**：v1 深度绑定 Formily——不仅是表单渲染，还包括 Schema 驱动的配置面板、字段联动、校验系统。整个低代码体验建立在 Formily 之上。

**后果**：v2 全面替换 Formily 意味着：
- 两套体系并存（v1 页面 + v2 页面），维护负担翻倍
- 插件开发者需要学习新的 FlowEngine API
- 已有 v1 项目迁移路径不明确
- Formily 社区维护的 NocoBase 自定义组件失去兼容性

**启示**：平台核心能力（表单引擎、Schema 引擎）应保持框架无关性。AUDEBase 的 Schema→UI 映射器设计应避免绑定特定表单库。

#### requirejs AMD 历史包袱

**问题**：NocoBase 早期采用 requirejs AMD 模块加载方案用于插件前端动态加载。然而 AMD 已在行业中被 ESM 标准取代，requirejs 几乎停止维护。

**后果**：
- 与现代构建工具（Vite、Rspack）集成困难
- 插件开发需要了解已过时的 AMD 模块规范
- v2 逐步迁移到 ESM 动态 `import()`，但历史包袱仍在

**启示**：AUDEBase 直接从 ESM + Vite 起步，避免任何历史加载方案。D21 已决策 Vite 构建 + Vendor 分组。

#### alpha 版本过早商业化

**问题**：v1.0-alpha（2024-05）到 v2.0（2026-02）期间，NocoBase 已在销售商业插件。但产品在 alpha 质量阶段，API 不稳定。

**后果**：
- 商业客户在 API 变更时产生额外维护成本
- 文档和示例滞后于开发速度，客户体验受损
- v1→v2 迁移不确定性影响客户信心

### 6.3 已知架构债务

| 债务 | 影响 | 状态 |
|------|------|------|
| requirejs AMD 加载 | 与现代工具链不兼容 | v2 逐步迁移到 ESM |
| Formily → FlowEngine 过渡 | 两套体系并存，维护负担 | 迁移中 |
| 单进程插件无隔离 | 插件崩溃影响整个应用 | v2.x 多应用部分缓解 |
| 黑名单 SQL 过滤 | 安全审计反复发现问题 | 需架构层面重构为白名单 |
| v1 → v2 迁移路径 | 已有 v1 项目缺乏明确的升级路径 | 页面可选 v1/v2 类型，但数据层兼容性未知 |

### 6.4 性能边界

- **百万级数据**：复杂关联查询存在延迟（v1.7.0 已优化索引和缓存，但未根本解决）
- **高并发写**：单进程 Koa 模型不适合高并发写入场景
- **大文件处理**：附件上传和处理的性能未优化
- **插件启动时间**：100+ 插件的 `beforeLoad()` 并行执行仍有一定启动延迟

---

## 7. 商业化与许可模式

### 7.1 许可演变

| 阶段 | 时间 | 模式 |
|------|------|------|
| v1.x 早期 | 2021-2024 | 核心开源 (Apache 2.0) + 商业插件一次性买断（按插件购买） |
| v1.x 后期 | 2024-2025 | 增加插件包 (Plugin Pack) 模式 |
| v2.0 起 | 2026-02-15 | 核心开源 (Apache 2.0) + **商业 License 授权**（商业版） |

### 7.2 v2.0 许可调整要点

**2026-02-15 正式宣布的许可变化**：

1. **部分商业插件转为开源免费**
2. **剩余商业插件不再单独销售**，统一打包进商业 License
3. **商业版按 License 授权**，购买后可获取全部商业功能
4. **老客户保护**：
   - 已购买的商业插件仍归用户所有
   - 升级到商业版时可抵扣已支付的金额
   - 插件包余额可继续用于购买 License

### 7.3 商业模式特点

| 特点 | 说明 |
|------|------|
| 无 VC 投资 | 自给自足，无外部资本压力 |
| 无按用户收费 | 一次性买断 / License 授权，不限用户数 |
| 自托管 | 数据完全在客户侧，无 SaaS 锁定 |
| 开源核心 | Apache 2.0 许可，降低采纳门槛 |
| 商业 License | 收入来源，支撑持续开发 |

### 7.4 与 Salesforce / Kintone 的成本对比（HouseWell 案例）

HouseWell 从 Salesforce 转向 NocoBase 的核心原因之一就是长期成本：

| 方案 | 成本模式 | 长期代价 |
|------|---------|---------|
| Salesforce | 按月/用户订阅 | 随业务增长持续增高 |
| Kintone | 按月/用户订阅 | 较 Salesforce 低但仍是订阅 |
| NocoBase | 一次性买断/License | 长期成本可控，无按用户收费 |

---

## 8. 未来发展

### 8.1 v2.0 路线图

基于官方博客和社区讨论，v2.x 的规划方向包括：

- **多应用插件完善**：独立进程管理、资源监控、动态创建
- **更多 AI 能力集成**：扩展 AI 员工角色，深化 AI 嵌入业务流程
- **移动端支持深化**：PWA 或原生移动端
- **性能持续优化**：大模型数据的查询和渲染性能
- **v1 → v2 平滑迁移**：更完善的迁移工具和文档

### 8.2 战略方向

NocoBase 正在从 "低代码平台" 向 **"AI + 低代码基础设施"** 转型。官方定位：

> "NocoBase aims to be the framework where humans and AI collaborate - providing the infrastructure they both need, while defining clear boundaries."

这一战略将 NocoBase 定位为 AI 时代的企业系统底座——AI 负责智能增强，人类负责决策和配置，NocoBase 提供两者协作的基础设施。

---

## 9. AUDEBase 可借鉴点

### 9.1 应当借鉴（AUDEBase 已对齐或应采纳的设计）

#### ✅ 微内核插件架构（已对齐 D1）

**NocoBase 做了什么**：
"一切皆插件"——ACL、工作流、UI 编辑器都是插件。PluginManager 统一管理插件的加载、启用、禁用、迁移。

**AUDEBase 如何对齐**：
D1 已决策微内核 + 插件热插拔架构。D1.4 生命周期 7 钩子与 NocoBase 一致。AUDEBase 还增加了四层信任分组（D1.1），在简单之上构建安全性。

#### ✅ 数据模型驱动 UI（指导 Schema Engine 设计）

**NocoBase 做了什么**：
Collection → Field → Block 的三层抽象，数据结构与 UI 彻底解耦。同一个 Collection 可被表格、表单、日历、甘特图等多种方式展示。

**AUDEBase 如何借鉴**：
D7 决策自研轻量 Schema→Ant Design 映射器。NocoBase 的三层抽象是 Schema Engine 设计的直接参考——但 AUDEBase 应保持映射器的 ORM/框架无关性，避免 Formily 式的深度绑定。

#### ✅ 插件生命周期 + 三阶段迁移（已对齐 D1.4）

**NocoBase 做了什么**：
7 个生命周期钩子（afterAdd → beforeLoad → load → install → afterEnable → afterDisable → remove）+ beforeLoad/afterSync/afterLoad 三阶段迁移。

**AUDEBase 如何对齐**：
D1.4 已决策 7 钩子 + 3 阶段迁移。与 NocoBase 高度一致，但增加了 version_gated 迁移（需特定版本才能执行），比 NocoBase 更精细。

#### ✅ 国际化双命名空间模式（已对齐 D15）

**NocoBase 做了什么**：
react-i18next + `@nocobase/plugin-{name}` 插件专属 namespace + `client` 全局共享 namespace。

**AUDEBase 如何对齐**：
D15 已决策完全相同的双命名空间模式。这是 NocoBase 验证过的成熟方案。

#### ✅ 开源 + 商业插件模式（商业化参考）

**NocoBase 做了什么**：
核心开源 (Apache 2.0) 降低采纳门槛；商业插件/License 提供收入。一次性买断，无按用户收费。

**AUDEBase 如何借鉴**：
商业模式参考。但需要注意 NocoBase v2.0 从 "插件买断" 转向 "License 授权" 的变化——这暗示单一插件买断模式在规模化时面临挑战。

#### ✅ AI 员工模式（Phase 4 参考）

**NocoBase 做了什么**：
AI 作为角色嵌入业务流程，而非独立 Chatbot。翻译员、分析员、调研员在工作流中自动触发。

**AUDEBase 如何借鉴**：
Phase 4 规划的工作流引擎可参考此模式——AI 作为工作流节点，而非独立服务。

#### ✅ 渐进式扩展策略

**NocoBase 做了什么**：
80% 无代码覆盖通用需求，20% 低代码覆盖定制需求。非技术人员可通过拖拽完成大部分工作，开发者聚焦于复杂业务逻辑。

**AUDEBase 如何借鉴**：
Phase 2 Schema Engine 应支持相同的分层——通用场景 Schema 配置，复杂场景手写代码。

### 9.2 应当避免（NocoBase 的反面教训）

#### ❌ Formily/FlowEngine 深度绑定

**NocoBase 的问题**：v1 绑定 Formily → v2 替换代价巨大。两套体系并存增加维护负担。

**AUDEBase 的对策**：Schema→UI 映射器保持框架无关性。映射器是对 Ant Design 组件的轻量声明式包装，不是对某个表单引擎的深度集成。未来如需替换 UI 库，只需重写映射器，不影响 Schema 定义。

#### ❌ requirejs AMD 历史包袱

**NocoBase 的问题**：早期选型 AMD 模块加载，如今成为现代化障碍。

**AUDEBase 的对策**：直接从 ESM + Vite 起步。D21 已决策 Vendor 分组 + 共享依赖策略。

#### ❌ 单进程无插件隔离

**NocoBase 的问题**：v1 所有插件共享单进程，一个插件崩溃影响全部。

**AUDEBase 的对策**：D1.1 四层信任分组是 AUDEBase 与 NocoBase 最大的架构差异化优势。SYSTEM/Domain/Isolated/Container 分层隔离从根本上解决了插件安全问题。

#### ❌ 黑名单式安全过滤

**NocoBase 的问题**：SQL Collection 的 `checkSQL()` 黑名单被反复绕过（CVE-2026-52888, CVE-2026-41641）。

**AUDEBase 的对策**：D12 Core 数据 API 代理采用白名单模式——只允许访问经过注册的 Collection，从根本上避免绕过。

#### ❌ alpha 阶段过早商业化

**NocoBase 的问题**：产品尚未稳定即开始商业化，API 变更影响付费客户。

**AUDEBase 的对策**：Phase 1 先完善基础设施（插件框架、RBAC、管理 UI），Phase 2 再考虑商业化。明确阶段边界。

#### ❌ 文档滞后于开发速度

**NocoBase 的问题**：v2 FlowEngine 的 API 文档和示例在 v2.0-alpha 发布后仍然不完整。

**AUDEBase 的对策**：在每个 Phase 完成时同步更新决策文档和架构文档。开发者体验是平台采纳的关键。

### 9.3 差异化机会

| 维度 | NocoBase | AUDEBase | AUDEBase 优势 |
|------|----------|----------|--------------|
| **插件安全隔离** | 无（单进程共享） | 四层信任分组 | 故障隔离、第三方插件安全 |
| **权限模型** | RBAC + 字段级 ACL | Odoo Record Rules (domain filter) | 更灵活的数据行级权限 |
| **多租户** | 多应用/多空间（v2，仍在开发） | 四阶段多租户（D4） | 从 Day 1 设计内建，而非后期添加 |
| **ORM** | Sequelize (成熟但重量级) | Drizzle + DatabaseProvider (D9) | 更轻量，DatabaseProvider 实现 ORM 可替换 |
| **HTTP 框架** | Koa | Fastify | 原生插件系统 + JSON Schema 验证 + 更高性能 |
| **布局系统** | 自建 layout | Ant Design ProLayout (D16) | 零开发成本，NocoBase 已验证可行性 |
| **前端加载** | AMD → ESM 迁移中 | ESM + Vite (Day 1) | 无历史包袱 |
| **安全设计** | 事后修复（CVE 驱动） | 事前设计（D8.1, D12 安全决策） | 安全内建而非事后补救 |

---

## 10. 关键数据速查

| 类别 | 数据 |
|------|------|
| **仓库地址** | github.com/nocobase/nocobase |
| **GitHub Stars** | ~22,000 |
| **主要语言** | TypeScript |
| **技术栈** | TypeScript + Node.js + Koa + React + Sequelize |
| **UI 库** | Ant Design 5 |
| **数据库** | MySQL / PostgreSQL / SQLite |
| **v1 表单引擎** | Formily (阿里巴巴) |
| **v2 前端引擎** | FlowEngine (自研) |
| **许可证** | Apache 2.0 (核心开源) + 商业 License |
| **插件数量** | 100+ 内置 + 商业插件 |
| **国际语言** | 20+ 语言 |
| **商业客户** | 全球 50+ 国家 |
| **初始开源** | 2021 年 3 月 |
| **v1.0-alpha** | 2024 年 5 月 |
| **v2.0-alpha** | 2025 年 11 月 |
| **v2.0 正式版** | 2026 年 2 月 15 日 |
| **已知严重安全漏洞** | CVE-2025-13877 (CVSS 9.8 JWT), CVE-2026-52888 (SQL 黑名单绕过) |
| **商业模式** | 开源核心 + 商业 License，一次性付费，无按用户收费 |
| **创始团队** | 中国团队，母公司香港注册 |

---

> **文档维护说明**：本文档为 AUDEBase Phase 0 架构研究产出。当 NocoBase 发布重大版本更新（如 v2.x 稳定版、v3.0）时，应更新此文档的对标分析。重点关注：FlowEngine 的演进方向、多应用/多空间架构的成熟度、AI 员工能力的扩展、安全事件的影响。
