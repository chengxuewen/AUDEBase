# 插件框架设计

> 从 `architecture.md` 和 `plugin-architecture-analysis.md` 提取。
> 父文档索引见 `docs/architecture.md`。
> 通信、权限、多租户的模块文档见 `docs/modules/` 下其他文件。

## 一、四层信任分组模型

AUDEBase 采用「接口先行 + 渐进式隔离」策略，拒绝 NocoBase 的零隔离单进程模型：

- **Phase 1（inline）**：插件在 Core 进程内通过 `PluginHost` 接口抽象运行，接口语义已预留异步/序列化/错误传播能力
- **Phase 2+（process）**：每个插件套件运行在独立 `ProcessPluginHost` 子进程中，通过 JSON-RPC stdin/stdout 通信
- 同一套 `PluginHost` 接口同时支持 inline 和 process 两种实现

开发者在 Phase 1 编写的插件代码，升级到 Phase 2 时**无需修改业务逻辑**，仅需更改 manifest 中的 `runtime.mode` 字段。

### 1.1 架构图

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
    │（VS Code 模式）  │  │          │ │              │  │            │
    └────────────┘  └─────────┘ └─────────────┘  └────────────┘
          │                │        │                  │
          └────────────────┼────────┼──────────────────┘
             跨组通信：JSON-RPC over stdin/stdout + Core 路由
```

**VS Code 模式说明**：SYSTEM 组采用 VS Code Extension Host 模式——一个插件崩溃 → 整组重启。因为 SYSTEM 插件是常驻平台服务，重启速度极快（<2s），权衡隔离 vs 性能选择性能。Domain 组同理：同域插件紧密耦合，一个崩溃整组重启。

### 1.2 四层分组规则

替代「每插件独立进程」设计，采用基于信任度的层级进程分组：

| 层级 | 进程模型 | 崩溃范围 | 分组依据 | 插件示例 |
|------|---------|---------|---------|---------|
| **SYSTEM** | 1 个共享进程 | 所有系统插件 | 平台内部，高信任 | rbac, schema-engine, logging |
| **Domain** | 每个业务域 1 个进程 | 该域全部插件 | 按业务边界分组 | OA组(审批/考勤/报销), ERP组(采购/库存/物料) |
| **Isolated** | 每个插件独立进程 | 仅自身 | 第三方/高风险 | 支付插件, 面部识别, 报表生成 |
| **Container** | Docker Sidecar | 完全隔离 | 不可信插件 | 未审核的第三方插件 |

### 1.3 分组逻辑

- **SYSTEM 组**：平台基础服务，必须常驻且高性能。同进程避免 IPC 开销
- **Domain 组**：同域插件互相紧密依赖（OA 的审批需要考勤数据），同进程提高性能
- **Isolated**：第三方或高风险插件，独立进程防止拖垮业务域
- **Container**：未审核或明确不可信的插件，容器沙箱隔离

### 1.4 资源对比

| 模型 | 50 插件 | 100 插件 | 故障隔离 |
|------|---------|----------|---------|
| 每插件一进程 | 50 进程 / 2.5-4GB | 100 进程 / 5-8GB | 完美（每个插件都隔离） |
| VS Code 模式 | 1 进程 / 0.1GB | 1 进程 / 0.2GB | 不存在（全崩） |
| **层级分组** | 8-12 进程 / 0.4-0.7GB | 12-20 进程 / 0.6-1.5GB | 域级隔离 ✅ |

*假设：SYSTEM(1) + OA/ERP/MES/WMS(4) + Isolated(3-7) = 8-12 进程*

### 1.5 组内通信 vs 组间通信

| 维度 | 组内（同进程） | 组间（跨进程） |
|------|-------------|-------------|
| 通信方式 | 直接函数调用（~0ms） | JSON-RPC stdin/stdout |
| 认证 | 不需要 | Token + nonce |
| 序列化 | 不需要（引用传递） | JSON 序列化/反序列化 |
| 故障影响 | 进程内异常可能影响整组 | 仅影响请求超时 |
| 适用场景 | 高频业务逻辑协作 | 跨域查询、异步通知 |

### 1.6 分组迁移

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

### 1.7 信任边界与通信权限

组间通信由 Core 路由层强制执行访问控制矩阵：

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

### 1.8 三种隔离模式

| 模式 | 隔离级别 | IPC 延迟 | 故障影响 | 适用场景 |
|------|---------|---------|---------|---------|
| **inline** | 无（同进程） | 0ms | 全局崩溃 | Phase 1 开发调试、核心模块 |
| **process** | ✅ OS 进程 | 1-2ms | 仅自身 | 默认模式、正式环境 |
| **container** | ✅ 容器 | 网络延迟 | 仅自身 | 不可信第三方插件、SaaS 部署 |

> Fastify HTTP 服务器仅在 Core 进程中运行。PluginHost 进程不暴露 HTTP 端口，仅通过 JSON-RPC stdin/stdout 与 Core 通信。

### 1.9 故障恢复策略（借鉴 Erlang OTP 监督树）

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

**Core 进程的故障恢复**：
- Core 崩溃 → systemd/PM2 检测并重启 Core
- Core 重启后从 PostgreSQL/Redis 恢复状态
- Core 重新 fork 所有 PluginHost 进程
- 插件无感知（状态存储在外部存储中）

Core 重启 SLA（50 插件预期恢复时间 7-50 秒）是已知限制，Phase 2+ 可考虑插件分组并行启动。

## 二、manifest.yaml 规范

### 2.1 完整声明示例

每个插件通过 manifest.yaml 声明元数据、依赖、版本、权限、数据模型（Phase 1 字段 + Phase 2 新增）：

```yaml
name: "erp-core"
version: "1.2.0"
display_name: "ERP 企业资源计划"
description: "核心ERP功能"
category: "Manufacturing/ERP"      # Phase 1: 插件市场分类（Odoo 参考）
license: "Apache-2.0"             # Phase 1: 许可证声明（Odoo 参考）
application: true                 # Phase 1: 是否为可安装应用（Odoo 参考）
entry: "dist/index.js"            # Phase 1: 插件入口

