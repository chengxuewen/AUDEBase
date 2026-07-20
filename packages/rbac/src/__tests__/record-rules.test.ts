import { describe, test, expect } from "vitest";
import {
  parseDomainFilter,
  evaluateCondition,
  generateWhereClause,
  DomainFilterError,
  type LeafCondition,
  type AndCondition,
  type OrCondition,
  type NotCondition,
  type TypedCondition,
  type DomainFilterTuple,
} from "../record-rules";

// ── Helpers ──────────────────────────────────────────────────────────────────

function leaf(field: string, operator: string, value: unknown): LeafCondition {
  return { field, operator, value } as LeafCondition;
}

function andOf(...conds: TypedCondition[]): AndCondition {
  return { operator: "&", conditions: conds };
}

function orOf(...conds: TypedCondition[]): OrCondition {
  return { operator: "|", conditions: conds };
}

function notOf(cond: TypedCondition): NotCondition {
  return { operator: "!", condition: cond };
}

// ── parseDomainFilter ────────────────────────────────────────────────────────

describe("parseDomainFilter", () => {
  describe("leaf conditions", () => {
    test("parses equality", () => {
      const result = parseDomainFilter(["status", "=", "draft"]);
      expect(result).toEqual(leaf("status", "=", "draft"));
    });

    test("parses inequality", () => {
      const result = parseDomainFilter(["amount", "!=", 0]);
      expect(result).toEqual(leaf("amount", "!=", 0));
    });

    test("parses greater than", () => {
      const result = parseDomainFilter(["amount", ">", 1000]);
      expect(result).toEqual(leaf("amount", ">", 1000));
    });

    test("parses less than", () => {
      const result = parseDomainFilter(["priority", "<", 5]);
      expect(result).toEqual(leaf("priority", "<", 5));
    });

    test("parses >= and <=", () => {
      expect(parseDomainFilter(["score", ">=", 60])).toEqual(leaf("score", ">=", 60));
      expect(parseDomainFilter(["score", "<=", 100])).toEqual(leaf("score", "<=", 100));
    });

    test("parses 'in' operator", () => {
      const result = parseDomainFilter(["status", "in", ["draft", "review"]]);
      expect(result).toEqual(leaf("status", "in", ["draft", "review"]));
    });

    test("parses 'not in' operator", () => {
      const result = parseDomainFilter(["status", "not in", ["archived"]]);
      expect(result).toEqual(leaf("status", "not in", ["archived"]));
    });

    test("parses like", () => {
      const result = parseDomainFilter(["name", "like", "test"]);
      expect(result).toEqual(leaf("name", "like", "test"));
    });

    test("parses ilike", () => {
      const result = parseDomainFilter(["name", "ilike", "Test"]);
      expect(result).toEqual(leaf("name", "ilike", "Test"));
    });
  });

  describe("logical operators", () => {
    test("parses AND with two leaves", () => {
      // ["&", ["status","=","draft"], ["amount",">",1000]]
      const filter: DomainFilterTuple = ["&", ["status", "=", "draft"], ["amount", ">", 1000]];
      const result = parseDomainFilter(filter);
      expect(result).toEqual(
        andOf(leaf("status", "=", "draft"), leaf("amount", ">", 1000)),
      );
    });

    test("parses OR with two leaves", () => {
      const filter: DomainFilterTuple = ["|", ["status", "=", "draft"], ["status", "=", "review"]];
      const result = parseDomainFilter(filter);
      expect(result).toEqual(
        orOf(leaf("status", "=", "draft"), leaf("status", "=", "review")),
      );
    });

    test("parses NOT", () => {
      const filter: DomainFilterTuple = ["!", ["active", "=", false]];
      const result = parseDomainFilter(filter);
      expect(result).toEqual(notOf(leaf("active", "=", false)));
    });

    test("parses nested expression (Odoo-style OR in AND)", () => {
      // ["&", ["|", ["cat","=","A"], ["cat","=","B"]], ["active", "=", true]]
      const filter: DomainFilterTuple = [
        "&",
        ["|", ["category", "=", "A"], ["category", "=", "B"]],
        ["active", "=", true],
      ];
      const result = parseDomainFilter(filter);
      expect(result).toEqual(
        andOf(
          orOf(leaf("category", "=", "A"), leaf("category", "=", "B")),
          leaf("active", "=", true),
        ),
      );
    });

    test("parses deeply nested NOT in AND", () => {
      const filter: DomainFilterTuple = [
        "&",
        ["status", "=", "draft"],
        ["!", ["archived", "=", true]],
      ];
      const result = parseDomainFilter(filter);
      expect(result).toEqual(
        andOf(leaf("status", "=", "draft"), notOf(leaf("archived", "=", true))),
      );
    });
  });

  describe("chaining (Odoo permits >2 conditions with repeated logical ops)", () => {
    test("parses chained OR: [\"|\",A,B,C] → (A OR B OR C)", () => {
      // Odoo chaining: ["|","|",A,B,C] is equivalent to A OR B OR C
      const filter: DomainFilterTuple = [
        "|",
        ["status", "=", "draft"],
        ["status", "=", "review"],
        ["status", "=", "published"],
      ];
      const result = parseDomainFilter(filter);
      expect((result as OrCondition).conditions).toHaveLength(3);
    });

    test("parses chained AND: [\"&\",A,B,C] → (A AND B AND C)", () => {
      const filter: DomainFilterTuple = [
        "&",
        ["status", "=", "active"],
        ["amount", ">", 0],
        ["tenant_id", "=", "t1"],
      ];
      const result = parseDomainFilter(filter);
      expect((result as AndCondition).conditions).toHaveLength(3);
    });
  });

  describe("error handling", () => {
    test("throws on non-array input", () => {
      expect(() => parseDomainFilter("not-an-array" as unknown as DomainFilterTuple)).toThrow(
        DomainFilterError,
      );
    });

    test("throws on empty array", () => {
      expect(() => parseDomainFilter([])).toThrow(DomainFilterError);
    });

    test("throws on malformed field name (SQL injection attempt)", () => {
      expect(() => parseDomainFilter(["1; DROP TABLE", "=", "x"])).toThrow(DomainFilterError);
    });

    test("throws on invalid operator", () => {
      expect(() => parseDomainFilter(["status", "INVALID", "x"])).toThrow(DomainFilterError);
    });

    test("throws on 'in' without array value", () => {
      expect(() => parseDomainFilter(["status", "in", "not-array"])).toThrow(DomainFilterError);
    });

    test("throws on 'not in' with empty array", () => {
      expect(() => parseDomainFilter(["status", "not in", []])).toThrow(DomainFilterError);
    });

    test("throws on leaf with wrong element count", () => {
      expect(() => parseDomainFilter(["status", "="])).toThrow(DomainFilterError);
    });

    test("throws on & with fewer than 2 children", () => {
      expect(() => parseDomainFilter(["&", ["status", "=", "draft"]])).toThrow(DomainFilterError);
    });

    test("throws on ! with wrong child count", () => {
      expect(() =>
        parseDomainFilter(["!", ["a", "=", 1], ["b", "=", 2]]),
      ).toThrow(DomainFilterError);
    });
  });
});

