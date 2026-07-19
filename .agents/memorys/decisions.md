# AUDEBase 架构决策记录

**更新日期**: 2026-07-19

## 架构决策 (D1-D14, D15-D24)

### D1: 微内核 + 插件热插拔架构

- **决策**: 采用 NocoBase 式微内核架构，每个业务系统（OA/ERP/MES 等）作为独立插件套件运行
- **替代方案**: Odoo 单体模式（所有业务逻辑在同一进程中）、纯微服务（运维成本高）
- **理由**: 故障隔离、独立开发/部署、插件市场支持、业务灵活性
- **参考**: NocoBase 微内核设计、Odoo 模块化思想
- **状态**: ✅ Phase 1a 已实现

### D1.1: 四层信任分组模型

- **决策**: 插件不采用「每插件独立进程」，而采用基于信任度的四层进程分组
- **层级**: SYSTEM（平台插件共享进程）→ Domain（业务域共享进程）→ Isolated（第三方每插件进程）→ Container（不可信容器隔离）
- **组内通信**: 直接函数调用（0ms延迟，无需序列化）
- **组间通信**: JSON-RPC over stdin/stdout + Core 路由（同步 RPC） + Redis Pub/Sub（异步事件）
- **资源**: 50 插件由原方案 50 进程/2.5-4GB 降为 8-12 进程/0.4-0.7GB
- **manifest 命名**: `runtime.mode`（inline | process | container）和 `runtime.partition`（SYSTEM | oa | erp | mes | ...）
- **信任边界**: 组间通信受访问控制矩阵约束（SYSTEM→全部、Domain→同域直调+RPC、Isolated→白名单、Container→全禁），详见 docs/plugin-architecture-analysis.md §4.2 信任边界表
- **参考**: VS Code Extension Host 组内共享模型、Chrome site isolation 信任分级、Erlang OTP 应用组
- **详情**: 见 docs/plugin-architecture-analysis.md
- **状态**: ✅ Phase 2 已实现

### D1.2: PluginHost 接口抽象

- **决策**: Phase 1a 实现 InlinePluginHost，但接口从 Day 1 支持跨进程语义
- **mock 约束**: async Promise、JSON 序列化/反序列化、30s 超时、1-5ms 延迟注入
- **状态**: ✅ Phase 1a 已实现

### D1.3: 插件通信架构

- **决策**: 组内直接函数调用（0ms）；组间 JSON-RPC over stdin/stdout（同步 RPC）+ Redis Pub/Sub（异步事件）
- **安全**: 启动握手 token + nonce 防重放 + 帧级认证 + content-length 帧协议（1MB 上限）
- **契约**: manifest.exports 声明 API 契约 + Zod schema 类型校验 + ServiceRegistry 服务发现
- **参考**: VS Code Extension Host（同进程）、gRPC（契约）、NATS（pub/sub）
- **状态**: ✅ Phase 1b 已实现

### D1.4: 插件生命周期

- **决策**: 7 个生命周期钩子（afterAdd → beforeLoad → load → install → afterEnable → afterDisable → pre_uninstall）。插件升级通过 D1.7 迁移框架处理，不在生命周期钩子中定义独立的 pre_upgrade/post_upgrade
- **迁移**: NocoBase 3 阶段迁移（beforeLoad→afterSync→afterLoad）+ version_gated
- **状态机**: Phase 1 2 状态（loaded/disabled），Phase 2 NocoBase 5 状态
- **参考**: NocoBase PluginManager、Odoo module lifecycle
- **状态**: ✅ Phase 1a 已实现

### D1.5: manifest.yaml 规范

- **决策**: Phase 1a 包含字段：name/version/display_name/description/category/license/application/entry/author/dependencies/assets/lifecycle/runtime(mode+partition+crash_policy)/security(db_namespace)/exports/provides/permissions/models/locale/data
- **Phase 2 增加**: external_dependencies/demo/sequence/auto_install
- **状态**: ✅ Phase 1a 已实现

### D1.6: 内核插件与 Bootstrap 流程

- **决策**: 定义 `@audebase/plugin-core` 为零依赖内核插件（类比 Odoo `base` 模块），负责首次运行时创建核心数据。内核插件在插件依赖图中优先级最高，确保最先加载
- **Bootstrap 数据**: admin 用户（默认密码强制首次修改）、默认角色（admin/member）、系统租户（tenant_id=NULL）、默认菜单结构（插件管理/用户管理）、核心权限项
- **Bootstrap 流程**: Core 启动 → 检查数据库是否已初始化（如模块注册表） → 如未初始化，创建核心表 → 加载 `plugin-core` → 执行核心插件的 `install()` 创建 Bootstrap 数据 → 继续加载其余插件
- **约束**: 内核插件 `dependencies: []`（零依赖）、`auto_install: true`（不可卸载）、仅包含平台运行必需的初始数据，不包含业务逻辑
- **理由**: 解决 Phase 1a 首次运行的核心引导问题——admin 用户需要 RBAC，RBAC 需要数据库表，数据库表需要首次初始化。Odoo 的 `base` 模块经过 20 年验证是处理此问题的最佳模式
- **参考**: Odoo `base` 模块（ir.model/ir.ui.view/ir.ui.menu/res.users/res.groups）、NocoBase 首次启动初始化
- **状态**: ✅ Phase 1a 已实现

