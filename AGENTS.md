# AGENTS.md — AUDEBase Project Knowledge Base

**Generated:** 2026-07-10
**Commit:** `a024b10`
**Branch:** `main`

## OVERVIEW
AUDEBase — 企业应用开发平台。微内核 + 插件热插拔架构，对标 Odoo、NocoBase、云表。当前 Phase 0 — 架构定义完成，文档基础设施就绪，3 轮交叉审计通过，Phase 1 拆分为 1a/1b 五阶段路线图。

## STRUCTURE
```
AUDEBase/
├── .opencode/          # OpenCode 配置（插件、MCP、LSP、instructions）
│   ├── opencode.json   # 主配置：模型、插件、44 条 instructions、6 个 MCP、8 个 LSP
│   ├── agent-guide.md  # 554 行 — AI 代理使用指南（5 层模型体系、OMO 编排）
│   └── init-mcp-*.mjs  # 7 个 MCP 自动安装脚本（codegraph/playwright/shadcn/tailwind/lucide/postgres）
├── .agents/
│   ├── rules/          # 89 个编码规则文件（16 语言 × common + 中文副本）
│   ├── skills/         # 6 个技能（design-system + 5 openspec-*）
│   └── memorys/        # 4 个项目记忆文件（status/conventions/decisions/pitfalls）
├── docs/
│   ├── architecture.md # 484 行 — 架构文档（10 章节，含 MVP 验收标准、Phase 1a/1b 路线图）
│   ├── competitive-landscape.md # 386 行 — 39+ 产品竞品调研报告
│   ├── plugin-architecture-analysis.md # ~850 行 — 四层信任分组深度分析
│   ├── modules/        # 5 份模块设计文档
│   │   ├── tech-stack.md
│   │   ├── plugin-framework.md
│   │   ├── plugin-communication.md
│   │   ├── multi-tenant.md
│   │   └── file-storage.md
│   └── reference/      # 15 份竞品产品画像
├── SKILL.md            # 82 行 — 技能注册表（superpowers + 项目专属 + agents）
├── README.md           # 18 行 — 项目简介
├── package.json        # 极简：仅 `name: "AUDEBase"` + `@colbymchenry/codegraph` 开发依赖
├── package-lock.json   # npm lock 文件
├── LICENSE             # Apache 2.0
└── .gitignore          # 88 行 — 排除 .sisyphus/
```

## WHERE TO LOOK
| Task | Location | Notes |
|------|----------|-------|
| 项目状态和阶段 | `.agents/memorys/status.md` | 模块状态表、已知缺失、近期工作 |
| 架构决策 | `.agents/memorys/decisions.md` | D1-D24 + G1-G4，388行 |
| 编码约定 | `.agents/memorys/conventions.md` | 命名、不可变性、TS 规范 |
| 已知坑点 | `.agents/memorys/pitfalls.md` | MODACS 适配 + 技术栈 + 行业 CVE 教训 |
| 语言规则 | `.agents/rules/{lang}/` | 各语言专属规则 |
| Agent 配置 | `.opencode/opencode.json` | instructions、MCP、LSP |
| Agent 使用指南 | `.opencode/agent-guide.md` | OMO 编排体系、5 层模型路由 |
| 技能注册表 | `SKILL.md` | superpowers + 项目专属技能清单 |
| 架构文档 | `docs/architecture.md` | 架构文档（企业应用平台，484行，含 MVP 验收标准、Phase 1a/1b 五阶段路线图）|
| 插件架构分析 | `docs/plugin-architecture-analysis.md` | ~850 行 — 四层信任分组 + 通信 + 安全 + 生命周期 |
| 竞品调研 | `docs/competitive-landscape.md` | 386 行 — 39+ 产品，五大分类 |
| 竞品参考 | `docs/reference/` | 15 份详细产品画像（Odoo/NocoBase/ERPNext 等）|
| 模块设计 | `docs/modules/` | 5 份模块设计文档 |
| 通用规则 | `.agents/rules/common/` | 安全、编码风格、测试、Git 工作流 |
| 安全规则 | `.agents/rules/common/security.md` | Secret management、XSS、CSRF |

