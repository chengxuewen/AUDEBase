# migration-engine — TDD

**状态**: ✅ TDD 完成
**包**: `@audebase/migration-engine`
**SDD**: `docs/modules/migration-engine-sdd.md`
**预估测试数**: 35（export 8 + diff 6 + import 8 + noco-base-tables 4 + topo-sort 6 + roundtrip 3）
**覆盖率目标**: ≥80%
**生成日期**: 2026-07-22

---

## 测试文件: `packages/migration-engine/src/noco-base-tables.test.ts`

### Test 1: 系统表被过滤
```typescript
// Arrange
const systemTables = ['_schema_migrations', '_schema_collections', 'users', 'roles'];

// Act + Assert
systemTables.forEach(t => {
  expect(isSystemTable(t)).toBe(true);
});
```

### Test 2: 业务表不被过滤
```typescript
// Arrange
const businessTables = ['print_jobs', 'devices', 'materials'];

// Act + Assert
businessTables.forEach(t => {
  expect(isSystemTable(t)).toBe(false);
});
```

### Test 3: 未知表日志警告
```typescript
// Arrange
const unknownTable = 'some_custom_plugin_table';
const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

// Act
const result = isSystemTable(unknownTable);

// Assert
expect(result).toBe(false);
expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(unknownTable));
warnSpy.mockRestore();
```

### Test 4: 大小写不敏感匹配
```typescript
// Arrange
const cases = ['Users', 'USERS', 'users', 'ROLES', 'Roles'];

// Act + Assert
cases.forEach(t => {
  expect(isSystemTable(t)).toBe(true);
});
```

---

## 测试文件: `packages/migration-engine/src/topological-sort.test.ts`

### Test 5: 线性依赖 A→B→C 正确排序
```typescript
// Arrange
const collections = [
  { name: 'c', fields: [] },
  { name: 'b', fields: [{ name: 'cId', type: 'belongsTo', target: 'c' }] },
  { name: 'a', fields: [{ name: 'bId', type: 'belongsTo', target: 'b' }] },
];

// Act
const result = topologicalSort(collections);

// Assert
expect(result.multiPass).toEqual([]);
// batches: [[c], [b], [a]] — c has no FK, b depends on c, a depends on b
expect(result.batches).toEqual([['c'], ['b'], ['a']]);
```

### Test 6: 无依赖 → 单批次
```typescript
// Arrange
const collections = [
  { name: 'a', fields: [] },
  { name: 'b', fields: [] },
  { name: 'c', fields: [] },
];

// Act
const result = topologicalSort(collections);

// Assert
expect(result.multiPass).toEqual([]);
expect(result.batches).toHaveLength(1);
expect(result.batches[0]).toEqual(expect.arrayContaining(['a', 'b', 'c']));
```

### Test 7: 多根节点同批次
```typescript
// Arrange
// a, b 无依赖 → 可并行；c 依赖 a；d 依赖 b
const collections = [
  { name: 'a', fields: [] },
  { name: 'b', fields: [] },
  { name: 'c', fields: [{ name: 'aId', type: 'belongsTo', target: 'a' }] },
  { name: 'd', fields: [{ name: 'bId', type: 'belongsTo', target: 'b' }] },
];

// Act
const result = topologicalSort(collections);

// Assert
expect(result.multiPass).toEqual([]);
// Batch 0: a, b (parallel); Batch 1: c, d (parallel)
expect(result.batches[0].sort()).toEqual(['a', 'b']);
expect(result.batches[1].sort()).toEqual(['c', 'd']);
```

### Test 8: 循环依赖 → multi-pass
```typescript
// Arrange
const collections = [
  { name: 'a', fields: [{ name: 'bId', type: 'belongsTo', target: 'b' }] },
  { name: 'b', fields: [{ name: 'aId', type: 'belongsTo', target: 'a' }] },
];

// Act
const result = topologicalSort(collections);

// Assert
expect(result.multiPass.sort()).toEqual(['a', 'b']);
expect(result.batches).toEqual([]);
```

