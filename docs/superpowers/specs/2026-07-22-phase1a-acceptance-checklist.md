# AUDEBase Phase 1a — 人工验收清单

**日期**: 2026-07-22
**关联文档**: `docs/superpowers/specs/2026-07-22-phase1a-execution-plan.md` §5
**用途**: 阶段性人工 QA 验收。打开浏览器 + 终端，按步骤操作，逐项打勾。

---

## 验收前准备

- [ ] NocoBase 开发环境已启动：`yarn dev` → `http://localhost:13000`
- [ ] PostgreSQL 16 已连接，数据库 `audebase_dev` 已创建
- [ ] canonical-schema 包已编译通过：`npx tsc --noEmit`
- [ ] 浏览器已打开 `http://localhost:13000/admin`，root 账号已登录

---

## M1 — Week 1（Day 5）：平台就绪 + 类型验证

**目标**: 验证 NocoBase 环境正常运行，canonical-schema 编译 + 测试通过。

**环境终端**:

| # | 命令 | 预期结果 | 实际 |
|---|------|---------|:---:|
| M1-A1 | `yarn dev` | NocoBase 启动在 `http://localhost:13000`，无 ERROR | ☐ |
| M1-A2 | `npx tsc --noEmit`（canonical-schema 目录） | 零错误 | ☐ |
| M1-A3 | `npx vitest run`（canonical-schema） | 3/3 tests passed | ☐ |

**浏览器操作** (`http://localhost:13000/admin`):

| # | 操作 | 预期结果 | 实际 |
|---|------|---------|:---:|
| M1-B1 | 用 root 账号登录 | Dashboard 页面渲染，左侧菜单可见 | ☐ |
| M1-B2 | 点击右上角用户头像 → "用户中心" | 显示当前用户信息 | ☐ |
| M1-B3 | 进入 Settings → Collection Manager | 系统表列表可见（users, roles 等） | ☐ |
| M1-B4 | 新建 Collection `test_roundtrip`，添加 3 个字段（name, count, active） | Collection 创建成功，出现在列表中 | ☐ |
| M1-B5 | 在 `test_roundtrip` 中手动创建 5 条记录 | 记录出现在 Table 中，翻页正常 | ☐ |

**运维检查**:

| # | 命令 | 预期结果 | 实际 |
|---|------|---------|:---:|
| M1-C1 | `curl http://localhost:13000/api/health` | 返回 `{"status":"ok"}` | ☐ |
| M1-C2 | `tail -n 20 storage/logs/nocobase.log` | 无 ERROR 级别日志，启动耗时 < 10s | ☐ |

**通过标准**: 8/8 ☐

- [ ] M1 通过（__/8）
- 验收人: ___________ 日期: ___________

---

## M2 — Week 2（Day 10）：Canonical Schema 往返闸门 ⚠️

**目标**: 验证 Canonical Schema 的 export → import → diff 往返能力。**Go/No-Go 决策点**。

**前置终端验证**:

| # | 命令 | 预期结果 | 实际 |
|---|------|---------|:---:|
| M2-A1 | `npx vitest run packages/migration-engine/` | 35/35 tests passed | ☐ |

**浏览器操作** (`http://localhost:13000/admin` → Collection Manager):

| # | 操作 | 预期结果 | 实际 |
|---|------|---------|:---:|
| M2-B1 | 确认 `print_jobs` Collection 存在 | 10 个字段，含 deviceId、materialId FK | ☐ |
| M2-B2 | 确认 `devices` Collection 存在 | 5 个字段，serialNumber 标记 unique | ☐ |
| M2-B3 | 确认 `materials` Collection 存在 | 5 个字段，type 为 enum 下拉 | ☐ |

**数据创建（为往返测试准备数据）**:

| # | 操作 | 预期结果 | 实际 |
|---|------|---------|:---:|
| M2-C1 | 在 `devices` 中创建 2 条记录 | 记录出现，serialNumber 唯一 | ☐ |
| M2-C2 | 在 `materials` 中创建 3 条记录 | 记录出现，type 下拉可选 PLA/ABS/PETG/TPU/other | ☐ |
| M2-C3 | 在 `print_jobs` 中创建 2 条记录（关联设备+材料） | FK 下拉可选择已有数据 | ☐ |

**闸门脚本**:

| # | 操作 | 预期结果 | 实际 |
|---|------|---------|:---:|
| M2-D1 | `node scripts/gate-export.js` | 导出 `snap1.json` | ☐ |
| M2-D2 | `node scripts/gate-roundtrip.js` | 输出 `GATE PASSED: roundtrip verified (0 diffs)` | ☐ |

**安全检查**:

| # | 操作 | 预期结果 | 实际 |
|---|------|---------|:---:|
| M2-E1 | `npm audit --audit-level=critical` | 输出 "0 critical vulnerabilities" | ☐ |
| M2-E2 | `pg_dump audebase_dev > snap-pre-gate.sql` | 备份文件生成成功 | ☐ |

**通过标准**: 10/10 ☐

- [ ] M2 通过（__/10）
- **⚠️ Go/No-Go**: ☐ Go / ☐ No-Go → 1 周攻关 → 二次闸门 → 降级
- 验收人: ___________ 日期: ___________

---

## M3 — Week 3（Day 15）：Admin UI 可操作

**目标**: 验证 3 个 SchemaComponent 页面完整 CRUD 功能。

**前置终端验证**:

| # | 命令 | 预期结果 | 实际 |
|---|------|---------|:---:|
| M3-A1 | `npx vitest run packages/plugin-3d-printer/` | 24/24 tests passed | ☐ |

**设备管理页** (`/admin` → "3D Printer" → "Devices"):

| # | 操作 | 预期结果 | 实际 |
|---|------|---------|:---:|
| M3-B1 | 菜单出现 "3D Printer" → 展开 "Devices" | 列表页渲染，列：Name, Serial Number, Status, Firmware, Last Heartbeat | ☐ |
| M3-B2 | 点击 "New" → 填写 name="Printer-A", serialNumber="SN-001" → Submit | Table 刷新，新行出现 | ☐ |
| M3-B3 | 再创建 Printer-B (SN-002) | 两条记录均在列表 | ☐ |
| M3-B4 | 点击 Printer-A 行 "Edit" → 改 name="Printer-A-Updated" → Save | Table 中 name 更新 | ☐ |
| M3-B5 | 点击 Printer-B 行 "Delete" → 确认 | Table 中该行消失 | ☐ |

**材料管理页** (`/admin` → "3D Printer" → "Materials"):

| # | 操作 | 预期结果 | 实际 |
|---|------|---------|:---:|
| M3-C1 | 菜单出现 "3D Printer" → 展开 "Materials" | 列表页渲染，列：Name, Type, Color, Diameter, Remaining Weight | ☐ |
| M3-C2 | 点击 "New" → name="PLA-Black", type=PLA, color="#000000", diameter=1.75, remainingWeight=1000 → Submit | Type 列显示 "PLA" | ☐ |
| M3-C3 | 创建 ABS-Red (type=ABS, color="#FF0000", diameter=1.75, remainingWeight=500) | Type 列显示 "ABS" | ☐ |

**打印任务管理页** (`/admin` → "3D Printer" → "Print Jobs"):

| # | 操作 | 预期结果 | 实际 |
|---|------|---------|:---:|
| M3-D1 | 菜单出现 "3D Printer" → 展开 "Print Jobs" | 列表页渲染，列：Name, Status, Device, Material, Progress, Est. Time | ☐ |
| M3-D2 | 点击 "New" → 表单中 Device 下拉显示 Printer-A | belongsTo FK 选择器正常 | ☐ |
| M3-D3 | Material 下拉显示 PLA-Black 和 ABS-Red | belongsTo FK 选择器正常 | ☐ |
| M3-D4 | 选择 Device=Printer-A, Material=PLA-Black, name="Test Job", modelFile="https://example.com/model.stl" → Submit | status="queued" | ☐ |
| M3-D5 | Status 列筛选：选 "queued" | 仅显示 queued 状态任务 | ☐ |
| M3-D6 | Progress 进度条可见 | 渲染，数值 "0%" | ☐ |

**通过标准**: 15/15 ☐

- [ ] M3 通过（__/15）
- 验收人: ___________ 日期: ___________

---

## M4 — Week 4（Day ~22）：端到端流程闸门 ⚠️

**目标**: 验证 Agent + Admin UI 端到端集成流程。**Go/No-Go 决策点**。

