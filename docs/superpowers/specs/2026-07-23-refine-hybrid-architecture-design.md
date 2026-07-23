# AUDEBase Refine + ProLayout 混合架构设计

**日期**: 2026-07-23
**状态**: 设计定稿，待实施
**决策**: D26 — 前端采用 Refine 数据层 + ProLayout 外壳 + Schema→UI 映射器胶水

**与 D25 关系**: D26 取代 D25 的「NocoBase 作为运行时」方案。D25 的以下子决策保留：Canonical Schema 往返闸门 (D25.6.2)、Agent HTTP polling 替代 WebSocket (D25.6.1)、PostgreSQL 16 强制 (D25.6.7)、削减范围砍 StatsPage/costPerKg (D25.6.9)。D25.1 中标记为 NocoBase 原生覆盖的能力改为自建。
## 一、核心决策

放弃 Fork NocoBase。AUDEBase 28 包自建后端 + Refine 前端数据层 + ProLayout 外壳 + 自建 Schema→UI 映射器。

**为什么不是 NocoBase**：AGPL 许可证 + Koa/Sequelize 技术栈不兼容 + 上游社区风险。
**为什么不是 React Admin**：antd 支持靠社区补丁，ProTable/ProForm 不支持。
**为什么不是纯自建前端**：Refine 的 dataProvider/authProvider/useList 省去手写 CRUD 重复代码。

## 二、架构总览

```
┌─────────────────────────────────────────────────────────────┐
│                     AUDEBase Admin                           │
│                                                             │
│  ProLayout 外壳 (保留)                                       │
│  ├── 菜单路由 (D16 dot命名, D24 多租户 /{tenant}/admin)       │
│  ├── 3状态认证 (App.tsx 保留)                                │
│  ├── ACLGuard / ErrorBoundary (保留)                         │
│  │                                                          │
│  │  ┌──────────────── Refine 数据区 ────────────────┐       │
│  │  │  Schema→UI Mapper (自建, ~500行)               │       │
│  │  │  Collection定义 → Refine <List>/<Create>/<Edit> │       │
│  │  │                                               │       │
│  │  │  Refine Core                                  │       │
│  │  │  ├── dataProvider  →  Fastify REST API        │       │
│  │  │  ├── useList/useCreate/useOne/useUpdate       │       │
│  │  │  └── CanAccess (权限组件)                      │       │
│  │  └───────────────────────────────────────────────┘       │
│  │                                                          │
│  │  📊 IoT 仪表盘 / Agent polling (纯 React, Refine 之外)    │
│  │  🖨️ 打印任务右侧监控面板 (纯 React, Refine 之外)           │
│  └──────────────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────┘
                              │ HTTPS
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  AUDEBase Backend (28包裁剪)                  │
│                                                             │
│  Fastify + PluginManager                                    │
│  ├── /api/auth/*     (JWT认证, token_version)               │
│  ├── /api/users/*    (CRUD, ACL中间件, tenant_id注入)        │
│  ├── /api/roles/*    (RBAC)                                 │
│  ├── /api/plugins/*  (插件管理)                              │
│  └── /api/collections/:name/*  (Schema Engine 动态路由)      │
│                                                             │
│  Drizzle ORM + PostgreSQL 16                               │
└─────────────────────────────────────────────────────────────┘
```

**核心原则**：ProLayout 决定「结构」（菜单在哪、租户是谁、认证状态），Refine 决定「数据」（怎么 CRUD、怎么分页），Schema→UI Mapper 做胶水。三者解耦，互不绑架。

## 三、页面三层模型

| 类型 | 特征 | 例子 | 数据来源 | 实现方式 |
|:---:|------|------|---------|---------|
| 🔵 纯 CRUD | 表格+新建/编辑/删除 | 材料库存、用户管理、角色权限、插件管理、模型库 | Fastify REST API | Refine `<List>/<Create>/<Edit>` |
| 🟠 双栏监控 | 左列表 + 右实时面板 | 打印任务、设备管理 | REST + WebSocket/SSE | 左边 Refine `useList`，右边手写 React |
| 🟣 纯自定义 | 非标准 CRUD 交互 | 仪表盘、Agent配置、IoT控制 | WebSocket/Agent polling | 纯手写 React，Refine 不参与 |

### 3.1 菜单与导航

按 Synology DSM 模式——「工作区」与「管理中心」分离：

