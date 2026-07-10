# Directus — 产品画像

> 分析日期: 2026-07-10 | 分类: Headless CMS / 数据库优先平台 | AUDEBase 相关度: ⭐⭐⭐⭐

---

## 1. 产品概述

### 一句话定位

**开源数据库优先平台，将任何 SQL 数据库包装为 REST/GraphQL API 和管理后台。**

Directus 不是传统 CMS——它不「拥有」你的数据库 schema，而是作为透明层包裹现有数据库，提供 API、管理后台、自动化、实时协作和 AI 能力。它将「数据库优先」理念贯彻到底：数据库是真相之源，Directus 是在此之上的 API 和 UI 层。

### 基本信息

| 维度 | 详情 |
|------|------|
| **公司** | Monospace Inc. |
| **创始人/核心维护者** | Rijk van Zanten, Ben Haynes |
| **仓库** | github.com/directus/directus |
| **GitHub Stars** | ~36.4K |
| **Forks** | ~4.8K |
| **Commits** | 13,789+ |
| **Releases** | 370+ |
| **最新版本** | v12.1.1 (2026-07-01) |
| **npm 下载量** | 4,500 万+ |
| **部署项目** | 50 万+ |
| **G2 评分** | 4.9/5 |
| **许可** | Monospace Sustainable Core License (MSCL) 1.0 — 源码可用，非 OSI 开源 |
| **SOC 2** | Type II |
| **GDPR** | 合规 |

### 核心理念

> **"Database-first" — 数据库是真相之源，不绑架 schema。**

1. **数据库优先而非 CMS 优先**：Directus 连接现有 SQL 数据库，自动识别表和关系，不强制迁移数据
2. **透明层而非黑盒**：数据库的 schema 随时可被其他系统直接访问，Directus 只是覆盖层
3. **不锁定**：移除 Directus 后，数据库保持完整可用，零迁移成本
4. **全栈覆盖**：自动生成 REST + GraphQL + WebSocket API，同时提供可视化管理后台

### 适用场景

| 场景 | 适合度 | 说明 |
|------|--------|------|
| 已有数据库需要管理后台 | ⭐⭐⭐⭐⭐ | 核心场景 — 连接即用 |
| 多系统共享同一数据库 | ⭐⭐⭐⭐⭐ | 不锁定 schema，自然适配 |
| 需要实时 API 的应用 | ⭐⭐⭐⭐⭐ | 内置 WebSocket + GraphQL Subscriptions |
| 从零构建新项目 | ⭐⭐⭐ | 需先设计数据库 schema |
| 纯内容发布（博客/文档站） | ⭐⭐⭐ | 可行但不如 Strapi 直观 |
| 复杂业务逻辑 | ⭐⭐ | Flows 能处理自动化，但非业务逻辑引擎 |

---

## 2. 技术架构

### 2.1 技术栈全景

```
┌─────────────────────────────────────────────────────┐
│                  Directus Data Studio                │
│              Vue 3 + Composition API + SCSS           │
├─────────────────────────────────────────────────────┤
│                   Directus API Server                 │
│        TypeScript + Node.js 22 + Express.js           │
│  ┌──────────┬──────────┬──────────┬──────────────┐  │
│  │ REST API │ GraphQL  │ WebSocket│   MCP Server │  │
│  │  /items  │ /graphql │/websocket│   /mcp       │  │
│  └──────────┴──────────┴──────────┴──────────────┘  │
│  ┌────────────────────────────────────────────────┐  │
│  │              Knex Query Builder                  │  │
│  │    (统一数据库抽象层，跨 7 种 SQL 数据库)         │  │
│  └────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────┤
│  PostgreSQL │ MySQL │ MariaDB │ MSSQL │ SQLite │ ... │
└─────────────────────────────────────────────────────┘
```

### 2.2 后端技术细节

| 组件 | 技术选型 | 说明 |
|------|---------|------|
| **运行时** | Node.js 22+ | LTS 版本 |
| **语言** | TypeScript (78.9%) | 全栈类型安全 |
| **Web 框架** | Express.js | 成熟的 Node.js 框架 |
| **数据库查询** | Knex | 统一 7 种数据库的查询接口 |
| **GraphQL** | graphql + graphql-compose + graphql-ws | 自动 schema 生成 + 订阅 |
| **参数验证** | Zod | 边界层类型校验 |
| **日志** | Pino | 结构化 JSON 日志 |
| **图片处理** | Sharp | 裁剪、旋转、缩放、格式转换 |
| **进程管理** | PM2 | 生产环境进程守护 |
| **缓存** | ioredis (Redis) | 可选，用于缓存和速率限制 |
| **沙箱执行** | isolated-vm | Extension sandbox 隔离 |
| **MCP 协议** | @modelcontextprotocol/sdk | 内建 MCP Server |
| **文件上传** | @tus/server | 断点续传支持 |
| **速率限制** | rate-limiter-flexible | 灵活的限流策略 |

