---
name: test-harness
description: "AUDEBase TypeScript/Vitest 自动化测试工具架。从 SDD 规范生成测试骨架、AAA 模式强制执行、测试→规范反向追溯、覆盖率报告。交互式菜单驱动。支持 Phase 感知 (跳过未就绪模块)。"
---

# 测试工具架 (Test Harness)

为 AUDEBase TypeScript monorepo 提供自动化测试生成与验证。从 SDD 规范直接产出测试代码，确保 AAA 模式、Phase 对齐、TS 惯例一致。

**哲学**: 测试不是写完代码再补的东西，是从规范直接长出来的。一个好测试文件 = 规范的可执行副本。

---

## 入口：测试任务类型

### `/test-harness`（无参数）
弹出任务类型菜单：

```
[1] SDD→测试 — 从规范生成测试文件 (stubs / AAA骨架 / 完整填充)
[2] 测试→规范 — 反向追溯 (验证覆盖 / 缺失场景)
[3] 用例执行 — 运行测试并修复失败用例
[4] 增量测试 — 从当前 git diff 产生增量测试
[5] 项目初始化 — 为新模块搭建测试基础设施
[6] 覆盖率报告 — 生成覆盖分析与缺口
[7] 选择性测试 — 仅运行变更影响的测试 (git diff 驱动)
```

### `/test-harness generate`
跳过菜单，直接进入 SDD→测试生成模式。

### `/test-harness run`
跳过菜单，直接运行测试。

### `/test-harness quick`
仅修复当前失败的测试，不生成新测试。

---

## TypeScript/Vitest 测试惯例

AUDEBase 为 TypeScript monorepo，测试框架为 Vitest。

- **单元测试**: `*.test.ts` 或 `*.spec.ts` 与源文件同目录 或 `src/__tests__/`
- **集成测试**: `tests/` 目录
- **E2E 测试**: Playwright，`*.spec.ts`
- **Mock**: `vi.mock()` (模块级别)、`vi.stubGlobal()` (全局对象)、`vi.fn()` (函数)
- **断言**: `expect(x).toBe(y)` / `expect(x).toEqual(y)` / `expect(x).toMatchObject(y)`
- **运行**: `pnpm --filter <package> test` 或 `pnpm test`（全量）
- **Admin UI 环境**: `happy-dom`（已从 jsdom 迁移），jest-dom matchers
- **组件测试**: `@testing-library/react` + `render()`
- **API 测试**: Fastify `app.inject()` 方法
- **惯例**:
  - `describe('ModuleName', () => { it('should ...', () => { ... }) })`
  - AAA 注释: `// Arrange` / `// Act` / `// Assert`
  - 测试隔离：seed factory + transaction rollback
  - 禁止 `console.log` — 使用 pino 结构化日志

---

## 工作流

### 模式 1: SDD → 测试生成

#### 生成层级 (每次询问)

1. **stubs**: 仅 `it('should ...')` + `expect.fail('not implemented')` — 编译通过，测试失败
2. **AAA 骨架**: Arrange/Act/Assert 注释 + 占位 → 结构就绪，断言待填
3. **完整填充**: 从规范提取具体值，断言完整可运行 — 预期直接通过

#### Step 1: 识别规范源

自动扫描 `docs/modules/` 目录中的 SDD 和 TDD 文档：
```
docs/modules/
├── plugin-framework-sdd.md      → PluginManager API 接口
├── plugin-framework-tdd.md      → PluginManager 测试计划
├── rbac-sdd.md                  → PermissionEngine API 接口
├── rbac-tdd.md                  → PermissionEngine 测试计划
├── migration-engine-sdd.md      → Scanner/Resolver/Executor 接口
├── migration-engine-tdd.md      → 迁移引擎测试计划
├── audit-sdd.md / audit-tdd.md
├── i18n-sdd.md / i18n-tdd.md
├── health-check-sdd.md / health-check-tdd.md
├── logging-infra-sdd.md / logging-tdd.md
├── admin-ui-sdd.md / admin-ui-tdd.md
└── ...
```

让用户选择规范文件 (单选或多选)。

#### Step 2: Phase 感知过滤

读取 `docs/phase-planning.md`，判定当前 Phase 模块状态。

自动过滤规范项：
- 当前 Phase 未就绪的模块 → 标记 ⏭️ 跳过，生成注释说明
- Phase 1a 模块 → 优先生成，完整填充
- Phase 1b/2/4 模块 → stubs 或 AAA 骨架