### Test 9: 自引用 → multi-pass
```typescript
// Arrange
const collections = [
  { name: 'jobs', fields: [{ name: 'parentJobId', type: 'belongsTo', target: 'jobs' }] },
  { name: 'devices', fields: [] },
];

// Act
const result = topologicalSort(collections);

// Assert
expect(result.multiPass).toEqual(['jobs']);
expect(result.batches).toEqual([['devices']]);
```

### Test 10: 菱形依赖 D→A, D→B, A→C, B→C
```typescript
// Arrange
const collections = [
  { name: 'd', fields: [
    { name: 'aId', type: 'belongsTo', target: 'a' },
    { name: 'bId', type: 'belongsTo', target: 'b' },
  ]},
  { name: 'a', fields: [{ name: 'cId', type: 'belongsTo', target: 'c' }] },
  { name: 'b', fields: [{ name: 'cId', type: 'belongsTo', target: 'c' }] },
  { name: 'c', fields: [] },
];

// Act
const result = topologicalSort(collections);

// Assert
expect(result.multiPass).toEqual([]);
// c first, then a+b parallel, then d
expect(result.batches).toEqual([['c'], ['a', 'b'], ['d']]);
```

---

## 测试文件: `packages/migration-engine/src/export.test.ts`

### Test 11: 仅导出业务表
```typescript
// Arrange
const mockDb = createMockDb({
  collections: {
    print_jobs: [{ id: '1', name: 'Job 1' }],
    devices: [{ id: 'd1', name: 'Printer A' }],
    users: [{ id: 'u1', email: 'admin@test.com' }],
    roles: [{ id: 'r1', name: 'admin' }],
  }
});

// Act
const snapshot = await exportToCanonical(mockDb, { excludeSystemTables: true });

// Assert
const names = snapshot.collections.map(c => c.name).sort();
expect(names).toEqual(['devices', 'print_jobs']);
expect(names).not.toContain('users');
expect(names).not.toContain('roles');
```

### Test 12: 按 collection 名称过滤
```typescript
// Arrange
const mockDb = createMockDb({
  collections: {
    devices: [{ id: 'd1', name: 'Printer A' }],
    materials: [{ id: 'm1', name: 'PLA Black' }],
  }
});

// Act
const snapshot = await exportToCanonical(mockDb, { collections: ['devices'] });

// Assert
expect(snapshot.collections).toHaveLength(1);
expect(snapshot.collections[0].name).toBe('devices');
```

### Test 13: belongsTo 仅存 FK id
```typescript
// Arrange
const mockDb = createMockDb({
  collections: {
    print_jobs: [{ id: 'j1', name: 'Job', deviceId: 'd1', materialId: 'm1' }],
    devices: [{ id: 'd1', name: 'Printer A' }],
    materials: [{ id: 'm1', name: 'PLA' }],
  },
  schemas: {
    print_jobs: { fields: [
      { name: 'deviceId', type: 'belongsTo', target: 'devices' },
      { name: 'materialId', type: 'belongsTo', target: 'materials' },
    ]},
  }
});

// Act
const snapshot = await exportToCanonical(mockDb);

// Assert
const job = snapshot.collections.find(c => c.name === 'print_jobs')!.records[0];
expect(job.deviceId).toBe('d1');        // FK id, not nested object
expect(job.materialId).toBe('m1');
expect(job.device).toBeUndefined();     // no nested relation
```

### Test 14: hasMany 子记录作为独立 Collection
```typescript
// Arrange
const mockDb = createMockDb({
  collections: {
    devices: [{ id: 'd1', name: 'Printer A' }],
    print_jobs: [
      { id: 'j1', name: 'Job 1', deviceId: 'd1' },
      { id: 'j2', name: 'Job 2', deviceId: 'd1' },
    ],
  },
  schemas: {
    devices: { fields: [
      { name: 'print_jobs', type: 'hasMany', target: 'print_jobs' },
    ]},
  }
});

// Act
const snapshot = await exportToCanonical(mockDb);

// Assert
const device = snapshot.collections.find(c => c.name === 'devices')!.records[0];
expect(device.print_jobs).toBeUndefined();  // not embedded in device record

const jobs = snapshot.collections.find(c => c.name === 'print_jobs')!;
expect(jobs.records).toHaveLength(2);       // exported as separate collection
expect(jobs.records.every(r => r.deviceId === 'd1')).toBe(true);
```