### 2.3 前端技术细节 (Data Studio)

| 组件 | 技术选型 | 说明 |
|------|---------|------|
| **框架** | Vue 3 + Composition API | 响应式前端框架 |
| **样式** | SCSS | 预处理器 |
| **扩展** | 自定义 Vue 组件体系 | Interfaces, Displays, Layouts, Panels, Modules, Themes |

### 2.4 数据库适配器

Directus 支持 **7 种 SQL 数据库**，是同类产品中最广的：

| 数据库 | 适配器驱动 | 说明 |
|--------|-----------|------|
| **PostgreSQL** | `pg` | 推荐选择，功能最完整 |
| **MySQL** | `mysql2` | 广泛使用 |
| **MariaDB** | `mysql2` | MySQL 兼容 |
| **MS SQL Server** | `tedious` | 企业环境常见 |
| **SQLite** | `sqlite3` | 开发/轻量级部署 |
| **OracleDB** | `oracledb` | 大型企业遗留系统 |
| **CockroachDB** | `pg` (PG 兼容) | 分布式 SQL |

> **架构亮点**：所有适配器均为可选依赖（optionalDependencies），Docker 镜像包含全部。通过 Knex 提供统一查询接口，上层代码无需感知数据库差异。

### 2.5 项目结构 (Monorepo)

```
directus-monorepo/
├── api/                    # @directus/api — 后端 API 服务器
│   ├── src/
│   │   ├── services/       # 核心服务层
│   │   ├── controllers/    # REST 控制器
│   │   ├── database/       # Knex 迁移和 seeds
│   │   ├── auth/           # 认证驱动 (local, oauth2, openid, ldap, saml)
│   │   ├── mail/           # 邮件服务
│   │   ├── flows/          # Flows 引擎
│   │   ├── extensions/     # 扩展加载器
│   │   └── utils/          # 工具函数
│   └── package.json
├── app/                    # @directus/app — Data Studio (Vue 3)
├── sdk/                    # @directus/sdk — TypeScript 客户端 SDK
├── packages/               # 共享包
│   ├── schema/             # 系统 schema 定义
│   ├── storage/            # 文件存储适配器
│   ├── extensions-sdk/     # 扩展开发工具
│   ├── errors/             # 错误类型定义
│   ├── memory/             # 内存缓存
│   ├── utils/              # 通用工具
│   ├── validation/         # Zod 验证 schema
│   ├── constants/          # 常量定义
│   ├── pressure/           # 背压监控
│   ├── random/             # 随机值生成
│   └── types/             # 共享类型
├── tests/                  # Blackbox 端到端测试
└── pnpm-workspace.yaml     # pnpm monorepo 配置
```

---

## 3. API 层

Directus 的 API 层是其核心竞争力 — 所有 API 均从数据库 schema 自动生成。

### 3.1 REST API

```
GET  /items/{collection}           — 列出记录 (分页、过滤、排序、字段选择)
GET  /items/{collection}/{id}      — 获取单条记录
POST /items/{collection}           — 创建记录
PATCH /items/{collection}/{id}     — 更新记录
DELETE /items/{collection}/{id}    — 删除记录
```

**查询能力**：
- `fields` — 字段选择（支持嵌套关系 `author.*`, `author.avatar.*`）
- `filter` — 复杂过滤（`_eq`, `_neq`, `_in`, `_contains`, `_between`, `_and`, `_or` 等 20+ 操作符）
- `sort` — 单字段/多字段排序（`-date_created` 降序）
- `limit` / `offset` / `page` — 分页控制
- `search` — 全文搜索（基于数据库内置搜索能力）
- `deep` — 深层嵌套过滤/排序（关系表字段过滤）
- `meta` — 返回元数据（total_count, filter_count）

**系统端点**（30+）：
`/server/info`, `/auth/login`, `/auth/refresh`, `/users`, `/roles`, `/policies`, `/permissions`, `/collections`, `/fields`, `/relations`, `/files`, `/folders`, `/flows`, `/operations`, `/dashboards`, `/panels`, `/notifications`, `/shares`, `/translations`, `/versions`, `/activity`, `/revisions`, `/settings`, `/extensions`, `/schema`, `/utils/*`, `/assets/*`

