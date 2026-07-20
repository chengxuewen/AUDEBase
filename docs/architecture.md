# AUDEBase 架构文档

> **版本**: 2.0 | **更新日期**: 2026-07-20 | **状态**: Phase 2 完成 — 28 packages, 95 测试文件

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
11. [安全架构](#十一安全架构)
12. [可观测性](#十二可观测性)
13. [错误模型](#十三错误模型)
14. [部署架构](#十四部署架构)

---

## 一、产品定位与愿景

**AUDEBase** 是一个面向企业的应用开发平台，对标 Odoo、NocoBase、云表等低代码/无代码平台。

### 1.1 核心定位

- **不是工业控制平台**（旧 MODACS 定位已废弃），而是**企业应用开发平台**
- 目标场景：OA（办公自动化）、ERP（企业资源计划）、MES（制造执行系统）、PLM（产品生命周期管理）、WMS（仓储管理系统）
- 核心理念：**"插件即应用"** — 每个业务系统作为独立插件套件，运行在统一平台上
- 交付形式：开源核心 + 可自托管 + 插件市场

### 1.2 竞品对标

| 产品         | 类型       | 技术栈              | 优势                                  | AUDEBase 差异化                             |
| ------------ | ---------- | ------------------- | ------------------------------------- | ------------------------------------------- |
| **Odoo**     | 开源 ERP   | Python + PostgreSQL | 模块化成熟、社区庞大、20 年积累       | 现代 TS/Node 栈、原生多租户、Schema 驱动 UI |
| **NocoBase** | 无代码平台 | Node.js + React     | 微内核架构、Schema Engine、插件热插拔 | 企业级 RBAC、工作流引擎、私有部署优先       |
| **云表**     | 低代码平台 | 私有部署            | 国内生态强、业务人员友好              | 开源 + 可自托管 + 插件市场 + 无供应商锁定   |

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

| 层级      | 进程模型            | 崩溃范围                 | 示例                         |
| --------- | ------------------- | ------------------------ | ---------------------------- |
| SYSTEM    | 1 个共享进程        | 整组重启（VS Code 模式） | rbac, schema-engine, logging |
| Domain    | 每个业务域 1 个进程 | 该域全部插件             | OA组、ERP组、MES组           |
| Isolated  | 每个插件独立进程    | 仅自身                   | 第三方插件、计算密集型       |
| Container | Docker Sidecar      | 完全隔离                 | 不可信第三方                 |

**资源**: 50 插件约 8-12 进程 / 0.4-0.7GB（vs 每插件进程 2.5-4GB）

**详情**: [插件架构分析](plugin-architecture-analysis.md#四层信任分组模型)

```
AUDEBase 架构分层
═══════════════════════════════════════════════════════════
  业务插件层    OA Suite  │  ERP Suite  │  MES Suite  │  WMS Suite  │  ...
───────────────────────────────────────────────────────────
  平台服务层    Schema Engine │ RBAC │ Workflow │ Notify │ Audit │ ...
───────────────────────────────────────────────────────────
  内核层        Plugin Manager  │  Dependency Resolver  │  DB Migration  │  plugin-core（Bootstrap）
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

AUDEBase 采用三层概念模型组织业务功能：

| 层级 | 概念 | 说明 | 示例 |
|------|------|------|------|
| L1 | **插件（Plugin）** | 最小功能单元。通过 `manifest.yaml` 声明元数据、依赖、权限、数据模型。拥有独立的路由、Slot 注册、i18n 命名空间 | `@audebase/plugin-rbac`、`@audebase/plugin-purchase` |
| L2 | **插件套件（Suite）** | 同一业务域的插件集合。套件内插件通过 D12 Core 数据 API 共享数据，通过事件总线松耦合通信，通过模型扩展机制（Phase 1b）扩展彼此的 Collection 字段 | `ERP Suite = purchase + stock + account + mrp` |
| L3 | **应用实例（Application）** | 一个完整部署实例，包含内核 + 若干 Suite/Plugin + 租户数据。用户通过 ProLayout 侧边栏按 Suite 分组访问所有已安装插件的功能 | 某客户的 AUDEBase 部署实例 |

**套件内插件协作模式**：

- **数据共享**：通过 Core 数据 API 代理（D12），统一注入 tenant_id + record_rules
- **事件通信**：通过插件事件总线发布/订阅业务事件（如 `purchase.order.created`）
- **模型扩展**（Phase 1b）：类似 Odoo 类继承机制，插件 B 可在插件 A 的 Collection 上添加新 Field
- **UI 扩展**：通过 Slot（D23）在已有页面插入自定义组件

每个业务系统（OA/ERP/MES 等）以插件套件形式存在，通过 `manifest.yaml` 声明。详见 [插件架构分析](plugin-architecture-analysis.md)。

### 2.3 设计原则（详见 decisions.md）

- **不可变性优先（G1）**：永远返回新对象，不就地修改
- **边界验证（D8）**：所有系统边界使用 Zod Schema 验证
- **插件通信**：组内直接函数调用（~0ms），组间 JSON-RPC over stdin/stdout + Redis Pub/Sub。详见 [插件架构分析](plugin-architecture-analysis.md#插件通信架构)

---

## 三、技术栈决策

| 层级     | 选型                                                    | 详情                                |
| -------- | ------------------------------------------------------- | ----------------------------------- |
| 语言     | TypeScript                                              | [技术栈选型](modules/tech-stack.md) |
| 后端     | Node.js + Fastify                                       | [技术栈选型](modules/tech-stack.md) |
| ORM      | Drizzle ORM                                             | [技术栈选型](modules/tech-stack.md) |
| 前端     | React 19 + Ant Design 5（ProLayout + ProTable/ProForm） | [技术栈选型](modules/tech-stack.md) |
| 数据库   | PostgreSQL 16+                                          | [技术栈选型](modules/tech-stack.md) |
| 任务队列 | BullMQ + Redis                                          | [技术栈选型](modules/tech-stack.md) |
| 测试     | Vitest + Playwright                                     | [技术栈选型](modules/tech-stack.md) |
| 构建     | Turborepo + tsup + Vite                                 | [技术栈选型](modules/tech-stack.md) |

**关键安全决策**：

- JWT 密钥通过环境变量注入，启动校验 ≥32 字符（参考 NocoBase CVE-2025-13877）
- antd 精确版本锁定 + npm audit + Renovate（参考 decisions.md D6.1）

**详细选型理由、替代方案分析、配置参数见 [技术栈选型](modules/tech-stack.md)**
---

## 四、核心模块设计

AUDEBase 由 28 个独立 npm 包组成，按职责分为五层：**内核** → **插件基础设施** → **横切关注点** → **数据引擎** → **扩展模块**。

### 4.1 内核 (core)

应用启动入口，负责 Fastify HTTP 服务器创建、中间件注册、插件管线编排、CLI 命令注册。

**启动管线**：数据库连接池初始化 → 核心表 bootstrap → 插件扫描与加载 → 中间件栈注册 → HTTP 服务器启动

**中间件栈**：`CORS → 请求日志 (pino + X-Request-ID) → tenant 解析 (X-Tenant-Id) → JWT 认证 → 速率限制 → rbacGuard → 路由处理`

**CLI 命令**：`aude db:migrate`（数据库迁移）、`aude tenant create/list`（租户管理）、`aude plugin list/info`（插件管理）

**配置注入**：所有敏感配置通过环境变量注入（`AUDE_JWT_SECRET`、`AUDE_CORS_ORIGINS`、`AUDE_DATABASE_URL` 等），`.env.example` 提供模板。

### 4.2 插件基础设施

#### 4.2.1 插件框架 (plugin-framework)

定义插件接口契约：PluginHost 抽象（Phase 1 `InlinePluginHost` 实现，接口预留跨进程语义）→ 7 个生命周期钩子（`afterAdd → beforeLoad → load → install → afterEnable → afterDisable → pre_uninstall`）→ PluginManager 负责插件注册、依赖解析、加载管线编排。

详见 [插件框架设计](modules/plugin-framework.md) 和 [插件架构分析](plugin-architecture-analysis.md)。

#### 4.2.2 内核插件 (plugin-core)

零依赖引导插件，类比 Odoo `base` 模块。首次运行时创建 Bootstrap 数据：admin 用户（默认密码强制首次修改）→ 默认角色（admin/member）→ 系统租户 → 默认菜单结构。声明 `dependencies: []` + `auto_install: true`（不可卸载）。

#### 4.2.3 声明系统 (manifest-engine)

解析与验证 `manifest.yaml` 文件：name/version/dependencies/runtime（mode + partition + crash_policy）/security（db_namespace）/exports/provides/permissions/models/locale/data。SemVer 版本比较 + 循环依赖检测 + Zod schema 校验。统一插件元数据、运行时配置、安全策略、导出 API 契约的声明入口。

#### 4.2.4 迁移管理 (migration-engine)

Odoo 式按版本排序 + NocoBase 三阶段迁移。Scanner→Resolver→Executor 管线：扫描 `migrations/{version}/` → 按 SemVer 排序 → 对比 `migration_history` 表 → 依次执行 `preload.sql`（DDL）→ `postsync.sql`（数据迁移）→ `postload.sql`（后处理）。支持 `aude db:migrate --dry-run` 预检。迁移失败时标记 status='failed' 并跳过该插件，不阻塞系统启动。

### 4.3 插件通信

#### 4.3.1 进程间通信 (plugin-communication)

组内直接函数调用（~0ms），组间 JSON-RPC over stdin/stdout（同步 RPC）+ Redis Pub/Sub（异步事件）。启动握手 token + nonce 防重放 + Content-Length 帧协议（1MB 上限）。

详见 [插件通信与权限](modules/plugin-communication.md)。

#### 4.3.2 事件总线 (event-bus)

应用层 EventBus：`publish(subject, payload)` / `subscribe(subject, handler)`。事件默认在 partition 内传播，跨 partition 需声明 `scope: 'global'`。`manifest.exports` 可声明 `events` 字段，Core 校验 Zod schema。同进程直接回调，跨进程通过 Redis Pub/Sub 自动传播。

### 4.4 横切关注点

#### 4.4.1 RBAC 权限引擎

PermissionEngine + rbacGuard 路由守卫。角色（admin/member）→ 权限项（`users:read`、`users:create`、`plugins:manage` 等）→ 用户角色关联。API 请求通过 JWT 提取 user_id → 查询角色 → 匹配权限项 → rbacGuard 放行或返回 403。

#### 4.4.2 审计日志 (audit)

所有 API 写操作自动记录：Fastify `onResponse` hook 拦截 POST/PUT/PATCH/DELETE → 记录 actor_id、action、resource_type、resource_id、old_values/new_values（JSONB）、ip、user_agent。`audit_log` 表 append-only（无 UPDATE/DELETE 权限），复合索引 `(tenant_id, resource_type, resource_id)`。详见 §11.9。

#### 4.4.3 国际化 (i18n)

I18nEngine + Accept-Language 头解析 + namespace 隔离。插件翻译文件 `locale/{lang}.json` 通过 `t()` 函数注入 PluginHost context。前端 react-i18next 双命名空间（插件包名 + 全局 `'client'`）。

#### 4.4.4 健康检查 (health-check)

`GET /health` 返回 JSON 状态摘要（db、redis、uptime）。`GET /health/ready` 作为 Kubernetes readiness probe，DB 连接成功后返回 200。

#### 4.4.5 日志基础设施 (logging-infra)

pino 结构化 JSON 日志 + redaction（自动遮蔽密码/token 字段）+ X-Request-ID 请求追踪。Core 提供统一日志接口，插件通过 PluginHost context 获取命名 logger。

### 4.5 数据引擎

#### 4.5.1 Schema Engine（Phase 2）

借鉴 NocoBase Collection System，运行时动态定义数据模型（Collection + Field），无需代码生成。Schema → DB DDL 自动迁移（Drizzle ORM）→ UI Form/Table 自动渲染（自研 Schema→Ant Design 映射器）。支持标量字段、关联字段（belongsTo/hasMany）、嵌套对象、Zod 边界校验。

#### 4.5.2 工作流引擎（Phase 4）

三包协作：`workflow-core`（状态机管理 + Saga 事务协调）→ `workflow-engine`（流程定义解析 + 节点执行）→ `workflow-tasks`（BullMQ 任务队列集成）。Saga 补偿模式：`execute()` + `compensate()` + `saga_log` 持久化日志 + 幂等性（idempotency_key）。

### 4.6 扩展模块

#### 4.6.1 定时任务 (cron)

BullMQ repeatable jobs。插件通过 `this.app.cron.add(schedule, handler)` API 注册，`manifest.yaml` 中 `cron` 字段声明 schedule（cron 表达式）和 handler。

#### 4.6.2 通知系统 (notification)

定义 `NotificationProvider` 抽象接口 `send(recipient, template, data)`。Phase 2 实现 Email（nodemailer）、InApp（数据库 + UI 徽标）、Webhook 三种 Provider。

#### 4.6.3 实时通信 WebSocket（Phase 2）

`/ws` 端点，支持 Collection 变更事件订阅（create/update/delete），客户端按需订阅指定 Collection + 事件类型。Fastify WebSocket 插件 + Redis Pub/Sub 跨进程传播。连接时 token 校验身份。

### 4.7 模块全景

| 模块         | Phase | 包名                             |
| ------------ | :---: | -------------------------------- |
| 内核         |  1a   | `@audebase/core`               |
| 插件框架     |  1a   | `@audebase/plugin-framework`     |
| 内核插件     |  1a   | `@audebase/plugin-core`          |
| 声明系统     |  1a   | `@audebase/manifest-engine`      |
| 迁移管理     |  1a   | `@audebase/migration`          |
| RBAC 权限    |  1a   | `@audebase/rbac`                 |
| 审计日志     |  1a   | `@audebase/audit`                |
| 国际化       |  1a   | `@audebase/i18n`                 |
| 健康检查     |  1a   | `@audebase/health-check`         |
| 日志基础设施 |  1a   | `@audebase/logging-infra`        |
| 共享类型     |  1a   | `@audebase/shared-types`         |
| JWT 认证     |  1a   | `@audebase/auth`                |
| CLI 工具     |  1a   | `@audebase/cli`                 |
| 速率限制     |  1a   | `@audebase/rate-limit`          |
| 插件通信     |  1b   | `@audebase/plugin-communication` |
| 事件总线     |  1b   | `@audebase/event-bus`            |
| 定时任务     |  1b   | `@audebase/cron`                 |
| 通知系统     |  1b   | `@audebase/notification`         |
| API 版本化   |  1b   | `@audebase/api-versioning`      |
| 数据扩展     |  1b   | `@audebase/data-extends`        |
| 文件上传     |  1b   | `@audebase/file-upload`         |
| Schema 引擎  |   2   | `@audebase/schema-engine`        |
| WebSocket    |   2   | `@audebase/websocket`            |
| 工作流核心   |   4   | `@audebase/workflow-core`        |
| 工作流引擎   |   4   | `@audebase/workflow-engine`      |
| 工作流任务   |   4   | `@audebase/workflow-tasks`       |
| Admin UI     |  1a   | `@audebase/admin-ui`             |
| 示例插件     |  1a   | `@audebase/plugin-example`       |
| **总计**     |   —   | **28 packages**                |

---

## 五、多租户架构

> 详细设计见 [多租户架构](modules/multi-tenant.md)

四阶段演进：tenant_id 字段隔离 → PostgreSQL Schema-per-tenant → Database-per-tenant → 混合模式。
文件存储：Phase 1 本地路径前缀 → Phase 2 DB 元数据 + MinIO（Odoo ir.attachment 模式）。
共享数据模型：NULL（系统级）、UUID 全零（模板租户）、普通 UUID（业务租户）。
---

## 六、前端架构

### 6.1 技术选型

> 详细选型理由见 [技术栈选型](modules/tech-stack.md) 和 [decisions.md](../.agents/memorys/decisions.md) D6-D24

**核心框架**: React 19 + Ant Design 5（唯一 UI 组件库）+ @ant-design/pro-components。

**其他技术**：React Router v7（路由）、Zustand（插件内部状态管理）、TanStack React Query（服务端状态）、react-i18next（国际化）。

**选型理由**: NocoBase 已验证 Ant Design 5 可独立覆盖企业平台全部 UI 需求（Table/ProTable、Form/ProForm、Tree、Transfer、ProLayout）。单一组件库消除库间主题冲突，ConfigProvider.theme.token 统一主题体系。

### 6.2 Admin UI 布局 — ProLayout

使用 @ant-design/pro-layout 作为管理后台骨架。ProLayout 提供：

- 侧边栏菜单（多级、折叠、暗色模式）
- 顶栏（用户菜单、租户切换、通知）
- 面包屑导航
- 移动端响应式
  （不使用 ProLayout 内置 SettingDrawer——改为通过 §6.3 `settings.panels` Slot 承载自定义主题配置，与 NocoBase 自建 theme-editor 方案一致）

插件通过代码 API 注册路由，ProLayout 自动生成侧边栏菜单项：

```typescript
// plugin.ts → load()
// 菜单分组（dot 命名约定，显式注册分组）
this.app.router.add("admin.erp", { type: "group", menu: { title: "ERP", icon: "ShopOutlined" } });
this.app.router.add("admin.erp.purchase", {
  path: "/erp/purchase",
  Component: PurchasePage,
  menu: { title: "采购管理", icon: "ShoppingCartOutlined" },
  aclSnippet: "erp.purchase",
});
// 路由冲突：相同 path 报错；Slot 冲突：相同 key 后注册覆盖
```

### 6.3 扩展插槽 — Registry + Slot

Core 预定义命名 Slot，插件通过 `slot.add()` API 注册组件到指定位置。Slot 容器自动按 aclSnippet 过滤 + 按 order 排序。Slot 无注册组件时渲染 null。**每个 Slot 组件包裹独立 ErrorBoundary**，单个组件崩溃不影响其他 Slot 组件：

### 6.4 Schema 驱动 UI（Phase 2）

Phase 1 管理后台手写 antd 代码。Phase 2 自研轻量 Schema→Ant Design 映射器：

- 将 JSON Schema 声明映射为 ProTable/ProForm/Descriptions 等 antd 组件
- 映射规则基于 Phase 1 手写代码积累的模式
- 范围限定为 antd 组件的声明式包装，非通用渲染引擎
- 不引入 Formily（NocoBase v2 正从 Formily 迁移至自研 FlowEngine）

### 6.5 前端权限 — ACLProvider + ACLGuard

三层权限控制体系（详见 [decisions.md](../.agents/memorys/decisions.md) D19）：

| 层级     | 机制                                 | 示例                                                                                 |
| -------- | ------------------------------------ | ------------------------------------------------------------------------------------ |
| 菜单项   | 路由 aclSnippet → ProLayout 自动过滤 | 无 `erp.purchase` 权限 → 菜单不显示该项                                              |
| 操作按钮 | `<ACLGuard action resource>` 组件    | `<ACLGuard action='create' resource='erp.purchase'><Button>新建</Button></ACLGuard>` |
| 表单字段 | ACLGuard + D11 后端过滤（双重保障）  | 无 `salary` 可见权限 → 前端不渲染 + 后端 API 不返回                                  |

```typescript
// useACL Hook 提供三种查询
useACL().can("create", "erp.purchase"); // 按钮级
useACL().canRoute("/erp/purchase"); // 菜单级
useACL().canField("erp.employee", "salary"); // 字段级
```

### 6.6 国际化 — react-i18next

前端使用 react-i18next，**双命名空间模式**：插件专属命名空间（包名如 `@audebase/plugin-erp`）+ 全局共享命名空间 `'client'`（通用 UI 字符串如"保存"/"取消"），与后端 Core t() 命名空间一致。

### 6.7 插件前端加载策略

按信任层级分层（详见 [decisions.md](../.agents/memorys/decisions.md) D17）：

| 信任层级  | Phase 1             | Phase 2+             | 加载方式                            |
| --------- | ------------------- | -------------------- | ----------------------------------- |
| SYSTEM    | Monorepo 构建时打包 | 不变                 | 直接引用                            |
| Domain    | Monorepo 构建时打包 | 动态 import() ESM    | `import(plugin.assets.admin)`       |
| Isolated  | 不适用              | 动态 import() ESM    | 同上                                |
| Container | 不适用              | iframe + postMessage | 沙箱隔离（sandbox="allow-scripts"） |

**资产服务**: Phase 1 Vite dev server 覆盖所有插件。Phase 2 Core 提供 `/plugins/{name}/*` HTTP 端点代理到插件 `dist/` 目录。

**Container 安全**: iframe 使用 `sandbox="allow-scripts"` + postMessage `event.origin` 校验。

### 6.8 状态管理架构

**Provider Stack**（Core 提供，包围整个 Admin，详见 decisions.md D18）：

```
<I18nextProvider>              // react-i18next
  <QueryClientProvider>        // TanStack Query
    <TenantProvider>            // 租户上下文（D24）
      <UserProvider>            // 用户上下文
        <ACLProvider>           // 权限上下文（D19）
                                // ↑ 必须在 TenantProvider 内（需 tenantId 获取权限）
          <ProLayout>
            <Outlet />          // 插件路由（ErrorBoundary + Suspense）
          </ProLayout>
        </ACLProvider>
      </UserProvider>
    </TenantProvider>
  </QueryClientProvider>
</I18nextProvider>
```

- Core 仅使用 React Context，不引入 Zustand
- 插件可自行使用 Zustand Store（插件内部，不影响其他插件）
- 跨插件共享通过 Core Provider 或事件总线
- TanStack Query key 强制 `[pluginName, ...]` 前缀避免缓存冲突

### 6.9 错误隔离

路由渲染处统一包裹 `<ErrorBoundary>` + `<Suspense>`（详见 [decisions.md](../.agents/memorys/decisions.md) D20）：

- 插件崩溃仅影响该页面区域（显示降级 UI + 重试按钮）
- 侧边栏/顶栏保持正常工作
- 崩溃记录到 Core 审计日志

### 6.10 设计系统

通过 Ant Design 5 ConfigProvider.theme.token 定义统一设计令牌（色板、间距、圆角、阴影等）。不使用 Tailwind CSS。

### 6.11 多租户前端

URL 路径前缀模式 `/{tenantId}/admin`（详见 decisions.md D24）。React Router 使用通配路由 `/:tenantId/admin/*` + 手动路径解析（basename 不支持动态段，参见 R3-2）。插件注册路由使用相对路径（如 `/erp/purchase`）。
TenantProvider 提供 tenantId / tenantConfig / availableTenants / switchTenant() 等 API。

**租户切换**（全页重载，消除 CWE-524 风险）：
`onlineManager.setOnline(false)` → `queryClient.clear()` → `window.location.href = '/{newTenantId}/admin'`

**品牌配置渐进加载**：默认主题先行渲染（避免白屏）→ 异步 fetch `GET /api/public/{tenantId}/theme.json`（localStorage + ETag 缓存）→ 成功后 ConfigProvider 热切换主题 token。

### 6.12 构建策略

**共享依赖**: React/antd/react-i18next/@tanstack/react-query 作为 Core Admin host peerDependencies，插件 externals 声明，不重复打包。

**Code Splitting**（NocoBase PR #8963 模式）:

| vendor 分组   | 内容                                                | 变更频率         |
| ------------- | --------------------------------------------------- | ---------------- |
| vendor-react  | react, react-dom, react-router                      | 低（主版本更新） |
| vendor-antd   | antd, @ant-design/icons, @ant-design/pro-components | 低（主版本更新） |
| vendor-i18n   | react-i18next, i18next                              | 低               |
| vendor-query  | @tanstack/react-query                               | 低               |
| plugin-chunks | 各插件独立 chunk                                    | 高（业务迭代）   |

**HMR**: Phase 1 Vite 原生，Phase 2 远程插件代理模式。

> 前端架构的完整决策记录见 [decisions.md](../.agents/memorys/decisions.md) D6-D24。

## 七、MVP 第一阶段范围

MVP 的目标是**证明插件架构可行**：从零到一，实现"安装插件 → 管理用户 → 查看日志"的端到端流程。

| 模块                       | 核心交付                                                                                | 优先级/阶段 | phase-planning # |
| -------------------------- | --------------------------------------------------------------------------------------- | :---------: | :--------------: |
| **内核**                   | Fastify 应用骨架、pnpm workspace 单仓结构、Drizzle 数据库连接                           |    P0-1a    |       1a#1       |
| **DB Schema**              | 完整 DDL（11 表）、所有表含 tenant_id 列 + 索引                                         |    P0-1a    |       1a#2       |
| **CLI 工具**               | `aude dev`、`aude db:migrate`、`aude plugin:create`（Phase 1a 最小 3 命令）             |    P0-1a    |       1a#3       |
| **内核插件 (plugin-core)** | Bootstrap 流程、admin/角色/菜单初始数据、模块注册表（D1.6）                             |    P0-1a    |       1a#4       |
| **数据库迁移管理**         | migration_history 表、三阶段迁移、version_gated（D1.7）                                 |    P0-1a    |       1a#5       |
| **插件框架**               | 插件发现、加载、manifest 验证、生命周期钩子                                             |    P0-1a    |       1a#6       |
| **JWT 认证**               | access token（15min）+ refresh token（7d）+ token_version 撤回 + login/refresh 端点     |    P0-1a    |       1a#7       |
| **基础 RBAC**              | 用户 → 角色 → 权限模型、API 中间件拦截                                                  |    P0-1a    |       1a#8       |
| **多租户（骨架）**         | 所有表含 tenant_id 列 + Drizzle 查询自动过滤 WHERE tenant_id                            |    P0-1a    |       1a#9       |
| **审计日志**               | audit_log 表 + Core 中间件自动记录 API 写操作（D1.12）                                  |    P0-1a    |      1a#10       |
| **国际化 (i18n) 骨架**     | Core t() + zh-CN locale/{lang}.json + react-i18next 双命名空间（D14/D15），无语言切换器 |    P0-1a    |      1a#11       |
| **管理后台**               | 插件管理页（列表/安装/启用/禁用）、用户管理页（CRUD）                                   |    P0-1a    |      1a#12       |
| **日志/调试**              | pino 结构化日志、Request ID 追踪、调试 Web UI                                           |    P0-1a    |      1a#13       |
| **速率限制**               | Fastify rate-limit 插件、/api/auth/login 5/min、全局 100/min、X-RateLimit-* 响应头      |    P0-1a    |      1a#14       |
| **API 规范与约定**         | api-specification.md + api-conventions.md（分页/过滤/排序/错误）                        |    P0-1a    |      1a#15       |
| **事件总线**               | Core EventBus publish/subscribe、同进程直接回调、Zod payload 校验（D1.9）               |    P0-1b    |       1b#1       |
| **定时任务**               | BullMQ repeatable jobs、`this.app.cron.add()` API、manifest cron 声明（D1.10）          |    P0-1b    |       1b#2       |
| **文件上传**               | 本地存储 + attachment 元数据表 + POST /api/files（D4.1）                                |    P0-1b    |       1b#3       |
| **国际化 (i18n) 完整版**   | 多语言切换器 + en-US 翻译 + locale/{lang}.json 懒加载                                   |    P0-1b    |       1b#8       |

**MVP 不包含**：Schema Engine（P2）、工作流（P4）、插件市场（P3）、WebSocket（P2）、通知系统渠道实现（P2）、审计日志归档（P2）、Record Rules 记录级权限（Phase 1.5）、字段级权限（Phase 1.5）、Saga 跨插件事务（P4）、独立 Worker 进程（P2）。

> **注意**: Phase 划分以 [docs/phase-planning.md](phase-planning.md) 为单一真实来源。本文档的模块归属仅供参考，冲突时以 phase-planning.md 为准。
> 项目当前状态见 [.agents/memorys/status.md](../.agents/memorys/status.md)。

---

## 八、开发路线图

| 阶段         | 内容                                                                                                                                                                                                           | 状态                                                   |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| **Phase 0**  | 基础设施初始化（配置、文档、代理、编码规范）                                                                                                                                                                   | ✅ 已完成                                              |
| **Phase 1a** | 插件框架 + PluginHost + Manifest + plugin-core Bootstrap + 迁移管理 + DB Schema（11 表 DDL）+ JWT + RBAC + 审计日志 + 健康检查 + 管理 UI + 日志 + CLI + 速率限制 + 多租户骨架 + i18n 骨架 + API 规范与约定文档 | ✅ 已完成                                              |
| **Phase 1b** | EventBus + Cron + 完整 i18n + 多租户管理 UI + API 版本路由（基础）+ 文件上传/存储 + 通知接口 + CLI 扩展（plugin upgrade）+ D12.1 插件间数据扩展                                                                | ✅ 已完成                                              |
| **Phase 2**  | Schema Engine + 进程模式 + Container 隔离 + manifest.exports 契约验证 + 5 状态机 + WebSocket + 通知渠道实现 + Record Rules/D10 | ✅ 已完成                                              |
| **Phase 3**  | OpenTelemetry + 插件市场 + Database-per-tenant + 混合模式                                                                                                                          | 🔲 未开始                                              |
| **Phase 4**  | 工作流引擎（core + tasks + engine）+ 业务插件套件 + 多租户混合模式（1000+ 租户）                                                                                               | ✅ 已完成（工作流引擎），业务插件套件 + 多租户混合模式延后 |

---

## 九、决策记录索引

以下架构决策已记录于 `.agents/memorys/decisions.md`（共 48 条）：

### 插件架构核心决策（Phase 1）

| ID | 决策 | 状态 | 说明 |
|----|------|------|------|
| D1 | 微内核 + 插件热插拔架构 | 已决策 | Phase 1 inline 模式（SYSTEM/Domain 共享进程） |
| D1.1 | 四层信任分组模型 | 已决策 | SYSTEM/Domain/Isolated/Container |
| D1.2 | PluginHost 接口抽象 | 已决策 | Day 1 支持跨进程语义 |
| D1.3 | 插件通信架构 | 已决策 | 组内直调 + 组间 JSON-RPC + Redis Pub/Sub |
| D1.4 | 插件生命周期 | 已决策 | 7 钩子 + 3 阶段迁移 + 2 状态（Phase 1） |
| D1.5 | manifest.yaml 规范 | 已决策 | name/version/runtime/security/exports 等字段 |
| D1.6 | 内核插件与 Bootstrap 流程 | 已决策 | @audebase/plugin-core 零依赖内核插件 |
| D1.7 | 数据库迁移版本管理 | 已决策 | migration_history + 三阶段 SQL + version_gated |
| D1.8 | API 版本控制 | 已决策 | /api/v{major}/{resource} 路径版本 |
| D1.9 | 插件事件总线 | 已决策 | publish/subscribe + Zod payload 校验 |
| D1.10 | 定时任务调度 | 已决策 | BullMQ repeatable jobs + manifest cron 声明 |
| D1.11 | 实时通信（WebSocket） | 已决策 | Phase 2 实现 |
| D1.12 | 审计日志 | 已决策 | audit_log 表 + Core 中间件自动记录 |
| D1.13 | 健康检查 | 已决策 | /health + /health/ready 端点 |
| D1.14 | 通知系统接口 | 已决策 | Phase 1b 接口定义，Phase 2 渠道实现 |

### 数据与权限决策

| ID    | 决策                                | 状态       | 说明                                     |
| ----- | ----------------------------------- | ---------- | ---------------------------------------- |
| D2    | manifest.yaml 插件声明系统          | 已决策     | Odoo 式声明模式                          |
| D3    | Schema Engine 动态模型              | 已决策     | Phase 2 实现                             |
| D4    | 多租户数据库级隔离                  | 已决策     | Phase 1 tenant_id → Schema → Database    |
| D4.1  | 文件存储多租户隔离                  | 已决策     | Phase 1 本地 → Phase 2 MinIO/S3          |
| D5    | TypeScript 全栈 + Node.js + Fastify | 已决策     | 技术选型                                 |
| D8    | Zod 边界验证                        | 已决策     | 所有系统边界                             |
| D9    | Drizzle ORM 数据库操作              | 已决策     | 0.45.x LTS + DatabaseProvider 抽象       |
| D10   | Record Rules（记录级权限）          | ✅ 已实现   | parseDomainFilter + generateWhereClause + 108 tests  |
| D11   | 字段级权限                          | 已设计论证 | 未实现；Phase 3 编码（decisions.md D11）              |
| D12   | Core 数据 API 代理                  | 已决策     | 禁止插件直连 DB                          |
| D12.1 | 插件间数据模型扩展                  | 已决策     | Odoo 类继承模式 extends 声明             |
| D13   | Saga 跨插件事务                     | 已决策     | 补偿模式 + 幂等性                        |
| D14   | i18n 国际化                         | 已决策     | NocoBase 命名空间 + locale/{lang}.json   |

### 安全相关决策

| ID   | 决策                    | 状态   | 说明                                |
| ---- | ----------------------- | ------ | ----------------------------------- |
| D6.1 | Ant Design 5 供应链安全 | 已决策 | npm audit + Renovate + 精确版本锁定 |
| D8.1 | JWT 密钥管理            | 已决策 | 环境变量注入，≥32 字符校验          |
| D9.1 | Drizzle 连接池与监控    | 已决策 | pg-pool + pino 慢查询               |

### 前端架构决策

| ID  | 决策                          | 状态   | 说明                                                 |
| --- | ----------------------------- | ------ | ---------------------------------------------------- |
| D6  | React + Ant Design 5          | 已决策 | 唯一 UI 库，ProLayout + ProTable/ProForm             |
| D7  | Schema 驱动 UI                | 已决策 | Phase 2 自研 Schema→antd 映射器                      |
| D15 | 前端 i18n — react-i18next     | 已决策 | 双命名空间（插件包名 + client）                      |
| D16 | Admin UI 布局 — ProLayout     | 已决策 | 代码 API 注册路由                                    |
| D17 | 插件前端加载策略              | 已决策 | Phase 1 monorepo → Phase 2 import() → Phase 4 iframe |
| D18 | 前端状态管理                  | 已决策 | Provider Stack + 独立 Zustand Store                  |
| D19 | 前端权限控制                  | 已决策 | ACLProvider + ACLGuard 三层权限                      |
| D20 | 插件 UI 错误隔离              | 已决策 | ErrorBoundary + Suspense                             |
| D21 | 前端构建 — Vendor 分组        | 已决策 | NocoBase PR #8963 模式                               |
| D22 | 懒加载注册                    | 已决策 | Phase 1 直接注册 → Phase 2 lazy: import()            |
| D23 | UI 扩展插槽 — Registry + Slot | 已决策 | 命名 Slot + ErrorBoundary 隔离                       |
| D24 | 多租户前端 — URL 路径前缀     | 已决策 | /{tenantId}/admin + 全页重载                         |

### 通用约定

| ID | 决策 | 状态 | 说明 |
|----|------|------|------|
| G1 | 不可变性优先 | 已决策 | 所有数据操作 |
| G2 | 小文件原则（200-400 行） | 已决策 | 代码组织 |
| G3 | 零 as any / @ts-ignore | 已决策 | 类型安全 |
| G4 | interface 优先于 type | 已决策 | TypeScript 规范 |
| G5 | AI-Driven SDD/TDD 强制开发规范 | 已决策 | Phase 1a+ 开发流程 |

- 插件架构深度分析: [plugin-architecture-analysis.md](plugin-architecture-analysis.md)（~850 行，4 轮团队审核，8 项目对比）
- 已废弃决策（旧 MODACS 架构）见 decisions.md §已废弃决策

---

## 十、参考与来源

### 项目参考文档

- **竞品调研**: [competitive-landscape.md](competitive-landscape.md) — 39+ 产品对标分析，五大类别
- **产品画像（15 份）**: `docs/reference/` — Odoo、NocoBase、ERPNext、Axelor、Directus、Corteza、AuraBoot、Strapi、Appsmith、ToolJet、Budibase、Baserow、简道云、明道云、云表
- **模块设计文档（15 份）**: `docs/modules/` — tech-stack.md、plugin-framework.md、plugin-communication.md、multi-tenant.md、file-storage.md、database-schema.md、api-specification.md、api-conventions.md、dev-workflow.md、frontend-spec.md、migration-engine-sdd.md、plugin-framework-sdd.md、test-seed-strategy.md、e2e-test-flows.md、redis-mock-guide.md
- **插件架构分析**: [plugin-architecture-analysis.md](plugin-architecture-analysis.md) — ~850 行，四层模型设计，8 项目对比

### 竞品架构参考

- **Odoo Architecture**: https://www.odoo.com/documentation/master/developer/reference/backend/orm.html — ORM、ACL + Record Rules
- **NocoBase Architecture**: https://docs.nocobase.com/welcome/introduction — 微内核、Schema Engine、Collection 系统
- **云表**: https://www.yunbiao.com — 低代码表格建模（商业产品）

### 技术栈参考

| 类别         | 技术                                                                                                                                                                                                                        |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 后端运行时   | **[Fastify](https://fastify.dev/)**、**[Node.js](https://nodejs.org/)**                                                                                                                                                     |
| 数据库与 ORM | **[PostgreSQL](https://www.postgresql.org/)**、**[Drizzle ORM](https://orm.drizzle.team/)**、**[Redis](https://redis.io/)**                                                                                                 |
| 前端框架     | **[React](https://react.dev/)**、**[Ant Design 5](https://ant.design/)**、**[ProLayout](https://procomponents.ant.design/components/layout)**                                                                               |
| 前端库       | **[react-i18next](https://react.i18next.com/)**、**[TanStack Query](https://tanstack.com/query)**、**[Zustand](https://docs.pmnd.rs/zustand)**、**[react-error-boundary](https://github.com/bvaughn/react-error-boundary)** |
| 构建工具     | **[Turborepo](https://turbo.build/repo)**、**[Vite](https://vitejs.dev/)**、**[pnpm](https://pnpm.io/)**                                                                                                                    |
| 测试框架     | **[Vitest](https://vitest.dev/)**、**[Playwright](https://playwright.dev/)**                                                                                                                                                |
| 任务队列     | **[BullMQ](https://docs.bullmq.io/)**                                                                                                                                                                                       |
| 验证         | **[Zod](https://zod.dev/)**                                                                                                                                                                                                 |
| 日志         | **[pino](https://getpino.io/)**                                                                                                                                                                                             |
| 安全         | **[PostgreSQL Row Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)**                                                                                                                                 |

---

## 十一、安全架构

> 安全决策引用：D1.1（信任分组）· D8.1（JWT 密钥）· D12（Core API 代理）· D19（ACLProvider）· D1.12（审计日志）· D6.1（供应链安全）

### 11.1 安全设计原则

| 原则                    | 含义                               | 实现                                                                                           |
| ----------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Defense in Depth**    | 多层防御，单层失效不导致全系统暴露 | 网络层（CORS/速率限制）→ 应用层（Zod 验证 + ACLGuard）→ 数据层（Core API 代理 + Record Rules） |
| **Least Privilege**     | 最小权限，默认无权限               | 菜单过滤（aclSnippet）、组件守卫（ACLGuard）、API 路由守卫（rbacGuard middleware）             |
| **Secure by Default**   | 默认安全，不依赖运维配置           | JWT 密钥启动校验拒绝默认值；admin 首次登录强制修改密码；manifest 白名单模式导出 API            |
| **Boundary Validation** | 所有系统边界强制输入验证           | Zod schema 验证所有 API 输入（URL 参数、请求体、查询参数）；Fastify JSON Schema 原生校验       |

### 11.2 认证与会话管理

#### JWT Token 体系（D8.1）

```
Access Token: 15 分钟过期，Bearer 头传输
Refresh Token: 7 天过期，SHA-256 哈希存储于 refresh_tokens 表，httpOnly cookie 传输
```

**密钥管理**：

- JWT 签名密钥通过环境变量 `AUDE_JWT_SECRET` 注入
- 启动时强制校验 `assert(key.length >= 32)`，拒绝默认值
- 参考 NocoBase CVE-2025-13877（CVSS 9.8）——默认 JWT 密钥导致任意用户冒充

**Token 撤回**：

- `users.token_version` 字段递增使所有旧 token 失效
- Refresh token 轮换：每次刷新生成新 token 对，旧 refresh token 立即失效

#### 密码安全

- bcrypt（cost=12）哈希存储，永不存储明文
- admin 默认密码强制首次修改（解决 Strapi/Directus 遗留的默认 admin:admin 问题）
- 密码修改时增量更新 `token_version`，强制所有会话重新登录

### 11.3 访问控制

#### 三层权限模型

| 层级       | 机制                 | 场景             | 实现                                                                          |
| ---------- | -------------------- | ---------------- | ----------------------------------------------------------------------------- |
| **菜单级** | aclSnippet           | 侧边栏菜单可见性 | ProLayout 自动过滤，无权限菜单不渲染                                          |
| **组件级** | ACLGuard + useACL()  | 按钮/操作可见性  | `<ACLGuard action="users:delete" resource="user/123">`；`useACL().can()` Hook |
| **API 级** | rbacGuard middleware | 路由访问控制     | 所有 CRUD 端点自动校验角色权限，未授权返回 403                                |

权限加载流程：`ACLProvider` 启动时异步获取权限列表 → 加载中 render null → 加载完成后渲染子组件。

#### Core 数据 API 代理（D12）

所有插件数据库操作必须通过 Core 数据 API 代理，禁止插件直连 PostgreSQL：

```
插件 → Core 数据 API → Drizzle ORM → PostgreSQL
         ↑
   自动注入：
   - tenant_id WHERE 子句（租户隔离）
   - Record Rules 表达式（行级权限）
   - 字段过滤（字段级权限）
```

**例外**：仅 `manifest.security.db_direct: true` 的 Isolated 插件可获得独立 PG 连接（需 `checkSQL()` 白名单验证）。

参考 NocoBase 教训：

- CVE-2026-52888 (GHSA-v8vm-cqh8-q87q, CVSS 8.8)：SQL Collection 直连绕过权限
- CVE-2026-41641 (GHSA-wrwh-c28m-9jjh, CVSS 7.2)：用户传入 SQL 片段 `checkSQL` 黑名单反复被绕过

### 11.4 信任边界

#### 四层信任分组模型（D1.1）

```
┌─────────────────────────────────────────────┐
│ SYSTEM partition（平台插件）                   │
│  · 共享进程 · 直接函数调用 · 无序列化开销        │
│  · 最高权限 · kernel / plugin-core / rbac 等   │
├─────────────────────────────────────────────┤
│ Domain partition（oa / erp / mes / ...）      │
│  · 同域共享进程 · 直接函数调用 + context 传递    │
│  · 组内通信通过 PluginHost context 注入 tenant_id│
├─────────────────────────────────────────────┤
│ Isolated partition（第三方插件）                │
│  · 每插件独立进程 · JSON-RPC 通信               │
│  · 白名单 ACL 控制可访问的资源                   │
├─────────────────────────────────────────────┤
│ Container partition（不可信沙箱）               │
│  · iframe + postMessage · 全禁网络/FS 访问      │
│  · CSP sandbox 头限制脚本能力                   │
└─────────────────────────────────────────────┘
```

**组间通信安全**：

- JSON-RPC over stdin/stdout：启动握手 token + nonce 防重放 + 帧级认证
- 帧协议：`Content-Length` 头，最大 1MB
- 访问控制矩阵约束：SYSTEM→全部、Domain→同域直调+RPC、Isolated→白名单、Container→全禁

### 11.5 API 安全

#### 输入验证（D8 + Zod）

所有 API 输入通过 Zod schema 验证，Fastify 原生 JSON Schema 在序列化阶段二次校验：

```typescript
// 请求体验证（Zod）
const createUserSchema = z.object({
  email: z.string().email().max(255),
  name: z.string().min(1).max(100),
  role_id: z.string().uuid(),
});

// Fastify 路由级别的 JSON Schema 校验
fastify.post("/api/users", {
  schema: { body: createUserSchema },
  handler: async (req) => {
    /* ... */
  },
});
```

**不信任外部数据**：URL 参数、请求体、查询参数、HTTP 头全部在进入业务逻辑前验证。

#### 速率限制

| 端点类型                   | 限制策略         | 实现                    |
| -------------------------- | ---------------- | ----------------------- |
| 认证端点（login/register） | 5 次/分钟/IP     | Fastify rate-limit 插件 |
| 通用 CRUD API              | 100 次/分钟/用户 | 中间件层                |
| 文件上传                   | 10 次/分钟/用户  | 中间件层                |

#### CORS 与 HTTP 安全头

- CORS 白名单：仅允许配置的 `AUDE_CORS_ORIGINS` 域名
- 安全响应头：`X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、`Strict-Transport-Security`
- 错误响应不泄露堆栈：生产环境返回通用消息 `{ error: 'Internal Server Error', requestId }`

### 11.6 前端安全

#### XSS 防范

- React 默认转义所有 JSX 表达式（`{userInput}` 自动转义为 HTML 实体）
- `dangerouslySetInnerHTML` 禁止使用（ESLint 规则强制检查）
- Content-Security-Policy 头：`script-src 'self'`，禁止内联脚本
- 用户生成内容的渲染通过 DOMPurify 净化

#### CSRF 防范

- SameSite=Strict cookie 策略（Refresh Token 在 httpOnly cookie 中）
- CORS 白名单限制跨域请求来源
- 关键操作（删除/修改角色）要求二次确认

#### 安全存储

| 数据类型      | 存储方式                                   | 访问限制          |
| ------------- | ------------------------------------------ | ----------------- |
| Access Token  | 内存变量（非 localStorage/sessionStorage） | JavaScript 闭包内 |
| Refresh Token | httpOnly + Secure + SameSite=Strict cookie | 浏览器不可读      |
| 用户偏好      | localStorage（非敏感）                     | —                 |

### 11.7 供应链安全

- **antd 依赖锁定**（D6.1）：精确版本，不用 `^`/`~`
- **CI 集成 npm audit**：每次 PR 自动运行
- **Renovate 自动升级**：minor/patch 自动 PR，major 需人工审核
- **定期 CVE 检查**：npm audit + GitHub Advisory Database
- **Drizzle ORM 版本锁定**（D9）：锁定 0.45.x LTS，DatabaseProvider 接口抽象隔离，更换 ORM 零成本

### 11.8 行业安全教训

以下 CVE 来自竞品分析，AUDEBase 在设计阶段主动防范：

| CVE / 漏洞          | 项目            | CVSS | 类型                         | AUDEBase 防范措施                                |
| ------------------- | --------------- | :--: | ---------------------------- | ------------------------------------------------ |
| CVE-2025-13877      | NocoBase        | 9.8  | 默认 JWT 密钥                | D8.1: 启动校验 ≥32 字符，拒绝默认值              |
| GHSA-v8vm-cqh8-q87q | NocoBase        | 8.8  | DB 直连绕过权限              | D12: Core 数据 API 代理，禁止插件直连 DB         |
| GHSA-wrwh-c28m-9jjh | NocoBase        | 7.2  | SQL Collection checkSQL 绕过 | D12: 白名单模式取代黑名单，Zod 验证所有 SQL 输入 |
| 多个 XSS            | Odoo/Strapi     |  —   | 未净化用户输入               | React 默认转义 + CSP 头 + DOMPurify              |
| 沙箱绕过            | Axelor/Directus |  —   | Groovy/JS 沙箱逃逸           | D1.1: Container 隔离 + sandbox CSP               |
| 默认密码            | Strapi/Directus |  —   | 默认 admin:admin             | D1.6: admin 首次登录强制修改密码                 |
| IDOR                | Strapi          |  —   | 缺乏行级权限                 | D10: Record Rules 自动注入 WHERE 条件            |

**核心教训**：安全不能事后补救。NocoBase 的三个高危 CVE 均源于"功能先行、安全后补"的开发模式（先实现 SQL Collection 功能，再补 checkSQL 黑名单，反复被绕过）。AUDEBase 的安全决策（D8.1/D12/D1.1）在架构设计阶段即制定，内建于代码而非运维配置。

### 11.9 审计日志（D1.12）

所有 API 写操作自动记录审计日志，不可篡改：

```sql
CREATE TABLE audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  actor_id    UUID NOT NULL,          -- 操作人
  action      VARCHAR(50) NOT NULL,   -- create / update / delete
  resource_type VARCHAR(100) NOT NULL, -- users / roles / plugins
  resource_id UUID NOT NULL,
  old_values  JSONB,                  -- 变更前值
  new_values  JSONB,                  -- 变更后值
  ip          INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 按资源查询审计历史
CREATE INDEX idx_audit_resource
  ON audit_log (tenant_id, resource_type, resource_id);
```

- **触发时机**：Fastify `onResponse` hook 拦截所有 POST/PUT/PATCH/DELETE 请求
- **不可篡改性**：审计日志表无 UPDATE/DELETE 权限（append-only），仅管理员可 SELECT
- **Phase 2+**：支持按保留期限（如 90 天）自动归档，集成 SIEM 系统

### 11.10 安全检查清单

部署前必须通过以下检查：

- [ ] `AUDE_JWT_SECRET` 已设置且 ≥32 字符（非默认值）
- [ ] `AUDE_CORS_ORIGINS` 已配置为实际前端域名（非 `*`）
- [ ] 生产环境 `NODE_ENV=production` 已设置（禁用详细错误信息）
- [ ] HTTPS 已启用（TLS 1.2+）
- [ ] 数据库密码通过环境变量注入（非硬编码）
- [ ] `npm audit` 无 HIGH/CRITICAL 漏洞
- [ ] 所有 API 端点启用速率限制
- [ ] CSP 头已配置且测试通过

---

## 十二、可观测性

### 12.1 结构化日志

采用 pino 作为统一日志框架（D5 技术栈决策）：

```
所有服务日志 → stdout（JSON 行格式）→ 日志收集器
```

**核心约定**：

- 请求级上下文：每个请求分配唯一 `X-Request-ID`，自动注入所有日志条目
- 敏感信息遮蔽：密码、token、密钥字段自动替换为 `[REDACTED]`
- 插件命名空间：插件通过 `this.ctx.logger` 获取命名 logger（包名作为 name 字段）
- 禁止 `console.log`：ESLint 规则强制检查，仅 pino logger 实例可用

**日志级别**：`trace → debug → info → warn → error → fatal`。生产环境默认 `info`，可通过 `AUDE_LOG_LEVEL` 覆盖。

### 12.2 健康检查

- `GET /health`：返回 JSON `{ status, db, redis, uptime }`
- `GET /health/ready`：Kubernetes readiness probe，DB 连接成功返回 200
- 详见 §4.4.4 和 decisions.md D1.13

### 12.3 慢查询监控

Drizzle ORM 查询通过 D9.1 决策定义了监控策略：

- **阈值**：>100ms 的查询记录为 WARN 级别日志
- **信息**：SQL 文本、参数、执行时间、调用位置（文件:行号）
- **Phase 2+**：集成 pg_stat_statements 扩展获取数据库端查询统计

### 12.4 指标采集（Phase 2+）

| 指标类别     | 采集点                                                 | 工具                                   |
| ------------ | ------------------------------------------------------ | -------------------------------------- |
| HTTP 请求    | 响应时间、状态码分布、请求量                           | Prometheus exporter（fastify-metrics） |
| 数据库连接池 | 活跃连接数、等待队列深度                               | pg-pool 事件 + Prometheus gauge        |
| 插件健康     | 插件状态（loaded/disabled/migration_failed）、内存占用 | 内部 health endpoint                   |
| BullMQ 队列  | 等待/活跃/完成/失败任务数                              | BullMQ metrics                         |

Phase 2 暴露 `/metrics` 端点供 Prometheus 抓取。

### 12.5 分布式追踪（Phase 3+）

Phase 3+ 规划引入 OpenTelemetry 支持：

- W3C Trace Context 传播（通过 HTTP 头 `traceparent`）
- 跨插件调用追踪（组内直接调用 + 组间 JSON-RPC 自动传播 span）
- 与 pino 日志集成（trace_id 注入日志条目）

---

## 十三、错误模型

### 13.1 错误码体系

| 类别     | 错误码范围 | 示例                                                           |
| -------- | :--------: | -------------------------------------------------------------- |
| 认证     | 1000-1099  | `AUTH_INVALID_TOKEN` (1001)、`AUTH_EXPIRED_TOKEN` (1002)       |
| 授权     | 1100-1199  | `FORBIDDEN` (1100)、`INSUFFICIENT_PERMISSION` (1101)           |
| 输入验证 | 1200-1299  | `VALIDATION_ERROR` (1200)、`INVALID_UUID` (1201)               |
| 资源     | 1300-1399  | `NOT_FOUND` (1300)、`CONFLICT` (1301)、`ALREADY_EXISTS` (1302) |
| 数据库   | 1400-1499  | `DB_CONNECTION_FAILED` (1400)、`MIGRATION_FAILED` (1401)       |
| 插件     | 1500-1599  | `PLUGIN_LOAD_FAILED` (1500)、`CIRCULAR_DEPENDENCY` (1501)      |
| 内部     | 2000-2099  | `INTERNAL_ERROR` (2000)                                        |

### 13.2 统一错误响应格式

所有 API 错误返回一致的 JSON 信封：

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "email must be a valid email address",
    "details": [{ "field": "email", "issue": "invalid_format" }],
    "requestId": "req_a1b2c3d4"
  }
}
```

**生产环境保护**：`NODE_ENV=production` 时，`500` 错误不暴露堆栈，仅返回 `{ error: { code: "INTERNAL_ERROR", message: "Internal Server Error", requestId } }`。

### 13.3 错误处理模式

**Fastify 全局错误处理器**：捕获所有未处理异常 → 提取 Zod 验证错误 → 映射为统一错误码 → 记录审计日志（仅写操作）→ 返回 JSON 响应。

**插件隔离**：插件 `load()` 异常不传播到 Core——标记插件状态为 `error` 并跳过，系统继续运行其余插件。前端 ErrorBoundary 隔离组件崩溃。

### 13.4 Saga 补偿（Phase 4 / D13）

跨插件工作流采用 Saga 补偿模式：

```
每个 Saga Step:
  execute()  → 成功 → 下一步
             → 失败 → 逆序执行 compensate()（已执行步骤）

