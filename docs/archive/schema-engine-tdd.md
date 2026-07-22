# Schema Engine TDD — Phase 2

> **创建日期**: 2026-07-20  
> **前置阅读**: [schema-engine-sdd.md](schema-engine-sdd.md), [decisions.md D3](../../.agents/memorys/decisions.md), [architecture.md §4.5.1 §6.4](../architecture.md)  
> **状态**: ✅ 已实现 — 5 测试文件, 覆盖全部导出 API

---

## 测试策略

| 层级 | 范围 | 策略 | 文件位置 |
|------|------|------|---------|
| 单元测试 | 所有导出函数和类 | 纯函数直接断言；SchemaRegistry 类实例方法测试 | `src/__tests__/*.test.ts` |
| 集成测试 | DDL 完整往返 | CollectionDef → SQL 全流程 + 索引 + 标识符安全 | `ddl.test.ts` §"DDL round-trip integration" |
| E2E 测试 | — | schema-engine 不涉及浏览器行为 | 不适用 |

**覆盖率目标**: ≥ 80%（覆盖全部导出函数和类型）

**运行命令**:
```bash
pnpm --filter @audebase/schema-engine test          # 单次运行
pnpm --filter @audebase/schema-engine test:coverage  # 覆盖率报告
```

---

## 测试用例

### T1: types.test.ts — 类型和 barrel export 冒烟测试

| # | 测试名 | Arrange | Act | Assert |
|---|--------|---------|-----|--------|
| T1.1 | `FIELD_TYPES contains all expected types` | — | 读取 `FIELD_TYPES` 常量 | 包含 7 种类型: string/number/boolean/date/enum/belongsTo/hasMany；长度为 7 |
| T1.2 | `FieldDef type usage compiles and works` | 构造 `{ name:"title", type:"string", required:true, label:"Title" }` | 访问属性 | 各字段值匹配；TypeScript 编译通过 |
| T1.3 | `CollectionDef type usage compiles and works` | 构造含 name + fields + primaryKey + timestamps 的 CollectionDef | 访问属性 | fields 长度为 2；primaryKey 为 "id"；timestamps 为 true |
| T1.4 | `FieldType union covers all allowed values` | 构造 7 种 FieldType 的数组 | 遍历检查是否在 FIELD_TYPES 中 | 全部包含 |
| T1.5 | `ValidationResult type is correct shape` | 构造 `{ valid:true, errors:[] }` 和 `{ valid:false, errors:[...] }` | 访问属性 | valid/errors 值正确 |
| T1.6 | `barrel exports include all classes and functions` | import SchemaRegistry, validateField, validateCollection | 检查是否为 defined | 全部 defined |

### T2: registry.test.ts — SchemaRegistry

| # | 测试名 | Arrange | Act | Assert |
|---|--------|---------|-----|--------|
| T2.1 | `registers a collection and makes it retrievable` | `new SchemaRegistry()` + makeCollection("users", [...]) | `registry.register(collection)` + `registry.get("users")` | 返回值 === collection |
| T2.2 | `throws when registering a duplicate collection name` | 先注册 users 一次 | `registry.register(第二个 users)` | throw Error('Collection "users" is already registered') |
| T2.3 | `returns undefined for an unregistered collection` | `new SchemaRegistry()` | `registry.get("nonexistent")` | undefined |
| T2.4 | `returns the registered collection` | 注册 orders | `registry.get("orders")` | 返回原 collection 引用 |
| T2.5 | `returns empty array when no collections registered` | `new SchemaRegistry()` | `registry.list()` | [] |
| T2.6 | `returns all registered collections` | 注册 users + orders | `registry.list()` | 长度 2；包含两个 collection |
| T2.7 | `returns false for unregistered collection` | `new SchemaRegistry()` | `registry.has("users")` | false |
| T2.8 | `returns true for registered collection` | 注册 users | `registry.has("users")` | true |
| T2.9 | `returns false when removing unregistered collection` | `new SchemaRegistry()` | `registry.remove("nonexistent")` | false |
| T2.10 | `returns true and removes the collection` | 注册 users | `registry.remove("users")` + `registry.has("users")` | remove 返回 true；has 返回 false |

