# AUDEBase Phase 1a 计划文档

> **创建日期**: 2026-07-13  
> **来源**: `docs/phase-planning.md`（单一真实来源）  
> **状态**: 📋 Phase 1a 就绪

## 文档索引

| 文档 | 用途 | 读者 |
|------|------|------|
| [phase1a-master-plan.md](phase1a-master-plan.md) | Phase 1a 主计划：目标、模块清单、依赖图、团队分工、时间线、风险清单 | 全员 |
| [phase1a-week0.md](phase1a-week0.md) | Week 0 CI/CD 基础设施搭建：Turborepo、Vitest、GitHub Actions、Docker Compose、antd 验证 | Person A, Person D |
| [phase1a-execution-guide.md](phase1a-execution-guide.md) | 执行指南：AI-Driven SDD/TDD 工作流、质量门禁、开发节奏、反模式 | 全员 |
| [phase1a-acceptance-checklist.md](phase1a-acceptance-checklist.md) | 验收清单：15 模块逐项验收标准、集成测试、非功能需求 | QA / Tech Lead |

## 快速导航

- **新成员入职** → 先读 `phase1a-master-plan.md` 了解全局
- **准备编码** → 先读 `phase1a-execution-guide.md` 了解工作流和门禁
- **Week 0 启动** → 按 `phase1a-week0.md` 逐步执行
- **模块交付** → 逐项核对 `phase1a-acceptance-checklist.md`

## 参考文档

这些文档是计划文档的上游来源，如有冲突以它们为准：

| 文档 | 说明 |
|------|------|
| `../phase-planning.md` | Phase 划分单一真实来源（模块编号、依赖、分工、验收标准） |
| `../architecture.md` | 架构文档（§七 MVP 范围、§八 路线图） |
| `../../.agents/memorys/status.md` | 项目状态（模块状态表、SDD/TDD 文档状态） |
| `../../.agents/memorys/decisions.md` | 架构决策记录（47 条 G1-G5、D1-D24） |
| `../../.agents/memorys/conventions.md` | 编码约定（命名、不可变性、TS 规范、SDD/TDD 约定） |
| `../modules/*-sdd.md` | 10 份 SDD 接口契约 |
| `../modules/*-tdd.md` | 11 份 TDD 测试计划 |
