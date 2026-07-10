# Corteza — 产品画像

> 分析日期: 2026-07-10 | 分类: 插件化应用平台 | AUDEBase 相关度: ⭐⭐⭐⭐

## 1. 产品概述

### 1.1 一句话定位

**开源 Salesforce 替代品，企业级低代码应用平台。** Corteza 提供 CRM、业务流程管理和结构化数据应用的快速构建与迭代能力，定位为"100% 免费、开源、标准化"的企业数字化平台。

### 1.2 基本信息

| 维度 | 详情 |
|------|------|
| 维护方 | Planet Crust（商业公司）+ Commons Conservancy Foundation（荷兰 NGO 治理） |
| 许可 | Apache 2.0 |
| 首次发布 | 2019 年 |
| 最新版本 | 2024.9（2024 年 9 月发布，2024.9.6 补丁版于 2025 年底发布） |
| 仓库 | `github.com/cortezaproject/corteza` |
| 官网 | `cortezaproject.org` |
| 文档 | `docs.cortezaproject.org`（版本化文档，12 个历史版本） |

### 1.3 治理模型

Corteza 拥有独特的所有权结构：
- **Commons Conservancy Foundation**（荷兰公益基金会）持有代码版权，确保项目不被收购或关闭
- **Planet Crust** 承担几乎全部开发工作，销售 Corteza 托管实例和专业服务
- 这种安排保证项目长期存在，但方向主要由 Planet Crust 企业客户需求驱动

### 1.4 市场定位

Corteza 对标 Salesforce，面向具备自建技术能力的中型企业。核心卖点：
- Apache 2.0 许可，零许可费用
- 自托管（self-hosted），数据完全自有
- Salesforce 式数据模型（对象-字段-关系模式）
- 低代码 + 专业代码双模式开发

---

## 2. 技术架构深度分析

### 2.1 整体架构

Corteza 采用 **微服务式单体（Modular Monolith）** 架构。核心是 Go 编写的 `corteza-server`，内部按功能域划分为独立包（`system`、`compose`、`automation`、`federation`），共享同一进程空间和数据库连接。

```
┌────────────────────────────────────────────────────┐
│                    Web Applications                 │
│  ┌──────────┐ ┌──────────┐ ┌─────────┐ ┌────────┐ │
│  │ Compose  │ │   One    │ │  Admin  │ │  CRM   │ │
│  └──────────┘ └──────────┘ └─────────┘ └────────┘ │
├────────────────────────────────────────────────────┤
│              REST API + WebSocket                   │
├────────────────────────────────────────────────────┤
│                corteza-server (Go)                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐        │
│  │  system  │ │ compose  │ │  automation   │        │
│  │(RBAC/用户)│ │(低代码)   │ │(事件总线)     │        │
│  └──────────┘ └──────────┘ └──────────────┘        │
│  ┌──────────┐ ┌──────────┐                         │
│  │federation│ │  store   │                         │
│  │(联邦共享)│ │(数据抽象) │                         │
│  └──────────┘ └──────────┘                         │
├────────────────────────────────────────────────────┤
│           gRPC (仅 Corredor)                        │
├────────────────────────────────────────────────────┤
│  ┌────────────────┐  ┌──────────────────────────┐  │
│  │    Corredor    │  │       Discovery           │  │
│  │ (JS 自动化执行) │  │      (搜索引擎)           │  │
│  └────────────────┘  └──────────────────────────┘  │
├────────────────────────────────────────────────────┤
│       PostgreSQL / MySQL    │     MinIO (S3)       │
└────────────────────────────────────────────────────┘
```

### 2.2 后端：Go (Golang)

**路由框架**: `go-chi`（轻量级 HTTP 路由器）
**Go 版本**: 1.24.1（2024.9 版本要求）
**通信协议**:
- Web 应用 ↔ Server: REST API（JSON）+ WebSocket（实时推送）
- Server ↔ Corredor: gRPC（内部服务通信）
- Server ↔ Discovery: 独立 `corteza-server-discovery` 接口

**启动过程**（四级初始化）：

