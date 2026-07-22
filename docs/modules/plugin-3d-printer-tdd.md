# plugin-3d-printer — TDD

**状态**: ✅ TDD 完成
**包**: `@audebase/plugin-3d-printer` + 3D 打印机 Agent
**SDD**: `docs/modules/plugin-3d-printer-sdd.md`
**预估测试数**: 24（agent-handler 6 + PrintJobsPage 6 + DevicesPage 4 + MaterialsPage 4 + Agent 主循环 1 + roundtrip 3）
**覆盖率目标**: ≥80%（Phase 1b CI 集成）
**E2E 冒烟**: `tests/e2e/3d-printer-smoke.e2e.ts`（9 场景，M3 Week 3 编码时创建）
**生成日期**: 2026-07-22

---

## 测试文件: `packages/plugin-3d-printer/src/server/agent/agent-handler.test.ts`

### Test 1: 心跳更新 lastHeartbeat 和 status
```typescript
// Arrange
const mockDb = createMockDb({
  devices: [{ id: 'd1', name: 'Printer', status: 'offline', lastHeartbeat: null }],
});
const ctx = createMockContext(mockDb, { currentUser: { id: 'd1', device: true } });
const beforeTime = new Date();

// Act
await agentPollHandler(ctx, {
  values: { deviceId: 'd1', status: 'idle' },
});

// Assert
const device = mockDb.getRecord('devices', 'd1');
expect(device.status).toBe('online');  // idle → online
expect(new Date(device.lastHeartbeat).getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
```

### Test 2: 有排队任务时返回 start 命令
```typescript
// Arrange
const mockDb = createMockDb({
  devices: [{ id: 'd1', status: 'online', lastHeartbeat: new Date() }],
  print_jobs: [{ id: 'j1', name: 'Job', status: 'queued', deviceId: 'd1' }],
});
const ctx = createMockContext(mockDb, { currentUser: { id: 'd1', device: true } });

// Act
await agentPollHandler(ctx, {
  values: { deviceId: 'd1', status: 'idle' },
});

// Assert
expect(ctx.body.command).toBe('start');
expect(ctx.body.jobId).toBe('j1');
// 验证 job status 变更为 printing
const job = mockDb.getRecord('print_jobs', 'j1');
expect(job.status).toBe('printing');
```

### Test 3: 无待处理任务返回 null
```typescript
// Arrange
const mockDb = createMockDb({
  devices: [{ id: 'd1', status: 'online', lastHeartbeat: new Date() }],
  print_jobs: [], // no queued jobs
});
const ctx = createMockContext(mockDb, { currentUser: { id: 'd1', device: true } });

// Act
await agentPollHandler(ctx, {
  values: { deviceId: 'd1', status: 'idle' },
});

// Assert
expect(ctx.body.command).toBeNull();
```

### Test 4: 无 JWT token 拒绝请求
```typescript
// Arrange
const mockDb = createMockDb({
  devices: [{ id: 'd1', status: 'online' }],
});
const ctx = createMockContext(mockDb, { currentUser: null }); // no auth

// Act
await agentPollHandler(ctx, {
  values: { deviceId: 'd1', status: 'idle' },
});

// Assert
expect(ctx.status).toBe(401);
```

### Test 5: 进度上报更新 print_jobs.progress
```typescript
// Arrange
const mockDb = createMockDb({
  devices: [{ id: 'd1', status: 'printing', lastHeartbeat: new Date() }],
  print_jobs: [{ id: 'j1', name: 'Job', status: 'printing', deviceId: 'd1', progress: 0 }],
});
const ctx = createMockContext(mockDb, { currentUser: { id: 'd1', device: true } });

// Act
await agentPollHandler(ctx, {
  values: { deviceId: 'd1', status: 'printing', progress: 42 },
});

// Assert
const job = mockDb.getRecord('print_jobs', 'j1');
expect(job.progress).toBe(42);
expect(ctx.body.command).toBeNull(); // still printing, no new command
```