### D1.7: 数据库迁移版本管理

- **决策**: 采用 Odoo 式按版本排序 + NocoBase 3 阶段迁移。迁移文件组织为 `migrations/{version}/` 目录，每个目录含 `preload.sql`、`postsync.sql`、`postload.sql` 三个文件（对应三个阶段）
- **排序**: 迁移按 manifest.yaml 中 `version` 字段（SemVer）排序执行。`migration_history` 表追踪每个插件的已执行迁移版本
- **三阶段**:
  1. `preload.sql` — 在所有 `beforeLoad()` 执行前运行，用于 DDL（ALTER TABLE 等）
  2. `postsync.sql` — 在 Core DB 同步完成后运行，用于数据迁移（INSERT/UPDATE 等）
  3. `postload.sql` — 在所有 `load()` 完成后运行，用于后处理（索引重建等）
- **回滚**: Phase 1a 不支持自动回滚。迁移失败时标记 status='failed' → 当前插件标记为 `migration_failed` 状态 → 跳过该插件继续加载其他插件 → 记录错误日志（不阻塞系统启动）。CI 集成 `aude db:migrate --dry-run` 预检
- **version_gated**: manifest.yaml 中 `lifecycle.migration_version` 字段声明当前版本。Core 对比 `migration_history` 表，仅执行版本号 > 已记录版本的迁移
- **理由**: NocoBase 3 阶段模式已在 D1.4 中决策，Odoo 按版本排序经过 20 年生产验证。此决策为 D1.4 的补充细节
- **参考**: NocoBase beforeLoad/afterSync/afterLoad 三阶段、Odoo module version + ir.module.module 追踪表
- **状态**: ✅ Phase 1a 已实现
- **升级流程**: Core 定期或手动检测 manifest.yaml 中 `version` 字段变化 → 对比 `migration_history` 表 → 执行新版本迁移（preload → postsync → postload 三阶段） → 更新 migration_history 记录。升级前 Core 自动创建数据库快照（pg_dump），升级失败时管理员可手动恢复
- **触发方式**: Phase 1a 支持 CLI 命令 `aude db:migrate`（全量迁移）和 CI dry-run；`aude plugin upgrade <name>` 移至 Phase 1b；Admin UI "升级"按钮 Phase 1b 实现

### D1.8: API 版本控制

- **决策**: manifest.exports 中增加 `api_version` 字段（SemVer），Core 通过 URL 路径 `/api/v{major}/{resource}` 路由暴露插件 API。向后兼容保证到下一个主版本
- **实现**: manifest.exports 中每个导出的接口声明 `api_version: "1.0.0"`，Core 路由注册时提取主版本号作为 URL 前缀。同一资源可注册多个主版本（如 v1 和 v2 并存过渡期）
- **兼容策略**: 主版本（major）变更允许不兼容修改，次版本（minor）/补丁（patch）必须向后兼容。废弃接口提前 1 个主版本标记 deprecated，之后移除
- **理由**: 插件市场场景下，API 不兼容变更会导致依赖插件崩溃。Directus、Strapi 等均采用路径版本化策略
- **参考**: Directus `/api/v1/` 路径版本、SemVer 2.0 规范
- **状态**: ✅ Phase 1b 已实现

### D1.9: 插件事件总线

- **决策**: Core 提供应用层 EventBus，插件通过 `publish(subject, payload)` / `subscribe(subject, handler)` 实现松耦合通信。同进程直接函数回调（0ms），跨进程通过 Redis Pub/Sub 自动传播（D1.3）
- **声明**: manifest.exports 可声明 `events: ['order.created', 'order.updated']`，表示插件发布的事件类型。Core 校验事件 payload 的 Zod schema
- **作用域**: 事件默认在 partition 内传播（组内广播），需跨 partition 传播时显式声明 `scope: 'global'`
- **与 D1.3 的关系**: D1.3 定义传输层（JSON-RPC + Redis Pub/Sub），D1.9 定义应用层事件抽象（主题订阅 + payload 校验）
- **理由**: Odoo bus.bus、NocoBase app.on/emit、Strapi Lifecycle Hooks、Axelor ObserverService 全部采用事件总线模式——这是插件化平台松耦合通信的标准实践
- **参考**: Odoo `env['bus.bus'].sendone()`、NocoBase `app.on()/app.emit()`、Axelor `@EventListener`
- **状态**: ✅ Phase 1b 已实现

### D1.12: 审计日志

- **决策**: Phase 1a 定义 `audit_log` 表（tenant_id, actor_id, action, resource_type, resource_id, old_values, new_values, ip, user_agent, created_at）。Core 中间件在 API 写操作时自动记录审计日志
- **索引**: `(tenant_id, resource_type, resource_id)` 复合索引支持按资源查询审计历史
- **清理**: Phase 1 不自动清理，Phase 2 支持按保留期限（如 90 天）自动归档
- **参考**: Odoo `mail.tracking.value`、Corteza Data Privacy Console
- **状态**: ✅ Phase 1a 已实现

