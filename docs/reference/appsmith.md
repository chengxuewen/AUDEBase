# Appsmith — 产品画像

> **分析日期**: 2026-07-10 | **分类**: 内部工具构建器（开发者优先） | **AUDEBase 相关度**: ⭐⭐

---

## 1. 产品概述

### 1.1 一句话定位

**Appsmith 是开发者优先的开源低代码内部工具构建平台**，以「拖拽 Widget + JavaScript 绑定」为核心范式，连接 25+ 数据库和任意 REST/GraphQL API，帮助开发团队在数小时内将后台面板、管理仪表板、CRUD 表单从概念变为产品。

### 1.2 基本定位

Appsmith 占据低代码市场中一个独特的生态位：**比纯 No-Code 更灵活，比 Full-Code 快 10 倍**。与面向业务用户的 No-Code 平台（如 Budibase、Retool）不同，Appsmith 假定用户具备 JavaScript 编程能力，将"写代码"视为正常开发路径而非需要隐藏的负担。这种「技术民主化」而非「去技术化」的理念，使其天然适合开发者主导的团队。

### 1.3 基本信息

| 维度 | 详情 |
|------|------|
| **创始年份** | 2020 年 6 月（首次提交 GitHub） |
| **公司** | Appsmith Inc.（总部美国，创始团队来自印度） |
| **许可** | Apache 2.0（开源） |
| **社区规模** | GitHub ~40K stars, 4,600+ forks, 4,400+ open issues |
| **当前版本** | v2.1（2026 年 5 月 29 日发布） |
| **核心受众** | 全栈/后端开发工程师、技术产品经理、DevOps 团队 |
| **部署模式** | 云托管 + 自托管（Docker / Kubernetes / AWS AMI / DigitalOcean / Ansible） |

### 1.4 发展历程

| 年份 | 里程碑 |
|------|--------|
| 2020.06 | Appsmith 首次提交 GitHub，定位"开源 Retool 替代品" |
| 2021 | 获 A 轮融资（$8M），社区版完善，Docker 单容器部署方案成熟 |
| 2022 | 获得 B 轮 $41M，Git Sync 功能发布（应用配置可版本化管理） |
| 2023 | 企业版发布，RBAC 权限、审计日志等功能上线；推出 Appsmith Cloud |
| 2024 | Kubernetes 部署正式支持，数据源连接器突破 25 个 |
| 2025 | 企业级治理能力增强（SSO/SAML/OIDC）、多环境管理 |
| 2026 | **v2.1 发布**，引入 Appsmith Agents（AI 智能体平台），支持知识工作者用自然语言查询和自动化 |

**关键决策节点**：
- **2020 年** — 选择"开发者优先"而非"零代码"，决定了产品基因；同年选择了"胖容器"部署模型（单 Docker 包含所有依赖），这个决策至今仍是其自托管体验的最大特点也是最大争议点
- **2022 年** — 内置 Git Sync，实现了应用配置的版本化、分支管理和 CI/CD 集成，这在低代码平台中几乎是独有功能
- **2026 年** — Appsmith Agents 入场，将 AI 智能体嵌入内部工具场景，对标这一轮 Agentic AI 浪潮

---

## 2. 技术架构

### 2.1 总体架构 — 模块化单体

Appsmith 的架构哲学是**「模块化单体」（Modular Monolith）**——代码库内部高度模块化，但部署时以一个"胖容器"交付。这是 Appsmith 最受讨论也最具辨识度的架构决策。

