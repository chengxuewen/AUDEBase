# AUDEBase 编码约定

**更新日期**: 2026-07-19

## 命名约定

- **项目名**: `AUDEBase` 全大写
- **npm scope**: `@audebase/`
- **变量/函数**: `camelCase`，描述性命名
- **布尔值**: 前缀 `is`/`has`/`should`/`can`
- **接口/类型/组件**: `PascalCase`
- **常量**: `UPPER_SNAKE_CASE`
- **自定义 hooks**: `use` 前缀 + camelCase
- **manifest 字段**: `mode`（inline|process|container）、`partition`（SYSTEM|oa|erp|mes|isolated）
- **插件包名**: `@audebase/plugin-{name}`
- **路由名称**: dot 命名约定（如 `admin.erp.purchase`），分组使用 `type: 'group'` 显式注册
- **Slot 名称**: dot 命名约定（如 `header.actions.right`、`sidebar.bottom`、`settings.panels`）
- **i18n namespace**: 双命名空间 — 插件包名（`@audebase/plugin-{name}`）+ 全局共享 `'client'`
- **TanStack Query key**: 强制 `[pluginName, ...]` 前缀（避免插件间缓存冲突）

## TypeScript 规范

- 公共 API 显式类型注解
- `interface` 优先于 `type`（对象形状）
- `unknown` > `any`
- Zod 用于边界层模式验证
- 禁止 `as any` / `@ts-ignore` / `console.log`
- 使用 readonly 和不可变模式

## 不可变性

- 永远创建新对象，不就地修改
- 使用展开运算符进行不可变更新
- `Readonly<T>` 用于函数参数

## 文件组织

- 高内聚，低耦合
- 200-400 行典型，800 行最大
- 按功能/领域组织，非按类型
- 从大模块中提取工具函数

## 错误处理

- 在每一层显式处理错误
- 用户界面提供用户友好的错误消息
- 服务端记录详细的错误上下文
- 永不静默吞异常

## 输入验证

- 所有系统边界使用 Zod 验证
- Zod schema 推导 TypeScript 类型
- 快速失败并给出清晰错误消息
- 不信任外部数据

## 代码质量

- 函数 < 50 行
- 文件 < 800 行
- 嵌套 < 4 层
- 无魔术数字（使用命名常量）
- 优先使用早期返回减少嵌套

## 前端特定规范

- **UI 组件**: Ant Design 5 为唯一 UI 库，不使用其他组件库
- **错误隔离**: 每插件路由 ErrorBoundary + Slot 逐组件 ErrorBoundary（使用 react-error-boundary）
- **权限检查**: 使用 `useACL().can()` / `<ACLGuard>` 声明式权限控制，不使用内联条件判断
- **路由注册**: 仅通过 `this.app.router.add()` API 注册，不在组件内直接使用 `<Route>`
- **Slot 注册**: 通过 `this.app.slot.add()` API 注册到预定义命名 Slot
- **翻译调用**: React 组件使用 `useTranslation(pluginPkgName)` Hook；插件类使用 `this.t()`
- **动态导入**: `lazy: () => import(...)` 必须为箭头函数直接返回 import()——禁止 `async` 包装和 `React.lazy()` 包装

## SDD/TDD 文档约定

### SDD 文档命名与结构

- **命名**: `{module-name}-sdd.md`（如 `plugin-framework-sdd.md`）
- **存储**: `docs/modules/{module-name}-sdd.md`
- **标准结构**:
  1. **概要**: 模块定位、职责边界、设计目标
  2. **接口定义**: 所有导出 API 的类型签名、参数描述、返回值
  3. **生命周期**: 启动/关闭/加载/卸载顺序、钩子函数签名
  4. **依赖关系**: 对其他模块或外部服务的依赖列表
  5. **错误码与错误处理**: 错误码枚举、恢复策略、日志级别
  6. **安全考虑**: 权限检查点、数据过滤规则
  7. **Mock 约束**: Phase 1 测试用的 mock 接口约束（async Promise、JSON 序列化、超时等）
  8. **变更记录**: 此文档的版本历史

### TDD 测试计划格式

- **文件命名**: `{module}.test.ts`（单元测试）/ `{module}.spec.ts`（E2E 测试）/ `{module}.contract.test.ts`（API Contract 测试）
- **AAA 结构**: 每个测试用例必须遵循 Arrange → Act → Assert 三段式，用注释标注三段边界
- **覆盖率**: 80% 最低覆盖率，CI 集成覆盖率闸门
- **种子工厂**: 集成测试使用 docs/modules/test-seed-strategy.md 定义的 seed factory + transaction rollback
- **Mock 约束**: ProcessPluginHost mock 必须满足 5 项约束（async Promise、JSON 序列化/反序列化、30s 超时、1-5ms 延迟注入）
- **测试用例命名**: `test('{scenario description}')` 描述性名称，必须体现测试行为

### AI 代理工作流约定

- **SDD 生成**: AI 代理在编码前根据 architecture.md + phase-planning.md 需求生成 SDD 文档
- **测试优先**: AI 代理在编码前根据 SDD 接口定义生成测试计划（TODO 列表 + 测试文件骨架）
- **文档同步**: 编码完成后 AI 代理必须同步更新 AGENTS.md（CODEMAP + SDD 索引）和 .agents/memorys/

## 术语表

| 术语 | 含义 |
|------|------|
| SDD | Software Design Document — 模块设计规格文档（8 节结构：概要、接口、生命周期、依赖、错误码、安全、Mock、变更记录）|
| TDD | Test-Driven Development — 测试驱动开发（RED→GREEN→IMPROVE 循环）|
| partition | 插件所属信任域分组（SYSTEM、oa、erp、mes、isolated）|
| inline | Phase 1a 插件运行模式 — 与 Core 同进程直接函数调用 |
| process | Phase 2 插件运行模式 — 独立进程通过 JSON-RPC 通信 |
| container | Phase 4 插件运行模式 — 不可信容器的沙箱隔离 |

## Shell 脚本约定

- **Shebang**: 所有项目脚本统一 `#!/usr/bin/env bash`
- **错误守卫**: 所有脚本必须以 `set -euo pipefail` 开头
- **路径解析**: 使用 `cd "$dir" && pwd -P` 替代 `realpath`（macOS 兼容）
- **SCRIPT_DIR DRY**: 通过 `source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"` 获取 SCRIPT_DIR 和 PROJECT_ROOT
- **_common.sh 守卫**: `_common.sh` 使用 `_COMMON_SH_LOADED` 变量防止重复 source
- **错误消息**: 统一使用大写 `ERROR:` 前缀（非 `Error:`）
- **$HOME 守卫**: 使用 pixi 环境变量前检查 `[ -z "${HOME:-}" ]` 避免 unbound variable

## Pixi 配置约定

- **Feature 分层**: `runtime`（生产, nodejs）、`dev`（开发工具）、`test`（测试框架）— 零冗余 conda 依赖
- **环境映射**: `runtime` = features[runtime], `dev` = features[runtime+dev], `default` = features[runtime+dev+test]
- **Shell 展开**: pixi task 不支持 `$(...)` 等 shell 语法 → 移到独立脚本
- **跨平台**: `platforms` 变更后必须 `pixi lock` 重新生成锁文件
- **部署**: `deploy-pack.py` 用于打包，`deploy-unpack.py` 用于解包；后者自动平台自适应