### D1.13: 健康检查

- **决策**: Fastify 应用骨架内置 `GET /health`（返回 JSON `{ status: 'ok', db: true, redis: true, uptime: N }`）和 `GET /health/ready`（Kubernetes readiness probe，DB 连接成功后返回 200）
- **状态**: ✅ Phase 1a 已实现

### D1.14: 通知系统接口

- **决策**: Phase 1b 定义 `NotificationProvider` 抽象接口（`send(recipient, template, data)`），不实现具体渠道。Phase 2 实现 Email（nodemailer）、InApp（数据库存储 + UI 展示）、Webhook 三种 Provider
- **理由**: 通知是连接所有模块的横切关注点，Phase 1b 定义接口可让插件预先声明通知需求而不依赖具体实现
- **参考**: Odoo mail 模块、NocoBase notification plugin、Strapi email plugin
- **状态**: ✅ Phase 1b 已实现

### D1.11: 实时通信（WebSocket）

- **决策**: Phase 1 使用 HTTP polling 满足基础需求。Phase 2 引入 WebSocket 端点（`/ws`），支持 Collection 变更事件订阅（create/update/delete），客户端按需订阅指定 Collection + 事件类型
- **实现**: Phase 2 使用 Fastify WebSocket 插件 + Redis Pub/Sub 跨进程事件传播。身份认证通过连接时 token 校验
- **参考**: Directus WebSocket + GraphQL Subscriptions、Odoo Long Polling (/longpolling/poll)
- **状态**: ✅ Phase 2 已实现

### D1.10: 定时任务调度

- **决策**: 使用 BullMQ repeatable jobs 实现定时任务。插件通过 `this.app.cron.add(schedule, handler)` API 注册定时任务
- **声明**: manifest.yaml 中 `cron: [{ name, schedule, handler }]`，schedule 为 cron 表达式（兼容 node-cron），handler 为插件内函数名
- **实现**: Core 将 manifest cron 声明转换为 BullMQ repeatable jobs，集成到已有 BullMQ + Redis 基础设施
- **限制**: Phase 1 仅支持同进程执行（任务在 Core 进程中运行），Phase 2 支持独立 Worker 进程
- **理由**: BullMQ 已在技术栈中（architecture.md §三），repeatable jobs 是 BullMQ 内置能力，零额外依赖
- **参考**: Odoo `ir.cron` 模型、Strapi cron tasks、BullMQ repeatable jobs 文档
- **状态**: ✅ Phase 1b 已实现

### D2: manifest.yaml 插件声明系统

- **决策**: 每个插件通过 manifest.yaml 声明元数据、依赖、版本、权限、数据模型
- **替代方案**: package.json 声明（信息不足）、数据库注册（耦合运行态）
- **理由**: Odoo 式声明模式成熟；文件即接口，不依赖运行时；CI/CD 友好
- **参考**: Odoo `__manifest__.py`、NocoBase plugin package.json
- **状态**: ✅ Phase 1a 已实现

### D3: Schema Engine 动态模型

- **决策**: 借鉴 NocoBase Schema Engine，运行时动态定义数据模型（Collection + Field），无需代码生成
- **替代方案**: 静态 Prisma/Drizzle schema 编译期定义、纯配置文件
- **理由**: 支持非开发人员通过 UI 配置模型；Schema → DB DDL 自动迁移；Schema → UI Form/Table 自动渲染
- **参考**: NocoBase Collection System
- **状态**: ✅ Phase 2 已实现

### D4: 多租户数据库级隔离

- **决策**: Phase 1 采用单数据库 + tenant_id 字段隔离；Phase 1.5 PostgreSQL Schema-per-tenant；Phase 2 Database-per-tenant
- **替代方案**: Schema-per-tenant（PostgreSQL schema 隔离）、Shared-table（行级安全 RLS）、instance-per-tenant（NocoBase 默认）
- **理由**: Phase 1 简单高效验证架构；Phase 1.5 NocoBase 企业版验证的中间方案；Phase 2 完整数据隔离满足合规需求；混合模式支持灵活部署
- **参考**: Odoo Multi-Company（tenant_id 模式）、NocoBase @nocobase/plugin-multi-tenant（Schema 模式）
- **状态**: ✅ Phase 1a 已实现（tenant_id 隔离）；Phase 2+ 规划 Schema/DB 隔离

### D4.1: 文件存储多租户隔离

- **决策**: Phase 1 本地文件系统按路径前缀隔离（`/data/audebase/storage/{tenantId}/`）；Phase 2 采用 Odoo ir.attachment 模式 — DB 元数据（tenant_id + sha256）+ MinIO/S3 content-addressed 去重存储
- **理由**: Phase 1 零外部依赖快速启动；Phase 2 SHA-256 去重节省 40-70% 存储，presigned URL 直传减少 Core 带宽压力
- **参考**: Odoo ir.attachment（DB 元数据 + filestore 路径）、Nextcloud S3 Primary Storage
- **状态**: ✅ Phase 1b 已实现

### D5: TypeScript 全栈 + Node.js + Fastify 后端