```
┌─────────────────────────────────────────────────────────┐
│               Docker Container (appsmith-ce)             │
│                                                         │
│  ┌──────────┐   ┌──────────┐   ┌───────────────────┐   │
│  │  Caddy   │   │  NGINX   │   │  React Client     │   │
│  │ (反代/LB) │   │ (静态资源)│   │  (编辑器 + 运行视图)│   │
│  └────┬─────┘   └────┬─────┘   └─────────┬─────────┘   │
│       │              │                   │              │
│       └──────────────┼───────────────────┘              │
│                      │                                  │
│       ┌──────────────┴──────────────┐                   │
│       │     Java Backend (Spring)    │                   │
│       │  - 认证/授权 (OAuth2/OIDC)   │                   │
│       │  - CRUD API                 │                   │
│       │  - Action 执行引擎          │                   │
│       │  - Git 模块（文件系统级同步）│                   │
│       │  - 多租户工作区管理          │                   │
│       └──────────────┬──────────────┘                   │
│                      │                                  │
│  ┌───────────────────┼───────────────────┐              │
│  │                   │                   │              │
│  ▼                   ▼                   ▼              │
│ ┌─────────┐   ┌───────────┐   ┌───────────────┐       │
│ │ MongoDB │   │  Redis    │   │  Node.js RTS  │       │
│ │ (持久化) │   │ (缓存/Pub) │   │ (实时协作服务) │       │
│ └─────────┘   └───────────┘   └───────────────┘       │
│                                                         │
│  进程管理: supervisord (PID 1)                           │
│  持久化挂载: /appsmith-stacks                            │
└─────────────────────────────────────────────────────────┘
```

### 2.2 胖容器（Fat Container）设计决策

Appsmith 最核心的架构决策是**将所有运行时依赖打包进单一 Docker 镜像**：

| 组件 | 技术栈 | 容器内角色 |
|------|--------|-----------|
| **前端编辑器** | React + TypeScript | 画布渲染、Widget 属性面板、JS 绑定评估 |
| **后端服务** | Java + Spring Framework | 认证、数据源连接、查询执行、权限、持久化 |
| **实时服务 (RTS)** | Node.js | 多人协作编辑的 WebSocket 通道 |
| **数据库** | MongoDB（嵌入式） | 存储应用定义、页面、数据源、用户、工作区 |
| **缓存** | Redis（嵌入式） | 缓存 + Pub/Sub（实时服务通信） |
| **Web 服务器/反代** | Caddy / NGINX | 路由、静态资源分发、反向代理 |
| **进程管理** | supervisord | PID 1, 管理上述所有进程 |

**采用胖容器的原因**：
- **降低部署门槛**：`docker run` 一条命令即可启动完整技术栈，无需编排 docker-compose 串联 5 个容器
- **版本一致性**：所有依赖版本由 Appsmith 团队控制，用户不会因 MongoDB/Redis 版本不兼容而部署失败
- **自动更新支持**：内置 watchtower 生命周期钩子，一键升级而不破坏数据
- **Kubernetes 简化**：一个 Pod 包含全部能力，Helm Chart 管理更直接

**胖容器的代价（被社区反复批评的点）**：
- **无法独立扩缩容**：数据库和缓存与业务逻辑在同一容器内，不能对 MongoDB 和 Redis 单独做高可用
- **备份策略复杂**：数据库作为 sidecar 运行，备份时需同时考虑文件系统快照和 MongoDB dump
- **故障爆炸半径大**：supervisord 下任一关键进程崩溃都可能拖垮整个容器
- **不适合大规模生产**：官方推荐生产环境使用 Kubernetes + 外部 MongoDB/Redis

> **启示**：胖容器是「先让启动简单，再让规模化可能」的务实折中。Appsmith 的策略是：默认单容器快速上手，同时支持外部 MongoDB/Redis 连接的进阶部署模式。容器启动时会自动检测环境变量，若配置了外部数据库，则跳过嵌入式 MongoDB 启动。

### 2.3 前端架构 — React + 响应式绑定

Appsmith 的前端分为两大模块：

