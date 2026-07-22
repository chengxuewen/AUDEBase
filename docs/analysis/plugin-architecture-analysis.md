# AUDEBase 插件架构分析

**版本**: 1.0 | **日期**: 2026-07-09 | **状态**: ⚠️ 搁置（2026-07-22 D25 战略转型 — 四层信任分组需 fork NocoBase PluginManager 核心，无进程隔离架构可承载。本文档作为设计参考保留。）

## 〇、当前架构定位

AUDEBase 借鉴 NocoBase 的 manifest 声明系统、Schema Engine 动态模型和插件市场理念，
但**明确拒绝其零隔离单进程模型**。

AUDEBase 采用 **「接口先行 + 渐进式隔离」** 策略：
- **Phase 1（inline）**：插件在 Core 进程内通过 `PluginHost` 接口抽象运行，
  接口语义已预留异步/序列化/错误传播能力
- **Phase 2+（process）**：每个插件套件运行在独立 `ProcessPluginHost` 子进程中，
  通过 JSON-RPC stdin/stdout 通信
- 同一套 `PluginHost` 接口同时支持 inline 和 process 两种实现

这意味着：开发者在 Phase 1 编写的插件代码，升级到 Phase 2 时**无需修改业务逻辑**，
仅需更改 manifest 中的 `runtime.mode` 字段。
## 一、问题陈述

AUDEBase 是一个面向企业的应用开发平台，对标 Odoo/NocoBase/云表。每个业务系统（OA/ERP/MES/PLM/WMS）以独立插件形式运行。关键问题：

> **单点故障（SPOF）**：在单进程模式下，任一插件的未捕获异常将导致整个平台崩溃，所有租户、所有业务系统同时不可用。

这对企业应用（特别是 ERP/MES）不可接受。

## 二、主流项目架构对比

以下为 8 个主流项目的插件隔离机制分析，基于 2026-07-09 实际调研：

### 2.1 NocoBase（单进程 Node.js — 零隔离）

- **架构**：所有插件为 npm 包，require() 加载到同一 Node.js 进程
- **故障模型**：任一插件 `throw` → 整个 NocoBase 进程退出
- **隔离**：无
- **恢复**：依赖外部进程管理器（PM2/Docker）重启整个服务
- **结论**：NocoBase 的架构以开发效率优先，牺牲了故障隔离。适合内部使用的低代码平台，不适合多插件供应商的企业平台。

### 2.2 Odoo（单进程 Python — Worker 级）

- **架构**：PreforkServer 模式，多个 worker 进程处理 HTTP 请求，每 1000 请求自动回收
- **故障模型**：bug 模块可导致某个 worker 饥饿（请求卡死），其他 worker 存活。但 `prefetch_count=0` 时问题模块独占 worker
- **隔离**：Worker 级，非插件级
- **恢复**：Worker 自动回收（max_request=1000），但回收前所有请求受影响
- **结论**：Odoo 的 worker 回收机制提供了有限的韧性，但无法实现插件级隔离。

### 2.3 WordPress（单进程 PHP — 事后检测）

- **架构**：所有插件在 PHP 进程中加载，共享同一内存空间
- **故障模型**：致命错误（E_ERROR）→ 白屏。PHP 7.0+ 的 `try/catch (\Throwable)` 可捕获大多数错误，但仍存在内存耗尽等不可恢复故障
- **隔离**：无
- **恢复**：WordPress 5.2+ 引入 Recovery Mode，检测插件导致的白屏后通过邮件发送恢复链接。但这是事后修复，崩溃已发生。
- **结论**：WordPress 证明了单一进程架构即使有事后恢复机制，在企业场景中也不够可靠。

### 2.4 VS Code（Extension Host 进程）

- **架构**：主窗口（Main Process） + Extension Host（独立进程，运行所有扩展）
- **故障模型**：一个扩展崩溃 → Extension Host 进程退出 → VS Code 窗口存活，所有扩展重新加载
- **隔离**：Extensions 与主窗口隔离，但扩展之间不隔离（一个崩溃重启全部）
- **IPC**：JSON-RPC over stdin/stdout
- **恢复**：自动重启 Extension Host，所有扩展重新激活（~200ms-2s）
- **结论**：**关键参考**。进程隔离思路正确，但"共享 Extension Host"是缺陷：一个恶意/有 bug 的扩展会影响所有扩展。

### 2.5 Figma（QuickJS WASM 沙箱）

- **架构**：插件编译为 WASM，在 QuickJS 沙箱中执行（与主 UI 同线程）
- **故障模型**：`while(true)` → UI 冻结 ⚠️。WASM 内存访问越界 → 沙箱内 panic，不影响主线程 ✅
- **隔离**：内存沙箱隔离，无线程隔离
- **IPC**：postMessage 风格（异步桥接），Figma API 通过桥接暴露给沙箱
- **结论**：创新的前端隔离方案，但不适用于后端业务插件（后端需要访问数据库、文件系统，沙箱限制过多）。

### 2.6 Home Assistant（单进程 Python — 零隔离）

- **架构**：所有集成（integration）在 asyncio 事件循环中运行
- **故障模型**：未处理异常 → 集成被标记为 `setup failed`，主循环继续运行。但阻塞 I/O 或 CPU 密集任务会冻住整个事件循环
- **隔离**：无
- **恢复**：失败集成手动或重启后重试
- **结论**：Home Assistant 社区已意识到零隔离问题，但受限于 Python asyncio 架构难以改进。

### 2.7 Erlang OTP（监督树 — 业界黄金标准）

- **架构**：每个功能块是独立的 Erlang 进程（非 OS 进程，~2KB 内存，微秒级创建）
- **故障模型**：Process A 崩溃 → Supervisor 收到 `EXIT` 信号 → 按策略重启（one_for_one / one_for_all / rest_for_one）
- **隔离**：Erlang 进程间完全内存隔离，通信通过消息传递
- **恢复**：`let it crash` 哲学 — 崩溃是正常的，监督者负责恢复
- **结论**：**理想的故障模型**，但需要 Erlang/BEAM 运行时。Node.js 无等价物，需要用 OS 级进程近似实现。

