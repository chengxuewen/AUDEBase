# AUDEBase Refine + ProLayout 混合架构设计

**日期**: 2026-07-23（审计修复: 2026-07-23）
**状态**: 设计定稿，D26 审计修复完成
**决策**: D26 — 前端采用 Refine 数据层 + ProLayout 外壳 + Schema→UI 映射器胶水
**与 D25 关系**: D26 废弃并取代 D25 的「NocoBase 作为运行时」方案（D25 标注 ⚠️ D26 替代）。保留 D25 子决策：Agent HTTP polling (D25.6.1)、Canonical Schema 往返闸门 (D25.6.2，改为 Drizzle 实现)、PostgreSQL 16 强制 (D25.6.7)、削减范围 (D25.6.9)。其余 NocoBase 特定组件（Sequelize、NocoBase Database API、Koa、Formily）全部废弃。

## 一、核心决策

放弃 Fork NocoBase。AUDEBase 15 包自建后端 + Refine 前端数据层 + ProLayout 外壳 + 自建 Schema→UI 映射器。

**为什么不是 NocoBase**：AGPL 许可证 + Koa/Sequelize 技术栈不兼容 + 上游社区风险。
**为什么不是 React Admin**：antd 支持靠社区补丁，ProTable/ProForm 不支持。
**为什么不是纯自建前端**：Refine 的 dataProvider/authProvider/useList 省去手写 CRUD 重复代码。
**Canonical Schema 往返闸门**（D25.6.2 保留）：`@audebase/schema-engine` 提供 `CollectionDef`/`FieldDef` 类型——mapper 消费此类型生成页面。往返闸门（export→import→export→diff）作为 schema-engine 集成测试独立验证，不耦合 Refine 前端。

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
│  │  │  Collection定义 → ProTable + useTable          │       │
│  │  │                                               │       │
│  │  │  Refine Core                                  │       │
│  │  │  ├── dataProvider  →  Fastify REST API        │       │
│  │  │  ├── useTable/useCreate/useOne/useUpdate      │       │
│  │  │  └── CanAccess (权限组件)                      │       │
│  │  └───────────────────────────────────────────────┘       │
│  │                                                          │
│  │  📊 IoT 仪表盘 / Agent polling (纯 React, Refine 之外)    │
│  │  🖨️ 打印任务右侧监控面板 (纯 React, Refine 之外)           │
│  └──────────────────────────────────────────────────────────┘
                              │ HTTPS
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                  AUDEBase Backend (15包底座)                  │
│                                                             │
│  Fastify + PluginManager                                    │
│  ├── /api/v1/auth/*     (JWT认证, token_version)            │
│  ├── /api/v1/users/*    (CRUD, ACL中间件, tenant_id注入)     │
│  ├── /api/v1/roles/*    (RBAC)                              │
│  ├── /api/v1/plugins/*  (插件管理)                           │
│  └── /api/v1/:collection/*  (Schema Engine 动态路由)         │
│                                                             │
│  Drizzle ORM + PostgreSQL 16                               │
└─────────────────────────────────────────────────────────────┘
```

**核心原则**：ProLayout 决定「结构」（菜单在哪、租户是谁、认证状态），Refine 决定「数据」（怎么 CRUD、怎么分页），Schema→UI Mapper 做胶水。三者解耦，互不绑架。

**ProLayout + React Router 双路由集成**（H7）：ProLayout 菜单点击通过 `useNavigate()` 驱动 React Router，Refine 路由在 ProLayout 内容区渲染。胶水代码 ~10 行：

```tsx
const navigate = useNavigate()
<ProLayout
  menuItemRender={(item, dom) => (
    <Link to={item.path!} onClick={() => navigate(item.path!)}>{dom}</Link>
  )}
/>
```

## 三、页面三层模型

| 类型 | 特征 | 例子 | 数据来源 | 实现方式 |
|:---:|------|------|---------|---------|
| 🔵 纯 CRUD | 表格+新建/编辑/删除 | 材料库存、用户管理、角色权限、插件管理、模型库 | Fastify REST API | 映射器生成 ProTable + Refine useTable |
| 🟠 双栏监控 | 左列表 + 右实时面板 | 打印任务、设备管理 | REST + HTTP polling (5s, D25.6.1) | 左边 Refine useList，右边手写 React |
| 🟣 纯自定义 | 非标准 CRUD 交互 | 仪表盘（含Agent配置、IoT控制） | Agent HTTP polling | 纯手写 React，Refine 不参与 |

> **响应式策略**（M15）：Phase 1 仅桌面 ≥1024px。ProLayout 侧边栏自带折叠。双栏页在 <768px 时垂直堆叠。ProTable 使用 `scroll={{ x: 'max-content' }}` 横向滚动。

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

所有 🔵🟠 页面的数据读写走同一入口。

### 4.1 实现

```typescript
// dataProvider.ts — 整个平台只有一个
const API_BASE = '/api/v1'  // D1.8: URL 路径版本化

const token = () => localStorage.getItem('token')
const headers = () => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${token()}`,
})

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: headers(), ...options })
  if (res.status === 401) {
    localStorage.removeItem('token')
    window.location.href = '/login'
    throw new Error('Unauthorized')
  }
  if (res.status >= 500) throw new Error(`Server error: ${res.status}`)
  const body = await res.json()
  if (!res.ok) throw new Error(body.error?.message || 'Request failed')
  return body
}

// 响应格式转换: 后端 { data, meta: { count } } → Refine { data, total }
interface ApiListResponse<T> { data: T[]; meta: { count: number; page: number; pageSize: number } }
interface ApiOneResponse<T>  { data: T }
function toListResult<T>(body: ApiListResponse<T>) {
  return { data: body.data, total: body.meta?.count ?? 0 }
}
function toOneResult<T>(body: ApiOneResponse<T>) {
  return { data: body.data }
}

// 查询参数: 使用 Refine @refinedev/simple-rest 的 stringify
import { stringify } from '@refinedev/simple-rest'

const dataProvider: DataProvider = {
  getList:    (r, p) => request<ApiListResponse<any>>(`${API_BASE}/${r}?${stringify(p)}`).then(toListResult),
  getOne:     (r, p) => request<ApiOneResponse<any>>(`${API_BASE}/${r}/${p.id}`).then(toOneResult),
  create:     (r, p) => request<ApiOneResponse<any>>(`${API_BASE}/${r}`, { method: 'POST', body: JSON.stringify(p.data) }).then(toOneResult),
  update:     (r, p) => request<ApiOneResponse<any>>(`${API_BASE}/${r}/${p.id}`, { method: 'PATCH', body: JSON.stringify(p.data) }).then(toOneResult),
  deleteOne:  (r, p) => request<ApiOneResponse<any>>(`${API_BASE}/${r}/${p.id}`, { method: 'DELETE' }).then(toOneResult),
}
```

**resource 直接映射后端 Collection 名**：

```
Refine 调用                      Fastify 路由
──────────────────────          ──────────────────────────
getList("print_jobs")        →  GET  /api/v1/print_jobs?page=1&limit=20
create("materials", data)    →  POST /api/v1/materials
getOne("devices", "id-1")    →  GET  /api/v1/devices/id-1
deleteOne("users", "id-2")   →  DELETE /api/v1/users/id-2
```

后端新增 Collection，前端零改动——Schema Engine 自动注册路由，dataProvider 自动支持 CRUD。

### 4.2 错误处理契约

| HTTP 状态 | 行为 |
|-----------|------|
| 401 Unauthorized | 清除 token → 重定向 `/login` → 抛出错误 |
| 400 Bad Request | 解析 `body.error.message` → 展示字段级错误 |
| 500 Internal Error | Toast 通知 → 记录到审计日志 |
| 网络错误 (fetch 失败) | 显示离线提示 → 自动重试（Refine 内置） |

### 4.3 authProvider — 认证集成

```typescript
const authProvider: AuthProvider = {
  login:    ({ username, password }) => fetch('/api/v1/auth/login', {
    method: 'POST', headers: headers(), body: JSON.stringify({ username, password })
  }).then(async r => {
    if (!r.ok) throw new Error((await r.json()).error?.message || 'Login failed')
    return r.json()
  }),
  logout:   () => { localStorage.removeItem('token'); return Promise.resolve() },
  // check() 是快速门禁；真正的 token 过期/撤销由 App.tsx 3状态认证 + request() 401 拦截处理
  check:    () => localStorage.getItem('token') ? Promise.resolve() : Promise.reject(),
  getPermissions: async () => {
    const t = token()
    if (!t) return []
    const res = await fetch('/api/v1/auth/me', { headers: headers() })
    if (!res.ok) return []
    const user = await res.json()
    return user.data?.permissions ?? []
  },
  // 权限变化时刷新 Refine 内部缓存
  onError: (error) => {
    if (error?.statusCode === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  },
}
```

## 五、Schema→UI 映射器

移植 NocoBase SchemaComponent 的设计思想：开发者定义 Collection Schema → 页面自动生成。不复制代码，抄袭设计。

### 5.1 Collection 定义

**mapper 直接复用 `@audebase/schema-engine` 的类型定义**（不定义并行类型系统）。

```typescript
// 从后端包导入类型
import type { CollectionDef, FieldDef } from '@audebase/schema-engine'

// Collection 文件定义在 admin-ui/src/collections/
// collections/print_jobs.ts
import type { CollectionDef } from '@audebase/schema-engine'

export const printJobCollection: CollectionDef = {
  name: 'print_jobs',
  title: '打印任务',
  fields: [
    { name: 'name',       type: 'string',   label: '任务名称', required: true },
    { name: 'status',     type: 'enum',     label: '状态',     enumValues: ['queued','printing','done','failed'] },
    { name: 'deviceId',   type: 'belongsTo',label: '设备',     target: 'devices' },
    { name: 'materialId', type: 'belongsTo',label: '材料',     target: 'materials' },
    { name: 'startedAt',  type: 'date',     label: '开始时间', format: 'YYYY-MM-DD HH:mm' },
  ],
  // 自定义 action 扩展点（M14）
  customActions: [
    { name: 'approve', label: '审批', action: 'update', params: { status: 'printing' } },
    { name: 'export',  label: '导出', handler: 'csv' },
  ],
}
```

### 5.2 映射规则

| Schema type | Table column | Form field | Filter |
|-------------|-------------|------------|--------|
| `string` | 文本列，搜索 | `<Input>` | `<Input>` 模糊搜索 |
| `text` | 截断文本 + Tooltip | `<Input.TextArea rows={4}>` | 模糊搜索 |
| `number` | 数字列，可排序 | `<InputNumber>` | 范围筛选 |
| `boolean` | ✅/❌ 图标 | `<Switch>` | 下拉 true/false |
| `enum` | 文本标签 | `<Select options={enumValues}>` | 多选下拉 |
| `date` | `dayjs` 格式化（按 format） | `<DatePicker format={field.format}>` | 日期范围选择 |
| `belongsTo` | 关联名 + 外键查询 | `<Select>` 异步加载 | 下拉选择 |
| `hasMany` | 子表展开 | `<Select mode="multiple">` | — |
| `json` | `JSON.stringify` 缩略 | `<Input.TextArea>` + JSON.parse 校验 | — |
| *other* | `defaultFieldRenderer` escape hatch | 同上 | — |

### 5.3 映射器 API

```typescript
// mapper.ts
// 关键设计：映射器生成的是 ProTable + Refine useTable，不是 Refine <List>
// Refine <List> 内部使用 antd <Table>，不支持 ProTable 高级功能。

interface PageComponents {
  List: React.FC   // ProTable + useTable
  Create: React.FC // ProForm + useCreate
  Edit: React.FC   // ProForm + useOne + useUpdate
}

function mapCollectionToRefine(collection: CollectionDef): PageComponents
```

**List 组件内部**：

```tsx
// 映射器生成的 List 模板（H2：ProTable + useTable）
function GeneratedList({ collection }) {
  const { tableProps } = useTable<Record<string, any>>({
    resource: collection.name,
    pagination: { current: 1, pageSize: 20 },
  })
  const columns = collection.fields.map(toProTableColumn)

  return (
    <ProTable
      columns={columns}
      {...tableProps}
      rowKey="id"
      search={{ labelWidth: 'auto' }}
      toolBarRender={() => [
        <CanAccess key="create" resource={collection.name} action="create">
          <Button type="primary" onClick={() => navigate(`/${collection.name}/create`)}>
            新建{collection.title}
          </Button>
        </CanAccess>,
      ]}
    />
  )
}
```

### 5.4 路由注册

```typescript
// pages/PrintJobsPage.tsx — 命名统一使用 PascalCase .tsx (H6)
import { printJobCollection } from '../collections/print_jobs'
const { List, Create, Edit } = mapCollectionToRefine(printJobCollection)

// 注册路由 — ProLayout 外壳
router.add('workspace.printing.print_jobs', { list: List, create: Create, edit: Edit })
```

### 5.5 双栏页面的处理

🟠 页面不使用映射器自动生成的组件，而是手写。

**Polling 生命周期设计**（H3）：

```tsx
function PrintJobsPage() {
  const { data } = useList({ resource: "print_jobs" })
  const [selectedId, setSelectedId] = useState<string>()
  const selected = data?.data?.find(j => j.id === selectedId)

  return (
    <div style={{ display: 'flex' }}>
      <div style={{ flex: 1 }}>
        <ProTable dataSource={data?.data} onRow={(r) => ({ onClick: () => setSelectedId(r.id) })} />
      </div>
      <div style={{ flex: 1 }}>
        {selected && <RealtimeMonitor jobId={selected.id} />}
      </div>
    </div>
  )
}

function RealtimeMonitor({ jobId }: { jobId: string }) {
  const [status, setStatus] = useState<DeviceStatus>()

  useEffect(() => {
    let active = true

    const poll = async () => {
      const res = await fetch(`/api/v1/print_jobs/${jobId}/status`)
      if (active) setStatus(await res.json())
    }

    poll()  // 首次立即执行
    const interval = setInterval(poll, 5000)

    // ① 组件卸载时清理
    return () => { active = false; clearInterval(interval) }
  }, [jobId])

  // ② 标签页切后台时暂停
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        // 暂停：不做额外操作，interval 继续但 active 标记为 false
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  return <DeviceStatusPanel jobId={jobId} status={status} />
}
```

## 六、权限 — 三层模型

| 层级 | 负责 | 机制 |
|:---:|------|------|
| 菜单层 | ProLayout | 根据用户 permissions 自动过滤菜单项 |
| 按钮层 | Refine `<CanAccess>` | 声明式权限守卫，内部调用现有 useACL().can() |
| 数据层 | Fastify ACL 中间件 + D10 Record Rules | tenant_id 注入 + WHERE 条件注入 + 字段过滤 |

**安全原则**：前端权限是体验层——隐藏无权限的菜单/按钮。真正的安全在后端 WHERE 子句。永远不信任前端传回来的权限声明。

**CanAccess 与 useACL 桥接**（M11）：

```typescript
// Refine CanAccess 内部使用现有 useACL 能力，不重复造权限引擎
function CanAccessBridge({ resource, action, children }: Props) {
  const { can } = useACL()
  return can(`${resource}:${action}`) ? <>{children}</> : null
}
```

```typescript
// 前端 CanAccess — 隐藏按钮用
<CanAccess resource="print_jobs" action="create">
  <Button type="primary">新建任务</Button>
</CanAccess>

// 后端 ACL 中间件 — 数据安全用
// GET /api/v1/print_jobs
// → 自动注入: WHERE tenant_id = $ctx.tenantId
// → Record Rules: WHERE assigned_to = $ctx.userId  (操作员只看自己的任务)
```

## 七、Module 拆分

```
packages/
├── admin-ui/                  # 🔄 重写：保留外壳(App.tsx/Providers)，CRUD页面替换为Refine
│   ├── src/
│   │   ├── App.tsx            # ProLayout + 认证状态机 (保留)
│   │   ├── layouts/
│   │   │   ├── WorkspaceLayout.tsx    # 工作区路由组
│   │   │   └── AdminLayout.tsx       # 管理中心路由组
│   │   ├── providers/
│   │   │   ├── dataProvider.ts       # Refine dataProvider (新增)
│   │   │   ├── authProvider.ts       # Refine authProvider (新增)
│   │   │   └── refine.tsx            # <Refine> 包裹器 (新增)
│   │   ├── mapper/
│   │   │   └── schema-to-refine.ts   # Schema→UI Mapper (新增, ~500行)
│   │   ├── collections/              # Collection 定义 (新增, 复用 @audebase/schema-engine 类型)
│   │   │   ├── print_jobs.ts
│   │   │   ├── devices.ts
│   │   │   ├── materials.ts
│   │   │   └── model_library.ts
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
│   └── package.json    # + @refinedev/core, @refinedev/antd, @refinedev/react-router-v6,
│                        #   @refinedev/simple-rest, @ant-design/pro-layout (显式锁定)
│
└── backend/ (15包底座)
    ├── ✅ 保留 (14包)
    │   ├── core/                   # Fastify + 中间件
    │   ├── auth/                   # JWT 认证
    │   ├── rbac/                   # RBAC + D10 Record Rules
    │   ├── schema-engine/          # Schema→DB DDL + REST API 动态路由
    │   ├── plugin-framework/       # PluginManager
    │   ├── manifest-engine/        # manifest.yaml 解析
    │   ├── migration/              # 数据库迁移
    │   ├── health-check/           # 健康检查
    │   ├── logging-infra/          # 结构化日志
    │   ├── shared-types/           # 公共类型
    │   ├── i18n/                   # 国际化
    │   ├── audit/                  # 审计日志
    │   ├── cli/                    # aude dev/db:migrate/plugin:create
    │   └── rate-limit/             # 全端点限流（security.md 强制）
    ├── 🟡 待评估
    │   ├── plugin-core/            # Bootstrap数据
    │   ├── cron/                   # 定时Agent
    │   └── notification/           # 告警通知
    └── ❌ 砍/Phase 2 恢复
        ├── event-bus               # → Phase 2 恢复（MVP 单插件无需）
        ├── websocket               # → D25.6.1 HTTP polling 替代
        ├── plugin-communication    # → Phase 2
        ├── api-versioning          # → Phase 2
        ├── data-extends            # → Phase 2
        ├── file-upload             # → Phase 2
        ├── workflow-core/engine/tasks # → Phase 2
        ├── plugin-example          # → 不恢复
        └── admin-ui (旧CRUD页面)   # → 替换为 Refine
```

## 八、依赖

新增 npm 包：

| 包 | 用途 |
|---|------|
| `@refinedev/core` | dataProvider/authProvider hooks |
| `@refinedev/antd` | useTable/useCreate/useOne/useUpdate hooks + CanAccess |
| `@refinedev/react-router-v6` | React Router v6 集成 |
| `@refinedev/simple-rest` | 查询字符串辅助函数 |
| `@ant-design/pro-layout` | 显式锁定版本（@refinedev/antd 自带但版本可能不同） |

其余全部使用现有技术栈：React 19、Ant Design 5、ProTable/ProForm、TanStack Query。

> **TanStack Query 双重 QueryClient 说明**（L16）：Refine 内部使用独立 QueryClient，不污染 App.tsx 的项目级 QueryClient。D18 的 `[pluginName, ...]` Query Key 前缀约定仅适用于项目级 QueryClient，不适用于 Refine 内部。
>
> **Vite 构建集成**（L18）：添加 `vendor-refine` chunk 到 vendor 分组（D21）。Refine 确认兼容 Vite tree-shaking。

## 九、MVP 工作量

| 模块 | 天数 | 产出 |
|------|:---:|------|
| 后端裁剪（28→15包底座） | 5d | PluginManager/SchemaEngine/RBAC/Auth 保留，砍不必要包，统一 Collection REST API |
| Refine 集成 + dataProvider | 2d | 装依赖，写 dataProvider/authProvider，验证认证→数据流闭环 |
| Schema→UI 映射器 | 5d | Collection 定义 → 自动生成 ProTable 页面，支持 ≥10 种字段类型 |
| 管理中心 🔵 页面 | 2d | 用户/角色/插件/审计 → 全部由映射器自动生成 |
| MES 🔵 纯 CRUD | 2d | 材料库存 + 模型库 → 映射器自动生成 |
| MES 🟠 双栏监控 | 8d | 打印任务（useList + 实时监控面板）、设备管理 |
| MES 🟣 仪表盘 | 3d | IoT 实时仪表盘 + Agent HTTP polling |
| **合计** | **27d** | 单人 + AI，含测试 |

## 十、不做的（YAGNI）

- ❌ 不 Fork NocoBase 前端（SchemaComponent/Formily）——映射器自建更轻
- ❌ 不引入 React Admin —— antd 支持差
- ❌ Phase 1 不做懒加载/微前端（D17/D22 Phase 2 内容）
- ❌ Phase 1 不做字段级权限（D11 Phase 3 内容）
- ❌ 不做工作流引擎 UI —— 后端已有 Saga 引擎，前端 Phase 2
- ❌ 不做 WebSocket —— D25.6.1 HTTP polling 替代
- ❌ 不做事件总线（event-bus）—— MVP 单插件，Phase 2 恢复

## 十一、验收标准

- [ ] dataProvider 对接任意 Collection，CRUD 全链路跑通（含 401→登录重定向）
- [ ] Schema→UI Mapper 对 ≥10 种字段类型生成正确的 ProTable columns + ProForm fields
- [ ] 管理中心 4 个 🔵 页面 100% 由映射器生成，无手写 ProTable columns
- [ ] 🔵🟠 页面的菜单/按钮权限通过 CanAccess 控制
- [ ] 🟠 打印任务双栏：左列表点击选择，右面板实时渲染（30s 自动刷新 clean）
- [ ] 🟠 polling 生命周期：卸载时清理 interval，切后台暂停
- [ ] 🟣 仪表盘独立渲染，不走 Refine 数据层
- [ ] 3 状态认证：token 有效自动进入，无效显示登录
- [ ] 工作区/管理中心切换：菜单互不干扰
- [ ] ProLayout 菜单点击 → React Router 导航 → Refine 页面正确渲染
- [ ] 测试覆盖率 ≥ 80%

## 十二、参考

- NocoBase SchemaComponent 设计思想（不复制代码，已废弃 D25 但设计借鉴保留）
- NocoBase ACL 三层模型（RBAC + 菜单过滤 + 字段级权限）
- Refine Headless Architecture: https://refine.dev/docs
- Synology DSM 工作区/控制面板分离模式
- D25.6 保留子决策（Agent HTTP polling、Canonical Schema 往返闸门、PostgreSQL 强制）