### 3.2 GraphQL API

```
POST /graphql    — 标准 HTTP GraphQL 端点
WS   /graphql    — GraphQL Subscriptions (WebSocket)
```

- **Schema 自动生成**：每个 collection 自动映射为 GraphQL 类型
- **查询 (Query)**：自带过滤、分页、排序、关系查询
- **变更 (Mutation)**：标准 CRUD + 系统功能
- **订阅 (Subscription)**：`{collection}_mutated` 事件订阅（create/update/delete）

### 3.3 WebSocket API

```
WS /websocket    — 原生 WebSocket 端点
```

支持：
- **认证**：strict / public / handshake 三种模式
- **订阅**：按 collection + 事件类型 (create/update/delete) 订阅
- **CRUD**：通过 WebSocket 执行标准 CRUD 操作
- **心跳**：可配置 ping/pong 保活机制
- **自定义处理**：通过 Hooks 扩展

### 3.4 TypeScript SDK

```typescript
import { createDirectus, rest, graphql, realtime } from '@directus/sdk';

const directus = createDirectus('https://api.example.com')
  .with(rest())           // REST 模式
  .with(graphql())        // GraphQL 模式
  .with(realtime());      // WebSocket 实时模式

// 类型安全的查询
const articles = await directus.request(
  readItems('articles', {
    filter: { status: { _eq: 'published' } },
    fields: ['title', 'author.name']
  })
);
```

特点：
- **完全类型安全** — 从 Directus schema 自动推导 TypeScript 类型
- **Tree-shakeable** — 按需引入模块
- **支持 REST + GraphQL + WebSocket** — 三合一 SDK

---

## 4. 扩展系统 (Extensions)

Directus 扩展系统是其核心架构的基石，几乎每个功能点都可扩展。

### 4.1 扩展分类

```
扩展系统
├── API Extensions (后端)
│   ├── Hooks       — 事件驱动的代码（filter/action/init/schedule/embed）
│   ├── Endpoints   — 自定义 Express 路由
│   ├── Operations  — 自定义 Flow 操作节点
│   ├── Services    — 调用 Directus 内部服务
│   └── Sandbox     — isolated-vm 沙箱隔离执行
│
└── App Extensions (前端 Data Studio)
    ├── Interfaces  — 表单项输入组件 (WYSIWYG, 地图, 颜色选择器等)
    ├── Displays    — 内联单元格渲染组件
    ├── Layouts     — 集合页面布局 (表格, 卡片, 看板, 日历, 地图)
    ├── Panels      — Insights 仪表盘组件
    ├── Modules     — 自定义导航页面模块
    ├── Themes      — Studio 主题/品牌定制
    ├── UI Library  — 共享 Vue 3 组件库
    └── Composables — 共享 Vue 3 组合 API
```

### 4.2 App Extensions 详解

| 类型 | 用途 | 示例 |
|------|------|------|
| **Interfaces** | 定义数据输入方式 | WYSIWYG 编辑器、颜色选择器、地图选点、多语言输入 |
| **Displays** | 定义数据显示方式 | 星级评分、进度条、用户头像、状态标签、文件预览 |
| **Layouts** | 定义集合列表视图 | 卡片视图、看板视图、日历视图、地图视图、时间线视图 |
| **Panels** | 构建仪表盘 | 指标卡片、图表、表格、列表、自定义可视化 |
| **Modules** | 添加自定义页面 | CRM 模块、项目管理、自定义报表 |
| **Themes** | Studio 主题 | 深色主题、品牌配色、自定义 CSS |

### 4.3 API Extensions 详解

#### Hooks — 事件驱动扩展
```typescript
export default ({ filter, action, init, schedule, embed }, context) => {
  // filter: 事件前拦截，可修改 payload，可取消事件
  filter('items.create', async (payload, meta) => { /* ... */ });

  // action: 事件后触发，不阻塞
  action('items.update', async (meta) => { /* ... */ });

  // init: 生命周期初始化
  init('cli.before', async () => { /* ... */ });

  // schedule: Cron 定时任务
  schedule('0 6 * * *', async () => { /* 每天 6:00 */ });

  // embed: 注入 JS/CSS 到 Studio
  embed('head', '<link rel="stylesheet" href="...">');
};
```

**事件过滤**：支持 `*` 通配符匹配多种事件模式

