# AUDEBase Redis/BullMQ Mock 测试指南

> **创建日期**: 2026-07-13  
> **目的**: 为 Phase 1a 开发者提供 Redis 和 BullMQ 的 mock 策略，使单元测试零外部依赖运行。  
> **参考决策**: D1.3（Redis Pub/Sub）、D1.9（EventBus）、D1.10（BullMQ）

---

## 1. 分层测试策略

| 测试类型 | Redis 策略 | BullMQ 策略 | CI 依赖 |
|----------|-----------|-------------|---------|
| 单元测试 | ioredis-mock | testMode: true | 无 |
| 集成测试 | 真实 Redis（可选） | 真实 BullMQ + Redis | Docker |
| E2E 测试（Playwright） | 真实 Redis | 真实 BullMQ + Redis | Docker |

**原则**: 单元测试不依赖外部服务。仅集成/E2E 测试需要真实 Redis。

---

## 2. ioredis-mock

### 2.1 安装

```bash
pnpm add -D ioredis-mock
```

### 2.2 基本用法

```typescript
import Redis from 'ioredis-mock';

// 透明替换 ioredis — API 完全兼容
const redis = new Redis();

await redis.set('key', 'value');
const val = await redis.get('key'); // 'value'

// Pub/Sub mock 原生支持
await redis.subscribe('events');
redis.on('message', (channel, message) => {
  // channel === 'events'
});
await redis.publish('events', JSON.stringify({ type: 'test' }));

### 2.3 与 ioredis 的差异

| 功能 | ioredis-mock 支持 | 备注 |
|------|:---:|------|
| 基本命令 (SET/GET/DEL/EXISTS) | 是 | 完整支持 |
| Pub/Sub (SUBSCRIBE/PUBLISH) | 是 | mock 版同步触发 |
| Streams (XADD/XREAD) | 部分 | XREADGROUP 不支持 |
| Lua 脚本 (EVAL) | 是 | ioredis-mock v8+ |
| Cluster/连接池 | 否 | 单实例模式 |
| pipeline/transaction | 部分 | MULTI 支持，复杂场景受限 |

---

## 3. BullMQ 测试模式

### 3.1 内置 testMode

BullMQ 内置测试模式，完全脱离 Redis：

```typescript
import { Queue } from 'bullmq';

beforeEach(() => { Queue.testMode = true; });
afterEach(async () => {
  await Queue.testMode.clear();
  Queue.testMode = false;
});
```
```

### 3.2 注入 ioredis-mock

```typescript
import Redis from 'ioredis-mock';
import { Queue, Worker } from 'bullmq';

const connection = new Redis();
const queue = new Queue('test-queue', { connection });

await queue.add('send-notification', { userId: 'u1', message: 'hello' });

// Worker mock
const worker = new Worker('test-queue', async (job) => {
  expect(job.data.userId).toBe('u1');
}, { connection });

const jobCounts = await queue.getJobCounts();
// { waiting: 1, active: 0, completed: 0, ... }
```

---

## 4. createTestApp 辅助函数

### 4.1 条件注入 Redis

```typescript
// packages/core/src/__tests__/helpers/createTestApp.ts
import Redis from 'ioredis-mock';
import { FastifyInstance } from 'fastify';
import { Queue } from 'bullmq';

interface TestAppOptions {
  /** 注入 mock Redis (默认 false) */
  withRedis?: boolean;
  /** 注入 mock BullMQ (默认 false) */
  queues?: string[];
}

interface TestRedis {
  client: ReturnType<typeof Redis>;
  publisher: ReturnType<typeof Redis>;
  subscriber: ReturnType<typeof Redis>;
}

interface TestApp {
  app: FastifyInstance;
  redis: TestRedis | null;
  queues: Record<string, Queue> | null;
}

async function createTestApp(options: TestAppOptions = {}): Promise<TestApp> {
  const { withRedis = false, withBullMQ = false, queues: queueNames = [] } = options;

  // 构建 Fastify（无 Redis — 快速启动）
  const app = await buildApp({ logger: false });

  let redis: TestRedis | null = null;
  let queues: Record<string, Queue> | null = null;

  if (withRedis) {
    const pub = new Redis();
    const sub = new Redis();
    redis = {
      client: pub,     // 通用操作
      publisher: pub,  // Pub 连接
      subscriber: sub, // Sub 连接
    };

    app.decorate('redis', redis);

  if (withBullMQ) {
    if (!redis) {
      throw new Error('withBullMQ requires withRedis: true');
    }

    queues = {};
    for (const name of queueNames) {
      queues[name] = new Queue(name, { connection: redis.client });
    }

    app.decorate('queues', queues);
  await app.ready();
  return { app, redis, queues };
```

### 4.2 使用示例

```typescript
import { createTestApp } from '../helpers/createTestApp';

describe('PluginManager', () => {
  // 无 Redis — 默认行为，纯内存最快
  it('health check', async () => {
    const { app } = await createTestApp();
    const result = await app.inject({ method: 'GET', url: '/health' });
    expect(result.statusCode).toBe(200);
  });

  // 启用 mock Redis Pub/Sub
  it('plugin reload 发布事件', async () => {
    const { app, redis } = await createTestApp({ withRedis: true });

    await redis!.subscriber.subscribe('plugin:loaded');

    await app.inject({ method: 'POST', url: '/api/admin/plugins/reload' });

    const message = await new Promise<string>((resolve) => {
      redis!.subscriber.once('message', (_ch, msg) => resolve(msg));
    });
    expect(JSON.parse(message)).toMatchObject({ event: 'plugin:loaded' });
  });
});
```

---