```
app/client/
├── src/
│   ├── widgets/           # 45+ Widget 实现（表格、表单、图表、地图、富文本等）
│   ├── components/        # React 组件
│   ├── pages/             # 编辑器 + 应用查看器
│   │   ├── Editor/        # 拖拽画布、属性面板、Widget 树
│   │   └── AppViewer/     # 运行时视图（用户看到的最终 APP）
│   ├── actions/           # Redux actions
│   ├── selectors/         # 数据选择器
│   ├── workers/           # Web Worker 中的 JS 评估沙箱
│   └── utils/             # 工具函数
└── packages/rts/          # Node.js 实时协作服务
```

**响应式绑定引擎**是 Appsmith 前端的核心。它实现了 MVC 式的声明式数据流：

```
数据源 (Model) → 查询 (Controller) → Widget (View)
     ↑                                    │
     └────────── 用户交互回写 ─────────────┘
```

- **`{{ }}` Mustache 绑定**：在 Widget 属性中使用 `{{ Table1.selectedRow.name }}` 表达式，引擎自动追踪依赖并在数据变化时重新求值
- **JS Objects**：可复用的 JavaScript 代码块，供多个 Widget 和查询引用
- **数据自动流动**：查询执行后结果自动注入到查询对象的 `.data` 属性，任何引用此属性的 Widget 自动更新

### 2.4 后端架构 — Java Spring

后端采用经典的 **Java + Spring** 技术栈：

| 模块 | 功能 |
|------|------|
| **认证模块** | 用户名/密码 + OAuth 2.0 (Google, GitHub) + SSO (OIDC, SAML) |
| **CRUD API** | 用户、工作区（Workspace）、应用、页面、Widget 的完整 CRUD |
| **Action 执行引擎** | 执行数据库查询和 API 调用，负责参数绑定和结果序列化 |
| **Git 模块** | 在文件系统上维护应用仓库的裸克隆，支持分支切换、提交、推送/拉取 |
| **权限引擎** | RBAC：工作区级角色（Admin/Developer/App Viewer）+ 页面/Widget 级权限 |
| **多租户** | 工作区（Workspace）隔离，每个工作区独立的用户、应用、数据源 |

### 2.5 数据持久化

- **MongoDB**：存储所有元数据 —— 应用定义（JSON Schema）、页面结构、Widget 配置、查询定义、数据源连接信息、用户和权限。MongoDB 的文档模型天然适配低代码平台的动态配置序列化需求。
- **Redis**：短期缓存 + Pub/Sub 通道（RTS 实时协作依赖）
- **挂载卷 `/appsmith-stacks`**：持久化 MongoDB 数据文件、上传的静态资源、自定义 SSL 证书、配置文件

---

## 3. 核心功能

### 3.1 45+ Widget 拖拽画布

Appsmith 提供超过 45 个预构建 Widget，覆盖内部工具常见 UI 模式：

| 类别 | Widget |
|------|--------|
| **数据展示** | Table、List、JSON Form、Chart（ECharts 驱动） |
| **输入组件** | Input、Select、Checkbox、DatePicker、FilePicker、Rich Text Editor |
| **布局** | Container、Tabs、Modal、Divider |
| **媒体** | Image、Map（支持 Google Maps / OpenStreetMap） |
| **交互** | Button、Icon Button、Menu Button |
| **高级** | Iframe、Document Viewer、Audio/Video Recorder |

**限制**：Widget 库不支持自定义 React 组件。深度 UI 定制只能通过 CSS 覆盖或在 iframe 中嵌入独立前端。这在使用场景超过标准后台面板需求时是显著瓶颈。

### 3.2 JavaScript 自定义逻辑

Appsmith 的核心差异化能力在于 **JavaScript 深度嵌入**：

- **JS Objects**：可复用的 JS 函数集合，支持 `async/await`、闭包、模块间的 `export/import`
- **Mustache 绑定**：`{{ }}` 语法在任意 Widget 属性中嵌入 JS 表达式
- **事件处理器**：onClick、onPageLoad、onRowSelected 等触发器中编写 JS 代码
- **沙箱隔离**：JS 代码在 Web Worker 中执行，防止阻塞 UI 主线程
- **Transform 管道**：查询返回数据后自动经过 JS 转换函数处理——过滤、映射、聚合