1. **Base（基础层）**: 日志系统（支持 human-readable 和 JSON 格式）、健康检查（含 scheduler/email/Corredor）、Sentry 错误报告、SMTP 邮件服务、监控（基础资源使用率）、调度器（定时自动化）、Corredor 客户端
2. **Database（数据库层）**: 建立数据库连接 → 执行迁移（schema migration）确保数据库结构匹配当前版本
3. **Initialize（初始化层）**: 初始化全部服务、RBAC 规则引擎、资源翻译、Federation（如启用）
4. **Provision（供给层）**: 从 provision 文件导入初始资源（用户、角色、Namespace 等）

**项目结构**:
- `app/` — 编排整个初始化流程（`.env` 解析、store 配置、API 初始化）
- `system/` — 核心系统功能（用户、角色、模板管理）
- `compose/` — 低代码功能（Namespace、Module、Record 管理）
- `automation/` — 自动化系统（事件总线、触发器注册）
- `federation/` — 联邦数据共享
- `store/` — 数据访问抽象层（数据库无关接口 + 数据库特定驱动）
- `pkg/` — 通用工具包
- `webapp/` — 内嵌 Web 应用（`make watch` 自动重载）
- `docs/` — OpenAPI 3 文档（openapi3-converter 工具生成）

### 2.3 前端：Vue.js

Corteza 前端采用 Vue.js 生态，以多个独立 Web 应用形式存在：

| Web 应用 | 功能 | 仓库 |
|----------|------|------|
| **Compose** | 低代码应用构建器（核心） | `corteza-webapp-compose`（99★） |
| **One** | 统一工作空间（主页聚合） | `corteza-webapp-one`（37★） |
| **Admin** | 管理后台（系统配置） | `corteza-webapp-admin`（29★） |
| **Messaging** | 团队协作/即时通讯 | 内置于 monorepo |
| **CRM Suite** | 预置 CRM 应用（销售管道、客户管理） | 内置于 monorepo |
| **Case Management** | 工单/案件管理 | 内置于 monorepo |

**前端组件库**:
- `corteza-vue` — 自建 Vue 组件库（非第三方 UI 框架）
- `corteza-js` — JavaScript SDK / API 客户端（NPM 包）
- 不与任何主流 UI 框架（Element Plus、Vuetify、Ant Design Vue）耦合

**架构特点**:
- 多 SPA 模式（每个应用独立打包），非微前端
- Server 可通过 `/webapp` 目录直接内嵌并 serving 前端静态文件
- 前端通过 REST API 和 WebSocket 与后端通信

### 2.4 数据存储

**关系数据库**: PostgreSQL（主要支持）、MySQL（支持）
- 数据访问通过 `store/` 抽象层，封装统一的 CRUD 接口
- `store/rdbms/` 包含数据库驱动特定逻辑（数据编码、类型转换）
- `store/rdbms/generic_upgrades.go` 管理 schema 迁移

**二进制/文件存储**: MinIO（兼容 S3）
- 支持本地存储和云存储（AWS S3、GCS 等兼容服务）
- 通过 MinIO SDK 统一操作

### 2.5 部署与运维

- **Docker**: 官方 Docker 镜像，通过 `corteza-docker` 仓库管理构建脚本
- **环境配置**: `.env` 文件驱动（环境变量注入）
- **网络拓扑**: 建议双网隔离（内部网络隐藏数据库等服务，外部网络暴露 Web 应用）
- **健康检查**: 内置 scheduler、email、Corredor 连通性检查
- **监控**: 基础资源使用率日志（primitive resource usage logging）
- **错误报告**: Sentry 集成

---

## 3. 低代码平台详解

### 3.1 概念模型

Corteza 的低代码体系围绕以下几个核心概念构建：

```
Namespace (应用容器)
  ├── Module (数据模型)
  │     ├── Module Field (字段定义)
  │     ├── Record Page (记录页 — 查看/创建/编辑)
  │     └── Record (数据记录)
  ├── Page (页面布局)
  │     ├── Page Block (页面块 — 可拖拽组件)
  │     └── Page Layout (页面布局 — 角色级视图切换)
  ├── Chart (数据可视化)
  └── Navigation (导航树 — 基于 Page Tree 自动生成)
```

### 3.2 Namespace — 应用容器