### 2.8 Kubernetes Sidecar（容器级隔离 — 最重但最彻底）

- **架构**：每个组件运行在独立容器中，通过 Service/Pod 网络通信
- **故障模型**：Container A 崩溃 → kubelet 重启，其他容器不受影响
- **隔离**：完全隔离（网络/文件系统/进程/资源）
- **恢复**：探活（liveness/readiness）+ 重启策略 + 熔断
- **结论**：最彻底的隔离方案，但资源开销大、运维复杂。适合多租户 SaaS 部署，不适合中小企业本地部署。

### 2.9 借鉴与拒绝 — NocoBase

| 维度 | NocoBase | AUDEBase 决策 |
|------|----------|--------------|
| manifest 声明 | `package.json` + plugin lifecycle | ✅ 采纳，扩展为 manifest.yaml |
| Schema Engine | 核心特色，动态定义 Collection | ✅ 采纳，Phase 2 实现 |
| 插件市场 | npm registry + 内置管理 | ✅ 采纳，Phase 3 实现 |
| 零隔离单进程 | 所有插件 require() 到同一进程 | ❌ 拒绝 — 不可接受 SPOF |
| 插件间通信 | 直接 import/require | ❌ 拒绝 — 必须通过 Core 事件总线 |

**核心理念分歧**：NocoBase 的零隔离设计以开发便利性换取生产可靠性，
这对内部低代码场景可接受。AUDEBase 面向多插件供应商的企业环境，
隔离性是不可妥协的底线。
## 三、IPC 与资源开销

实测数据（Node.js v22, x86_64 Linux）：

| 方式 | 100KB 延迟 | 10MB 延迟 |
|------|-----------|----------|
| 函数调用（inline） | ~0ms | ~0ms |
| child_process stdin/stdout (JSON) | ~1.5ms | ~120ms |
| child_process UDS (JSON) | ~1.3ms | ~100ms |
| 冷启动 (child_process fork) | 500ms-2s | — |

**进程内存估算**（每个 PluginHost 约 50-80MB）：

| 插件数量 | 预估内存 |
|---------|---------|
| 10 插件 | ~0.5-0.8GB |
| 50 插件 | ~2.5-4GB |
| 100 插件 | ~5-8GB |

**数据库连接池**：每个 PluginHost 不直接持有 PG 连接池，
而是按插件组共享连接池，Core 统一管理。

**结论**：进程隔离的 IPC 开销在 1-2ms 级别，对绝大多数业务操作可接受。
冷启动延迟较高（500ms-2s），但仅在插件安装/升级/崩溃恢复时发生，
正常运行时无影响。
## 四、推荐架构：四层信任分组 + 监督树

> **架构演进**: 本文档从初版的「每插件独立进程」模型演进为「层级进程分组」模型，
> 以解决大量插件场景下的资源开销问题（100插件=5-8GB → 8-20进程=0.6-1.5GB）。
> 所有 IPC、安全、通信基础设施保持不变，仅将隔离的粒度从插件级提升到组级。
>

### 4.1 架构图

```
                    ┌─────────────────────────┐
                    │   AUDEBase Core Process   │
                    │       (监督者 + HTTP)      │
                    └──────┬────────┬──────────┘
                           │        │
          ┌────────────────┼────────┼──────────────────┐
          │                │        │                  │
    ┌─────▼──────┐  ┌──────▼──┐ ┌──▼──────────┐  ┌───▼────────┐
    │ SYSTEM 组   │  │ OA 组    │ │ ERP 组      │  │ 3rd Party  │
    │ (process)   │  │(process) │ │(process)    │  │ (process)   │
    │            │  │          │ │              │  │ 每插件独立   │
    │ RBAC       │  │ 审批     │ │ 采购         │  │ 支付插件    │
    │ Schema     │  │ 考勤     │ │ 库存         │  │ 报表插件    │
    │ Logging    │  │ 报销     │ │ 生产         │  │            │
    │ 同进程直调  │  │ 域内直调  │ │ 域内直调     │  │ 独立隔离    │
    │ 全崩→整组重启   │  │ 组崩仅OA │ │ 组崩仅ERP    │  │ 仅自身崩    │
    │（VS Code 模式） │  │          │ │              │  │            │
    └────────────┘  └─────────┘ └─────────────┘  └────────────┘
          │                │        │                  │
          └────────────────┼────────┼──────────────────┘
             跨组通信：JSON-RPC over stdin/stdout + Core 路由
```

> **VS Code 模式说明**：SYSTEM 组采用 VS Code Extension Host 模式——
> 一个插件崩溃 → 整组重启。因为 SYSTEM 插件是常驻平台服务，重启速度极快（<2s），
> 权衡隔离 vs 性能选择性能。Domain 组同理：同域插件紧密耦合，一个崩溃整组重启。

### 4.2 四层信任分组模型

替代「每插件独立进程」设计，采用基于信任度的层级进程分组。

#### 分组规则

| 层级 | 进程模型 | 崩溃范围 | 分组依据 | 插件示例 |
|------|---------|---------|---------|---------|
| **SYSTEM** | 1 个共享进程 | 所有系统插件 | 平台内部，高信任 | rbac, schema-engine, logging |
| **Domain** | 每个业务域 1 个进程 | 该域全部插件 | 按业务边界分组 | OA组(审批/考勤/报销), ERP组(采购/库存/物料) |
| **Isolated** | 每个插件独立进程 | 仅自身 | 第三方/高风险 | 支付插件, 面部识别, 报表生成 |
| **Container** | Docker Sidecar | 完全隔离 | 不可信插件 | 未审核的第三方插件 |

#### 分组逻辑