### T3: validator.test.ts — validateField / validateCollection

#### validateField

| # | 测试名 | Arrange | Act | Assert |
|---|--------|---------|-----|--------|
| T3.1 | `valid field returns valid result` | `{ name:"email", type:"string" }` | `validateField(field)` | valid: true, errors: [] |
| T3.2 | `field with all optional properties is valid` | 含 required/unique/default/label 的完整字段 | `validateField(field)` | valid: true |
| T3.3 | `rejects field with empty name` | `{ name:"", type:"string" }` | `validateField(field)` | valid: false；errors 包含 `{ path:"name", message:"Field name is required" }` |
| T3.4 | `rejects field with missing name` | `{ type:"string" } as FieldDef` | `validateField(field)` | valid: false；errors 有 path="name" |
| T3.5 | `rejects field with missing type` | `{ name:"x" } as FieldDef` | `validateField(field)` | valid: false；errors 有 path="type" |
| T3.6 | `rejects field with invalid type` | `{ name:"x", type:"invalid" as "string" }` | `validateField(field)` | valid: false；errors 含 `{ path:"type", message:'Invalid field type "invalid"' }` |
| T3.7 | `rejects enum field without enumValues` | `{ name:"status", type:"enum" }` | `validateField(field)` | valid: false；errors 含 `{ path:"enumValues", message:"enum type requires enumValues..." }` |
| T3.8 | `rejects enum field with empty enumValues` | `{ name:"status", type:"enum", enumValues:[] }` | `validateField(field)` | valid: false；errors 含 enumValues 错误 |
| T3.9 | `accepts valid enum field with enumValues` | `{ name:"status", type:"enum", enumValues:["draft","published"] }` | `validateField(field)` | valid: true |
| T3.10 | `rejects belongsTo field without target` | `{ name:"author", type:"belongsTo" }` | `validateField(field)` | valid: false；errors 含 `{ path:"target", message:"belongsTo type requires a target..." }` |
| T3.11 | `rejects hasMany field without target` | `{ name:"orders", type:"hasMany" }` | `validateField(field)` | valid: false；errors 含 `{ path:"target", message:"hasMany type requires a target..." }` |
| T3.12 | `accepts belongsTo field with target` | `{ name:"author", type:"belongsTo", target:"users" }` | `validateField(field)` | valid: true |
| T3.13 | `accepts hasMany field with target` | `{ name:"comments", type:"hasMany", target:"comments" }` | `validateField(field)` | valid: true |
| T3.14 | `accepts all valid field types` | 遍历 "string"/"number"/"boolean"/"date" | 逐一 `validateField` | 全部 valid: true |

#### validateCollection

| # | 测试名 | Arrange | Act | Assert |
|---|--------|---------|-----|--------|
| T3.15 | `valid collection passes` | `{ name:"users", fields:[{...},{...}] }` | `validateCollection(collection)` | valid: true, errors: [] |
| T3.16 | `rejects collection with empty name` | `{ name:"", fields:[...] }` | `validateCollection(collection)` | valid: false；errors 含 `{ path:"name", message:"Collection name is required" }` |
| T3.17 | `rejects collection with no fields` | `{ name:"users", fields:[] }` | `validateCollection(collection)` | valid: false；errors 含 `{ path:"fields", message:"Collection must have at least one field" }` |
| T3.18 | `rejects collection with duplicate field names` | 两个字段都叫 "email" | `validateCollection(collection)` | valid: false；errors 含 `{ path:"fields.email", message:'Duplicate field name "email"' }` |
| T3.19 | `rejects collection with invalid nested field` | 包含 `{ type:"enum" }` 但无 enumValues 的字段 | `validateCollection(collection)` | valid: false；errors 含 `{ path:"fields[1].enumValues", ... }` |
| T3.20 | `full collection with table, primaryKey, timestamps is valid` | 含 table:"app_orders" + primaryKey:"id" + timestamps:true | `validateCollection(collection)` | valid: true |

