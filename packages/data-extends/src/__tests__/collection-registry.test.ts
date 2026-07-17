/**
 * @audebase/data-extends - CollectionRegistry unit tests
 *
 * AAA pattern. Each test creates a fresh registry in beforeEach.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  CollectionRegistry,
  ExtendsCollectionNotFoundError,
  ExtendsFieldConflictError,
  ExtendsInvalidFieldTypeError,
  ExtendsMissingTargetError,
} from '../collection-registry.js'
import type {
  CollectionDefinition,
  FieldDefinition,
} from '../types.js'

describe('CollectionRegistry', () => {
  let registry: CollectionRegistry

  beforeEach(() => {
    registry = new CollectionRegistry()
  })

  // --- Helper factories ---

  function makeOrderCollection(): CollectionDefinition {
    return {
      name: 'order',
      fields: [
        { name: 'title', type: 'string', required: true },
        { name: 'amount', type: 'number', default: 0 },
      ],
    }
  }

  function makeField(name: string, type: FieldDefinition['type'], extra?: Partial<FieldDefinition>): FieldDefinition {
    return { name, type, ...extra }
  }

  // --- register + getCollection ---

  describe('register', () => {
    it('returns correct fields when registering a base collection', () => {
      // Arrange
      const collection = makeOrderCollection()

      // Act
      registry.register(collection)
      const result = registry.getCollection('order')

      // Assert
      expect(result).not.toBeNull()
      expect(result!.name).toBe('order')
      expect(result!.baseFields).toHaveLength(2)
      expect(result!.baseFields[0].name).toBe('title')
      expect(result!.baseFields[1].name).toBe('amount')
      expect(result!.extendedFields).toHaveLength(0)
      expect(result!.allFields).toHaveLength(2)
    })

    it('uses collection name as tableName when not specified', () => {
      // Arrange
      const collection = makeOrderCollection()

      // Act
      registry.register(collection)
      const result = registry.getCollection('order')

      // Assert
      expect(result!.tableName).toBe('order')
    })

    it('uses custom tableName when specified', () => {
      // Arrange
      const collection: CollectionDefinition = {
        name: 'order',
        tableName: 'orders_table',
        fields: [{ name: 'title', type: 'string' }],
      }

      // Act
      registry.register(collection)
      const result = registry.getCollection('order')

      // Assert
      expect(result!.tableName).toBe('orders_table')
    })

    it('is idempotent - second register does not overwrite first', () => {
      // Arrange
      const first: CollectionDefinition = {
        name: 'order',
        fields: [{ name: 'title', type: 'string' }],
      }
      const second: CollectionDefinition = {
        name: 'order',
        fields: [{ name: 'override_attempt', type: 'number' }],
      }

      // Act
      registry.register(first)
      registry.register(second)
      const result = registry.getCollection('order')

      // Assert
      expect(result!.baseFields).toHaveLength(1)
      expect(result!.baseFields[0].name).toBe('title')
    })
  })

  // --- getCollection ---

  describe('getCollection', () => {
    it('returns null for a non-existent collection', () => {
      // Act
      const result = registry.getCollection('unknown')

      // Assert
      expect(result).toBeNull()
    })
  })

  // --- hasCollection ---

  describe('hasCollection', () => {
    it('returns true for a registered collection', () => {
      // Arrange
      registry.register(makeOrderCollection())

      // Act + Assert
      expect(registry.hasCollection('order')).toBe(true)
    })

    it('returns false for an unknown collection', () => {
      // Act + Assert
      expect(registry.hasCollection('unknown')).toBe(false)
    })
  })

  // --- extend ---

  describe('extend', () => {
    it('adds extended fields to allFields', () => {
      // Arrange
      registry.register(makeOrderCollection())
      const extFields = [
        makeField('warehouse_id', 'belongsTo', { target: 'warehouse' }),
      ]

      // Act
      registry.extend('order', extFields, 'plugin-warehouse')
      const result = registry.getCollection('order')

      // Assert
      expect(result!.extendedFields).toHaveLength(1)
      expect(result!.extendedFields[0].name).toBe('warehouse_id')
      expect(result!.allFields).toHaveLength(3)
      expect(result!.allFields[2].name).toBe('warehouse_id')
    })

    it('appends fields from multiple plugins in registration order', () => {
      // Arrange
      registry.register(makeOrderCollection())

      // Act
      registry.extend('order', [makeField('warehouse_id', 'belongsTo', { target: 'warehouse' })], 'plugin-b')
      registry.extend('order', [makeField('priority', 'number', { default: 0 })], 'plugin-c')
      const result = registry.getCollection('order')

      // Assert
      expect(result!.extendedFields).toHaveLength(2)
      expect(result!.extendedFields[0].name).toBe('warehouse_id')
      expect(result!.extendedFields[1].name).toBe('priority')
      expect(result!.allFields).toHaveLength(4)
      expect(result!.allFields.map((f) => f.name)).toEqual([
        'title',
        'amount',
        'warehouse_id',
        'priority',
      ])
    })

    it('throws EXTENDS_COLLECTION_NOT_FOUND when collection does not exist', () => {
      // Arrange
      const fields = [makeField('x', 'string')]

      // Act + Assert
      expect(() => registry.extend('unknown_coll', fields, 'plugin-x')).toThrow(
        ExtendsCollectionNotFoundError,
      )
      expect(() => registry.extend('unknown_coll', fields, 'plugin-x')).toThrow(
        /Collection 'unknown_coll' not found for plugin 'plugin-x'/,
      )
    })

    it('throws EXTENDS_FIELD_CONFLICT when same name has different type', () => {
      // Arrange
      registry.register(makeOrderCollection())
      // 'amount' is 'number' in base, try 'string'
      const fields = [makeField('amount', 'string')]

      // Act + Assert
      expect(() => registry.extend('order', fields, 'plugin-bad')).toThrow(
        ExtendsFieldConflictError,
      )
      expect(() => registry.extend('order', fields, 'plugin-bad')).toThrow(
        /Field conflict: 'amount' in collection 'order' - existing type 'number' conflicts with new type 'string' from plugin 'plugin-bad'/,
      )
    })

    it('does not throw when same name has same type (idempotent)', () => {
      // Arrange
      registry.register(makeOrderCollection())
      // 'amount' is 'number' in base, extend with same type
      const fields = [makeField('amount', 'number', { default: 100 })]

      // Act + Assert - should not throw
      expect(() => registry.extend('order', fields, 'plugin-ok')).not.toThrow()

      const result = registry.getCollection('order')
      expect(result!.extendedFields).toHaveLength(0)
      expect(result!.allFields).toHaveLength(2)
    })

    it('merges stricter required=true onto existing field', () => {
      // Arrange
      registry.register(makeOrderCollection())
      // 'amount' is not required in base, extend with required=true
      const fields = [makeField('amount', 'number', { required: true })]

      // Act
      registry.extend('order', fields, 'plugin-strict')
      const result = registry.getCollection('order')

      // Assert
      const amountField = result!.allFields.find((f) => f.name === 'amount')
      expect(amountField!.required).toBe(true)
    })

    it('merges stricter unique=true onto existing field', () => {
      // Arrange
      registry.register(makeOrderCollection())
      // 'title' is not unique in base, extend with unique=true
      const fields = [makeField('title', 'string', { unique: true })]

      // Act
      registry.extend('order', fields, 'plugin-strict')
      const result = registry.getCollection('order')

      // Assert
      const titleField = result!.allFields.find((f) => f.name === 'title')
      expect(titleField!.unique).toBe(true)
    })

    it('throws EXTENDS_INVALID_FIELD_TYPE for unknown type', () => {
      // Arrange
      registry.register(makeOrderCollection())
      const fields = [{ name: 'bad', type: 'invalid' as never }]

      // Act + Assert
      expect(() => registry.extend('order', fields, 'plugin-bad')).toThrow(
        ExtendsInvalidFieldTypeError,
      )
      expect(() => registry.extend('order', fields, 'plugin-bad')).toThrow(
        /Invalid field type 'invalid' for field 'bad' in plugin 'plugin-bad'/,
      )
    })

    it('throws EXTENDS_MISSING_TARGET for belongsTo without target', () => {
      // Arrange
      registry.register(makeOrderCollection())
      const fields = [makeField('ref', 'belongsTo')]

      // Act + Assert
      expect(() => registry.extend('order', fields, 'plugin-bad')).toThrow(
        ExtendsMissingTargetError,
      )
      expect(() => registry.extend('order', fields, 'plugin-bad')).toThrow(
        /belongsTo\/hasMany field 'ref' missing target in plugin 'plugin-bad'/,
      )
    })

    it('throws EXTENDS_MISSING_TARGET for hasMany without target', () => {
      // Arrange
      registry.register(makeOrderCollection())
      const fields = [makeField('items', 'hasMany')]

      // Act + Assert
      expect(() => registry.extend('order', fields, 'plugin-bad')).toThrow(
        ExtendsMissingTargetError,
      )
    })

    it('preserves target in resolved belongsTo field', () => {
      // Arrange
      registry.register(makeOrderCollection())
      const fields = [makeField('warehouse_id', 'belongsTo', { target: 'warehouse', description: '仓库关联' })]

      // Act
      registry.extend('order', fields, 'plugin-wh')
      const result = registry.getCollection('order')

      // Assert
      const whField = result!.allFields.find((f) => f.name === 'warehouse_id')
      expect(whField!.type).toBe('belongsTo')
      expect(whField!.target).toBe('warehouse')
      expect(whField!.description).toBe('仓库关联')
    })

    it('is a no-op when extending with empty fields array', () => {
      // Arrange
      registry.register(makeOrderCollection())

      // Act
      registry.extend('order', [], 'plugin-empty')
      const result = registry.getCollection('order')

      // Assert
      expect(result!.extendedFields).toHaveLength(0)
      expect(result!.allFields).toHaveLength(2)
    })

    it('merges all fields from multiple extensions on same collection', () => {
      // Arrange
      registry.register(makeOrderCollection())

      // Act
      registry.extend('order', [
        makeField('warehouse_id', 'belongsTo', { target: 'warehouse' }),
        makeField('status', 'string', { default: 'draft' }),
      ], 'plugin-a')
      registry.extend('order', [
        makeField('priority', 'number', { default: 0 }),
        makeField('tags', 'string'),
      ], 'plugin-b')
      const result = registry.getCollection('order')

      // Assert
      expect(result!.extendedFields).toHaveLength(4)
      expect(result!.allFields).toHaveLength(6)
      expect(result!.extensions).toHaveLength(2)
    })

    it('detects conflict between two extension fields with different types', () => {
      // Arrange
      registry.register(makeOrderCollection())
      registry.extend('order', [makeField('priority', 'number')], 'plugin-a')

      // Act + Assert - plugin-b tries same name with string type
      expect(() =>
        registry.extend('order', [makeField('priority', 'string')], 'plugin-b'),
      ).toThrow(ExtendsFieldConflictError)
    })

    it('allows same-name same-type across two extensions (idempotent)', () => {
      // Arrange
      registry.register(makeOrderCollection())

      // Act
      registry.extend('order', [makeField('priority', 'number')], 'plugin-a')
      registry.extend('order', [makeField('priority', 'number', { required: true })], 'plugin-b')
      const result = registry.getCollection('order')

      // Assert
      expect(result!.extendedFields).toHaveLength(1)
      expect(result!.extendedFields[0].name).toBe('priority')
      const priorityField = result!.allFields.find((f) => f.name === 'priority')
      expect(priorityField!.required).toBe(true)
    })
  })

  // --- getExtensions ---

  describe('getExtensions', () => {
    it('returns raw extension declarations for a collection', () => {
      // Arrange
      registry.register(makeOrderCollection())
      registry.extend('order', [makeField('warehouse_id', 'belongsTo', { target: 'warehouse' })], 'plugin-a')

      // Act
      const extensions = registry.getExtensions('order')

      // Assert
      expect(extensions).toHaveLength(1)
      expect(extensions[0].collection).toBe('order')
      expect(extensions[0].pluginName).toBe('plugin-a')
      expect(extensions[0].addFields).toHaveLength(1)
      expect(extensions[0].addFields[0].name).toBe('warehouse_id')
    })

    it('returns empty array for a collection with no extensions', () => {
      // Arrange
      registry.register(makeOrderCollection())

      // Act
      const extensions = registry.getExtensions('order')

      // Assert
      expect(extensions).toEqual([])
    })

    it('returns empty array for a non-existent collection', () => {
      // Act
      const extensions = registry.getExtensions('unknown')

      // Assert
      expect(extensions).toEqual([])
    })
  })

  // --- resolveAll ---

  describe('resolveAll', () => {
    it('returns all collections with extensions merged', () => {
      // Arrange
      registry.register(makeOrderCollection())
      registry.register({
        name: 'product',
        fields: [{ name: 'sku', type: 'string', required: true }],
      })
      registry.extend('order', [makeField('priority', 'number')], 'plugin-a')
      registry.extend('product', [makeField('stock', 'number', { default: 0 })], 'plugin-b')

      // Act
      const all = registry.resolveAll()

      // Assert
      expect(all).toHaveLength(2)
      const order = all.find((c) => c.name === 'order')
      const product = all.find((c) => c.name === 'product')
      expect(order!.allFields).toHaveLength(3)
      expect(product!.allFields).toHaveLength(2)
    })

    it('returns empty array when no collections registered', () => {
      // Act
      const all = registry.resolveAll()

      // Assert
      expect(all).toEqual([])
    })
  })

  // --- getCollectionNames ---

  describe('getCollectionNames', () => {
    it('returns names of all registered collections', () => {
      // Arrange
      registry.register(makeOrderCollection())
      registry.register({ name: 'product', fields: [] })

      // Act
      const names = registry.getCollectionNames()

      // Assert
      expect(names).toHaveLength(2)
      expect(names).toContain('order')
      expect(names).toContain('product')
    })

    it('returns empty array when no collections registered', () => {
      // Act
      const names = registry.getCollectionNames()

      // Assert
      expect(names).toEqual([])
    })
  })
})