- **决策**: 平台全栈 TypeScript；后端运行时 Node.js + Fastify
- **替代方案**: Python/Django（Odoo 栈）、Java Spring Boot（企业传统选型）、Go（高性能）
- **理由**: TS 全栈统一降低团队技能门槛；Fastify 原生插件系统与 AUDEBase 插件框架深度契合；JSON Schema 验证内置；Node.js v22 worker_threads 解决 CPU 密集型；Odoo 替代方案 Python 单体架构增加了全栈复杂度
- **参考**: Fastify 官方文档、NocoBase 技术栈
- **状态**: ✅ Phase 1a 已实现

### D6: React + Ant Design 5

- **决策**: React 19 + Ant Design 5 作为唯一 UI 组件库。使用 @ant-design/pro-layout 构建管理后台布局骨架，ProTable/ProForm 等 pro-components 用于数据密集型页面
- **说明**: ProTable/ProForm 为 AUDEBase 差异化选择——NocoBase 生产环境仅使用 @ant-design/pro-layout，表单/表格使用 Formily + antd 原生组件。ProTable/ProForm 路径未被 NocoBase 验证，需自行跟踪 antd v6 兼容性（pro-components#9629）
- **已知限制**: ProLayout 内部使用 findDOMNode，React 18 Strict Mode 产生弃用警告。Phase 1 不使用 Strict Mode 规避（NocoBase 同方案），Phase 2 跟踪上游修复（pro-components#8686）
- **替代方案**: Vue 3 + Element Plus、React + shadcn/ui + Tailwind v4（已废弃，见废弃记录）
- **理由**: NocoBase 已验证 Ant Design 5 可独立覆盖企业平台全部 UI 需求；单一组件库消除库间主题冲突；ConfigProvider.theme.token 统一主题体系
- **参考**: NocoBase（纯 antd 5.24.2 + @ant-design/pro-layout 7.22.1）、React 官方、Ant Design 5
- **状态**: ✅ Phase 1a 已实现
- **降级预案**（发现 #14）: antd v6 发布后 ProTable/ProForm 兼容性未保证时，降级为原生 antd Table + Form + Layout 组合，不依赖 pro-components。降级验收标准：功能等价、无 ProLayout 菜单依赖断裂、手工分页与 ProTable 当前页码对齐

### D6.1: Ant Design 5 供应链安全

- **决策**: antd 通过 npm 安装，版本锁定在 package.json 中（精确版本，不用 ^/~）；CI 集成 npm audit（每次 PR）；Renovate 自动升级（minor/patch 自动创建 PR，major 需人工审核）；每周检查 antd CVE（npm audit / GitHub Advisory Database）；每月复查 pro-components#8686（findDOMNode）和 #9629（antd v6）上游修复状态
- **理由**: antd 作为 npm 依赖的传统安全模型——npm audit + lockfile + Renovate。@ant-design/pro-components 同等对待。替代原 shadcn/ui copy-model 的 registry fork 策略
- **状态**: ✅ Phase 1a 已实现

### D7: Schema 驱动 UI

- **决策**: Phase 2 自研轻量 Schema→Ant Design 映射器，将 JSON Schema 声明映射为 ProTable/ProForm/Descriptions 等 antd 组件。不引入 Formily
- **替代方案**: 引入 @formily/antd（NocoBase v1 路径，但 v2 正以自研 FlowEngine 替代 Formily）、纯手写代码（放弃低代码能力）
- **理由**: NocoBase v2 从 Formily 迁移到自研 FlowEngine 证明自研路径长期更可控；Phase 1 手写 antd 页面积累的模式直接构成映射器初始规则；映射器范围限定为 antd 组件的声明式包装
- **实现**: Phase 1 管理后台手写 antd 代码，Phase 2 自研映射器迁移
- **参考**: NocoBase v2 FlowEngine、Appsmith WidgetFactory + ConfigRenderer
- **状态**: ✅ Phase 2 已实现

**映射器能力边界**：

| 范围       | 说明                                                                                                                                                                                                                                |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **支持**   | 标量字段（string/number/boolean/date/enum）、关联字段（belongsTo/hasMany 渲染为 Select/Transfer）、嵌套对象（渲染为子表单/折叠面板）、字段校验（Zod schema → antd Form rules）、列定义（JSON Schema properties → ProTable columns） |
| **不支持** | 拖拽式 UI 编辑器（非低代码设计器）、双向绑定（Schema 是单向定义源）、自定义渲染器注册（Phase 2 仅内置映射规则）、复杂联动逻辑（x-reactions 风格，Phase 3+ 考虑）                                                                    |

**映射规则示例**（Phase 2 目标）：

| JSON Schema                                    | Ant Design 组件                   |
| ---------------------------------------------- | --------------------------------- |
| `{ "type": "string", "maxLength": 100 }`       | `<Input maxLength={100} />`       |
| `{ "type": "string", "format": "email" }`      | `<Input type="email" />`          |
| `{ "type": "string", "enum": ["a", "b"] }`     | `<Select options={[...]} />`      |
| `{ "type": "boolean" }`                        | `<Switch />`                      |
| `{ "type": "number", "minimum": 0 }`           | `<InputNumber min={0} />`         |
| `{ "type": "string", "format": "date" }`       | `<DatePicker />`                  |
| `{ "$ref": "#/definitions/User" }` (belongsTo) | `<Select ...>` (异步加载关联数据) |

