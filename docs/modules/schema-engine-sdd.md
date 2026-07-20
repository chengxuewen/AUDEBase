# Schema Engine SDD — Phase 2

> **创建日期**: 2026-07-20  
> **目的**: 为 Phase 2 schema-engine 模块提供完整的接口定义、数据模型与 DDL/UI 映射契约。  
> **前置阅读**: D3, D7; architecture.md §4.5.1 §6.4; decisions.md D3/D7  
> **状态**: ✅ 已实现 (5 测试文件)

---

## §1 概要

### 1.1 模块定位

`@audebase/schema-engine` 实现 AUDEBase 的动态数据模型系统（D3）和 Schema→UI 渲染映射（D7），借鉴 NocoBase Collection System。允许插件在运行时通过 `CollectionDef` 声明数据模型，引擎自动生成 PostgreSQL DDL 和 Ant Design 5 前端组件配置。

**核心职责**：
- 运行时注册与查询 Collection 定义（`SchemaRegistry`）
- 声明式字段验证（`validateField` / `validateCollection`）
- CollectionDef → PostgreSQL DDL 自动生成（建表/索引/变更）
- SQL 标识符安全验证（防注入、保留字检查）
- FieldDef → ProTable ColumnConfig + ProForm FormFieldConfig 映射

**职责边界**：
- ✅ 纯函数式转换：类型定义 → SQL / 前端配置，无副作用
- ✅ 不负责数据库连接或执行（DDL 字符串由 Core 消费）
- ✅ 不负责 UI 渲染（仅生成配置对象，由 admin-ui 消费）
- ✅ 不负责数据 API 代理（由 Core + RBAC 处理）

### 1.2 设计目标

1. **类型驱动** — TypeScript 类型定义是唯一真实来源，DDL 和 UI 映射从类型推导
2. **零运行时依赖** — 仅依赖 `zod`（未来用于 schema 校验），DDL/UI 映射为纯函数
3. **NocoBase 对齐** — Collection + Field 概念与 NocoBase 兼容，降低迁移成本
4. **SQL 安全** — 标识符白名单验证，禁止注入，避免 Odoo 式裸 SQL 拼接
5. **ProTable/ProForm 原生映射** — 不引入 Formily，直接映射到 antd pro-components

### 1.3 与其他模块的关系

```
┌─────────────────────────────────────────────────────────────────┐
│  schema-engine (packages/schema-engine/src/)                     │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │ SchemaRegistry │  │   DDL Gen    │  │    UI Mapping        │   │
│  │ · register()  │  │ · CREATE TABLE│  │ · fieldToColumn()    │   │
│  │ · get()       │  │ · INDEXES    │  │ · fieldToFormField() │   │
│  │ · list()      │  │ · ALTER TABLE │  │ · collectionToXxx()  │   │
│  │ · remove()    │  │ · identifier  │  │                      │   │
│  └──────────────┘  │   validation  │  └──────────────────────┘   │
│                     └──────────────┘                              │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │  Validator                                               │   │
│  │ · validateField() — 字段级校验（name/type/enumValues/   │   │
│  │                       target 完整性）                    │   │
│  │ · validateCollection() — 集合级校验（name/fields/       │   │
│  │                            重复检测/嵌套字段校验）       │   │
│  └───────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

| 消费方 | 接口 | 调用方式 |
|--------|------|---------|
| `@audebase/core` | `SchemaRegistry`, `generateCreateTable`, `generateAlterTable` | 启动时注册插件声明的 Collection，执行 DDL |
| `@audebase/data-extends` | `generateAlterTable` | D12.1 字段扩展：根据 extends 声明生成 ADD COLUMN |
| `@audebase/admin-ui` | `collectionToColumns`, `fieldToFormField` | 根据 Schema 动态渲染 ProTable/ProForm |
| `@audebase/manifest-engine` | `validateCollection` | manifest 解析时校验 `models` 声明 |

---

## §2 接口定义

### 2.1 数据类型 (types.ts)

```typescript
// packages/schema-engine/src/types.ts