Namespace 是最高层级抽象，承载一个完整应用的全部配置和数据：

- 每个 Namespace 是一个隔离单元，**无法直接访问其他 Namespace 的数据**
- 跨 Namespace 数据交互需通过 Automation（编程式实现）
- 创建流程：Low Code 应用 → 命名空间列表 → 新建/编辑
- 每个 Namespace 包含独立的模块、页面、图表和权限配置

**权限管理**: Namespace 级别可配置全局权限

### 3.3 Module — 数据模型定义

Module 定义了数据的"形状"（shape），类似于数据库表定义。

**创建流程**:
- 新 Namespace 入门向导 → "Create Module"
- 已有 Namespace → Admin Panel → Modules → "New Module"

**Module 配置项**:

| 配置类别 | 说明 |
|----------|------|
| **元数据** | 名称、标识符、描述 |
| **Module Fields** | 字段类型定义（见下节） |
| **DAL 连接参数** | 记录存储后端配置 + 隐私设置 |
| **重复检测** | 基于字段的重复记录检测规则 |
| **记录版本** | 记录修订历史（record revisions） |
| **权限** | Module 级 RBAC 权限 |
| **字段权限** | 字段级访问控制 |

### 3.4 Module Field — 字段类型

Module Field 定义每条记录的字段。Corteza 支持丰富的字段类型（基于 compose 配置文档推断）：

**基础类型**:
- 字符串（String）、多行文本（Text）、富文本（Rich Text）
- 数字（Integer、Float、Decimal）
- 布尔值（Boolean）
- 日期时间（Date、Time、DateTime）
- 电子邮件（Email）、URL
- 枚举（Select / Dropdown）

**关系类型**:
- Record（关联记录 — 外键关系）
- User（用户引用）
- File（文件上传，指向 MinIO 存储）

**系统字段**:
- Record ID、创建时间、更新时间、创建者、更新者
- 软删除标记（deleted_at）

### 3.5 Page — 页面系统

Corteza 页面系统包含三种核心类型：

#### 3.5.1 Record Page（记录页）

用于展示、创建和编辑单条记录。**如果 Module 未定义 Record Page，无法通过 UI 创建或更新记录**——但可通过 API、内联记录列表或 Automation 操作数据。

- 与指定 Module 绑定
- 可配置 Page Blocks 响应当前查看记录（动态资源过滤）
- 支持 **Page Layouts**：按角色切换不同页面布局（如管理员看到完整表单、普通用户看到简化版）

创建方式：Module 编辑器 → "Create record page"

#### 3.5.2 List Page（列表页）

用于展示记录的列表视图（如表格），支持排序、过滤、分页。

#### 3.5.3 Page Builder（页面构建器）

**12 列网格系统** + 拖拽式 Page Block 编排：
- Page Block 类型：字段显示、关联记录列表、图表嵌入、自定义组件
- Block 操作：放大（expand）、刷新（refresh）、条件过滤（filter）

### 3.6 Chart — 数据可视化

Chart 绑定到特定 Module，聚合和转换 Module 记录数据后可视化渲染。

**三类图表**:

| 类别 | 支持图表 |
|------|----------|
| **Generic（通用）** | 折线图、柱状图、饼图、环形图 |
| **Funnel（漏斗）** | 漏斗图（转化分析） |
| **Gauge（仪表）** | 仪表盘图（KPI 指标） |

**限制**: 一个 Chart 只能展示一个 Module 的数据。

### 3.7 导航系统

基于 Page Tree 自动生成导航菜单，无需手动配置菜单结构。页面注册后自动出现在导航中。

---

## 4. 自动化系统

### 4.1 双轨自动化

Corteza 提供两种自动化定义方式：

| 维度 | Workflow（推荐） | Automation Script |
|------|-----------------|-------------------|
| **定义方式** | 简化 BPMN 图（可视化配置） | JavaScript 代码 |
| **门槛** | 低（业务人员可用） | 高（需要编程知识） |
| **适用场景** | 标准业务流程 | 复杂/Workflow 不支持的操作 |
| **可维护性** | 高（可视化、自文档化） | 中（需代码审查） |
| **启用状态** | 默认启用 | 默认禁用（需 `CORREDOR_ENABLED=true`） |

