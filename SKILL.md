# Skills

本项目通过 **superpowers 插件**、**OMO 编排体系** 和 **项目专属技能** 三层提供 AI 辅助能力。

## 关系说明

- **Rules** (`.agents/rules/`) — 定义标准、约定和检查清单，告诉 AI *做什么*
- **Skills** (`.agents/skills/`) — 提供深入、可操作的参考材料，告诉 AI *怎么做*

Rules 中通过 `See skill: <name>` 引用 Skills，形成 "规则约束 → 技能实现" 的层级。

> 📖 完整工作流见 [AGENTS.md](./AGENTS.md)。

## Superpowers 技能

通过 `.opencode/opencode.json` 加载，来自 `superpowers@git+https://github.com/obra/superpowers.git`。

> ⚠️ **与 OMO 职责分离**: superpowers 负责质量门禁，OMO 负责编排执行。标记为「OMO 替代」的 skill 应避免使用，统一走 OMO 对应能力。

| 技能 | 用途 | 状态 | 说明 |
|------|------|------|------|
| `brainstorming` | 需求探讨与设计方案 | ✅ 启用 | OMO 无对应能力 |
| `systematic-debugging` | 系统性调试 | ✅ 启用 | OMO 无专职调试 agent |
| `test-driven-development` | TDD 工作流 | ✅ 启用 | 补充项目 testing 规则 |
| `verification-before-completion` | 完成前验证 | ✅ 启用 | 阶段 5 最终确认 |
| `requesting-code-review` | 发起代码审查 | ✅ 启用 | 代码审查流程 |
| `receiving-code-review` | 处理审查反馈 | ✅ 启用 | 处理审查反馈 |
| `finishing-a-development-branch` | 完成开发分支 | ✅ 启用 | 阶段 7 收尾 |
| `using-git-worktrees` | Git Worktree 隔离 | ✅ 启用 | 大规模 feature 隔离 |
| `dispatching-parallel-agents` | 调度并行代理 | ✅ 启用 | 与 OMO 互补 |
| `writing-skills` | 编写新技能 | ✅ 启用 | — |
| `writing-plans` | 编写实施计划 | ⚠️ OMO 替代 | 规划统一走 prometheus |
| `executing-plans` | 执行实施计划 | ⚠️ OMO 替代 | 执行统一走 atlas |
| `subagent-driven-development` | 子代理驱动开发 | ⚠️ OMO 替代 | OMO 原生支持 |

## 项目专属技能

位于 `.agents/skills/`，覆盖企业应用开发平台 AIGC 开发的需求、设计、实施和归档流程：

| 技能 | 文件 | 内容 |
|------|------|------|
| `design-system` | `design-system/SKILL.md` | AUDEBase 企业应用平台 UI 设计系统：颜色、排版、组件、布局规范 |
| `openspec-propose` | `openspec-propose/SKILL.md` | 一步生成完整变更提案：设计、规格、任务 |
| `openspec-apply-change` | `openspec-apply-change/SKILL.md` | 实施变更中的任务：开始、继续、逐步执行 |
| `openspec-archive-change` | `openspec-archive-change/SKILL.md` | 归档已完成变更：记录决策、更新记忆、清理产物 |
| `openspec-explore` | `openspec-explore/SKILL.md` | 探索模式：思考伙伴，用于探索想法、调查问题、澄清需求 |
| `openspec-sync-specs` | `openspec-sync-specs/SKILL.md` | 将 delta specs 同步到主规格（不归档变更） |
| `openspec-apply` | `openspec-apply/SKILL.md` | 实施 MSRCS 变更提案中的任务（C++17/Qt5.15/ROS2 代码库） |
| `openspec-archive` | `openspec-archive/SKILL.md` | 归档已完成的 MSRCS 变更提案：记录决策、更新记忆、清理产物 |
| `openspec-verify` | `openspec-verify/SKILL.md` | 验证 MSRCS 变更提案是否正确实现：编译、测试、设计要求检查 |
| `doc-audit` | `doc-audit/SKILL.md` | 项目文档与架构审计：6 维度并行检查文档自洽性、完整性、缺口 |
| `test-harness` | `test-harness/SKILL.md` | SDD 驱动测试全生命周期：从规范生成测试骨架、TDD 循环、一致性验证、覆盖率分析 |
| `book-to-skill` | `book-to-skill/SKILL.md` | 将书籍/文档转换为结构化 agent 技能 |
| `skill-creator` | `skill-creator/SKILL.md` | 从 SDD 文档/TypeScript 接口/manifest.yaml 生成项目专属技能 |

## 代理（Agents）

AUDEBase 使用 OMO（oh-my-opencode）编排体系，详见 `.opencode/agent-guide.md`：

| 代理 | 用途 |
|------|------|
| **Sisyphus** | 主执行代理 — 任务分解、委派、质量把控 |
| **Prometheus** | 规划代理 — 结构化计划生成 |
| **Oracle** | 咨询代理 — 高 IQ 架构设计与深度调试 |
| **Metis** | 评审代理 — 事前规划分析与歧义检测 |
| **Momus** | 批判代理 — 计划验证与审查 |
| **Librarian** | 搜索代理 — 多仓库分析、文档检索 |
| **Explore** | 探索代理 — 代码库上下文 grep |
| **Atlas** | 导航代理 — 任务路由与调度 |

## 使用方式

AI 助手会自动匹配适用的技能并加载。也可在对话中指定：

```
使用 design-system 技能帮我设计项目主题
```

## 添加新技能

1. 在 `.agents/skills/` 下创建 `<name>/SKILL.md`（文件夹形式）
2. 在本文档的「项目专属技能」表格中添加条目
3. 在对应的规则文件中添加 `See skill: <name>` 引用
