import type { CollectionDef, FieldDef, ValidationResult } from "./types";
import { FIELD_TYPES } from "./types";

function ok(): ValidationResult {
  return { valid: true, errors: [] };
}

function error(path: string, message: string): ValidationResult {
  return { valid: false, errors: [{ path, message }] };
}

function combine(results: ValidationResult[]): ValidationResult {
  const errors = results.flatMap((r) => r.errors);
  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validateField(field: FieldDef): ValidationResult {
  const errs: ValidationResult[] = [];

  if (!field.name || field.name.trim().length === 0) {
    errs.push(error("name", "Field name is required"));
  }

  if (!field.type) {
    errs.push(error("type", "Field type is required"));
  } else if (!(FIELD_TYPES as readonly string[]).includes(field.type)) {
    errs.push(error("type", `Invalid field type "${field.type as string}"`));
  }

  if (field.type === "enum" && (!field.enumValues || field.enumValues.length === 0)) {
    errs.push(error("enumValues", "enum type requires enumValues with at least one value"));
  }

  if (
    (field.type === "belongsTo" || field.type === "hasMany") &&
    (!field.target || field.target.trim().length === 0)
  ) {
    errs.push(error("target", `${field.type} type requires a target collection name`));
  }

  return errs.length === 0 ? ok() : combine(errs);
}

export function validateCollection(collection: CollectionDef): ValidationResult {
  const errs: ValidationResult[] = [];

  if (!collection.name || collection.name.trim().length === 0) {
    errs.push(error("name", "Collection name is required"));
  }

  if (!collection.fields || collection.fields.length === 0) {
    errs.push(error("fields", "Collection must have at least one field"));
  } else {
    // Check for duplicate field names
    const seen = new Set<string>();
    for (const field of collection.fields) {
      if (seen.has(field.name)) {
        errs.push(error(`fields.${field.name}`, `Duplicate field name "${field.name}"`));
      }
      seen.add(field.name);
    }

    // Validate each field
    const fieldResults = collection.fields.map((field, i) => {
      const result = validateField(field);
      return {
        valid: result.valid,
        errors: result.errors.map((e) => ({
          ...e,
          path: `fields[${i}].${e.path}`,
        })),
      } satisfies ValidationResult;
    });
    for (const fr of fieldResults) {
      if (!fr.valid) {
        errs.push(...fr.errors.map((e) => error(e.path, e.message)));
      }
    }
  }

  return errs.length === 0 ? ok() : combine(errs);
}
