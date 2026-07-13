# 插件通信与权限

> 从 `docs/plugin-architecture-analysis.md` 提取。父文档索引见 `docs/architecture.md`。
> 插件框架分组模型与生命周期见 `docs/modules/plugin-framework.md`，多租户见 `docs/modules/multi-tenant.md`。

## 一、通信架构

### 1.1 通信协议栈

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

### 1.2 两种互补的通信模式

| 模式 | 机制 | 延迟 | 适用场景 |
|------|------|------|----------|
| **同步 RPC** | Plugin A → Core → Plugin B (JSON-RPC) | 2-4ms | 查询、请求-响应 |
| **异步 Pub/Sub** | Plugin → Redis Pub/Sub (fire-and-forget) | <1ms | 通知、状态变更 |
| | 发布+订阅端到端延迟 | ~5-20ms (网络 + Redis 处理) | |

**为什么共存？** 同步 RPC 用于需要响应的查询（如「用户 X 是否有权限 Y？」）；异步 Pub/Sub 用于通知和状态变更（如「采购订单创建完成」）。两者不可互相替代——RPC 不适合广播（一对多），Pub/Sub 不适合请求-响应（无返回值）。

### 1.3 组内通信 vs 组间通信

| 维度 | 组内（同进程） | 组间（跨进程） |
|------|-------------|-------------|
| 通信方式 | 直接函数调用（~0ms） | JSON-RPC stdin/stdout |
| 认证 | 不需要 | Token + nonce |
| 序列化 | 不需要（引用传递） | JSON 序列化/反序列化 |
| 故障影响 | 进程内异常可能影响整组 | 仅影响请求超时 |
| 适用场景 | 高频业务逻辑协作 | 跨域查询、异步通知 |

> **租户维度安全**：组内直接函数调用必须通过 PluginHost context 传递 `tenant_id`。Drizzle 查询自动附加 `WHERE tenant_id = context.tenantId`。

### 1.4 IPC 实测数据

Node.js v22, x86_64 Linux：

| 方式 | 100KB 延迟 | 10MB 延迟 |
|------|-----------|----------|
| 函数调用（inline） | ~0ms | ~0ms |
| child_process stdin/stdout (JSON) | ~1.5ms | ~120ms |
| child_process UDS (JSON) | ~1.3ms | ~100ms |
| 冷启动 (child_process fork) | 500ms-2s | — |

**结论**：进程隔离的 IPC 开销在 1-2ms 级别，对绝大多数业务操作可接受。冷启动延迟较高，但仅在插件安装/升级/崩溃恢复时发生。

### 1.5 已识别问题与解决方案

| # | 问题 | 严重度 | 解决方案 | Phase |
|---|------|--------|---------|-------|
| 1 | Core 路由瓶颈 — 高频调用 2-hop 延迟 | HIGH | 高频插件对可协商直连管道，绕过 Core。Core 作为 CA 颁发一次性握手 token | Phase 3 |
| 2 | 无 API 契约 — 插件不知道对方提供什么 | HIGH | manifest.exports 声明 + Zod schema + ServiceRegistry | Phase 2 |
| 3 | 无版本管理 — 升级后接口兼容性未知 | HIGH | manifest.dependencies 版本约束 + Core 启动校验 | Phase 2 |
| 4 | 无流式/大负载 — stdin/stdout 不适合大文件 | MEDIUM | 旁路传输（Redis Stream / 文件路径引用） | Phase 3 |
| 5 | 无死锁检测 — A→B→C→A 循环调用 | MEDIUM | call_depth 计数器 + 30s 超时兜底 | Phase 2 |
| 6 | 无请求优先级 — 健康检查与业务调用混合 | LOW | 帧头 priority 字段，Core 按优先级调度 | Phase 3 |
| 7 | Redis Pub/Sub 无序 — 事件到达顺序不确定 | LOW | 接收方 Lamport 时间戳排序；Phase 2 可选 Redis Stream | Phase 2 |
| 8 | 无调用链追踪 — 跨插件调用链路不可见 | LOW | _metadata 扩展为 OpenTelemetry trace context | Phase 3 |

### 1.6 主流项目通信对比

| 项目 | 同步通信 | 异步通信 | 契约/类型 | 版本管理 | 流式 |
|------|---------|---------|----------|---------|------|
| NocoBase | 直接 import（无 IPC） | app.on/emit | 隐式（TypeScript 类型） | npm 版本号 | 无 |
| Odoo | ORM 继承（内部） | Bus.bus + Longpolling | ORM 字段+方法定义（隐式） | manifest depends | 无 |
| VS Code | commands.executeCommand（共享进程） | EventEmitter | vscode.d.ts | API version | 无（大文件走 URI） |
| gRPC | protobuf + HTTP/2 | 无内置 | .proto 强类型 | protobuf 兼容 | ✅ 原生 |
| Dapr | sidecar 代理 | pub/sub + state | 无 | 无 | 无 |
| NATS | request-reply | subject-based | 无 | 无 | 无 |
| **AUDEBase** | JSON-RPC → Core → JSON-RPC | Redis Pub/Sub | manifest.exports | manifest.dependencies | Phase 3 |