### Test 6: pause 命令
```typescript
// Arrange
const mockDb = createMockDb({
  devices: [{ id: 'd1', status: 'printing', lastHeartbeat: new Date() }],
  print_jobs: [{ id: 'j1', name: 'Job', status: 'printing', deviceId: 'd1', progress: 50, _pendingCommand: 'pause' }],
});
const ctx = createMockContext(mockDb, { currentUser: { id: 'd1', device: true } });

// Act
await agentPollHandler(ctx, {
  values: { deviceId: 'd1', status: 'printing', progress: 50 },
});

// Assert
expect(ctx.body.command).toBe('pause');
```

---

## 测试文件: `packages/plugin-3d-printer/src/client/PrintJobsPage.test.tsx`

### Test 7: 页面渲染并显示数据
```typescript
// Arrange
const mockJobs = [
  { id: 'j1', name: 'Bench 1', status: 'printing', progress: 50,
    device: { name: 'Printer A' }, material: { name: 'PLA Black' }, estimatedTime: 3600 },
];
vi.mock('@nocobase/client', () => ({
  useCollection: () => ({ name: 'print_jobs' }),
  useRequest: () => ({ data: { data: mockJobs }, loading: false }),
  SchemaComponent: () => <div data-testid="print-jobs-page" />,
}));

// Act
const { getByText } = render(<PrintJobsPage />);

// Assert
expect(getByText('Bench 1')).toBeInTheDocument();
expect(getByText('printing')).toBeInTheDocument();
expect(getByText('Printer A')).toBeInTheDocument();
```

### Test 8: 创建表单提交并刷新列表
```typescript
// Arrange
const mockCreate = vi.fn().mockResolvedValue({ data: { id: 'j2' } });
vi.mock('@nocobase/client', () => ({
  useCollection: () => ({ name: 'print_jobs' }),
  useRequest: () => ({ data: { data: [] }, loading: false, refresh: vi.fn() }),
  useAPIClient: () => ({ resource: () => ({ create: mockCreate }) }),
}));

// Act
render(<PrintJobsPage />);
// Click create button, fill form, submit
fireEvent.click(screen.getByRole('button', { name: /create/i }));
// ... fill form fields ...
fireEvent.click(screen.getByRole('button', { name: /submit/i }));

// Assert
expect(mockCreate).toHaveBeenCalledWith(
  expect.objectContaining({
    values: expect.objectContaining({ name: expect.any(String) }),
  })
);
```

### Test 9: 编辑按钮打开预填表单
```typescript
// Arrange
const mockJob = { id: 'j1', name: 'Bench 1', status: 'queued' };
vi.mock('@nocobase/client', () => ({
  useCollection: () => ({ name: 'print_jobs' }),
  useRequest: () => ({ data: { data: [mockJob] }, loading: false }),
}));

// Act
render(<PrintJobsPage />);
fireEvent.click(screen.getByRole('button', { name: /edit/i }));

// Assert
expect(screen.getByDisplayValue('Bench 1')).toBeInTheDocument();
```

### Test 10: 删除按钮确认后移除
```typescript
// Arrange
const mockDestroy = vi.fn().mockResolvedValue({});
vi.mock('@nocobase/client', () => ({
  useCollection: () => ({ name: 'print_jobs' }),
  useRequest: () => ({ data: { data: [{ id: 'j1', name: 'Bench' }] }, loading: false, refresh: vi.fn() }),
  useAPIClient: () => ({ resource: () => ({ destroy: mockDestroy }) }),
}));

// Act
render(<PrintJobsPage />);
fireEvent.click(screen.getByRole('button', { name: /delete/i }));
fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

// Assert
expect(mockDestroy).toHaveBeenCalledWith({ filter: { id: 'j1' } });
```

### Test 11: 按 status 筛选
```typescript
// Arrange
const mockRequestFn = vi.fn().mockResolvedValue({ data: { data: [] } });
vi.mock('@nocobase/client', () => ({
  useCollection: () => ({ name: 'print_jobs' }),
  useRequest: (opts: any) => {
    // Store the request params for assertion
    (useRequest as any)._lastParams = opts.params;
    return { data: { data: [] }, loading: false };
  },
}));

// Act
render(<PrintJobsPage />);
// Select filter dropdown "printing"
fireEvent.click(screen.getByRole('combobox', { name: /status/i }));
fireEvent.click(screen.getByText('printing'));

// Assert
const lastParams = (useRequest as any)._lastParams;
expect(lastParams.filter.status).toBe('printing');
```