#### Endpoints — 自定义 API 路由
```typescript
export default (router, context) => {
  const { services, database, getSchema, env } = context;

  router.get('/custom-endpoint', async (req, res) => {
    // 拥有完整的 Express 请求/响应控制权
    // 可访问 Directus 所有内部服务
    const { ItemsService } = services;
    // ...
  });
};
```

#### Sandbox — 隔离执行
- 基于 `isolated-vm` 的沙箱隔离
- 仅支持 `filter` 和 `action` 事件
- 无文件系统/网络访问权限
- 安全的第三方扩展运行环境

### 4.4 扩展开发生态

- **CLI 工具**：`@directus/extensions-sdk` 脚手架和构建
- **打包模式**：支持扩展捆绑（bundle），单包包含多个扩展
- **Marketplace**：Beta 阶段，支持扩展发布和发现

---

## 5. Flows — 可视化自动化引擎

Flows 是 Directus 内置的低代码自动化工具，类似 n8n/Zapier 的简化版。

### 5.1 架构模型

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ Trigger  │───→│Operation1│───→│Operation2│───→│Operation3│
│ (触发器)  │    │ (操作)    │    │ (操作)    │    │ (操作)    │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
     │               │               │               │
     └───────────────┴───────┬───────┴───────────────┘
                             │
                       Data Chain (数据链)
                  每个操作的输出追加到链路中
```

### 5.2 触发器 (Triggers)

| 触发器类型 | 说明 | 模式 |
|-----------|------|------|
| **Event Hook** | 数据库事件 (items.create/update/delete) | Fire & Forget 或 Filter (Blocking) |
| **Schedule (Cron)** | 定时触发 | 标准 Cron 表达式 |
| **Webhook** | HTTP webhook 端点 | GET/POST |
| **Another Flow** | 其他 Flow 触发 | 同步/异步 |
| **Manual** | 用户在 Studio 中手动触发 | — |

### 5.3 操作 (Operations)

| 操作 | 功能 |
|------|------|
| **Condition** | If/else 条件分支 |
| **Run Script** | 执行自定义 JS/TS (沙箱隔离) |
| **Create/Read/Update/Delete Data** | CRUD 操作 |
| **JSON Web Token (JWT)** | 签名/验证 JWT |
| **Log to Console** | 调试日志 |
| **Send Email** | SMTP 邮件 (WYSIWYG/Markdown/模板) |
| **Send Notification** | 应用内通知 |
| **Webhook/Request URL** | HTTP 请求外部服务 |
| **Sleep** | 延迟执行 |
| **Throw Error** | 自定义错误 (中止 Flow) |
| **Transform Payload** | 自定义 JSON 组装 |
| **Trigger Flow** | 触发另一个 Flow (串行/并行/批量) |

### 5.4 数据链 (Data Chain)

每个操作的输出以 `operationKey` 为键追加到数据链中：

```
{
  "$trigger": { /* 触发器数据 */ },
  "operation_1": { /* 操作1输出 */ },
  "operation_2": { /* 操作2输出 */ },
  "operation_3": { /* 操作3输出 */ }
}
```

后续操作可通过 `{{operation_1.field_name}}` 引用前面操作的数据。

---

## 6. 权限系统 (RBAC)

### 6.1 权限模型

Directus 使用 **策略驱动 (Policy-based)** 而非传统 RBAC：

```
Users (用户)
  ├── Roles (角色) — 组织分组，可层级继承
  │     ├── Administrator (管理员)
  │     ├── Editor (编辑者)
  │     ├── Viewer (查看者)
  │     └── Public (未认证用户)
  │
  └── Policies (策略) — 权限集合
        └── Permissions (权限)
              ├── Collection (集合)
              ├── Action (操作: create/read/update/delete/share)
              ├── Fields (字段级: 可见/可编辑)
              ├── Item Rules (记录级: 过滤条件)
              ├── Field Validation (字段值校验)
              └── Field Presets (字段默认值)