```javascript
// 典型 Appsmith JS Object 示例
export default {
  // 计算仪表板 KPI
  calculateKPIs: async () => {
    const orders = await getOrders.run();
    const revenue = orders.reduce((sum, o) => sum + o.amount, 0);
    const avgOrder = revenue / orders.length;
    await storeWidget.setValue({
      totalRevenue: revenue,
      avgOrderValue: avgOrder.toFixed(2)
    });
    return { revenue, avgOrder };
  },
  
  // 格式化货币
  formatCurrency: (amount, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', { 
      style: 'currency', 
      currency 
    }).format(amount);
  }
}
```

### 3.3 内置 Git 版本控制

这是 Appsmith 在低代码竞品中最独特的卖点：

- **应用即代码**：应用的完整定义（页面、Widget、查询、JS Object）可导出为 JSON，存储到 Git 仓库
- **分支工作流**：支持 feature 分支开发、Pull Request 审查、合并冲突解决
- **CICD 集成**：标准的 Git 操作（push/pull/merge）驱动 Deployment Pipeline，能自然融入 GitHub Actions、Jenkins、GitLab CI
- **环境隔离**：staging 和 production 通过不同分支管理，代码审查流程确保配置变更可控

### 3.4 查询编辑器

每个应用可定义多个可复用的查询（Query），它们是连接 Widget 和数据源的桥梁：

- **支持类型**：SQL（参数化查询）、REST API、GraphQL、Google Sheets、SaaS API
- **动态参数**：可通过 `{{ }}` 绑定 Widget 值——选择下拉框后自动重查
- **触发模式**：手动触发、页面加载时、Widget 事件触发、定时轮询
- **Transform**：原始查询结果可经过 JS 函数转换后再绑定到 Widget

### 3.5 权限体系 (RBAC)

| 层级 | 粒度 | 说明 |
|------|------|------|
| **工作区角色** | 用户 | Admin / Developer / App Viewer 三角色 |
| **应用权限** | 应用 | 控制用户能否访问某个应用 |
| **页面权限** | 页面 | 控制用户能否访问某些页面（Enterprise） |
| **Widget 权限** | 组件级 | 控制用户能否看到/操作特定 Widget（Enterprise） |

**不足之处**：权限体系不够精细。没有字段级权限，没有记录级权限（Record Rules），无法实现"同一个 Table，不同用户看到不同行"的多租户需求。这是与 AUDEBase D10-D11 决策有显著差距的地方。

### 3.6 Appsmith Agents（v2.1 新增）

2026 年发布的 Appsmith Agents 是 AI 功能的重要布局：

- **零配置 RAG**：无需微调模型或搭建复杂 RAG 管线，直接将企业私有数据上下文注入 AI 模型
- **持续上下文**：Agents 记住了用户所在的应用、页面和当前数据上下文
- **自然语言查询**：知识工作者可用自然语言提问并配置自动化，不需要理解底层数据库结构
- **定位**：面向销售、支持、客户成功、HR 等部门的知识工作者，让 AI 嵌入日常工作流

### 3.7 模板市场

Appsmith 提供社区贡献的模板市场：客户仪表板、工单跟踪系统、HR 员工门户、库存管理、安装面板等常见内部工具模板，一行代码不改即可快速启动。

---

## 4. 对比 ToolJet / Budibase

