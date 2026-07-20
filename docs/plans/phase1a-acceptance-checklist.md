# AUDEBase Phase 1a 验收清单

> **创建日期**: 2026-07-13
> **用途**: 15 模块逐项验收标准、集成测试、非功能需求、文档完备性、CI/CD 健康检查
> **参考来源**: `docs/phase-planning.md` §Phase 1a 验收标准、`docs/architecture.md` §七、各模块 SDD/TDD 文档

---

## 验收规则

- 每个验收项必须满足 **YES/NO** 判定，不接受模糊判定
- 所有 [ ] 标记 **必须** 在 Phase 1a 结束前为 ✅
- 部分通过 = 不通过，标记 [~] 并附加备注
- 模块 # 与 `docs/phase-planning.md` 完全一致

---

## 目录

1. [模块逐项验收（#1-#15）](#1-模块逐项验收)
2. [跨模块集成测试](#2-跨模块集成测试)
3. [非功能需求](#3-非功能需求)
4. [文档完备性检查](#4-文档完备性检查)
5. [CI/CD 健康检查](#5-cicd-健康检查)
6. [验收总结](#6-验收总结)

---

## 1. 模块逐项验收

### #1 — 内核骨架（Fastify + Drizzle + pnpm workspace）

> **参考**: `docs/phase-planning.md` §Phase 1a 验收标准 #1
> **SDD**: plugin-framework-sdd.md（内核相关章节）
> **TDD**: plugin-framework-tdd.md（启动/健康检查用例）

| # | 验收项 | 验证方法 | 状态 |
|---|--------|----------|:----:|
| 1.1 | `pnpm workspace` 中 `packages/shared-types` 可被 `packages/core` import | `pnpm --filter @audebase/core build` 成功 | [ ] |
| 1.2 | `GET /health` 返回 `{ "status": "ok", "db": true, "redis": true, "uptime": N }` | `curl http://localhost:3000/api/health` 检查 JSON 格式和字段存在性 | [ ] |
| 1.3 | `GET /health/ready` 在数据库就绪后返回 HTTP 200 | DB 启动后 `curl http://localhost:3000/api/health/ready` → 200 | [ ] |
| 1.4 | `GET /health/ready` 在数据库未就绪时返回 HTTP 503 | 断开 DB 后请求 → 503 | [ ] |
| 1.5 | 启动时 `process.env.AUDE_JWT_SECRET` 非空且 ≥32 字符，否则拒绝启动 | `AUDE_JWT_SECRET=short node ...` 启动 → 立即退出 + 错误消息 | [ ] |
| 1.6 | Fastify 应用在 `process.on('SIGTERM')` 时优雅关闭（等待进行中请求最多 10s） | 发送 SIGTERM → 日志记录 graceful shutdown → 进程退出码 0 | [ ] |
| 1.7 | 未认证请求访问受保护端点返回 HTTP 401 + `AUTH_REQUIRED` 错误码 | `curl /api/users` → `{"error":{"code":"AUTH_REQUIRED",...}}` | [ ] |
| 1.8 | 全局错误中间件捕获未处理异常返回 HTTP 500 + `INTERNAL_ERROR` 错误码 | 注入非法请求 → 500 响应不泄露堆栈 | [ ] |

---

### #2 — 数据库 Schema（DDL）

> **参考**: `docs/phase-planning.md` §Phase 1a 验收标准 #2
> **DDL**: `docs/modules/database-schema.md`（11 张表完整定义）
> **验证**: Drizzle schema 定义 + 实际 PostgreSQL 表结构一致性

| # | 验收项 | 验证方法 | 状态 |
|---|--------|----------|:----:|
| 2.1 | `tenants` 表 DDL 与 `database-schema.md` 一致（含 slug UNIQUE、name、status、config JSONB） | 对比 Drizzle schema 文件与 database-schema.md | [ ] |
| 2.2 | `users` 表 DDL 一致（含 username UNIQUE、password_hash、token_version、is_active、tenant_id FK） | 同上 | [ ] |
| 2.3 | `roles` 表 DDL 一致（含 name、slug UNIQUE、description、tenant_id） | 同上 | [ ] |
| 2.4 | `permissions` 表 DDL 一致（含 resource、action、description、tenant_id） | 同上 | [ ] |
| 2.5 | `user_roles` 表 DDL 一致（复合唯一约束 user_id + role_id） | 同上 | [ ] |
| 2.6 | `role_permissions` 表 DDL 一致（复合唯一约束 role_id + permission_id） | 同上 | [ ] |
| 2.7 | `modules` 表 DDL 一致（Plugin 注册表，含 name UNIQUE、version、status、config JSONB） | 同上 | [ ] |
| 2.8 | `collections` 表 DDL 一致（Schema 元数据表，含 name UNIQUE、schema JSONB） | 同上 | [ ] |
| 2.9 | `audit_log` 表 DDL 一致（含 actor_id、action、resource_type、resource_id、old_values JSONB、new_values JSONB、ip、user_agent） | 同上 | [ ] |
| 2.10 | `migration_history` 表 DDL 一致（含 plugin_name + version 复合唯一、status、applied_at） | 同上 | [ ] |
| 2.11 | `refresh_tokens` 表 DDL 一致（含 token_hash UNIQUE、user_id FK、expires_at） | 同上 | [ ] |
| 2.12 | 所有业务表含 `tenant_id` 列（可 NULL = 系统全局数据），首列索引遵循 D9.1 | `psql` 检查索引 `idx_{table}_tenant_id` | [ ] |
| 2.13 | 所有表含 `id` (UUID PK)、`created_at`、`updated_at`（`migration_history` 除外） | Drizzle schema 检查 | [ ] |
| 2.14 | `pnpm db:generate` 生成的 SQL 迁移文件与 Drizzle schema 完全一致 | 运行 `pnpm db:generate` → 检查输出 SQL | [ ] |

---

### #3 — CLI 工具

> **参考**: `docs/phase-planning.md` §Phase 1a 验收标准 #3
> **TDD**: dev-workflow.md §3（测试命令）

| # | 验收项 | 验证方法 | 状态 |
|---|--------|----------|:----:|
| 3.1 | `aude dev` 启动开发服务器（Fastify + 文件监听），默认端口 3000 | 运行 `aude dev` → 日志显示 `Server listening on port 3000` | [ ] |
| 3.2 | `aude db:migrate` 执行所有待处理迁移（preload→postsync→postload 三阶段） | 在空 DB 上运行 → 检查 `migration_history` 表记录 | [ ] |
| 3.3 | `aude db:migrate --dry-run` 列出待执行迁移但不实际执行 | 运行 → 输出预览列表且 `migration_history` 不变 | [ ] |
| 3.4 | `aude plugin:create <name>` 生成标准插件骨架目录（含 manifest.yaml、src/index.ts、package.json） | 运行 → 检查输出的目录结构和文件内容 | [ ] |
| 3.5 | `aude plugin:create` 生成的 manifest.yaml 包含 Phase 1a 必填字段 | 验证 name/version/display_name/runtime.mode/runtime.partition 存在 | [ ] |
| 3.6 | CLI 退出码：成功 0，参数错误 1，运行时错误 2 | 分别测试各场景 | [ ] |
| 3.7 | `aude --help` 显示全部 3 条命令的用法和描述 | 运行 → 输出包含 dev/db:migrate/plugin:create | [ ] |

---

### #4 — plugin-core Bootstrap

> **参考**: `docs/phase-planning.md` §Phase 1a 验收标准 #4
> **SDD**: `docs/modules/plugin-core-sdd.md`
> **TDD**: `docs/modules/plugin-core-tdd.md`
> **决策**: D1.6

| # | 验收项 | 验证方法 | 状态 |
|---|--------|----------|:----:|
| 4.1 | 首次启动时 `plugin-core` 的 `install()` 创建 admin 用户（username=admin，默认密码强制首次修改） | 登录 admin/Admin@123 → 强制修改密码提示 | [ ] |
| 4.2 | 创建默认角色：admin（所有权限）、member（基础权限） | 查询 `roles` 表 → 存在 admin + member 记录 | [ ] |
| 4.3 | 创建系统租户（tenant_id=NULL） | 查询 `tenants` 表 → 存在 slug='system' 记录 | [ ] |
| 4.4 | 初始化默认菜单结构（插件管理、用户管理） | 查询 `modules` 表或菜单相关表 | [ ] |
| 4.5 | 创建核心权限项（user:create, user:read, user:update, user:delete, plugin:manage, role:manage） | 查询 `permissions` 表 → 至少 6 项 | [ ] |
| 4.6 | `plugin-core` 声明 `dependencies: []`（零依赖）| 检查 manifest.yaml | [ ] |
| 4.7 | `plugin-core` 设置为不可卸载 | 尝试卸载 → 拒绝操作或返回错误 | [ ] |
| 4.8 | Bootstrap 流程幂等：重复启动不会再创建重复数据 | 重启应用 → `users` 表中 admin 用户记录唯一 | [ ] |

---

### #5 — 迁移管理（基础）

> **参考**: `docs/phase-planning.md` §Phase 1a 验收标准 #5
> **SDD**: `docs/modules/migration-engine-sdd.md`
> **TDD**: `docs/modules/migration-engine-tdd.md`
> **决策**: D1.7

| # | 验收项 | 验证方法 | 状态 |
|---|--------|----------|:----:|
| 5.1 | `migration_history` 表记录每个插件的已执行迁移版本（plugin_name + version 复合唯一） | 执行迁移后查询表 → 有记录 | [ ] |
| 5.2 | 三阶段迁移执行顺序：preload → postsync → postload | 在迁移 SQL 中插入日志 → 检查日志顺序 | [ ] |
| 5.3 | 迁移按 manifest.yaml 中 `version` SemVer 排序执行 | 创建 1.0.0 和 1.1.0 迁移 → 检查执行顺序 | [ ] |
| 5.4 | 迁移失败时：标记 status='failed' → 跳过该插件继续加载其他插件 → 记录错误日志 | 注入错误 SQL → 检查其他插件仍可加载 + `migration_history` 状态= 'failed' | [ ] |
| 5.5 | version_gated：仅执行版本号 > 已记录版本的迁移 | 重复运行 `db:migrate` → 已执行的迁移不再执行 | [ ] |
| 5.6 | `--dry-run` 模式展示待执行迁移不实际写入 | 运行 dry-run → 输出预览、migration_history 不变 | [ ] |
| 5.7 | 迁移引擎识别 `migrations/{version}/` 目录下的 preload.sql/postsync.sql/postload.sql | 扫描目录 → 正确加载三个文件 | [ ] |

---

### #6 — 插件框架

> **参考**: `docs/phase-planning.md` §Phase 1a 验收标准 #6
> **SDD**: `docs/modules/plugin-framework-sdd.md`
> **TDD**: `docs/modules/plugin-framework-tdd.md`
> **决策**: D1/D1.1/D1.2/D1.4

| # | 验收项 | 验证方法 | 状态 |
|---|--------|----------|:----:|
| 6.1 | `PluginManager.discover()` 在 `packages/` 中递归发现 manifest.yaml 文件 | 创建测试插件 → discover() 返回包含该插件的列表 | [ ] |
| 6.2 | manifest.yaml 必填字段（name/version/display_name/runtime.mode/runtime.partition）缺失时拒绝加载并报错 | 创建缺失字段的 manifest → load() 拒绝 + 明确错误消息 | [ ] |
| 6.3 | 插件 `load()` 触发完整钩子链：afterAdd → beforeLoad → load（首次还触发 install → afterEnable） | 在钩子中插入日志 → 检查执行顺序 | [ ] |
| 6.4 | 插件通过 Core 数据库代理查询（不直连 DB），自动注入 tenant_id | 测试插件通过 Core API 查询 → 检查 SQL 含 WHERE tenant_id | [ ] |
| 6.5 | `--strict-plugin-host`（AUDE_STRICT_PLUGIN_HOST=1）模式下，参数和返回值通过 JSON.parse(JSON.stringify()) 往返断言 | 启用 strict 模式 → 非 JSON-safe 参数（如 Date/BigInt）往返 → 错误 | [ ] |
| 6.6 | InlinePluginHost 的 5 项 Mock 约束：async Promise、JSON 序列化/反序列化、30s 超时、1-5ms 延迟注入 | 单元测试覆盖全部 5 项 | [ ] |
| 6.7 | 插件卸载（`plugin.unload()`）清理注册的路由、生命周期钩子 | 注册后卸载 → 路由不再可用 | [ ] |
| 6.8 | 循环依赖检测：A→B→A 时拒绝加载 | 创建循环依赖 manifest → load() 抛出错误 | [ ] |

---

### #7 — JWT 认证

> **参考**: `docs/phase-planning.md` §Phase 1a 验收标准 #7
> **SDD**: rbac-sdd.md（认证相关章节）
> **TDD**: rbac-tdd.md（登录/刷新/撤回用例）
> **决策**: D8.1

| # | 验收项 | 验证方法 | 状态 |
|---|--------|----------|:----:|
| 7.1 | `POST /api/auth/login` 成功时返回 `access_token`（15min）+ `refresh_token`（7d）+ `expires_in` + `token_type: 'Bearer'` | 发送有效凭据 → 检查响应体完整格式 | [ ] |
| 7.2 | `POST /api/auth/login` 失败时（错误凭据）返回 HTTP 401 + `AUTH_INVALID_CREDENTIALS` | 发送错误密码 → 检查状态码和错误码 | [ ] |
| 7.3 | `POST /api/auth/refresh` 使用 refresh_token 换取新 access_token | 登录获取 refresh_token → refresh → 新 access_token 可用 | [ ] |
| 7.4 | `POST /api/auth/logout` 撤销 refresh_token（标记 refresh_tokens 表） | 登录 → logout → 尝试用旧 refresh_token 刷新 → 401 | [ ] |
| 7.5 | 更新 `users.token_version` 后所有旧 token 立即失效 | 登录 → 管理员更新 token_version → 原 access_token 请求 → 401 | [ ] |
| 7.6 | access_token JWT payload 包含 sub（user_id）、tenant_id、role、exp、iat | 解码 JWT → 检查 payload 全部字段 | [ ] |
| 7.7 | refresh_token 以 SHA-256 哈希存储于 `refresh_tokens` 表，不存明文 | 检查表存储格式 | [ ] |
| 7.8 | 无 `Authorization` 头请求受保护端点返回 401 | `curl /api/users` → 401 | [ ] |
| 7.9 | 过期 access_token 返回 401 + `TOKEN_EXPIRED` | 使用过期 token → 401 错误码 | [ ] |

---

### #8 — 基础 RBAC

> **参考**: `docs/phase-planning.md` §Phase 1a 验收标准 #8
> **SDD**: `docs/modules/rbac-sdd.md`
> **TDD**: `docs/modules/rbac-tdd.md`
> **决策**: D10

| # | 验收项 | 验证方法 | 状态 |
|---|--------|----------|:----:|
| 8.1 | admin 角色可以创建角色、分配权限 | admin 登录 → POST /api/roles → 200 | [ ] |
| 8.2 | 无权限用户访问需要权限的 API 返回 HTTP 403 + `FORBIDDEN` | member 用户尝试 POST /api/roles → 403 | [ ] |
| 8.3 | `rbac:assign_role` 和 `rbac:revoke_role` 动作写入 audit_log | 分配角色 → 查询 audit_log 表 → 有对应记录 | [ ] |
| 8.4 | API 中间件拦截：所有受保护端点经过 RBAC 中间件检查 | 在中间件添加日志 → 每次受保护请求有检查记录 | [ ] |
| 8.5 | 用户→角色→权限三层模型：用户可有多个角色，角色可有多个权限 | 创建用户 → 分配 2 角色 → 检查权限合并 | [ ] |
| 8.6 | `GET /api/permissions` 返回权限列表（用于角色权限选择器 UI） | 请求 → 返回完整权限数组 | [ ] |
| 8.7 | admin 角色默认拥有所有权限 | admin 登录 → 可访问所有 API | [ ] |

---

### #9 — 多租户（骨架）

> **参考**: `docs/phase-planning.md` §Phase 1a 验收标准 #9
> **决策**: D4

| # | 验收项 | 验证方法 | 状态 |
|---|--------|----------|:----:|
| 9.1 | tenant-A 用户登录后只能看到 tenant-A 的数据 | 创建 tenant-A + tenant-B 各一个用户 → 分别登录 → 列表数据不同 | [ ] |
| 9.2 | Drizzle 查询自动注入 `WHERE tenant_id = currentTenantId` | 检查拦截器中 Drizzle query 的 SQL 日志 | [ ] |
| 9.3 | 系统全局资源（tenant_id IS NULL）对所有租户可见 | admin（tenant_id=NULL）创建的数据 → 所有租户可见 | [ ] |
| 9.4 | `POST /api/auth/login` 响应中的 JWT 包含 `tenant_id` 声明 | 解码 JWT → 检查 `tenant_id` 字段 | [ ] |
| 9.5 | tenant_id 不接受客户端通过查询参数传入 | 请求添加 `?tenant_id=xxx` → 忽略或返回错误 | [ ] |
| 9.6 | 租户创建 API 可用（`POST /api/tenants`）或通过 bootstrap 创建 | 创建租户 → `tenants` 表有记录 | [ ] |

---

### #10 — 审计日志

> **参考**: `docs/phase-planning.md` §Phase 1a 验收标准 #10
> **SDD**: `docs/modules/audit-sdd.md`
> **TDD**: `docs/modules/audit-tdd.md`
> **决策**: D1.12

| # | 验收项 | 验证方法 | 状态 |
|---|--------|----------|:----:|
| 10.1 | API 写操作（POST/PATCH/DELETE）自动在 `audit_log` 表创建记录 | 创建用户 → 查询 audit_log → 有 'user.create' 记录 | [ ] |
| 10.2 | 审计记录包含：actor_id、action、resource_type、resource_id、ip、user_agent、created_at | 检查 audit_log 表记录字段完整性 | [ ] |
| 10.3 | 审计记录包含 old_values/new_values（PATCH 时记录变更前后） | 更新用户 → 检查 old_values/new_values | [ ] |
| 10.4 | `GET /api/audit-logs` 返回审计日志列表（分页，按 -created_at 排序） | 请求 → 返回分页审计日志 | [ ] |
| 10.5 | 查询审计日志支持 `filter` 参数按 resource_type、action 过滤 | `?filter={"resource_type":"user"}` → 仅返回用户相关日志 | [ ] |
| 10.6 | `(tenant_id, resource_type, resource_id)` 复合索引存在 | `psql` 检查索引 | [ ] |
| 10.7 | 审计日志为只读 API（无 DELETE/PATCH audit-logs 端点） | 尝试 DELETE → 404 或 405 | [ ] |

---

### #11 — 国际化（骨架）

> **参考**: `docs/phase-planning.md` §Phase 1a 验收标准 #11
> **SDD**: `docs/modules/i18n-sdd.md`
> **TDD**: `docs/modules/i18n-tdd.md`
> **决策**: D14/D15

| # | 验收项 | 验证方法 | 状态 |
|---|--------|----------|:----:|
| 11.1 | Core `t('key')` 函数返回对应 zh-CN 翻译文本 | `t('保存')` → 返回 '保存' | [ ] |
| 11.2 | 翻译键缺失时返回键名本身（不崩溃） | `t('nonexistent_key')` → 返回 'nonexistent_key' | [ ] |
| 11.3 | 前端 `useTranslation()` React Hook 可用 | 组件内调用 → 翻译正常渲染 | [ ] |
| 11.4 | locale/zh-CN.json 翻译文件存在（至少包含 admin UI 通用文本） | 检查文件存在性 + 内容 | [ ] |
| 11.5 | 翻译支持 ICU 消息格式（插值、复数） | `t('hello', {name:'张三'})` → '你好，张三' | [ ] |
| 11.6 | Phase 1a **不包含** 语言切换 UI | 检查 UI → 无语言选择器 | [ ] |
| 11.7 | Phase 1a **不包含** en-US 翻译 | 检查文件 → 无 locale/en-US.json | [ ] |

---

### #12 — 管理 UI（Admin UI）

> **参考**: `docs/phase-planning.md` §Phase 1a 验收标准 #12
> **SDD**: `docs/modules/admin-ui-sdd.md`
> **TDD**: `docs/modules/admin-ui-tdd.md`
> **决策**: D16/D18/D19/D20

| # | 验收项 | 验证方法 | 状态 |
|---|--------|----------|:----:|
| 12.1 | ProLayout 正确渲染：侧边栏菜单、顶栏（用户信息+登出）、面包屑 | Playwright snapshot 检查 | [ ] |
| 12.2 | 插件管理页面：展示已安装插件列表（ProTable） | 登录 → 点击"插件管理" → 显示列表 | [ ] |
| 12.3 | 插件管理页面：启用/禁用按钮功能（POST /api/plugins/{name}/enable | disable） | 点击启用 → 插件状态变为 loaded；点击禁用 → disabled | [ ] |
| 12.4 | 插件管理页面：安装插件对话框/表单（POST /api/plugins/{name}/install） | 填写 → 提交 → 列表刷新 | [ ] |
| 12.5 | 用户管理页面：CRUD 操作（ProTable + ProForm） | 创建/编辑/删除用户 → 列表刷新正确 | [ ] |
| 12.6 | 用户管理页面：分页功能（15+ 用户时出现翻页控件） | 创建 15+ 用户 → 检查分页控件 | [ ] |
| 12.7 | Provider Stack 层级正确：I18nextProvider → QueryClientProvider → TenantProvider → UserProvider → ACLProvider → ProLayout | 检查 Provider 嵌套顺序（单元测试验证） | [ ] |
| 12.8 | ACLGuard 控制按钮可见性：无 `plugin:manage` 权限的用户不显示"启用/禁用"按钮 | member 登录 → 按钮不存在 | [ ] |
| 12.9 | 插件崩溃降级 UI：ErrorBoundary 捕获渲染错误，显示插件名 + 重试按钮 | 注入错误组件 → 检查降级 UI | [ ] |
| 12.10 | 未登录用户访问 /admin 被重定向到 /login | 清除 token → 访问 /admin → 跳转 /login | [ ] |
| 12.11 | 路由注册：平台管理侧边栏显示"插件管理"和"用户管理"两个一级菜单 | 登录后检查 ProLayout 侧边栏菜单项 | [ ] |
| 12.12 | 角色管理页面：角色列表 + 创建角色 + 权限分配 | 检查角色管理页面 UI 路径 | [ ] |
| 12.13 | 审计日志页面（只读浏览）：审计日志 ProTable 列表 | 检查审计日志页面路由和空状态 | [ ] |
| 12.14 | TanStack Query key 强制 `[pluginName, ...]` 前缀 | 代码审查验证 query key 格式 | [ ] |

---

### #13 — 日志/调试

> **参考**: `docs/phase-planning.md` §Phase 1a 验收标准 #13
> **SDD**: `docs/modules/logging-infra-sdd.md`
> **TDD**: `docs/modules/logging-tdd.md`

| # | 验收项 | 验证方法 | 状态 |
|---|--------|----------|:----:|
| 13.1 | X-Request-ID 自动注入每个请求（缺失时自动生成 UUID） | 无 X-Request-ID 的请求 → 响应头含 X-Request-ID | [ ] |
| 13.2 | 请求日志使用 pino JSON 格式，包含 timestamp、level、requestId、method、url、statusCode、responseTime | 检查日志行 → JSON 格式含全部字段 | [ ] |
| 13.3 | `GET /api/logs` 返回最近 100 条日志（环形缓冲区） | 请求 → 返回数组 ≤100 条 | [ ] |
| 13.4 | 慢查询（>100ms）自动记录警告日志 | 执行慢查询 → 日志级别为 'warn' | [ ] |
| 13.5 | 日志不输出到 stdout 时也写入文件（`logs/app.log`） | 检查日志文件存在且可读 | [ ] |
| 13.6 | 错误日志包含完整 stack trace + 请求上下文（requestId、url） | 触发错误 → 检查日志 | [ ] |
| 13.7 | 禁止 `console.log`（ESLint 规则启用） | `pnpm lint` → 无 console.log 违规 | [ ] |

---

### #14 — 速率限制

> **参考**: `docs/phase-planning.md` §Phase 1a 验收标准 #14
> **SDD**: api-conventions.md §6
> **决策**: #22

| # | 验收项 | 验证方法 | 状态 |
|---|--------|----------|:----:|
| 14.1 | 全局 100 次/分钟 per-IP 限制 | 1 秒内发送 101 次请求 → 第 101 次返回 HTTP 429 | [ ] |
| 14.2 | 429 响应包含 `Retry-After` 头 | 超限请求 → 检查 Retry-After 头 | [ ] |
| 14.3 | 429 响应体格式为 `{"error":{"code":"RATE_LIMIT_EXCEEDED","message":"..."}}` | 检查响应 JSON | [ ] |
| 14.4 | `/api/auth/login` 5 次/分钟 per-IP | 连续 6 次失败登录 → 第 6 次 429 | [ ] |
| 14.5 | 正常请求响应头包含 `X-RateLimit-Limit`、`X-RateLimit-Remaining`、`X-RateLimit-Reset` | 任意正常请求 → 检查 3 个响应头 | [ ] |
| 14.6 | 速率限制精细化：`/api/auth/refresh` 20 次/分钟 | 连续 21 次 refresh → 第 21 次 429 | [ ] |

---

### #15 — API 规范与约定

> **参考**: `docs/phase-planning.md` §Phase 1a 验收标准 #15
> **规范**: `docs/modules/api-specification.md` + `docs/modules/api-conventions.md`

| # | 验收项 | 验证方法 | 状态 |
|---|--------|----------|:----:|
| 15.1 | 所有列表端点返回 `{ "data": [...], "meta": { "count", "page", "pageSize", "totalPages" } }` 分页格式 | 检查 GET /api/users 响应结构 | [ ] |
| 15.2 | 默认 pageSize=20，最大 100，page 超出范围返回空数组不报错 | `?page=999` → data: [], meta.count 正确 | [ ] |
| 15.3 | 排序参数 `sort=-created_at` 格式正确生效 | `?sort=username` → 升序；`?sort=-username` → 降序 | [ ] |
| 15.4 | 过滤参数 `filter={"key":"value"}` NocoBase 格式正确 | `?filter={"is_active":true}` → 仅返回活跃用户 | [ ] |
| 15.5 | 错误响应统一格式 `{"error":{"code":"ERROR_CODE","message":"..."}}` | 所有错误路径检查 | [ ] |
| 15.6 | 校验错误包含 `details` 字段（字段级错误） | 提交无效表单 → 检查 details | [ ] |
| 15.7 | 错误码枚举所有值定义为 TypeScript enum（ErrorCode 导出自 shared-types） | `docs/modules/api-specification.md` 中的错误码表全部实现 | [ ] |
| 15.8 | 响应状态码使用标准 HTTP 语义：200 成功、201 创建、400 校验错误、401 未认证、403 无权限、404 不存在、429 限流 | 全端点检查 | [ ] |

---

## 2. 跨模块集成测试

> **参考**: `docs/modules/e2e-test-flows.md`（5 核心流程）+ test-seed-strategy.md（seed factory）

### 2.1 E2E 认证流程（auth.e2e.ts）

| # | 验收项 | 依赖模块 | 状态 |
|---|--------|----------|:----:|
| I1 | 正常登录：POST /api/auth/login → 200 + access_token + refresh_token | #1, #7 | [ ] |
| I2 | 错误密码：POST /api/auth/login → 401 + `AUTH_INVALID_CREDENTIALS` | #1, #7 | [ ] |
| I3 | 速率限制：连续 6 次失败登录 → 429 + Retry-After | #14, #7 | [ ] |
| I4 | Token 刷新：POST /api/auth/refresh → 200 + 新 access_token | #7 | [ ] |
| I5 | Token 撤回：更新 token_version → 旧 token 失效 → 401 | #7, #8 | [ ] |

### 2.2 E2E 插件管理流程（plugins.e2e.ts）

| # | 验收项 | 依赖模块 | 状态 |
|---|--------|----------|:----:|
| I6 | 登录后 ProTable 显示已安装插件列表（含 plugin-core） | #12, #6 | [ ] |
| I7 | 点击"启用" → POST /api/plugins/{name}/enable → 状态变为 loaded | #6, #12 | [ ] |
| I8 | 点击"禁用" → POST /api/plugins/{name}/disable → 状态变为 disabled | #6, #12 | [ ] |
| I9 | member 用户不显示启用/禁用按钮（ACLGuard） | #12, #8 | [ ] |
| I10 | 安装插件 → 插件列表刷新显示新插件 | #6, #12 | [ ] |

### 2.3 E2E 用户管理流程（users.e2e.ts）

| # | 验收项 | 依赖模块 | 状态 |
|---|--------|----------|:----:|
| I11 | 创建用户：填写 ProForm → 提交 → 列表刷新显示新用户 | #12, #8, #2 | [ ] |
| I12 | 编辑用户：点击编辑 → 修改 → 保存 → 验证更新 | #12, #8 | [ ] |
| I13 | 删除用户：点击删除 → 确认 → 列表移除 | #12, #8 | [ ] |
| I14 | 分页：创建 15+ 用户 → 验证分页控件出现 | #12, #15 | [ ] |
| I15 | 审计日志自动记录：创建用户后 audit_log 表有记录 | #10, #8 | [ ] |

### 2.4 E2E 角色管理流程（roles.e2e.ts）

| # | 验收项 | 依赖模块 | 状态 |
|---|--------|----------|:----:|
| I16 | 创建角色：填写角色名 + slug → 提交 → 角色列表显示 | #8, #12 | [ ] |
| I17 | 分配权限：点击角色 → 勾选权限项 → 保存 | #8, #12 | [ ] |
| I18 | 验证 admin/member 等系统角色存在 | #4, #8 | [ ] |
| I19 | 角色变更后用户权限即时生效（无需重新登录） | #8, #7 | [ ] |
| I20 | 删除角色后关联用户失去对应权限 | #8, #7 | [ ] |

### 2.5 E2E 基础健康检查 + 多租户隔离（health.e2e.ts + multi-tenant.e2e.ts）

| # | 验收项 | 依赖模块 | 状态 |
|---|--------|----------|:----:|
| I21 | ProLayout 渲染：侧边栏菜单 + 面包屑 + 用户信息 | #12 | [ ] |
| I22 | 菜单导航：点击"插件管理" → URL 跳转 + 页面渲染 | #12 | [ ] |
| I23 | 菜单导航：点击"用户管理" → URL 跳转 + 页面渲染 | #12 | [ ] |
| I24 | tenant-A 和 tenant-B 用户数据完全隔离（用户列表互不可见） | #9, #8 | [ ] |
| I25 | 系统全局资源（插件列表）所有租户共享可见 | #9, #6 | [ ] |

---

## 3. 非功能需求

### 3.1 测试覆盖率

> **参考**: `docs/modules/dev-workflow.md` §3.2 覆盖率门禁

| # | 验收项 | 目标 | 验证方法 | 状态 |
|---|--------|:---:|----------|:----:|
| N1 | 全局覆盖率（lines）达标 | ≥80% | `pnpm test:coverage` 报告 | [ ] |
| N2 | `packages/core/src/plugin-manager.ts` 行覆盖率 | ≥80% | 覆盖率报告 | [ ] |
| N3 | `packages/rbac/src/middleware.ts` 行覆盖率 | ≥80% | 覆盖率报告 | [ ] |
| N4 | `packages/migration/src/engine.ts` 行覆盖率 | ≥80% | 覆盖率报告 | [ ] |
| N5 | `packages/audit/src/middleware.ts` 行覆盖率 | ≥80% | 覆盖率报告 | [ ] |
| N6 | `packages/core/src/db.ts` 行覆盖率 | ≥80% | 覆盖率报告 | [ ] |
| N7 | 每个模块边界至少 2 个集成测试用例（DB→ORM、DB→Migration、API→DB、Auth→JWT、Config→env、RateLimit→IP） | ≥2/边界 | 测试文件审查 | [ ] |
| N8 | 5 条核心 E2E 流程全部实现且通过 Playwright | 3/3 环境 | `pnpm test:e2e` 在 CI/本地/Docker 全部通过 | [ ] |
| N9 | 契约测试覆盖 9+ 个 Phase 1a 端点（auth/login、auth/refresh、users CRUD、roles CRUD、health、health/ready） | ≥9 端点 | `pnpm test:contract` 报告 | [ ] |

### 3.2 代码质量

> **参考**: `.agents/rules/common/coding-style.md`、`.agents/rules/typescript/coding-style.md`

| # | 验收项 | 验证方法 | 状态 |
|---|--------|----------|:----:|
| N10 | 零 `as any` / `@ts-ignore` | `grep -r 'as any\|@ts-ignore\|@ts-expect-error' packages/ --include='*.ts' --include='*.tsx' | wc -l` = 0 | [ ] |
| N11 | 零 `console.log`（测试文件除外） | ESLint 规则 + grep 检查 | [ ] |
| N12 | 无静默 catch：所有 catch 块记录错误或重新抛出 | 代码审查 | [ ] |
| N13 | 公共 API 显式类型注解（不依赖类型推导） | 代码审查 | [ ] |
| N14 | 所有函数 < 50 行，所有文件 < 800 行 | ESLint `max-lines` / `max-statements` | [ ] |
| N15 | 接口优先于类型别名（对象形状使用 interface，联合/映射类型使用 type） | 代码审查 | [ ] |
| N16 | 不可变性优先：无对象突变模式 | 代码审查 | [ ] |
| N17 | Zod schema 用于所有系统边界（API 输入、环境变量、配置） | 代码审查 | [ ] |
| N18 | 前端组件使用 `getByRole` > `getByLabelText` > `getByText` > `getByTestId` 查询优先级 | 代码审查 | [ ] |
| N19 | `lazy: () => import()` 签名严格遵循 `() => import()` 格式，无 async 包装或 React.lazy() | 代码审查 | [ ] |

### 3.3 安全

> **参考**: `.agents/rules/common/security.md`、`.agents/memorys/pitfalls.md`

| # | 验收项 | 验证方法 | 状态 |
|---|--------|----------|:----:|
| N20 | 无硬编码密钥（所有密钥通过环境变量注入） | `grep -r 'password\|secret\|key.*=' packages/ --include='*.ts' -i | grep -v 'process.env\|AUDE_'` 无匹配 | [ ] |
| N21 | JWT 密钥启动校验 ≥32 字符，拒绝默认值 | 检查源码中 assert 逻辑 | [ ] |
| N22 | 所有用户输入在系统边界使用 Zod 校验 | 代码审查 | [ ] |
| N23 | SQL 注入防护：Drizzle 参数化查询，无字符串拼接 | 代码审查（`grep -r 'execute.*\$\{' packages/ --include='*.ts'` 禁止） | [ ] |
| N24 | 错误响应不泄露敏感数据（堆栈、内部路径、SQL 语句） | 所有错误端点检查响应体 | [ ] |
| N25 | admin 默认密码强制首次修改 | #4 测试验证 | [ ] |
| N26 | `npm audit` 通过，无 CRITICAL/HIGH 漏洞 | `pnpm audit --audit-level=high` 通过 | [ ] |
| N27 | CSP 头（Content-Security-Policy）已配置 | 检查响应头 | [ ] |

### 3.4 性能

| # | 验收项 | 目标 | 验证方法 | 状态 |
|---|--------|:---:|----------|:----:|
| N28 | `GET /health` 响应时间 | <50ms | `curl -w '%{time_total}'` | [ ] |
| N29 | `POST /api/auth/login` 响应时间 | <200ms | 性能测试 | [ ] |
| N30 | 分页用户列表（100 条时）响应时间 | <300ms | 性能测试 | [ ] |
| N31 | 插件框架加载 10 个空插件 | <1s | 单元测试计时 | [ ] |
| N32 | 数据库连接池默认 10 连接，慢查询日志阈值 100ms | 检查配置 | [ ] |

---

## 4. 文档完备性检查

> **参考**: `AGENTS.md`、`.agents/memorys/status.md`

| # | 验收项 | 关联模块 | 状态 |
|---|--------|----------|:----:|
| D1 | `docs/phase-planning.md` 与验收结果同步更新（标记完成模块） | 全部 | [ ] |
| D2 | `.agents/memorys/status.md` 模块状态表更新 | 全部 | [ ] |
| D3 | `.agents/memorys/decisions.md` 无冲突或过期记录 | 全部 | [ ] |
| D4 | `.agents/memorys/conventions.md` 编码约定与实现一致 | 全部 | [ ] |
| D5 | `.agents/memorys/pitfalls.md` 记录 Phase 1a 实施中发现的坑点 | 全部 | [ ] |
| D6 | `AGENTS.md` 中 CODE MAP 更新为 Phase 1a 实际包路径 | 全部 | [ ] |
| D7 | `packages/shared-types/README.md` 或 inline 文档覆盖导出类型 | shared-types | [ ] |
| D8 | `.env.template` 包含 Phase 1a 全部环境变量 | #1 | [ ] |
| D9 | `docker-compose.yml` 与 dev-workflow.md 描述一致 | Week 0 | [ ] |
| D10 | SDD 文档中的接口签名与实现代码完全一致（SDD as Contract） | 各模块 | [ ] |

---

## 5. CI/CD 健康检查

> **参考**: `docs/modules/dev-workflow.md` §2 CI 流水线

| # | 验收项 | 验证方法 | 状态 |
|---|--------|----------|:----:|
| C1 | GitHub Actions CI 流水线完整：lint → type-check → test(coverage gate) → build | PR 创建 → 检查 Actions 执行 | [ ] |
| C2 | ESLint 检查通过（零 error） | `pnpm lint` → 退出码 0 | [ ] |
| C3 | TypeScript 类型检查通过（零 error） | `pnpm type-check` → 退出码 0 | [ ] |
| C4 | Vitest 单元+集成测试全部通过 | `pnpm test` → 所有测试 PASS | [ ] |
| C5 | 覆盖率门禁触发：低于 80% 全局或低于 80% 核心模块时 CI 阻断 | 故意降低覆盖率 -> CI 失败 | [ ] |
| C6 | E2E Playwright 测试通过（chromium） | `pnpm test:e2e` → 5 条核心流程全部 PASS | [ ] |
| C7 | 契约测试全部通过 | `pnpm test:contract` → 全部 PASS | [ ] |
| C8 | 构建成功（所有包 tsup/Vite 编译） | `pnpm build` → 退出码 0 | [ ] |
| C9 | Docker Compose 开发环境一键启动 | `docker compose up -d` → PostgreSQL + Redis 就绪 | [ ] |
| C10 | Husky pre-commit hook 激活（lint-staged） | `git commit` → 触发 lint-staged | [ ] |
| C11 | `pnpm audit --audit-level=high` 在 CI 中运行且通过 | CI 日志检查 | [ ] |
| C12 | `grep -ri modacs` 零匹配（无 MODACS 残留） | CI 额外步骤或手动检查 | [ ] |

---

## 6. 验收总结

### 通过率汇总

| 分类 | 总项数 | ✅ 通过 | ❌ 未通过 | [~] 部分通过 | 通过率 |
|------|:-----:|:------:|:--------:|:---------:|:-----:|
| 模块 #1 内核骨架 | 8 | | | | % |
| 模块 #2 DB Schema | 14 | | | | % |
| 模块 #3 CLI 工具 | 7 | | | | % |
| 模块 #4 plugin-core Bootstrap | 8 | | | | % |
| 模块 #5 迁移管理 | 7 | | | | % |
| 模块 #6 插件框架 | 8 | | | | % |
| 模块 #7 JWT 认证 | 9 | | | | % |
| 模块 #8 基础 RBAC | 7 | | | | % |
| 模块 #9 多租户骨架 | 6 | | | | % |
| 模块 #10 审计日志 | 7 | | | | % |
| 模块 #11 国际化骨架 | 7 | | | | % |
| 模块 #12 管理 UI | 14 | | | | % |
| 模块 #13 日志/调试 | 7 | | | | % |
| 模块 #14 速率限制 | 6 | | | | % |
| 模块 #15 API 规范与约定 | 8 | | | | % |
| **模块小计** | **123** | | | | **%** |
| 跨模块集成测试（I1-I25） | 25 | | | | % |
| 非功能需求（N1-N32） | 32 | | | | % |
| 文档完备性（D1-D10） | 10 | | | | % |
| CI/CD 健康检查（C1-C12） | 12 | | | | % |
| **合计** | **202** | | | | **%** |

### 一票否决项（必须全部通过）

以下条目中任意一项不通过 → Phase 1a 整体判定为 **不通过**：

- [ ] #1.2 `GET /health` 返回 `status:"ok"` + `db:true`
- [ ] #4.1 plugin-core 首次启动创建 admin 用户
- [ ] #6.3 `plugin.load()` 触发完整钩子链
- [ ] #7.1 `POST /api/auth/login` 返回 access_token
- [ ] #8.2 无权限用户访问受保护 API → 403
- [ ] #9.1 租户 A 和租户 B 数据互不可见
- [ ] #10.1 API 写操作自动记录审计日志
- [ ] #12.1 ProLayout 正确渲染
- [ ] C8 `pnpm build` 通过

### Phase 1a 总体判定

- [ ] ✅ **通过** — 全部 202 项验收通过
- [ ] ❌ **不通过** — 存在一票否决项未通过 或 总通过率 < 90%
- [ ] [~] **有条件通过** — 一票否决项全部通过且总通过率 ≥ 90%，非关键项有明确修复计划

---

## 附录 A：模块与 SDD/TDD 文档索引

| 模块 # | 模块名 | SDD 文档 | TDD 文档 | 验收项数 |
|:-----:|--------|----------|----------|:-------:|
| 1 | 内核骨架 | plugin-framework-sdd.md（§启动/健康） | plugin-framework-tdd.md | 8 |
| 2 | 数据库 Schema | database-schema.md | — | 14 |
| 3 | CLI 工具 | dev-workflow.md（§CLI） | — | 7 |
| 4 | plugin-core Bootstrap | plugin-core-sdd.md | plugin-core-tdd.md | 8 |
| 5 | 迁移管理 | migration-engine-sdd.md | migration-engine-tdd.md | 7 |
| 6 | 插件框架 | plugin-framework-sdd.md | plugin-framework-tdd.md | 8 |
| 7 | JWT 认证 | rbac-sdd.md（§认证） | rbac-tdd.md | 9 |
| 8 | 基础 RBAC | rbac-sdd.md | rbac-tdd.md | 7 |
| 9 | 多租户骨架 | multi-tenant.md | — | 6 |
| 10 | 审计日志 | audit-sdd.md | audit-tdd.md | 7 |
| 11 | 国际化骨架 | i18n-sdd.md | i18n-tdd.md | 7 |
| 12 | 管理 UI | admin-ui-sdd.md | admin-ui-tdd.md | 14 |
| 13 | 日志/调试 | logging-infra-sdd.md | logging-tdd.md | 7 |
| 14 | 速率限制 | api-conventions.md（§6） | — | 6 |
| 15 | API 规范与约定 | api-specification.md + api-conventions.md | — | 8 |
| — | 集成测试 | e2e-test-flows.md | — | 25 |
| — | 非功能需求 | dev-workflow.md（§3） | — | 32 |
| — | 文档完备性 | AGENTS.md + memorys/ | — | 10 |
| — | CI/CD 健康检查 | dev-workflow.md（§2） | — | 12 |

## 附录 B：使用说明

### 验收执行流程

1. **逐模块验收**：每个模块开发完成后，对照本清单逐项检查
2. **先功能后非功能**：先完成 #1-#15 功能验收，再执行集成测试和非功能检查
3. **CI 先行**：C1-C12 每次 PR 自动触发，C8 阻断型
4. **一票否决优先**：若任一否决项不通过，暂停验收直至修复
5. **最终汇总**：Phase 1a 结束前完成所有 202 项并填入通过率汇总表

### 标记规则

| 标记 | 含义 | 操作 |
|:----:|------|------|
| [ ] | 待验收 | 初始状态 |
| [✅] | 通过 | 验证方法执行后 PASS |
| [❌] | 未通过 | 明确验证失败，记录失败原因和修复责任人 |
| [~] | 部分通过 | 功能实现但有欠缺（如性能不达标），需有修复计划 |

### 参考文档

- Phase 划分: `docs/phase-planning.md`
- 架构文档: `docs/architecture.md` §七
- E2E 流程: `docs/modules/e2e-test-flows.md`
- 种子策略: `docs/modules/test-seed-strategy.md`
- 开发工作流: `docs/modules/dev-workflow.md`
- 编码约定: `.agents/memorys/conventions.md`
- 已知坑点: `.agents/memorys/pitfalls.md`
- 安全规则: `.agents/rules/common/security.md`