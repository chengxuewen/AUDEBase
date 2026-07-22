# Data Extends TDD 测试策略

> **模块**: `@audebase/data-extends`
> **依赖**: `@audebase/shared-types`
> **更新日期**: 2026-07-17
> **参考**: data-extends-sdd.md, D12.1, architecture.md 插件间数据扩展, phase-planning.md §Phase 1b
> **覆盖率目标**: 85%+ 行覆盖率, 80%+ 分支覆盖率

---

## 1. 测试范围

Data Extends 模块为 AUDEBase 平台提供插件间数据模型扩展能力。核心为 `CollectionRegistry` 类，负责 extends 声明注册、字段冲突检测、按依赖顺序合并、最终化 allFields。借鉴 Odoo `_inherit` 模式，纯内存实现。

| 测试类型 | 最低用例数 | 数据库 |
|---------|:---:|------|
| 单元测试 | 16+ | 无（内存 `Map<string, ResolvedCollection>`） |
| 集成测试 | 4+ | 无（纯内存多插件协调验证） |
| 契约测试 | 3+ | 无（接口一致性验证） |
| E2E 测试 | 1 流程 | 无 |

---

## 2. 模块结构

```
packages/data-extends/
├── src/
│   ├── index.ts                # 公开导出 CollectionRegistry, 类型
│   ├── collection-registry.ts  # CollectionRegistry 类（Map 存储 + 合并算法）
│   ├── types.ts                # ExtendDeclaration, FieldDefinition, ResolvedCollection, FieldType
│   ├── __tests__/
│   │   ├── unit/
│   │   │   └── collection-registry.test.ts
│   │   ├── integration/
│   │   │   └── data-extends.integration.test.ts
│   │   ├── contracts/
│   │   │   └── data-extends.contract.test.ts
│   │   └── seeds/
│   │       └── data-extends-fixtures.ts
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## 3. 单元测试

### 3.1 CollectionRegistry 注册与查询

```
测试文件: packages/data-extends/src/__tests__/unit/collection-registry.test.ts
```

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { CollectionRegistry } from '../../collection-registry'
import type { FieldDefinition } from '../../types'

const ORDER_BASE_FIELDS: FieldDefinition[] = [
  { name: 'id', type: 'string', required: true },
  { name: 'amount', type: 'number', default: 0 },
  { name: 'status', type: 'string', default: 'draft' },
]

const PRODUCT_BASE_FIELDS: FieldDefinition[] = [
  { name: 'id', type: 'string', required: true },
  { name: 'name', type: 'string', required: true },
  { name: 'price', type: 'number', default: 0 },
]

describe('CollectionRegistry', () => {
  let registry: CollectionRegistry

  beforeEach(() => {
    registry = new CollectionRegistry()
  })

  describe('register()', () => {
    it('registers a base collection with initial fields', () => {
      // Arrange
      const collection = {
        name: 'order',
        baseFields: ORDER_BASE_FIELDS,
        extendedFields: [],
        allFields: [],
        extendsFrom: [],
      }

      // Act
      registry.register(collection)

      // Assert
      const result = registry.getCollection('order')
      expect(result).not.toBeNull()
      expect(result!.name).toBe('order')
      expect(result!.baseFields).toHaveLength(3)
      expect(result!.baseFields[0].name).toBe('id')
    })
  })

  describe('getCollection()', () => {
    it('returns null for non-existent collection', () => {
      // Arrange
      // No collections registered

      // Act
      const result = registry.getCollection('unknown_coll')

      // Assert
      expect(result).toBeNull()
    })

    it('returns the registered collection with correct fields', () => {
      // Arrange
      registry.register({
        name: 'order',
        baseFields: ORDER_BASE_FIELDS,
        extendedFields: [],
        allFields: [],
        extendsFrom: [],
      })

      // Act
      const result = registry.getCollection('order')

      // Assert
      expect(result).not.toBeNull()
      expect(result!.name).toBe('order')
      expect(result!.baseFields).toEqual(ORDER_BASE_FIELDS)
    })
  })

  describe('getCollectionNames()', () => {
    it('returns all registered collection names', () => {
      // Arrange
      registry.register({ name: 'order', baseFields: ORDER_BASE_FIELDS, extendedFields: [], allFields: [], extendsFrom: [] })
      registry.register({ name: 'product', baseFields: PRODUCT_BASE_FIELDS, extendedFields: [], allFields: [], extendsFrom: [] })

      // Act
      const names = registry.getCollectionNames()

      // Assert
      expect(names).toContain('order')
      expect(names).toContain('product')
      expect(names).toHaveLength(2)
    })

    it('returns empty array when no collections registered', () => {
      // Arrange
      // No collections registered

      // Act
      const names = registry.getCollectionNames()

      // Assert
      expect(names).toEqual([])
    })
  })
})
```