### Test 15: manyToMany 中间表导出
```typescript
// Arrange
const mockDb = createMockDb({
  collections: {
    print_jobs: [{ id: 'j1', name: 'Job' }],
    materials: [{ id: 'm1', name: 'PLA' }],
    print_jobs_materials: [
      { id: 'x1', printJobId: 'j1', materialId: 'm1' },
    ],
  },
});

// Act
const snapshot = await exportToCanonical(mockDb);

// Assert
const junction = snapshot.collections.find(c => c.name === 'print_jobs_materials');
expect(junction).toBeDefined();
expect(junction!.records[0].printJobId).toBe('j1');
expect(junction!.records[0].materialId).toBe('m1');
```

### Test 16: snapshot 包含版本和源信息
```typescript
// Arrange
const mockDb = createMockDb({ collections: { devices: [] } });

// Act
const snapshot = await exportToCanonical(mockDb);

// Assert
expect(snapshot.version).toBe('1.0');
expect(snapshot.source.platform).toBe('nocobase');
expect(snapshot.source.version).toBeTruthy();
expect(snapshot.exportedAt).toBeTruthy();
expect(() => new Date(snapshot.exportedAt)).not.toThrow(); // valid ISO 8601
```

### Test 17: 大数据集分批不 OOM
```typescript
// Arrange
const records = Array.from({ length: 5000 }, (_, i) => ({ id: `r${i}`, name: `Record ${i}` }));
const mockDb = createMockDb({ collections: { big_table: records } });

// Act
const snapshot = await exportToCanonical(mockDb, { batchSize: 1000 });

// Assert
const bigTable = snapshot.collections.find(c => c.name === 'big_table')!;
expect(bigTable.records).toHaveLength(5000);
// 验证分页正确：5 批次 × 1000 条
```

### Test 18: createdAt 过滤 < exportStartTime
```typescript
// Arrange
const startTime = new Date('2026-07-22T12:00:00.000Z');
const records = [
  { id: 'r1', name: 'Old', createdAt: '2026-07-22T11:00:00.000Z' },
  { id: 'r2', name: 'New', createdAt: '2026-07-22T13:00:00.000Z' }, // after exportStartTime
];
const mockDb = createMockDb({ collections: { items: records } });

// Act
const snapshot = await exportToCanonical(mockDb, { exportStartTime: startTime });

// Assert
const items = snapshot.collections.find(c => c.name === 'items')!;
expect(items.records).toHaveLength(1);
expect(items.records[0].id).toBe('r1'); // only the old record
```

---

## 测试文件: `packages/migration-engine/src/diff.test.ts`

### Test 19: 相同快照 → match=true, diffs=[]
```typescript
// Arrange
const snap: CanonicalSnapshot = {
  version: '1.0', exportedAt: '2026-07-22T00:00:00.000Z',
  source: { platform: 'nocobase', version: '2.1.29' },
  collections: [{ name: 't', records: [{ id: '1', foo: 'bar' }] }],
};

// Act
const result = diffSnapshots(snap, JSON.parse(JSON.stringify(snap)));

// Assert
expect(result.match).toBe(true);
expect(result.diffs).toEqual([]);
```