### 1.7 为什么不用 gRPC/NATS？

gRPC 和 NATS 是为**网络通信**设计的，AUDEBase 的通信发生在**同机子进程管道**中：

| 维度 | gRPC | NATS | JSON-RPC stdin/stdout |
|------|------|------|----------------------|
| 传输层适配 | ❌ 需 wrapper | ❌ 需 TCP server | ✅ 原生 stdin/stdout |
| 零网络配置 | ❌ 端口/IP | ❌ server 地址 | ✅ OS 文件描述符 |
| 安全边界 | TLS 证书 | TLS + token | ✅ OS 文件权限 |
| 调试可见性 | ❌ 二进制 | ⚠️ 专用工具 | ✅ 人类可读 |
| 外部依赖 | protoc 编译器 | NATS Server | **零依赖** |
| 契约系统 | ✅ .proto | ❌ | ✅ manifest.exports |

**结论**：传输层保持 JSON-RPC stdin/stdout。Phase 2 在契约层增加 `manifest.exports` 实现类型安全和服务发现。仅在 Phase 3+ 需要流式传输时考虑在同一管道内添加二进制帧模式（MessagePack），而非切换到 gRPC。

### 1.8 通信优化路线图

| Phase | 内容 |
|-------|------|
| **Phase 1** | JSON-RPC stdin/stdout + EventEmitter（当前设计，足够 MVP） |
| **Phase 2** | manifest.exports 契约 + ServiceRegistry + 版本校验 + 死锁检测 + 同步 RPC 超时 + 大文件旁路传输（文件路径引用）+ Redis Stream 可选 |
| **Phase 3** | 直连管道 + 流式传输（二进制帧模式，MessagePack）+ OpenTelemetry trace + 请求优先级 + 按调用方限流 |

---

## 二、IPC 安全

### 2.1 启动握手与帧级认证

每个 PluginHost 在 fork 时通过环境变量接收随机 token：

```
AUD_PLUGIN_IPC_TOKEN=<crypto.randomBytes(32).toString('hex')>
```

每条 JSON-RPC 消息的 params 中包含 `"auth": "<token>"`。Core 在**每条消息到达时**验证 token。认证在**帧级别**执行（每个 content-length 帧携带 auth 字段），不在 RPC 方法级别。Token 不匹配 → Core 立即 kill 子进程。

### 2.2 帧协议与防重放

- **帧格式**：每条消息前缀 `Content-Length: N\r\n\r\n`
- **最大帧大小**：1MB。超过 → Core 返回 JSON-RPC error (code: -32001, message: 'Payload too large')，不关闭连接
- **防重放**：每条消息附带递增 nonce (`auth_nonce`)，Core 拒绝重复 nonce
- **超时**：30s 请求超时（超时 reject Promise）
- **去重**：request_id 去重（忽略重复 ID）
- **清理**：`process.on('exit')` 清理所有未完成 Promise
- **背压控制**：stdin 写端缓冲区满时暂停发送

### 2.3 上下文传递

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

### 2.4 信任边界与通信权限

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

**Core 路由层强制校验 tenant_id**：RPC 请求的 `_metadata.tenant_id` 必须与连接上下文的 tenant_id 一致。不一致 → 记录安全审计日志 + 关闭连接。

### 2.5 直连通道安全模型 — Core 作为 CA

Phase 3 直连管道采用与 HTTPS PKI 类似的信任模型：

1. **Core 作为证书颁发机构（CA）**：持有自签名根证书
2. **握手授权**：Plugin A 需与 Plugin B 直连时，A 向 Core 请求握手 token
3. **Core 审核**：检查访问控制矩阵（信任边界表），确认 A 有权调用 B
4. **颁发 token**：Core 签发 JWT token（含 A/B 身份、有效期 30s、一次性使用）
5. **建立连接**：A 携带 token 通过 stdin/stdout 连接 B，B 验证 token 签名
6. **Core 保留吊销能力**：Core 可随时将 token 加入撤销列表，B 定期轮询撤销列表

直连通道的访问控制仍然受信任边界表约束。

---

## 三、契约系统

### 3.1 Manifest.exports 接口声明