export type FieldType =
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "enum"
  | "belongsTo"
  | "hasMany";

export const FIELD_TYPES: readonly FieldType[] = [
  "string", "number", "boolean", "date", "enum", "belongsTo", "hasMany",
] as const;

export interface FieldDef {
  readonly name: string;
  readonly type: FieldType;
  readonly required?: boolean;
  readonly unique?: boolean;
  readonly default?: unknown;
  readonly enumValues?: readonly string[];   // enum 类型必填
  readonly target?: string;                   // belongsTo/hasMany 必填：目标 Collection 名
  readonly label?: string;                    // UI 显示名，缺省使用 name
}

export interface CollectionDef {
  readonly name: string;                     // Collection 逻辑名
  readonly table?: string;                    // 物理表名，缺省使用 name
  readonly fields: readonly FieldDef[];       // 字段定义
  readonly primaryKey?: string;               // 主键字段名，缺省 "id"
  readonly timestamps?: boolean;              // 自动添加 created_at/updated_at，缺省 true
}

export interface ValidationError {
  readonly path: string;                     // 错误路径（如 "fields[0].type"）
  readonly message: string;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly ValidationError[];
}
```

### 2.2 注册表 (registry.ts)

```typescript
// packages/schema-engine/src/registry.ts

export class SchemaRegistry {
  // 私有 Map<string, CollectionDef> 存储

  register(collection: CollectionDef): void
  // 注册 Collection。同名已存在时 throw Error('Collection "X" is already registered')

  get(name: string): CollectionDef | undefined
  // 按名查询。未注册返回 undefined

  list(): readonly CollectionDef[]
  // 返回全部注册的 Collection（新数组，不可变）

  has(name: string): boolean
  // 检查是否已注册

  remove(name: string): boolean
  // 移除 Collection。返回 true 表示成功移除，false 表示不存在
}
```

**设计决策**：使用私有 `Map` 存储而非对象，保证键为任意合法 Collection 名，避免 `__proto__` 等原型污染。

### 2.3 验证器 (validator.ts)

```typescript
// packages/schema-engine/src/validator.ts

export function validateField(field: FieldDef): ValidationResult
// 校验单个字段：
//   - name 非空
//   - type 在 FIELD_TYPES 内
//   - enum 类型必须有非空 enumValues
//   - belongsTo/hasMany 必须有 target
// 通过时返回 { valid: true, errors: [] }
// 失败时返回 { valid: false, errors: [...] }
// 每个 errors 条目的 path 为字段级路径（如 "name", "type", "enumValues"）

export function validateCollection(collection: CollectionDef): ValidationResult
// 校验整个 Collection：
//   - name 非空
//   - fields 非空（至少一个字段）
//   - 无重复字段名
//   - 递归调用 validateField 校验每个字段
// 失败时 path 带前缀（如 "fields[0].type", "fields.email"）
```

### 2.4 DDL 生成器 (ddl.ts)

```typescript
// packages/schema-engine/src/ddl.ts

export function fieldToColumnType(field: FieldDef): string
// 将单个 FieldDef 映射为 SQL 列定义字符串：
//   string    → "col" VARCHAR(255) [UNIQUE] [NOT NULL]
//   number    → "col" INTEGER [UNIQUE] [NOT NULL]
//   boolean   → "col" BOOLEAN DEFAULT false
//   date      → "col" TIMESTAMP [NOT NULL]
//   enum      → "col" VARCHAR(50) CHECK ("col" IN ('v1','v2')) [NOT NULL]
//   belongsTo → "col" INTEGER REFERENCES "target"(id) ON DELETE SET NULL [NOT NULL]
//   hasMany   → ""（不生成列，关系表由对端 FK 体现）
// 枚举值中的单引号转义为 ''（SQL 标准转义）
// 未知类型 fallback → "col" TEXT

