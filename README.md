# AUDEBase

AUDEBase — 企业应用开发平台。微内核 + 插件热插拔架构，支持 OA、ERP、MES、PLM、WMS 等企业应用快速开发与部署。对标 Odoo、NocoBase、云表。

## 核心理念

**"插件即应用"** — 每个业务系统以独立插件套件形式运行在统一平台上，支持安装、升级、卸载、热更新。

## 技术栈

- **语言**: TypeScript 全栈
- **后端**: Node.js + Fastify
- **前端**: React 19 + Tailwind CSS v4 + shadcn/ui + Ant Design 5
- **数据库**: PostgreSQL + Drizzle ORM
- **缓存**: Redis
- **包管理**: pnpm workspace monorepo

## 架构

```
AUDEBase
├── 插件层    OA 插件 │ ERP 插件 │ MES 插件 │ ...
├── 服务层    Schema Engine │ RBAC │ Workflow │ 日志
├── 内核      Plugin Framework (加载/卸载/热更新/依赖)
└── 基础设施  Node.js │ PostgreSQL │ Redis
```

详见 [docs/architecture.md](docs/architecture.md)

## 开发状态

当前处于 Phase 0 — 架构定义与基础设施初始化阶段。Phase 1 MVP 计划实现：
- 插件框架
- 基础 RBAC
- 日志基础设施
- 最小管理 UI
- 多租户

## 许可

Apache 2.0
