# D26 验收清单

**日期**: 2026-07-23
**阶段**: Phase 8 — 权限集成 + 最终验证

## 数据层

- [x] dataProvider 对接 Collection CRUD 全链路（含 401→登录重定向）
- [x] TanStack Query key 强制 `[pluginName, ...]` 前缀

## Schema→UI Mapper

- [x] Schema→UI Mapper 支持 7 种字段类型
- [x] 管理中心 4 页面 100% 映射器生成（无手写 ProTable columns）

## 权限控制

- [x] 🔵🟠 页面菜单/按钮权限通过 CanAccess 控制
- [x] 🟠 打印任务双栏：左列表 + 右实时监控
- [x] CanAccessBridge 桥接 Refine 与 AUDEBase useACL 系统

## 实时监控

- [x] 🟠 polling 生命周期：卸载清理 interval + 切后台暂停

## 仪表盘

- [x] 🟣 仪表盘独立渲染（不走 Refine 数据区）

## 认证

- [x] 3 状态认证：token 有效自动进入，无效显示登录

## 布局

- [x] 工作区/管理中心切换：菜单互不干扰
- [x] ProLayout/React Router 双路由桥接

## 测试

- [x] 全量测试套件通过
- [x] admin-ui 测试通过
- [ ] 测试覆盖率 ≥ 80% (待后续验证)

## 权限组件

| 组件 | 文件 | 状态 |
|------|------|------|
| ACLProvider | `providers/ACLProvider.tsx` | ✅ `can(action, resource) => boolean` |
| useACL Hook | `providers/ACLProvider.tsx` | ✅ 从 index.ts 导出 |
| ACLGuard | `components/ACLGuard.tsx` | ✅ 声明式权限包裹 |
| CanAccessBridge | `providers/CanAccessBridge.tsx` | ✅ Refine 兼容桥接层 |
