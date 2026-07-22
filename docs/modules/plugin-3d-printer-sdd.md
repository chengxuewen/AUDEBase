# plugin-3d-printer — SDD

**状态**: ✅ SDD 完成
**包**: `@audebase/plugin-3d-printer` + 3D 打印机 Agent
**参考**: `docs/superpowers/specs/2026-07-22-phase1a-execution-plan.md` §3.4–§3.5, D25.6.1–D25.6.3
**依赖**: NocoBase v2.1.29 (`@nocobase/server`, `@nocobase/client`)
**生成日期**: 2026-07-22

---

## 1. 概要

**职责边界**: 3D 打印机 MVP 业务插件。提供打印任务管理、设备管理、材料管理三个核心域，以及一个 HTTP polling Agent 接收打印机心跳和下发命令。

**设计目标**:
- 3 个 NocoBase Collection（print_jobs / devices / materials）覆盖 3D 打印机核心数据模型
- Agent HTTP polling（5s interval）替代 WebSocket，零外部依赖（D25.6.1）
- 3 个 SchemaComponent 页面（JSON schema 驱动，非手写 JSX）
- 30 秒心跳超时检测设备离线（D25.6.3）
- Agent 崩溃恢复：启动时查询 in-progress 任务恢复状态

**已砍功能（团队审查采纳）**:
- `StatsPage` — 推迟到运营需要仪表盘时
- `costPerKg` 字段 — 推迟到成本追踪需求时
- WebSocket 实时推送 → HTTP polling
- 3D 打印机 RBAC — Phase 1a MVP 无权限控制，Phase 1b NocoBase ACL

**不在范围内**:
- 真实打印机硬件交互（Phase 1a stub: 仅 log 命令）
- G-code 切片/预览
- 多租户隔离（Phase 1b）

## 2. 接口定义

### 2.1 Collection 定义

#### print_jobs Collection (`src/server/collections/print-jobs.ts`)

```typescript
const printJobsCollection = {
  name: 'print_jobs',
  fields: [
    { name: 'name', type: 'string' },
    { name: 'status', type: 'string', uiSchema: {
      enum: ['queued', 'printing', 'paused', 'completed', 'failed', 'cancelled']
    }},
    { name: 'modelFile', type: 'string' },  // URL/path (NocoBase attachments integration → Phase 1b)
    { name: 'sliceSettings', type: 'json' },
    { name: 'deviceId', type: 'belongsTo', target: 'devices' },
    { name: 'materialId', type: 'belongsTo', target: 'materials' },
    { name: 'progress', type: 'integer' },   // 0-100
    { name: 'estimatedTime', type: 'integer' }, // seconds
    { name: 'actualTime', type: 'integer' },
    { name: 'startedAt', type: 'datetime' },
    { name: 'completedAt', type: 'datetime' },
  ],
};
```

#### devices Collection (`src/server/collections/devices.ts`)

```typescript
const devicesCollection = {
  name: 'devices',
  fields: [
    { name: 'name', type: 'string' },
    { name: 'serialNumber', type: 'string', unique: true },
    { name: 'firmwareVersion', type: 'string' },
    { name: 'status', type: 'string', uiSchema: {
      enum: ['online', 'offline', 'printing', 'error']
    }},
    { name: 'lastHeartbeat', type: 'datetime' },
  ],
};
```

#### materials Collection (`src/server/collections/materials.ts`)

```typescript
const materialsCollection = {
  name: 'materials',
  fields: [
    { name: 'name', type: 'string' },
    { name: 'type', type: 'string', uiSchema: {
      enum: ['PLA', 'ABS', 'PETG', 'TPU', 'other']
    }},
    { name: 'color', type: 'string' },
    { name: 'diameter', type: 'float' },   // 1.75 or 2.85
    { name: 'remainingWeight', type: 'float' },  // grams
    // costPerKg: 已砍
  ],
};
```

### 2.2 Plugin 类 (`src/server/plugin.ts`)

```typescript
import { Plugin } from '@nocobase/server';

export class Plugin3DPrinter extends Plugin {
  async load() {
    // 注册 Collections
    this.db.collection(printJobsCollection);
    this.db.collection(devicesCollection);
    this.db.collection(materialsCollection);

    // 注册 Agent HTTP 端点
    this.app.resourcer.define({
      name: 'agent',
      actions: {
        poll: agentPollHandler,
      },
    });
  }
}
```

### 2.3 Agent HTTP 端点 (`src/server/agent/agent-handler.ts`)

