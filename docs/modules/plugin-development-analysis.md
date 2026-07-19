# 插件开发体验（DX）分析

**生成日期**: 2026-07-19
**来源**: 团队分析（竞品调研 + 差距分析）

## 摘要

基于 5 个主流平台（Odoo、NocoBase、VS Code、Strapi、WordPress）的 7 维度竞品调研，
对照 AUDEBase 当前状态进行差距分析。共发现 26 项差距（7C/9H/5M/5L）。

## 竞品调研核心发现

| 能力 | Odoo | NocoBase | VS Code | Strapi | WordPress | AUDEBase |
|------|:---:|:---:|:---:|:---:|:---:|:---:|
| 脚手架 CLI | ✅ `odoo-bin scaffold` | ✅ `yarn pm create` | ✅ `yo code` | ✅ `sdk-plugin init` | ✅ `wp scaffold` | ❌ |
| 热更新 | ✅ `--dev=reload` | ✅ 分类型 HMR | ✅ Dev Host | ✅ `--watch-admin` | ⚠️ 无原生 | ❌ |
| 校验/Doctor | ⚠️ 分散 | ❌ | ⚠️ `vsce check` | ⚠️ `verify` | ✅ Plugin Check | ❌ |
| 生命周期 CLI | ✅ install/upgrade | ✅ enable/disable/remove | ⚠️ publish 为主 | ⚠️ sdk 命令 | ✅ 完整 | ❌ |
| 独立开发支持 | ⚠️ monorepo 耦合 | ⚠️ monorepo 耦合 | ✅ 完全独立 | ✅ yalc 软链接 | ⚠️ SVN 依赖 | ❌ |
| 发布流程 | App Store | npm + 市场 | Marketplace | npm + Marketplace | SVN + WordPress.org | ❌ |

### 对 AUDEBase 的启示

1. **脚手架**: 轻量场景硬编码 `.ts` 模板（如 P1 roadmap 所述），后续支持自定义模板目录
2. **热更新**: 至少做两级 — 前端 HMR + 服务端插件重载；迁移/集合变更降级为提示重启
3. **Doctor CLI**: 对标 WordPress Plugin Check — 检查 manifest 格式、TS 编译、测试、覆盖率、i18n 完整性
4. **生命周期 CLI**: 对标 NocoBase `pull → enable → disable → remove` 分层状态机
5. **发布**: 插件应可独立开发和 npm publish；版本号多文件同步（manifest + package.json + changelog）

## 差距分析

### CRITICAL（核心缺失）

| # | 差距 | 对标 | 实现难度 | 建议 Phase |
|---|------|------|:---:|:---:|
| 1 | 业务模块空白 | Odoo (40+) / NocoBase (100+) | 大 | Phase 3+ |
| 2 | Record Rules 未实现 | Odoo (D10) | 中 | Phase 2 |
| 3 | 字段级权限未实现 | NocoBase / Directus (D11) | 中 | Phase 2 |
| 4 | BPMN 2.0 缺失 | Axelor / AuraBoot | 大 | Phase 4+ |
| 5 | 可视化建模器缺失 | Axelor / NocoBase | 大 | Phase 4+ |
| 6 | 插件市场为零 | NocoBase / Strapi / Odoo | 大 | Phase 4+ |
| 7 | AI 能力空白 | NocoBase v2 AI 员工 | 中 | Phase 3+ |

### HIGH（重要缺失）

| # | 差距 | 实现难度 | 建议 Phase |
|---|------|:---:|:---:|
| 8 | 通知仅有抽象接口 | 低 | Phase 2 |
| 9 | 深层多租户未实现 | 中 | Phase 3 |
| 10 | 多数据源缺失 | 中 | Phase 3 |
| 11 | 数据可视化缺失 | 低 | Phase 2 |
| 12 | 文件存储去重未实现 | 中 | Phase 2 |
| 13 | GraphQL API 缺失 | 低 | Phase 2 |
| 14 | 国内生态集成缺失 | 中 | Phase 4+ |
| 15 | Federation 联邦缺失 | 大 | Phase 5+ |
| 16 | GDPR/数据隐私工具缺失 | 中 | Phase 4+ |

### MEDIUM / LOW（有基础但需增强）

| # | 差距 | 实现难度 | 建议 Phase |
|---|------|:---:|:---:|
| 17 | CLI 功能薄弱（4 命令） | 低 | Phase 2 |
| 18 | Admin UI 功能有限 | 中 | Phase 2 |
| 19 | 测试覆盖深度不足 | 低 | Phase 2 |
| 20 | 监控/可观察性缺失 | 中 | Phase 3 |
| 21 | 部署简化不足 | 低 | Phase 2 |
| 22 | i18n 管理 UI 缺失 | 低 | Phase 2 |
| 23 | 审计保留策略未实现 | 低 | Phase 2 |
| 24 | Container 沙箱未实现 | 大 | Phase 4 |
| 25 | API 版本管理界面缺失 | 低 | Phase 2 |
| 26 | plugin-example 过于简陋 | 低 | Phase 2 |

## 推荐优先级

**Phase 2 立即启动（低成本高价值）**:
1. Record Rules（D10）+ 字段级权限（D11）
2. 通知具体实现（Email + InApp）
3. GraphQL API
4. CLI 扩展（plugin 命令组）
5. plugin-example 增强

**Phase 3+**:
6. 2-3 个 MVP 业务模块（OA：审批 + ERP：库存）
7. Schema Engine 可视化建模器
8. 插件市场基础设施

## 相关文档

- [竞品调研全文](../../.sisyphus/reports/plugin-dx-competitive-research.md)（1106 行）
- [Plugin DX Roadmap](../../.sisyphus/plans/plugin-dx-roadmap.md)（280 行）
- [插件开发指南](plugin-development.md)（新生成）
- [快速上手](../guides/01-quick-start.md)（新生成）