### Test 20: 单字段差异正确报告
```typescript
// Arrange
const a: CanonicalSnapshot = {
  version: '1.0', exportedAt: '2026-07-22T00:00:00.000Z',
  source: { platform: 'nocobase', version: '2.1.29' },
  collections: [{ name: 't', records: [{ id: '1', name: 'A', value: 100 }] }],
};
const b: CanonicalSnapshot = {
  version: '1.0', exportedAt: '2026-07-22T00:00:00.000Z',
  source: { platform: 'nocobase', version: '2.1.29' },
  collections: [{ name: 't', records: [{ id: '1', name: 'A', value: 200 }] }],
};

// Act
const result = diffSnapshots(a, b);

// Assert
expect(result.match).toBe(false);
expect(result.diffs).toHaveLength(1);
expect(result.diffs[0]).toMatchObject({
  collection: 't', recordId: '1', field: 'value', expected: 100, actual: 200,
});
```

### Test 21: 浮点数容差 1e-10
```typescript
// Arrange
const a: CanonicalSnapshot = {
  version: '1.0', exportedAt: '2026-07-22T00:00:00.000Z',
  source: { platform: 'nocobase', version: '2.1.29' },
  collections: [{ name: 't', records: [{ id: '1', price: 0.1 + 0.2 }] }],
};
const b: CanonicalSnapshot = {
  version: '1.0', exportedAt: '2026-07-22T00:00:00.000Z',
  source: { platform: 'nocobase', version: '2.1.29' },
  collections: [{ name: 't', records: [{ id: '1', price: 0.3 }] }],
};

// Act
const result = diffSnapshots(a, b);

// Assert
expect(result.match).toBe(true);
// 0.1+0.2 = 0.30000000000000004, diff < 1e-10 from 0.3
```

### Test 22: NaN 标记为差异
```typescript
// Arrange
const a: CanonicalSnapshot = {
  version: '1.0', exportedAt: '2026-07-22T00:00:00.000Z',
  source: { platform: 'nocobase', version: '2.1.29' },
  collections: [{ name: 't', records: [{ id: '1', value: NaN }] }],
};
const b: CanonicalSnapshot = {
  version: '1.0', exportedAt: '2026-07-22T00:00:00.000Z',
  source: { platform: 'nocobase', version: '2.1.29' },
  collections: [{ name: 't', records: [{ id: '1', value: NaN }] }],
};

// Act
const result = diffSnapshots(a, b);

// Assert
expect(result.match).toBe(false);
expect(result.diffs[0].field).toBe('value');
```

### Test 23: 元数据字段排除
```typescript
// Arrange
const a: CanonicalSnapshot = {
  version: '1.0', exportedAt: '2026-07-22T10:00:00.000Z',
  source: { platform: 'nocobase', version: '2.1.29' },
  collections: [{ name: 't', records: [{ id: '1' }] }],
};
const b: CanonicalSnapshot = {
  version: '1.0', exportedAt: '2026-07-22T11:30:00.000Z',  // different time
  source: { platform: 'nocobase', version: '2.1.30' },       // different version
  collections: [{ name: 't', records: [{ id: '1' }] }],
};

// Act
const result = diffSnapshots(a, b);

// Assert
expect(result.match).toBe(true); // metadata differences ignored
```

### Test 24: 跨快照记录数不匹配
```typescript
// Arrange
const a: CanonicalSnapshot = {
  version: '1.0', exportedAt: '2026-07-22T00:00:00.000Z',
  source: { platform: 'nocobase', version: '2.1.29' },
  collections: [{ name: 't', records: [{ id: '1' }, { id: '2' }] }],
};
const b: CanonicalSnapshot = {
  version: '1.0', exportedAt: '2026-07-22T00:00:00.000Z',
  source: { platform: 'nocobase', version: '2.1.29' },
  collections: [{ name: 't', records: [{ id: '1' }] }],
};

// Act
const result = diffSnapshots(a, b);

// Assert
expect(result.match).toBe(false);
expect(result.diffs.some(d => d.collection === 't')).toBe(true);
```

---

## 测试文件: `packages/migration-engine/src/import.test.ts`