### D8: Zod 边界验证

- **决策**: Zod schema 用于所有系统边界输入验证，自动推导 TypeScript 类型
- **理由**: TypeScript 类型推导、运行时验证、声明式 schema 定义、与 Fastify JSON Schema 互补
- **状态**: ✅ Phase 1a 已实现

### D8.1: JWT密钥管理

- **决策**: JWT密钥通过环境变量注入（AUDE_JWT_SECRET），启动时校验非空且≥32字符
- **理由**: NocoBase CVE-2025-13877(CVSS 9.8)默认JWT密钥导致任意用户冒充
- **实现**: Fastify启动时 assert(process.env.AUDE_JWT_SECRET.length >= 32)，拒绝默认值。`users.token_version` 字段用于 token 撤回：更新 token_version + 1 → 所有旧 token 失效（发现 #6）。Access Token 15 分钟过期，Refresh Token 7 天过期（SHA-256 哈希存储于 refresh_tokens 表）
- **参考**: OWASP JWT Cheat Sheet
- **状态**: ✅ Phase 1a 已实现

### D9: Drizzle ORM 数据库操作

- **决策**: Drizzle ORM 作为数据库访问层（锁定 0.45.x LTS），通过 DatabaseProvider 抽象层封装
- **理由**: Type-safe、SQL-like API适合schema-engine、自动参数化防注入、PlanetScale收购背书；pre-1.0风险通过DatabaseProvider接口抽象（未来可零成本切换ORM）
- **风险**: pre-1.0（v1.0 预计2026 Q3-Q4），CVE-2026-39356(7.5)已修复于v0.42+
- **缓解**: DatabaseProvider接口隔离所有业务代码，CI集成测试验证迁移兼容性
- **状态**: ✅ Phase 1a 已实现

### D9.1: Drizzle连接池与监控

- **决策**: 使用pg-pool连接池（默认10连接），pino记录慢查询（>100ms）
- **监控**: Phase 1a通过Core日志聚合查看连接池状态；Phase 2引入PgBouncer统一连接管理
- **索引**: 所有包含tenant_id的查询必须以tenant_id为首列索引（避免全表扫描）
- **状态**: ✅ Phase 1a 已实现

### D10: Record Rules（记录级权限）

- **决策**: 借鉴 Odoo domain filter 表达式，manifest.permissions 中声明 record_rule
- **实现**: Core ORM 层自动注入 WHERE 条件（tenant_id + record_rule）
- **参考**: Odoo ACL + Record Rules
- **状态**: 已设计论证；Phase 3 编码（源码中尚未实现，见 architecture.md Phase 2 说明）

**Domain Filter 语法规范**：

AUDEBase 采用 Odoo 式 Poland notation（前缀表达式）数组语法：

```typescript
// 示例: state = 'draft' AND amount > 1000
["&", ["state", "=", "draft"], ["amount", ">", 1000]][
  // 示例: (category = 'A' OR category = 'B') AND active = true
  ("&", ["|", ["category", "=", "A"], ["category", "=", "B"]], ["active", "=", true])
];
```

| 运算符                               | 含义     | 参数                       |
| ------------------------------------ | -------- | -------------------------- |
| `&`                                  | AND      | 2 个子条件                 |
| `                                    | `        | OR                         | 2 个子条件 |
| `!`                                  | NOT      | 1 个子条件                 |
| `=` / `!=` / `>` / `<` / `>=` / `<=` | 比较     | `[field, operator, value]` |
| `in` / `not in`                      | 集合包含 | `[field, op, [...values]]` |
| `like` / `ilike`                     | 模糊匹配 | `[field, op, 'pattern']`   |

### D11: 字段级权限

- **决策**: manifest.exports 中 visible_to 声明字段可见角色
- **实现**: Core API 响应时自动过滤不可见字段；Schema UI 自动隐藏不可见输入框
- **参考**: NocoBase field-level ACL
- **状态**: 已设计论证；Phase 3 编码（源码中尚未实现，见 architecture.md Phase 2 说明）

### D12: Core 数据 API 代理

- **决策**: 插件默认不直连数据库。所有 DB 操作通过 Core 数据 API 代理（JSON-RPC）
- **例外**: manifest 中声明 security.db_direct: true 的 Isolated 插件可获得独立 PG 连接
- **理由**: 统一注入 tenant_id + record_rules + 字段过滤；防止插件绕过权限
- **参考**: Odoo ORM 单一数据访问路径、NocoBase CVE GHSA-v8vm-cqh8-q87q
- **状态**: ✅ Phase 1a 已实现

### D12.1: 插件间数据模型扩展