#### Step 3: 生成测试文件

对每个规范项，生成 TypeScript 测试函数：

```typescript
// 来源: docs/modules/rbac-sdd.md §PermissionEngine.checkPermission
describe('PermissionEngine', () => {
  it('should grant access when user has matching permission', async () => {
    // Arrange
    const engine = new PermissionEngine();
    const user = { id: 'u1', roles: ['admin'] };
    const action = 'users:read';

    // Act
    const result = await engine.checkPermission(user, action);

    // Assert
    expect(result).toBe(true);
  });
});
```

#### Step 4: 写入并验证

1. 写入测试文件到 `packages/<module>/src/__tests__/`
2. 运行编译检查 (`pnpm --filter <package> exec tsc --noEmit`)
3. 运行测试 (`pnpm --filter <package> test -- --run`)
4. 报告: `生成 N 个测试函数 → M 通过 / K 失败 / P 跳过`

---

### 模式 2: 测试 → 规范反向追溯

检查现有测试覆盖，与 SDD 规范交叉比对：

1. 扫描所有测试文件
2. 提取测试函数名 → 映射到规范定义
3. 产生覆盖矩阵:

```
模块              | 规范项      | 测试函数                     | 状态
-----------------|------------|----------------------------|------
plugin-framework | PluginManager.load() | test_plugin_load_success | ✅
plugin-framework | PluginManager.unload() | test_plugin_unload_success | ✅
plugin-framework | PluginManager.getPlugin() | —                       | ❌ 缺失
rbac             | checkPermission   | test_rbac_check_perm_basic  | ⚠️ 不完整
```

4. 标记:
   - ❌ 缺失 → 推荐从 SDD 生成
   - ⚠️ 不完整 → 边界条件未覆盖
   - ✅ 完整

---

### 模式 3: 用例执行与修复

1. 运行 `pnpm test -- --run`
2. 收集失败列表
3. 对每个失败:
   - 读取测试源码
   - 读取对应实现源码
   - 判定根因: 测试错误 vs 实现错误
   - 自动修复测试错误 (错误断言、缺失 mock)
   - 标记实现错误 → 报告给用户

**根因判定规则**:
- 测试函数逻辑与规范不一致 → 测试错误
- 断言值错误 (期望 X 但规范说应为 Y) → 测试错误
- 实现未完成 / 接口变更 → 实现错误

**绝不**: 修改实现代码来让测试通过 (除非用户明确要求)。

---

### 模式 4: 增量测试

从 `git diff` 识别变更 → 生成对应测试：

1. `git diff --name-only` 获取变更文件
2. 反向映射到 SDD 规范 (文件路径 → 模块 → 规范接口)
3. 仅对变更相关的规范生成增量测试
4. 如果变更文件还没有测试 → 初始化测试文件

---

### 模式 5: 项目初始化

为新模块创建 TypeScript 测试基础设施:

- `vitest.config.ts` (如不存在)
- `src/__tests__/` 目录
- test setup 文件: `import '@testing-library/jest-dom/vitest'`
- `package.json` 中 `"test": "vitest run"` 脚本

---

### 模式 6: 覆盖率报告

1. 运行 `pnpm test:coverage`（或 `pnpm --filter <package> test -- --coverage`）
2. 按模块聚合并展示:

```
模块                | 行覆盖    | 分支覆盖   | 规范覆盖
-------------------|----------|----------|----------
plugin-framework   | 92%      | 85%      | 28/30
rbac               | 78%      | 71%      | 22/30
migration-engine   | 65%      | 58%      | 18/24
───────────────────|──────────|──────────|────────
总计               | 81%      | 74%      | 102/121
```

3. 缺口排序: 未覆盖规范项 / 低分支覆盖函数
4. 推荐: 优先补充的 N 项测试

---

### 模式 7: 选择性测试运行 (Selective Test Runner)

从 `git diff` 识别变更 → 仅运行受影响的测试：

1. `git diff --name-only HEAD` 获取变更文件
2. 映射文件到测试目标:

| 变更路径匹配 | 测试命令 |
|---|---|
| `packages/kernel/` | `pnpm --filter @audebase/kernel test -- --run` |
| `packages/admin-ui/` | `pnpm --filter @audebase/admin-ui test -- --run` |
| `packages/shared-types/` | `pnpm --filter @audebase/shared-types test -- --run` |
| 跨 package (3+) | `pnpm test -- --run` |

