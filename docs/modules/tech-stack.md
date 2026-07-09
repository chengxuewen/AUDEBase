# 技术栈选型

> 从 `docs/architecture.md` §三 和 `.agents/memorys/decisions.md` 提取。
> 父文档索引见 [architecture.md](../architecture.md)。

## 技术栈总览

| 层级 | 选型 | 理由 |
|------|------|------|
| **主语言** | TypeScript | 类型安全、全栈统一、生态最大 |
| **后端运行时** | Node.js + Fastify | Fastify 插件系统与 AUDEBase 插件框架天然契合；内置 JSON Schema 验证；性能 2-3× Express |
| **ORM** | Drizzle ORM | Type-safe、轻量、SQL-like API、自动参数化防注入 |
| **前端框架** | React 19 + Tailwind CSS v4 | React 生态最大；Tailwind v4 @theme 语法定义设计令牌 |
| **UI 组件** | shadcn/ui + Ant Design 5 | shadcn/ui 负责通用 UI；antd 负责数据密集型场景（Table/Form/Tree/ProTable） |
| **数据库** | PostgreSQL 16+ | 成熟可靠、Schema 支持、行级安全可用于多租户 |
| **缓存/队列** | Redis / Valkey | Phase 1 Redis OSS，Phase 2 Valkey（drop-in replacement，保留 BSD 许可） |
| **任务队列** | BullMQ + Redis | Phase 1 后台任务，Phase 2 Saga 补偿重试 |
| **测试** | Vitest + Playwright | Vitest 用于单元/集成（与 Vite 配置共享），Playwright 用于 E2E |
| **Monorepo 构建** | Turborepo | 并行任务执行、缓存、依赖图 |
| **库构建** | tsup | 基于 esbuild，TypeScript 库打包（零配置） |
| **前端构建** | Vite | 开发 HMR + 生产 Rollup |
| **API 文档** | @fastify/swagger | OpenAPI 3.0 自动生成 |
| **文件存储** | MinIO / S3 兼容 | 插件输出文件、附件存储 |
| **包管理** | pnpm workspace monorepo | 严格依赖隔离、磁盘高效 |
| **验证** | Zod | 边界验证 + TypeScript 类型推导 |
| **日志** | pino | 结构化 JSON 日志、高性能、Fastify 官方推荐 |

## 各技术选型理由（按决策编号）

### D5: TypeScript + Node.js + Fastify

- **决策**: 平台全栈 TypeScript；后端运行时 Node.js + Fastify
- **替代方案**: Python/Django（Odoo 栈）、Java Spring Boot（企业传统选型）、Go（高性能）
- **理由**:
  - TS 全栈统一降低团队技能门槛
  - Fastify 原生插件系统与 AUDEBase 插件框架深度契合——每个业务插件可映射为一个 Fastify 插件实例，享受内置的作用域隔离、生命周期钩子和 JSON Schema 验证能力
  - JSON Schema 验证内置，与 Zod 互补
  - Node.js v22 worker_threads 解决 CPU 密集型任务
  - Odoo 替代方案 Python 单体架构增加了全栈复杂度
- **对比**: Fastify vs Express vs NestJS

| 对比维度 | Fastify | Express | NestJS |
|----------|---------|---------|--------|
| 插件系统 | ✅ 原生支持，与 AUDEBase 对齐 | ❌ 中间件模式，非结构化 | ✅ 模块系统但重量级 |
| 性能 | ✅ 2-3× Express | 基线 | ✅ 与 Fastify 相近 |
| JSON Schema | ✅ 内置 | ❌ 需额外库 | ✅ class-validator |
| 学习曲线 | 低 | 低 | 高（装饰器、DI、模块） |

- **参考**: Fastify 官方文档、NocoBase 技术栈

### D6: React + Tailwind CSS v4 + shadcn/ui + Ant Design 5

- **决策**: React 19 + Tailwind v4 作为基础框架；shadcn/ui 处理通用组件；Ant Design 5 处理数据密集型页面
- **替代方案**: Vue 3 + Element Plus（国内流行但生态略小）、纯 shadcn/ui（Table/Form 不够强）、纯 antd（定制主题不便）
- **理由**:
  - React 生态最大
  - shadcn/ui 可复制不捆绑——组件源码直接纳入项目，非 npm 依赖
  - antd 企业级组件成熟（Table/ProTable、Form/ProForm、Tree、Transfer 等远超 shadcn/ui）
  - 两者共存互补：shadcn/ui 负责通用 UI（按钮、对话框、卡片、布局），antd 负责管理页面（数据表格、复杂表单、树形选择）
  - shadcn/ui 硬依赖 Tailwind v4，两者绑定选择