export function generateCreateTable(collection: CollectionDef): string
// 生成完整的 CREATE TABLE IF NOT EXISTS 语句：
//   - 使用 table 或 name 作为物理表名
//   - 主键为 primaryKey 或 "id"，类型 SERIAL PRIMARY KEY
//   - 遍历 fields，调用 fieldToColumnType 生成列定义
//   - 跳过与主键同名的字段（避免重复）
//   - 跳过 hasMany 字段（不生成列）
//   - timestamps !== false 时追加 created_at/updated_at（TIMESTAMP DEFAULT NOW()）
// 所有标识符用双引号包裹

export function generateCreateIndexes(collection: CollectionDef): string[]
// 为 belongsTo 字段生成 CREATE INDEX IF NOT EXISTS 语句：
//   - 索引命名: idx_{tableName}_{fieldName}
//   - 自动跳过：PRIMARY KEY 和 UNIQUE 字段（PostgreSQL 自动索引）
// 返回 string[]，无 FK 列时返回 []

export function generateAlterTable(
  collection: CollectionDef,
  newFields: readonly FieldDef[],
): string[]
// 生成 ALTER TABLE ADD COLUMN 语句（用于 D12.1 extends 扩展）：
//   - 对每个 newFields 调用 fieldToColumnType
//   - 跳过 hasMany 字段（不生成列）
//   - 使用 collection.table 或 collection.name 作为目标表
// 返回 ALTER TABLE ... ADD COLUMN ... 语句数组

export function validateSqlIdentifiers(collection: CollectionDef): ValidationResult
// SQL 标识符安全校验：
//   - 检查 tableName（collection.table ?? collection.name）
//   - 检查每个 field.name
//   - 约束：非空、≤63 字符、符合 /^[a-zA-Z_][a-zA-Z0-9_]*$/、
//           不在 SQL_RESERVED 集合内（55 个 PostgreSQL 保留字）
//   - 保留字检查大小写不敏感
```

**类型映射表**：

| FieldType    | SQL 列类型                                           | 说明                                |
|-------------|-----------------------------------------------------|-------------------------------------|
| `string`    | `VARCHAR(255) [UNIQUE] [NOT NULL]`                  | 固定 255 宽度                       |
| `number`    | `INTEGER [UNIQUE] [NOT NULL]`                       | 整数（未来扩展 DECIMAL）            |
| `boolean`   | `BOOLEAN DEFAULT false`                             | 固定默认值 false                    |
| `date`      | `TIMESTAMP [NOT NULL]`                              | 不含时区，应用层处理                |
| `enum`      | `VARCHAR(50) CHECK (col IN (...)) [NOT NULL]`       | CHECK 约束强制枚举，单引号转义      |
| `belongsTo` | `INTEGER REFERENCES "t"(id) ON DELETE SET NULL [NOT NULL]` | FK 引用目标表主键            |
| `hasMany`   | *(不生成列)*                                         | 关系由对端 belongsTo FK 体现       |

### 2.5 UI 映射器 (ui-mapping.ts)

```typescript
// packages/schema-engine/src/ui-mapping.ts

export type AntdComponent =
  "Input" | "InputNumber" | "Switch" | "DatePicker" | "Select" | "TextArea" | "EmailInput";

export interface ColumnConfig {
  title: string;                              // 列标题（field.label ?? field.name）
  dataIndex: string;                          // 数据字段名
  key: string;                                // React key
  valueType?: "text" | "number" | "date" | "select" | "switch";
  valueEnum?: Record<string, { text: string }>;  // enum 类型的值映射
  hideInSearch?: boolean;                     // 搜索栏隐藏（boolean 始终 true；string 非 required 时 true）
  hideInTable?: boolean;                      // 表格隐藏（hasMany 始终 true）
}

export interface FormFieldConfig {
  name: string;                               // 字段名
  label: string;                              // 标签（field.label ?? field.name）
  component: AntdComponent;                   // 映射到的 antd 组件
  rules?: Array<{ required: boolean; message: string }>;  // 表单校验规则
  props?: Record<string, unknown>;            // 组件额外 props（如 Select options）
}