- **SYSTEM 组**：平台基础服务，必须常驻且高性能。同进程避免 IPC 开销
- **Domain 组**：同域插件互相紧密依赖（OA 的审批需要考勤数据），同进程提高性能
- **Isolated**：第三方或高风险插件，独立进程防止拖垮业务域
- **Container**：未审核或明确不可信的插件，容器沙箱隔离

#### 资源对比：层级分组 vs 每插件进程

| 模型 | 50 插件 | 100 插件 | 故障隔离 |
|------|---------|----------|---------|
| 每插件一进程 | 50 进程 / 2.5-4GB | 100 进程 / 5-8GB | 完美（每个插件都隔离） |
| VS Code 模式 | 1 进程 / 0.1GB | 1 进程 / 0.2GB | 不存在（全崩） |
| **层级分组** | 8-12 进程 / 0.4-0.7GB | 12-20 进程 / 0.6-1.5GB | 域级隔离 ✅ |

*假设：SYSTEM(1) + OA/ERP/MES/WMS(4) + Isolated(3-7) = 8-12 进程*

#### 组内通信 vs 组间通信

| 维度 | 组内（同进程） | 组间（跨进程） |
|------|-------------|-------------|
| 通信方式 | 直接函数调用（~0ms） | JSON-RPC stdin/stdout |
| 认证 | 不需要 | Token + nonce |
| 序列化 | 不需要（引用传递） | JSON 序列化/反序列化 |
| 故障影响 | 进程内异常可能影响整组 | 仅影响请求超时 |
| 适用场景 | 高频业务逻辑协作 | 跨域查询、异步通知 |

#### 分组迁移

插件可以在 SYSTEM/Domain/Isolated 之间迁移，在 manifest.yaml 中声明 `partition` 字段：

```yaml
runtime:
  mode: process              # 不再指单个插件，指所在的组
  partition: oa              # SYSTEM | oa | erp | mes | isolated | ...
  crash_policy: restart      # partition 崩溃 → 整组重启
```

**迁移规则**：
- 迁移到不同的 partition → 必须重启（不能热迁移）
- 迁移到不同的 mode 层级 → 需人工审核
- container 层级不可迁移到其他层级（安全边界）

#### 信任边界与通信权限

组间通信由 Core 路由层强制执行以下访问控制矩阵：

| 调用方↓ / 被调用方→ | SYSTEM | Domain | Isolated | Container |
|---------------------|--------|--------|----------|-----------|
| SYSTEM | ✅ 直调 | ✅ RPC | ✅ RPC | ⚠️ 白名单 |
| Domain | ✅ RPC | ✅ RPC (同域直调) | ✅ RPC | ❌ |
| Isolated | ⚠️ 白名单 | ⚠️ 白名单 | ✅ RPC | ❌ |
| Container | ❌ | ❌ | ❌ | ❌ |

- **直调**：同进程函数调用，零开销
- **RPC**：JSON-RPC over stdin/stdout → Core 路由转发
- **白名单**：需在 manifest 中显式声明 `calls: ["target.plugin"]`，Core 启动时校验
- **❌**：禁止通信，Core 路由层直接拒绝并记录安全审计日志

> **租户维度安全**：组内直接函数调用（Domain 内，如 OA 组）必须通过 PluginHost context 传递 `tenant_id`。Drizzle 查询自动附加 `WHERE tenant_id = context.tenantId`。信任边界表聚焦跨组通信控制；组内通信通过 context 注入保证租户隔离。详见 architecture.md §五。
### 4.3 三种隔离模式

| 模式 | 隔离级别 | IPC 延迟 | 故障影响 | 适用场景 |
|------|---------|---------|---------|---------|
| **inline** | 无（同进程） | 0ms | 全局崩溃 | Phase 1 开发调试、核心模块 |
| **process** | ✅ OS 进程 | 1-2ms | 仅自身 | 默认模式、正式环境 |
| **container** | ✅ 容器 | 网络延迟 | 仅自身 | 不可信第三方插件、SaaS 部署 |

> **Fastify 说明**：Fastify HTTP 服务器仅在 Core 进程中运行。
> PluginHost 进程不暴露 HTTP 端口，仅通过 JSON-RPC stdin/stdout 与 Core 通信。
> Core 的 Fastify `register()` 仅用于 Core 自身的内部中间件（RBAC、日志等）。
### 4.4 故障恢复策略（借鉴 Erlang OTP 监督树）

```
Plugin Host 退出
    │
    ├─ 正常退出 (code=0)            → 不重启，Core 清理资源
    │
    └─ 异常退出 (code≠0, 信号终止)
        │
        ├─ 第1次崩溃 → 1s 后重启
        ├─ 第2次崩溃 → 2s 后重启
        ├─ 第3次崩溃 → 4s 后重启
        ├─ 第4次崩溃 → 8s 后重启
        ├─ 第5次崩溃 → 16s 后重启
        │
        └─ 60s 窗口内第5次崩溃 → 熔断（max_restarts: 5）
            ├─ 禁用该插件
            ├─ 通知管理员 (webhook/email)
            └─ 状态记录到审计日志

健康运行持续 60s 后，崩溃计数器归零。
```

#### Core 进程的故障恢复

Core 进程本身是单点，但其设计确保快速恢复：
- Core 崩溃 → systemd/PM2 检测并重启 Core
- Core 重启后从 PostgreSQL/Redis 恢复状态
- Core 重新 fork 所有 PluginHost 进程
- 插件无感知（状态存储在外部存储中）

> 这是可接受的权衡：Core 极简化（不加载插件代码），崩溃概率远低于 PluginHost。
> 如需 Core 高可用，Phase 4+ 可引入 Core 主备方案。

#### Core 重启 SLA

systemd/PM2 重启 Core + 重新拉起 PluginHost。50 插件预期恢复时间：7-50 秒
（取决于插件启动复杂度）。此项记录为已知限制，Phase 2+ 可考虑插件分组并行启动
（插件声明 priority，高优先先恢复）。

