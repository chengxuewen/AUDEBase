import { describe, test, expect } from "vitest";
import {
  fieldToColumn,
  fieldToFormField,
  collectionToColumns,
  collectionToFormFields,
} from "../ui-mapping";
import type { ColumnConfig, FormFieldConfig } from "../ui-mapping";
import type { FieldDef, CollectionDef } from "../types";

describe("fieldToColumn", () => {
  test("string field maps to text valueType with hideInSearch when not required", () => {
    // Arrange
    const field: FieldDef = { name: "title", type: "string", label: "Title" };

    // Act
    const result = fieldToColumn(field);

    // Assert
    expect(result).toEqual<ColumnConfig>({
      title: "Title",
      dataIndex: "title",
      key: "title",
      valueType: "text",
      hideInSearch: true,
    });
  });

  test("string field required does not hide in search", () => {
    // Arrange
    const field: FieldDef = {
      name: "title",
      type: "string",
      required: true,
      label: "Title",
    };

    // Act
    const result = fieldToColumn(field);

    // Assert
    expect(result.hideInSearch).toBe(false);
  });

  test("number field maps to number valueType", () => {
    // Arrange
    const field: FieldDef = { name: "age", type: "number", label: "Age" };

    // Act
    const result = fieldToColumn(field);

    // Assert
    expect(result).toEqual<ColumnConfig>({
      title: "Age",
      dataIndex: "age",
      key: "age",
      valueType: "number",
    });
  });

  test("boolean field maps to switch valueType with hideInSearch", () => {
    // Arrange
    const field: FieldDef = {
      name: "active",
      type: "boolean",
      label: "Active",
    };

    // Act
    const result = fieldToColumn(field);

    // Assert
    expect(result).toEqual<ColumnConfig>({
      title: "Active",
      dataIndex: "active",
      key: "active",
      valueType: "switch",
      hideInSearch: true,
    });
  });

  test("date field maps to date valueType", () => {
    // Arrange
    const field: FieldDef = {
      name: "createdAt",
      type: "date",
      label: "Created",
    };

    // Act
    const result = fieldToColumn(field);

    // Assert
    expect(result).toEqual<ColumnConfig>({
      title: "Created",
      dataIndex: "createdAt",
      key: "createdAt",
      valueType: "date",
    });
  });

  test("enum field maps to select valueType with valueEnum", () => {
    // Arrange
    const field: FieldDef = {
      name: "status",
      type: "enum",
      label: "Status",
      enumValues: ["draft", "published", "archived"],
    };

    // Act
    const result = fieldToColumn(field);

    // Assert
    expect(result).toEqual<ColumnConfig>({
      title: "Status",
      dataIndex: "status",
      key: "status",
      valueType: "select",
      valueEnum: {
        draft: { text: "draft" },
        published: { text: "published" },
        archived: { text: "archived" },
      },
    });
  });

  test("belongsTo field maps to select valueType", () => {
    // Arrange
    const field: FieldDef = {
      name: "categoryId",
      type: "belongsTo",
      label: "Category",
      target: "category",
    };

    // Act
    const result = fieldToColumn(field);

    // Assert
    expect(result).toEqual<ColumnConfig>({
      title: "Category",
      dataIndex: "categoryId",
      key: "categoryId",
      valueType: "select",
    });
  });

  test("hasMany field is hidden in both table and search", () => {
    // Arrange
    const field: FieldDef = {
      name: "items",
      type: "hasMany",
      label: "Items",
      target: "products",
    };

    // Act
    const result = fieldToColumn(field);

    // Assert
    expect(result).toEqual<ColumnConfig>({
      title: "Items",
      dataIndex: "items",
      key: "items",
      hideInTable: true,
      hideInSearch: true,
    });
  });

  test("falls back to field name when label is undefined", () => {
    // Arrange
    const field: FieldDef = { name: "note", type: "string" };

    // Act
    const result = fieldToColumn(field);

    // Assert
    expect(result.title).toBe("note");
  });
});

