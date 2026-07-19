/**
 * Schema-driven UI types — defines the contract between schema-engine and admin-ui.
 *
 * These types mirror what @audebase/schema-engine will export.
 * When schema-engine is created, these can be replaced with the real import.
 *
 * @see decisions.md D7 (Schema→Ant Design 映射器)
 * @see decisions.md D3 (Schema Engine 动态模型)
 */

/** Field type as defined in the schema engine (D3 Collection + Field) */
export type FieldType =
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "datetime"
  | "email"
  | "url"
  | "enum"
  | "text"
  | "json";

/** Single field definition in a collection */
export interface FieldDef {
  /** Field name (column name) */
  name: string;
  /** Field type — determines the rendered form control / table valueType */
  type: FieldType;
  /** Display label (falls back to name if omitted) */
  label?: string;
  /** Whether the field is required */
  required?: boolean;
  /** Max string length (type: string, text) */
  maxLength?: number;
  /** Min numeric value (type: number) */
  min?: number;
  /** Max numeric value (type: number) */
  max?: number;
  /** Enum values (type: enum) */
  enumValues?: string[];
  /** Default value */
  default?: unknown;
  /** Read-only — shown in table, hidden in form create */
  readOnly?: boolean;
  /** Hidden — not shown in table or form */
  hidden?: boolean;
}

/** Permission flags for a collection */
export interface CollectionPermissions {
  canCreate?: boolean;
  canUpdate?: boolean;
  canDelete?: boolean;
}

/** A collection definition (like a database table / model) */
export interface CollectionDef {
  /** Collection name, e.g. "order", "warehouse" — used as API resource name */
  name: string;
  /** Display label (falls back to name if omitted) */
  label?: string;
  /** Field definitions */
  fields: FieldDef[];
  /** CRUD permission flags */
  permissions?: CollectionPermissions;
}