#### 插件数据访问模型

插件默认不直接访问数据库。所有 DB 操作通过 Core 的数据 API 代理（JSON-RPC）。Core 在 ORM 层自动注入：
1. `tenant_id` 列过滤
2. Record Rules（记录级权限）
3. 字段级可见性过滤

仅 manifest 中声明 `security: { db_direct: true }` 的 Isolated 插件获得独立 PG 连接（需额外审核）。

参考：Odoo ORM 单一数据访问路径原则；NocoBase CVE GHSA-v8vm-cqh8-q87q 证明了直连数据库的风险。
### 4.5 对比主流项目

| 维度 | VS Code | Erlang OTP | AUDEBase 设计 |
|------|---------|-----------|---------------|
| 隔离粒度 | 所有扩展共享 Host | 每个功能独立 process | 每个插件独立 Host ✅ |
| IPC 方式 | stdin/stdout JSON-RPC | 消息传递 | stdin/stdout JSON-RPC ✅ |
| 故障恢复 | Host 重启（全部重载） | Supervisor 按策略重启 | 按插件独立重启 ✅ |
| 状态恢复 | 扩展重新激活 | 进程状态重建 | 外部存储 (PG/Redis) ✅ |
| 资源开销 | 1个额外进程 | 极低（~2KB/process） | N个进程 (中等) |

### 4.6 插件声明 (manifest.yaml)

```yaml
name: "erp-core"
version: "1.2.0"
display_name: "ERP 企业资源计划"
description: "核心ERP功能"
category: "Manufacturing/ERP"      # Odoo 参考：插件市场分类
license: "Apache-2.0"             # Odoo 参考：许可证声明
application: true                 # Odoo 参考：是否为可安装应用
entry: "dist/index.js"            # 插件入口
author: "vendor-name"
dependencies:
  rbac: ">=1.0.0 <2.0.0"
provides:
  - "erp.purchase"
permissions:
  - "erp.purchase.create"
models:
  - "PurchaseOrder"
assets:                           # 静态资源
  - "dist/admin.js"
lifecycle:                        # 生命周期钩子注册
  beforeLoad: "registerModels"
  afterEnable: "startScheduler"
  preUninstall: "warnUserDataLoss"
```

> Phase 2 新增字段：`external_dependencies`（系统级依赖如 Python）、`data`（必须数据文件）、`demo`（演示数据）、`sequence`（加载顺序）、`auto_install`（自动安装）。

> Odoo 参考：`category`、`sequence`、`application` 字段用于插件市场分类排序和可安装应用标识。Phase 1 已包含 `category`、`application`，Phase 2 加入 `sequence` 和 `auto_install`。

#### 依赖解析算法（DAG 拓扑排序）

借鉴 Odoo 的 `_check_dependencies_are_satisfied()` 和 Node.js 的 `require.resolve()`：

1. **构建 DAG**：插件为节点，`dependencies` 为有向边
2. **拓扑排序**（Kahn's algorithm）：入度为 0 的节点优先加载
3. **循环检测**：若存在剩余未处理节点 → 拒绝加载，报告循环依赖
4. **版本校验**：semver range 匹配，不兼容版本 → 拒绝

#### 插件配置管理（借鉴 NocoBase pm.add/pm.enable）

```yaml
# .audebase/plugins.yaml
plugins:
  erp-core:
    enabled: true
    version: "1.2.0"
    pinned: true              # 锁定版本，禁止自动升级
```


#### Record Rules（记录级权限）

借鉴 Odoo 的 domain filter 表达式。在 `manifest.permissions` 中声明：

```yaml
permissions:
  - name: "erp.purchase.read_own"
    resource: "erp.purchase"
    action: "read"
    record_rule: "[('company_id', '=', user.company_id.id)]"
```

Core 在 RPC 转发时 ORM 层自动注入 WHERE 条件。Phase 1 通过 Drizzle 中间件自动附加 `tenant_id` 过滤。

#### 字段级权限

借鉴 NocoBase 的 field-level ACL。在 `manifest.exports` 的字段声明中：

```yaml
exports:
  - method: "hr.employee.read"
    returns:
      salary:
        type: "number"
        visible_to: ["hr.manager", "admin"]
```

Core 在 API 响应时自动过滤不可见字段。前端 Schema UI 自动隐藏不可见输入框。

Core 在加载时自动生成 `permissions ↔ exports.visible_to` 的映射表。开发者声明一次权限，映射由 Core 维护。

#### NocoBase 核心机制借鉴

- **数据表前缀**：`{插件名大写}_{表名}_`，如 `ERP_PURCHASE_ORDER`。避免表名冲突
- **中间件注册**：插件在 `manifest.exports` 中声明中间件，Core 加载后注入
- **CLI 命令**：插件通过 `registerCommand` 注册自定义 CLI

#### data 和 demo 数据加载

借鉴 NocoBase `db.sync()` + `demo: true` 模式。开发者定义 demo 数据：

```yaml
data:
  - "data/roles.yaml"        # 必须数据
demo:
  - "demo/users.yaml"        # 演示数据，仅开发模式加载
```

`audeus install --demo` 同时加载 data + demo。

#### 迁移脚本安全

- **SHA-256 签名验证**：迁移脚本内容与 manifest 中声明的校验和比对
- **事务包裹**：所有迁移在 DB 事务中执行，失败自动回滚
- **禁止动态执行**：`eval()` / `new Function()` / `vm.runInNewContext()` 均禁用
- **参考**：Odoo migration scripts 的安全方案

#### CSRF 防护策略

AUDEBase Admin UI 使用 JWT Bearer token（localStorage 存储）。API 请求通过 `Authorization: Bearer <token>` 头发送，天然不受传统 cookie-based CSRF 影响。若未来支持 cookie-based 认证（如 OAuth 回调），需为相关路由启用 Fastify CSRF 中间件。参考：NocoBase JWT 认证模式、Odoo `type='jsonrpc'` 默认禁用 CSRF。

