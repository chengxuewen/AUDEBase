/**
 * @audebase/data-extends - Local type definitions
 *
 * References: D12.1 (Odoo _inherit pattern), data-extends-sdd.md §2
 */

/** Field types supported in Phase 1b extends. */
export type FieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'date'
  | 'belongsTo'
  | 'hasMany'

/**
 * Field definition. Supports scalar types and relation types.
 * required/unique validation is the responsibility of the declaring plugin
 * (Phase 1b does not enforce cross-plugin validation).
 */
export interface FieldDefinition {
  /** Field name (must be unique within the same Collection) */
  name: string
  /** Field type */
  type: FieldType
  /** Related target Collection (required for belongsTo/hasMany) */
  target?: string
  /** Whether the field is required */
  required?: boolean
  /** Whether the field must be unique */
  unique?: boolean
  /** Default value */
  default?: unknown
  /** Field description */
  description?: string
}

/**
 * A Collection declared by its owning plugin during load().
 */
export interface CollectionDefinition {
  /** Collection name */
  name: string
  /** Base field definitions from the owning plugin */
  fields: FieldDefinition[]
  /** Optional physical table name (defaults to collection name) */
  tableName?: string
}

/**
 * Declaration of an extension from a plugin's manifest.yaml.
 * Each entry adds fields to an existing Collection.
 */
export interface ExtendDeclaration {
  /** Target Collection name (e.g. 'order', 'user') */
  collection: string
  /** Fields to add */
  addFields: FieldDefinition[]
  /** Name of the plugin that declared this extension */
  pluginName: string
}

/**
 * A Collection with all extensions merged in.
 * Provided to Core data proxy (D12) and migration-engine.
 */
export interface ResolvedCollection {
  /** Collection name */
  name: string
  /** Physical table name */
  tableName: string
  /** Base fields from the owning plugin */
  baseFields: FieldDefinition[]
  /** All extension fields appended in plugin load order */
  extendedFields: FieldDefinition[]
  /** baseFields + extendedFields merged result */
  allFields: FieldDefinition[]
  /** Raw extension declarations for this collection */
  extensions: ExtendDeclaration[]
}