**混合模式**: Workflow 可以调用 Automation Script，实现"配置为主、代码兜底"的灵活组合。

### 4.2 自动化触发器

触发器（Trigger）告诉 Corteza 何时执行自动化。系统启动或配置变更时，触发器注册到 **事件总线（Event Bus）**。

| 触发器类型 | 说明 |
|-----------|------|
| **资源事件** | before/after Create/Update/Delete（Module 记录级） |
| **定时执行** | 基于 scheduler 的定时触发（deferred trigger） |
| **Webhook** | 外部 HTTP 请求触发（Sink Route） |
| **邮件触发** | 收到邮件时触发 |
| **手动触发** | 用户显式触发（Explicit） — 按钮/菜单绑定 |

### 4.3 Workflow 详解

**核心概念**:

**步骤类型（Step Types）**:
- **Function（函数步骤）**: 执行业务逻辑（内置函数 + 可调用 Automation Script）
- **Gateway（网关）**: 条件分支控制

**Gateway 三步态**:

| 网关类型 | 行为 |
|----------|------|
| **Exclusive（排他）** | 定义多个路径，仅执行第一个满足条件的路径（if-else） |
| **Inclusive（包容）** | 执行所有满足条件的路径（多路并行） |
| **Fork（并行分支）** | 无条件并行执行所有路径 |

**注意事项**:
- Gateway 内不支持 break/continue 步骤
- Gateway 嵌套在 Iterator 中时，break/continue 影响 Iterator 而非 Gateway

**Workflow 其他能力**:
- **Iterator（迭代器）**: 遍历记录集、对每条记录执行操作
- **Delay（延迟）**: 暂停执行指定时间
- **Error Handling**: 定义异常处理路径

### 4.4 Automation Script 详解

Automation Script 是一段 JavaScript 代码，运行于 Corredor 隔离执行器中。

**脚本结构**:

```javascript
export default {
  // 触发器定义
  trigger (t) {
    // t.on('resource:create', 'module:account')
    // t.on('interval', '0 */6 * * *')
    // t.on('manual')
  },

  // 安全上下文（仅 Explicit 触发器）
  security: {
    allow: ['administrator', 'superuser'],
    // deny: ['client', 'lead'],
  },

  // 执行体
  exec (args, ctx) {
    // args: 触发器传递的参数
    // ctx: 上下文对象（API、用户、权限等）
  }
}
```

**安全上下文**: Explicit 触发器可配置 `allow`/`deny` 角色列表，限制谁能手动触发脚本。

### 4.5 Corredor 隔离执行器

Corredor 是 Corteza 的自动化执行引擎，**独立于主 Server 进程运行**：

- **独立仓库**: `corteza-server-corredor`
- **通信方式**: gRPC（Server ↔ Corredor）
- **隔离设计**: JavaScript 代码在独立进程中执行，崩溃不影响主服务
- **生产模式**: 默认不监听文件变更，需重启才能加载新脚本
- **开发模式**: 可设置 `CORREDOR_EXT_SERVER_SCRIPTS_WATCH=true` 和 `CORREDOR_EXT_CLIENT_SCRIPTS_WATCH=true` 监听文件变更

**执行流程**:
```
1. 用户操作/定时触发 → 2. 事件总线接收 → 3. 匹配触发器规则
  → 4. Server 通过 gRPC 调用 Corredor → 5. Corredor 执行 JS
  → 6. 结果返回 Server → 7. Server 更新数据/通知前端
```

---

## 5. 安全与合规

### 5.1 认证体系

Corteza 支持企业级多协议认证：

| 协议 | 用途 |
|------|------|
| **OpenID Connect (OIDC)** | 现代单点登录标准 |
| **OAuth 2.0** | 第三方应用授权 |
| **SAML** | 企业 SSO（如 Azure AD、Okta） |
| **SCIM** | 跨域身份管理（用户/组自动同步） |
| **LDAP** | 企业目录服务 |
| **MFA** | 多因素认证 |

**Auth Client**: Corteza 可作为 OAuth2/OIDC Provider，为第三方应用提供认证服务。在 Admin → System → Auth Clients 中管理。