author: "vendor-name"

# Phase 1: 依赖声明（semver 版本约束）
dependencies:
  rbac: ">=1.0.0 <2.0.0"

# Phase 1: 功能标签（面向插件市场搜索和依赖解析）
provides:
  - "erp.purchase"

# Phase 1: 权限声明
permissions:
  - "erp.purchase.create"

# Phase 1: 数据模型声明
models:
  - "PurchaseOrder"

# Phase 1: 静态资源
assets:
  - "dist/admin.js"

# Phase 1: 生命周期钩子注册
lifecycle:
  beforeLoad: "registerModels"
  afterEnable: "startScheduler"
  pre_uninstall: "warnUserDataLoss"

# Phase 1: 运行时配置
runtime:
  mode: process              # inline | process | container
  partition: oa              # SYSTEM | oa | erp | mes | isolated
  crash_policy: restart      # partition 崩溃 → 整组重启

# Phase 1: 安全配置
security:
  db_namespace: "erp"         # 数据库命名空间隔离

# Phase 2 新增字段:
# sequence: 10               # 加载顺序（Odoo 参考）
# auto_install: true          # 依赖满足时自动安装
# external_dependencies:      # 系统级依赖（如 Python）
#   - "python3"
# data:                       # 必须数据文件
#   - "data/roles.yaml"
# demo:                       # 演示数据（仅开发模式加载）
#   - "demo/users.yaml"
# exports:                    # RPC 接口契约（面向机器可消费的 API 定义）
#   - method: "erp.purchase.create"
#     params: ...
#     returns: ...
# locale:                     # i18n 翻译配置
#   path: "locale"
#   default: "zh-CN"
```

### 2.2 依赖解析算法（DAG 拓扑排序）

借鉴 Odoo 的 `_check_dependencies_are_satisfied()` 和 Node.js 的 `require.resolve()`：

1. **构建 DAG**：插件为节点，`dependencies` 为有向边
2. **拓扑排序**（Kahn's algorithm）：入度为 0 的节点优先加载
3. **循环检测**：若存在剩余未处理节点 → 拒绝加载，报告循环依赖
4. **版本校验**：semver range 匹配，不兼容版本 → 拒绝

### 2.3 插件配置管理

借鉴 NocoBase `pm.add`/`pm.enable` 模式：

```yaml
# .audebase/plugins.yaml
plugins:
  erp-core:
    enabled: true
    version: "1.2.0"
    pinned: true              # 锁定版本，禁止自动升级