## CODE MAP
_当前无源代码。以下为架构文档中规划的模块：_

| 模块 | 状态 | 规划路径 |
|------|------|----------|

| 插件框架 | 🔲 Phase 1 | `packages/plugin-framework/` |
| plugin-core (Bootstrap) | 🔲 Phase 1 | `packages/plugin-core/` — 内核插件，零依赖（D1.6） |
| manifest.yaml 系统 | 🔲 Phase 1 | `packages/manifest-engine/` |
| RBAC 权限引擎 | 🔲 Phase 1 | `packages/rbac/` — Phase 1 基础 tenant_id，Phase 2 完整 Record Rules（D10） |
| 插件通信 | 🔲 Phase 1 | `packages/plugin-communication/` |
| 审计日志 | 🔲 Phase 1 | `packages/audit/` — D1.12 |
| 迁移管理 | 🔲 Phase 1 | `packages/migration/` — D1.7 |
| 事件总线 | 🔲 Phase 1 | `packages/event-bus/` — D1.9 |
| Schema Engine | 🔲 Phase 2 | `packages/schema-engine/` |
| 插件市场 | 🔲 Phase 2 | — |
| 工作流引擎 | 🔲 Phase 4 | `packages/workflow-engine/` |

## CONVENTIONS
### AUDEBase 独有
### npm scope
- **去 MODACS 化**: 保持零 MODACS 残留，每次修改后运行 `grep -ri modacs . --exclude-dir=.git --exclude-dir=.sisyphus`
- **精确编辑**: 不全局 MODACS→AUDEBase 替换，使用手术式编辑
- **架构骨架**: `docs/architecture.md` 中内容不足 50% 的章节使用 `TODO: 为 AUDEBase 重写此节` 占位
- **@modacs/* 移除**: 移除所有 `@modacs/*` 引用，不自动替换为 `@AUDEBase/*`

### TypeScript
- 公共 API 显式类型注解
- `interface` 优先于 `type`（对象形状）
- `unknown` > `any`
- Zod 用于边界层模式验证
- 禁止 `as any` / `@ts-ignore` / `console.log`

### 通用
- 不可变性优先（永不突变，总是创建新副本）
- 小文件 > 大文件（200-400 行典型，800 行最大）
- 显式错误处理，无静默吞异常
- 布尔值前缀 `is`/`has`/`should`/`can`

## ANTI-PATTERNS (THIS PROJECT)
- **`as any` / `@ts-ignore`** — 永不使用，零例外
- **`console.log`** — 生产代码禁止
- **静默吞异常** — `catch(e) {}` 绝对不允许
- **对象突变** — 始终返回新对象，永不就地修改
- **全局 MODACS→AUDEBase 替换** — 使用精确的手术式编辑
- **硬编码密钥** — 使用环境变量或密钥管理器
- **不必要的文件写入** — 文档文件仅在用户明确要求时创建

## COMMANDS
```bash
# 尚无构建脚本——package.json 不包含 scripts 字段
# 仅有 devDependency: @colbymchenry/codegraph
npm install    # 安装依赖（如需要）
```

## NOTES

- **文档基础设施就绪** — 架构定义完成。8 轮团队审核（R1-R8，累计 185+ 发现全部关闭），2 轮文档交叉审计通过，文档完善等待 Phase 1 编码启动
- **从 MODACS 分离** — 2026-07-08 首次提交。无 MODACS 代码共享
- **.sisyphus/** 被 gitignore 排除 — 计划文件、审计报告暂存于此
- **双 package.json** — 根目录用 npm，`.opencode/` 用独立包（插件系统）
- **Agent 超配** — 对于零代码项目，基础设施配置较重。规则（89 个文件）和 MCP 服务器（7 个活动）是为未来开发准备的
- **test 基础设施** — 不存在。要求 80% 覆盖率、TDD、AAA 模式（在规则中声明，但无框架可执行）