export function fieldToColumn(field: FieldDef): ColumnConfig
// 单个字段 → ProTable 列配置

export function fieldToFormField(field: FieldDef): FormFieldConfig
// 单个字段 → ProForm 表单项配置

export function collectionToColumns(collection: CollectionDef): ColumnConfig[]
// 集合所有字段 → 列配置数组（跳过 hasMany 和 "id" 字段）

export function collectionToFormFields(collection: CollectionDef): FormFieldConfig[]
// 集合所有字段 → 表单项配置数组（跳过 "id" 字段）
```

**字段→UI 映射规则**：

| FieldType    | ColumnConfig.valueType | FormFieldConfig.component | 特殊行为                              |
|-------------|----------------------|--------------------------|--------------------------------------|
| `string`    | `"text"`             | `"Input"`                | required=false 时 hideInSearch=true  |
| `number`    | `"number"`           | `"InputNumber"`          | —                                    |
| `boolean`   | `"switch"`           | `"Switch"`               | 始终 hideInSearch=true               |
| `date`      | `"date"`             | `"DatePicker"`           | —                                    |
| `enum`      | `"select"`           | `"Select"`               | valueEnum / props.options 从 enumValues 构建 |
| `belongsTo` | `"select"`           | `"Select"`               | 关联数据由 admin-ui 异步加载          |
| `hasMany`   | *(hidden)*           | `"Select"`               | hideInTable=true, hideInSearch=true  |

**字段 label 降级策略**：`field.label ?? field.name` — label 为空时使用字段名作为显示文本。

---

## §3 生命周期

schema-engine 模块无生命周期钩子 — 为纯函数库，无状态管理（`SchemaRegistry` 除外）。

### 3.1 SchemaRegistry 生命周期

```
Core 启动
  │
  ├─→ new SchemaRegistry()          — 创建空注册表
  │
  ├─→ 插件 load() 阶段：
  │     registry.register(collectionDef)  — 插件声明 Collection
  │
  ├─→ DDL 执行阶段：
  │     validateSqlIdentifiers(collection)  — 安全检查
  │     validateCollection(collection)       — 逻辑校验
  │     generateCreateTable(collection)      — 生成建表 SQL
  │     generateCreateIndexes(collection)    — 生成索引 SQL
  │
  ├─→ D12.1 extends 扩展阶段：
  │     generateAlterTable(collection, newFields)  — 生成变更 SQL
  │
  └─→ 插件 unload 阶段：
        registry.remove(name)  — 移除 Collection（不删除物理表）