| 维度 | Appsmith | ToolJet | Budibase |
|------|:---:|:---:|:---:|
| **Stars** | ~40K | ~38K | ~25K |
| **许可** | Apache 2.0 | AGPLv3 | GPLv3 |
| **定位** | 开发者优先，JS 深度嵌入 | 平衡：可视化+代码+AI | No-Code 优先，自动化驱动 |
| **组件** | 45+ Widget | 60+ 组件 | ~40 组件 |
| **自定义代码** | JavaScript（核心） | JS + Python | 有限的脚本 |
| **AI 能力** | Appsmith Agents（初代） | AI App 生成 + Agents | 基础 AI |
| **工作流** | 无内建工作流引擎 | 内建 Workflow Engine | 基础自动化规则 |
| **Git 集成** | ✅ 原生深度集成 | ⚠️ 有限支持 | ❌ 不支持 |
| **内置数据库** | ❌ 需外部数据源 | ✅ ToolJet DB (PG) | ✅ BudibaseDB |
| **自托管限制** | 无限制 | 无限制 | ≤20 用户免费 |
| **企业治理** | 基础（RBAC + SSO） | 高级（审计日志、多环境） | 基础 |
| **多人协作** | ❌ 暂不支持 | ✅ 多人同时编辑 | ❌ 暂不支持 |
| **移动适配** | 手动适配 | 手动适配 | 自动响应式 |
| **适合团队** | JS 高手团队 | 混合技能+AI 需求 | 小团队/非技术用户 |

### 4.1 选择建议

```
你的团队写 JavaScript 像呼吸一样自然？
  └── YES → Appsmith（只有它能让你自由发挥）
  
你的团队混合技术/非技术人员？
  └── YES → ToolJet（可视化 + 代码双轨）
  
你需要零代码，非技术人员独立搭建？
  └── YES → Budibase（自动生成 CRUD 是最快路径）
  
Git 版本控制对你是硬性要求？
  └── YES → Appsmith（唯一定义了完整的 Git → CI/CD → Deploy 链路）
```

---

## 5. 部署与运维

### 5.1 部署模式

| 模式 | 适用场景 | 复杂度 |
|------|----------|--------|
| **Appsmith Cloud** | 概念验证、非敏感环境 | 零运维 |
| **Docker 单容器** | 小团队、快速启动 | 极低 |
| **Docker Compose（外部 DB）** | 生产环境、独立备份 | 低 |
| **Kubernetes** | 高可用、大规模 | 中 |
| **AWS AMI / Ansible / Heroku** | 特定云平台 | 中 |

### 5.2 资源建议

| 环境 | vCPU | 内存 | 磁盘 |
|------|------|------|------|
| 评估/PoC | 2 | 4 GB | 20 GB |
| 小型生产 | 2 | 8 GB | 50 GB |
| 中大型生产 | 4+ | 16+ GB | 100+ GB（SSD） |

**官方推荐**：生产环境始终保留至少 **10-15 GB 空闲磁盘空间**；升级前务必备份；Kubernetes 部署时将 MongoDB、Redis、PostgreSQL 分离为独立节点组。

### 5.3 版本升级策略

- **锁定版本标签**：永远使用 `appsmith/appsmith-ce:v2.1` 而非 `latest`
- **自动更新**：内置 watchtower 支持在维护窗口自动升级（可选开启）
- **升级频率建议**：每 2 周或跟随安全补丁发布
- **跨版升级**：部分版本有 checkpoint 要求（如必须先升级到 v1.9.2），需查阅升级指南

---

## 6. 市场与社区

### 6.1 商业模式

| 计划 | 价格 | 核心差异 |
|------|------|----------|
| **Community（自托管）** | 免费 | 无限用户、所有基础功能、Apache 2.0 |
| **Business（云+自托管）** | $15/用户/月 | SSO、RBAC、审计日志、优先支持 |
| **Enterprise（云+自托管）** | 定制报价 | 高级治理、SLA、专属支持、自定义品牌 |

### 6.2 社区生态

- **GitHub**：~40K stars, 4,600+ forks, 活跃的 issue 和 PR 流
- **Discord**：10,000+ 成员，社区问题响应活跃
- **官方支持**：付费订阅优先处理，社区版依赖 GitHub Issues + Discord
- **贡献者**：来自全球的开源贡献者，代码库模块化程度高，提交门槛相对较低