## 5. EventBus Pub/Sub Mock 示例
Phase 1a EventBus 同进程通信走直接回调，不依赖 Redis。以下展示跨进程 Pub/Sub 路径的 mock 验证：

```typescript
import Redis from 'ioredis-mock';

describe('EventBus Pub/Sub', () => {
  it('publish → subscribe', async () => {
    const pub = new Redis();
    const sub = new Redis();

    const messages: string[] = [];
    await sub.subscribe('events:order.created');
    sub.on('message', (_ch, msg) => messages.push(msg));

    const payload = { type: 'order.created', data: { orderId: 'ord-001' } };
    await pub.publish('events:order.created', JSON.stringify(payload));

    await new Promise((r) => setTimeout(r, 50));
    expect(messages).toHaveLength(1);
    expect(JSON.parse(messages[0]).type).toBe('order.created');
  });

  it('unsubscribe 后不再收到消息', async () => {
    const sub = new Redis();
    const pub = new Redis();
    const messages: string[] = [];
    const handler = (_ch: string, msg: string) => messages.push(msg);

    await sub.subscribe('events:user.deleted');
    sub.on('message', handler);
    await pub.publish('events:user.deleted', '{}');

    await sub.unsubscribe('events:user.deleted');
    sub.off('message', handler);
    await pub.publish('events:user.deleted', '{}');

    await new Promise((r) => setTimeout(r, 50));
    expect(messages).toHaveLength(1);
  });
});
```

---

## 6. BullMQ 定时任务 Mock
```typescript
import Redis from 'ioredis-mock';
import { Queue } from 'bullmq';

describe('Cron', () => {
  it('注册 repeatable job 并验证 schedule', async () => {
    const queue = new Queue('system-cron', { connection: new Redis() });

    // D1.10: manifest cron 声明注册为 repeatable job
    await queue.add('audit-cleanup', { scope: 'daily' }, {
      repeat: { pattern: '0 3 * * *' },
    });

    const jobs = await queue.getRepeatableJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].name).toBe('audit-cleanup');
    expect(jobs[0].pattern).toBe('0 3 * * *');
  });
});
```

---

## 7. CI 集成
### 7.1 Vitest 配置

```typescript
// vitest.workspace.ts
import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  // 单元测试 — 纯内存，无 Redis 依赖
  {
    test: {
      name: 'unit',
      include: ['packages/*/src/**/*.test.ts'],
      exclude: ['packages/*/src/**/*.integration.test.ts'],
      environment: 'node',
    },
  },
  // 集成测试 — 需要 Docker Compose（Redis + PostgreSQL）
  {
    test: {
      name: 'integration',
      include: ['packages/*/src/**/*.integration.test.ts'],
      environment: 'node',
    },
  },
]);
```

### 7.2 CI Pipeline (GitHub Actions)

### 7.2 GitHub Actions

```yaml
jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm test:unit
        # 不启动 Redis — 全部走 mock

  integration-tests:
    runs-on: ubuntu-latest
    needs: unit-tests
    services:
      redis:
        image: valkey/valkey:8
        ports: ['6379:6379']
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: audebase
          POSTGRES_PASSWORD: audebase
          POSTGRES_DB: audebase_test
        ports: ['5432:5432']
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm test:integration
        env:
          AUDE_REDIS_URL: redis://localhost:6379
          AUDE_DATABASE_URL: postgres://audebase:audebase@localhost:5432/audebase_test
          AUDE_JWT_SECRET: test-secret-at-least-32-chars-long
```

---

## 8. 项目约束
### 8.1 测试代码规范

| 规则 | 说明 |
|------|------|
| TypeScript 严格模式 | 无 `as any`、无 `@ts-ignore` |
| 不可变性 | 测试数据使用工厂函数，不共享可变状态 |
| Zod 验证 | mock 消息 payload 用 Zod schema 校验 |
| 无 `console.log` | 使用 vitest 断言 + 结构化日志 |
| AAA 模式 | Arrange → Act → Assert 清晰分层 |
### 8.2 Redis 连接隔离

- **单元测试**: `new Redis()` 各自独立命名空间，天然隔离
- **集成测试**: Redis database index (`select(N)`) 或 BullMQ queue prefix 隔离
- **禁止**: 测试间共享同一 Redis 实例
### 8.3 BullMQ 测试清理

```typescript
afterEach(async () => {
  if (Queue.testMode) await Queue.testMode.clear();
  // 若使用 ioredis-mock 直接连接:
  // await redis!.client.flushall();
});
```
---

## 9. 决策参考
| 决策 | 内容 | 阶段 |
|------|------|:---:|
| D1.3 | 跨组通信 Redis Pub/Sub（JSON-RPC + Pub/Sub） | Phase 1b |
| D1.9 | EventBus: 同进程回调 + 跨进程 Redis Pub/Sub | Phase 1b |
| D1.10 | BullMQ repeatable jobs 定时任务 | Phase 1b |
| D5 | TypeScript 全栈 + Fastify | Phase 1a |
| D8 | Zod 边界验证 | Phase 1a |
| G1 | 不可变性优先 | 通用 |
| G3 | 零 `as any` / `@ts-ignore` | 通用 |

---

## 10. 相关文档

- [dev-workflow.md](dev-workflow.md) — Monorepo 结构与测试策略
- [test-seed-strategy.md](test-seed-strategy.md) — 测试种子数据工厂
- [plugin-communication.md](plugin-communication.md) — 插件通信架构（D1.3）
- [../architecture.md](../architecture.md) — 技术栈总览
- [../../.agents/memorys/decisions.md](../../.agents/memorys/decisions.md) — D1.3/D1.9/D1.10
