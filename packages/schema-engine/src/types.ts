export type FieldType = "string" | "number" | "boolean" | "date" | "enum" | "belongsTo" | "hasMany";

export const FIELD_TYPES: readonly FieldType[] = [
  "string",
  "number",
  "boolean",
  "date",
  "enum",
  "belongsTo",
  "hasMany",
] as const;

export interface FieldDef {
  readonly name: string;
  readonly type: FieldType;
  readonly required?: boolean;
  readonly unique?: boolean;
  readonly default?: unknown;
  readonly enumValues?: readonly string[];
  readonly target?: string;
  readonly label?: string;
}

export interface CollectionDef {
  readonly name: string;
  readonly table?: string;
  readonly fields: readonly FieldDef[];
  readonly primaryKey?: string;
  readonly timestamps?: boolean;
}

export interface ValidationError {
  readonly path: string;
  readonly message: string;
}

export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly ValidationError[];
}