3. 运行测试（一次一个 package，避免锁冲突）
4. 报告: package / 命令 / 测试数 / 通过 / 失败 / 耗时

**绝不**: 同时运行多个 `pnpm test` package。不诊断失败 — 仅报告。>5 package 变更 → 建议 `pnpm test -- --run`。

---

## AUDEBase 特定测试模式

### PluginHost Mock 测试

```typescript
// Arrange
const mockHost = {
  loadPlugin: vi.fn().mockResolvedValue(undefined),
  unloadPlugin: vi.fn().mockResolvedValue(undefined),
  getPlugin: vi.fn().mockReturnValue({ name: 'test', version: '1.0.0' }),
};

// Act
await mockHost.loadPlugin('test-plugin');

// Assert
expect(mockHost.loadPlugin).toHaveBeenCalledWith('test-plugin');
```

### Zod Schema 验证测试

```typescript
import { userSchema } from '../schemas';

it('should reject invalid email', () => {
  // Arrange
  const input = { email: 'not-an-email', age: 25 };

  // Act & Assert
  expect(() => userSchema.parse(input)).toThrow();
});
```

### Admin UI 组件测试 (happy-dom)

```typescript
import { render, screen } from '@testing-library/react';
import { UserCard } from '../UserCard';

it('should display user name', () => {
  // Arrange
  const user = { id: '1', email: 'test@example.com' };

  // Act
  render(<UserCard user={user} />);

  // Assert
  expect(screen.getByText('test@example.com')).toBeInTheDocument();
});
```

### API 端点测试 (Fastify inject)

```typescript
it('should return 401 without auth token', async () => {
  // Arrange
  const app = buildApp();

  // Act
  const response = await app.inject({
    method: 'GET',
    url: '/api/users',
  });

  // Assert
  expect(response.statusCode).toBe(401);
});
```

---

## 交互模式

所有测试生成操作在写入文件前展现 diff 预览，由用户确认：

```
将生成以下变更:
  packages/rbac/src/__tests__/permission-engine.test.ts +85 (新文件, 12 测试)
  packages/rbac/src/__tests__/rbac-guard.test.ts +45 (新文件, 6 测试)

总计: 2 文件, +130 行, 18 测试函数

执行? [Y/n]
```

---

## Phase 感知规则

自动读取 `docs/phase-planning.md` 确认当前阶段。

| 检查点 | 行为 |
|--------|------|
| 模块尚未实现 (🔲) | 生成 stub 或跳过，标注 "⏭️ Phase 1b/2" |
| Phase 1a 模块 | 完整填充 + 断言 |
| Phase 1b 模块 | AAA 骨架 |
| Phase 2+ 模块 | stub 占位 |

---

## 质量规则

1. **每个测试一个断言目标** — 一个 test 函数验证一个规范项
2. **AAA 注释必须显式** — `// Arrange` / `// Act` / `// Assert` 不可省略
3. **不修改测试让实现通过** — 规范 > 测试 > 实现 (优先级)
4. **禁止 as any / @ts-ignore** — 测试中也避免
5. **边界条件优先** — 规范中边界条件 → 独立测试
6. **命名可追溯** — 测试函数名体现被测试行为
7. **Phase 对齐** — 不生成当前 Phase 无法运行的测试

---

## 快速参考

```
/test-harness               → 选择任务类型
/test-harness generate      → SDD→测试生成
/test-harness run           → 运行并修复测试
/test-harness trace         → 测试→规范反向追溯
/test-harness incremental   → 增量测试 (git diff)
/test-harness init          → 初始化测试基础设施
/test-harness coverage      → 覆盖率报告
/test-harness selective    → 选择性测试运行 (git diff)
```

### 命令速查

| 操作 | 命令 |
|------|------|
| 单 package 测试 | `pnpm --filter @audebase/<pkg> test -- --run` |
| 全量测试 | `pnpm test -- --run` |
| 覆盖率 | `pnpm test:coverage` |
| 单文件测试 | `pnpm --filter @audebase/<pkg> test -- --run path/to/test.test.ts` |
| Admin UI 测试 | `pnpm --filter @audebase/admin-ui test -- --run --environment happy-dom` |