### 4.7 插件间通信模式

两种互补的通信模式：

| 模式 | 机制 | 延迟 | 适用场景 |
|------|------|------|----------|
| **同步 RPC** | Plugin A → Core → Plugin B | 2-4ms | 查询、请求-响应 |
| **异步事件** | Plugin → Redis Pub/Sub (fire-and-forget) | <1ms | 通知、状态变更 |
|  | 发布+订阅端到端延迟 | ~5-20ms (网络 + Redis 处理) |  |

同步 RPC：调用方等待响应，Core 作为代理转发并返回结果。
异步事件：发布方发出后立即返回，不等待订阅方处理。

> **为什么同步 RPC 和异步 Pub/Sub 共存？** 同步 RPC 用于需要响应的查询（「用户 X 是否有权限 Y？」）；
> 异步 Pub/Sub 用于通知和状态变更（「采购订单创建完成」）。两者不可互相替代——
> RPC 不适合广播（一对多），Pub/Sub 不适合请求-响应（无返回值）。

#### Redis Pub/Sub 多租户隔离

所有 Pub/Sub channel 使用租户前缀：
```
{tenant_id}:plugin:event_name
```
Core 验证插件只能订阅自己租户命名空间内的 channel。

> **Core 路由层强制校验 tenant_id**：RPC 请求的 `_metadata.tenant_id` 必须与连接上下文的 tenant_id 一致。不一致 → 记录安全审计日志 + 关闭连接。
### 4.8 IPC 认证

每个 PluginHost 在 fork 时通过环境变量接收随机 token：

```
AUD_PLUGIN_IPC_TOKEN=<crypto.randomBytes(32).toString('hex')>
```

每条 JSON-RPC 消息的 params 中必须包含 `"auth": "<token>"`。
Core 在每条消息到达时验证 token。认证在帧级别执行（每个 content-length 帧携带 auth 字段），不在 RPC 方法级别。
Token 不匹配 → Core 立即 kill 子进程。

#### 上下文传递

所有 JSON-RPC 请求在 `params` 中包含 `_metadata` 字段：
```json
{
  "_metadata": {
    "tenant_id": "...",
    "user_id": "...",
    "role_ids": ["..."],
    "request_id": "..."
  }
}
```
PluginHost 路由层提取并注入到执行上下文。

#### 消息防重放

每条消息附带递增 nonce (`auth_nonce`)，Core 拒绝重复 nonce。
最大帧大小 1MB，超过 → Core 返回 JSON-RPC error (code: -32001, message: 'Payload too large')，不关闭连接。

### 4.9 跨插件事务 — Saga 补偿模式

跨插件工作流涉及多步骤时，Core 编排 Saga：

```
步骤1: execute_erp_order()  ──→ 失败则 compensate_erp_order()
步骤2: execute_mes_schedule() ──→ 失败则 compensate_mes_schedule() + compensate_erp_order()
步骤3: execute_wms_pick()    ──→ 失败则 compensate_wms_pick() + 补偿前两步
```

每个步骤提供 `execute()` 和 `compensate()` 回调。
任何步骤失败，Core 按逆序执行已完成步骤的 `compensate()`。

#### Saga 可靠性

Saga 持久化：所有 Saga 步骤记录到 PostgreSQL `saga_log` 表（含 tenant_id 列 + 首列索引、状态、重试次数、创建时间）。

Core 重启后需恢复未完成 Saga — 此项标注为已知限制（外部状态表可在 Core 恢复后重放）。
### 4.10 IPC 故障处理

JSON-RPC 2.0 内容长度帧协议：
- 每条消息前缀 `Content-Length: N\r\n\r\n`
- 30s 请求超时（超时 reject Promise）
- request_id 去重（忽略重复 ID）
- `process.on('exit')` 清理所有未完成 Promise
- stdin 背压控制（写端缓冲区满时暂停发送）

### 4.11 事件模型

基于 key 的事件订阅模型：
- 事件通过 JSON-RPC notification 发布，method: `publish`
- 订阅通过 Core 注册：`plugin.subscribe("erp:order:created")`
- 通配符支持：`plugin.subscribe("erp:*")` 订阅所有 erp 前缀事件
- Phase 1 (inline)：使用 EventEmitter
- Phase 2+ (process)：Redis Pub/Sub，API 不变

通配符订阅自动追加租户前缀。`plugin.subscribe('erp:*')` → Core 解析为 `{tenant_id}:erp:*`，仅匹配当前租户 channel。

### 四.X 插件通信架构

#### 通信协议栈

```
┌────────────────────────────────────────┐
│  API 契约层     manifest.exports + Zod  │
├────────────────────────────────────────┤
│  序列化层       JSON (可替换 MessagePack) │
├────────────────────────────────────────┤
│  帧协议层       content-length + auth   │
│                + token + nonce          │
├────────────────────────────────────────┤
│  传输层         stdin/stdout 管道        │
└────────────────────────────────────────┘
```

#### 当前通信模式总览

| 维度 | 组内 | 组间同步 | 组间异步 |
|------|------|---------|---------|
| 方式 | 直接函数调用 | JSON-RPC → Core → JSON-RPC | Redis Pub/Sub |
| 延迟 | ~0ms | 2-4ms | <1ms (fire-and-forget); 发布+订阅端到端 ~5-20ms |
| 安全 | 不需要 | Token + nonce | 租户前缀隔离 |
| 序列化 | 不需要 | JSON | JSON |
| 适用场景 | 高频逻辑协作 | 查询、跨域调用 | 通知、状态变更 |

#### 已识别问题与解决方案

