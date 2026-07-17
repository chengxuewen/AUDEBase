/**
 * @audebase/data-extends - Public API
 *
 * Plugin-to-plugin Collection field extension (D12.1).
 * References: Odoo _inherit pattern, NocoBase Collection field extension.
 */

export { CollectionRegistry } from './collection-registry.js'
export {
  ExtendsCollectionNotFoundError,
  ExtendsFieldConflictError,
  ExtendsInvalidFieldTypeError,
  ExtendsMissingTargetError,
} from './collection-registry.js'
export type {
  FieldType,
  FieldDefinition,
  CollectionDefinition,
  ExtendDeclaration,
  ResolvedCollection,
} from './types.js'