### 5.2 RBAC 权限模型

Corteza 实现完整的 **RBAC（基于角色的访问控制）**：

**核心概念**:
- **User（用户）**: 系统使用者
- **Role（角色）**: 权限集合
- **Resource（资源）**: 受保护对象（Namespace、Module、Record、Page、Chart 等）
- **Operation（操作）**: 读、写、删除、执行等

**角色类型**:
- 标准角色：常规权限分配
- **Bypass 角色**: 超级管理员角色，绕过所有权限检查。Bypass 角色成员**仅由自己管理**。Bypass 角色不能同时作为其他类型角色，系统会在启动时校验

**权限范围**（从粗到细）:
1. **全局权限**: 系统级功能访问
2. **Namespace 权限**: 应用级隔离
3. **Module 权限**: 数据模型级访问
4. **Record 权限**: 记录级访问（支持特定记录的权限控制，但某些字段的访问控制尚未完全实现）
5. **Field 权限**: 字段级读写控制（Module → Field Permissions 按钮）

**用户组（2024.9 新增）**: 实现层级访问控制（hierarchical access）

### 5.3 审计与合规

#### Data Privacy Console（数据隐私控制台）

Corteza 内置专用于 GDPR 合规的数据隐私管理：

- **字段级敏感数据标记**: 标记哪些 Module Field 包含 PII（个人身份信息）或敏感数据
- **数据删除请求**: 响应 GDPR "被遗忘权"请求
- **数据修改请求**: 响应数据纠正请求
- **数据下载请求**: 响应数据可携权请求（数据导出）

**工作流**: 管理员处理隐私请求 → 系统自动扫描关联记录 → 执行合规操作

#### 其他安全能力

- **Federation RBAC**: 联邦数据共享中的权限控制（目标节点只能访问授权模块/字段）
- **请求验证**: Integration Gateway 的 prefilters 用于请求前置校验
- **速率限制**: Integration Gateway 内置支持
- **WCAG 2.1**: 前端可访问性合规（为公共部门部署提供基础）

---

## 6. 联邦架构（Federation）

### 6.1 概述

Corteza Federation 实现**跨 Corteza 实例的数据共享**，是 Corteza 最具差异化能力的功能之一。

### 6.2 核心概念

| 概念 | 说明 |
|------|------|
| **Node（节点）** | 一个 Corteza 实例 |
| **Node Pair（节点对）** | 两个已配对的实例，建立信任关系 |
| **Origin Node（源节点）** | 提供数据的一方 |
| **Destination Node（目标节点）** | 消费数据的一方 |

### 6.3 配对流程

1. 两个实例的管理员发起配对请求
2. 交换并验证配对信息
3. 建立加密信任通道

### 6.4 数据同步

#### 源节点：Expose（暴露数据）

在源节点上，管理员精确控制目标节点能访问什么：

- **选择目标节点**: 从已配对节点中选择
- **选择 Module**: 指定要共享的数据模型
- **选择 Field**: 字段级精确控制（仅暴露必要字段）
- **复制设置**: 可将一个节点的暴露配置快速复制到另一个目标节点

#### 目标节点：接收数据

- 共享的 Module 由 Federation 系统自动创建
- 自动创建的 Module **不能手动删除或修改**
- 支持定期同步或事件驱动同步

### 6.5 AUDEBase 参考价值

Federation 模式对 AUDEBase 的多租户/多云部署极具参考意义：
- 字段级共享控制 → 可应用于多租户间的受控数据交换
- 节点对配对 → 可应用于跨数据中心/跨云的互联架构
- 自动创建共享模型 → 可参考其声明式同步机制

---

## 7. Integration Gateway（集成网关）

### 7.1 功能定位

Integration Gateway 是对 Sink Route（Webhook 端点）的增强替代方案，允许定义自定义 HTTP 端点。

### 7.2 核心能力

- **自定义端点**: 定义任意路径的 HTTP 端点
- **自定义认证**: 为端点绑定独立的认证方法
- **请求验证（Prefilters）**: 前置过滤器验证请求合法性
- **速率限制**: 端点级流量控制
- **处理逻辑**: 内置操作 + JavaScript 代码片段 + Workflow 调用