describe("fieldToFormField", () => {
  test("string field maps to Input component", () => {
    // Arrange
    const field: FieldDef = {
      name: "title",
      type: "string",
      label: "Title",
    };

    // Act
    const result = fieldToFormField(field);

    // Assert
    expect(result).toEqual<FormFieldConfig>({
      name: "title",
      label: "Title",
      component: "Input",
    });
  });

  test("required field adds validation rules", () => {
    // Arrange
    const field: FieldDef = {
      name: "title",
      type: "string",
      required: true,
      label: "Title",
    };

    // Act
    const result = fieldToFormField(field);

    // Assert
    expect(result.rules).toEqual([{ required: true, message: "Title is required" }]);
  });

  test("number field maps to InputNumber component", () => {
    // Arrange
    const field: FieldDef = { name: "age", type: "number", label: "Age" };

    // Act
    const result = fieldToFormField(field);

    // Assert
    expect(result).toEqual<FormFieldConfig>({
      name: "age",
      label: "Age",
      component: "InputNumber",
    });
  });

  test("boolean field maps to Switch component", () => {
    // Arrange
    const field: FieldDef = {
      name: "active",
      type: "boolean",
      label: "Active",
    };

    // Act
    const result = fieldToFormField(field);

    // Assert
    expect(result).toEqual<FormFieldConfig>({
      name: "active",
      label: "Active",
      component: "Switch",
    });
  });

  test("date field maps to DatePicker component", () => {
    // Arrange
    const field: FieldDef = {
      name: "createdAt",
      type: "date",
      label: "Created",
    };

    // Act
    const result = fieldToFormField(field);

    // Assert
    expect(result).toEqual<FormFieldConfig>({
      name: "createdAt",
      label: "Created",
      component: "DatePicker",
    });
  });

  test("enum field maps to Select component with options", () => {
    // Arrange
    const field: FieldDef = {
      name: "status",
      type: "enum",
      label: "Status",
      enumValues: ["draft", "published"],
    };

    // Act
    const result = fieldToFormField(field);

    // Assert
    expect(result).toEqual<FormFieldConfig>({
      name: "status",
      label: "Status",
      component: "Select",
      props: {
        options: [
          { value: "draft", label: "draft" },
          { value: "published", label: "published" },
        ],
      },
    });
  });

  test("belongsTo field maps to Select component", () => {
    // Arrange
    const field: FieldDef = {
      name: "categoryId",
      type: "belongsTo",
      label: "Category",
      target: "category",
    };

    // Act
    const result = fieldToFormField(field);

    // Assert
    expect(result).toEqual<FormFieldConfig>({
      name: "categoryId",
      label: "Category",
      component: "Select",
    });
  });

  test("hasMany field maps to Select component", () => {
    // Arrange
    const field: FieldDef = {
      name: "items",
      type: "hasMany",
      label: "Items",
    };

    // Act
    const result = fieldToFormField(field);

    // Assert
    expect(result).toEqual<FormFieldConfig>({
      name: "items",
      label: "Items",
      component: "Select",
    });
  });

  test("falls back to field name when label is undefined", () => {
    // Arrange
    const field: FieldDef = { name: "note", type: "string" };

    // Act
    const result = fieldToFormField(field);

    // Assert
    expect(result.label).toBe("note");
  });
});

describe("collectionToColumns", () => {
  test("converts all non-id fields to columns, skipping hasMany", () => {
    // Arrange
    const collection: CollectionDef = {
      name: "products",
      table: "products",
      fields: [
        { name: "id", type: "number", label: "ID" },
        { name: "title", type: "string", label: "Title" },
        { name: "price", type: "number", label: "Price" },
        { name: "active", type: "boolean", label: "Active" },
        { name: "variants", type: "hasMany", label: "Variants" },
      ],
    };

    // Act
    const result = collectionToColumns(collection);

    // Assert
    expect(result).toHaveLength(3);
    expect(result.map((c) => c.dataIndex)).toEqual(["title", "price", "active"]);
  });

  test("empty fields returns empty array", () => {
    // Arrange
    const collection: CollectionDef = {
      name: "emptyColl",
      fields: [],
    };

    // Act
    const result = collectionToColumns(collection);

    // Assert
    expect(result).toEqual([]);
  });
});

describe("collectionToFormFields", () => {
  test("converts all non-id fields to form configs", () => {
    // Arrange
    const collection: CollectionDef = {
      name: "products",
      table: "products",
      fields: [
        { name: "id", type: "number", label: "ID" },
        { name: "title", type: "string", required: true, label: "Title" },
        { name: "price", type: "number", label: "Price" },
        { name: "categoryId", type: "belongsTo", label: "Category" },
      ],
    };

    // Act
    const result = collectionToFormFields(collection);

    // Assert
    expect(result).toHaveLength(3);
    expect(result.map((f) => f.name)).toEqual(["title", "price", "categoryId"]);
    const [titleField, priceField, categoryField] = result;
    expect(titleField).toBeDefined();
    expect(priceField).toBeDefined();
    expect(categoryField).toBeDefined();
    expect(titleField!.component).toBe("Input");
    expect(titleField!.rules).toBeDefined();
    expect(priceField!.component).toBe("InputNumber");
    expect(categoryField!.component).toBe("Select");
  });

  test("empty fields returns empty array", () => {
    // Arrange
    const collection: CollectionDef = {
      name: "emptyColl",
      fields: [],
    };

    // Act
    const result = collectionToFormFields(collection);

    // Assert
    expect(result).toEqual([]);
  });
});

describe("ui-mapping edge cases", () => {
  test("enum with empty enumValues array has no valueEnum or options", () => {
    // Arrange
    const field: FieldDef = {
      name: "category",
      type: "enum",
      enumValues: [],
    };

    // Act
    const col = fieldToColumn(field);
    const form = fieldToFormField(field);

    // Assert
    expect(col.valueEnum).toBeUndefined();
    expect(form.props).toBeUndefined();
  });

  test("string field without label uses field name", () => {
    // Arrange
    const field: FieldDef = { name: "description", type: "string" };

    // Act
    const col = fieldToColumn(field);
    const form = fieldToFormField(field);

    // Assert
    expect(col.title).toBe("description");
    expect(form.label).toBe("description");
  });
});