### 6.3 典型用户画像

- **后端/全栈工程师**（核心用户）：需要快速交付内部后台，不想手动写 CRUD React 页面
- **技术产品经理**：有 JavaScript 基础，能独立搭建 MVP 和原型
- **DevOps/SRE 团队**：搭建集群管理面板、监控仪表板、操作控制台
- **初创团队 CTO+Early Engineer**：一人兼顾前后端，用 Appsmith 覆盖内部工具需求

---

## 7. 历史教训

### 7.1 无工作流引擎

Appsmith 至今没有内建工作流引擎。虽然有定时触发和事件链，但没有"审批流"、"条件分支"、"多步骤自动化"等正式工作流能力。这使它在面对需要审批流程的企业场景时缺乏竞争力——用户需要把 Appsmith 作为前端 + 额外的后端工作流引擎（如 Temporal、Camunda）才能实现完整的业务流程自动化。

### 7.2 UI 定制封闭

Widget 体系是密封的——无法导入自定义 React 组件。当需求超出 45 个 Widget 覆盖范围时，选项只有 CSS hack 或 iframe 嵌入外部页面。这使其不适用于品牌一致性要求高、交互复杂度高的场景。

### 7.3 企业治理弱于 ToolJet

相比 ToolJet，Appsmith 在企业治理能力（审计日志粒度、多环境管理、细粒度权限）上相对薄弱。尤其是在多租户隔离方面——工作区级别的隔离无法满足"同一应用内不同角色看不同数据"的需求。

### 7.4 "胖容器"自托管的运营负担

虽然 `docker run` 启动极快，但生产环境中的 MongoDB 和 Redis 作为 sidecar 进程运行在同一个容器内：
- 备份需要兼顾 MongoDB dump + 文件系统快照
- MongoDB 存储增长可能导致容器磁盘满而无预警
- 不能独立扩展数据库层
- 容器崩溃时数据库和应用同时宕机

社区中大量"我的 Appsmith 突然起不来了"的问题根因都指向胖容器的磁盘/MongoDB 问题。

### 7.5 面向技术用户，排斥非技术人员

Appsmith 的 `{{ }}` 绑定和 JavaScript 是核心工作流。如果一个使用者不会写 JS——哪怕只是一个简单的 `.filter()`——她几乎无法独立完成任何稍微复杂的需求。这与 Budibase 的"自动生成 CRUD"形成鲜明对比。

### 7.6 大数据集性能退化

对于数千行数据集的 Table Widget，客户端绑定和渲染会导致明显卡顿。需要手动实现服务端分页（通过 API 的 LIMIT/OFFSET + 查询参数动态绑定），而这恰恰是低代码用户最不擅长的领域。

---

## 8. AUDEBase 可借鉴点

### 8.1 ⭐ Git 版本控制集成

这是 Appsmith 对 AUDEBase 最直接、最有价值的借鉴点。Appsmith 证明了：

- 低代码平台的配置是可以版本化的——页面、Widget、查询都能序列化为 JSON
- Git 分支工作流和 CI/CD 可以自然地延展到低代码应用
- 配置即代码（Configuration-as-Code）在内部工具领域完全可行

**AUDEBase 应用**：Phase 2 的 manifest.yaml + 插件配置可以考虑内置 Git 同步能力，让平台之上的业务应用也享受版本管理。

### 8.2 ⭐ 查询编辑器模式

Appsmith 的「可复用查询」抽象值得学习：
- 每个查询是独立实体，可被多个 Widget 复用
- 动态参数通过绑定表达式注入
- Transform 管道实现查询结果 → JS 转换 → Widget 渲染的数据流

**AUDEBase 应用**：Core 数据 API 代理（D12）之上，可以在插件层面提供类似的可复用查询抽象，减少插件开发者手动编写数据拉取逻辑。