### 3.2 CollectionRegistry 扩展与合并

```typescript
describe('CollectionRegistry - extend and merge', () => {
  let registry: CollectionRegistry

  beforeEach(() => {
    registry = new CollectionRegistry()
    registry.register({
      name: 'order',
      baseFields: ORDER_BASE_FIELDS,
      extendedFields: [],
      allFields: [],
      extendsFrom: [],
    })
  })

  describe('extend()', () => {
    it('extends a collection with new fields', () => {
      // Arrange - 'order' registered in beforeEach
      const warehouseField: FieldDefinition = {
        name: 'warehouse_id',
        type: 'belongsTo',
        target: 'warehouse',
        description: '关联仓库',
      }

      // Act
      registry.extend('order', [warehouseField], 'plugin-warehouse')

      // Assert
      const collection = registry.getCollection('order')!
      expect(collection.extendedFields).toHaveLength(1)
      expect(collection.extendedFields[0].name).toBe('warehouse_id')
      expect(collection.extendedFields[0].type).toBe('belongsTo')
      expect(collection.extendedFields[0].target).toBe('warehouse')
    })

    it('supports multiple extensions from different plugins', () => {
      // Arrange
      const warehouseField: FieldDefinition = { name: 'warehouse_id', type: 'belongsTo', target: 'warehouse' }
      const priorityField: FieldDefinition = { name: 'priority', type: 'number', default: 0 }

      // Act
      registry.extend('order', [warehouseField], 'plugin-warehouse')
      registry.extend('order', [priorityField], 'plugin-priority')

      // Assert
      const collection = registry.getCollection('order')!
      expect(collection.extendedFields).toHaveLength(2)
      expect(collection.extendedFields[0].name).toBe('warehouse_id')
      expect(collection.extendedFields[1].name).toBe('priority')
    })

    it('throws EXTENDS_FIELD_CONFLICT when field name exists with different type', () => {
      // Arrange - 'order' has 'amount' as type 'number'
      const conflictingField: FieldDefinition = { name: 'amount', type: 'string' }

      // Act & Assert
      expect(() => {
        registry.extend('order', [conflictingField], 'plugin-conflict')
      }).toThrow('EXTENDS_FIELD_CONFLICT')
    })

    it('is idempotent when extending with same name and same type (skip, no error)', () => {
      // Arrange - 'order' has 'amount' as type 'number'
      const sameTypeField: FieldDefinition = { name: 'amount', type: 'number', default: 100 }

      // Act - should not throw
      expect(() => {
        registry.extend('order', [sameTypeField], 'plugin-same')
      }).not.toThrow()

      // Assert - base field definition preserved
      const collection = registry.getCollection('order')!
      expect(collection.extendedFields).toHaveLength(0) // skipped, not added
    })

    it('merges stricter required/unique on same-typed field (same type, stricter constraint)', () => {
      // Arrange - 'order' has 'status' as type 'string', default 'draft', not required
      // Extending with stricter required
      const stricterField: FieldDefinition = { name: 'status', type: 'string', required: true }

      // Act
      registry.extend('order', [stricterField], 'plugin-stricter')

      // Assert
      const collection = registry.getCollection('order')!
      expect(collection.extendedFields).toHaveLength(0) // not added as new field
      // The same-type extension does not add to extendedFields
      // resolveAll will use baseFields definition (first wins)
      // Stricter constraints may be tracked separately in Phase 2
    })

    it('throws EXTENDS_COLLECTION_NOT_FOUND when target collection does not exist', () => {
      // Arrange
      const field: FieldDefinition = { name: 'extra', type: 'string' }

      // Act & Assert
      expect(() => {
        registry.extend('unknown_coll', [field], 'plugin-test')
      }).toThrow('EXTENDS_COLLECTION_NOT_FOUND')
    })

    it('throws EXTENDS_INVALID_FIELD_TYPE when field type is not valid', () => {
      // Arrange
      const invalidField = { name: 'bad', type: 'invalid' } as FieldDefinition

      // Act & Assert
      expect(() => {
        registry.extend('order', [invalidField], 'plugin-test')
      }).toThrow('EXTENDS_INVALID_FIELD_TYPE')
    })

    it('throws EXTENDS_MISSING_TARGET when belongsTo field has no target', () => {
      // Arrange
      const missingTarget: FieldDefinition = { name: 'ref_id', type: 'belongsTo' }

      // Act & Assert
      expect(() => {
        registry.extend('order', [missingTarget], 'plugin-test')
      }).toThrow('EXTENDS_MISSING_TARGET')
    })

    it('throws EXTENDS_MISSING_TARGET when hasMany field has no target', () => {
      // Arrange
      const missingTarget: FieldDefinition = { name: 'items', type: 'hasMany' }

      // Act & Assert
      expect(() => {
        registry.extend('order', [missingTarget], 'plugin-test')
      }).toThrow('EXTENDS_MISSING_TARGET')
    })

    it('allows empty fields array (no-op)', () => {
      // Arrange

      // Act
      registry.extend('order', [], 'plugin-empty')

      // Assert
      const collection = registry.getCollection('order')!
      expect(collection.extendedFields).toHaveLength(0)
    })
  })
})
```