**前置准备**:
- [ ] NocoBase 运行在 `localhost:13000`
- [ ] `agent/config.json` 已配置 deviceId + password
- [ ] E2E 冒烟套件 `tests/e2e/3d-printer-smoke.e2e.ts` 已创建

**前置终端验证**:

| # | 命令 | 预期结果 | 实际 |
|---|------|---------|:---:|
| M4-A1 | `npx vitest run --coverage` | 覆盖率 ≥80% | ☐ |
| M4-A2 | `npx playwright test tests/e2e/3d-printer-smoke.e2e.ts` | 9/9 scenarios passed | ☐ |

**Agent 端（终端窗口 1）**:

| # | 操作 | 预期结果 | 实际 |
|---|------|---------|:---:|
| M4-B1 | `cd agent && node agent.js` | 输出 "Agent: logged in, deviceId=xxx" | ☐ |
| M4-B2 | 观察终端输出 ~30 秒 | 每 5 秒 "Agent: heartbeat OK, status=idle"，无错误 | ☐ |

**Admin UI 端（浏览器窗口）**:

| # | 操作 | 预期结果 | 实际 |
|---|------|---------|:---:|
| M4-C1 | 进入 Devices 列表 | Printer-A 的 Status 显示 "online"（绿色 Badge），Last Heartbeat 最近 30 秒内 | ☐ |
| M4-C2 | 进入 Print Jobs → 创建新任务：name="Agent Test"，选 Printer-A + PLA-Black，modelFile=https://example.com/model.stl → Submit | status="queued" | ☐ |

**Agent 端（同时观察）**:

| # | 操作 | 预期结果 | 实际 |
|---|------|---------|:---:|
| M4-D1 | 等待最多 5 秒 | Agent 输出 "Received start command, jobId=xxx" | ☐ |

**Admin UI 端**:

| # | 操作 | 预期结果 | 实际 |
|---|------|---------|:---:|
| M4-E1 | 刷新 Print Jobs 列表 | "Agent Test" 的 status 变为 "printing" | ☐ |

**Agent 端（模拟进度）**:

| # | 操作 | 预期结果 | 实际 |
|---|------|---------|:---:|
| M4-F1 | 观察 Agent 输出 | 依次输出 "Progress: 25%", "50%", "75%", "100%" | ☐ |

**Admin UI 端**:

| # | 操作 | 预期结果 | 实际 |
|---|------|---------|:---:|
| M4-G1 | 刷新 Print Jobs 列表 | Progress 显示 100%，status 变为 "completed" | ☐ |

**Agent 容错测试**:

| # | 操作 | 预期结果 | 实际 |
|---|------|---------|:---:|
| M4-H1 | 在终端中 `kill` Agent 进程，等 10 秒，重新 `node agent.js` | 输出 "Recovered state: jobId=xxx" | ☐ |
| M4-H2 | Admin UI → Devices 列表 | Printer-A 恢复心跳，Status 恢复 "online" | ☐ |

**E2E 冒烟**:

| # | 操作 | 预期结果 | 实际 |
|---|------|---------|:---:|
| M4-I1 | `npx playwright test tests/e2e/3d-printer-smoke.e2e.ts` | 9/9 scenarios passed | ☐ |

**通过标准**: 11/11 ☐

- [ ] M4 通过（__/11）
- **⚠️ Go/No-Go**: ☐ Go（MVP 验收完成）/ ☐ No-Go → 延期 1 周修复 → 二次 M4 → 降级
- 验收人: ___________ 日期: ___________

---

## 验收总表

| 里程碑 | 时间 | 检查项 | 得分 | 通过 | 签字 |
|--------|:---:|:---:|:---:|:---:|------|
| M1 平台就绪 | Day 5 | 8 | __/8 | ☐ | |
| M2 CS 往返 | Day 10 | 10 | __/10 | ☐ Go / ☐ No-Go | |
| M3 UI 可操作 | Day 15 | 15 | __/15 | ☐ | |
| M4 端到端 | Day ~22 | 11 | __/11 | ☐ Go / ☐ No-Go | |

**Phase 1a 完成条件**: M1-M4 全部通过（M2 + M4 为硬闸门）。

**最终判定**: ☐ Phase 1a 通过 / ☐ 未通过

**总体验收人**: ___________ **日期**: ___________
