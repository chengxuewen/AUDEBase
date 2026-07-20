/**
 * @audebase/data-extends - CollectionRegistry implementation
 *
 * In-memory registry for plugin Collection extensions (D12.1).
 * References: Odoo _inherit pattern, NocoBase Collection field extension.
 */

import type {
  CollectionDefinition,
  ExtendDeclaration,
  FieldDefinition,
  FieldType,
  ResolvedCollection,
} from './types.js'

/** Valid FieldType set for runtime validation. */
const VALID_FIELD_TYPES: ReadonlySet<FieldType> = new Set<FieldType>([
  'string',
  'number',
  'boolean',
  'date',
  'belongsTo',
  'hasMany',
])

/**
 * Error thrown when an extend targets a Collection that has not been registered.
 */
export class ExtendsCollectionNotFoundError extends Error {
  constructor(
    public readonly collectionName: string,
    public readonly pluginName: string,
  ) {
    super(
      `Collection '${collectionName}' not found for plugin '${pluginName}'`,
    )
    this.name = 'ExtendsCollectionNotFoundError'
    Object.setPrototypeOf(this, ExtendsCollectionNotFoundError.prototype)
  }
}

/**
 * Error thrown when two fields share a name but have incompatible types.
 */
export class ExtendsFieldConflictError extends Error {
  constructor(
    public readonly fieldName: string,
    public readonly collectionName: string,
    public readonly existingType: FieldType,
    public readonly newType: FieldType,
    public readonly pluginName: string,
  ) {
    super(
      `Field conflict: '${fieldName}' in collection '${collectionName}' - existing type '${existingType}' conflicts with new type '${newType}' from plugin '${pluginName}'`,
    )
    this.name = 'ExtendsFieldConflictError'
    Object.setPrototypeOf(this, ExtendsFieldConflictError.prototype)
  }
}

/**
 * Error thrown when a field declares an invalid FieldType.
 */
export class ExtendsInvalidFieldTypeError extends Error {
  constructor(
    public readonly fieldName: string,
    public readonly invalidType: string,
    public readonly pluginName: string,
  ) {
    super(
      `Invalid field type '${invalidType}' for field '${fieldName}' in plugin '${pluginName}'`,
    )
    this.name = 'ExtendsInvalidFieldTypeError'
    Object.setPrototypeOf(this, ExtendsInvalidFieldTypeError.prototype)
  }
}

/**
 * Error thrown when a belongsTo/hasMany field is missing its target.
 */
export class ExtendsMissingTargetError extends Error {
  constructor(
    public readonly fieldName: string,
    public readonly fieldType: FieldType,
    public readonly pluginName: string,
  ) {
    super(
      `belongsTo/hasMany field '${fieldName}' missing target in plugin '${pluginName}'`,
    )
    this.name = 'ExtendsMissingTargetError'
    Object.setPrototypeOf(this, ExtendsMissingTargetError.prototype)
  }
}

/**
 * Internal storage for a registered Collection plus its extensions.
 */
interface CollectionEntry {
  definition: CollectionDefinition
  extensions: ExtendDeclaration[]
}

/**
 * CollectionRegistry - in-memory registry for Collection definitions and
 * plugin field extensions.
 *
 * Workflow:
 * 1. Owning plugin calls `register()` during load() to declare base fields.
 * 2. Extending plugins call `extend()` to add fields to an existing Collection.
 * 3. After all plugins load, `resolveAll()` produces merged Collections.
 *
 * Merge rules (SDD §2 Merge Algorithm):
 * - Base fields come first, extension fields appended in registration order.
 * - Same name + different type → throw ExtendsFieldConflictError.
 * - Same name + same type → idempotent skip (no error, first definition wins).
 * - Same name + same type but stricter attributes → merge takes stricter value
 *   (required=true wins, unique=true wins).
 */
export class CollectionRegistry {
  private readonly collections = new Map<string, CollectionEntry>()

  /**
   * Register a Collection and its base fields.
   * Called by the owning plugin during load().
   */
  register(collection: CollectionDefinition): void {
    // If already registered, keep the first registration (idempotent for base).
    if (this.collections.has(collection.name)) {
      return
    }

    this.collections.set(collection.name, {
      definition: collection,
      extensions: [],
    })
  }

  /**
   * Declare a field extension on an existing Collection.
   * Called by extending plugins during load(), after the owning plugin's register().
   *
   * @throws {ExtendsCollectionNotFoundError} if the target Collection is not registered.
   * @throws {ExtendsFieldConflictError} if a field name conflicts with an incompatible type.
   * @throws {ExtendsInvalidFieldTypeError} if a field declares an invalid type.
   * @throws {ExtendsMissingTargetError} if a belongsTo/hasMany field lacks a target.
   */
  extend(
    collectionName: string,
    fields: FieldDefinition[],
    pluginName: string,
  ): void {
    const entry = this.collections.get(collectionName)
    if (!entry) {
      throw new ExtendsCollectionNotFoundError(collectionName, pluginName)
    }

    // Validate all fields before storing the declaration.
    for (const field of fields) {
      validateField(field, pluginName)
    }

    // Check for type conflicts against base fields + all prior extensions.
    const existingFields = this.collectExistingFields(entry)
    for (const field of fields) {
      const existing = existingFields.get(field.name)
      if (existing && existing.type !== field.type) {
        throw new ExtendsFieldConflictError(
          field.name,
          collectionName,
          existing.type,
          field.type,
          pluginName,
        )
      }
    }

    // Store the declaration.
    entry.extensions.push({
      collection: collectionName,
      addFields: fields,
      pluginName,
    })
  }