### 3.3 CollectionRegistry resolveAll

```typescript
describe('CollectionRegistry - resolveAll', () => {
  let registry: CollectionRegistry

  beforeEach(() => {
    registry = new CollectionRegistry()
  })

  it('resolveAll generates correct allFields from baseFields and extendedFields', () => {
    // Arrange
    registry.register({
      name: 'order',
      baseFields: ORDER_BASE_FIELDS,
      extendedFields: [],
      allFields: [],
      extendsFrom: [],
    })
    registry.extend('order', [
      { name: 'warehouse_id', type: 'belongsTo', target: 'warehouse' },
    ], 'plugin-b')
    registry.extend('order', [
      { name: 'priority', type: 'number', default: 0 },
    ], 'plugin-c')

    // Act
    const resolved = registry.resolveAll()

    // Assert
    const order = resolved.find(c => c.name === 'order')
    expect(order).not.toBeNull()
    expect(order!.allFields).toHaveLength(5)
    expect(order!.allFields[0].name).toBe('id')
    expect(order!.allFields[1].name).toBe('amount')
    expect(order!.allFields[2].name).toBe('status')
    expect(order!.allFields[3].name).toBe('warehouse_id')
    expect(order!.allFields[4].name).toBe('priority')
  })

  it('resolveAll respects extension dependency order', () => {
    // Arrange
    registry.register({
      name: 'order',
      baseFields: ORDER_BASE_FIELDS,
      extendedFields: [],
      allFields: [],
      extendsFrom: [],
    })
    // Extend in reverse alphabetic order; resolveAll sorts by dependency
    registry.extend('order', [{ name: 'z_field', type: 'string' }], 'plugin-z')
    registry.extend('order', [{ name: 'a_field', type: 'number' }], 'plugin-a')

    // Act
    const resolved = registry.resolveAll()
    const order = resolved.find(c => c.name === 'order')!

    // Assert - extendedFields in order of extension (stable by registration order)
    expect(order.extendedFields[0].name).toBe('z_field')
    expect(order.extendedFields[1].name).toBe('a_field')
    // allFields is baseFields + extendedFields in registration order
    expect(order.allFields[3].name).toBe('z_field')
    expect(order.allFields[4].name).toBe('a_field')
  })

  it('resolveAll returns all registered collections', () => {
    // Arrange
    registry.register({ name: 'order', baseFields: ORDER_BASE_FIELDS, extendedFields: [], allFields: [], extendsFrom: [] })
    registry.register({ name: 'product', baseFields: PRODUCT_BASE_FIELDS, extendedFields: [], allFields: [], extendsFrom: [] })

    // Act
    const resolved = registry.resolveAll()

    // Assert
    expect(resolved).toHaveLength(2)
    const names = resolved.map(c => c.name)
    expect(names).toContain('order')
    expect(names).toContain('product')
  })

  it('resolveAll records extendsFrom metadata', () => {
    // Arrange
    registry.register({ name: 'order', baseFields: ORDER_BASE_FIELDS, extendedFields: [], allFields: [], extendsFrom: [] })
    registry.extend('order', [{ name: 'warehouse_id', type: 'belongsTo', target: 'warehouse' }], 'plugin-b')

    // Act
    const resolved = registry.resolveAll()
    const order = resolved.find(c => c.name === 'order')!

    // Assert
    expect(order.extendsFrom).toHaveLength(1)
    expect(order.extendsFrom[0].pluginName).toBe('plugin-b')
    expect(order.extendsFrom[0].declarations[0].collection).toBe('order')
    expect(order.extendsFrom[0].declarations[0].addFields[0].name).toBe('warehouse_id')
  })

  it('resolveAll on empty registry returns empty array', () => {
    // Arrange - no collections registered

    // Act
    const resolved = registry.resolveAll()

    // Assert
    expect(resolved).toEqual([])
  })
})
```