### Test 25: 空 DB 导入成功
```typescript
// Arrange
const mockDb = createMockDb({ collections: {} });
const snapshot: CanonicalSnapshot = {
  version: '1.0', exportedAt: '2026-07-22T00:00:00.000Z',
  source: { platform: 'nocobase', version: '2.1.29' },
  collections: [
    { name: 'devices', records: [{ id: 'd1', name: 'Printer A' }] },
  ],
};

// Act
const result = await importFromCanonical(mockDb, snapshot);

// Assert
expect(result.imported).toBe(1);
expect(result.skipped).toBe(0);
expect(result.errors).toEqual([]);
```

### Test 26: 线性 FK 链按序导入
```typescript
// Arrange
const mockDb = createMockDb({ collections: {} });
const snapshot: CanonicalSnapshot = {
  version: '1.0', exportedAt: '2026-07-22T00:00:00.000Z',
  source: { platform: 'nocobase', version: '2.1.29' },
  collections: [
    { name: 'devices', records: [{ id: 'd1', name: 'Printer' }] },
    { name: 'print_jobs', records: [{ id: 'j1', name: 'Job', deviceId: 'd1' }] },
  ],
};
// Schema: devices has no FK, print_jobs has belongsTo devices

// Act
const result = await importFromCanonical(mockDb, snapshot);

// Assert
expect(result.imported).toBe(2);
expect(result.errors).toEqual([]);
const createdJob = mockDb.getRecord('print_jobs', 'j1');
expect(createdJob.deviceId).toBe('d1');
```

### Test 27: 自引用 FK multi-pass 成功
```typescript
// Arrange
const mockDb = createMockDb({ collections: {} });
const snapshot: CanonicalSnapshot = {
  version: '1.0', exportedAt: '2026-07-22T00:00:00.000Z',
  source: { platform: 'nocobase', version: '2.1.29' },
  collections: [
    { name: 'jobs', records: [
      { id: 'root', name: 'Root', parentJobId: null },
      { id: 'child', name: 'Child', parentJobId: 'root' },
    ]},
  ],
};

// Act — jobs is self-referencing, goes through multi-pass
const result = await importFromCanonical(mockDb, snapshot);

// Assert
expect(result.imported).toBe(2);
expect(mockDb.getRecord('jobs', 'child').parentJobId).toBe('root');
```

### Test 28: 循环 FK A→B B→A multi-pass 成功
```typescript
// Arrange
const mockDb = createMockDb({ collections: {} });
const snapshot: CanonicalSnapshot = {
  version: '1.0', exportedAt: '2026-07-22T00:00:00.000Z',
  source: { platform: 'nocobase', version: '2.1.29' },
  collections: [
    { name: 'a', records: [{ id: 'a1', bId: 'b1' }] },
    { name: 'b', records: [{ id: 'b1', aId: 'a1' }] },
  ],
};

// Act
const result = await importFromCanonical(mockDb, snapshot);

// Assert
expect(result.imported).toBe(2);
expect(result.errors).toEqual([]);
expect(mockDb.getRecord('a', 'a1').bId).toBe('b1');
expect(mockDb.getRecord('b', 'b1').aId).toBe('a1');
```

### Test 29: 事务错误回滚
```typescript
// Arrange
const mockDb = createMockDb({ collections: {} });
// Simulate: second collection insert fails on first record
mockDb.setFailOnInsert('broken', 'b1', new Error('constraint violation'));

const snapshot: CanonicalSnapshot = {
  version: '1.0', exportedAt: '2026-07-22T00:00:00.000Z',
  source: { platform: 'nocobase', version: '2.1.29' },
  collections: [
    { name: 'devices', records: [{ id: 'd1', name: 'Printer' }] },
    { name: 'broken', records: [{ id: 'b1' }] },
  ],
};

// Act
const result = await importFromCanonical(mockDb, snapshot);

// Assert
expect(result.imported).toBe(0);        // ROLLBACK → nothing persisted
expect(result.errors).toHaveLength(1);
expect(mockDb.hasRecord('devices', 'd1')).toBe(false); // rolled back
```