### 8.3 ⭐ 响应式绑定引擎

Appsmith 的 `{{ }}` Mustache 绑定 + Web Worker 求值沙箱，实现了声明式 UI 更新而无需手动写 `useEffect` 依赖追踪。

**AUDEBase 应用**：Phase 2 的 Schema→UI 映射器（D7）可以借鉴这个数据绑定模型，让 Schema 字段和 UI 组件之间的数据流自动化。

### 8.4 模板市场

Appsmith 的模板市场让新用户可以 30 分钟出成果，降低了"冷启动"成本。

**AUDEBase 应用**：插件市场（Phase 2）可增加"从模板创建应用"的功能，加速企业应用的初始构建。

### 8.5 开发者体验（DX）

Appsmith 对开发者体验的重视（CLI 工具、调试控制台、JS 代码补全、错误提示的行号定位）是开源低代码平台中少有的。

**AUDEBase 应用**：插件 SDK 应该提供同等级别的 DX——错误栈清晰、CLI 创建新插件骨架、本地开发热更新。

---

## 9. 关键数据

| 维度 | 数据 |
|------|------|
| **仓库** | [github.com/appsmithorg/appsmith](https://github.com/appsmithorg/appsmith) |
| **Stars** | ~40,000 (2026-07) |
| **Forks** | ~4,600 |
| **Open Issues** | ~4,400 |
| **代码语言** | Java, TypeScript, JavaScript |
| **前端** | React + TypeScript |
| **后端** | Java (Spring Framework) |
| **数据库** | MongoDB (元数据) + Redis (缓存) |
| **许可** | Apache 2.0 |
| **当前版本** | v2.1 (2026-05-29) |
| **首次提交** | 2020-06-30 |
| **Widget 数量** | 45+ |
| **数据源连接器** | 25+ (PostgreSQL, MySQL, MongoDB, REST, GraphQL, Google Sheets, Airtable 等) |
| **定价** | 社区免费 + Business $15/用户/月 + Enterprise 定制 |
| **部署** | Docker 单容器 / Kubernetes / AWS AMI / Ansible / DigitalOcean / Heroku |

---

## 10. AUDEBase 对比总结

| 维度 | Appsmith | AUDEBase (规划) |
|------|----------|-----------------|
| **定位** | 开发者优先的低代码内部工具 | 企业应用开发平台（微内核 + 插件） |
| **扩展模型** | Widget 库（封闭） + JS 脚本 | 插件热插拔 + Schema→UI 映射 |
| **权限模型** | RBAC（工作区/应用/页面/Widget） | RBAC + Record Rules + 字段级权限 (D10/D11) |
| **多租户** | 工作区隔离（单层） | 数据库级隔离 + 四阶段演进 (D4) |
| **工作流** | ❌ 无 | ✅ Phase 4 (Saga + 工作流引擎, D13) |
| **UI 扩展** | Widget 框架内（封闭） | Slot + Manifest 注册 + 自定义 React 组件 (D23) |
| **版本控制** | ✅ Git Sync 原生 | 🔲 尚未规划（可从 Appsmith 借鉴） |
| **前端技术栈** | React + TypeScript | React 19 + Ant Design 5 (D6) |
| **后端技术栈** | Java (Spring) | Node.js + TypeScript + Fastify (D5) |
| **数据库** | MongoDB | PostgreSQL + Drizzle ORM (D9) |
| **插件隔离** | N/A（单体架构） | 四层信任分组：SYSTEM→Domain→Isolated→Container (D1.1) |
| **AI 能力** | Appsmith Agents（v2.1） | 🔲 尚未规划 |
| **许可** | Apache 2.0 | Apache 2.0 |

---

*本文档基于 Appsmith v2.1 及公开资料编写。Appsmith 的产品形态、定价和架构可能随时间变化。*
