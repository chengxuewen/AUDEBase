export { SchemaRegistry } from "./registry";
export { validateField, validateCollection } from "./validator";
export type {
  FieldType,
  FieldDef,
  CollectionDef,
  ValidationError,
  ValidationResult,
} from "./types";
export { FIELD_TYPES } from "./types";

export {
  fieldToColumnType,
  generateCreateTable,
  generateCreateIndexes,
  generateAlterTable,
  validateSqlIdentifiers,
} from "./ddl";