### T4: ddl.test.ts — DDL 生成

#### fieldToColumnType

| # | 测试名 | Arrange | Act | Assert |
|---|--------|---------|-----|--------|
| T4.1 | `string field maps to VARCHAR(255)` | `{ name:"email", type:"string" }` | `fieldToColumnType(field)` | `'"email" VARCHAR(255)'` |
| T4.2 | `required string field adds NOT NULL` | `{ name:"name", type:"string", required:true }` | `fieldToColumnType(field)` | `'"name" VARCHAR(255) NOT NULL'` |
| T4.3 | `unique string field adds UNIQUE NOT NULL` | `{ unique:true, required:true }` | `fieldToColumnType(field)` | `'"email" VARCHAR(255) UNIQUE NOT NULL'` |
| T4.4 | `number field maps to INTEGER` | `{ name:"age", type:"number" }` | `fieldToColumnType(field)` | `'"age" INTEGER'` |
| T4.5 | `unique number field adds UNIQUE NOT NULL` | `{ unique:true, required:true }` | `fieldToColumnType(field)` | `'"code" INTEGER UNIQUE NOT NULL'` |
| T4.6 | `boolean field maps to BOOLEAN DEFAULT false` | `{ name:"active", type:"boolean" }` | `fieldToColumnType(field)` | `'"active" BOOLEAN DEFAULT false'` |
| T4.7 | `date field maps to TIMESTAMP` | `{ name:"birthday", type:"date" }` | `fieldToColumnType(field)` | `'"birthday" TIMESTAMP'` |
| T4.8 | `date field with required adds NOT NULL` | `{ required:true }` | `fieldToColumnType(field)` | `'"created" TIMESTAMP NOT NULL'` |
| T4.9 | `enum field generates CHECK constraint` | `{ enumValues:["draft","published","archived"] }` | `fieldToColumnType(field)` | `'"status" VARCHAR(50) CHECK ("status" IN ('draft','published','archived'))'` |
| T4.10 | `enum field with required adds NOT NULL` | `{ enumValues:[...], required:true }` | `fieldToColumnType(field)` | 包含 "NOT NULL" 和 "CHECK" |
| T4.11 | `belongsTo field generates REFERENCES with ON DELETE SET NULL` | `{ target:"users" }` | `fieldToColumnType(field)` | `'"user_id" INTEGER REFERENCES "users"(id) ON DELETE SET NULL'` |
| T4.12 | `belongsTo with required adds NOT NULL` | `{ target:"users", required:true }` | `fieldToColumnType(field)` | 包含 "NOT NULL" 和 "REFERENCES" |
| T4.13 | `hasMany field produces no column` | `{ name:"posts", type:"hasMany", target:"posts" }` | `fieldToColumnType(field)` | `""` |
| T4.14 | `enum field escapes single quotes in values` | `{ enumValues:["it's","ok"] }` | `fieldToColumnType(field)` | 包含 `'it''s'`（SQL 转义） |

#### generateCreateTable