`exports` 定义 RPC 接口契约（面向机器可消费的 API），`provides` 定义功能标签（面向插件市场搜索和依赖解析）。两者互补。

```yaml
# erp-core/manifest.yaml
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

### 3.2 Zod Schema 运行时校验

Zod 运行时验证默认启用。可通过 manifest 配置按插件关闭：

```yaml
runtime:
  skip_zod_validation: true  # 按插件关闭以提升性能
```

### 3.3 ServiceRegistry 与版本管理

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

**插件调用时**：

```typescript
const result = await context.call("erp.purchase.create", {
  supplier_id: "S001",
  items: [{ sku: "ABC", qty: 10 }]
});
// 类型自动推导：{ order_id: string, status: string }
```

> TypeScript 类型在构建时由 `audeus gen-types` 从 manifest.exports 生成。

---

## 四、权限体系

> **权威定义见 [plugin-framework.md](plugin-framework.md) §权限模型**。以下为补充通信层面的权限细节。
### 4.1 Record Rules — 记录级权限

借鉴 Odoo 的 domain filter 表达式。在 `manifest.permissions` 中声明：

```yaml
permissions:
  - name: "erp.purchase.read_own"
    resource: "erp.purchase"
    action: "read"
    record_rule: "[('company_id', '=', user.company_id.id)]"
```

Core 在 RPC 转发时 ORM 层自动注入 WHERE 条件。Phase 1 通过 Drizzle 中间件自动附加 `tenant_id` 过滤。

### 4.2 字段级权限

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

### 4.3 Core 数据 API 代理

插件**默认不直接访问数据库**。所有 DB 操作通过 Core 的数据 API 代理（JSON-RPC）。Core 在 ORM 层自动注入：

1. `tenant_id` 列过滤
2. Record Rules（记录级权限）
3. 字段级可见性过滤

仅 manifest 中声明 `security: { db_direct: true }` 的 Isolated 插件获得独立 PG 连接（需额外审核）。

> 参考：Odoo ORM 单一数据访问路径原则。NocoBase CVE GHSA-v8vm-cqh8-q87q 证明了直连数据库的风险。

---

## 五、Saga 跨插件事务 (Phase 4 设计，Phase 1a/1b 不实现)

跨插件工作流涉及多步骤时，Core 编排 Saga 补偿模式：

```
步骤1: execute_erp_order()  ──→ 失败则 compensate_erp_order()
步骤2: execute_mes_schedule() ──→ 失败则 compensate_mes_schedule() + compensate_erp_order()
步骤3: execute_wms_pick()    ──→ 失败则 compensate_wms_pick() + 补偿前两步
```

每个步骤提供 `execute()` 和 `compensate()` 回调。任何步骤失败，Core 按逆序执行已完成步骤的 `compensate()`。

### Saga 可靠性

- **持久化**：所有 Saga 步骤记录到 PostgreSQL `saga_log` 表（含状态、重试次数、创建时间）
- **重试**：补偿操作支持重试（最多 3 次，指数退避）
- **幂等性**：每个步骤携带 `idempotency_key`
- **已知限制**：Core 重启后需恢复未完成 Saga，此项标注为已知限制（外部状态表可在 Core 恢复后重放）

---

## 六、事件模型

基于 key 的事件订阅模型：

- 事件通过 JSON-RPC notification 发布，method: `publish`
- 订阅通过 Core 注册：`plugin.subscribe("erp:order:created")`
- 通配符支持：`plugin.subscribe("erp:*")` 订阅所有 erp 前缀事件
- Phase 1 (inline)：使用 EventEmitter
- Phase 2+ (process)：Redis Pub/Sub，API 不变

### 多租户隔离

所有 Pub/Sub channel 使用租户前缀：

```
{tenant_id}:plugin:event_name
```

Core 验证插件只能订阅自己租户命名空间内的 channel。

通配符订阅自动追加租户前缀。`plugin.subscribe('erp:*')` → Core 解析为 `{tenant_id}:erp:*`，仅匹配当前租户 channel。

---

## 七、可观测性

- Core 聚合所有 PluginHost 的结构化 JSON 日志（含 request_id 关联）
- 每个 PluginHost 暴露 Node.js inspector 端口用于调试
- Phase 1：标准 Node.js debug
- Phase 2+：每进程独立 inspector 端口 (9229+offset)
- 健康检查协议：JSON-RPC 方法 `plugin:health` → `{"status":"ok","uptime":12345,"memory":123456789}`（5s 超时）

## 八、优雅关闭

关闭序列：
1. Core 收到 SIGTERM
2. Core 向所有 PluginHost 发送 `shutdown` JSON-RPC notification
3. 等待最多 10s（可配置）
4. 超时未响应 → SIGKILL
5. Core 自身退出