```
POST /api/agent:poll

Request (JWT Bearer token required):
{
  deviceId: string,
  status: 'idle' | 'printing',
  progress?: number    // 0-100, present when status='printing'
}

Response:
{
  command: 'start' | 'pause' | 'cancel' | null,
  jobId?: string,      // present when command='start'
  fileUrl?: string     // present when command='start'
}

Behavior:
- Updates devices.lastHeartbeat = NOW()
- Updates devices.status = request.status
- If request.progress present → updates print_jobs.progress, print_jobs.actualTime
- If device has queued print_job → return command='start' + jobId
- If current job.status='paused' → return command='resume'
- If current job.status='printing' and admin clicked 'pause' → return command='pause'
- If current job.status='printing' and admin clicked 'cancel' → return command='cancel'
- Otherwise → return command=null
```

命令状态机：

```
         ┌──────────────────────────────────────────┐
         │                                          │
    ┌────▼────┐  start   ┌──────────┐  complete  ┌──▼──────┐
    │ queued  ├─────────►│ printing ├───────────►│completed│
    └─────────┘          └──┬───┬───┘            └─────────┘
                            │   │
                     pause  │   │ cancel
                       ┌────▼┐ ┌▼──────┐
                       │paused│ │cancelled│
                       └──┬───┘ └───────┘
                          │ resume
                          ▼
                      printing
```

### 2.4 Admin 页面

#### PrintJobsPage (`src/client/PrintJobsPage.tsx`)

SchemaComponent，JSON schema 驱动渲染。

- **Table block**: 列 = name, status(彩色 Badge), device(name via belongsTo), material(name via belongsTo), progress(进度条), estimatedTime, createdAt
- **Filter block**: status dropdown, deviceId select
- **Form block**: 创建/编辑：name, deviceId(select), materialId(select), modelFile(URL input), sliceSettings(json editor)
- **Refresh**: 2 秒 polling（ProTable `pollInterval: 2000`）
- **Actions**: 创建、编辑、删除、暂停、取消、恢复（基于 status 条件显示）

#### DevicesPage (`src/client/DevicesPage.tsx`)

SchemaComponent，JSON schema 驱动渲染。

- **Table block**: 列 = name, serialNumber, status(彩色 Badge), firmwareVersion, lastHeartbeat(相对时间 "3 min ago")
- **Filter block**: status dropdown
- **Form block**: 创建/编辑：name, serialNumber, firmwareVersion
- **Actions**: 创建、编辑、删除

#### MaterialsPage (`src/client/MaterialsPage.tsx`)

SchemaComponent，JSON schema 驱动渲染。

- **Table block**: 列 = name, type, color(色块 Badge), diameter, remainingWeight
- **Filter block**: type dropdown
- **Form block**: 创建/编辑：name, type(select), color(color picker), diameter(number), remainingWeight(number)
- **Actions**: 创建、编辑、删除

### 2.5 3D 打印机 Agent (`agent/`)

独立 Node.js 脚本，零外部依赖（Node.js v22 内置 `fetch`），~150 行。

```
agent/
├── agent.js          # 主脚本
├── package.json      # 零 deps, "type": "commonjs"
└── config.json       # chmod 0600
```

#### config.json

```json
{
  "serverUrl": "http://localhost:13000",
  "deviceId": "<replace-with-device-uuid>",
  "password": "<replace-with-device-password>"
}
```

安全性：`chmod 0600 config.json`；覆写：`AUDE_DEVICE_ID` / `AUDE_DEVICE_PASSWORD` 环境变量；Phase 1b：设备证书替代密码。

#### agent.js 核心函数

```typescript
// 函数签名（JavaScript，非 TS）
async function login(): Promise<string>           // POST /api/auth:signIn, 指数退避 5 次
async function recoverState(deviceId): Promise    // 启动后查询 in-progress 任务
async function poll(deviceId): Promise             // POST /api/agent:poll, 每 5 秒
async function reportProgress(jobId, progress): Promise<void>  // POST /api/print_jobs:update, 非致命

// main
(async () => {
  const token = await login();
  await recoverState(config.deviceId);
  setInterval(() => poll(config.deviceId), 5000);
})();
```

**Token 管理**: `login()` 记录 `TOKEN_AGE = Date.now()`；`poll()` 前检查：`Date.now() - TOKEN_AGE > 600_000` → 重新 `login()`。

**错误恢复**: `consecutiveFailures` 计数器。每次 catch → +1；成功 → 重置 0。超过 10 → `console.error` + `process.exit(1)`。

## 3. 生命周期

**NocoBase 插件生命周期**（遵循 NocoBase PluginManager 钩子）:

| 钩子 | 行为 |
|------|------|
| `load()` | 注册 3 个 Collection 定义 → `this.db.collection(schema)` |
| `load()` | 注册 Agent HTTP 端点 → `this.app.resourcer.define()` |
| `load()` | 注册 3 个 Admin 页面路由（NocoBase client 端路由注册） |

**Agent 生命周期**:

| 阶段 | 行为 |
|------|------|
| 启动 | `login()` 获取 JWT → `recoverState()` 恢复 in-progress 任务 |
| 运行 | `setInterval(poll, 5000)` 心跳 + 命令轮询 |
| 崩溃恢复 | Agent 重启 → `recoverState()` 查询 `status='printing'` 任务 |
| 网络断开 | `poll()` catch → consecutiveFailures++ → 自动重连（下次 interval） |
| 致命错误 | consecutiveFailures > 10 → `process.exit(1)` |

**心跳超时检测（服务端）**: `devices.lastHeartbeat` 超过 30 秒未更新 → 标记 `devices.status = 'offline'`。

## 4. 依赖关系

| 依赖 | 类型 | 版本 | 用途 |
|------|:---:|------|------|
| `@nocobase/server` | runtime | ^2.1.29 | Plugin 基类 + Collection API + Resource 路由 |
| `@nocobase/client` | runtime | ^2.1.29 | SchemaComponent + ProTable/ProForm + Admin 路由注册 |
| `typescript` | devDep | ^5.x | 编译期类型检查 |
| `vitest` | devDep | ^3.x | 单元测试 |
| `@testing-library/react` | devDep | ^16.x | Admin 页面组件测试 |
| `@playwright/test` | devDep | ^1.x | E2E 冒烟测试 |

**Agent 依赖**: 零外部依赖（Node.js v22 内置 `fetch`）。

**被依赖方**: 独立业务插件，不被其他 AUDEBase 包依赖。

## 5. 错误码与错误处理

| 错误码 | 触发条件 | 恢复策略 |
|--------|---------|---------|
| `AGENT_AUTH_FAILED` | Agent login 5 次重试全部失败 | Agent `process.exit(1)` |
| `AGENT_NETWORK_ERROR` | poll() HTTP 请求失败 | consecutiveFailures++，下次 interval 自动重试 |
| `AGENT_FATAL` | consecutiveFailures > 10 | `process.exit(1)`，需人工介入 |
| `HEARTBEAT_TIMEOUT` | devices.lastHeartbeat 超过 30 秒 | 标记 device.status='offline' |
| `JOB_NOT_FOUND` | Agent 收到 jobId 但 print_job 已被删除 | Agent 忽略该命令，下次 poll 返回 null |
| `DEVICE_NOT_FOUND` | Agent 携带的 deviceId 在 DB 中不存在 | 服务端返回 404，Agent consecutiveFailures++ |
| `INVALID_STATUS_TRANSITION` | 非法状态转换（如 completed→printing） | 服务端返回 400，Agent 忽略命令 |
| `COLLECTION_REGISTRATION_FAILED` | NocoBase Collection 注册失败 | Plugin load() 异常 → NocoBase 跳过该插件 |

## 6. 安全考虑

| 安全点 | 措施 |
|--------|------|
| Agent 认证 | JWT Bearer token（login 后携带），每次 poll 前检查 token 过期（>10 min → refresh） |
| 配置安全 | `config.json` → `chmod 0600`（仅 owner 可读写） |
| 凭证覆写 | 环境变量 `AUDE_DEVICE_ID` / `AUDE_DEVICE_PASSWORD` 优先于 config.json |
| RBAC | Phase 1a MVP 无 RBAC。Phase 1b: NocoBase ACL（admin 全权限 + operator 仅查看） |
| SQL 注入 | 所有 CRUD 通过 NocoBase Collection Repository API（Sequelize 参数化查询） |
| 输入验证 | Agent HTTP 端点使用 NocoBase 内置的 resource action 参数校验 |
| 密码存储 | Agent 密码在 NocoBase `users` 表中 bcrypt 哈希存储（继承 NocoBase 内置认证） |

## 7. Mock 约束

**NocoBase Database mock**（用于 Agent handler 单元测试）:
- `db.getCollection(name).repository.find()` → Promise<Record[]>
- `db.getCollection(name).repository.findOne()` → Promise<Record | null>
- `db.getCollection(name).repository.create()` → Promise<Record>
- `db.getCollection(name).repository.update()` → Promise<void>
- 所有方法必须 async（返回 Promise）
- 响应数据必须 JSON 序列化/反序列化

**HTTP endpoint mock**（用于 Agent 单元测试）:
- 使用 `vi.mock('node:http')` 或 nock 库 mock fetch
- 模拟 NocoBase `/api/auth:signIn` 和 `/api/agent:poll` 端点

**Admin UI mock**（用于页面组件测试）:
- NocoBase SchemaComponent 渲染需 `SchemaComponentProvider` wrapper
- 使用 `vi.mock('@nocobase/client')` mock NocoBase client API

## 8. 变更记录

| 日期 | 版本 | 变更 | 作者 |
|------|------|------|------|
| 2026-07-22 | 1.0 | 初始 SDD：3 Collections + Agent HTTP polling + 3 SchemaComponent 页面 | AI Agent |