---

## 4. 集成测试

```
测试文件: packages/data-extends/src/__tests__/integration/data-extends.integration.test.ts
```

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { CollectionRegistry } from '../../collection-registry'
import type { FieldDefinition } from '../../types'

const USER_BASE_FIELDS: FieldDefinition[] = [
  { name: 'id', type: 'string', required: true },
  { name: 'email', type: 'string', required: true },
  { name: 'name', type: 'string' },
]

describe('Data Extends 集成测试', () => {
  let registry: CollectionRegistry

  beforeEach(() => {
    registry = new CollectionRegistry()
  })

  it('多插件协作扩展同 Collection 并最终化', () => {
    // Arrange - 插件 A 定义 user
    registry.register({ name: 'user', baseFields: USER_BASE_FIELDS, extendedFields: [], allFields: [], extendsFrom: [] })

    // Act - 插件 B 扩展 user
    registry.extend('user', [{ name: 'department', type: 'string' }], 'plugin-b-department')
    // 插件 C 扩展 user
    registry.extend('user', [{ name: 'hire_date', type: 'date' }], 'plugin-c-hr')
    // 插件 D 扩展 user（与插件 B 同字段名同类型，应跳过）
    registry.extend('user', [{ name: 'department', type: 'string', description: '部门名称' }], 'plugin-d-duplicate')

    const resolved = registry.resolveAll()

    // Assert - department 只出现一次
    const user = resolved.find(c => c.name === 'user')!
    expect(user.allFields).toHaveLength(5)
    const deptFields = user.allFields.filter(f => f.name === 'department')
    expect(deptFields).toHaveLength(1)
    expect(user.extendsFrom).toHaveLength(3)
  })

  it('冲突插件标记失败不影响其他扩展', () => {
    // Arrange - 插件 A 定义 product
    registry.register({ name: 'product', baseFields: PRODUCT_BASE_FIELDS, extendedFields: [], allFields: [], extendsFrom: [] })

    // Act - 插件 B 正常扩展
    registry.extend('product', [{ name: 'category', type: 'string' }], 'plugin-b')
    // 插件 C 冲突扩展（price 已存在且为 number）
    expect(() => {
      registry.extend('product', [{ name: 'price', type: 'string' }], 'plugin-c')
    }).toThrow('EXTENDS_FIELD_CONFLICT')
    // 插件 D 正常扩展（在冲突声明后继续注册）
    registry.extend('product', [{ name: 'tags', type: 'string' }], 'plugin-d')

    const resolved = registry.resolveAll()
    const product = resolved.find(c => c.name === 'product')!

    // Assert - 冲突不影响正常扩展
    expect(product.allFields).toHaveLength(5) // id, name, price + category, tags
    expect(product.allFields.find(f => f.name === 'category')).toBeDefined()
    expect(product.allFields.find(f => f.name === 'tags')).toBeDefined()
  })

  it('belongsTo 字段引用不同目标 Collection', () => {
    // Arrange
    registry.register({ name: 'order', baseFields: ORDER_BASE_FIELDS, extendedFields: [], allFields: [], extendsFrom: [] })
    registry.register({ name: 'product', baseFields: PRODUCT_BASE_FIELDS, extendedFields: [], allFields: [], extendsFrom: [] })

    // Act
    registry.extend('order', [{ name: 'product_id', type: 'belongsTo', target: 'product' }], 'plugin-ext')
    registry.extend('product', [{ name: 'supplier_id', type: 'belongsTo', target: 'supplier' }], 'plugin-ext')

    const resolved = registry.resolveAll()

    // Assert
    const order = resolved.find(c => c.name === 'order')!
    const product = resolved.find(c => c.name === 'product')!
    expect(order.allFields.find(f => f.name === 'product_id')!.target).toBe('product')
    expect(product.allFields.find(f => f.name === 'supplier_id')!.target).toBe('supplier')
  })

  it('resolveAll 后再次调用返回一致结果', () => {
    // Arrange
    registry.register({ name: 'order', baseFields: ORDER_BASE_FIELDS, extendedFields: [], allFields: [], extendsFrom: [] })
    registry.extend('order', [{ name: 'note', type: 'string' }], 'plugin-note')

    // Act
    const first = registry.resolveAll()
    const second = registry.resolveAll()

    // Assert - 幂等性
    expect(first).toEqual(second)
  })
})
```

---

## 5. 契约测试

```
测试文件: packages/data-extends/src/__tests__/contracts/data-extends.contract.test.ts
```

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { CollectionRegistry } from '../../collection-registry'
import type { FieldDefinition, ResolvedCollection } from '../../types'

describe('Data Extends 接口契约', () => {
  let registry: CollectionRegistry

  beforeEach(() => {
    registry = new CollectionRegistry()
  })

  it('ResolvedCollection 包含所有必要字段', () => {
    // Arrange
    registry.register({
      name: 'task',
      baseFields: [{ name: 'title', type: 'string' }],
      extendedFields: [],
      allFields: [],
      extendsFrom: [],
    })
    registry.extend('task', [{ name: 'assignee', type: 'string' }], 'plugin-ext')

    // Act
    const resolved = registry.resolveAll()
    const task = resolved.find(c => c.name === 'task')!

    // Assert - ResolvedCollection 接口完整性
    expect(task).toHaveProperty('name')
    expect(task).toHaveProperty('baseFields')
    expect(task).toHaveProperty('extendedFields')
    expect(task).toHaveProperty('allFields')
    expect(task).toHaveProperty('extendsFrom')
    expect(Array.isArray(task.baseFields)).toBe(true)
    expect(Array.isArray(task.extendedFields)).toBe(true)
    expect(Array.isArray(task.allFields)).toBe(true)
    expect(Array.isArray(task.extendsFrom)).toBe(true)
  })

  it('FieldDefinition 包含所有可选字段', () => {
    // Arrange
    registry.register({
      name: 'task',
      baseFields: [
        { name: 'title', type: 'string', required: true, unique: true, default: '', description: '任务标题' },
        { name: 'owner', type: 'belongsTo', target: 'user', description: '负责人' },
      ],
      extendedFields: [],
      allFields: [],
      extendsFrom: [],
    })

    // Act
    const task = registry.getCollection('task')!

    // Assert
    const title = task.baseFields.find(f => f.name === 'title')!
    expect(title.required).toBe(true)
    expect(title.unique).toBe(true)
    expect(title.default).toBe('')
    expect(title.description).toBe('任务标题')

    const owner = task.baseFields.find(f => f.name === 'owner')!
    expect(owner.target).toBe('user')
  })

  it('register 和 extend 是同步 API（无 Promise）', () => {
    // Arrange
    // Act - 同步调用，不 await
    registry.register({ name: 'sync_test', baseFields: [{ name: 'x', type: 'number' }], extendedFields: [], allFields: [], extendsFrom: [] })
    registry.extend('sync_test', [{ name: 'y', type: 'string' }], 'plugin-sync')

    // Assert - 同步返回
    const collection = registry.getCollection('sync_test')
    expect(collection).not.toBeNull()
    expect(collection!.extendedFields).toHaveLength(1)
  })

  it('resolveAll 返回不可变风格的 ResolvedCollection 数组', () => {
    // Arrange
    registry.register({ name: 'immutable_test', baseFields: [{ name: 'a', type: 'string' }], extendedFields: [], allFields: [], extendsFrom: [] })
    registry.extend('immutable_test', [{ name: 'b', type: 'number' }], 'plugin-b')
    registry.register({ name: 'other', baseFields: [{ name: 'c', type: 'boolean' }], extendedFields: [], allFields: [], extendsFrom: [] })

    // Act
    const resolved = registry.resolveAll()

    // Assert - 返回数组包含所有已注册 Collection
    expect(resolved.length).toBeGreaterThanOrEqual(2)
    resolved.forEach((c: ResolvedCollection) => {
      expect(typeof c.name).toBe('string')
      expect(Array.isArray(c.baseFields)).toBe(true)
      expect(Array.isArray(c.allFields)).toBe(true)
    })
  })
})
```