// ── evaluateCondition ────────────────────────────────────────────────────────

describe("evaluateCondition", () => {
  describe("equality operators", () => {
    const row = { status: "draft", amount: 500, active: true, deleted: false };

    test("= matches equal strings", () => {
      expect(evaluateCondition(leaf("status", "=", "draft"), row)).toBe(true);
      expect(evaluateCondition(leaf("status", "=", "published"), row)).toBe(false);
    });

    test("= coerces types for comparison", () => {
      expect(evaluateCondition(leaf("amount", "=", 500), row)).toBe(true);
      expect(evaluateCondition(leaf("amount", "=", "500"), row)).toBe(true); // coercion
    });

    test("!= returns inverse of =", () => {
      expect(evaluateCondition(leaf("status", "!=", "published"), row)).toBe(true);
      expect(evaluateCondition(leaf("status", "!=", "draft"), row)).toBe(false);
    });
  });

  describe("comparison operators", () => {
    const row = { amount: 500, score: 75 };

    test(">", () => {
      expect(evaluateCondition(leaf("amount", ">", 400), row)).toBe(true);
      expect(evaluateCondition(leaf("amount", ">", 500), row)).toBe(false);
      expect(evaluateCondition(leaf("amount", ">", 600), row)).toBe(false);
    });

    test("<", () => {
      expect(evaluateCondition(leaf("amount", "<", 600), row)).toBe(true);
      expect(evaluateCondition(leaf("amount", "<", 500), row)).toBe(false);
    });

    test(">=", () => {
      expect(evaluateCondition(leaf("score", ">=", 75), row)).toBe(true);
      expect(evaluateCondition(leaf("score", ">=", 76), row)).toBe(false);
    });

    test("<=", () => {
      expect(evaluateCondition(leaf("score", "<=", 75), row)).toBe(true);
      expect(evaluateCondition(leaf("score", "<=", 74), row)).toBe(false);
    });
  });

  describe("collection operators", () => {
    const row = { status: "draft" };

    test("in matches when value is in array", () => {
      expect(evaluateCondition(leaf("status", "in", ["draft", "review"]), row)).toBe(true);
      expect(evaluateCondition(leaf("status", "in", ["published"]), row)).toBe(false);
    });

    test("not in matches when value is NOT in array", () => {
      expect(evaluateCondition(leaf("status", "not in", ["archived", "deleted"]), row)).toBe(true);
      expect(evaluateCondition(leaf("status", "not in", ["draft", "review"]), row)).toBe(false);
    });
  });

  describe("like/ilike operators", () => {
    const row = { name: "HelloWorld", description: "Some text here" };

    test("like performs case-sensitive substring match", () => {
      expect(evaluateCondition(leaf("name", "like", "Hello"), row)).toBe(true);
      expect(evaluateCondition(leaf("name", "like", "hello"), row)).toBe(false);
      expect(evaluateCondition(leaf("name", "like", "xyz"), row)).toBe(false);
    });

    test("ilike performs case-insensitive substring match", () => {
      expect(evaluateCondition(leaf("name", "ilike", "hello"), row)).toBe(true);
      expect(evaluateCondition(leaf("name", "ilike", "HELLO"), row)).toBe(true);
      expect(evaluateCondition(leaf("name", "ilike", "xyz"), row)).toBe(false);
    });

    test("like/ilike returns false for null/undefined values", () => {
      const nullRow = { name: null };
      expect(evaluateCondition(leaf("name", "like", "test"), nullRow)).toBe(false);
      expect(evaluateCondition(leaf("name", "ilike", "test"), nullRow)).toBe(false);
    });
  });

  describe("logical operators", () => {
    const row = { status: "draft", amount: 1000, active: true };

    test("AND: both true → true", () => {
      const cond = andOf(leaf("status", "=", "draft"), leaf("amount", ">", 500));
      expect(evaluateCondition(cond, row)).toBe(true);
    });

    test("AND: one false → false", () => {
      const cond = andOf(leaf("status", "=", "draft"), leaf("amount", ">", 2000));
      expect(evaluateCondition(cond, row)).toBe(false);
    });

    test("OR: one true → true", () => {
      const cond = orOf(leaf("status", "=", "published"), leaf("amount", ">", 500));
      expect(evaluateCondition(cond, row)).toBe(true);
    });

    test("OR: both false → false", () => {
      const cond = orOf(leaf("status", "=", "published"), leaf("amount", ">", 2000));
      expect(evaluateCondition(cond, row)).toBe(false);
    });

    test("NOT: inverts result", () => {
      const cond = notOf(leaf("active", "=", false));
      expect(evaluateCondition(cond, row)).toBe(true);
    });

    test("nested: (cat=A OR cat=B) AND active=true", () => {
      const cond = andOf(
        orOf(leaf("status", "=", "draft"), leaf("status", "=", "review")),
        leaf("active", "=", true),
      );
      expect(evaluateCondition(cond, row)).toBe(true);
    });
  });

  describe("missing fields", () => {
    test("missing field treats as undefined → != null", () => {
      const row = { status: "draft" };
      expect(evaluateCondition(leaf("nonexistent", "=", null), row)).toBe(true);
      expect(evaluateCondition(leaf("nonexistent", "!=", null), row)).toBe(false);
    });
  });
});