```

### 6.2 策略组合规则

| 规则类型 | 组合方式 | 说明 |
|---------|---------|------|
| **字段权限** | **并集 (Additive)** | 所有策略中可访问字段的合集 |
| **记录规则** | **并集 OR (Additive OR)** | 满足任一策略的记录皆可访问 |
| **IP 访问限制** | **减集 (Subtractive)** | IP 不匹配 allowlist → 整条策略排除 |

### 6.3 权限粒度

| 粒度 | 实现方式 | 示例 |
|------|---------|------|
| **集合级** | Permission scope = collection | 可访问 `articles` 集合 |
| **操作级** | Permission action | create / read / update / delete / share |
| **字段级** | Field Permissions | 只有 `title` 和 `content` 可见 |
| **记录级** | Item Rules (Filter) | `{ user_created: { _eq: "$CURRENT_USER" } }` |
| **值级** | Field Validation | `{ status: { _in: ["draft","review"] } }` |

### 6.4 用户状态机

```
Draft → Invited → Unverified → Active → Suspended → Archived
```

### 6.5 App Access (Studio 访问控制)

策略可单独控制 Data Studio 的访问权限，API-only 用户无需 Studio 访问。

---

## 7. MCP Server

Directus 是 **首个** 内建 MCP Server 的 CMS 平台（自 v11.12+）。

### 7.1 架构

```
┌──────────────┐     MCP 协议      ┌──────────────────┐
│  AI 客户端    │ ←──────────────→ │  Directus MCP     │
│  (Claude,     │   JSON-RPC 2.0   │  Server           │
│   ChatGPT,    │                   │  (内建于 API)     │
│   Cursor...)  │                   │                   │
└──────────────┘                   └──────────────────┘
                                           │
                                    RBAC 权限控制
                                           │
                              ┌────────────┴────────────┐
                              │       SQL Database       │
                              └─────────────────────────┘