- **生产策略**: Phase 1 仅使用 shadcn/ui（~577KB gzip）。Phase 2 按需引入 antd 组件，目标总量 <2MB gzip（Bundle Analyzer 监控）
- **参考**: React 官方、shadcn/ui、Ant Design

### D6.1: shadcn/ui 供应链安全

- **决策**: 锁定 shadcn/ui 组件版本（不自动更新），registry URL 指向项目私有 fork
- **理由**: shadcn/ui 的 copy-model 将组件源码直接加入项目（非 npm 依赖），registry 注入攻击可被 Git diff 直接审计
- **审计**: 组件更新通过 PR review + diff 审查（与 npm audit 互补）

### D8: Zod 边界验证

- **决策**: Zod schema 用于所有系统边界输入验证，自动推导 TypeScript 类型
- **理由**:
  - TypeScript 类型推导——`z.infer<typeof schema>` 无需重复定义类型
  - 运行时验证——编译期类型检查 + 运行时守卫
  - 声明式 schema 定义
  - 与 Fastify JSON Schema 互补（Zod 用于业务逻辑边界，Fastify JSON Schema 用于 HTTP 层）
- **安全实践**: 生产环境使用 `safeParse()`（不抛异常，返回 result 对象）；开发环境使用 `parse()`（快速失败 + 清晰堆栈）

### D8.1: JWT 密钥管理

- **决策**: JWT 密钥通过环境变量注入（`AUDE_JWT_SECRET`），启动时校验非空且 ≥32 字符
- **理由**: NocoBase CVE-2025-13877 (CVSS 9.8) — 默认 JWT 密钥导致任意用户冒充
- **实现**: Fastify 启动时 `assert(process.env.AUDE_JWT_SECRET.length >= 32)`，拒绝默认值
- **参考**: OWASP JWT Cheat Sheet

### D9: Drizzle ORM

- **决策**: Drizzle ORM 作为数据库访问层（锁定 0.45.x LTS），通过 DatabaseProvider 抽象层封装
- **理由**:
  - Type-safe —— TypeScript 类型推导覆盖 schema → 查询全链路
  - SQL-like API —— 适合 schema-engine 动态查询构建
  - 自动参数化防注入
  - PlanetScale 收购背书（商业可持续性）
- **风险与缓解**:
  - **风险**: pre-1.0（v1.0 预计 2026 Q3-Q4），CVE-2026-39356 (7.5) 已修复于 v0.42+
  - **缓解**: DatabaseProvider 接口隔离所有业务代码——未来可零成本切换 ORM；CI 集成测试验证迁移兼容性
- **连接池与监控**（D9.1）:
  - 使用 `pg-pool` 连接池（默认 10 连接）
  - pino 记录慢查询（>100ms）
  - Phase 1 通过 Core 日志聚合查看连接池状态
  - Phase 2 引入 PgBouncer 统一连接管理
  - 索引规则：所有包含 `tenant_id` 的查询必须以 `tenant_id` 为首列索引（避免全表扫描）

## 构建与测试工具链

| 工具 | 用途 | 说明 |
|------|------|------|
| **Turborepo** | Monorepo 构建编排 | 并行任务执行、缓存（本地 + 远程）、依赖图 |
| **tsup** | TypeScript 库打包 | 基于 esbuild，零配置，输出 ESM + CJS |
| **Vite** | 前端构建 | 开发 HMR（esbuild）+ 生产 Rollup |
| **@fastify/swagger** | API 文档 | OpenAPI 3.0 自动生成 |
| **Vitest** | 单元/集成测试 | 与 Vite 配置共享，原生 TypeScript 支持 |
| **Playwright** | E2E 测试 | 跨浏览器自动化、截图对比、trace 追踪 |

## 运行时约束

| 约束项 | 值 | 说明 |
|--------|-----|------|
| Core 进程内存上限 | ≤256MB | `--max-old-space-size` 强制 |
| PluginHost 进程内存上限 | ≤128MB | `--max-old-space-size` 强制 |
| 慢查询阈值 | >100ms | pino 记录 |
| pg-pool 默认连接数 | 10 | 可配置 |
| `tenant_id` 索引规则 | 首列索引 | 所有含 `tenant_id` 的查询强制要求 |
| 进程保护 | @fastify/under-pressure | `maxEventLoopDelay=1000ms`, `maxHeapUsedBytes=200MB` |
| 健康检查 | `/health` 端点 | 返回内存、事件循环延迟、连接池状态 |