---

## 6. E2E 测试

Data Extends 是纯内存库，无 UI 或外部服务依赖。E2E 测试在 `packages/core` 集成中验证：
插件 A 注册 Collection → 插件 B extends → resolveAll() → Core 数据 API 返回合并字段。

```
packages/core/__e2e__/data-extends.e2e.ts
```

| 用例 | 描述 |
|------|------|
| 插件加载流程验证 | Core 启动后，插件 A 注册 order Collection，插件 B extends warehouse_id，验证 Core API 返回的 order 记录包含 warehouse_id 字段 |

**注**: Phase 1b E2E 需配合 Core 插件加载生命周期和 D12 数据代理。纯 `data-extends` 包仅需单元/集成/契约测试。

---

## 7. 种子数据

```
packages/data-extends/src/__tests__/seeds/data-extends-fixtures.ts
```

Data Extends 模块无数据库依赖，种子数据提供测试用的 `FieldDefinition` 和 `ResolvedCollection` 工厂：

```typescript
import type { FieldDefinition, ResolvedCollection } from '../../types'

/** 订单 Collection 基字段 */
export function createOrderBaseFields(): FieldDefinition[] {
  return [
    { name: 'id', type: 'string', required: true },
    { name: 'amount', type: 'number', default: 0 },
    { name: 'status', type: 'string', default: 'draft' },
  ]
}

/** 产品 Collection 基字段 */
export function createProductBaseFields(): FieldDefinition[] {
  return [
    { name: 'id', type: 'string', required: true },
    { name: 'name', type: 'string', required: true },
    { name: 'price', type: 'number', default: 0 },
  ]
}

/** 创建空的 ResolvedCollection 骨架，用于注册 */
export function createBaseCollection(name: string, baseFields: FieldDefinition[]): ResolvedCollection {
  return {
    name,
    baseFields,
    extendedFields: [],
    allFields: [],
    extendsFrom: [],
  }
}

/** 仓库扩展字段 */
export function createWarehouseExtendFields(): FieldDefinition[] {
  return [
    { name: 'warehouse_id', type: 'belongsTo', target: 'warehouse', description: '关联仓库' },
    { name: 'priority', type: 'number', default: 0, description: '订单优先级' },
  ]
}

/** 默认 CollectionRegistry 实例工厂 */
export function createRegistry(): ConstructorParameters<typeof CollectionRegistry>[0] extends undefined
  ? CollectionRegistry
  : never {
  return new (require('../../collection-registry').CollectionRegistry)()
}
```