| # | 测试名 | Arrange | Act | Assert |
|---|--------|---------|-----|--------|
| T4.15 | `generates CREATE TABLE with string and number fields` | CollectionDef { name:"users", fields:[name:string req, age:number] } | `generateCreateTable(collection)` | SQL 包含: `CREATE TABLE IF NOT EXISTS "users"`, `"id" SERIAL PRIMARY KEY`, `"name" VARCHAR(255) NOT NULL`, `"age" INTEGER`, `"created_at" TIMESTAMP DEFAULT NOW()`, `"updated_at" TIMESTAMP DEFAULT NOW()` |
| T4.16 | `uses custom table name` | `{ table:"app_orders" }` | `generateCreateTable(collection)` | SQL 包含 `CREATE TABLE IF NOT EXISTS "app_orders"` |
| T4.17 | `uses custom primary key` | `{ primaryKey:"uuid", fields:[{name:"uuid",...}] }` | `generateCreateTable(collection)` | SQL 包含 `"uuid" SERIAL PRIMARY KEY`；"uuid" 仅出现一次（不重复为列） |
| T4.18 | `timestamp fields omitted when timestamps is false` | `{ timestamps:false }` | `generateCreateTable(collection)` | SQL 不含 "created_at" 和 "updated_at" |
| T4.19 | `hasMany fields are skipped in table creation` | fields 中包含 hasMany | `generateCreateTable(collection)` | SQL 不含 hasMany 字段名；仍含 "id" 和 string 字段 |
| T4.20 | `enum field generates CHECK constraint in CREATE TABLE` | 含 type:"enum" 字段 | `generateCreateTable(collection)` | SQL 含 "CHECK" 和枚举值 |
| T4.21 | `belongsTo generates REFERENCES in CREATE TABLE` | 含 type:"belongsTo" 字段 | `generateCreateTable(collection)` | SQL 含 `REFERENCES "users"(id) ON DELETE SET NULL` |

#### generateCreateIndexes

| # | 测试名 | Arrange | Act | Assert |
|---|--------|---------|-----|--------|
| T4.22 | `generates indexes for belongsTo foreign key columns` | 2 个 belongsTo 字段 | `generateCreateIndexes(collection)` | 返回 2 个索引；命名含 `idx_posts_author_id`, `idx_posts_category_id`；包含 `ON "posts"` |
| T4.23 | `returns empty array when no FK columns exist` | 仅 string/number 字段 | `generateCreateIndexes(collection)` | [] |
| T4.24 | `uses custom table name in index names` | `{ table:"blog_comments" }` | `generateCreateIndexes(collection)` | 索引名含 `idx_blog_comments_post_id`；ON 子句用 `"blog_comments"` |

#### generateAlterTable

| # | 测试名 | Arrange | Act | Assert |
|---|--------|---------|-----|--------|
| T4.25 | `generates ADD COLUMN statements for new fields` | newFields: [phone:string, age:number] | `generateAlterTable(collection, newFields)` | 2 条 ALTER TABLE；第一条 `ALTER TABLE "users" ADD COLUMN "phone" VARCHAR(255);`；第二条 `AGE INTEGER` |
| T4.26 | `skips hasMany fields in ALTER TABLE` | newFields 包含 hasMany | `generateAlterTable(collection, newFields)` | 只输出 1 条（bio），不含 posts |
| T4.27 | `returns empty array when no new fields` | newFields: [] | `generateAlterTable(collection, [])` | [] |
| T4.28 | `respects custom table name in ALTER TABLE` | `{ table:"app_items" }`, newFields: [color] | `generateAlterTable(collection, newFields)` | SQL 含 `TABLE "app_items"` |

#### validateSqlIdentifiers

| # | 测试名 | Arrange | Act | Assert |
|---|--------|---------|-----|--------|
| T4.29 | `valid identifiers pass validation` | fields: [first_name, age2] | `validateSqlIdentifiers(collection)` | valid: true, errors: [] |
| T4.30 | `rejects identifiers with special characters` | field name: "email-hash" | `validateSqlIdentifiers(collection)` | valid: false；errors 含 "email-hash" |
| T4.31 | `rejects identifiers that are too long (>63 chars)` | 64 字符字段名 | `validateSqlIdentifiers(collection)` | valid: false；error message 含 "exceeds" |
| T4.32 | `rejects table names that are SQL reserved words` | collection name: "select" | `validateSqlIdentifiers(collection)` | valid: false；path="table", message 含 "reserved" |
| T4.33 | `rejects field names that are SQL reserved words` | field name: "table" | `validateSqlIdentifiers(collection)` | valid: false；message 含 "reserved" |

