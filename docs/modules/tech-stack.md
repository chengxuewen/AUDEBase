# AUDEBase 技术栈选型

> 从 `docs/architecture.md` §三 + `.agents/memorys/decisions.md` D5-D9/D6.1/D8.1/D9.1 提取
> Phase 1a — 架构定义阶段。编码实施时补充详细配置参数。

## 总览

| 层级 | 选型 | 决策 | 状态 |
|------|------|------|:---:|
| 语言 | TypeScript | D5 | 已决策 |
| 后端 | Node.js + Fastify | D5 | 已决策 |
| ORM | Drizzle ORM (0.45.x LTS) | D9 | 已决策 |
| 前端 | React 19 + Ant Design 5（ProLayout + ProTable/ProForm） | D6 | 已决策 |
| 数据库 | PostgreSQL 16+ | — | 已决策 |
|| 任务队列 | BullMQ + Valkey（Redis 兼容） | — | 已决策 |
| 测试 | Vitest + Playwright | — | 已决策 |
| 构建 | Turborepo + tsc + tsc-alias（后端）+ Vite（前端） | — | 已决策 |
| 验证 | Zod | D8 | 已决策 |
| 日志 | pino | — | 已决策 |

## 关键选型理由

### D5: TypeScript 全栈 + Node.js + Fastify
- 全栈 TS 统一降低团队技能门槛
- Fastify 原生插件系统与 AUDEBase 插件框架深度契合
- JSON Schema 验证内置
- Node.js v22 worker_threads 解决 CPU 密集型

### D6: React 19 + Ant Design 5
- NocoBase 已验证 Ant Design 5 可独立覆盖企业平台全部 UI 需求
- 单一组件库消除库间主题冲突
- ProTable/ProForm 为 AUDEBase 差异化选择（NocoBase 仅用 ProLayout）

### D9: Drizzle ORM
- Type-safe、SQL-like API 适合 schema-engine
- 通过 DatabaseProvider 接口抽象（更换 ORM 零成本）
- 锁定 0.45.x LTS

## 安全策略

- **JWT 密钥**（D8.1）：环境变量注入，启动校验 ≥32 字符
- **供应链安全**（D6.1）：antd 精确版本锁定 + npm audit 每次 PR + Renovate 自动升级

## 参考

- decisions.md: D5-D9, D6.1, D8.1, D9.1
- architecture.md: §三