### 7.3 流程

```
HTTP Request → Prefilter（验证） → Auth（认证）
  → Route Handler（路由处理）
    → JavaScript / Workflow / 内置操作
  → Response
```

**已知限制**: 目前不能在 Prefilter 中使用内置认证设施（未来计划添加）。

---

## 8. Discovery（搜索引擎）

### 8.1 功能

Corteza Discovery 为平台数据提供**全文搜索引擎**：

- 跨 Namespace、跨 Module 的统一搜索界面
- 支持地理元数据的地理可视化
- 通过 `corteza-server-discovery` 独立接口与后端通信

### 8.2 架构

- Discovery 作为一个独立组件运行
- 与主 Server 通过专用接口通信
- 搜索索引独立维护

---

## 9. AI 能力 — Aire

### 9.1 Aire AI Application Generator

Corteza 的 AI 功能以 **Aire** 品牌独立存在：

**核心能力**:
- **自然语言 → 应用**: 用户用自然语言描述需求 → AI 自动生成：
  - 数据模型（Module + Field + 关系）
  - 页面布局（Record Page + List Page）
  - 字段关联关系
- **源码可导出**: 生成的代码可以导出，不被 AI 服务锁定
- **非黑盒**: AI 生成物是标准 Corteza 配置，用户可手动修改

### 9.2 AUDEBase 参考价值

Aire 的"自然语言 → 可导出标准配置"模式值得学习——既利用 AI 加速开发，又不将用户锁定在 AI 服务上。

---

## 10. Reporting（报表系统）

### 10.1 报表能力

Corteza 报表系统提供基于 Module 数据的数据聚合与展示：

- 基于 Module 记录的数据源
- 聚合函数（SUM、AVG、COUNT、MIN、MAX）
- 分组和过滤
- 导出（CSV、Excel 等格式）

### 10.2 与 Chart 的关系

- Chart 是数据可视化（图表渲染）
- Report 是数据聚合（数据准备）
- 两者可组合使用：Report 提供数据源 → Chart 渲染图表

---

## 11. 国际化（i18n）

Corteza 支持多语言，由 `system` 包中的资源翻译（resource translations）功能支持：

- 平台 UI 支持多语言
- 低代码应用的字段标签/页面文本支持翻译
- 翻译资源通过 provision 文件导入

---

## 12. 市场与社区

### 12.1 社区规模

| 指标 | 数值 | 评估 |
|------|------|------|
| GitHub Stars | ~2,098（corteza monorepo） | 较小，远低于 SuiteCRM(~4.5K)、Twenty CRM(~20K+) |
| GitHub Forks | ~392 | 活跃但有限 |
| 关注者 | 274 | 专业用户群 |
| 公共仓库 | 30 | 多仓库拆分架构 |
| 文档 | `corteza-docs`（129★） | 版本化文档体系完善 |

### 12.2 社区特征

- **小而专业**: 企业用户为主，非大众化社区
- **单一维护者依赖**: Planet Crust 是绝对主导贡献者
- **论坛活跃**: Planet Crust 论坛是主要交流平台
- **Stack Overflow 弱覆盖**: 遇到问题时社区解答资源有限

### 12.3 版本发布

- **发布周期**: 年度 2 次大版本（.3 和 .9），补丁版本按需
- **历史版本**: 从 2019.12 到 2024.9 共 12 个文档化版本
- **增量更新为主**: 近年发布以补丁和增量改进为主，少有重大功能跃迁

### 12.4 商业模式

Planet Crust 的商业模式是典型的 **Open Core + 企业服务**：
- Corteza 完全免费开源（Apache 2.0）
- Planet Crust 销售托管实例（Corteza Cloud）、专业服务、定制开发
- 企业客户需求驱动产品路线图

---

## 13. 历史教训与已知问题

### 13.1 Vue.js 2 → 3 迁移

Corteza 前端基于 Vue.js，Vue 2 → 3 的生态系统断裂影响了其迁移速度：
- 前端组件库 `corteza-vue` 为自建库，迁移需全部重写
- Vue 社区生态在 Vue 2 和 Vue 3 之间的长期割裂拖慢了依赖升级
- Corteza 的迁移速度慢于主流项目，可能导致部分用户转向更活跃的替代方案