- **决策**: 采用 Odoo 类继承模式。插件通过 manifest.yaml 中 `extends` 字段声明对目标 Collection 的字段扩展，Core 在插件加载时合并字段定义
- **声明**: `manifest.yaml` 中 `extends: [{ collection: 'order', addFields: [{ name: 'warehouse_id', type: 'belongsTo', target: 'warehouse' }] }]`
- **实现**: Core CollectionRegistry 在插件 load() 阶段合并所有 extends 声明，生成最终 Collection 定义。字段冲突（同名不同类型）时拒绝加载并报错
- **限制**: Phase 1 仅支持添加字段（不支持覆写/删除已有字段）。字段校验（required/unique）由声明插件自行负责
- **Phase 2**: 与 D3 Schema Engine 统一 — extends 声明直接转化为 Collection schema 合并操作；支持关联表扩展（多对多中间表）
- **理由**: 插件化平台的核心能力 — 允许 ERP Suite 的多个独立插件协作构建完整数据模型。Odoo 类继承模式经过 20 年生产验证
- **参考**: Odoo `_inherit` 模式、NocoBase Collection field extension
- **状态**: ✅ Phase 1b 已实现

### D13: Saga 跨插件事务

- **决策**: 跨插件工作流采用 Saga 补偿模式
- **实现**: execute() + compensate() + 持久化日志（saga_log 表，含 tenant_id 列 + 首列索引）+ 幂等性（idempotency_key）
- **多租户**: saga_log 表包含 tenant_id 列（遵循 D9.1 索引规则），确保跨租户 Saga 日志隔离
- **限制**: Core 崩溃后未完成 Saga 悬挂（已知限制，Phase 4 解决）
- **状态**: ✅ Phase 4 已实现

### D14: i18n 国际化

- **决策**: 采用 NocoBase 命名空间隔离模式，插件 locale/{lang}.json 组织翻译
- **实现**: Core 聚合翻译表 + t() 函数注入 PluginHost context
- **Phase 1a**: 预加载所有翻译（eager loading）
- **参考**: NocoBase @nocobase/i18n、Odoo .po 文件
- **状态**: ✅ Phase 1b 已实现

### D15: 前端 i18n — react-i18next

- **决策**: 前端使用 react-i18next，双命名空间模式：插件专属命名空间（包名如 `@audebase/plugin-erp`）+ 全局共享命名空间 `'client'`（通用 UI 字符串如"保存"/"取消"）。后端 Core t() 注入 PluginHost context，前后端命名空间一致
- **理由**: NocoBase 已验证路径（useTranslation + 包名 namespace + client 共享 namespace）；ICU 消息格式内置（复数、日期、插值）；懒加载支持（i18next-resources-to-backend）；生态成熟
- **实现**: manifest.locale.path → i18next backend 加载 `locale/{lang}.json`；插件 namespace 自动设为包名；全局 `'client'` namespace 由 Core 提供通用 UI 字符串翻译
- **参考**: NocoBase @nocobase/i18n + react-i18next（ns: [pkg.name, 'client'] 双命名空间）
- **状态**: ✅ Phase 1a 已实现

### D16: Admin UI 布局 — Ant Design ProLayout

- **决策**: 使用 @ant-design/pro-layout 作为管理后台骨架。插件通过代码 API（`this.app.router.add()`）注册路由，ProLayout 自动生成侧边栏菜单。菜单项通过 aclSnippet 字段声明权限，ACLProvider 自动过滤。不使用 ProLayout 内置 SettingDrawer——改为通过 D23 `settings.panels` Slot 承载自定义主题配置面板（与 NocoBase 自建 theme-editor 方案一致）
- **菜单分组**: 采用 dot 命名约定（NocoBase 模式）：`router.add('admin.erp', { type: 'group' })` 创建分组，`router.add('admin.erp.purchase', ...)` 自动归入。冲突策略：route path 相同 → 报错；Slot key 相同 → 后注册覆盖
- **理由**: NocoBase 已验证 ProLayout 可构建完整企业后台（多级菜单、面包屑、暗色模式）；开箱即用零开发成本；路由配置即菜单生成
- **参考**: NocoBase ProLayout + 动态路由 + ACL 过滤
- **状态**: ✅ Phase 1a 已实现

### D17: 插件前端加载策略 — 分层渐进

- **决策**: 按信任层级分层：Phase 1a（SYSTEM）Monorepo 构建时打包；Phase 2（Domain/Isolated）动态 import() ESM 模块；Phase 4（Container）iframe + postMessage
- **理由**: 与四层信任分组模型（D1.1）对称。Phase 1 插件数少，Monorepo 打包最简；Phase 2 独立部署需动态加载
- **实现**: Phase 2 插件输出 `dist/admin.mjs`（ESM）+ `dist/admin.css`，Core 提供 `/plugins/{name}/*` HTTP 端点代理插件目录，浏览器端 `import(plugin.assets.admin)` 动态加载
- **Container 安全**: iframe `sandbox="allow-scripts"` + postMessage `event.origin` 校验；CSP 头限制 iframe 内脚本来源
- **参考**: Directus extensions/ 目录动态加载、Strapi Monorepo 打包
- **状态**: ✅ Phase 1a 已实现

### D18: 前端状态管理 — Provider Stack + 独立 Store

