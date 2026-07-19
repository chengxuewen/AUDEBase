# AUDEBase 插件 5 分钟快速上手

本指南帮助你在 5 分钟内创建第一个 AUDEBase 插件，启动开发服务器，并在管理后台看到它运行。

## 前提条件

- **Node.js** 22+
- **pnpm** 10+（`corepack enable && corepack prepare pnpm@10.33.3 --activate`）
- **Docker Desktop**（提供 PostgreSQL 16 + Redis 7）

确认 AUDEBase 项目已按 [README](../../README.md) 启动：

```bash
# 1. 克隆并启动基础设施
git clone https://gitee.com/chengxuewen/AUDEBase.git
cd audebase
cp .env.template .env
# 编辑 .env — 设置 AUDE_JWT_SECRET（32+ 字符）和 AUDE_DB_PASSWORD
docker compose up -d
pnpm install
pnpm db:migrate
```

## 第一步：创建插件骨架（30 秒）

使用脚手架命令生成插件：

```bash
aude plugin scaffold my-app --partition oa
# 可选：--mode inline（默认） --with-models（包含数据模型）
```

`aude plugin list` 查看已加载的插件；`aude plugin info my-app` 查看详情。

插件最小结构：

## 第二步：编写最小插件

创建 `packages/plugin-myapp/manifest.yaml`：

```yaml
name: "@audebase/plugin-myapp"
version: "0.1.0"
display_name: "My App"
description: "我的第一个插件"
category: "oa"
license: "Apache-2.0"
application:
  entry: "./src/index.ts"
dependencies: []
runtime:
  mode: inline
  partition: oa
lifecycle:
  auto_install: false
  migration_version: "0.1.0"
security:
  db_namespace: "public"
```

创建 `packages/plugin-myapp/src/index.ts`：

```typescript
import type { PluginInstance } from '@audebase/plugin-framework';

export class MyAppPlugin implements PluginInstance {
  readonly name = '@audebase/plugin-myapp';

  // ===== 生命周期钩子（除 load 外均可选）=====

  async afterAdd(): Promise<void> {
    // 插件注册后调用
  }

  async beforeLoad(): Promise<void> {
    // 加载前准备
  }

  async load(): Promise<void> {
    // 必填 — 加载插件代码
    // 通过 Kernel 注入的 context 注册路由、服务等
  }

  async install(): Promise<void> {
    // 首次安装 — 创建数据库表
  }

  async afterEnable(): Promise<void> {
    // 启用后 — 启动定时任务、事件监听
  }

  async afterDisable(): Promise<void> {
    // 禁用后 — 清理资源
  }

  async preUninstall(): Promise<void> {
    // 卸载前 — 提醒备份
  }
}

/** 工厂函数 — PluginManager 调用此函数创建实例 */
export function createPlugin(): MyAppPlugin {
  return new MyAppPlugin();
}
```
> 完整示例见 `packages/plugin-example/src/index.ts`。

## 第三步：自动发现

AUDEBase 启动时自动扫描 `packages/*/manifest.yaml`，无需手动注册配置文件。
只要插件目录下有合法的 `manifest.yaml`，就会被 Core 发现并加载。

## 第四步：启动并验证（60 秒）

```bash
pnpm dev
```

启动后访问：

- **管理后台**: http://localhost:5173
- **Kernel API**: http://localhost:3000

查看插件是否已加载：

```bash
curl http://localhost:3000/api/plugins
# 返回已加载的插件列表，应包含 @audebase/plugin-myapp
```
## manifest.yaml 速览

manifest.yaml 是插件的「身份证」，声明元数据、依赖、权限、模型：

```yaml
name: "@audebase/plugin-myapp"
version: "0.1.0"
display_name: "My App"
description: "我的第一个 AUDEBase 插件"
category: "oa"
license: "Apache-2.0"
application:
  entry: "./src/index.ts"
  author: "Your Name"

# 插件依赖（空数组表示无依赖）
dependencies: []

# 运行时配置
runtime:
  mode: inline       # inline | process | container
  partition: oa      # SYSTEM | oa | erp | mes | isolated
  crash_policy: restart

# 生命周期配置
lifecycle:
  auto_install: false

# 安全配置
security:
  db_namespace: "public"

# 数据模型声明
models:
  - name: tasks
    table: myapp_tasks
    fields:
      - name: id
        type: uuid
        primary: true
        default: uuid_generate_v4()
      - name: title
        type: text
        required: true
      - name: done
        type: boolean
        default: false

# 权限声明
permissions:
  - tasks:create
  - tasks:read
  - tasks:update
  - tasks:delete
```

## 关键概念速记

| 概念 | 说明 |
|------|------|
| `manifest.yaml` | 插件元数据声明文件，Core 启动时自动扫描发现 |
| `PluginInstance` | 插件实例接口，定义 7 个生命周期钩子 |
| `partition` | 插件所属信任域（SYSTEM / oa / erp / mes / isolated） |
| `mode: inline` | Phase 1 模式 — 插件与 Core 同进程运行 |
| `createPlugin()` | 工厂函数，PluginManager 调用它创建插件实例 |
| 自动发现 | Core 扫描 `packages/*/manifest.yaml`，无需注册文件 |
## 下一步

- [插件开发指南](../modules/plugin-development.md) — 完整开发手册
- [数据模型与权限](02-model-and-permission.md) — 声明复杂数据模型
- [管理 UI 开发](03-admin-ui.md) — 为插件添加管理页面
- [生命周期详解](04-lifecycle.md) — 7 个生命周期钩子深度解析

## 故障排查

| 问题 | 解决方法 |
|------|---------|
| 插件未被加载 | 确认 `packages/{name}/manifest.yaml` 存在且格式正确 |
| manifest 解析失败 | 检查 YAML 语法，确保必填字段（name/version/runtime）存在 |
| 数据库连接失败 | 确认 `docker compose up -d` 已启动 PostgreSQL |
| API 返回 404 | 确认路由已在 `load()` 中通过 Kernel 注入的 router 注册 |
| `pnpm dev` 报错 | 确认 `pnpm install` 已执行；检查 `.env` 中 JWT_SECRET 设置