### 13.2 文档碎片化

- 从 2020.9 到 2024.9 之间，12 个版本各自保持独立文档
- 早期版本（2020.9、2020.12）的文档结构与后期差异较大
- 部分页面 404（如架构文档中某些内部链接已失效）
- 版本间缺乏清晰的迁移指南

### 13.3 社区生态薄弱

- **GitHub Stars 仅 ~2,098**: 对于"Salesforce 替代品"定位严重不足
- **第三方集成极少**: 社区贡献的插件/连接器几乎为零
- **招聘困难**: Go + Vue.js 双语言要求提高团队组建门槛
- **知识共享有限**: 独立博客、教程、案例研究资源稀缺
- **生态系统 vs 竞品**:
  - SuiteCRM: ~4,500 stars，PHP 生态，社区活跃
  - Twenty CRM: ~20,000+ stars，TypeScript 全栈，发展迅猛
  - NocoBase: ~15,000+ stars，Node.js + React，插件生态蓬勃

### 13.4 单点维护风险

- Planet Crust 是几乎唯一的代码贡献者
- 如果 Planet Crust 战略转向，发布节奏可能受影响
- Commons Conservancy Foundation 保障代码不被"关停"，但无法保障开发速度

### 13.5 Go 后端招聘困境

- 中国市场 Go 开发者集中于云原生/基础设施领域，低代码平台领域极少
- Boss 直聘上 Go 开发者约 100 人 vs Java 的 10,000+ 人（低代码赛道）
- 对国内团队组建形成事实壁垒

---

## 14. AUDEBase 可借鉴点

### 14.1 应当借鉴 ✅

| 借鉴点 | 说明 | AUDEBase 应用 |
|--------|------|--------------|
| **Federation 联邦架构** | 跨实例数据共享 + 字段级精确控制 + 配对信任模型 | 多租户/多云部署架构参考 |
| **Corredor 隔离执行器** | 自动化脚本在独立进程中执行（gRPC 通信，崩溃不影响主服务） | 四层信任分组（D1.1）中 Isolated/Container 层的隔离设计参考 |
| **Data Privacy Console** | 字段级敏感数据标记 + GDPR 合规请求处理（删除/修改/下载一体化工作流） | D11 字段级权限 + 数据合规模块设计 |
| **低代码配置模式** | Namespace → Module → Field → Page → Chart 声明式层级 | Schema Engine（D3）参考 |
| **Page Builder 12 列网格** | 12 列网格 + Page Block 拖拽 + 条件过滤/刷新/放大 | Phase 2+ UI 布局引擎 |
| **自动化触发器分类** | 事件/定时/Webhook/邮件/手动 — 五种触发类型统一事件总线 | 插件生命周期钩子设计（D1.4） |
| **Aire AI 生成器** | 自然语言→应用 + 源码可导出（不被锁定） | AI 辅助应用生成功能设计 |
| **启动四级初始化** | Base → Database → Initialize → Provision 分层启动 | Core 启动流程设计 |
| **双轨自动化** | Workflow（BPMN 可视化）+ Script（JS 代码）可混合 | Workflow Engine（Phase 4）设计 |
| **Integration Gateway** | 统一自定义端点 + prefilters + 速率限制 | API 网关设计 |

### 14.2 不应当借鉴 ❌

| 反模式 | 说明 |
|--------|------|
| **多 SPA 架构** | 前端拆分为 6 个独立 Web 应用，增加构建复杂度、用户体验割裂 |
| **自建 UI 组件库** | `corteza-vue` 自建而非复用生态组件，维护成本高、迭代慢 |
| **Go + Vue.js 多语言** | 后端 Go + 前端 Vue.js 增加团队技能要求 |
| **单商业实体依赖** | Planet Crust 主导开发，路线图受单一商业实体控制 |
| **模块级隔离过弱** | Namespace 间无法直接访问但同进程运行，隔离粒度不够 |

### 14.3 差异化定位