```
┌── 工作区 ────────────┐    ┌── 管理中心 ──────────┐
│ 🏭 3D打印工厂         │    │ ⚙️ 系统设置           │
│   ├ 📊 仪表盘    🟣   │    │   ├ 👤 用户管理  🔵  │
│   ├ 🖨️ 打印任务  🟠   │    │   ├ 🔑 角色权限  🔵  │
│   ├ 🏗️ 设备管理  🟠   │    │   ├ 🧩 插件管理  🔵  │
│   ├ 📦 材料库存  🔵   │    │   └ 📋 审计日志  🔵  │
│   └ 📐 模型库    🔵   │    │                      │
│                       │    │                      │
│ [🏭 工作区] [⚙️ 管理] │    │ [🏭 工作区] [⚙️ 管理] │
└───────────────────────┘    └──────────────────────┘
```

操作员只看工作区，管理员进入管理中心。ProLayout 路由分组实现切换。

## 四、Refine dataProvider — 统一数据入口

所有 🔵🟠 页面的数据读写走同一入口：

```typescript
// dataProvider.ts — 整个平台只有一个
const dataProvider: DataProvider = {
  getList:    (resource, params) => {
    const { current, pageSize } = params.pagination || {}
    const query = new URLSearchParams({
      page: String(current || 1),
      limit: String(pageSize || 20),
      ...buildFilterParams(params.filters),
      ...buildSortParams(params.sorters),
    })
    return fetch(`/api/${resource}?${query}`).then(r => r.json())
  },
  getOne:     (resource, params) => fetch(`/api/${resource}/${params.id}`).then(r => r.json()),
  create:     (resource, params) => fetch(`/api/${resource}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params.data)
  }).then(r => r.json()),
  update:     (resource, params) => fetch(`/api/${resource}/${params.id}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params.data)
  }).then(r => r.json()),
  deleteOne:  (resource, params) => fetch(`/api/${resource}/${params.id}`, { method: 'DELETE' }).then(r => r.json()),
}
```

**resource 直接映射后端 Collection 名**：

```
Refine 调用                      Fastify 路由
──────────────────────          ──────────────────────
getList("print_jobs")        →  GET  /api/print_jobs?page=1&limit=20
create("materials", data)    →  POST /api/materials
getOne("devices", "id-1")    →  GET  /api/devices/id-1
deleteOne("users", "id-2")   →  DELETE /api/users/id-2
```

后端新增 Collection，前端零改动——Schema Engine 自动注册路由，dataProvider 自动支持 CRUD。

### 4.1 authProvider — 认证集成

```typescript
const authProvider: AuthProvider = {
  login:    ({ username, password }) => fetch('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ username, password })
  }).then(r => r.json()),
  logout:   () => { localStorage.removeItem('token'); return Promise.resolve() },
  check:    () => localStorage.getItem('token') ? Promise.resolve() : Promise.reject(),
  getPermissions: () => {
    const token = localStorage.getItem('token')
    if (!token) return Promise.resolve([])
    return fetch('/api/auth/me').then(r => r.json()).then(u => u.permissions ?? [])
  },
}
```

## 五、Schema→UI 映射器

移植 NocoBase SchemaComponent 的设计思想：开发者定义 Collection Schema → 页面自动生成。不复制代码，抄袭设计。

### 5.1 Collection 定义

```typescript
// collections/print_jobs.ts
interface CollectionDefinition {
  name: string
  title: string
  fields: CollectionField[]
}

interface CollectionField {
  name: string
  type: 'string' | 'number' | 'boolean' | 'enum' | 'datetime' | 'belongsTo' | 'hasMany'
  label: string
  required?: boolean
  // type-specific:
  options?: string[]              // enum
  target?: string                 // belongsTo / hasMany
  format?: string                 // datetime format
}
```

### 5.2 映射规则

| Schema type | Table column | Form field | Filter |
|-------------|-------------|------------|--------|
| `string` | 文本列，搜索 | `<Input>` | `<Input>` 模糊搜索 |
| `number` | 数字列，可排序 | `<InputNumber>` | 范围筛选 |
| `boolean` | ✅/❌ 图标 | `<Switch>` | 下拉 true/false |
| `enum` | 文本标签 | `<Select>` | 多选下拉 |
| `datetime` | 格式化日期 | `<DatePicker>` | 日期范围选择 |
| `belongsTo` | 关联名 + 外键查询 | `<Select>` 异步加载 | 下拉选择 |
| `hasMany` | 子表展开 | `<Select mode="multiple">` | — |

### 5.3 映射器 API

```typescript
// mapper.ts
interface RefinePageComponents {
  List: React.FC
  Create: React.FC
  Edit: React.FC
}

function mapCollectionToRefine(collection: CollectionDefinition): RefinePageComponents
```

内部生成：
1. `<List>` = ProTable，columns 从 fields 自动推导
2. `<Create>` = ProForm，fields 从 fields 自动推导
3. `<Edit>` = ProForm + getOne 回填

### 5.4 使用示例

```typescript
// pages/print-jobs.ts
import { printJobCollection } from '../collections/print_jobs'
const { List, Create, Edit } = mapCollectionToRefine(printJobCollection)

// 注册路由 — ProLayout 外壳
router.add('workspace.printing.print_jobs', { list: List, create: Create, edit: Edit })
```

### 5.5 双栏页面的处理

🟠 页面不使用映射器自动生成的组件，而是手写：

```tsx
// 打印任务页面 = 自定义组件
function PrintJobsPage() {
  const { data } = useList({ resource: "print_jobs" })  // Refine 拿数据

  const [selectedId, setSelectedId] = useState<string>()
  const selected = data?.data?.find(j => j.id === selectedId)

  return (
    <div style={{ display: 'flex' }}>
      <div style={{ flex: 1 }}>  {/* 左边 */}
        <Table data={data} onRowClick={setSelectedId} />
      </div>
      <div style={{ flex: 1 }}>  {/* 右边 */}
        {selected && <RealtimeMonitor jobId={selected.id} />}
      </div>
    </div>
  )
}
```

## 六、权限 — 三层模型

| 层级 | 负责 | 机制 |
|:---:|------|------|
| 菜单层 | ProLayout | 根据用户 permissions 自动过滤菜单项 |
| 按钮层 | Refine `<CanAccess>` | 声明式权限守卫，无权限不渲染 |
| 数据层 | Fastify ACL 中间件 + D10 Record Rules | tenant_id 注入 + WHERE 条件注入 + 字段过滤 |

**安全原则**：前端权限是体验层——隐藏无权限的菜单/按钮。真正的安全在后端 WHERE 子句。永远不信任前端传回来的权限声明。

```typescript
// 前端 CanAccess — 隐藏按钮用
<CanAccess resource="print_jobs" action="create">
  <Button type="primary">新建任务</Button>
</CanAccess>

// 后端 ACL 中间件 — 数据安全用
// GET /api/print_jobs
// → 自动注入: WHERE tenant_id = $ctx.tenantId
// → Record Rules: WHERE assigned_to = $ctx.userId  (操作员只看自己的任务)
```

## 七、Module 拆分

```
packages/
├── admin-ui/                  # ProLayout 外壳 + 路由 (保留, 清理)
│   ├── src/
│   │   ├── App.tsx            # ProLayout + 认证状态机 (保留, 微调)
│   │   ├── layouts/
│   │   │   ├── WorkspaceLayout.tsx    # 工作区路由组
│   │   │   └── AdminLayout.tsx       # 管理中心路由组
│   │   ├── providers/
│   │   │   ├── dataProvider.ts       # Refine dataProvider (新增)
│   │   │   ├── authProvider.ts       # Refine authProvider (新增)
│   │   │   └── refine.tsx            # <Refine> 包裹器 (新增)
│   │   ├── mapper/
│   │   │   └── schema-to-refine.ts   # Schema→UI Mapper (新增, ~500行)
│   │   └── pages/
│   │       ├── workspace/
│   │       │   ├── Dashboard.tsx          # 🟣 仪表盘 (手写)
│   │       │   ├── PrintJobsPage.tsx      # 🟠 打印任务 (自定义)
│   │       │   ├── DeviceManagement.tsx   # 🟠 设备管理 (自定义)
│   │       │   ├── MaterialsPage.tsx      # 🔵 材料库存 (映射器生成)
│   │       │   └── ModelLibrary.tsx       # 🔵 模型库 (映射器生成)
│   │       └── admin/
│   │           ├── UsersPage.tsx          # 🔵 用户管理 (映射器生成)
│   │           ├── RolesPage.tsx          # 🔵 角色权限 (映射器生成)
│   │           ├── PluginsPage.tsx        # 🔵 插件管理 (映射器生成)
│   │           └── AuditLogPage.tsx       # 🔵 审计日志 (映射器生成)
│   └── package.json            # + @refinedev/core, @refinedev/antd, @refinedev/react-router
│
├── collections/                # Collection 定义目录 (新增)
│   ├── print_jobs.ts
│   ├── devices.ts
│   ├── materials.ts
│   ├── model_library.ts
│   ├── users.ts
│   └── roles.ts
│
└── backend/ (28包裁剪, 保留核心)
    ├── core/                   # Fastify + 中间件
    ├── auth/                   # JWT 认证
    ├── rbac/                   # RBAC + D10 Record Rules
    ├── schema-engine/          # Schema→DB DDL + REST API 动态路由
    ├── plugin-framework/       # PluginManager
    ├── manifest-engine/        # manifest.yaml 解析
    └── migration/              # 数据库迁移
│
└── Backend 裁剪明细
    ├── ✅ 保留: core, auth, rbac, schema-engine, plugin-framework, manifest-engine, migration, health-check, logging-infra, shared-types, i18n, audit
    ├── 🟡 待评估: plugin-core (Bootstrap数据), cron (定时Agent), notification (告警通知)
    └── ❌ 砍/延期: plugin-communication, event-bus, websocket, api-versioning, data-extends, file-upload, workflow-core/engine/tasks, rate-limit, cli, plugin-example, admin-ui (重写为Refine版)
```

`collections/` 目录可放在 admin-ui 内部，也可独立为 `packages/collections/` 共享包（如果后端 Schema Engine 和前端映射器共用同一份 Collection 定义，独立包更合理）。Phase 1a 先放 admin-ui/src/collections/ 简化结构。

## 八、依赖

新增 3 个 npm 包：

| 包 | 用途 |
|---|------|
| `@refinedev/core` | dataProvider/authProvider hooks |
| `@refinedev/antd` | `<List>/<Create>/<Edit>` UI 组件 |
| `@refinedev/react-router` | 路由集成 |

其余全部使用现有技术栈：React 19、Ant Design 5、ProLayout、ProTable/ProForm、TanStack Query（Refine 底层使用）。

## 九、MVP 工作量

| 模块 | 天数 | 产出 |
|------|:---:|------|
| 后端裁剪（28→底座 v1） | 5d | PluginManager/SchemaEngine/RBAC/Auth 保留，砍不必要包，统一 Collection REST API |
| Refine 集成 + dataProvider | 2d | 装依赖，写 dataProvider/authProvider，验证认证→数据流闭环 |
| Schema→UI 映射器 | 5d | Collection 定义 → 自动生成 Refine 页面，6 种字段类型映射规则 |
| 管理中心 🔵 页面 | 2d | 用户/角色/插件/审计 → 全部由映射器自动生成 |
| MES 🔵 纯 CRUD | 2d | 材料库存 + 模型库 → 映射器自动生成 |
| MES 🟠 双栏监控 | 8d | 打印任务（Refine列表 + 实时监控面板）、设备管理 |
| MES 🟣 仪表盘 | 3d | IoT 实时仪表盘 + Agent HTTP polling |
| **合计** | **27d** | 单人 + AI，含测试 |

## 十、不做的（YAGNI）

- ❌ 不 Fork NocoBase 前端（SchemaComponent/Formily）——映射器自建更轻
- ❌ 不引入 React Admin —— antd 支持差
- ❌ Phase 1 不做懒加载/微前端（D17/D22 Phase 2 内容）
- ❌ Phase 1 不做字段级权限（D11 Phase 3 内容）
- ❌ 不做工作流引擎 UI —— 后端已有 Saga 引擎，前端 Phase 2

## 十一、验收标准

- [ ] dataProvider 对接任意 Collection，CRUD 全链路跑通
- [ ] Schema→UI Mapper 对 6 种字段类型生成正确的 Table/Form
- [ ] 管理中心 4 个 🔵 页面 100% 由映射器生成，无手写 ProTable columns
- [ ] 🔵🟠 页面的菜单/按钮权限通过 CanAccess 控制
- [ ] 🟠 打印任务双栏：左列表点击选择，右面板实时渲染
- [ ] 🟣 仪表盘独立渲染，不走 Refine 数据层
- [ ] 3 状态认证：token 有效自动进入，无效显示登录
- [ ] 工作区/管理中心切换：菜单互不干扰
- [ ] 测试覆盖率 ≥ 80%

## 十二、参考

- NocoBase SchemaComponent 设计思想（不复制代码）
- NocoBase ACL 三层模型（RBAC + 菜单过滤 + 字段级权限）
- Refine Headless Architecture: https://refine.dev/docs
- Synology DSM 工作区/控制面板分离模式
- D25.6 系列子决策（Agent HTTP polling、Canonical Schema 往返闸门等）