| # | 问题 | 严重度 | 解决方案 | Phase |
|---|------|--------|---------|-------|
| 1 | Core 路由瓶颈 — 高频调用 2-hop 延迟 | HIGH | Phase 3：高频插件对可协商直连管道，绕过 Core。Core 作为 CA（证书颁发机构），颁发一次性握手 token → 插件对建立直接 JSON-RPC stdin/stdout 连接。Core 保留吊销能力。 | Phase 3 |
| 2 | 无 API 契约 — 插件不知道对方提供什么 | HIGH | manifest.exports 声明 + Zod schema + ServiceRegistry | Phase 2 |
| 3 | 无版本管理 — 升级后接口兼容性未知 | HIGH | manifest.dependencies 版本约束 + Core 启动校验 | Phase 2 |
| 4 | 无流式/大负载 — stdin/stdout 不适合大文件 | MEDIUM | 旁路传输（Redis Stream / 文件路径引用） | Phase 3 |
| 5 | 无死锁检测 — A→B→C→A 循环调用 | MEDIUM | call_depth 计数器 + 30s 超时兜底 | Phase 2 |
| 6 | 无请求优先级 — 健康检查与业务调用混合 | LOW | 帧头 priority 字段，Core 按优先级调度 | Phase 3 |
| 7 | Redis Pub/Sub 无序 — 事件到达顺序不确定 | LOW | 接收方 Lamport 时间戳排序；Phase 2 可选 Redis Stream | Phase 2 |
| 8 | 无调用链追踪 — 跨插件调用链路不可见 | LOW | _metadata 扩展为 OpenTelemetry trace context | Phase 3 |

#### 主流项目通信对比

| 项目 | 同步通信 | 异步通信 | 契约/类型 | 版本管理 | 流式 |
|------|---------|---------|----------|---------|------|
| NocoBase | 直接 import（无 IPC） | app.on/emit | 隐式（TypeScript 类型） | npm 版本号 | 无 |
| Odoo | ORM 继承（内部） | Bus.bus + Longpolling | ORM 字段+方法定义（隐式） | manifest depends | 无 |
| VS Code | commands.executeCommand（Extension Host 共享进程） | EventEmitter | vscode.d.ts | API version | 无（大文件走 URI） |
| gRPC | protobuf + HTTP/2 | 无内置 | .proto 强类型 | protobuf 兼容 | ✅ 原生 |
| Dapr | sidecar 代理 | pub/sub + state | 无 | 无 | 无 |
| NATS | request-reply | subject-based | 无 | 无 | 无 |
| **AUDEBase** | JSON-RPC → Core → JSON-RPC | Redis Pub/Sub | manifest.exports | manifest.dependencies | Phase 3 |

#### 为什么不用 gRPC/NATS？

gRPC 和 NATS 是为**网络通信**设计的，AUDEBase 的通信发生在**同机子进程管道**中：

| 维度 | gRPC | NATS | JSON-RPC stdin/stdout |
|------|------|------|----------------------|
| 传输层适配 | ❌ 需 wrapper | ❌ 需 TCP server | ✅ 原生 stdin/stdout |
| 零网络配置 | ❌ 端口/IP | ❌ server 地址 | ✅ OS 文件描述符 |
| 安全边界 | TLS 证书 | TLS + token | ✅ OS 文件权限 |
| 调试可见性 | ❌ 二进制 | ⚠️ 专用工具 | ✅ 人类可读 |
| 外部依赖 | protoc 编译器 | NATS Server | **零依赖** |
| 契约系统 | ✅ .proto | ❌ | ✅ manifest.exports |

**结论**：传输层保持不变（JSON-RPC stdin/stdout）。Phase 2 在契约层增加 `manifest.exports` 实现类型安全和服务发现。仅在 Phase 3+ 需要流式传输时，考虑在同一管道内添加二进制帧模式（MessagePack），而非切换到 gRPC。

#### 直连通道安全模型 — Core 作为 CA

Phase 3 直连管道采用与 HTTPS PKI 类似的信任模型：

1. **Core 作为证书颁发机构（CA）**：持有自签名根证书
2. **握手授权**：Plugin A 需要与 Plugin B 直连时，A 向 Core 请求握手 token
3. **Core 审核**：检查访问控制矩阵（信任边界表），确认 A 有权调用 B
4. **颁发 token**：Core 签发 JWT token（含 A/B 身份、有效期 30s、一次性使用）
5. **建立连接**：A 携带 token 通过 stdin/stdout 连接 B，B 验证 token 签名
6. **Core 保留吊销能力**：Core 可随时将 token 加入撤销列表，B 定期轮询撤销列表

直连通道的访问控制仍然受信任边界表（見 §4.2）约束。

#### Manifest.exports 契约系统

```yaml
# erp-core/manifest.yaml 中声明导出 API
exports:
  - method: "erp.purchase.create"
    description: "创建采购订单"
    params:
      supplier_id: { type: "string", required: true }
      items: { type: "array", required: true }
    returns:
      order_id: { type: "string" }
      status: { type: "string" }
    errors: ["ERR_INVALID_SUPPLIER", "ERR_OUT_OF_STOCK"]
    since: "1.0.0"
    deprecated_since: null

  - method: "erp.inventory.check"
    since: "1.0.0"
    deprecated_since: "1.2.0"
    replaced_by: "erp.inventory.check_v2"
    params:
      sku: { type: "string", required: true }
    returns:
      available: { type: "boolean" }
      current_stock: { type: "number" }
```

> **`exports` vs `provides`**：`exports` 定义 RPC 接口契约（面向机器可消费的 API 定义），`provides` 定义功能标签（如 `'erp.purchase'`，面向插件市场搜索和依赖解析）。两者互补，非替代关系。
**依赖版本约束**：
```yaml
# oa-core/manifest.yaml
dependencies:
  erp-core: ">=1.0.0 <2.0.0"    # 主版本兼容
  rbac: ">=1.0.0"               # 接受任何 >=1.0.0
```

**Core 启动时**：
1. 解析所有 manifest.exports → 构建 ServiceRegistry
2. 校验依赖版本兼容性（语义版本）
3. 生成 TypeScript 类型定义（通过 `audeus gen-types`）→ IDE 自动补全
4. 检测弃用 API → 发出警告

