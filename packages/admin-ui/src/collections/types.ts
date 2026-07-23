import type { CollectionDef as BaseCollectionDef, FieldDef as BaseFieldDef } from '@audebase/schema-engine'

/**
 * Extended FieldDef with D26 mapper/collection metadata.
 * Mirrors schema-engine FieldDef but with mutable optional fields
 * for collection definition authoring.
 */
export interface FieldDef extends BaseFieldDef {
  label?: string
  enumValues?: string[]
  format?: string
  target?: string
  required?: boolean
}

/**
 * Extended CollectionDef with D26 mapper metadata.
 * Adds title for display and customActions for action buttons.
 */
export interface CollectionDef extends Omit<BaseCollectionDef, 'fields'> {
  title?: string
  fields: FieldDef[]
  customActions?: Array<{
    name: string
    label: string
    action?: string
    params?: Record<string, unknown>
    handler?: string
  }>
}
