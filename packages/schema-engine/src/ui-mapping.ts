import type { FieldDef, CollectionDef } from "./types";

export type AntdComponent =
  "Input" | "InputNumber" | "Switch" | "DatePicker" | "Select" | "TextArea" | "EmailInput";

export interface ColumnConfig {
  title: string;
  dataIndex: string;
  key: string;
  valueType?: "text" | "number" | "date" | "select" | "switch";
  valueEnum?: Record<string, { text: string }>;
  hideInSearch?: boolean;
  hideInTable?: boolean;
}

export interface FormFieldConfig {
  name: string;
  label: string;
  component: AntdComponent;
  rules?: Array<{ required: boolean; message: string }>;
  props?: Record<string, unknown>;
}

/**
 * Map a FieldDef to a ProTable ColumnConfig.
 */
export function fieldToColumn(field: FieldDef): ColumnConfig {
  const base: ColumnConfig = {
    title: field.label ?? field.name,
    dataIndex: field.name,
    key: field.name,
  };

  switch (field.type) {
    case "string":
      return {
        ...base,
        valueType: "text",
        hideInSearch: !field.required,
      };
    case "number":
      return { ...base, valueType: "number" };
    case "boolean":
      return { ...base, valueType: "switch", hideInSearch: true };
    case "date":
      return { ...base, valueType: "date" };
    case "enum":
      return {
        ...base,
        valueType: "select",
        valueEnum: buildValueEnum(field.enumValues),
      };
    case "belongsTo":
      return { ...base, valueType: "select" };
    case "hasMany":
      return { ...base, hideInTable: true, hideInSearch: true };
    default:
      return base;
  }
}

/**
 * Map a FieldDef to a ProForm FormFieldConfig.
 */
export function fieldToFormField(field: FieldDef): FormFieldConfig {
  const rules = field.required
    ? [{ required: true, message: `${field.label ?? field.name} is required` }]
    : undefined;

  switch (field.type) {
    case "string":
      // ponytail: maxLength check omitted — FieldDef has no maxLength. Add TextArea mapping when maxLength is added.
      return {
        name: field.name,
        label: field.label ?? field.name,
        component: "Input",
        rules,
      };
    case "number":
      return {
        name: field.name,
        label: field.label ?? field.name,
        component: "InputNumber",
        rules,
      };
    case "boolean":
      return {
        name: field.name,
        label: field.label ?? field.name,
        component: "Switch",
      };
    case "date":
      return {
        name: field.name,
        label: field.label ?? field.name,
        component: "DatePicker",
        rules,
      };
    case "enum": {
      const opts = buildSelectOptions(field.enumValues);
      return {
        name: field.name,
        label: field.label ?? field.name,
        component: "Select",
        rules,
        ...(opts ? { props: { options: opts } } : {}),
      };
    }
    case "belongsTo":
      return {
        name: field.name,
        label: field.label ?? field.name,
        component: "Select",
        rules,
      };
    case "hasMany":
      return {
        name: field.name,
        label: field.label ?? field.name,
        component: "Select",
      };
    default:
      return {
        name: field.name,
        label: field.label ?? field.name,
        component: "Input",
        rules,
      };
  }
}

/**
 * Convert all fields in a CollectionDef to ColumnConfig[], skipping hasMany and id fields.
 */
export function collectionToColumns(collection: CollectionDef): ColumnConfig[] {
  return collection.fields
    .filter((f) => f.type !== "hasMany" && f.name !== "id")
    .map((f) => fieldToColumn(f));
}

/**
 * Convert all fields in a CollectionDef to FormFieldConfig[], skipping id fields.
 */
export function collectionToFormFields(collection: CollectionDef): FormFieldConfig[] {
  return collection.fields.filter((f) => f.name !== "id").map((f) => fieldToFormField(f));
}

function buildValueEnum(values?: readonly string[]): Record<string, { text: string }> | undefined {
  if (!values || values.length === 0) return undefined;

  const result: Record<string, { text: string }> = {};
  for (const v of values) {
    result[v] = { text: v };
  }
  return result;
}

function buildSelectOptions(
  values?: readonly string[],
): Array<{ value: string; label: string }> | undefined {
  if (!values || values.length === 0) return undefined;

  return values.map((v) => ({ value: v, label: v }));
}