---

## 8. Mock 策略

| 依赖 | 单元测试 | 集成测试 |
|------|---------|---------|
| 内存 `Map<string, ResolvedCollection>` | 真实 `CollectionRegistry` 实例 | 真实 `CollectionRegistry` 实例 |
| `FieldDefinition` / `FieldType` | 直接内联构造 | 工厂方法（seeds） |
| 插件名称 | `string` 字面量 | `string` 字面量 |
| shared-types | 仅导入类型，无运行时依赖 | 仅导入类型，无运行时依赖 |

### Mock 约束

| 约束 | 说明 |
|------|------|
| 同步 API | `register()`, `extend()`, `getCollection()`, `resolveAll()` 均为同步方法 |
| 内存存储 | 测试使用真实 `CollectionRegistry` 实例，内部使用 `Map<string, ResolvedCollection>` |
| 隔离性 | 每个测试用例创建新实例，`beforeEach` 中重置 |
| 注册顺序 | 测试必须显式 register 目标 Collection 后再 extend |
| 无异步 | CollectionRegistry 是纯同步实现，无需 async/await |
| 结构类型 | 测试直接构造 `FieldDefinition` 对象字面量，不依赖工厂 |
| 插件名追踪 | extend 调用需传入真实 pluginName，验证 extendsFrom 记录 |