### Test 30: ImportResult 错误详情
```typescript
// Arrange
const mockDb = createMockDb({ collections: {} });
mockDb.setFailOnInsert('devices', 'd2', new Error('duplicate key'));

const snapshot: CanonicalSnapshot = {
  version: '1.0', exportedAt: '2026-07-22T00:00:00.000Z',
  source: { platform: 'nocobase', version: '2.1.29' },
  collections: [
    { name: 'devices', records: [
      { id: 'd1', name: 'Printer A' },
      { id: 'd2', name: 'Printer B' },
    ]},
  ],
};

// Act
const result = await importFromCanonical(mockDb, snapshot);

// Assert
expect(result.errors.some(e => e.recordId === 'd2')).toBe(true);
expect(result.errors[0].message).toContain('duplicate');
```

### Test 31: 重复 id → skipped
```typescript
// Arrange
const mockDb = createMockDb({ collections: {} });
// First import
await importFromCanonical(mockDb, snapshotWithDevice('d1'));

// Act — re-import same snapshot
const result = await importFromCanonical(mockDb, snapshotWithDevice('d1'));

// Assert
expect(result.skipped).toBeGreaterThan(0);
expect(result.errors.some(e => e.recordId === 'd1')).toBe(true);
```

### Test 32: NOT NULL FK: nullable pass 然后 UPDATE
```typescript
// Arrange
const mockDb = createMockDb({ collections: {} });
// print_jobs.deviceId is NOT NULL — multi-pass: INSERT with NULL, then UPDATE

const snapshot: CanonicalSnapshot = {
  version: '1.0', exportedAt: '2026-07-22T00:00:00.000Z',
  source: { platform: 'nocobase', version: '2.1.29' },
  collections: [
    { name: 'devices', records: [{ id: 'd1', name: 'Printer' }] },
    { name: 'print_jobs', records: [
      { id: 'j1', name: 'Job', deviceId: 'd1' },
    ]},
  ],
};

// Act — SET CONSTRAINTS ALL DEFERRED allows NULL during INSERT
const result = await importFromCanonical(mockDb, snapshot);

// Assert
expect(result.imported).toBe(2);
expect(mockDb.getRecord('print_jobs', 'j1').deviceId).toBe('d1');
```

---

## 测试文件: `packages/migration-engine/src/roundtrip.integration.test.ts`

### Test 33: 简单表往返（无 FK）
```typescript
// Arrange — 使用真实 PG 测试数据库（audebase_test）
const db = await setupTestDb();
await db.getCollection('materials').repository.create({
  values: { name: 'PLA Black', type: 'PLA', color: '#000000', diameter: 1.75, remainingWeight: 500 },
});

// Act
const snap1 = await exportToCanonical(db);
// 清空 → 导入
await db.getCollection('materials').repository.destroy({ filter: {} });
const importResult = await importFromCanonical(db, snap1);
// 再导出
const snap2 = await exportToCanonical(db);
// 对比
const diffResult = diffSnapshots(snap1, snap2);

// Assert
expect(importResult.imported).toBe(1);
expect(diffResult.match).toBe(true);
expect(diffResult.diffs).toEqual([]);
```

### Test 34: FK 关系往返
```typescript
// Arrange
const db = await setupTestDb();
await db.getCollection('devices').repository.create({ values: { name: 'Printer A', serialNumber: 'SN-001' } });
const device = await db.getCollection('devices').repository.findOne({ filter: { serialNumber: 'SN-001' } });
await db.getCollection('print_jobs').repository.create({
  values: { name: 'Job', deviceId: device.id },
});

// Act
const snap1 = await exportToCanonical(db);
await db.getCollection('print_jobs').repository.destroy({ filter: {} });
await db.getCollection('devices').repository.destroy({ filter: {} });
const importResult = await importFromCanonical(db, snap1);
const snap2 = await exportToCanonical(db);
const diffResult = diffSnapshots(snap1, snap2);

// Assert
expect(importResult.imported).toBeGreaterThanOrEqual(2);
expect(diffResult.match).toBe(true);
```