> **类型生成与运行时验证**：TypeScript 类型在构建时由 `audeus gen-types` 从 manifest.exports 生成。Zod 运行时验证默认启用，可通过 manifest 配置 `runtime.skip_zod_validation: true` 按插件关闭以提升性能。
**插件调用时**：
```typescript
const result = await context.call("erp.purchase.create", {
  supplier_id: "S001",
  items: [{ sku: "ABC", qty: 10 }]
});
// 类型自动推导：{ order_id: string, status: string }
```

#### 通信优化路线图

| Phase | 内容 |
|-------|------|
| **Phase 1** | JSON-RPC stdin/stdout + EventEmitter（当前设计，足够 MVP） |
| **Phase 2** | manifest.exports 契约 + ServiceRegistry + 版本校验 + 死锁检测 + 同步 RPC 超时 + 大文件旁路传输（文件路径引用） + Redis Stream 可选 |
| **Phase 3** | 直连管道 + 流式传输（二进制帧模式，MessagePack） + OpenTelemetry trace + 请求优先级 + 按调用方限流 (rate_limit per caller) |

### 4.12 可观测性与运维

- Core 聚合所有 PluginHost 的结构化 JSON 日志（含 request_id 关联）
- 每个 PluginHost 暴露 Node.js inspector 端口用于调试
- Phase 1：标准 Node.js debug
- Phase 2+：每进程独立 inspector 端口 (9229+offset)
- 健康检查协议：JSON-RPC 方法 `plugin:health` → `{"status":"ok","uptime":12345,"memory":123456789}`（5s 超时）

### 4.13 优雅关闭

关闭序列：
1. Core 收到 SIGTERM
2. Core 向所有 PluginHost 发送 `shutdown` JSON-RPC notification
3. 等待最多 10s（可配置）
4. 超时未响应 → SIGKILL
5. Core 自身退出

### 4.14 插件生命周期 — Phase 1 简化方案

| 操作 | 流程 |
|------|------|
| **安装** | stop → 复制 npm 包 → start |
| **升级** | stop → 备份 → 安装新版本 → 运行迁移脚本 → start |
| **卸载** | stop → 运行清理脚本 → 删除文件 |


### 4.15 插件生命周期钩子

| 钩子 | 阶段 | 用途 | 参考 |
|------|------|------|------|
| **afterAdd** | 注册 | 插件被发现，调用 beforeLoad | NocoBase PluginManager |
| **beforeLoad** | 初始化 | 注册数据表、中间件、i18n、CLI 命令 | NocoBase beforeLoad |
| **load** | 加载 | require() 插件代码 | 所有系统 |
| **install** | 安装 | 创建 DB 表、写入系统配置、加载 demo 数据 | Odoo data files |
| **afterEnable** | 激活 | 启动定时任务、注册事件监听、开端口 | NocoBase afterEnable |
| **afterDisable** | 停用 | 注销事件、停止定时任务 | NocoBase afterDisable |
| **preUninstall** | 卸载前 | 提醒用户备份数据 | Odoo warning |

#### 迁移三阶段（NocoBase 模式）

1. **beforeLoad**：注册临时表结构（新 schema）
2. **afterSync**：Drizzle 引擎执行 DDL（ALTER TABLE），`version_gated` 防止重复
3. **afterLoad**：验证新表结构可用

#### 插件状态机（借鉴 NocoBase）

| 状态 | 含义 | 触发 |
|------|------|------|
| **draft** | 已注册未加载 | afterAdd |
| **pending** | 等待依赖解析 | beforeLoad |
| **resolving** | 解析依赖中 | 依赖解析 |
| **resolved** | 依赖已解析 | resolved |
| **loaded** | 已加载运行 | install + afterEnable |