  /**
   * Get a merged Collection by name.
   * Returns null if the Collection does not exist.
   */
  getCollection(name: string): ResolvedCollection | null {
    const entry = this.collections.get(name)
    if (!entry) {
      return null
    }
    return this.resolveEntry(entry)
  }

  /**
   * Check whether a Collection has been registered.
   */
  hasCollection(name: string): boolean {
    return this.collections.has(name)
  }

  /**
   * Get all registered Collection names.
   */
  getCollectionNames(): string[] {
    return [...this.collections.keys()]
  }

  /**
   * Get raw extension declarations for a Collection.
   * Returns an empty array if the Collection has no extensions or does not exist.
   */
  getExtensions(collectionName: string): ExtendDeclaration[] {
    const entry = this.collections.get(collectionName)
    if (!entry) {
      return []
    }
    return entry.extensions.map((ext) => ({ ...ext }))
  }

  /**
   * Resolve all Collections with extensions merged.
   * Called once after all plugins have finished load().
   */
  resolveAll(): ResolvedCollection[] {
    const results: ResolvedCollection[] = []
    for (const entry of this.collections.values()) {
      results.push(this.resolveEntry(entry))
    }
    return results
  }

  // --- internals ---

  /**
   * Collect all field definitions that currently exist for a Collection
   * (base fields + all prior extension fields), keyed by field name.
   */
  private collectExistingFields(entry: CollectionEntry): Map<string, FieldDefinition> {
    const map = new Map<string, FieldDefinition>()
    for (const field of entry.definition.fields) {
      map.set(field.name, field)
    }
    for (const ext of entry.extensions) {
      for (const field of ext.addFields) {
        // Only store first occurrence (same-name + same-type is idempotent skip).
        if (!map.has(field.name)) {
          map.set(field.name, field)
        }
      }
    }
    return map
  }

  /**
   * Merge base fields and extension fields into a ResolvedCollection.
   *
   * Merge logic for same-name + same-type fields:
   * - required: true wins (stricter).
   * - unique: true wins (stricter).
   * - Other attributes from the first definition are preserved.
   */
  private resolveEntry(entry: CollectionEntry): ResolvedCollection {
    const baseFields = entry.definition.fields.map((f) => ({ ...f }))
    const extendedFields: FieldDefinition[] = []
    const mergedByName = new Map<string, FieldDefinition>()

    // Seed with base fields.
    for (const field of baseFields) {
      mergedByName.set(field.name, { ...field })
    }

    // Merge extension fields in registration order.
    for (const ext of entry.extensions) {
      for (const field of ext.addFields) {
        const existing = mergedByName.get(field.name)
        if (!existing) {
          // New field — append.
          const copy: FieldDefinition = { ...field }
          extendedFields.push(copy)
          mergedByName.set(field.name, copy)
        } else {
          // Same name + same type (conflict already checked in extend()).
          // Merge stricter attributes.
          if (field.required === true) {
            existing.required = true
          }
          if (field.unique === true) {
            existing.unique = true
          }
        }
      }
    }

    const allFields: FieldDefinition[] = [
      ...baseFields.map((f) => {
        const merged = mergedByName.get(f.name)
        return merged ? { ...merged } : { ...f }
      }),
      ...extendedFields.map((f) => ({ ...mergedByName.get(f.name) ?? f })),
    ]

    return {
      name: entry.definition.name,
      tableName: entry.definition.tableName ?? entry.definition.name,
      baseFields,
      extendedFields,
      allFields,
      extensions: entry.extensions.map((ext) => ({ ...ext })),
    }
  }
}

/**
 * Validate a single field definition.
 * @throws {ExtendsInvalidFieldTypeError} if the type is not a valid FieldType.
 * @throws {ExtendsMissingTargetError} if a relation field lacks a target.
 */
function validateField(field: FieldDefinition, pluginName: string): void {
  if (!VALID_FIELD_TYPES.has(field.type)) {
    throw new ExtendsInvalidFieldTypeError(
      field.name,
      field.type,
      pluginName,
    )
  }

  if (
    (field.type === 'belongsTo' || field.type === 'hasMany') &&
    (field.target === undefined || field.target === '')
  ) {
    throw new ExtendsMissingTargetError(field.name, field.type, pluginName)
  }
}
