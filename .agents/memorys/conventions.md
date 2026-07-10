# AUDEBase 编码约定

**更新日期**: 2026-07-10

## 命名约定

- **项目名**: `AUDEBase` 全大写
- **npm scope**: `@AUDEBase/`
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