// ── generateWhereClause ──────────────────────────────────────────────────────

describe("generateWhereClause", () => {
  test("single leaf condition", () => {
    const cond = parseDomainFilter(["status", "=", "draft"]);
    const result = generateWhereClause([cond]);
    expect(result.sql).toBe("status = $1");
    expect(result.params).toEqual(["draft"]);
  });

  test("AND with two leaves", () => {
    const cond = parseDomainFilter(["&", ["status", "=", "draft"], ["amount", ">", 1000]]);
    const result = generateWhereClause([cond]);
    expect(result.sql).toBe("(status = $1 AND amount > $2)");
    expect(result.params).toEqual(["draft", 1000]);
  });

  test("OR with two leaves", () => {
    const cond = parseDomainFilter(["|", ["status", "=", "draft"], ["status", "=", "review"]]);
    const result = generateWhereClause([cond]);
    expect(result.sql).toBe("(status = $1 OR status = $2)");
    expect(result.params).toEqual(["draft", "review"]);
  });

  test("NOT", () => {
    const cond = parseDomainFilter(["!", ["active", "=", false]]);
    const result = generateWhereClause([cond]);
    expect(result.sql).toBe("NOT (active = $1)");
    expect(result.params).toEqual([false]);
  });

  test("nested expression", () => {
    // ["&",["|",["cat","=","A"],["cat","=","B"]],["active","=",true]]
    const cond = parseDomainFilter([
      "&",
      ["|", ["category", "=", "A"], ["category", "=", "B"]],
      ["active", "=", true],
    ]);
    const result = generateWhereClause([cond]);
    expect(result.sql).toBe(
      "((category = $1 OR category = $2) AND active = $3)",
    );
    expect(result.params).toEqual(["A", "B", true]);
  });

  test("in operator generates IN clause", () => {
    const cond = parseDomainFilter(["status", "in", ["draft", "review", "published"]]);
    const result = generateWhereClause([cond]);
    expect(result.sql).toBe("status IN ($1, $2, $3)");
    expect(result.params).toEqual(["draft", "review", "published"]);
  });

  test("not in operator generates NOT IN clause", () => {
    const cond = parseDomainFilter(["status", "not in", ["archived", "deleted"]]);
    const result = generateWhereClause([cond]);
    expect(result.sql).toBe("status NOT IN ($1, $2)");
    expect(result.params).toEqual(["archived", "deleted"]);
  });

  test("like operator wraps value with %", () => {
    const cond = parseDomainFilter(["name", "like", "test"]);
    const result = generateWhereClause([cond]);
    expect(result.sql).toBe("name LIKE $1");
    expect(result.params).toEqual(["%test%"]);
  });

  test("ilike operator wraps value with %", () => {
    const cond = parseDomainFilter(["name", "ilike", "Test"]);
    const result = generateWhereClause([cond]);
    expect(result.sql).toBe("name ILIKE $1");
    expect(result.params).toEqual(["%Test%"]);
  });

  test("table alias prefixes column names", () => {
    const cond = parseDomainFilter(["status", "=", "draft"]);
    const result = generateWhereClause([cond], { tableAlias: "t" });
    expect(result.sql).toBe("t.status = $1");
  });

  test("tenant_id auto-injection", () => {
    const cond = parseDomainFilter(["status", "=", "draft"]);
    const result = generateWhereClause([cond], { tenantId: "tenant-1" });
    // tenant_id should be $1, status = $2
    expect(result.sql).toBe("tenant_id = $1 AND status = $2");
    expect(result.params).toEqual(["tenant-1", "draft"]);
  });

  test("custom tenant field name", () => {
    const cond = parseDomainFilter(["status", "=", "draft"]);
    const result = generateWhereClause([cond], { tenantId: "t2", tenantFieldName: "org_id" });
    expect(result.sql).toBe("org_id = $1 AND status = $2");
    expect(result.params).toEqual(["t2", "draft"]);
  });

  test("empty conditions returns TRUE", () => {
    const result = generateWhereClause([]);
    expect(result.sql).toBe("TRUE");
    expect(result.params).toEqual([]);
  });

  test("multiple top-level conditions joined by AND", () => {
    const c1 = parseDomainFilter(["status", "=", "active"]);
    const c2 = parseDomainFilter(["amount", ">", 0]);
    const result = generateWhereClause([c1, c2]);
    expect(result.sql).toBe("status = $1 AND amount > $2");
    expect(result.params).toEqual(["active", 0]);
  });

  test("combined tenant_id + multiple conditions", () => {
    const c1 = parseDomainFilter(["status", "=", "draft"]);
    const result = generateWhereClause([c1], {
      tableAlias: "t",
      tenantId: "t1",
    });
    expect(result.sql).toBe("t.tenant_id = $1 AND t.status = $2");
    expect(result.params).toEqual(["t1", "draft"]);
  });

  test("complex nested SQL generation", () => {
    const cond = parseDomainFilter([
      "&",
      ["amount", ">", 100],
      ["|", ["status", "in", ["draft", "review"]], ["priority", ">=", 3]],
    ]);
    const result = generateWhereClause([cond]);
    // amount > $1 AND (status IN ($2,$3) OR priority >= $4)
    expect(result.sql).toBe(
      "(amount > $1 AND (status IN ($2, $3) OR priority >= $4))",
    );
    expect(result.params).toEqual([100, "draft", "review", 3]);
  });

  test("parameter numbering is consistent and sequential", () => {
    // Test that across multiple generateWhereClause calls params don't leak
    const c1 = parseDomainFilter(["a", "=", 1]);
    const c2 = parseDomainFilter(["b", "=", 2]);
    const r1 = generateWhereClause([c1]);
    const r2 = generateWhereClause([c2]);
    expect(r1.params).toEqual([1]);
    expect(r1.sql).toBe("a = $1");
    expect(r2.params).toEqual([2]);
    expect(r2.sql).toBe("b = $1");
  });
});
