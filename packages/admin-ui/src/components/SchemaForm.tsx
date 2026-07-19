import type { ReactNode } from "react";
import {
  ModalForm,
  ProFormText,
  ProFormSelect,
  ProFormSwitch,
  ProFormDigit,
  ProFormTextArea,
  ProFormDatePicker,
  ProFormDateTimePicker,
} from "@ant-design/pro-form";
import { message } from "antd";
import type { CollectionDef, FieldDef } from "./types";

/** Generate a form label from a FieldDef */
function fieldLabel(field: FieldDef): string {
  return field.label ?? field.name;
}

/** Generate form rules from a FieldDef */
function fieldRules(field: FieldDef): Array<{ required?: boolean; max?: number; type?: string }> {
  const rules: Array<{ required?: boolean; max?: number; type?: string }> = [];
  if (field.required) {
    rules.push({ required: true });
  }
  if (field.type === "string" && field.maxLength) {
    rules.push({ max: field.maxLength, type: "string" });
  }
  if (field.type === "email") {
    rules.push({ type: "email" });
  }
  if (field.type === "url") {
    rules.push({ type: "url" });
  }
  return rules;
}

/** Render a single form field based on FieldDef */
function renderFormField(field: FieldDef): ReactNode {
  const label = fieldLabel(field);
  const rules = fieldRules(field);

  // readOnly fields are skipped in create mode, shown read-only in edit mode
  switch (field.type) {
    case "number":
      return (
        <ProFormDigit
          key={field.name}
          name={field.name}
          label={label}
          rules={rules}
          min={field.min}
          max={field.max}
          fieldProps={{ precision: 0 }}
        />
      );
    case "boolean":
      return <ProFormSwitch key={field.name} name={field.name} label={label} />;
    case "date":
      return <ProFormDatePicker key={field.name} name={field.name} label={label} rules={rules} />;
    case "datetime":
      return (
        <ProFormDateTimePicker key={field.name} name={field.name} label={label} rules={rules} />
      );
    case "email":
      return (
        <ProFormText
          key={field.name}
          name={field.name}
          label={label}
          rules={rules}
          fieldProps={{ type: "email" }}
        />
      );
    case "url":
      return (
        <ProFormText
          key={field.name}
          name={field.name}
          label={label}
          rules={rules}
          fieldProps={{ type: "url" }}
        />
      );
    case "enum":
      return (
        <ProFormSelect
          key={field.name}
          name={field.name}
          label={label}
          rules={rules}
          options={(field.enumValues ?? []).map((v) => ({ label: v, value: v }))}
        />
      );
    case "text":
      return <ProFormTextArea key={field.name} name={field.name} label={label} rules={rules} />;
    case "json":
      return (
        <ProFormTextArea
          key={field.name}
          name={field.name}
          label={label}
          rules={rules}
          fieldProps={{ rows: 4 }}
        />
      );
    case "string":
    case "text":
    default:
      // string and unknown types
      return <ProFormText key={field.name} name={field.name} label={label} rules={rules} />;
  }
}

interface SchemaFormProps {
  collection: CollectionDef;
  apiPrefix: string;
  /** 'create' (POST) or 'edit' (PATCH) */
  mode: "create" | "edit";
  /** Existing record data for edit mode */
  record?: Record<string, unknown>;
  /** Callback after successful submit */
  onFinish: () => void;
  /** Optional trigger children — when provided, wraps trigger in ModalForm */
  children?: ReactNode;
}

export default function SchemaForm({
  collection,
  apiPrefix,
  mode,
  record,
  onFinish,
  children,
}: SchemaFormProps) {
  const isEdit = mode === "edit";
  const title = isEdit
    ? `编辑${collection.label ?? collection.name}`
    : `新建${collection.label ?? collection.name}`;

  // Filter out hidden and (in create mode) readOnly fields
  const visibleFields = collection.fields.filter((f) => {
    if (f.hidden) return false;
    if (!isEdit && f.readOnly) return false;
    return true;
  });

  const handleFinish = async (values: Record<string, unknown>): Promise<boolean> => {
    try {
      const token = localStorage.getItem("aude_access_token") ?? "";
      const url = isEdit
        ? `${apiPrefix}/${collection.name}/${record?.id as string}`
        : `${apiPrefix}/${collection.name}`;
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(values),
      });

      if (!res.ok) {
        const err: { message?: string } = await res.json().catch(() => ({ message: `HTTP ${res.status}` }));
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
        void message.error(err.message ?? "操作失败");
        return false;
      }

      void message.success(isEdit ? "更新成功" : "创建成功");
      onFinish();
      return true;
    } catch {
      void message.error("网络错误");
      return false;
    }
  };

  // ponytail: ModalForm width hard-coded, add formWidth prop if screens demand it
  return (
    <ModalForm
      title={title}
      trigger={children}
      width={560}
      initialValues={isEdit ? record : undefined}
      onFinish={handleFinish}
      modalProps={{ destroyOnHidden: true }}
    >
      {visibleFields.map(renderFormField)}
    </ModalForm>
  );
}