```

### 3.2 无状态函数

`validateField`, `validateCollection`, `fieldToColumnType`, `generateCreateTable`, `generateCreateIndexes`, `generateAlterTable`, `validateSqlIdentifiers`, `fieldToColumn`, `fieldToFormField`, `collectionToColumns`, `collectionToFormFields` 均为纯函数 — 无副作用，仅转换输入 → 输出。

---

## §4 依赖关系

### 4.1 外部依赖

| 依赖 | 用途 | 版本 |
|------|------|------|
| `zod` | 预留（当前未使用，计划用于 Schema 级 JSON Schema 校验） | ^3.24.0 |
| `typescript` | 编译 | ^5.7.0 |
| `vitest` | 测试 | ^3.0.0 |

### 4.2 内部依赖

- **无内部包依赖** — schema-engine 为自包含模块，不依赖任何其他 `@audebase/*` 包
- 被以下包消费：
  - `@audebase/core` — DDL 执行 + SchemaRegistry 管理
  - `@audebase/admin-ui` — UI 映射
  - `@audebase/data-extends` — ALTER TABLE 生成
  - `@audebase/manifest-engine` — Collection 验证

### 4.3 架构位置

```
packages/schema-engine/
├── src/
│   ├── index.ts          # barrel export
│   ├── types.ts          # FieldType, FieldDef, CollectionDef, ValidationResult
│   ├── registry.ts       # SchemaRegistry class
│   ├── validator.ts      # validateField, validateCollection
│   ├── ddl.ts            # DDL generation functions
│   ├── ui-mapping.ts     # Ant Design column/form mapping
│   └── __tests__/
│       ├── types.test.ts
│       ├── registry.test.ts
│       ├── validator.test.ts
│       ├── ddl.test.ts
│       └── ui-mapping.test.ts
└── package.json
```

---

## §5 错误码与错误处理

### 5.1 错误策略

schema-engine 采用**结果返回**（非异常抛出）模式进行校验：

| 函数 | 错误方式 | 说明 |
|------|---------|------|
| `validateField` | 返回 `ValidationResult` | 聚合所有错误，不快速失败 |
| `validateCollection` | 返回 `ValidationResult` | 聚合所有字段错误 |
| `validateSqlIdentifiers` | 返回 `ValidationResult` | 聚合所有标识符错误 |
| `SchemaRegistry.register` | `throw Error` | 唯一抛异常的场景 — 重复注册是编程错误 |

### 5.2 验证错误路径约定

| 函数 | path 格式 | 示例 |
|------|----------|------|
| `validateField` | 短路径 | `"name"`, `"type"`, `"enumValues"`, `"target"` |
| `validateCollection` | `fields[N].{path}` 或 `fields.{name}` | `"fields[0].type"`, `"fields.email"` |
| `validateSqlIdentifiers` | `"table"` 或 `"fields.{name}"` | `"table"`, `"fields.email-hash"` |

### 5.3 日志级别指南

| 场景 | 级别 | 调用方 |
|------|------|--------|
| Collection 校验失败 | WARN | Core 启动时 |
| SQL 标识符非法 | ERROR | Core DDL 执行前 |
| 重复注册 Collection | ERROR（throw） | PluginManager load() |

---

## §6 安全考虑

### 6.1 SQL 注入防护

- **标识符白名单**：`validateSqlIdentifiers()` 在生成 DDL 前强制校验所有表名和列名
  - 只允许 `[a-zA-Z_][a-zA-Z0-9_]*` 格式
  - 最大 63 字符
  - 拒绝 55 个 PostgreSQL 保留字
- **枚举值转义**：单引号 `'` 在 `fieldToColumnType()` 中转义为 `''`
- **标识符引用**：所有 SQL 标识符用双引号 `"` 包裹（`quoteIdent()`）

### 6.2 不负责的边界

- **数据访问权限** — 由 Core RBAC 中间件处理（D12: Core API 代理）
- **tenant_id 隔离** — 由 Core 多租户中间件注入
- **字段级权限过滤** — 由 RBAC Record Rules (D10) + ACLProvider (D19) 处理
- **速率限制** — 由 `@audebase/rate-limit` 模块处理

### 6.3 类型安全

- 所有公共 API 使用 `readonly` 修饰符（不可变性）
- `FieldType` 联合类型 + `FIELD_TYPES` const array 双重约束
- DDL 生成器 switch-case 包含 `never` exhaustive guard
- 禁止 `as any` / `@ts-ignore`

---

## §7 Mock 约束

### 7.1 测试环境

schema-engine 为纯函数模块，**无需 mock**。所有测试直接调用导出函数并检查返回值。

### 7.2 测试数据工厂约定

```typescript
// 辅助工厂函数（测试内联，不导出）
function stringField(name: string): FieldDef {
  return { name, type: "string" };
}

function makeCollection(name: string, fields: readonly FieldDef[]): CollectionDef {
  return { name, fields };
}
```

### 7.3 无需 mock 的外部依赖

- `zod` — 当前未在运行时使用，测试中无需 mock
- 无数据库连接 — DDL 为字符串生成，不执行
- 无网络调用 — 全部本地纯函数

---

## §8 变更记录

| 版本 | 日期 | 变更内容 |
|------|------|---------|
| v0.1.0 | 2026-07-20 | 初始版本 — 记录 Phase 2 已实现状态。覆盖 types/registry/validator/ddl/ui-mapping 全部 11 个导出函数和 3 个导出类型 |
