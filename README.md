# AUDEBase — 企业应用开发平台

**微内核 + 插件热插拔架构，对标 Odoo、NocoBase、云表。**

AUDEBase 是一个面向企业的应用开发平台。通过微内核 + 插件热插拔架构，支持 OA、ERP、MES、PLM、WMS 等企业应用的快速开发与部署。所有业务模块以插件形式运行，独立开发、独立部署，通过 manifest.yaml 统一声明。

## 架构

### 四层信任分组

- **语言**: TypeScript 全栈
- **后端**: Node.js + Fastify
- **前端**: React 19 + Ant Design 5（ProLayout + ProTable/ProForm）
- **数据库**: PostgreSQL + Drizzle ORM
- **缓存**: Valkey 8 (Redis-compatible)
- **包管理**: pnpm workspace monorepo

| 层级          | 进程模型       | 通信方式           | 典型场景                      |
| ------------- | -------------- | ------------------ | ----------------------------- |
| **SYSTEM**    | 共享进程       | 直接函数调用       | 平台插件（auth, audit, i18n） |
| **Domain**    | 业务域共享进程 | 直接函数调用 + RPC | OA、ERP 等业务域内插件        |
| **Isolated**  | 每插件独立进程 | JSON-RPC（白名单） | 第三方插件                    |
| **Container** | 容器沙箱       | JSON-RPC（全禁出） | 不可信插件                    |

50 个插件从 50 进程 / 2.5-4GB 降为 8-12 进程 / 0.4-0.7GB。组内通信零延迟，组间通信通过 Core 路由 + Redis Pub/Sub。

### manifest.yaml 声明系统

每个插件通过 `manifest.yaml` 声明元数据、依赖、版本、权限、数据模型：

```yaml
name: @audebase/plugin-erp
version: 1.0.0
runtime:
  mode: inline          # inline | process | container
  partition: erp        # SYSTEM | oa | erp | mes | isolated
lifecycle:
  migration_version: 1.0.0
exports:
  api_version: 1.0.0
permissions:
  - users:read
  - orders:create
```

### 插件生命周期

7 个钩子：`afterAdd` → `beforeLoad` → `load` → `install` → `afterEnable` → `afterDisable` → `pre_uninstall`。Phase 1 双状态（loaded/disabled），Phase 2 扩展到五状态机。数据库迁移采用 NocoBase 三阶段模式（preload → postsync → postload），按 SemVer 排序执行。

## 快速开始

### 前提条件

- **Node.js** 22+
- **pnpm** 10+（`corepack enable && corepack prepare pnpm@10.33.3 --activate`）
- **Docker Desktop**（提供 PostgreSQL 16 + Valkey 8）

### 启动

```bash
# 1. 克隆
git clone https://gitee.com/chengxuewen/AUDEBase.git
cd audebase

# 2. 配置环境变量
cp .env.template .env
# 编辑 .env — 设置 AUDE_JWT_SECRET（32+ 字符）和 AUDE_DB_PASSWORD

# 3. 启动基础设施
docker compose up -d

# 4. 安装依赖
pnpm install

# 5. 运行数据库迁移
pnpm db:migrate

# 6. 启动开发模式
pnpm dev
```

Kernel 启动在 `http://localhost:3000`，Admin UI 在 `http://localhost:5173`。

### 常用命令

| 命令                          | 说明                     |
| ----------------------------- | ------------------------ |
| `pnpm dev`                    | 启动所有包（watch 模式） |
| `pnpm build`                  | 构建所有包               |
| `pnpm test`                   | 运行所有测试             |
| `pnpm test:coverage`          | 运行测试并生成覆盖率报告 |
| `pnpm lint`                   | 代码检查                 |
| `pnpm type-check`             | TypeScript 类型检查      |
| `pnpm db:migrate`             | 运行数据库迁移           |
| `pnpm db:up` / `pnpm db:down` | 启动 / 停止 Docker 服务  |
| `aude db:migrate --dry-run`   | 迁移预检（CI 集成）      |

## 模块清单

28 个 packages，102 测试文件，Phase 1a-2 完成，工作流引擎 (Phase 4) 完成：