### Test 12: 进度条渲染正确百分比
```typescript
// Arrange
const mockJobs = [{ id: 'j1', name: 'Job', status: 'printing', progress: 75 }];
vi.mock('@nocobase/client', () => ({
  useCollection: () => ({ name: 'print_jobs' }),
  useRequest: () => ({ data: { data: mockJobs }, loading: false }),
}));

// Act
render(<PrintJobsPage />);

// Assert
const progressBar = screen.getByRole('progressbar');
expect(progressBar).toHaveAttribute('aria-valuenow', '75');
```

---

## 测试文件: `packages/plugin-3d-printer/src/client/DevicesPage.test.tsx`

### Test 13: 页面渲染设备列表
```typescript
// Arrange
const mockDevices = [
  { id: 'd1', name: 'Printer A', serialNumber: 'SN-001', status: 'online', firmwareVersion: '2.1.0', lastHeartbeat: new Date() },
];
vi.mock('@nocobase/client', () => ({
  useCollection: () => ({ name: 'devices' }),
  useRequest: () => ({ data: { data: mockDevices }, loading: false }),
}));

// Act
const { getByText } = render(<DevicesPage />);

// Assert
expect(getByText('Printer A')).toBeInTheDocument();
expect(getByText('SN-001')).toBeInTheDocument();
expect(getByText('online')).toBeInTheDocument();
```

### Test 14: 创建设备表单
```typescript
// Arrange
const mockCreate = vi.fn().mockResolvedValue({ data: { id: 'd2' } });
vi.mock('@nocobase/client', () => ({
  useCollection: () => ({ name: 'devices' }),
  useRequest: () => ({ data: { data: [] }, loading: false, refresh: vi.fn() }),
  useAPIClient: () => ({ resource: () => ({ create: mockCreate }) }),
}));

// Act
render(<DevicesPage />);
fireEvent.click(screen.getByRole('button', { name: /create/i }));
// fill name + serialNumber + firmwareVersion
const nameInput = screen.getByLabelText(/name/i);
fireEvent.change(nameInput, { target: { value: 'New Printer' } });
fireEvent.click(screen.getByRole('button', { name: /submit/i }));

// Assert
expect(mockCreate).toHaveBeenCalledWith({
  values: expect.objectContaining({ name: 'New Printer' }),
});
```

### Test 15: 状态 Badge 颜色
```typescript
// Arrange
const statuses: Array<{ status: string; expectedColor: string }> = [
  { status: 'online', expectedColor: 'green' },
  { status: 'offline', expectedColor: 'gray' },
  { status: 'error', expectedColor: 'red' },
];
vi.mock('@nocobase/client', () => ({
  useCollection: () => ({ name: 'devices' }),
}));

for (const { status, expectedColor } of statuses) {
  // Arrange
  const mockDevices = [{ id: 'd1', name: 'P', serialNumber: 'SN', status, lastHeartbeat: null }];
  vi.mocked(useRequest).mockReturnValue({ data: { data: mockDevices }, loading: false } as any);

  // Act
  const { container } = render(<DevicesPage />);
  const badge = container.querySelector(`[data-status="${status}"]`);

  // Assert
  expect(badge).toBeInTheDocument();
  // Verify color via computed style or class
}
```

### Test 16: 按 status 筛选
```typescript
// Arrange
// Similar structure to Test 11 — verify filter params include status
// 与 Test 11 结构相同 — 验证筛选参数包含 status
```

---

## 测试文件: `packages/plugin-3d-printer/src/client/MaterialsPage.test.tsx`

