# 后端 28→15 包底座裁剪清单

**日期:** 2026-07-23  
**决策:** D26 — Refine+ProLayout+自建15包底座  
**来源:** `docs/superpowers/specs/2026-07-23-refine-hybrid-architecture-design.md`

## ✅ 保留 (14包)

| 包名 | 说明 | 依赖 core |
|------|------|-----------|
| core | Fastify 服务 + 中间件 + CRUD API | — |
| auth | JWT 签发/验证 + token_version | ✅ |
| rbac | 权限引擎 + 路由守卫 | ✅ |
| schema-engine | 动态模型定义 + Schema→DB/UI | — |
| plugin-framework | 四层信任分组 + PluginHost 抽象 | ✅ |
| manifest-engine | manifest.yaml 解析/验证 | — |
| migration | Scanner→Resolver→Executor→Runner | — |
| health-check | GET /health + /health/ready | ✅ |
| logging-infra | pino 结构化日志 + X-Request-ID | — |
| shared-types | 公共类型定义 + Zod schemas | ✅ |
| i18n | I18nEngine + namespace 隔离 | — |
| audit | 写操作自动审计 + onResponse hook | ✅ |
| cli | aude dev/db:migrate/plugin:create | — |
| rate-limit | 固定窗口计数器限流 | ✅ |

## 🟡 待評估 (3包)

| 包名 | 说明 | 理由 |
|------|------|------|
| plugin-core | Bootstrap 引导（admin 用户、默认角色） | core/app.ts 緊密耦合；暫留 |
| cron | BullMQ repeatable jobs | cron 声明解析+调度器，暂留 Phase 1a |
| notification | NotificationProvider 抽象接口 | 接口已注入，暂留但 app.ts 中注释实例化 |

## ❌ 砍/Phase 2 恢复 (11包)

| 包名 | 说明 | 恢复阶段 |
|------|------|----------|
| event-bus | EventBus publish/subscribe | Phase 2 |
| websocket | Collection 变更事件实时推送 | Phase 2 |
| plugin-communication | 组间 JSON-RPC + Redis Pub/Sub | Phase 2 |
| api-versioning | URL 路径 /api/v{major}/{resource} | Phase 2 |
| data-extends | 插件间 extends 声明 + 字段合并 | Phase 2 |
| file-upload | FileUploadService + AttachmentRepository | Phase 2 |
| workflow-core | Saga 工作流核心 | Phase 2 |
| workflow-engine | 工作流执行引擎 | Phase 2 |
| workflow-tasks | 工作流任务节点 | Phase 2 |
| plugin-example | 参考插件模板 | Phase 2 (更新) |
| canonical-schema | 平台无关 JSON Schema → Drizzle | Phase 2 |