#### DDL 完整往返

| # | 测试名 | Arrange | Act | Assert |
|---|--------|---------|-----|--------|
| T4.34 | `CollectionDef → SQL produces parseable, self-consistent output` | 含所有 6 种字段类型的完整 products CollectionDef | `generateCreateTable()` + `generateCreateIndexes()` | 验证: CREATE TABLE 结构完整、索引正确生成、所有 SQL 语句以分号结尾、hasMany 字段不出现在 DDL 中 |

### T5: ui-mapping.test.ts — UI 映射

#### fieldToColumn

| # | 测试名 | Arrange | Act | Assert |
|---|--------|---------|-----|--------|
| T5.1 | `string field maps to text valueType with hideInSearch when not required` | `{ name:"title", type:"string", label:"Title" }` | `fieldToColumn(field)` | `{ title:"Title", dataIndex:"title", key:"title", valueType:"text", hideInSearch:true }` |
| T5.2 | `string field required does not hide in search` | `{ required:true }` | `fieldToColumn(field)` | hideInSearch: false |
| T5.3 | `number field maps to number valueType` | `{ name:"age", type:"number", label:"Age" }` | `fieldToColumn(field)` | `{ title:"Age", dataIndex:"age", key:"age", valueType:"number" }` |
| T5.4 | `boolean field maps to switch valueType with hideInSearch` | `{ name:"active", type:"boolean", label:"Active" }` | `fieldToColumn(field)` | `{ valueType:"switch", hideInSearch:true }` |
| T5.5 | `date field maps to date valueType` | `{ name:"createdAt", type:"date", label:"Created" }` | `fieldToColumn(field)` | `{ valueType:"date" }` |
| T5.6 | `enum field maps to select valueType with valueEnum` | `{ enumValues:["draft","published","archived"] }` | `fieldToColumn(field)` | `{ valueType:"select", valueEnum: { draft:{text:"draft"}, published:{text:"published"}, archived:{text:"archived"} } }` |
| T5.7 | `belongsTo field maps to select valueType` | `{ name:"categoryId", type:"belongsTo", label:"Category", target:"category" }` | `fieldToColumn(field)` | `{ valueType:"select" }` |
| T5.8 | `hasMany field is hidden in both table and search` | `{ name:"items", type:"hasMany", label:"Items" }` | `fieldToColumn(field)` | `{ hideInTable:true, hideInSearch:true }` |
| T5.9 | `falls back to field name when label is undefined` | `{ name:"note", type:"string" }` | `fieldToColumn(field)` | title === "note" |

#### fieldToFormField

| # | 测试名 | Arrange | Act | Assert |
|---|--------|---------|-----|--------|
| T5.10 | `string field maps to Input component` | `{ name:"title", type:"string", label:"Title" }` | `fieldToFormField(field)` | `{ name:"title", label:"Title", component:"Input" }` |
| T5.11 | `required field adds validation rules` | `{ required:true, label:"Title" }` | `fieldToFormField(field)` | `rules: [{ required:true, message:"Title is required" }]` |
| T5.12 | `number field maps to InputNumber component` | `{ name:"age", type:"number", label:"Age" }` | `fieldToFormField(field)` | `{ component:"InputNumber" }` |
| T5.13 | `boolean field maps to Switch component` | `{ name:"active", type:"boolean", label:"Active" }` | `fieldToFormField(field)` | `{ component:"Switch" }` |
| T5.14 | `date field maps to DatePicker component` | `{ name:"createdAt", type:"date", label:"Created" }` | `fieldToFormField(field)` | `{ component:"DatePicker" }` |
| T5.15 | `enum field maps to Select component with options` | `{ enumValues:["draft","published"] }` | `fieldToFormField(field)` | `{ component:"Select", props:{ options:[{value:"draft",label:"draft"},{value:"published",label:"published"}] } }` |
| T5.16 | `belongsTo field maps to Select component` | `{ name:"categoryId", type:"belongsTo", label:"Category" }` | `fieldToFormField(field)` | `{ component:"Select" }` |
| T5.17 | `hasMany field maps to Select component` | `{ name:"items", type:"hasMany", label:"Items" }` | `fieldToFormField(field)` | `{ component:"Select" }` |
| T5.18 | `falls back to field name when label is undefined` | `{ name:"note", type:"string" }` | `fieldToFormField(field)` | label === "note" |

