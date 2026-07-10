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
this.app.router.add('admin.erp', { type: 'group', menu: { title: 'ERP', icon: 'ShopOutlined' } });
this.app.router.add('admin.erp.purchase', {
  path: '/erp/purchase',
  Component: PurchasePage,
  menu: { title: '采购管理', icon: 'ShoppingCartOutlined' },
  aclSnippet: 'erp.purchase',
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

| 层级 | 机制 | 示例 |
|------|------|------|
| 菜单项 | 路由 aclSnippet → ProLayout 自动过滤 | 无 `erp.purchase` 权限 → 菜单不显示该项 |
| 操作按钮 | `<ACLGuard action resource>` 组件 | `<ACLGuard action='create' resource='erp.purchase'><Button>新建</Button></ACLGuard>` |
| 表单字段 | ACLGuard + D11 后端过滤（双重保障） | 无 `salary` 可见权限 → 前端不渲染 + 后端 API 不返回 |

```typescript
// useACL Hook 提供三种查询
useACL().can('create', 'erp.purchase')    // 按钮级
useACL().canRoute('/erp/purchase')        // 菜单级
useACL().canField('erp.employee', 'salary') // 字段级
```

### 6.6 国际化 — react-i18next

前端使用 react-i18next，**双命名空间模式**：插件专属命名空间（包名如 `@audebase/plugin-erp`）+ 全局共享命名空间 `'client'`（通用 UI 字符串如"保存"/"取消"），与后端 Core t() 命名空间一致。

### 6.7 插件前端加载策略

按信任层级分层（详见 [decisions.md](../.agents/memorys/decisions.md) D17）：

| 信任层级 | Phase 1 | Phase 2+ | 加载方式 |
|----------|---------|----------|----------|
| SYSTEM | Monorepo 构建时打包 | 不变 | 直接引用 |
| Domain | Monorepo 构建时打包 | 动态 import() ESM | `import(plugin.assets.admin)` |
| Isolated | 不适用 | 动态 import() ESM | 同上 |
| Container | 不适用 | iframe + postMessage | 沙箱隔离（sandbox="allow-scripts"） |

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
| vendor 分组 | 内容 | 变更频率 |
|------------|------|---------|
| vendor-react | react, react-dom, react-router | 低（主版本更新） |
| vendor-antd | antd, @ant-design/icons, @ant-design/pro-components | 低（主版本更新） |
| vendor-i18n | react-i18next, i18next | 低 |
| vendor-query | @tanstack/react-query | 低 |
| plugin-chunks | 各插件独立 chunk | 高（业务迭代） |

**HMR**: Phase 1 Vite 原生，Phase 2 远程插件代理模式。

> 前端架构的完整决策记录见 [decisions.md](../.agents/memorys/decisions.md) D6-D24。

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
