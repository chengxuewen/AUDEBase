# canonical-schema — SDD

**状态**: ✅ SDD 完成
**包**: `@audebase/canonical-schema`
**参考**: `docs/superpowers/specs/2026-07-22-phase1a-execution-plan.md` §3.1, D25.6.8, D8
**生成日期**: 2026-07-22

---

## 1. 概要

**职责边界**: 定义 Canonical Schema 的平台无关数据格式。提供 TypeScript 类型定义和 Zod 运行时验证 schema。

**设计目标**:
- 零运行时依赖（仅 devDep: typescript, zod）
- CanonicalSnapshot 是 AUDEBase 数据可移植层的核心契约
- 所有系统边界使用 Zod 验证（D8）
- TS 类型从 Zod schema 推导，保持单一真实来源

**不在范围内**:
- 数据序列化/反序列化逻辑（属于 migration-engine）
- 数据迁移策略（属于 migration-engine）
- 任何运行时 I/O 操作

## 2. 接口定义

### 2.1 核心类型 (`src/types.ts`)

```typescript
/** 单条规范化记录。id 必需，其余字段任意。 */
interface CanonicalRecord {
  id: string;
  [field: string]: unknown;
}

/** 一个 Collection 的完整数据集 */
interface CanonicalCollection {
  name: string;
  records: CanonicalRecord[];
}

/** 规范化快照 — 平台无关的数据导出格式 */
interface CanonicalSnapshot {
  version: '1.0';
  exportedAt: string;       // ISO 8601
  source: {
    platform: 'nocobase';   // 扩展点：未来支持 'odoo', 'strapi' 等
    version: string;        // 源平台版本号，如 '2.1.29'
  };
  collections: CanonicalCollection[];
}
```

### 2.2 Zod 验证 schema (`src/schema.ts`)

```typescript
import { z } from 'zod';

export const CanonicalRecordSchema = z.object({
  id: z.string(),
}).passthrough();

export const CanonicalCollectionSchema = z.object({
  name: z.string(),
  records: z.array(CanonicalRecordSchema),
});

export const CanonicalSnapshotSchema = z.object({
  version: z.literal('1.0'),
  exportedAt: z.string().datetime(),
  source: z.object({
    platform: z.enum(['nocobase']),
    version: z.string(),
  }),
  collections: z.array(CanonicalCollectionSchema),
});

// 从 Zod schema 推导 TS 类型（单一真实来源）
export type CanonicalRecord = z.infer<typeof CanonicalRecordSchema>;
export type CanonicalCollection = z.infer<typeof CanonicalCollectionSchema>;
export type CanonicalSnapshot = z.infer<typeof CanonicalSnapshotSchema>;
```

### 2.3 导出清单 (`src/index.ts`)

```typescript
export type { CanonicalRecord, CanonicalCollection, CanonicalSnapshot } from './types';
export { CanonicalRecordSchema, CanonicalCollectionSchema, CanonicalSnapshotSchema } from './schema';
```

## 3. 生命周期

**N/A** — 纯类型 + 验证包，无运行时生命周期。

包本身不启动、不连接外部服务。仅在 import 时提供类型检查和 Zod schema 供调用方使用。

## 4. 依赖关系

| 依赖 | 类型 | 版本 | 用途 |
|------|:---:|------|------|
| typescript | devDep | ^5.x | 编译期类型检查 |
| zod | devDep | ^3.x | 运行时 schema 验证 |
| vitest | devDep | ^3.x | 单元测试 |

**零 runtime 依赖** — 包本身不引入任何运行时 npm 包。Zod 的 `z.infer<>` 是纯类型操作，不产生运行时代码。

**被依赖方**: `@audebase/migration-engine` — export/import/diff 模块消费 CanonicalSnapshot 类型和 CanonicalSnapshotSchema 验证器。

## 5. 错误码与错误处理

| 错误码 | 触发条件 | 恢复策略 |
|--------|---------|---------|
| `ZOD_VALIDATION_ERROR` | `CanonicalSnapshotSchema.parse()` 失败 | 返回 ZodError，调用方决定处理方式 |
| `TYPE_ERROR` (编译期) | TS 类型不匹配 | 编译失败，需修复类型 |

Zod 验证错误包含路径和消息，例如：
```json
{
  "code": "invalid_type",
  "path": ["collections", 0, "name"],
  "message": "Required"
}
```

## 6. 安全考虑

| 安全点 | 措施 |
|--------|------|
| 输入验证 | Zod schema 在边界层强制验证 CanonicalSnapshot 结构 |
| 注入防护 | TypeScript 类型不可执行，Zod `.parse()` 不会 eval |
| 数据签名 | Phase 1a 不做签名。Phase 2+ 可加 `signature: string` 字段防止篡改 |
| 敏感数据 | `CanonicalRecord` 的 `[field: string]: unknown` 对字段值不做假设，不暴露敏感字段元数据 |
| D8 合规 | 所有系统边界使用 Zod 验证 — `CanonicalSnapshotSchema.parse()` 满足 D8 要求 |

## 7. Mock 约束

**N/A** — canonical-schema 无外部依赖，无需 mock。

测试直接构造 `CanonicalSnapshot` 对象并调用 `CanonicalSnapshotSchema.parse()` 或 `CanonicalSnapshotSchema.safeParse()`。

## 8. 变更记录

| 日期 | 版本 | 变更 | 作者 |
|------|------|------|------|
| 2026-07-22 | 1.0 | 初始 SDD：CanonicalRecord + CanonicalCollection + CanonicalSnapshot + Zod schemas | AI Agent |