Phase 1 仅 **loaded**/**disabled** 两种状态。Phase 2 完整五状态。

> Phase 1 所有操作需要服务重启。Phase 2+ 支持热操作（不停机）。

### 4.16 国际化 (i18n)

借鉴 NocoBase 的插件命名空间隔离模式。

**翻译文件组织**：
```
packages/erp-core/
└── locale/
    ├── zh-CN.json       # {"purchase.order.create": "创建采购订单"}
    ├── en-US.json        # {"purchase.order.create": "Create Purchase Order"}
```

**manifest 声明**：
```yaml
# manifest.yaml
locale:
  path: "locale"          # 翻译文件目录（相对于插件根目录）
  default: "zh-CN"        # 回退语言
  supported:               # Phase 2 声明，Phase 1 全部加载
    - "zh-CN"
    - "en-US"
```

**Core 聚合机制**：
1. 插件初始化时，Core 扫描 `locale/` 目录下的 JSON 文件
2. 按 `{pluginName}.{key}` 格式注册到全局翻译表（命名空间隔离）
3. 通过 PluginHost context 注入 `t()` 函数：`context.t('purchase.order.create')`
4. Core 自动添加命名空间前缀 → 实际查询 `erp-core.purchase.order.create`

**语言回退链**（Phase 2，Phase 1 仅当前语言）：
1. 请求语言（如 `ja-JP`）
2. 回退语言（`zh-CN`，manifest.locale.default）
3. 系统默认（`en-US`）
4. 返回 key 原文（兜底）

**Phase 1 实现**：预加载所有翻译（插件数量少，内存可接受）。Phase 2 按需懒加载。

**前端实现**：使用 react-i18next（详见 decisions.md D15）。以插件包名作为 i18next namespace（如 `@audebase/plugin-erp`），manifest.locale.path → i18next backend 加载 `locale/{lang}.json`。React 组件中使用 `useTranslation('@audebase/plugin-erp')` Hook。

**参考**：
- NocoBase: `@nocobase/i18n`，`app.i18n.t('pluginName.key')`，按插件命名空间隔离
- Odoo: `.po` 文件 + `_()` 函数，按模块 `i18n/` 目录
- VS Code: `package.nls.json` + `package.nls.{lang}.json`
- react-i18next: JSON namespace + lazy load（已决策采用）
## 五、分阶段落地计划

> **范围说明**：本文档聚焦插件隔离架构设计。Phase 1 整体范围（含 RBAC、日志、UI、多租户）
 > 详见 `architecture.md` 和 `status.md`。

| 阶段 | 实现内容 | 目标 |
|------|---------|------|
| **Phase 1 MVP** | inline 模式 + `PluginHost` 接口抽象 + `ProcessPluginHost` mock | 验证架构可扩展性，接口支持未来跨进程 |
| **Phase 2** | process 模式实现 (child_process + JSON-RPC stdin/stdout) + 单插件重启（监听 manifest 变更 → 重启该 PluginHost） | 解决 SPOF，正式环境可用 |
| **Phase 3** | 热重载（manifest 变更 → 重载代码不重启进程） | 减少服务中断，提升开发体验 |
| **Phase 4** | 监督树 + 自动重启 + 熔断 + 健康检查 + 审计日志 | 生产级可靠性 |
| **Phase 5** | container 模式 (Docker/K8s Sidecar) + 插件资源限额 | 第三方不可信插件、SaaS 多租户部署 |

### Phase 1 ProcessPluginHost mock 强制约束

为确保接口设计正确，mock 必须实现以下 5 项约束：

1. 所有方法调用返回 Promise（异步语义）
2. 所有参数经过 `JSON.stringify` → `JSON.parse` 序列化
3. 所有返回值经过 `JSON.stringify` → `JSON.parse` 反序列化
4. 30s 超时（超时 reject TimeoutError）
5. 随机 1-5ms 延迟注入，模拟 IPC 延迟

### Phase 2 沙箱化

- cgroup v2 用于内存/CPU 限额
- manifest 中 `security` 声明强制执行 fs/net 限制
- Phase 1：仅做 npm audit + 资源监控告警

cgroup v2 仅 Linux 支持。macOS 开发环境用 ulimit + 进程管理器近似限制，
测试环境用 Docker 或 Linux VM。

### 测试策略

- Phase 1：PluginHost 接口单元测试 + ProcessPluginHost mock 测试
- Phase 2：集成测试（崩溃模拟、重启、超时）

### 关键设计原则

1. **接口先行**：PluginHost 抽象接口从 Day 1 就支持跨进程通信语义（异步、序列化、错误传播）
2. **Phase 1 用 inline，但必须有 mock**：确保 interface 设计正确，不是事后补丁
3. **Core 进程极简化**：只做编排，不加载插件代码，确保 Core 本身稳定
4. **外部状态**：所有状态存储在 PostgreSQL/Redis，组进程崩溃 → 重启后从外部存储恢复，不依赖进程内存。
5. **插件不直接通信**：组内直调函数，组间通过 Core 事件总线（同步 RPC + Redis Pub/Sub），解耦
## 六、参考来源

- NocoBase GitHub: https://github.com/nocobase/nocobase
- VS Code Extension Host: https://code.visualstudio.com/api/extension-guides/extension-host
- Erlang OTP Supervisor: https://www.erlang.org/doc/design_principles/sup_princ
- Odoo Architecture: https://www.odoo.com/documentation/master/developer/reference/backend/orm.html
- Figma Plugin Sandbox: https://www.figma.com/plugin-docs/how-plugins-run/
- Node.js child_process: https://nodejs.org/api/child_process.html
- Node.js worker_threads: https://nodejs.org/api/worker_threads.html
- WordPress Recovery Mode: https://make.wordpress.org/core/2019/04/16/fatal-error-recovery-mode-in-5-2/
- Home Assistant Integration: https://developers.home-assistant.io/docs/creating_component_index/
## 七、已知限制与后续改进

以下项目已识别但不在当前阶段范围内：

| 项目 | 目标阶段 | 说明 |
|------|---------|------|
| 国际化 (i18n) | Phase 1（预加载） | NocoBase 命名空间模式 + JSON 翻译文件 + Core t() 注入，详见 §4.16 |
| 配置热重载 | Phase 3 | manifest 变更无需重启自动生效 |
| 资源限额精细化 | Phase 4 | 每个插件独立 CPU/内存/磁盘配额 |
| 供应链安全 | Phase 2 | 插件包签名验证 + 依赖审计 |
| 容器模式 | Phase 4 | Docker Sidecar 替代 child_process |
| 升级回滚细节 | Phase 2 | 版本快照 + 自动回滚 + 迁移脚本管理 |
| 数据迁移 | Phase 2 | 插件升级时的数据库 schema 迁移编排 |
| Core 高可用 | Phase 4+ | Core 主备方案（Core 崩溃影响全平台） |
| seccomp/namespace 沙箱 | Phase 4 | macOS 兼容需用不同机制（sandbox-exec 或 App Sandbox） |
| db_namespace 语义细化 | Phase 2 | 当前仅字符串标识，需细化表/列级别权限粒度 |
| Redis Pub/Sub 发布控制 | Phase 1 | 所有 Pub/Sub 发布通过 Core 验证后才写入 Redis，插件不直接连接 Redis 发布 |

### 前端 XSS 防御

- Phase 1 引入 `sanitize-html`（npm）配置白名单标签（参考 Odoo 四种粒度：`sanitize_tags`、`sanitize_attributes`、`sanitize_style`、`strip_classes`）
- Schema JSON 渲染前 Core parse 拒绝危险属性
- 文件上传 `Content-Disposition: attachment` + MIME 类型白名单
- 参考：Odoo `html_sanitize()`、NocoBase DOMPurify

> **R4 审核覆盖说明**：前 3 轮审核遗漏的 8 项中，6 项已在本轮覆盖（生命周期钩子、字段级权限、迁移脚本、静态资源打包、i18n、模块注册）。`postInstallAction` 归入 lifecycle 设计的 `afterEnable` 钩子。其余标记为 Phase 2。