---

## 9. 覆盖率目标

| 指标 | 目标 | 关键路径 |
|------|:---:|------|
| 行覆盖率 | **85%+** | |
| 分支覆盖率 | **80%+** | extend() 四条分支：新字段 / 同类型跳过 / 不同类型冲突 / Collection 不存在 |
| 函数覆盖率 | **90%+** | register / extend / getCollection / getCollectionNames / resolveAll |
| 单元 | 16+ | CollectionRegistry 全部方法 + 全部 4 种错误场景 + 边界 |
| 集成 | 4+ | 多插件协作 + 冲突隔离 + belongsTo 引用 + 幂等性 |
| 契约 | 3+ | ResolvedCollection 接口完整性 + FieldDefinition 可选字段 + 同步 API 约束 |

---

## 10. CI 集成

```yaml
data-extends-test:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: pnpm/action-setup@v4
    - run: pnpm install --frozen-lockfile
    - run: pnpm --filter @audebase/data-extends test:unit
    - run: pnpm --filter @audebase/data-extends test:integration
    - run: pnpm --filter @audebase/data-extends test:contract
```

**注**: Data Extends 模块无外部依赖（仅内存 Map），CI 无需启动 PostgreSQL 或 Redis 服务。纯同步 API，无需任何基础设施。

---

## 11. 用例汇总

| 测试层 | 用例数 |
|--------|:---:|
| 单元 - 注册与查询 (register/getCollection/getCollectionNames) | 5 |
| 单元 - 扩展与合并 (extend 正常/冲突/跳过/边界) | 9 |
| 单元 - 最终化 (resolveAll 合并/排序/元数据/空) | 5 |
| 集成 - 多插件协作 | 4 |
| 契约 - 接口完整性 | 3 |
| **合计** | **26** |

---

## 12. 参考

- [data-extends-sdd.md](data-extends-sdd.md) — Data Extends 模块 SDD
- [shared-types-tdd.md](shared-types-tdd.md) — FieldType 枚举定义
- [plugin-framework-tdd.md](plugin-framework-tdd.md) — 插件加载顺序与生命周期
- [migration-engine-tdd.md](migration-engine-tdd.md) — 迁移指令生成
- [../../.agents/memorys/decisions.md](../../.agents/memorys/decisions.md) — D12.1 插件间数据模型扩展
- [test-seed-strategy.md](test-seed-strategy.md) — 集成测试策略

> **上游 TDD 参考**: [shared-types-tdd.md §3.1](shared-types-tdd.md) — FieldType; [plugin-framework-tdd.md](plugin-framework-tdd.md) — 插件 load() 生命周期