| 模块          | 包名                   | 说明                                                                       | 状态        |
| ------------- | ---------------------- | -------------------------------------------------------------------------- | ----------- |
| 内核          | `core`                 | Fastify 服务、CLI、JWT 认证、CRUD API、多租户中间件、插件管线              | ✅ Phase 1a |
| 管理 UI       | `admin-ui`             | React 19 + Ant Design 5 管理后台（Login + Dashboard + 用户/角色/插件管理） | ✅ Phase 1a |
| 共享类型      | `shared-types`         | 公共 TypeScript 类型定义和 Zod schemas                                     | ✅ Phase 1a |
| 插件框架      | `plugin-framework`     | 四层信任分组、PluginHost 抽象、动态加载管线                                | ✅ Phase 1a |
| 插件内核      | `plugin-core`          | Bootstrap 引导（admin 用户、默认角色、系统租户），零依赖内核插件           | ✅ Phase 1a |
| manifest 系统 | `manifest-engine`      | manifest.yaml 解析、验证、依赖解析                                         | ✅ Phase 1a |
| 迁移管理      | `migration`            | Scanner→Resolver→Executor→Runner，SemVer 排序 + 三阶段迁移                 | ✅ Phase 1a |
| RBAC 权限     | `rbac`                 | PermissionEngine + 路由守卫 + 粒度权限（users:read/create/...）            | ✅ Phase 1a |
| 审计日志      | `audit`                | AuditService + onResponse hook 自动记录写操作                              | ✅ Phase 1a |
| 国际化        | `i18n`                 | I18nEngine + Accept-Language + namespace 隔离 + zh-CN                      | ✅ Phase 1a |
| 健康检查      | `health-check`         | GET /health + /health/ready 端点                                           | ✅ Phase 1a |
| 日志基础设施  | `logging-infra`        | pino 结构化日志 + redaction + X-Request-ID                                 | ✅ Phase 1a |
| 插件示例      | `plugin-example`       | 参考插件实现，展示插件开发模式                                             | ✅ Phase 1a |
| 插件通信      | `plugin-communication` | 组内直调 + 组间 JSON-RPC + Redis Pub/Sub                                   | ✅ Phase 1b |
| 事件总线      | `event-bus`            | 应用层 EventBus，同进程回调 + 跨进程 Redis Pub/Sub                         | ✅ Phase 1b |
| 定时任务      | `cron`                 | BullMQ repeatable jobs，manifest.yaml cron 声明                            | ✅ Phase 1b |
| 通知系统      | `notification`         | NotificationProvider 抽象接口（Email / InApp / Webhook）                   | ✅ Phase 1b |
| API 版本控制  | `api-versioning`       | URL 路径 /api/v{major}/{resource} 版本路由                                 | ✅ Phase 1b |
| 数据扩展      | `data-extends`         | 插件间数据模型扩展（extends 声明解析 + 字段合并）                         | ✅ Phase 1b |
| 文件上传      | `file-upload`          | FileUploadService + 内存 AttachmentRepository                              | ✅ Phase 1b |
| 认证          | `auth`                 | JWT 签发/验证 + token_version + Refresh Token                             | ✅ Phase 1a |
| CLI 工具      | `cli`                  | aude dev/db:migrate/plugin:create 命令行工具                               | ✅ Phase 1a |
| 速率限制      | `rate-limit`           | 固定窗口计数器限流                                                         | ✅ Phase 1a |
| Schema 引擎   | `schema-engine`        | 动态模型定义 + Schema→DB 迁移 + Schema→UI 渲染                             | ✅ Phase 2  |
| WebSocket     | `websocket`            | 实时通信，Collection 变更事件订阅                                          | ✅ Phase 2  |
| 工作流核心    | `workflow-core`        | 工作流引擎运行时核心                                                       | ✅ Phase 4  |
| 工作流引擎    | `workflow-engine`      | 审批流、业务流程自动化引擎                                                 | ✅ Phase 4  |
| 工作流任务    | `workflow-tasks`       | 工作流任务节点实现                                                         | ✅ Phase 4  |

## 技术栈