```

### 7.2 能力

- **Schema 检查**：读取 collections, fields, relations 结构
- **CRUD 操作**：完整的增删改查
- **Schema 变更**：创建/更新/删除 collections 和 fields
- **文件管理**：上传、元数据、组织
- **Flow 管理**：触发和管理自动化流程
- **翻译管理**：多语言内容管理

### 7.3 安全

- **权限继承**：MCP 操作遵循关联用户的所有 RBAC 权限
- **全局删除保护**：默认禁用 MCP 的删除操作
- **完整审计**：所有 MCP 操作进入 Activity Log

### 7.4 支持的 AI 客户端

ChatGPT, Claude Desktop, Cursor, Claude Code, VS Code, Raycast

---

## 8. AI Assistant

### 8.1 能力

✅ 内容创建、更新和管理  
✅ Schema 操作 (添加字段、集合)  
✅ Flow 创建和触发  
✅ 文件附件分析 (图片、PDF、文本、音频、视频 — 最大 50MB)  
✅ 数据探索和查询  
✅ 多语言翻译  

### 8.2 支持的 AI 提供商

| 提供商 | 模型范围 |
|--------|---------|
| OpenAI | GPT-4o Mini ～ GPT-5.4 Pro |
| Anthropic | Claude Haiku 4.5 ～ Opus 4.6 |
| Google | Gemini 2.5 Flash ～ 3.1 Pro |
| 兼容端点 | Ollama, LM Studio, Azure OpenAI, DeepSeek, Mistral |

### 8.3 安全特性

- **权限继承**：AI 仅能操作用户有权限的数据
- **工具审批**：默认按工具粒度审批（可配置为自动批准）
- **流式响应**：实时显示 AI 操作
- **会话存储**：仅浏览器端，不留服务器端

---

## 9. 核心功能矩阵

### 9.1 功能一览

| 功能模块 | 描述 | 状态 |
|---------|------|------|
| **Schema 感知** | 连接现有 SQL DB，自动识别表、字段、关系 | ✅ 核心能力 |
| **REST API** | 自动生成，30+ 系统端点 | ✅ 成熟 |
| **GraphQL API** | 自动 schema 生成 + 查询/变更/订阅 | ✅ 成熟 |
| **WebSocket 实时** | 原生 WebSocket + GraphQL Subscriptions | ✅ 成熟 |
| **TypeScript SDK** | 完全类型安全的客户端 SDK | ✅ 成熟 |
| **Flows 自动化** | 拖拽式可视化编排 | ✅ 成熟 |
| **Insights 仪表盘** | 可视化仪表盘构建器 | ✅ 可用 |
| **文件管理** | 多存储后端 (S3/GCS/Azure/Local/Cloudinary) | ✅ 成熟 |
| **图片处理** | Sharp 裁剪/旋转/缩放/格式转换，URL 参数式 | ✅ 成熟 |
| **Extensions** | 8 种扩展类型，覆盖全平台 | ✅ 成熟 |
| **Marketplace** | 扩展发布和发现 | 🔶 Beta |
| **MCP Server** | AI Agent 原生数据操作 | ✅ v11.12+ |
| **AI Assistant** | Studio 内嵌对话式 AI | ✅ 可用 |
| **RBAC** | 字段级 + 记录级 + 策略驱动 | ✅ 成熟 |
| **SSO** | OAuth 2.0 / OpenID / LDAP / SAML | ✅ Team/Enterprise |
| **多语言 (i18n)** | Studio 界面 + 内容翻译 | ✅ 成熟 |
| **内容版本控制** | Draft/Review/Published/Archived | ✅ 可用 |
| **Webhook** | 事件驱动的 HTTP 回调 | ✅ 成熟 |
| **审计日志** | Activity Log + Revisions | ✅ 成熟 |
| **TUS 上传** | 断点续传大文件 | ✅ 成熟 |
| **多租户** | 原生不支持 | ❌ 需自行实现 |

### 9.2 定价

| Tier | 价格 | 核心限制 | 关键特性 |
|------|------|---------|---------|
| **Core** | $0/月 | 3 用户席位, 25 集合, 5 Flows | 核心 API + Studio |
| **Team** | $499/月 ($599 月付) | 10 SSO 席位, 50 集合, 20 Flows | SSO (SAML/OIDC), 无 AI 限制 |
| **Enterprise** | 定制 | 定制席位, 无限 Flows | 离线模式, 自定义 LLM, AI 翻译, Telemetry opt-out |
| **Open Innovation Grant** | 免费 | 无限制 (年收入 <$5M 且 <50 员工) | 全部功能，最多 5 次激活 |

> **自托管 (Self-Hosted)**：所有 Tier 均支持自托管。OIG 实体可免费全功能自托管。

---

## 10. 独特之处

### 10.1 核心差异化

| 维度 | Directus | 行业常见做法 |
|------|---------|------------|
| **Schema 关系** | 数据库优先 — 包裹现有 schema | CMS 优先 — 拥有 schema |
| **数据库支持** | 7 种 SQL 数据库 | 通常 2-4 种 |
| **API 生成** | 自动从 DB schema 生成 REST + GraphQL + WS | 通常需手动定义 content types |
| **MCP Server** | 内建原生 MCP Server | 行业首家 |
| **AI Assistant** | Studio 内嵌，可操作数据 | 通常第三方插件 |
| **Flows 自动化** | 内建拖拽式可视化编排 | 通常需 n8n/Zapier 集成 |
| **Insights** | 内建仪表盘构建器 | 通常需 BI 工具集成 |
| **扩展粒度** | 8 种扩展类型，覆盖 API + UI | 通常仅 hook + plugin |
| **许可** | 源码可用 (MSCL)，非 OSI 开源 | MIT (Strapi), AGPL/GPL (Odoo) |

### 10.2 Directus vs Strapi 核心差异

| 维度 | Directus | Strapi |
|------|---------|--------|
| **Schema 哲学** | Database-first (包裹现有 DB) | Code-first (定义 content types 生成 DB) |
| **许可** | 源码可用 (MSCL) | MIT (真正开源) |
| **支持数据库** | 7 种 | 4 种 (PG, MySQL, MariaDB, SQLite) |
| **API 层** | REST + GraphQL + WebSocket + Subscriptions | REST + GraphQL |
| **Admin UI** | Vue 3 Data Studio | React Admin Panel |
| **AI Assistant** | 内建 ✅ | 第三方插件 ❌ |
| **MCP Server** | 内建 ✅ | ❌ |
| **Flows 自动化** | 内建可视化编辑器 ✅ | 仅代码生命周期 Hook ❌ |
| **Insights 仪表盘** | 内建 ✅ | ❌ |
| **字段级权限** | Core 免费 ✅ | Enterprise 付费 ❌ |
| **实时能力** | 原生 WebSocket + GraphQL Sub | ❌ (需第三方) |
| **现有 DB 支持** | 一等公民 ✅ | 不支持 ❌ |
| **社区/GitHub** | ~36K stars | ~71K stars |
| **插件生态** | 较小，增长中 | 丰富，成熟 |

**选择 Strapi 的场景**：
- 新项目，无现有数据库
- 需要 MIT 许可
- 需要丰富的插件生态
- 纯内容发布（博客、文档站）

**选择 Directus 的场景**：
- 已有 SQL 数据库需要管理后台
- 多系统共享同一数据库
- 需要实时 API (WebSocket/GraphQL Subscriptions)
- 需要内建自动化 (Flows) + AI + 仪表盘
- 需要字段级精细权限控制

---

## 11. 市场与社区

### 11.1 社区数据

| 指标 | 数值 |
|------|------|
| GitHub Stars | ~36.4K |
| Forks | ~4.8K |
| npm 下载 | 4,500 万+ |
| 部署项目 | 50 万+ |
| Discord | directus.chat |
| 论坛 | community.directus.io |
| 社交媒体 | YouTube, Bluesky, X/Twitter |
| G2 评分 | 4.9/5 |

### 11.2 发布节奏

- **370+ Releases** — 非常活跃
- **主版本**：v10 (2023) → v11 (2024-2025) → v12 (2026-05)
- **当前版本**：v12.1.1 (2026-07-01)
- PR 合并频率：高频，社区贡献活跃

### 11.3 用户画像

| 角色 | 用途 |
|------|------|
| **开发者** | API, SDK, Extensions, 自托管 |
| **产品团队** | 无需后端重构即可快速交付功能 |
| **代理商** | 一套后端服务所有项目 |
| **内容发布者** | Headless CMS 驱动内容网站 |
| **数据分析师** | Insights 仪表盘 + SQL 直连分析 |

---

## 12. 历史教训与已知问题

### 12.1 许可争议

Directus 的许可经历了重大演变：

| 阶段 | 许可 | 时间 | 影响 |
|------|------|------|------|
| 早期 | GPLv3 | ~2012-2023 | 真正的开源 |
| BSL 过渡 | BSL 1.1 (Business Source License) | 2023-2026 | 源码可用但非 OSI 开源 |
| 当前 | MSCL 1.0 (Monospace Sustainable Core License) | 2026-05 (v12) | 源码可用，4 年后转 GPLv3 |

**MSCL 核心条款**：
- ✅ 源码可查看和审计
- ✅ 可修改和构建
- ✅ 4 年后自动转为 GPLv3
- ✅ SDK 保持 MIT 许可
- ❌ **禁止竞争性使用** — 不能构建以直接竞争 Directus 为主要目的的产品
- ❌ **软件注册密钥** — 替换了之前的荣誉制度
- ❌ **非 OSI 开源** — 不被 Open Source Initiative 认可

**对用户的影响**：
- 年收入 <$5M 且员工 <50：免费全功能 (OIG 创新资助)
- 超出阈值：需要购买许可，否则进入锁定状态（API 阻塞、GraphQL/WS/MCP 禁用、非 admin 登录禁止）
- 锁定后有 30 天宽限期

### 12.2 架构局限

| 问题 | 详情 | 状态 |
|------|------|------|
| **无原生多租户** | 不支持单实例多租户隔离 | 需自行实现或使用多实例 |
| **数据库优先不适合从零构建** | 新项目需先设计 schema，增加启动成本 | 设计选择，非缺陷 |
| **无复合主键支持** | 不支持复合主键和 SQL 视图 | 已知限制 |
| **Admin UI 权限粒度不足** | 无法按模块限制 Studio 访问权限（如禁止访问 File Library） | 待改进 |
| **内容版本控制有限** | 不支持同一记录的已发布+草稿双版本共存 | 待改进 |
| **大数据集性能** | 大量数据时 Studio UI 可能变慢 | 需数据库优化 |
| **社区小于 Strapi** | 教程、插件、Stack Overflow 活跃度不及 Strapi | 增长中 |
| **MSCL 许可复杂性** | 许可变更、软件密钥、阈值判断增加用户决策成本 | v12 已稳定 |
| **Vue.js 生态** | Vue 在国内开发者群体中占比低于 React | 架构选择 |

### 12.3 实施注意事项

- **数据库连接**：Directus 依赖现有数据库，需具备数据库管理技能
- **自托管复杂度**：需要 Docker、数据库备份、监控等运维能力
- **学习曲线**：SQL 优先的界面可能让非技术编辑感到困惑
- **扩展开发**：需要 Vue 3 + TypeScript + Express 知识

---

## 13. AUDEBase 可借鉴点

### 13.1 数据库适配器模式 → D9 已决策

Directus 的 Knex 抽象层 + 可选驱动依赖的设计值得借鉴：

```typescript
// Directus 的模式
import knex from 'knex';

