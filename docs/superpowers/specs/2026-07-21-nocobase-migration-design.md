# AUDEBase NocoBase 迁移设计方案

**日期:** 2026-07-21
**决策:** D25 — 基于 NocoBase 重构
**状态:** 🔲 Phase 3 规划中

## 1. 背景

AUDEBase Phase 1a-2 自建了 28 个包（42K 行代码），实现了微内核 + 插件热插拔架构，包含插件框架、RBAC、审计、i18n、Schema Engine 等核心模块。

2026-07-21 战略决策：**以 NocoBase 为基础平台，将 AUDEBase 自研创新点作为 NocoBase 插件实现。** 原因：

- 自建对标 NocoBase 的功能（Schema Engine、工作流、插件市场、ACL）需要 5-10x 当前代码量
- NocoBase 有 200+ 贡献者、5 年积累、21K+ stars — 社区验证的基础设施
- AUDEBase 的真正差异化在架构创新（四层信任分组、Record Rules），不需要在通用能力上和 NocoBase 竞争

## 2. 架构概览

```
NocoBase Core（现有基础）
├── @nocobase/server           ← 代替 packages/core
├── @nocobase/client           ← 代替 packages/admin-ui
│
├── [AUDEBase 创新插件]
│   ├── @audebase/plugin-trust-grouping    ← 四层信任分组（SYSTEM/Domain/Isolated/Container）
│   ├── @audebase/plugin-manifest-enhancer ← 增强声明（aude.yaml + exports 契约）
│   └── @audebase/plugin-record-rules      ← Odoo 式 Record Rules（Poland notation）
│
├── [AUDEBase 增强插件]
│   ├── @audebase/plugin-audit-enhanced    ← 审计增强（写操作自动记录 + 字段 diff）
│   └── @audebase/plugin-auth-token-version ← token_version 撤回机制
│
└── [业务插件]
    ├── @audebase/plugin-oa
    ├── @audebase/plugin-erp
    └── @audebase/plugin-mes
```

## 3. 三个创新插件设计

### 3.1 @audebase/plugin-trust-grouping — 四层信任分组

**现状**: AUDEBase 的四层信任分组（D1.1）定义在 `packages/plugin-framework/` 中。NocoBase 插件默认同进程运行。

**迁移方案**: 作为 NocoBase 插件增强 PluginManager，在插件加载时按 `aude.yaml` 中的 `runtime.partition` 分配到对应信任层：

| 层级 | 实现方式 | 通信控制 |
|------|---------|---------|
| **SYSTEM** | NocoBase 原生 in-process | 无限制 |
| **Domain** | in-process + namespace 隔离 | 同 partition 直调，跨 partition RPC |
| **Isolated** | `worker_threads` 独立线程 | 白名单 JSON-RPC |
| **Container** | Docker sandbox（Phase 2） | 全禁出站 |

```yaml
# aude.yaml 扩展
runtime:
  mode: inline | worker | container
  partition: SYSTEM | oa | erp | mes
```

**迁移资产**: `packages/plugin-framework/` (845 行) + `packages/plugin-communication/` (678 行)

### 3.2 @audebase/plugin-manifest-enhancer — 增强声明

**现状**: AUDEBase 的 `manifest.yaml` 比 NocoBase 的 `package.json` 声明更多字段（D1.5）。

**迁移方案**: NocoBase 插件加载时，额外读取 `aude.yaml`，merge 到插件元数据中：

```yaml
# aude.yaml（与 package.json 同级）
aude:
  version: 1.0.0
  lifecycle:
    crash_policy: restart    # restart | skip | halt
    migration_version: 1.0.0
  exports:                   # API 契约声明
    - name: orders.create
      api_version: 1.0.0
  security:
    db_namespace: erp_       # 表前缀隔离
```

**迁移资产**: `packages/manifest-engine/` (948 行)

### 3.3 @audebase/plugin-record-rules — Record Rules

**现状**: AUDEBase 实现了 Odoo 式 Poland-notation domain filter（D10），108 测试通过。

**迁移方案**: 作为 NocoBase ACL 的增强层，在数据库查询时自动注入 WHERE 条件：

```typescript
permissions:
  - resource: orders
    action: read
    record_rule: ["&", ["state", "=", "draft"], ["assignee_id", "=", "$user.id"]]
```

**迁移资产**: `packages/rbac/src/record-rules.ts` (108 tests)，几乎零改动即可作为 NocoBase 插件使用。

## 4. NocoBase 原生覆盖的模块

以下 AUDEBase 自建模块可由 NocoBase 原生能力替代：

| AUDEBase 模块 | NocoBase 对应 | 代码量 |
|-------------|-------------|--------|
| Schema Engine | Collection/Schema 引擎 | 603 行 |
| 工作流引擎 | 可视化工作流引擎 | 310 行 |
| 管理 UI | Schema 驱动页面 | 2,763 行 |
| 多租户 | 企业版完整隔离 | — |
| 插件市场 | npm + 本地管理 | — |
| Core 内核 | @nocobase/server | 2,213 行 |

**节省**: 约 6K 行自建代码，数百人·年的维护成本。

## 5. 三阶段迁移计划

| 阶段 | 内容 | 周期 | 产出 |
|------|------|------|------|
| **Phase 1 — 架构对齐** | NocoBase 搭建 + 插件生命周期、manifest 规范对齐 | 1-2 周 | NocoBase 运行环境 + 开发工具链 |
| **Phase 2 — 创新插件实现** | trust-grouping、manifest-enhancer、record-rules 三个插件 | 2-3 周 | 3 个 npm 包发布 |
| **Phase 3 — 生态兼容** | 业务插件（OA/ERP）+ 完整测试 + 文档 | 按需 | 业务插件套件 |

## 6. 现有代码资产再利用

| 模块 | 代码量 | 迁移方式 |
|------|--------|---------|
| record-rules (D10) | 108 tests | → 直接作为 NocoBase 插件 |
| auth token_version | 493 行 | → 增强 NocoBase JWT 插件 |
| audit 审计 | 672 行 | → 作为增强审计插件 |
| 四层信任分组 | 1,523 行 | → 核心逻辑重用于 trust-grouping |
| manifest 引擎 | 948 行 | → 核心逻辑重用于 manifest-enhancer |
| 其余 23 个模块 | ~35K 行 | → 作为架构参考，NocoBase 替代 |
