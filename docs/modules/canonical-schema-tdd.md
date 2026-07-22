# canonical-schema — TDD

**状态**: ✅ TDD 完成
**包**: `@audebase/canonical-schema`
**SDD**: `docs/modules/canonical-schema-sdd.md`
**预估测试数**: 5（3 类型断言 + 2 Zod 验证）
**覆盖率目标**: N/A（纯类型包 — 编译期 + Zod 验证通过即覆盖）
**生成日期**: 2026-07-22

---

## 测试文件: `packages/canonical-schema/src/types.test.ts`

### Test 1: CanonicalSnapshot 结构验证

```typescript
// Arrange
const snap: CanonicalSnapshot = {
  version: '1.0',
  exportedAt: '2026-07-22T00:00:00.000Z',
  source: { platform: 'nocobase', version: '2.1.29' },
  collections: [
    { name: 'test', records: [{ id: '1', foo: 'bar' }] }
  ]
};

// Act
const version = snap.version;
const platform = snap.source.platform;
const firstRecordId = snap.collections[0].records[0].id;

// Assert
expect(version).toBe('1.0');
expect(platform).toBe('nocobase');
expect(firstRecordId).toBe('1');
expect(snap.collections).toHaveLength(1);
```

### Test 2: CanonicalRecord 允许任意字段

```typescript
// Arrange
const rec: CanonicalRecord = {
  id: 'x',
  extra: 42,
  nested: { a: 1, b: [1, 2, 3] },
  flag: true
};

// Act
const extra = rec.extra;
const nestedA = (rec.nested as Record<string, unknown>).a;

// Assert
expect(extra).toBe(42);
expect(nestedA).toBe(1);
expect(rec.id).toBe('x');
expect(rec.flag).toBe(true);
```

### Test 3: CanonicalCollection 空记录数组

```typescript
// Arrange
const coll: CanonicalCollection = { name: 'foo', records: [] };

// Act
const isEmpty = coll.records.length === 0;

// Assert
expect(coll.name).toBe('foo');
expect(isEmpty).toBe(true);
expect(Array.isArray(coll.records)).toBe(true);
```

## 测试文件: `packages/canonical-schema/src/schema.test.ts`

### Test 4: CanonicalSnapshotSchema 验证正确的快照

```typescript
// Arrange
const validSnapshot = {
  version: '1.0',
  exportedAt: '2026-07-22T10:30:00.000Z',
  source: { platform: 'nocobase', version: '2.1.29' },
  collections: [
    { name: 'devices', records: [{ id: 'd1', name: 'Printer A', serialNumber: 'SN-001' }] },
    { name: 'materials', records: [{ id: 'm1', name: 'PLA Black', type: 'PLA' }] }
  ]
};

// Act
const result = CanonicalSnapshotSchema.safeParse(validSnapshot);

// Assert
expect(result.success).toBe(true);
if (result.success) {
  expect(result.data.version).toBe('1.0');
  expect(result.data.collections).toHaveLength(2);
}
```

### Test 5: CanonicalSnapshotSchema 拒绝无效快照

```typescript
// Arrange
const invalidSnapshot = {
  version: '2.0',                    // 无效 — 仅 '1.0' 允许
  exportedAt: 'not-a-date',          // 无效 — 非 ISO 8601
  source: { platform: 'unknown', version: '' },  // 无效 — platform 仅 'nocobase'
  collections: 'not-an-array'        // 无效 — 应为 array
};

// Act
const result = CanonicalSnapshotSchema.safeParse(invalidSnapshot);

// Assert
expect(result.success).toBe(false);
if (!result.success) {
  const pathMessages = result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
  expect(pathMessages).toContainEqual(expect.stringContaining('version'));
  expect(pathMessages).toContainEqual(expect.stringContaining('exportedAt'));
  expect(pathMessages).toContainEqual(expect.stringContaining('source'));
  expect(pathMessages).toContainEqual(expect.stringContaining('collections'));
}
```

## 测试汇总

| # | 文件 | 场景 | 类型 |
|---|------|------|:---:|
| T1 | types.test.ts | CanonicalSnapshot 结构 | 类型断言 |
| T2 | types.test.ts | CanonicalRecord 任意字段 | 类型断言 |
| T3 | types.test.ts | CanonicalCollection 空数组 | 类型断言 |
| T4 | schema.test.ts | valid snapshot passes Zod validation | Zod parse |
| T5 | schema.test.ts | invalid snapshot rejected with detail error | Zod safeParse |

**运行方式**:
```bash
cd packages/canonical-schema
npx vitest run   # 预期: 5/5 passed
```