const db = knex({
  client: 'pg',          // PostgreSQL
  // client: 'mysql2',    // MySQL
  // client: 'mssql',     // MS SQL
  connection: { /* ... */ }
});
```

AUDEBase 的 D9 决策已采用 Drizzle ORM + DatabaseProvider 抽象层 — 这是正确的方向。Directus 的实践经验验证：统一的数据库抽象层在支持多种数据库时至关重要。

### 13.2 Flows 自动化设计

Directus 的「触发 → 条件 → 操作」可视化编排模式设计精良：
- **数据链 (Data Chain)** — 每个操作输出追加到共享上下文的设计优雅
- **触发器多样性** — Event Hook / Schedule / Webhook / Flow 互触发
- **操作可扩展** — 自定义 Operation 扩展类型

AUDEBase Phase 4 的工作流引擎可参考其数据链机制。

### 13.3 Schema 自动感知

Directus 的数据库 introspection 是其核心竞争力：
- 连接数据库 → 自动识别表、字段类型、关系
- system collections 存储 Directus 元数据（接口显示偏好、图标、权限等）

AUDEBase Phase 2 的 Schema Engine 可以采用类似的双层策略：数据库层（物理 schema）+ 元数据层（Directus 管理配置）。

### 13.4 字段级 RBAC + 策略模型

Directus 的 Policy-based 模型比传统 RBAC 更灵活：
- 策略的「加性组合」自然解决权限冲突
- 字段级 + 记录级 + 值级三层控制
- 用户可直接绑定策略，无需通过角色

AUDEBase D10 (Record Rules) + D11 (字段级权限) 决策与此高度一致。

### 13.5 MCP Server 内建

Directus 是行业首个内建 MCP Server 的 CMS 平台 — 这代表了「AI 原生」数据平台的方向。AUDEBase 应密切关注 MCP 协议的演进，将 MCP Server 纳入 Phase 1 或 Phase 2 的规划。

### 13.6 WebSocket + GraphQL Subscriptions

Directus 同时提供原生 WebSocket 和 GraphQL Subscriptions 两条实时通道，AUDEBase 的实时能力可参考此设计。

### 13.7 扩展系统设计

Directus 的 8 种扩展类型（Interfaces, Displays, Layouts, Panels, Modules 等）覆盖了 Admin UI 的所有接触点。AUDEBase D23 的 Slot 机制覆盖了部分场景，可参考 Directus 的 Layouts/Panels 扩展点设计。

### 13.8 文件存储适配器

Directus 的 Storage Adapter 模式（Local/S3/Azure/GCS/Cloudinary）设计简洁。AUDEBase D4.1 的文件存储隔离决策与 Directus 的本地路径前缀策略思路一致，Phase 2 的 MinIO/S3 方案也可借鉴其适配器接口设计。

### 13.9 Directus 不足 — AUDEBase 差异化方向

| Directus 不足 | AUDEBase 优势 | 相关决策 |
|-------------|-------------|---------|
| 无原生多租户 | 四阶段多租户架构 (shared → schema → database-per-tenant) | D4, D4.1 |
| 无插件信任模型 | 四层信任分组 (SYSTEM/Domain/Isolated/Container) | D1.1 |
| 无 Saga 事务 | Saga 补偿模式 (execute + compensate + 幂等) | D13 |
| 无 Schema Engine | Schema → DB → UI 动态映射 | D3 |
| Vue.js (国内招聘少) | React 19 + Ant Design 5 | D6 |
| MSCL (非 OSI 开源) | Apache 2.0 (真正开源) | G 决策 |
| 无跨插件事务 | 跨插件工作流 | D13 |
| 扩展运行在进程内 | Isolated/Container 隔离 | D1.1 |

---

## 14. 关键数据速查

| 维度 | 数值 |
|------|------|
| **GitHub** | github.com/directus/directus |
| **Stars** | ~36.4K |
| **Forks** | ~4.8K |
| **Commits** | 13,789+ |
| **Releases** | 370+ |
| **当前版本** | v12.1.1 (2026-07-01) |
| **npm 下载** | 4,500 万+ |
| **部署项目** | 50 万+ |
| **技术栈** | TypeScript, Node.js, Vue.js, Express, Knex |
| **数据库** | PostgreSQL, MySQL, MariaDB, MSSQL, SQLite, OracleDB, CockroachDB (7 种) |
| **API** | REST, GraphQL, WebSocket, GraphQL Subscriptions, SDK |
| **许可** | MSCL 1.0 (源码可用，非 OSI 开源，4 年转 GPLv3) |
| **公司** | Monospace Inc. |
| **SOC 2** | Type II |
| **GDPR** | 合规 |
| **定价** | Core $0 → Team $499/月 → Enterprise 定制 |
| **OIG 免费** | 年收入 <$5M + 员工 <50 — 全功能免费 |

---

> **本文档基于 Directus 官方文档 (docs.directus.io)、GitHub 仓库、官方博客 (directus.com/resources) 及社区资料编写，信息截至 2026-07-10。**
>
> **许可历史**: GPLv3 → BSL 1.1 (2023) → MSCL 1.0 (2026-05, v12)
>
> **与 AUDEBase 的对照分析见 §13。**