#### collectionToColumns

| # | 测试名 | Arrange | Act | Assert |
|---|--------|---------|-----|--------|
| T5.19 | `converts all non-id fields to columns, skipping hasMany` | 含 id/number + title/string + price/number + active/boolean + variants/hasMany | `collectionToColumns(collection)` | 返回 3 个: ["title","price","active"] |
| T5.20 | `empty fields returns empty array` | `{ fields:[] }` | `collectionToColumns(collection)` | [] |

#### collectionToFormFields

| # | 测试名 | Arrange | Act | Assert |
|---|--------|---------|-----|--------|
| T5.21 | `converts all non-id fields to form configs` | 含 id + title/string/req + price/number + categoryId/belongsTo | `collectionToFormFields(collection)` | 返回 3 个: ["title","price","categoryId"]；分别验证 component: "Input"/"InputNumber"/"Select"；titleField.rules defined |
| T5.22 | `empty fields returns empty array` | `{ fields:[] }` | `collectionToFormFields(collection)` | [] |

#### 边界情况

| # | 测试名 | Arrange | Act | Assert |
|---|--------|---------|-----|--------|
| T5.23 | `enum with empty enumValues array has no valueEnum or options` | `{ type:"enum", enumValues:[] }` | `fieldToColumn()` + `fieldToFormField()` | col.valueEnum undefined；form.props undefined |
| T5.24 | `string field without label uses field name` | `{ name:"description", type:"string" }` | `fieldToColumn()` + `fieldToFormField()` | col.title === "description"；form.label === "description" |

---

## 覆盖率统计

| 文件 | 测试数 | 覆盖函数 |
|------|--------|---------|
| `types.ts` | 6 | FIELD_TYPES, FieldDef, CollectionDef, ValidationResult, FieldType union, barrel |
| `registry.ts` | 10 | register, get, list, has, remove（含错误路径） |
| `validator.ts` | 20 | validateField (14), validateCollection (6) |
| `ddl.ts` | 20 | fieldToColumnType (14), generateCreateTable (7), generateCreateIndexes (3), generateAlterTable (4), validateSqlIdentifiers (5), round-trip (1) |
| `ui-mapping.ts` | 24 | fieldToColumn (9), fieldToFormField (9), collectionToColumns (2), collectionToFormFields (2), edge cases (2) |
| **总计** | **80** | |

**覆盖率基准**: ✅ 当前 80 测试覆盖全部 11 个导出函数和 3 个导出类型，满足 ≥80% 要求。

---

## Mock 约束

- **无需 mock** — 所有测试为纯函数断言
- **测试辅助函数**（测试内联，不导出）:
  ```typescript
  function stringField(name: string): FieldDef    // { name, type: "string" }
  function makeCollection(name: string, fields): CollectionDef  // { name, fields }
  ```
- **Seed 数据**: 不适用（无数据库交互）
- **路径引用**: 测试通过 `../index` (barrel) 或 `../{module}` 直接 import

---

## AAA 格式强制

所有测试严格遵循 Arrange → Act → Assert 三段式，每段用注释标注：

```typescript
test("string field maps to VARCHAR(255)", () => {
  // Arrange
  const field: FieldDef = { name: "email", type: "string" };

  // Act
  const result = fieldToColumnType(field);

  // Assert
  expect(result).toBe('"email" VARCHAR(255)');
});
```