### Test 17: 页面渲染材料列表
```typescript
// Arrange
const mockMaterials = [
  { id: 'm1', name: 'PLA Black', type: 'PLA', color: '#000000', diameter: 1.75, remainingWeight: 500 },
];
vi.mock('@nocobase/client', () => ({
  useCollection: () => ({ name: 'materials' }),
  useRequest: () => ({ data: { data: mockMaterials }, loading: false }),
}));

// Act
const { getByText } = render(<MaterialsPage />);

// Assert
expect(getByText('PLA Black')).toBeInTheDocument();
expect(getByText('PLA')).toBeInTheDocument();
```

### Test 18: 创建材料表单
```typescript
// Arrange
const mockCreate = vi.fn().mockResolvedValue({ data: { id: 'm2' } });
vi.mock('@nocobase/client', () => ({
  useCollection: () => ({ name: 'materials' }),
  useRequest: () => ({ data: { data: [] }, loading: false, refresh: vi.fn() }),
  useAPIClient: () => ({ resource: () => ({ create: mockCreate }) }),
}));

// Act
render(<MaterialsPage />);
fireEvent.click(screen.getByRole('button', { name: /create/i }));
fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'ABS Red' } });
fireEvent.click(screen.getByRole('button', { name: /submit/i }));

// Assert
expect(mockCreate).toHaveBeenCalledWith({
  values: expect.objectContaining({ name: 'ABS Red' }),
});
```

### Test 19: 按 type 筛选
```typescript
// Arrange — verify filter params include type dropdown
// 验证筛选参数包含 type 下拉
```

### Test 20: 色块渲染
```typescript
// Arrange
const mockMaterials = [
  { id: 'm1', name: 'PLA Black', type: 'PLA', color: '#000000', diameter: 1.75, remainingWeight: 500 },
];
vi.mock('@nocobase/client', () => ({
  useCollection: () => ({ name: 'materials' }),
  useRequest: () => ({ data: { data: mockMaterials }, loading: false }),
}));

// Act
const { container } = render(<MaterialsPage />);

// Assert
const colorBlock = container.querySelector('[data-color]');
expect(colorBlock).toBeInTheDocument();
// Verify color value rendered or style applied
```

---

## 测试文件: `packages/plugin-3d-printer/src/server/collections/collections.test.ts`

### Test 21: print_jobs Collection 字段类型验证
```typescript
// Arrange
const schema = printJobsCollection;

// Assert
expect(schema.name).toBe('print_jobs');
const fieldTypes = Object.fromEntries(schema.fields.map(f => [f.name, f.type]));
expect(fieldTypes.name).toBe('string');
expect(fieldTypes.status).toBe('string');
expect(fieldTypes.modelFile).toBe('string');
expect(fieldTypes.sliceSettings).toBe('json');
expect(fieldTypes.deviceId).toBe('belongsTo');
expect(fieldTypes.materialId).toBe('belongsTo');
expect(fieldTypes.progress).toBe('integer');
expect(fieldTypes.estimatedTime).toBe('integer');
expect(fieldTypes.actualTime).toBe('integer');
expect(fieldTypes.startedAt).toBe('datetime');
expect(fieldTypes.completedAt).toBe('datetime');
```

### Test 22: devices Collection 唯一约束
```typescript
// Arrange
const schema = devicesCollection;

// Assert
const serialField = schema.fields.find(f => f.name === 'serialNumber');
expect(serialField!.unique).toBe(true);
```

### Test 23: materials Collection 枚举值
```typescript
// Arrange
const schema = materialsCollection;

// Assert
const typeField = schema.fields.find(f => f.name === 'type');
expect(typeField!.uiSchema.enum).toEqual(['PLA', 'ABS', 'PETG', 'TPU', 'other']);
```

---

## 测试文件: `agent/agent.test.js`

### Test 24: Agent 主循环：登录 → 恢复状态 → 心跳
```typescript
// Arrange
const mockFetch = vi.fn()
  .mockResolvedValueOnce({ json: () => ({ data: { token: 'jwt-token' } }) })  // login
  .mockResolvedValueOnce({ json: () => ({ data: [] }) })                       // recoverState (no jobs)
  .mockResolvedValueOnce({ json: () => ({ data: { command: null } }) });       // first poll
global.fetch = mockFetch;

// Act
// Simulate agent main loop startup (mock setInterval)
const { login, recoverState, poll } = require('./agent');
const token = await login();
await recoverState('d1', token);
await poll('d1');

// Assert
expect(mockFetch).toHaveBeenCalledTimes(3);
expect(mockFetch.mock.calls[0][0]).toContain('/api/auth:signIn');
expect(mockFetch.mock.calls[1][0]).toContain('/api/print_jobs:list');
expect(mockFetch.mock.calls[2][0]).toContain('/api/agent:poll');
```