- **决策**: Core 提供 TenantProvider / UserProvider / ACLProvider 等 Context Provider 包裹整个 Admin（Core 不用 Zustand）。插件内部可独立使用 Zustand Store。跨插件共享通过 Core Provider 或事件总线。TanStack Query 的 query key 强制 `[pluginName, ...]` 前缀避免冲突
- **Provider 依赖**: ACLProvider 必须在 TenantProvider 内部（需 tenantId 获取权限）。其余 Provider 顺序无依赖，可互换
- **租户切换**: 使用 `queryClient.removeQueries({ predicate: q => !q.queryKey.includes('system') })` 选择性清除——保留 system 全局查询，仅清除租户相关缓存
- **理由**: NocoBase 已验证 Provider Stack 模式（ACLProvider → DataBlockProvider 链）；插件独立 Store 确保故障隔离；TanStack Query 命名空间规则防止缓存冲突
- **参考**: NocoBase ACLProvider / CollectionProvider / DataBlockProvider
- **状态**: ✅ Phase 1a 已实现

### D19: 前端权限控制 — ACLProvider + ACLGuard

- **决策**: 三层权限控制：菜单级（路由 aclSnippet → ProLayout 自动过滤）、组件级（`<ACLGuard action resource>` 包裹 + `useACL().can()` Hook）、字段级（D11 后端过滤 + 前端 ACLGuard 防御层）
- **理由**: NocoBase 已验证 aclSnippet + ACLProvider 模式；粒度恰好覆盖管理后台权限需求
- **实现**: ACLProvider 启动时异步获取权限列表。加载期间 ACLGuard render null，加载完成恢复渲染。useACL() Hook 提供 can/canRoute/canField；菜单 ProLayout 自动过滤，按钮/字段用 ACLGuard 包裹
- **参考**: NocoBase ACLProvider + useACLRoleContext
- **状态**: ✅ Phase 1a 已实现

### D20: 插件 UI 错误隔离 — Error Boundary + Suspense

- **决策**: 路由渲染处统一包裹 `<ErrorBoundary>`（使用 react-error-boundary）+ `<Suspense>`，插件崩溃仅影响该页面区域（显示降级 UI + 重试按钮），侧边栏/顶栏保持正常
- **理由**: NocoBase 已验证 Error Boundary 包裹 SchemaComponent 模式；Suspense + ErrorBoundary 天然配对动态加载场景
- **实现**: 降级 UI 显示插件名称 + 错误摘要（不暴露堆栈）+ 重试按钮 + 返回首页链接。崩溃记录到 Core 审计日志
- **参考**: NocoBase SchemaComponent Error Boundary
- **状态**: ✅ Phase 1a 已实现

### D21: 前端构建 — Vendor 分组 + 共享依赖

- **决策**: React/antd/react-i18next/@tanstack/react-query 等作为 Core Admin host 提供的共享依赖（peerDependencies），插件不重复打包。生产 Code Splitting 参照 NocoBase PR #8963 模式：vendor-react / vendor-antd / vendor-i18n / vendor-query 各自独立 chunk，插件按需加载
- **理由**: 避免 50 插件 × 150KB 重复 = 7.5MB 浪费；vendor 分组变更频率低（仅依赖升级时），插件 chunk 频繁更新但体积小——兼顾缓存命中率和加载速度
- **实现**: Vite build.rollupOptions.manualChunks 分组；插件构建声明 externals。Phase 1 Vite HMR 原生，Phase 2 远程代理。构建配置确定后实测 antd tree-shaking 效果，若不理想降级为按需引入子路径（如 `antd/es/table`）
- **参考**: NocoBase PR #8963 stable vendor groups
- **状态**: ✅ Phase 1a 已实现

### D22: 懒加载注册 — 渐进

- **决策**: Phase 1 保持直接注册（D16 代码 API），Phase 2 扩展 `router.add()` 支持 `lazy: () => import(...)` 和 `loading: SkeletonComponent` 选项。不做完整 FlowModel 体系
- **类型约束**: lazy 必须接受 `() => Promise<{ default: ComponentType }>`（即原生 `() => import()`）。**禁止** `async () => { return await import() }` 包装（破坏 code splitting，Strapi PR #17685）和 `React.lazy()` 包装（运行时崩溃，Strapi PR #17674）
- **理由**: 与 D7 自研 Schema 映射器避免重复。Phase 1 插件数少无需懒加载。lazy 选项是 D16 API 的自然扩展
- **参考**: NocoBase v2 FlowEngine lazy loading、Strapi PR #17685/#17674 反模式
- **状态**: ✅ Phase 1a 已实现

  参见 D17 插件前端加载策略：D17 定义加载机制（文件来源与浏览器加载方式），D22 定义注册 API（路由如何声明懒加载）。

### D23: UI 扩展插槽 — Registry + Slot