| 层       | 技术                                            | 用途                                         |
| -------- | ----------------------------------------------- | -------------------------------------------- |
| 后端     | **Node.js 22** + **Fastify**                    | 高性能 HTTP 服务，原生插件系统               |
| 数据库   | **PostgreSQL 16** + **Drizzle ORM 0.45.x**      | 类型安全 SQL，自动参数化防注入               |
| 缓存     | **Valkey 8** (Redis-compatible)
| 任务队列 | **BullMQ**                                      | 定时任务、异步任务处理                       |
| 前端     | **React 19** + **Ant Design 5** + **ProLayout** | 管理后台 UI，ProTable/ProForm 数据密集型页面 |
| 状态管理 | **TanStack Query** + **Zustand**                | 服务端状态缓存 + 插件本地状态                |
| 国际化   | **react-i18next**                               | 双命名空间（插件包名 + client 共享）         |
| 验证     | **Zod**                                         | 系统边界输入验证，自动推导 TypeScript 类型   |
| 构建     | **Vite** + **Turborepo**                        | Monorepo 构建 + 增量编译                     |
| 测试     | **Vitest** + **Playwright**                     | 单元测试 + E2E 测试                          |
| 部署     | **Docker Compose** + **pixi**                   | 开发环境一键启动 + 打包部署                  |

## 开发工作流

### AI-Driven SDD + TDD

AUDEBase 从 Phase 1a 起采用 AI 驱动的 SDD + TDD 工作流：

1. **SDD 先行** — 编码前 AI 代理生成模块设计文档，定义接口契约、生命周期、依赖关系
2. **TDD 编码** — RED → GREEN → IMPROVE 循环，SDD 定义的 API 先写测试再实现
3. **SDD 即契约** — SDD 与实现以接口/API/生命周期为契约，CI 集成测试验证一致性
4. **文档同步** — 编码完成后写入 .agents/memorys/ 和 AGENTS.md

### 测试要求

- 最低覆盖率 80%，CI 集成覆盖率闸门
- 所有测试用例遵循 AAA 格式（Arrange → Act → Assert）
- 集成测试使用 seed factory + transaction rollback
- ProcessPluginHost mock 满足 5 项约束（async Promise、JSON 序列化、30s 超时、延迟注入）

### 编码约定

- **不可变性优先** — 始终创建新副本，不就地修改
- **interface 优先于 type** — 对象形状使用 interface
- **零 as any / @ts-ignore** — 使用 unknown + 类型收窄
- **Zod 边界验证** — 所有系统边界使用 Zod 验证
- **小文件原则** — 200-400 行典型，800 行最大

## 项目结构

```
audebase/
├── packages/             # 28 个包
│   ├── core/            # Fastify 服务端
│   ├── admin-ui/         # React 管理后台
│   └── ...
├── docs/                 # 架构文档、SDD、TDD、执行计划
│   ├── architecture.md
│   ├── modules/          # 33 份模块设计/SDD/TDD 文档
│   └── reference/        # 15 份竞品调研报告
├── .agents/              # AI 代理配置
│   ├── rules/            # 84 个编码规则
│   ├── skills/           # 13 个技能
│   └── memorys/          # 项目记忆（status、conventions、decisions、pitfalls）
├── .opencode/            # OpenCode 配置
├── docker-compose.yml    # PostgreSQL 16 + Valkey 8
└── .env.template         # 环境变量模板
```

## Phase 路线图

**Phase 2 完成** — 28 包全部实现，工作流引擎 (Phase 4) 完成。**D26** — Refine+ProLayout+自建15包底座。D25 NocoBase 方案已废弃。
| Phase 0 | ✅ | 架构定义、8 轮团队审核、3 轮文档审计 |
| Phase 1a (自建) | ✅ | 14 包实现：插件框架、RBAC、审计、日志、i18n、健康检查、管理 UI 等 |
| Phase 1b | ✅ | 6 包实现：EventBus、Cron、文件上传、通知、API 版本化、数据扩展 |
| Phase 2 | ✅ | Schema Engine + WebSocket（动态模型定义、实时事件订阅） |
| Phase 4 (NocoBase 探索) | ⚠️ 已废弃（D26） | D25 基于 NocoBase 重构方案，被 D26 Refine+ProLayout+自建15包底座替代 |
| Phase 4 | ✅ | 工作流引擎（workflow-core/engine/tasks — Saga 补偿模式） |

实施计划见 [D26 实施计划](docs/superpowers/plans/2026-07-23-refine-hybrid-implementation-plan.md)。设计见 [D26 架构设计](docs/superpowers/specs/2026-07-23-refine-hybrid-architecture-design.md)。架构决策见 [decisions.md](.agents/memorys/decisions.md) D26。D25 已废弃。
## 许可证

Apache 2.0
