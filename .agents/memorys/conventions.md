# AUDEBase 编码约定

**更新日期**: 2026-07-09

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
