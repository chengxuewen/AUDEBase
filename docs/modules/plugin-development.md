# 插件开发指南

AUDEBase 插件开发完整参考手册 — 涵盖从项目结构、生命周期到测试发布的全部主题。

---

## 目录

1. [插件架构概述](#1-插件架构概述)
2. [插件项目结构](#2-插件项目结构)
3. [manifest.yaml 完全参考](#3-manifestyaml-完全参考)
4. [插件类与生命周期](#4-插件类与生命周期)
5. [数据模型声明](#5-数据模型声明)
6. [权限系统](#6-权限系统)
7. [API 路由注册](#7-api-路由注册)
8. [管理 UI 开发](#8-管理-ui-开发)
9. [事件总线](#9-事件总线)
10. [国际化 (i18n)](#10-国际化-i18n)
11. [数据库迁移](#11-数据库迁移)
12. [插件间通信](#12-插件间通信)
13. [定时任务](#13-定时任务)
14. [测试策略](#14-测试策略)
15. [发布与部署](#15-发布与部署)
16. [附录：常见问题](#16-附录常见问题)

---

## 1. 插件架构概述

### 1.1 微内核 + 插件架构

AUDEBase 采用微内核（Kernel）+ 插件热插拔架构。Kernel 负责 HTTP 服务、JWT 认证、多租户中间件和插件管线编排；所有业务逻辑以插件形式运行。

### 1.2 四层信任分组

插件按信任度分组，而非每插件独立进程：

| 层级 | 进程模型 | 通信方式 | 典型场景 |
|------|---------|---------|---------|
| **SYSTEM** | 共享进程 | 直接函数调用 | 平台插件（auth, audit, i18n） |
| **Domain** | 业务域共享进程 | 直接函数调用 + RPC | OA、ERP 等业务域内插件 |
| **Isolated** | 每插件独立进程 | JSON-RPC（白名单） | 第三方插件 |
| **Container** | 容器沙箱 | JSON-RPC（全禁出） | 不可信插件 |

在 `manifest.yaml` 的 `runtime.partition` 和 `runtime.mode` 中声明。

### 1.3 PluginHost 接口

插件不直接访问 Core 内部 API，而是通过 `PluginHost` 接口与 Core 交互。

```typescript
interface PluginHost {
  /** 加载一个插件，返回 PluginInstance */
  loadPlugin(manifest: Manifest): Promise<PluginInstance>;
  /** 卸载已加载的插件 */
  unloadPlugin(name: string): Promise<void>;
  /** 获取已加载的插件实例 */
  getPlugin(name: string): PluginInstance | undefined;
}
```

`PluginHost` 由 `InlinePluginHost` 实现（Phase 1a）。插件通过动态 `import()` 加载，
所有方法均为异步（D1.2 mock 约束）。

> **注意**：当前 Phase 1a 的 `PluginHost` 仅提供加载/卸载抽象。
> 数据库、路由、事件等能力由 Kernel 层在 `load()` 阶段通过插件入口模块注入。
> 详细信息参见 `packages/plugin-framework/src/types.ts` 和 `packages/plugin-example/src/index.ts`。
---

## 2. 插件项目结构

### 2.1 创建插件骨架

```bash
aude plugin scaffold foo --partition oa --mode inline --with-models
```

参数说明：

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--partition` | 信任域分组（SYSTEM/oa/erp/mes/isolated） | `oa` |
| `--mode` | 运行模式（inline/process/container） | `inline` |
| `--with-models` | 包含数据模型声明模板 | `false` |

### 2.2 完整结构

```
packages/plugin-foo/
├── package.json              # @audebase/plugin-foo
├── manifest.yaml             # 插件元数据声明
├── tsconfig.json             # TypeScript 配置（继承 root）
├── vitest.config.ts          # 测试配置（继承 root）
├── src/
│   ├── index.ts              # 插件入口：createPlugin() 工厂函数
│   ├── plugin.ts             # 插件类：生命周期钩子
│   ├── models/               # 数据模型（可选）
│   │   └── order.ts
│   ├── services/             # 业务服务（可选）
│   │   └── order-service.ts
│   └── admin/                # Admin UI 入口（可选）
│       ├── index.tsx         # 路由 + Slot 注册
│       ├── pages/
│       │   └── index.tsx     # 默认页面
│       └── components/
│           └── order-table.tsx
├── migrations/               # 数据库迁移（可选）
│   └── 0.2.0/
│       ├── preload.sql
│       ├── postsync.sql
│       └── postload.sql
├── test/
│   ├── plugin.test.ts        # 插件单元测试
│   ├── models.test.ts        # 模型测试
│   └── setup.ts              # 测试基础设施
└── locale/
    ├── en-US.json
    └── zh-CN.json
```

### 2.3 package.json

```json
{
  "name": "@audebase/plugin-foo",
  "version": "0.1.0",
  "description": "Foo plugin for AUDEBase",
  "main": "src/index.ts",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@audebase/plugin-framework": "workspace:*",
    "@audebase/shared-types": "workspace:*"
  },
  "devDependencies": {
    "@audebase/test-utils": "workspace:*",
    "vitest": "^2.0.0"
  }
}
```

---

## 3. manifest.yaml 完全参考

manfest.yaml 是插件的「身份证」，是 AUDEBase 插件声明系统的核心。Core 启动时读取所有插件的 manifest，完成依赖解析、权限注册、模型合并。

### 3.1 完整字段

以下是 `manifest.yaml` 的全部支持字段：

```yaml
# ===== 元数据（必填） =====
name: "@audebase/plugin-foo"     # 插件包名（npm scope + 命名）
version: "0.1.0"                 # 语义化版本 (SemVer 2.0)
display_name: "Foo 管理"         # 用户界面显示名称
description: "管理 Foo 业务数据"  # 描述（显示在插件管理界面）
category: "oa"                   # 分类标签
license: "Apache-2.0"            # 许可证

# ===== 应用声明（可选） =====
application:
  entry: "./src/index.ts"        # 插件入口文件
  author: "Your Name"            # 作者

# ===== 依赖声明 =====
dependencies: []                 # 对其他插件的依赖（包名数组）
# 例如: ["@audebase/plugin-core", "@audebase/rbac"]

# ===== 运行时配置 =====
runtime:
  mode: inline                   # inline | process | container
  partition: oa                  # SYSTEM | oa | erp | mes | isolated
  crash_policy: restart          # restart | ignore | halt

# ===== 生命周期配置 =====
lifecycle:
  auto_install: false            # 依赖满足时自动安装
  migration_version: "0.1.0"     # 当前迁移版本号

# ===== 安全配置 =====
security:
  db_namespace: "public"         # 数据库命名空间

# ===== 数据模型声明 =====
models:
  - name: orders
    table: foo_orders
    fields:
      - name: id
        type: uuid
        primary: true
        default: uuid_generate_v4()
      - name: title
        type: text
        required: true
      - name: amount
        type: decimal
      - name: status
        type: text
        default: "draft"

# ===== 权限声明 =====
permissions:
  - orders:create
  - orders:read
  - orders:update
  - orders:delete

# ===== 导出 API 契约（Phase 1b+） =====
exports:
  api_version: "1.0.0"
  events:
    - "foo:order.created"
    - "foo:order.updated"
    - "foo:order.deleted"
  methods:
    - method: "foo.getOrders"
      params:
        status: "string"
      returns: "Order[]"

# ===== 静态资源（Phase 1b+） =====
assets:
  - "dist/admin.js"               # Admin UI 入口

# ===== 定时任务声明（Phase 1b+） =====
cron:
  - name: "cleanup-old-orders"
    schedule: "0 3 * * *"         # 每天凌晨 3 点
    handler: "cleanupOldOrders"

# ===== 国际化配置（Phase 1b+） =====
locale:
  path: "locale"
  default: "zh-CN"

# ===== 扩展其他插件的模型（Phase 1b+） =====
extends:
  - collection: users
    addFields:
      - name: foo_department
        type: text
```

### 3.2 必填字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `name` | string | `@audebase/plugin-{name}` 格式 |
| `version` | string | SemVer 2.0 版本号 |
| `display_name` | string | 界面显示名 |
| `runtime.mode` | string | `inline` / `process` / `container` |
| `runtime.partition` | string | `SYSTEM` / `oa` / `erp` / `mes` / `isolated` |

### 3.3 runtime.mode 说明

| mode | 隔离级别 | 通信方式 | 适用场景 |
|------|---------|---------|---------|
| `inline` | 无（同进程） | 直接函数调用 | Phase 1 开发、SYSTEM 插件 |
| `process` | OS 进程级 | JSON-RPC stdin/stdout | 正式环境、Domain 插件 |
| `container` | 容器级 | JSON-RPC（网络） | 不可信第三方插件 |

### 3.4 runtime.partition 说明

| partition | 说明 | 典型插件 |
|-----------|------|---------|
| `SYSTEM` | 平台基础服务 | 权限、审计、国际化、日志 |
| `oa` | 办公自动化 | 审批、考勤、报销 |
| `erp` | 企业资源计划 | 采购、库存、生产 |
| `mes` | 制造执行 | 工序、质检、设备 |
| `isolated` | 第三方高风险 | 支付、报表、面部识别 |

---

## 4. 插件类与生命周期

### 4.1 七个生命周期钩子

插件类实现以下生命周期钩子。除 `load()` 为必填外，其余均可选：

```typescript
interface PluginInstance {
  // ===== 必填 =====
  name: string;

  /** 加载插件代码（Core 调用入口文件后立即调用） */
  load(): Promise<void>;

  // ===== 可选 =====

  /** 插件被发现并注册后调用 */
  afterAdd?(): Promise<void>;

  /** 加载前调用 — 注册数据模型、中间件、i18n、CLI 命令 */
  beforeLoad?(): Promise<void>;

  /** 加载插件代码（Core 调用入口文件后立即调用） — 必填 */
  load(): Promise<void>;

  /** 首次安装时调用 — 创建数据库表、写入系统配置、加载演示数据 */
  install?(): Promise<void>;

  /** 启用后调用 — 启动定时任务、注册事件监听、开放端口 */
  afterEnable?(): Promise<void>;

  /** 禁用后调用 — 注销事件、停止定时任务 */
  afterDisable?(): Promise<void>;

  /** 卸载前调用 — 提醒用户备份数据 */
  preUninstall?(): Promise<void>;
}

### 4.2 钩子调用顺序

  → afterAdd()               # 插件注册
  → beforeLoad()            # 注册模型、中间件、i18n
  → load()                  # 加载插件代码，注册路由
  → install()               # 首次安装：创建表、写入配置
  → afterEnable()           # 启用后：启动定时任务、事件监听
  ... 插件运行中 ...
  → afterDisable()          # 禁用时：停止定时任务、注销事件
  → preUninstall()          # 卸载前：提醒备份

### 4.3 插件状态机

Phase 1 使用双状态：

```
disabled  ──enable──→  enabled
enabled   ──disable─→  disabled
```

Phase 2 扩展为五状态：`discovered` → `installed` → `enabled` / `disabled`。

### 4.4 完整插件类示例

参见 AUDEBase 示例插件 [`@audebase/plugin-example-todo`](../../packages/plugin-example/) 的完整代码。

核心结构：

```typescript
// packages/plugin-foo/src/index.ts
import type { PluginInstance } from '@audebase/plugin-framework';

export class FooPlugin implements PluginInstance {
  readonly name = '@audebase/plugin-foo';

  // ===== 生命周期实现 =====

  async afterAdd(): Promise<void> {
    // 插件注册后调用 — 此时可访问 PluginManager
  }

  async beforeLoad(): Promise<void> {
    // 加载前准备 — 注册数据模型、中间件
  }

  async load(): Promise<void> {
    // 必填 — 加载插件代码，注册路由和服务
    // 通过 Kernel 注入的上下文访问 router、db 等能力
  }

  async install(): Promise<void> {
    // 首次安装 — 创建数据库表、写入初始配置
  }

  async afterEnable(): Promise<void> {
    // 启用后 — 启动定时任务、注册事件监听
  }

  async afterDisable(): Promise<void> {
    // 禁用后 — 注销事件、停止定时任务
  }

  async preUninstall(): Promise<void> {
    // 卸载前 — 提醒用户备份数据
  }
}

// 工厂函数 — PluginManager 调用此函数创建实例
export function createPlugin(): FooPlugin {
  return new FooPlugin();
}
```
> **说明**：当前 Phase 1a 的 PluginHost 仅提供加载/卸载抽象。
> 数据库、路由、事件等 Kernel 能力通过 `load()` 阶段由 Kernel 注入。
> 完整示例见 `packages/plugin-example/src/index.ts`。

---

> **代码示例约定**：以下各节（§5-§15）的代码示例中，`host` 代表 Kernel 注入的服务上下文
（非 `PluginHost` 接口），包含 `db`, `events`, `logger`, `router`, `rpc`, `t` 等能力。
> 这些能力由 Kernel 在插件 `load()` 阶段通过入口模块注入。
> 实际接口定义见 `packages/kernel/src/plugins/loader.ts`。

## 5. 数据模型声明

### 5.1 manifest.yaml 声明

数据模型在 `manifest.yaml` 的 `models` 字段中声明：

```yaml
models:
  - name: orders
    table: foo_orders
    fields:
      - name: id
        type: uuid
        primary: true
        default: uuid_generate_v4()
      - name: title
        type: text
        required: true
      - name: customer_name
        type: text
      - name: amount
        type: decimal
      - name: status
        type: text
        default: "draft"
        enum: ["draft", "confirmed", "shipped", "cancelled"]
      - name: notes
        type: text
        nullable: true
```

### 5.2 支持的字段类型

| 类型 | 说明 | PostgreSQL 映射 |
|------|------|----------------|
| `uuid` | UUID 主键 | `UUID` |
| `text` | 文本 | `TEXT` |
| `varchar(n)` | 定长文本 | `VARCHAR(n)` |
| `integer` | 整数 | `INTEGER` |
| `decimal` | 精确小数 | `DECIMAL(10,2)` |
| `boolean` | 布尔值 | `BOOLEAN` |
| `timestamp` | 时间戳 | `TIMESTAMP` |
| `json` | JSON 对象 | `JSONB` |
| `belongs_to` | 关联字段 | `UUID REFERENCES` |

### 5.3 扩展其他插件的模型

通过 `extends` 字段给已有 Collection 添加字段：

```yaml
extends:
  - collection: users
    addFields:
      - name: department
        type: text
      - name: employee_id
        type: text
```

---

## 6. 权限系统

### 6.1 权限声明

在 `manifest.yaml` 中声明插件所需的权限项：

```yaml
permissions:
  - orders:create
  - orders:read
  - orders:update
  - orders:delete
  - orders:export
```

权限项格式：`{resource}:{action}`。

### 6.2 路由守卫

在路由上添加 RBAC 守卫：

```typescript
import { rbacGuard } from '@audebase/rbac';

// 需要 orders:read 权限
router.get('/api/foo/orders', {
  preHandler: [authenticate, rbacGuard('orders:read')],
}, async (req, reply) => {
  // ...
});

// 需要 orders:create 权限
router.post('/api/foo/orders', {
  preHandler: [authenticate, rbacGuard('orders:create')],
}, async (req, reply) => {
  // ...
});
```

### 6.3 前端权限控制

```tsx
import { ACLGuard, useACL } from '@audebase/admin-ui';

// 组件级权限守卫
<ACLGuard action="orders:create" resource="orders">
  <Button type="primary">新建订单</Button>
</ACLGuard>

// Hook 方式
function OrderActions() {
  const { can } = useACL();

  return (
    <Space>
      {can('orders:create') && <Button>新建</Button>}
      {can('orders:delete') && <Button danger>删除</Button>}
    </Space>
  );
}
```

---

## 7. API 路由注册

### 7.1 基本路由

```typescript
// GET — 列表查询
router.get('/api/foo/orders', async (req, reply) => {
  const orders = await host.db.query.fooOrders.findMany();
  return reply.send({ data: orders, total: orders.length });
});

// GET — 单条查询
router.get('/api/foo/orders/:id', async (req, reply) => {
  const { id } = req.params as { id: string };
  const order = await host.db.query.fooOrders.findFirst({ where: { id } });
  if (!order) return reply.status(404).send({ error: 'Not found' });
  return reply.send({ data: order });
});

// POST — 创建
router.post('/api/foo/orders', async (req, reply) => {
  const order = await host.db.query.fooOrders.create({ data: req.body });
  reply.status(201);
  return reply.send({ data: order });
});

// PUT — 更新
router.put('/api/foo/orders/:id', async (req, reply) => {
  const { id } = req.params as { id: string };
  await host.db.query.fooOrders.update({ where: { id }, data: req.body });
  return reply.send({ success: true });
});

// DELETE — 删除
router.delete('/api/foo/orders/:id', async (req, reply) => {
  const { id } = req.params as { id: string };
  await host.db.query.fooOrders.delete({ where: { id } });
  return reply.send({ success: true });
});
```

### 7.2 API 版本控制

通过 manifest.yaml 的 `exports.api_version` 声明 API 版本：

```yaml
exports:
  api_version: "1.0.0"
```

Core 自动按主版本号路由：`/api/v1/foo/orders`。

---

## 8. 管理 UI 开发

### 8.1 Admin 入口

创建 `src/admin/index.tsx`：

```tsx
import type { AdminPluginSetup } from '@audebase/admin-ui';
import { lazy } from 'react';

export function setup(app: AdminPluginSetup): void {
  // 注册路由
  app.router.add('admin.foo.orders', {
    path: '/admin/foo/orders',
    Component: lazy(() => import('./pages/orders')),
    aclSnippet: 'orders:read',
    menu: {
      title: '订单管理',
      icon: 'OrderedListOutlined',
    },
  });

  // 注册 Slot 组件
  app.slot.add('header.actions.right', {
    key: 'foo-quick-create',
    Component: lazy(() => import('./components/quick-create')),
    order: 100,
  });
}
```

### 8.2 页面组件

```tsx
// src/admin/pages/orders.tsx
import { ProTable } from '@ant-design/pro-components';
import { Button, Space, message } from 'antd';
import { useQuery, useMutation } from '@tanstack/react-query';

export default function OrdersPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['@audebase/plugin-foo', 'orders'],
    queryFn: () => fetch('/api/v1/foo/orders').then(r => r.json()),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/v1/foo/orders/${id}`, { method: 'DELETE' }),
    onSuccess: () => message.success('删除成功'),
  });

  const columns = [
    { title: '标题', dataIndex: 'title', key: 'title' },
    { title: '状态', dataIndex: 'status', key: 'status' },
    { title: '金额', dataIndex: 'amount', key: 'amount' },
    {
      title: '操作',
      key: 'actions',
      render: (_: unknown, record: { id: string }) => (
        <Space>
          <Button size="small" onClick={() => deleteMutation.mutate(record.id)}>
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <ProTable
      columns={columns}
      dataSource={data?.data ?? []}
      loading={isLoading}
      rowKey="id"
    />
  );
}
```

### 8.3 菜单注册

```tsx
// 创建菜单分组
app.router.add('admin.foo', {
  type: 'group',
  menu: {
    title: 'Foo 管理',
    icon: 'AppstoreOutlined',
  },
});

// 分组下的子页面
app.router.add('admin.foo.orders', {
  path: '/admin/foo/orders',
  Component: lazy(() => import('./pages/orders')),
  aclSnippet: 'orders:read',
});

app.router.add('admin.foo.settings', {
  path: '/admin/foo/settings',
  Component: lazy(() => import('./pages/settings')),
  aclSnippet: 'foo:settings',
});
```

### 8.4 Slot 插槽

Core 预定义 Slot 用于 UI 扩展：

| Slot 名称 | 位置 | 说明 |
|-----------|------|------|
| `header.actions.right` | 顶栏右侧 | 全局操作按钮 |
| `sidebar.bottom` | 侧边栏底部 | 版本号、帮助链接等 |
| `settings.panels` | 设置页面 | 自定义设置面板 |
| `dashboard.widgets` | 仪表盘 | 自定义仪表盘卡片 |

```tsx
app.slot.add('dashboard.widgets', {
  key: 'foo-stats',
  Component: lazy(() => import('./widgets/foo-stats')),
  order: 10,
  aclSnippet: 'orders:read',
});
```

---

## 9. 事件总线

### 9.1 发布事件

```typescript
// 发布事件
await this.host?.events.publish('foo:order.created', {
  id: order.id,
  title: order.title,
  timestamp: new Date().toISOString(),
});

// 附带 Zod schema 校验
await this.host?.events.publish('foo:order.created', payload, orderCreatedSchema);
```

### 9.2 订阅事件

```typescript
// 订阅事件
this.host?.events.on('foo:order.created', (payload) => {
  this.host?.logger.info({ orderId: payload.id }, '收到订单创建事件');
  // 执行业务逻辑
});

// 一次性订阅
this.host?.events.once('auth:user.login', (payload) => {
  this.host?.logger.info({ userId: payload.id }, '用户首次登录');
});
```

### 9.3 声明事件

在 `manifest.yaml` 的 `exports.events` 中声明事件，便于其他插件发现和 Core 校验：

```yaml
exports:
  events:
    - "foo:order.created"
    - "foo:order.updated"
    - "foo:order.deleted"
```

---

## 10. 国际化 (i18n)

### 10.1 翻译文件

```
locale/
├── en-US.json
└── zh-CN.json
```

`locale/zh-CN.json`：

```json
{
  "orders.title": "订单管理",
  "orders.create": "新建订单",
  "orders.delete": "删除订单",
  "orders.status.draft": "草稿",
  "orders.status.confirmed": "已确认",
  "orders.status.shipped": "已发货",
  "orders.empty": "暂无订单数据"
}
```

### 10.2 使用翻译

```typescript
// 服务端 — 通过 PluginHost
const title = this.host?.t('orders.title');

// 前端 — 通过 react-i18next
import { useTranslation } from 'react-i18next';

function OrdersPage() {
  const { t } = useTranslation('@audebase/plugin-foo');
  return <h1>{t('orders.title')}</h1>;
}
```

---

## 11. 数据库迁移

### 11.1 创建迁移

```bash
aude plugin migration new add_notes_field --plugin=@audebase/plugin-foo
```

生成：

```
packages/plugin-foo/migrations/20260719_001_add_notes_field/
├── preload.sql
├── postsync.sql
└── postload.sql
```

### 11.2 迁移三阶段

**preload.sql** — 在所有 `beforeLoad()` 前执行，用于 DDL 操作：

```sql
-- preload.sql
ALTER TABLE foo_orders ADD COLUMN notes TEXT;
ALTER TABLE foo_orders ADD COLUMN priority INTEGER DEFAULT 0;
```

**postsync.sql** — Core 数据库同步完成后执行，用于数据迁移：

```sql
-- postsync.sql
UPDATE foo_orders SET priority = 1 WHERE status = 'confirmed';
UPDATE foo_orders SET priority = 2 WHERE status = 'shipped';
```

**postload.sql** — 所有 `load()` 完成后执行，用于后处理：

```sql
-- postload.sql
CREATE INDEX IF NOT EXISTS idx_foo_orders_priority ON foo_orders(priority);
VACUUM ANALYZE foo_orders;
```

### 11.3 运行迁移

```bash
# 运行所有待执行迁移
pnpm db:migrate

# 预检模式（CI 集成）
aude db:migrate --dry-run
```

### 11.4 版本管理

每次迁移需要更新 `manifest.yaml` 中的 `lifecycle.migration_version`：

```yaml
lifecycle:
  migration_version: "0.2.0"  # 与迁移目录版本号一致
```

Core 对比 `migration_history` 表，仅执行版本号大于已记录的迁移。

---

## 12. 插件间通信

### 12.1 组内通信

同一 partition 内的插件可以直接相互调用：

```typescript
// 在同 partition 中调用其他插件的服务
const rbacPlugin = this.host?.getPlugin('@audebase/rbac');
const roles = await rbacPlugin?.getRoles(tenantId);
```

### 12.2 跨组通信

跨 partition 的插件通过 JSON-RPC 通信：

```yaml
# manifest.yaml 中声明调用白名单
runtime:
  calls:
    - "@audebase/rbac"
    - "@audebase/notification"
```

```typescript
// 通过 RPC 调用其他 partition 的插件方法
const result = await this.host?.rpc.call('@audebase/notification', 'send', {
  recipient: userId,
  template: 'order_confirmed',
  data: { orderId },
});
```

### 12.3 事件传播

事件默认在 partition 内传播。跨 partition 传播需显式声明 `scope: 'global'`：

```typescript
await this.host?.events.publish('order.created', payload, {
  scope: 'global',
});
```

---

## 13. 定时任务

### 13.1 声明定时任务

```yaml
cron:
  - name: "cleanup-old-orders"
    schedule: "0 3 * * *"       # 每天凌晨 3 点
    handler: "cleanupOldOrders"

  - name: "sync-external-data"
    schedule: "*/15 * * * *"    # 每 15 分钟
    handler: "syncExternalData"
```

### 13.2 实现处理器

```typescript
class FooPlugin {
  /** 清理 90 天前的已取消订单 */
  async cleanupOldOrders(): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);

    await this.host?.db.query.fooOrders.deleteMany({
      where: {
        status: 'cancelled',
        updatedAt: { lt: cutoff },
      },
    });

    this.host?.logger.info('已清理过期订单');
  }

  /** 同步外部系统数据 */
  async syncExternalData(): Promise<void> {
    // 调用外部 API 同步数据
  }
}
```

---

## 14. 测试策略

### 14.1 测试配置

`vitest.config.ts`：

```typescript
import { defineConfig, mergeConfig } from 'vitest/config';
import rootConfig from '../../vitest.config';

export default mergeConfig(rootConfig, defineConfig({
  test: {
    name: '@audebase/plugin-foo',
    setupFiles: ['./test/setup.ts'],
    coverage: {
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
      },
    },
  },
}));
```

### 14.2 测试基础设施

`test/setup.ts`：

```typescript
import { beforeAll, afterAll, afterEach } from 'vitest';
import { createMockPluginHost } from '@audebase/test-utils';
import { FooPlugin } from '../src';

let plugin: FooPlugin;
let host: ReturnType<typeof createMockPluginHost>;

beforeAll(() => {
  host = createMockPluginHost();
  plugin = new FooPlugin();
});

afterEach(async () => {
  // 清理测试数据（transaction rollback）
  await host.db.rollback();
});

afterAll(async () => {
  await host.db.close();
});

export { plugin, host };
```

### 14.3 单元测试

`test/plugin.test.ts`（AAA 模式）：

```typescript
import { describe, it, expect } from 'vitest';
import { FooPlugin } from '../src';
import { createMockPluginHost } from '@audebase/test-utils';

describe('FooPlugin', () => {
  it('应该在 load() 后设置 loaded 为 true', async () => {
    // Arrange
    const plugin = new FooPlugin();
    const host = createMockPluginHost();
    await plugin.afterAdd(host);

    // Act
    await plugin.load();

    // Assert
    expect(plugin.isLoaded).toBe(true);
  });

  it('install() 应该创建 orders 表', async () => {
    // Arrange
    const plugin = new FooPlugin();
    const host = createMockPluginHost();
    await plugin.afterAdd(host);

    // Act
    await plugin.install();

    // Assert
    const tables = await host.db.getTables();
    expect(tables).toContain('foo_orders');
  });

  it('afterDisable() 应该注销所有事件监听', async () => {
    // Arrange
    const plugin = new FooPlugin();
    const host = createMockPluginHost();
    await plugin.afterAdd(host);
    await plugin.afterEnable();

    // Act
    await plugin.afterDisable();

    // Assert
    expect(host.events.listenerCount()).toBe(0);
  });
});
```

### 14.4 运行测试

```bash
# 运行单个插件测试
pnpm --filter @audebase/plugin-foo test

# 监视模式
pnpm --filter @audebase/plugin-foo test:watch

# 覆盖率报告
pnpm --filter @audebase/plugin-foo test --coverage
```

---

## 15. 发布与部署

### 15.1 构建

```bash
# 构建所有包
pnpm build

# 构建单个插件
pnpm --filter @audebase/plugin-foo build
```

### 15.2 本地验证

```bash
# 插件健康检查
aude plugin doctor --plugin=@audebase/plugin-foo

# CI 模式
aude plugin doctor --ci --plugin=@audebase/plugin-foo
```

检查项包括：manifest 格式校验、TypeScript 编译、测试通过、覆盖率 ≥80%、权限声明完整性、i18n 完整性、循环依赖检测。

### 15.3 打包发布

```bash
# 打包
pnpm --filter @audebase/plugin-foo pack

# 发布到 npm
npm publish packages/plugin-foo/audebase-plugin-foo-0.1.0.tgz
```

### 15.4 部署到 AUDEBase 实例

```bash
# 方式一：复制到 plugins 目录
cp -r packages/plugin-foo /path/to/audebase/plugins/

# 方式二：通过 CLI 安装（远期）
aude plugin install @vendor/plugin-foo
```

---

## 16. 附录：常见问题

### 插件开发规范

遵循 AUDEBase 编码约定：

- **不可变性优先** — 始终返回新对象，不就地修改
- **interface 优先于 type** — 对象形状使用 interface
- **零 as any / @ts-ignore** — 使用 unknown + 类型收窄
- **Zod 边界验证** — 所有系统边界使用 Zod schema
- **小文件原则** — 200-400 行典型，800 行最大
- **禁止 console.log** — 使用 PluginHost.logger（pino 结构化日志）

### 常见错误

| 错误 | 原因 | 解决方法 |
|------|------|---------|
| 插件未加载 | `.audebase/plugins.yaml` 未注册 | 添加插件并设置 `enabled: true` |
| 依赖解析失败 | manifest.yaml 中 `dependencies` 声明了不存在的插件 | 检查依赖名称拼写 |
| 模型冲突 | 两个插件声明了同名 Collection | 使用不同的 `table` 名称 |
| 路由冲突 | 两个插件注册了相同路径的路由 | 使用唯一路径前缀 |
| 权限不生效 | 权限项未在 manifest 中声明 | 添加 `permissions` 声明 |
| 迁移不执行 | `migration_version` 未更新 | 更新为新的版本号 |

### 参考

- [快速上手](../guides/01-quick-start.md)
- [架构文档](../architecture.md)
- [插件框架设计](plugin-framework.md)
- [插件框架 SDD](plugin-framework-sdd.md)
- [数据模型与权限](02-model-and-permission.md)（计划）
- [管理 UI 开发](03-admin-ui.md)（计划）
- [生命周期详解](04-lifecycle.md)（计划）
- [插件间通信](05-communication.md)（计划）
- [数据库迁移](06-migration.md)（计划）
- [国际化](07-i18n.md)（计划）
- [测试策略](08-testing.md)（计划）
- [发布与发布](09-publishing.md)（计划）
