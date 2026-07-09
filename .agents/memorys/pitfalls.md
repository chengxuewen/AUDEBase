# AUDEBase 已知坑点与反模式

**更新日期**: 2026-07-09

## MODACS 适配相关

### 全局 MODACS→AUDEBase 替换
- **问题**: 全局替换可能误改有意的迁移文档引用
- **正确做法**: 使用手术式编辑，逐个检查上下文
- **例外**: 当文件内所有引用均为品牌/产品名称时，可安全批量替换
- **验证**: 修改后运行 `grep -ri modacs . --exclude-dir=.git --exclude-dir=.sisyphus`

### @modacs/* 引用处理
- **问题**: 旧 MODACS 包引用需移除
- **正确做法**: 移除所有 `@modacs/*` 引用，不自动替换为 `@AUDEBase/*`
- **理由**: AUDEBase 包结构尚未确定，自动替换可能引入错误依赖

### 架构文档处理
- **问题**: `docs/architecture.md` 从 MODACS 继承，内容可能不完全适用
- **正确做法**: 内容不足 50% 的章节使用 `TODO: 为 AUDEBase 重写此节` 占位
- **状态**: 品牌名称已全部转换为 AUDEBase，内容适配在后续阶段进行

## TypeScript 反模式

### as any / @ts-ignore
- **绝对禁止**。使用 `unknown` + 类型收窄替代

### console.log
- **禁止**在生产代码中使用。使用结构化日志替代

### 静默吞异常
- `catch(e) {}` 绝对不允许。至少记录错误上下文

### 对象突变
- 始终返回新对象，不就地修改。使用 immer 或展开运算符

## 文件操作反模式

### 不必要的文件写入
- 文档文件仅在用户明确要求时创建

### 大文件
- 超过 800 行应拆分为独立模块

## 插件架构相关

### ProcessPluginHost mock 保真度
- **问题**: Phase 1 inline mock 未强制 async+序列化 → Phase 2 重构代价大
- **正确做法**: mock 必须实现 5 项约束（async Promise、JSON 序列化/反序列化、30s 超时、延迟注入）
- **详见**: plugin-architecture-analysis.md 第五节

### Core API 代理绕过
- **问题**: 允许插件直连 PostgreSQL 会绕过 Record Rules 和字段级权限
- **正确做法**: 所有 DB 操作通过 Core 数据 API 代理。仅 Isolated + db_direct: true 例外
- **参考**: NocoBase CVE GHSA-v8vm-cqh8-q87q（直连数据库的权限绕过漏洞）

### 层级分组命名
- **问题**: 使用 `isolation` 和 `group` 可能产生命名歧义
- **正确做法**: 使用 `mode`（inline|process|container）和 `partition`（SYSTEM|oa|erp|...）
