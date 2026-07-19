import { describe, test, expect } from "vitest";
import { ExtendsResolver, ExtendsError, type ExtendsDeclaration } from "../extends";

describe("ExtendsResolver", () => {
  const resolver = new ExtendsResolver();

  describe("resolve", () => {
    test("single extends declaration resolves correctly", () => {
      const declarations: ExtendsDeclaration[] = [
        {
          collection: "order",
          addFields: [
            { name: "warehouse_id", type: "belongsTo", target: "warehouse" },
            { name: "priority", type: "string" },
          ],
        },
      ];

      const result = resolver.resolve(declarations, ["plugin-erp"]);

      expect(result).toHaveLength(1);
      expect(result[0].collection).toBe("order");
      expect(result[0].fields).toHaveLength(2);
      expect(result[0].fields[0].name).toBe("warehouse_id");
      expect(result[0].fields[1].name).toBe("priority");
      expect(result[0].sources).toEqual(["plugin-erp"]);
    });

    test("multiple plugins extending the same collection merge fields", () => {
      const declarations: ExtendsDeclaration[] = [
        {
          collection: "user",
          addFields: [{ name: "phone", type: "string" }],
        },
        {
          collection: "user",
          addFields: [{ name: "avatar_url", type: "string" }],
        },
      ];

      const result = resolver.resolve(declarations, ["plugin-contacts", "plugin-avatars"]);

      expect(result).toHaveLength(1);
      expect(result[0].collection).toBe("user");
      expect(result[0].fields).toHaveLength(2);
      expect(result[0].sources).toEqual(["plugin-contacts", "plugin-avatars"]);
    });

    test("multiple plugins extending different collections", () => {
      const declarations: ExtendsDeclaration[] = [
        {
          collection: "order",
          addFields: [{ name: "notes", type: "string" }],
        },
        {
          collection: "product",
          addFields: [{ name: "hs_code", type: "string" }],
        },
      ];

      const result = resolver.resolve(declarations, ["plugin-a", "plugin-b"]);

      expect(result).toHaveLength(2);
      const names = result.map((r) => r.collection).sort();
      expect(names).toEqual(["order", "product"]);
    });

    test("duplicate field name from same plugin throws", () => {
      const declarations: ExtendsDeclaration[] = [
        {
          collection: "order",
          addFields: [
            { name: "notes", type: "string" },
            { name: "notes", type: "string" },
          ],
        },
      ];

      expect(() => resolver.resolve(declarations, ["plugin-x"])).toThrow(ExtendsError);
      expect(() => resolver.resolve(declarations, ["plugin-x"])).toThrow(/Duplicate field "notes"/);
    });

    test("type conflict across plugins throws", () => {
      const declarations: ExtendsDeclaration[] = [
        {
          collection: "order",
          addFields: [{ name: "amount", type: "number" }],
        },
        {
          collection: "order",
          addFields: [{ name: "amount", type: "string" }],
        },
      ];

      expect(() => resolver.resolve(declarations, ["plugin-a", "plugin-b"])).toThrow(ExtendsError);

      expect(() => resolver.resolve(declarations, ["plugin-a", "plugin-b"])).toThrow(
        /Type conflict for field "amount"/,
      );
    });

    test("same type from different plugins is allowed (no-op dedup)", () => {
      const declarations: ExtendsDeclaration[] = [
        {
          collection: "order",
          addFields: [{ name: "region", type: "string" }],
        },
        {
          collection: "order",
          addFields: [{ name: "region", type: "string" }],
        },
      ];

      const result = resolver.resolve(declarations, ["plugin-a", "plugin-b"]);

      // Region appears once (deduplicated).
      expect(result[0].fields).toHaveLength(1);
      expect(result[0].fields[0].name).toBe("region");
    });

    test("empty declarations returns empty array", () => {
      const result = resolver.resolve([], []);
      expect(result).toEqual([]);
    });

    test("preserves FieldAddition metadata (required, unique, target)", () => {
      const declarations: ExtendsDeclaration[] = [
        {
          collection: "user",
          addFields: [
            {
              name: "manager_id",
              type: "belongsTo",
              target: "user",
              required: false,
              unique: false,
            },
          ],
        },
      ];

      const result = resolver.resolve(declarations, ["plugin-hr"]);

      expect(result[0].fields[0]).toEqual({
        name: "manager_id",
        type: "belongsTo",
        target: "user",
        required: false,
        unique: false,
      });
    });
  });
});