### Test 35: 自引用 FK 往返
```typescript
// Arrange
const db = await setupTestDb();
const root = await db.getCollection('jobs').repository.create({ values: { name: 'Root' } });
await db.getCollection('jobs').repository.create({ values: { name: 'Child', parentJobId: root.id } });

// Act
const snap1 = await exportToCanonical(db);
await db.getCollection('jobs').repository.destroy({ filter: {} });
const importResult = await importFromCanonical(db, snap1);
const snap2 = await exportToCanonical(db);
const diffResult = diffSnapshots(snap1, snap2);

// Assert
expect(importResult.imported).toBe(2);
expect(diffResult.match).toBe(true);
```

---

## 测试汇总

| # | 文件 | 场景 | 类型 |
|---|------|------|:---:|
| T1 | noco-base-tables.test.ts | 系统表被过滤 | 单元 |
| T2 | noco-base-tables.test.ts | 业务表不被过滤 | 单元 |
| T3 | noco-base-tables.test.ts | 未知表日志警告 | 单元 |
| T4 | noco-base-tables.test.ts | 大小写不敏感 | 单元 |
| T5 | topological-sort.test.ts | 线性依赖 A→B→C | 单元 |
| T6 | topological-sort.test.ts | 无依赖单批次 | 单元 |
| T7 | topological-sort.test.ts | 多根同批次并行 | 单元 |
| T8 | topological-sort.test.ts | 循环 → multi-pass | 单元 |
| T9 | topological-sort.test.ts | 自引用 → multi-pass | 单元 |
| T10 | topological-sort.test.ts | 菱形依赖 | 单元 |
| T11 | export.test.ts | 仅导出业务表 | 单元 |
| T12 | export.test.ts | 按名称过滤 | 单元 |
| T13 | export.test.ts | belongsTo 仅 FK | 单元 |
| T14 | export.test.ts | hasMany 独立 Collection | 单元 |
| T15 | export.test.ts | manyToMany 中间表 | 单元 |
| T16 | export.test.ts | 版本和源元数据 | 单元 |
| T17 | export.test.ts | 大数量分批不 OOM | 单元 |
| T18 | export.test.ts | createdAt < exportStartTime | 单元 |
| T19 | diff.test.ts | 相同 → match=true | 单元 |
| T20 | diff.test.ts | 单字段差异报告 | 单元 |
| T21 | diff.test.ts | 浮点容差 1e-10 | 单元 |
| T22 | diff.test.ts | NaN 标记差异 | 单元 |
| T23 | diff.test.ts | 元数据字段排除 | 单元 |
| T24 | diff.test.ts | 记录数不匹配 | 单元 |
| T25 | import.test.ts | 空 DB 导入 | 单元 |
| T26 | import.test.ts | 线性 FK 链 | 单元 |
| T27 | import.test.ts | 自引用 multi-pass | 单元 |
| T28 | import.test.ts | 循环 FK multi-pass | 单元 |
| T29 | import.test.ts | 事务回滚 | 单元 |
| T30 | import.test.ts | 错误详情 | 单元 |
| T31 | import.test.ts | 重复 id skipped | 单元 |
| T32 | import.test.ts | NOT NULL FK 延迟检查 | 单元 |
| T33 | roundtrip.test.ts | 简单表往返 | 集成 |
| T34 | roundtrip.test.ts | FK 关系往返 | 集成 |
| T35 | roundtrip.test.ts | 自引用 FK 往返 | 集成 |

**运行方式**:
```bash
# 单元测试（mock DB）
cd packages/migration-engine && npx vitest run --exclude '**/roundtrip*'

# 集成测试（需 PostgreSQL test DB）
DATABASE_URL=postgres://.../audebase_test npx vitest run src/roundtrip.integration.test.ts

# 全部（需 PostgreSQL）
DATABASE_URL=postgres://.../audebase_test npx vitest run
```