```

## 三、插件生命周期

### 3.1 生命周期钩子（7 个）

| 钩子 | 阶段 | 用途 | 参考 |
|------|------|------|------|
| **afterAdd** | 注册 | 插件被发现，调用 beforeLoad | NocoBase PluginManager |
| **beforeLoad** | 初始化 | 注册数据表、中间件、i18n、CLI 命令 | NocoBase beforeLoad |
| **load** | 加载 | require() 插件代码 | 所有系统 |
| **install** | 安装 | 创建 DB 表、写入系统配置、加载 demo 数据 | Odoo data files |
| **afterEnable** | 激活 | 启动定时任务、注册事件监听、开端口 | NocoBase afterEnable |
| **afterDisable** | 停用 | 注销事件、停止定时任务 | NocoBase afterDisable |
| **pre_uninstall** | 卸载前 | 提醒用户备份数据 | Odoo warning |

> **升级流程**: 插件升级通过 D1.7 迁移框架处理（三阶段 SQL 引擎: preload → postsync → postload），不在生命周期钩子中定义独立的 pre_upgrade / post_upgrade。详见 decisions.md D1.4 + D1.7。

### 3.2 迁移三阶段（NocoBase 模式）

1. **beforeLoad**：注册临时表结构（新 schema）
2. **afterSync**：Drizzle 引擎执行 DDL（ALTER TABLE），`version_gated` 防止重复
3. **afterLoad**：验证新表结构可用

### 3.3 插件状态机

| 状态 | 含义 | 触发 |
|------|------|------|
| **draft** | 已注册未加载 | afterAdd |
| **pending** | 等待依赖解析 | beforeLoad |
| **resolving** | 解析依赖中 | 依赖解析 |
| **resolved** | 依赖已解析 | resolved |
| **loaded** | 已加载运行 | install + afterEnable |

Phase 1 仅 **loaded**/**disabled** 两种状态。Phase 2 完整五状态。
Phase 1 所有操作需要服务重启。Phase 2+ 支持热操作（不停机）。

### 3.4 简化操作流程（Phase 1）

| 操作 | 流程 |
|------|------|
| **安装** | stop → 复制 npm 包 → start |
| **升级** | stop → 备份 → 安装新版本 → 运行 D1.7 迁移框架（preload → postsync → postload 三阶段） → start |
| **卸载** | stop → 运行清理脚本 → 删除文件 |

### 3.5 优雅关闭

1. Core 收到 SIGTERM
2. Core 向所有 PluginHost 发送 `shutdown` JSON-RPC notification
3. 等待最多 10s（可配置）
4. 超时未响应 → SIGKILL
5. Core 自身退出

## 四、Phase 1 ProcessPluginHost mock 强制约束

为确保接口设计正确，Phase 1 的 ProcessPluginHost mock 必须实现以下 5 项约束：

1. 所有方法调用返回 Promise（异步语义）
2. 所有参数经过 `JSON.stringify` → `JSON.parse` 序列化
3. 所有返回值经过 `JSON.stringify` → `JSON.parse` 反序列化
4. 30s 超时（超时 reject `TimeoutError`）
5. 随机 1-5ms 延迟注入，模拟 IPC 延迟

## 五、关键设计原则

1. **接口先行**：PluginHost 抽象接口从 Day 1 就支持跨进程通信语义（异步、序列化、错误传播）
2. **Phase 1 用 inline，但必须有 mock**：确保 interface 设计正确，不是事后补丁
3. **Core 进程极简化**：只做编排，不加载插件代码，确保 Core 本身稳定
4. **外部状态**：所有状态存储在 PostgreSQL/Redis，组进程崩溃 → 重启后从外部存储恢复，不依赖进程内存
5. **插件不直接通信**：组内直调函数，组间通过 Core 事件总线（同步 RPC + Redis Pub/Sub），解耦

## 六、分阶段落地计划

| 阶段 | 实现内容 | 目标 |
|------|---------|------|
| **Phase 1 MVP** | inline 模式 + `PluginHost` 接口抽象 + `ProcessPluginHost` mock | 验证架构可扩展性，接口支持未来跨进程 |
| **Phase 2** | process 模式实现 (child_process + JSON-RPC stdin/stdout) + 单插件重启（监听 manifest 变更 → 重启该 PluginHost） | 解决 SPOF，正式环境可用 |
| **Phase 3** | 热重载（manifest 变更 → 重载代码不重启进程） | 减少服务中断，提升开发体验 |
| **Phase 4** | 监督树 + 自动重启 + 熔断 + 健康检查 + 审计日志 | 生产级可靠性 |
| **Phase 5** | container 模式 (Docker/K8s Sidecar) + 插件资源限额 | 第三方不可信插件、SaaS 多租户部署 |