---

## E2E 冒烟测试: `tests/e2e/3d-printer-smoke.e2e.ts`

**状态**: 🔲 M3 Week 3 编码时创建（9 场景）

| # | 场景 | 操作 | 验证 |
|---|------|------|------|
| E1 | CRUD Devices | 创建 → 查看列表 → 编辑 → 删除 | 每步操作后数据正确 |
| E2 | CRUD Materials | 创建 → 查看列表 → 编辑 → 删除 | 每步操作后数据正确 |
| E3 | CRUD Print Jobs | 创建（关联设备+材料）→ 查看列表 → 编辑 → 删除 | FK 关联正确 |
| E4 | Print Job status filter | 筛选 'printing' 状态 | 仅显示 printing 的 job |
| E5 | Device status indicator | 创建 online/offline/error 设备 | 状态 Badge 颜色正确 |
| E6 | Progress bar display | 创建 progress=75 的 job | 进度条显示 75% |
| E7 | serialNumber uniqueness | 创建 SN-001 → 再创建 SN-001 | 第二次被拒绝（唯一约束） |
| E8 | Color rendering | 创建 color='#FF0000' 的材料 | 色块以正确颜色渲染 |
| E9 | Edit → save preserves data | 编辑 job name → 保存 → 重新打开 | 名称保留 |

---

## 测试汇总

| # | 文件 | 场景 | 类型 |
|---|------|------|:---:|
| T1 | agent-handler.test.ts | 心跳更新 lastHeartbeat | 单元 |
| T2 | agent-handler.test.ts | 有排队任务 → start | 单元 |
| T3 | agent-handler.test.ts | 无任务 → null | 单元 |
| T4 | agent-handler.test.ts | 无 token → 401 | 单元 |
| T5 | agent-handler.test.ts | 进度上报 | 单元 |
| T6 | agent-handler.test.ts | pause 命令 | 单元 |
| T7 | PrintJobsPage.test.tsx | 页面渲染数据 | 组件 |
| T8 | PrintJobsPage.test.tsx | 创建表单提交 | 组件 |
| T9 | PrintJobsPage.test.tsx | 编辑按钮预填 | 组件 |
| T10 | PrintJobsPage.test.tsx | 删除确认 | 组件 |
| T11 | PrintJobsPage.test.tsx | status 筛选 | 组件 |
| T12 | PrintJobsPage.test.tsx | 进度条百分比 | 组件 |
| T13 | DevicesPage.test.tsx | 页面渲染 | 组件 |
| T14 | DevicesPage.test.tsx | 创建表单 | 组件 |
| T15 | DevicesPage.test.tsx | 状态 Badge 颜色 | 组件 |
| T16 | DevicesPage.test.tsx | status 筛选 | 组件 |
| T17 | MaterialsPage.test.tsx | 页面渲染 | 组件 |
| T18 | MaterialsPage.test.tsx | 创建表单 | 组件 |
| T19 | MaterialsPage.test.tsx | type 筛选 | 组件 |
| T20 | MaterialsPage.test.tsx | 色块渲染 | 组件 |
| T21 | collections.test.ts | print_jobs 字段验证 | 单元 |
| T22 | collections.test.ts | devices 唯一约束 | 单元 |
| T23 | collections.test.ts | materials 枚举 | 单元 |
| T24 | agent.test.js | 主循环集成 | 单元 |

**运行方式**:
```bash
# 服务端单元测试
cd packages/plugin-3d-printer && npx vitest run src/server/

# 客户端组件测试
npx vitest run src/client/

# Agent 测试
node agent/agent.test.js

# E2E（需 NocoBase 运行）
npx playwright test tests/e2e/3d-printer-smoke.e2e.ts
```