| 维度 | Corteza | AUDEBase |
|------|---------|----------|
| **后端语言** | Go（高性能、国内招聘难） | TypeScript/Node.js（全栈统一、招聘容易） |
| **前端框架** | Vue.js（自建组件库） | React 19 + Ant Design 5（生态成熟、ProLayout/ProTable 开箱即用） |
| **架构模式** | 微服务式单体 | 微内核 + 插件热插拔（D1 决策） |
| **隔离粒度** | Corredor 单层隔离 | 四层信任分组（D1.1 决策：SYSTEM/Domain/Isolated/Container） |
| **数据共享** | Federation（跨实例） | 多租户数据库隔离（D4 决策：tenant_id → Schema → Database-per-tenant） |
| **UI 布局** | 自建 Page Builder | ProLayout 骨架 + Schema 驱动 UI（D6/D7/D16/D23 决策） |
| **权限模型** | RBAC（Record 级部分支持） | Record Rules（D10）+ 字段级权限（D11）+ ACLProvider（D19） |
| **自动化** | 双轨（Workflow + Script） | Saga 补偿事务（D13）+ Workflow Engine（Phase 4） |
| **许可** | Apache 2.0 | 同上（开箱对标） |

---

## 15. 关键数据速查

| 维度 | 数据 |
|------|------|
| **仓库** | `github.com/cortezaproject/corteza` |
| **Stars** | ~2,098 |
| **Forks** | ~392 |
| **关注者** | 274 |
| **公共仓库** | 30 |
| **后端语言** | Go（1.24.1） |
| **前端语言** | JavaScript / Vue.js |
| **数据库** | PostgreSQL（主）、MySQL |
| **对象存储** | MinIO（S3 兼容） |
| **许可** | Apache 2.0 |
| **维护方** | Planet Crust + Commons Conservancy Foundation |
| **首次发布** | 2019 年 |
| **最新版本** | 2024.9.6 |
| **版本历史** | 12 个文档化版本（2019.12 → 2024.9） |
| **部署方式** | Docker（官方镜像）、源码编译 |
| **核心组件** | Server、Corredor、Discovery、Federation |
| **Web 应用** | Compose、One、Admin、Messaging、CRM Suite、Case Management |
| **认证** | OIDC、OAuth 2.0、SAML、SCIM、LDAP、MFA |
| **安全** | RBAC、MFA、Data Privacy Console、WCAG 2.1 |
| **竞品** | Salesforce（商业）、SuiteCRM（开源）、Twenty CRM（开源）、NocoBase（开源） |

---

## 16. 总结评价

### 优势

1. **Apache 2.0 无顾虑**: 真正自由的开源许可，无 copyleft 限制
2. **Foundation 治理**: Commons Conservancy 持有版权，保障项目不被收购/关闭
3. **联邦架构**: 跨实例数据共享是其他低代码平台少有的能力
4. **数据隐私内置**: GDPR 合规工具从 Day 1 内建，非事后补救
5. **双轨自动化**: Workflow + Script 覆盖从业务人员到开发者的全谱需求
6. **隔离执行器**: Corredor 的进程隔离设计体现了对安全性的重视

### 劣势

1. **社区过小**: ~2,098 stars 在前端和后端开发圈都缺乏影响力
2. **生态薄弱**: 几乎没有第三方插件、集成或社区贡献的模块
3. **单点维护风险**: Planet Crust 是绝对主导的维护方
4. **多语言门槛**: Go + Vue.js 双语言增加团队组建难度
5. **发布节奏缓慢**: 近年以增量更新为主，少有重大创新
6. **Vue 迁移拖累**: Vue 2 → 3 迁移缓慢，影响技术栈竞争力

### 对 AUDEBase 的启示

Corteza 证明了一个重要观点：**架构设计上的远见（Federation、Corredor 隔离、Data Privacy Console）可以在社区规模有限的情况下仍然维持产品竞争力。** AUDEBase 应在 Phase 0 架构阶段将这些设计内化到自身架构中，而非等待后期补课。

同时，Corteza 的教训也很清晰：**技术栈选择直接影响社区规模和招募能力。** AUDEBase 的 TypeScript 全栈策略（D5/D6 决策）通过统一前后端语言、复用最大的 npm 生态、降低贡献门槛，为构建更大社区奠定了基础。