幂等性保证: idempotency_key 去重
持久化: saga_log 表（含 tenant_id），可恢复悬挂事务
```

已知限制（Phase 4）：Core 崩溃后未完成 Saga 悬挂，管理员通过 CLI 工具恢复。

---

## 十四、部署架构

### 14.1 本地开发

Docker Compose 一键启动（`docker compose up`）：

```yaml
services:
  postgres: # PostgreSQL 16，端口 5432
  redis: # Valkey 8，端口 6379
  audebase: # Node.js 应用，端口 3000
    depends_on: [postgres, redis]
    environment:
      - AUDE_DATABASE_URL=postgresql://...
      - AUDE_REDIS_URL=redis://redis:6379
      - AUDE_JWT_SECRET=${AUDE_JWT_SECRET} # .env 文件注入
```

启动后访问 `http://localhost:3000`，Admin UI 自动可用。默认管理员账号需在首次登录时修改密码。

### 14.2 生产部署

**Phase 1 推荐**：单机 Docker Compose（PostgreSQL + Redis + Node.js 应用）；可叠加 Nginx 反向代理 + Let's Encrypt HTTPS。

**Phase 2+ 规划**：

- PostgreSQL 高可用（Patroni + etcd）
- Redis Sentinel 哨兵模式
- Node.js 集群（PM2 cluster mode / K8s Deployment with HPA）
- 静态资源 CDN（Admin UI 构建产物）
- PgBouncer 连接池统一管理多租户连接