- **决策**: Core 预定义命名 Slot（`header.actions.right`、`sidebar.bottom`、`settings.panels` 等），插件通过 `this.app.slot.add()` 注册组件。Slot 容器自动权限过滤（aclSnippet）+ 排序（order）。Slot 无注册组件时渲染 null（不占 DOM 节点，不渲染占位 UI）
- **错误隔离**: 每个 Slot 组件包裹独立 ErrorBoundary（使用 react-error-boundary），单个组件崩溃不影响其他 Slot 组件
- **理由**: Odoo MainComponentsContainer + Strapi Injection Zone + VS Code contribution points 全部使用此模式——这是插件化 UI 的标准实践。与 D16 的 router.add() API 风格一致
- **参考**: Odoo registry.category() + MainComponentsContainer、Strapi injectionZones
- **状态**: ✅ Phase 1a 已实现

### D24: 多租户前端 — URL 路径前缀

- **决策**: URL 路径前缀模式 `/{tenantId}/admin`。租户切换时：`onlineManager.setOnline(false)`（禁止自动 refetch）→ `queryClient.clear()` → `window.location.href = '/{newTenantId}/admin'`（全页重载，非客户端 navigate），消除 CWE-524 信息泄露风险
- **理由**: NocoBase 已验证路径前缀模式；浏览器单标签页内支持多租户；部署最简单。全页重载确保 Zustand Store / 闭包引用全部清理（业界审计工具 AuditBuffet CWE-524 推荐）
- **实现**: TenantProvider 提供 tenantId / tenantConfig / availableTenants / switchTenant()。品牌配置渐进加载：默认主题先行渲染（避免白屏）→ 异步 fetch theme.json（localStorage + ETag 缓存）→ 成功后 ConfigProvider 热切换主题 token
- **参考**: NocoBase multi-tenant plugin、TanStack Query logout pattern、AuditBuffet CWE-524
- **状态**: ✅ Phase 1a 已实现

## 通用决策 (G1-G5)

### G1: 不可变性优先

- **决策**: 始终创建新副本，不就地修改
- **理由**: 防止副作用、简化调试、支持安全并发

### G2: 小文件原则

- **决策**: 200-400 行典型，800 行最大
- **理由**: 高内聚低耦合、易理解、易审查

### G3: 零 as any / @ts-ignore

- **决策**: 禁止类型断言绕过，使用 unknown + 类型收窄
- **理由**: 保持类型安全、避免运行时错误

### G4: interface 优先于 type

- **决策**: 对象形状使用 interface，联合类型/映射类型使用 type
- **理由**: interface 可扩展、更好的错误提示

### G5: AI-Driven SDD/TDD 作为强制性开发规范

- **决策**: Phase 1a 起，所有模块开发必须遵循 AI-Driven SDD/TDD 工作流：SDD 文档先行，TDD 测试驱动编码。
- **流程**:
  1. AI 代理根据 architecture.md + phase-planning.md 需求生成模块 SDD 文档（接口定义 + 生命周期 + 依赖 + 错误码 + mock 约束）。
  2. AI 代理根据 SDD 接口定义生成测试计划（测试文件骨架 + 覆盖率目标）。
  3. 编码阶段遵循 RED → GREEN → IMPROVE TDD 循环。
  4. 编码完成后 AI 代理同步更新 .agents/memorys/ 和 AGENTS.md。
- **理由**: Phase 0 阶段团队审核发现 63 项审计中多次出现 documentation-implementation gap（发现 #1, #13, #17, #22）。AI-Driven SDD/TDD 确保：
  - SDD 文档在编码前强制定义接口契约，消除不确定性
  - TDD 测试计划从 SDD 自动推导，减少遗漏场景
  - 文档同步作为完成条件（definition of done）之一
- **例外**: pure-refactor（纯重构不改变接口）或紧急 hotfix 可跳过 SDD 生成，但必须事后补测试。
- **验证**: CI 集成检查：若模块有 SDD 文档但对应测试覆盖率 < 80%，CI 失败（见 D1.7 覆盖率闸门参考）。
- **参考**: decisions.md D1.7（CI 覆盖率闸门）、docs/modules/dev-workflow.md、AGENTS.md §AI-DRIVEN SDD/TDD 工作流
- **状态**: ✅ Phase 1a 已实现

## 已废弃决策（旧 MODACS 架构 + 旧前端方案）

以下决策原为 MODACS 工业控制平台制定，或因前端架构重新评估后废弃。

| 决策      | 原内容                                      | 废弃原因                                                                                     |
| --------- | ------------------------------------------- | -------------------------------------------------------------------------------------------- |
| D1 (旧)   | 多进程插件隔离架构                          | AUDEBase 采用渐进式隔离：Phase 1 inline + Phase 2 process                                    |
| D2 (旧)   | UDS JSON-RPC 进程间通信                     | 采用 JSON-RPC over stdin/stdout                                                              |
| D5 (旧)   | TypeScript + Rust 实时控制                  | AUDEBase 不需要硬实时控制模块                                                                |
| D7 (旧)   | 三层 UI 隔离架构                            | 架构变更，不再需要 UIAdapter 抽象层                                                          |
| D6 (旧)   | shadcn/ui + Tailwind v4 + Ant Design 5 混合 | 2026-07-10 废弃：双库混用增加主题冲突和包体积，NocoBase 证明纯 antd 即可覆盖全部企业 UI 需求 |
| D6.1 (旧) | shadcn/ui registry fork 策略                | 随 D6 废弃（shadcn/ui copy-model 不再适用）                                                  |
