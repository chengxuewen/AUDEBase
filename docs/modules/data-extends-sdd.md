# SDD: Data Extends Module

**Module**: `@audebase/data-extends`
**Package Path**: `packages/data-extends/`
**Phase**: Phase 1b (#6)
**Status**: SDD Complete
**Decision Reference**: D12.1, D3, architecture.md 插件间数据扩展, phase-planning.md

---

## 1. 概要

### 模块定位

Data Extends 模块为 AUDEBase 平台提供插件间数据模型扩展能力。借鉴 Odoo `_inherit` 模式，允许一个插件向另一个插件定义的 Collection（数据表）添加字段，无需修改被扩展插件的源代码。

### 职责边界

| 范围 | 说明 |
|------|------|
| **负责** | extends 声明解析、CollectionRegistry 注册与合并、字段冲突检测、合并后 Collection 定义提供、DB 迁移触发（通过 migration-engine） |
| **不负责** | Schema Engine 运行时动态建模（Phase 2 D3）、字段覆写/删除（Phase 2）、UI 自动渲染、关联表扩展（Phase 2） |

### 设计目标

1. **Odoo 一致性** - 采用 Odoo 20 年验证的 `_inherit` 模式，manifest `extends` 声明即契约
2. **无侵入** - 扩展插件不修改被扩展插件代码，仅通过 manifest 声明字段
3. **冲突安全** - 同名不同类型字段导致加载拒绝，避免数据损坏
4. **有序合并** - 按插件依赖顺序合并，确保确定性结果
5. **迁移就绪** - 扩展字段通过 migration-engine 生成 ALTER TABLE ADD COLUMN，不破坏已有数据

---

## 2. 接口定义

### ExtendDeclaration

```typescript
/**
 * 插件 manifest.yaml 中的 extends 声明。
 * 每个条目表示对某个 Collection 的字段扩展。
 */
interface ExtendDeclaration {
  /** 目标 Collection 名称（如 'order', 'user'） */
  collection: string
  /** 新增字段列表 */
  addFields: FieldDefinition[]
}
```

### FieldDefinition

```typescript
/**
 * 字段定义。支持标量类型和关联类型。
 * required/unique 校验由声明插件自行负责（Phase 1b 不做跨插件强制校验）。
 */
interface FieldDefinition {
  /** 字段名（在同 Collection 内必须唯一） */
  name: string
  /** 字段类型 */
  type: FieldType
  /** 关联目标 Collection（belongsTo/hasMany 必填） */
  target?: string
  /** 是否必填 */
  required?: boolean
  /** 是否唯一 */
  unique?: boolean
  /** 默认值 */
  default?: unknown
  /** 字段备注 */
  description?: string
}

type FieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'belongsTo'
  | 'hasMany'
```

### ResolvedCollection

```typescript
/**
 * 合并后的完整 Collection 定义。
 * 供 Core 数据代理（D12）和 migration-engine 使用。
 */
interface ResolvedCollection {
  /** Collection 名称 */
  name: string
  /** 原始插件定义的基字段 */
  baseFields: FieldDefinition[]
  /** 所有扩展插件添加的字段（按依赖顺序合并） */
  extendedFields: FieldDefinition[]
  /** baseFields + extendedFields 合并结果 */
  allFields: FieldDefinition[]
  /** 扩展来源记录（哪个插件的哪个 ExtendDeclaration） */
  extendsFrom: Array<{
    pluginName: string
    declarations: ExtendDeclaration[]
  }>
}
```

### CollectionRegistry Class

```typescript
class CollectionRegistry {
  /**
   * 注册一个 Collection 及其基字段。
   * 由 Collection 的属主插件在 load() 阶段调用。
   */
  register(collection: ResolvedCollection): void

  /**
   * 声明对某 Collection 的字段扩展。
   * 由扩展插件在 load() 阶段调用，在 register() 之后。
   * 抛出 EXTENDS_COLLECTION_NOT_FOUND 如果目标 Collection 尚未注册。
   * 抛出 EXTENDS_FIELD_CONFLICT 如果字段名冲突且类型不兼容。
   */
  extend(
    collectionName: string,
    fields: FieldDefinition[],
    pluginName: string,
  ): void

  /**
   * 获取合并后的 Collection 定义。
   * 返回 null 如果 Collection 不存在。
   */
  getCollection(name: string): ResolvedCollection | null

  /**
   * 返回所有已注册的 Collection 名称列表。
   */
  getCollectionNames(): string[]

  /**
   * 最终化所有合并，生成每个 Collection 的 allFields。
   * 在全部插件 load() 完成后调用一次。
   */
  resolveAll(): ResolvedCollection[]
}
```

### Merge 算法

```
resolveAll() 算法:

1. 对每个已注册的 Collection:
   a. 收集该 Collection 的所有 extendsFrom 记录
   b. 按插件依赖拓扑顺序排序（依赖者在后）
   c. 依次合并每个 extension 的 addFields:
      - 如果字段名在 baseFields 中不存在且之前 extension 未添加:
        -> 追加到 extendedFields
      - 如果字段名已存在但 type 相同:
        -> 跳过（首个定义生效，不做覆写）
      - 如果字段名已存在且 type 不同:
        -> 抛出 EXTENDS_FIELD_CONFLICT
   d. 生成 allFields = [...baseFields, ...extendedFields]
2. 返回所有 ResolvedCollection
```

### manifest.yaml 中的声明格式

```yaml
# 扩展插件 manifest.yaml 示例
name: @audebase/plugin-erp-warehouse
version: 1.0.0
extends:
  - collection: order
    addFields:
      - name: warehouse_id
        type: belongsTo
        target: warehouse
        description: 关联仓库
      - name: priority
        type: number
        default: 0
        description: 订单优先级
  - collection: product
    addFields:
      - name: warehouse_stock
        type: number
        default: 0
        description: 仓库库存数量
```

### DB 迁移影响

```typescript
/**
 * 从 ResolvedCollection 生成迁移指令。
 * 由 migration-engine 在插件加载后执行。
 */
interface MigrationInstruction {
  collectionName: string
  /** 需要 ADD COLUMN 的字段列表 */
  addColumns: Array<{
    fieldName: string
    sqlType: string   // 根据 FieldType 映射: string->VARCHAR(255), number->INTEGER, boolean->BOOLEAN, date->TIMESTAMP, belongsTo->UUID（关联ID）
    nullable: boolean
    defaultValue?: string
  }>
}
```

**类型到 SQL 映射**:

| FieldType | SQL Type | 备注 |
|-----------|----------|------|
| `string` | `VARCHAR(255)` | 可指定 maxLength 扩展 |
| `number` | `INTEGER` 或 `BIGINT` | 按需决定精度 |
| `boolean` | `BOOLEAN` | - |
| `date` | `TIMESTAMP` | - |
| `belongsTo` | `UUID` | 存储关联 ID，FK 约束可选 |
| `hasMany` | 无直接列 | 关联表通过 target 端 belongsTo 处理 |

belongsTo 类型扩展字段的命名约定: `{field_name}_id`（例如 `warehouse_id`），对应目标 Collection 的 ID 列。

### Public Exports (index.ts)

```typescript
export { CollectionRegistry } from './collection-registry.js'
export type { ExtendDeclaration, FieldDefinition, ResolvedCollection, FieldType, MigrationInstruction } from './types.js'
```

---

## 3. 生命周期

### 插件加载流程中的 Data Extends

```
Core 启动
  -> 加载插件（按依赖拓扑排序）
     -> 插件 A（定义 Collection 'order'）
        -> A.load() 中调用 registry.register({ name: 'order', baseFields: [...] })
     -> 插件 B（声明 extends: [{ collection: 'order', addFields: [...] }]）
        -> B.load() 中调用 registry.extend('order', fields, 'B')
           -> 检测冲突？ 无 -> merged
           -> 有冲突？ EXTENDS_FIELD_CONFLICT -> B 加载失败，标记 migration_failed
     -> 插件 C（声明 extends: [{ collection: 'order', addFields: [...] }]）
        -> C.load() 中调用 registry.extend('order', fields, 'C')
  -> 所有插件 load() 完成后
     -> registry.resolveAll() 生成最终 allFields
     -> migration-engine 对比已有 DDL，生成 ALTER TABLE ADD COLUMN 指令
     -> 执行迁移
  -> afterLoad() 钩子触发，扩展字段可用
```

### 升级流程

```
插件 B 升级（manifest.version + migration_version 递增）
  -> B 新版本定义了新增字段
  -> migration-engine 检测到新字段
  -> ALTER TABLE ADD COLUMN（仅新增列，不修改已有列）
  -> 升级后的字段自动出现在 ResolvedCollection.allFields 中
```

### 关闭

无特殊关闭逻辑。CollectionRegistry 是内存注册表，随 Core 进程退出自动释放。DDL 变更持久化在数据库中。

---

## 4. 依赖关系

| 依赖 | 类型 | 用途 |
|------|------|------|
| `@audebase/shared-types` | workspace | `FieldType`, 公共类型定义 |
| `@audebase/migration-engine` | workspace | 生成 ALTER TABLE ADD COLUMN 迁移指令 |
| `@audebase/plugin-framework` | workspace | 插件加载顺序（依赖拓扑），load() 生命周期钩子 |

### Phase 2 预留接口

```typescript
// Phase 2: 与 Schema Engine 统一后的 extends 声明
// 届时 ExtendDeclaration 直接映射为 Schema Engine 的 Collection schema merge 操作
// 支持关联表扩展（多对多中间表）
interface SchemaEngineExtend {
  collection: string
  mergeMode: 'addFields'          // Phase 1b
  // mergeMode: 'addFields' | 'override' | 'delete'   // Phase 2
  fields: FieldDefinition[]
  relations?: Array<{
    type: 'manyToMany'
    through: string               // 中间表名
    target: string
  }>
}
```

---

## 5. 错误码与错误处理

| 错误码 | HTTP | 场景 | 恢复策略 |
|--------|------|------|----------|
| `EXTENDS_COLLECTION_NOT_FOUND` | 500 | `registry.extend()` 的目标 Collection 尚未注册 | 检查插件加载顺序，确保被扩展插件先注册；调整 manifests 依赖声明 |
| `EXTENDS_FIELD_CONFLICT` | 500 | 扩展字段名与已有字段同名但类型不同 | 扩展插件修改字段名或类型；若为兼容冲突，删除冲突的 extends 声明 |
| `EXTENDS_INVALID_FIELD_TYPE` | 500 | 声明的字段类型不是合法的 FieldType | 修正 manifest 中字段类型；参考 FieldType 允许值 |
| `EXTENDS_MISSING_TARGET` | 500 | belongsTo/hasMany 字段未指定 target | 在 ExtendDeclaration 中补充 target 字段 |

### 错误处理策略

```
EXTENDS_COLLECTION_NOT_FOUND:
  -> 记录错误日志 "Collection '{name}' not found for plugin '{plugin}'"
  -> 当前插件标记为 migration_failed 状态
  -> Core 继续加载其他插件，不阻塞启动

EXTENDS_FIELD_CONFLICT:
  -> 记录错误日志 "Field '{field}' type conflict on collection '{coll}': {typeA} vs {typeB}"
  -> 当前插件标记为 migration_failed 状态
  -> Core 继续加载其他插件，不阻塞启动

EXTENDS_INVALID_FIELD_TYPE:
  -> 记录错误日志 "Invalid field type '{type}' for field '{field}' in plugin '{plugin}'"
  -> 跳过该字段声明

EXTENDS_MISSING_TARGET:
  -> 记录错误日志 "belongsTo/hasMany field '{field}' missing target in plugin '{plugin}'"
  -> 跳过该字段声明
```

---

## 6. 安全考虑

### 字段注入验证

- 扩展字段名必须匹配 `/^[a-z][a-z0-9_]{1,63}$/` 模式，防止注入特殊字符
- type 必须是 FieldType 枚举中的值，拒绝未知类型
- target 值不为空（belongsTo/hasMany 必须指定）

### 插件隔离

- 插件只能扩展已注册的 Collection。不能通过 extends 创建新 Collection
- 扩展字段的写入权限由被扩展 Collection 的 Record Rules（D10）控制
- 扩展插件不能绕过被扩展插件的字段级权限（D11）

### 数据完整性

- 同名不同类型字段冲突导致加载拒绝（不静默合并）
- belondsTo 扩展默认不创建 FK 约束（Phase 1b 简化），Phase 2 可选
- 扩展字段的 required 校验由声明插件在写入时自行负责
- 不支持删除已有字段，防止意外数据丢失

### 迁移安全

- ALTER TABLE ADD COLUMN 是安全的 DDL 操作（PostgreSQL 支持并发读写）
- 迁移失败时插件标记 migration_failed，已有数据不受影响
- 不支持 ALTER TABLE DROP COLUMN（Phase 2 考虑）

---

## 7. Mock 约束

### CollectionRegistry 的 mock 约束

| 约束 | 说明 |
|------|------|
| 同步 API | `register()`, `extend()`, `getCollection()` 均为同步方法 |
| 内存存储 | 测试使用真实 `CollectionRegistry` 实例，内部使用 `Map<string, ResolvedCollection>` |
| 隔离性 | 每个测试用例创建新实例，`beforeEach` 中重置 |
| 注册顺序 | 测试必须显式 register 目标 Collection 后再 extend |

### 测试场景矩阵

```typescript
// 场景 1: 基本扩展
// register('order', [name, amount])
// extend('order', [{ name: 'warehouse_id', type: 'belongsTo', target: 'warehouse' }])
// -> allFields 包含 3 个字段

// 场景 2: 冲突检测
// register('order', [name, amount])
// extend('order', [{ name: 'amount', type: 'string' }])  // 原为 number
// -> 抛出 EXTENDS_FIELD_CONFLICT

// 场景 3: 兼容同名字段（相同 type 跳过不覆写）
// register('order', [name, amount])
// extend('order', [{ name: 'amount', type: 'number', default: 0 }])
// -> 跳过，不报错，保留基字段定义

// 场景 4: Collection 不存在
// extend('unknown_coll', [...])
// -> 抛出 EXTENDS_COLLECTION_NOT_FOUND

// 场景 5: 多插件扩展同一个 Collection
// register('order', [name, amount])
// extend('order', [warehouse_id], 'plugin-b')
// extend('order', [priority], 'plugin-c')
// resolveAll() -> allFields = [name, amount, warehouse_id, priority]

// 场景 6: 无效字段类型
// extend('order', [{ name: 'bad', type: 'invalid' }])
// -> 抛出 EXTENDS_INVALID_FIELD_TYPE

// 场景 7: belongsTo 缺少 target
// extend('order', [{ name: 'ref', type: 'belongsTo' }])
// -> 抛出 EXTENDS_MISSING_TARGET
```

### 迁移指令的 mock 约束

| 约束 | 说明 |
|------|------|
| MigrationEngine mock | 测试使用 spy 验证 `generateMigration()` 调用参数 |
| SQL 不执行 | 单元测试不连接数据库，仅验证 MigrationInstruction 结构正确 |
| 集成测试 | 集成测试使用真实 PostgreSQL，验证 ALTER TABLE 成功 |

---

## 8. 变更记录

| 日期 | 变更 |
|------|------|
| 2026-07-17 | 初始 SDD 创建 - Phase 1b Odoo 式 extends 字段扩展 |