### 14.3 资源估算

| 场景     | 插件数 | 租户数 | 预计资源                   |
| -------- | :----: | :----: | -------------------------- |
| MVP      | 10-15  |  1-3   | 1 vCPU, 2GB RAM            |
| 小型生产 | 20-30  | 10-30  | 2 vCPU, 4GB RAM + 20GB SSD |
| 中型生产 | 30-50  | 50-200 | 4 vCPU, 8GB RAM + 50GB SSD |

进程数随四层信任分组模型（D1.1）线性增长：50 插件 ≈ 8-12 进程。

### 14.4 数据库迁移策略

迁移通过 `aude db:migrate` 命令执行（或 CLI `--auto-migrate` 启动参数），策略遵循 D1.7：

- **自动迁移**：开发环境启用，应用启动时自动执行待处理迁移
- **手动迁移**：生产环境推荐 `aude db:migrate` CLI 命令，与应用部署分离
- **预检**：CI 集成 `aude db:migrate --dry-run` 防止破坏性迁移合并
- **降级**：升级前自动创建数据库快照（pg_dump），失败时管理员手动恢复
- **零停机原则**：迁移仅添加列/表（不执行 `DROP COLUMN`/`RENAME`），破坏性操作通过应用层兼容两阶段部署处理

### 14.5 CI/CD（Phase 2+）

Phase 2+ 规划 GitHub Actions 流水线：

```
PR → lint + type-check → npm audit → test (vitest --run) → db:migrate --dry-run
↓
merge → build → Docker image → deploy staging
↓
E2E (Playwright) → deploy production
```

**质量闸门**：覆盖率 ≥ 80%（G5），npm audit 无 HIGH/CRITICAL 漏洞（D6.1）
