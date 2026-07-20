# AUDEBase 已知坑点与反模式

**更新日期**: 2026-07-15

## MODACS 适配相关

### 全局 MODACS→AUDEBase 替换
- **问题**: 全局替换可能误改有意的迁移文档引用
- **正确做法**: 使用手术式编辑，逐个检查上下文
- **例外**: 当文件内所有引用均为品牌/产品名称时，可安全批量替换
- **验证**: 修改后运行 `grep -ri modacs . --exclude-dir=.git --exclude-dir=.sisyphus --exclude-dir=node_modules`

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

- **最新团队审计发现**: 无新增代码反模式，以下为审计中捕获的已知风险与验证点：

### 测试基础设施占位风险 ✅ 已解决
- ~~问题: 测试文档已就绪但测试框架尚未安装~~
- ✅ Phase 1a 已安装 vitest + @testing-library/react + playwright，752 tests

### shared-types 初始化 ✅ 已解决
- ~~问题: packages/shared-types/ 未创建~~
- ✅ Phase 1a 已创建 shared-types 包

### SDD 与实际编码的落差
- **问题**: plugin-framework-sdd.md 和 migration-engine-sdd.md 是规格文档，非实现代码。SDD 与实现之间可能存在偏差
- **正确做法**: 编码时以 SDD 为契约（Interface/API/生命周期必须匹配），实现细节可灵活调整。CI 集成测试验证偏差

### 懒加载契约
- **问题**: `lazy: () => import()` 签名约束仅存在于文档中，构建期无强制校验
- **正确做法**: Phase 2 引入 ESLint 规则禁止 `async () => { return await import() }` 和 `React.lazy()` 作为路由 lazy 值。Phase 1 直接注册无需校验（见 D22）
- **详见**: decisions.md D22、frontend-spec.md §5

### RTL 测试 ACL 包裹器
- **问题**: 管理 UI 组件测试需要 MockACLWrapper 提供 ACLContext，但此包裹器尚未实现
- **正确做法**: Phase 1a 编码时同步创建 `test-utils.tsx`（MockACLWrapper + renderWithProviders）
- **详见**: dev-workflow.md §3.6（MockACLWrapper + renderWithProviders）
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

## 技术栈相关

### Drizzle pre-1.0 风险
- **问题**: Drizzle ORM 尚未发布 v1.0，API 不保证稳定
- **正确做法**: 锁定 0.45.x LTS，通过 DatabaseProvider 接口抽象隔离。更换 ORM 零成本
- **详见**: decisions.md D9

### Ant Design 5 供应链安全

> shadcn/ui 已废弃（2026-07-10），原 D6.1 安全策略不再适用。

- **决定**: antd 通过 npm 安装，版本锁定在 package.json 中（精确版本，不用 ^/~）
- **CI**: npm audit 每次 PR；Renovate 自动升级 minor/patch
- **CVE**: 定期检查 antd CVE（npm audit / GitHub Advisory Database）
- **@ant-design/pro-components**: 同等对待
- 详见 decisions.md D6.1

### Fastify 国内招聘池
- **问题**: 国内 Fastify 开发者极少（Boss直聘约 3 vs NestJS 约 500）
- **正确做法**: 保持技术适配优先；Express/Koa 开发者 1-2 天可学 Fastify

## 前端架构相关

### ProLayout findDOMNode 弃用警告
- **问题**: ProLayout 内部使用 findDOMNode（ProLayout.js:213），React 18 Strict Mode 下产生 deprecated 警告
- **正确做法**: Phase 1 不使用 React Strict Mode（NocoBase 同方案）；Phase 2 跟踪上游修复（pro-components#8686）
- **详见**: decisions.md D6

### ProTable/ProForm antd v6 兼容性风险
- **问题**: @ant-design/pro-components 子包 peerDependencies 仅声明 antd ^4.24.15 || ^5.11.2，不含 v6
- **正确做法**: 锁定 pro-components 版本 + 跟踪 pro-components#9629 上游更新
- **详见**: decisions.md D6

### 动态 import() 签名反模式
- **问题**: `async () => { return await import() }` 破坏 code splitting（Strapi PR #17685 教训）
- **问题**: `React.lazy()` 作为 lazy 值传入路由 API 会导致运行时崩溃（Strapi PR #17674 教训）
- **正确做法**: lazy 必须为 `() => import()` 箭头函数直接返回，不接受 async 包装或 React.lazy() 包装
- **详见**: decisions.md D22

### 租户切换 CWE-524 信息泄露
- **问题**: `queryClient.clear()` 后客户端 navigate 可能导致旧租户缓存数据瞬间闪现
- **正确做法**: `onlineManager.setOnline(false)` → `queryClient.clear()` → `window.location.href` 全页重载
- **详见**: decisions.md D24

### React Router basename 不支持动态段
- **问题**: React Router v7 的 basename 为静态字符串，不支持 `/{tenantId}/admin` 动态前缀
- **正确做法**: 使用通配路由 `/:tenantId/admin/*` + 手动路径解析
- **详见**: architecture.md §6.11

### Vite 对 antd CSS-in-JS 的 tree-shaking 效果未经验证
- **问题**: NocoBase 使用 Rspack 构建，非 Vite。Vite/Rollup 对 antd 5 的 CSS-in-JS 组件 tree-shaking 效果未知
- **正确做法**: Phase 1 构建配置确定后实测 bundle 大小；若不理想，降级为按需引入子路径（如 antd/es/table）
- **详见**: decisions.md D21

## MCP 集成相关

### drizzle-mcp npm 包名陷阱
- **问题**: npm 上不存在 `drizzle-mcp` 包。搜索到的 Drizzle MCP 实际包名为 `@iflow-mcp/defrex-drizzle-mcp` v1.0.0，binary 名为 `iflow-mcp_defrex-drizzle-mcp`（非直观命名）
- **正确做法**: init-mcp-drizzle.mjs 中包名使用 `@iflow-mcp/defrex-drizzle-mcp`，binary 名使用 `iflow-mcp_defrex-drizzle-mcp`。首次启动时 auto-install
- **详见**: .opencode/init-mcp-drizzle.mjs

### npmmirror 镜像缺失 scoped 包
- **问题**: npm 配置的 npmmirror.com（淘宝镜像）未同步 `@iflow-mcp/defrex-drizzle-mcp` 等新发布的 scoped 包，导致 `npm install` 返回 404，进而 init 脚本 spawn 找不到 binary → `-32000: Connection closed`
- **正确做法**: init-mcp-drizzle.mjs 中 install 命令显式指定 `--registry=https://registry.npmjs.org/`。通用方案：在 `.npmrc` 中为 `@iflow-mcp` scope 单独设置 registry
- **详见**: .opencode/init-mcp-drizzle.mjs

### MCP 首次启动超时
- **问题**: npm 包名错误 → 安装失败 → spawn 找不到 binary → 超时 30000ms。或环境变量缺失（如 POSTGRES_MCP_CONNECTION_STRING）→ 进程立即退出 → 连接断开
- **正确做法**: 验证 `npm view <pkg> name version bin` 确认包存在；检查 init 脚本中的依赖环境变量
- **详见**: .opencode/opencode.json §mcp

### run-node.sh wrapper 依赖
- **问题**: 所有 6 个 MCP/LSP 服务器通过 `.opencode/run-node.sh` 包装器调用 node，该脚本依赖 `.pixi/envs/default/bin/node`。如果未运行 `pixi install`，node 不存在，所有 MCP 超时 30000ms
- **正确做法**: 首次启动前必须运行 `pixi install`。run-node.sh 会检查 node 是否存在并报错 `ERROR: node not found at ...`。该脚本将 pixi node bin 目录加入 PATH，解决子进程 shebang `#!/usr/bin/env node` 找不到 node 的问题
- **详见**: .opencode/run-node.sh、.opencode/opencode.json §mcp

## Bootstrap + Pixi 脚本相关

### pixi `platforms` 跨平台锁文件陷阱
- **问题**: 在 `pixi.toml` 添加 `platforms` (如 win-64) 后，`pixi install` 会尝试为所有平台解析依赖。如果 `pixi.lock` 未包含该平台包，解析失败导致整个 install 不可用
- **正确做法**: 添加新平台后立即运行 `pixi lock` 重新生成锁文件；或在 CI 中生成多平台锁文件。临时可回退 platforms 列表
- **详见**: pixi.toml:5、pixi.lock

### pixi task 不支持 shell 展开
- **问题**: pixi.toml `[tasks]` 直接执行命令，不经过 shell。`archive = "git archive ... -o $(date +%Y%m%d).tar.gz"` 中 `$(date)` 不会被展开
- **正确做法**: 将需要 shell 展开的命令移到独立脚本（如 `scripts/archive-source.sh`），pixi task 引用脚本路径
- **详见**: pixi.toml:55 -> scripts/archive-source.sh

### pixi `[feature.runtime]` 必须显式声明
- **问题**: 环境定义 `runtime = { features = ["runtime"] }` 引用不存在的 feature → `pixi install` 静默成功但零依赖解析
- **正确做法**: 每个被环境引用的 feature 必须有对应的 `[feature.xxx]` 或 `[feature.xxx.dependencies]` 节
- **详见**: pixi.toml:17（[feature.runtime.dependencies] 节）

### openspace MCP `pixi run` 连接断开
- **问题**: init-mcp-openspace.mjs 使用 `pixi run openspace-mcp` 调用，但 pixi.toml 无此 task -> spawn 失败 -> MCP 报告 `-32000: Connection closed`
- **正确做法**: init-mcp-openspace.mjs 直接解析 `.pixi/envs/default/bin/openspace-mcp` 路径，绕过 pixi task 查找。添加 auto-install via `pixi run python -m pip install`。opencode.json 中通过 `.opencode/run-node.sh` 包装器调用 init-mcp-openspace.mjs，确保 pixi 环境的 node 在 PATH 中
- **详见**: .opencode/init-mcp-openspace.mjs、.opencode/opencode.json §mcp

### macOS `realpath` 不可用
- **问题**: `pixi-init.sh` 使用 `realpath` 解析路径，macOS 默认不提供此命令（需 `brew install coreutils`）
- **正确做法**: 使用 POSIX 兼容的 `cd "$dir" && pwd -P` 替代 `realpath`
- **详见**: scripts/pixi-init.sh:9 -> `cd "${SCRIPT_DIR}/.." && pwd -P`

### batch `setlocal` 导致 pixi 环境变量丢失
- **问题**: `.bat` 脚本中 `setlocal enabledelayedexpansion` 创建的局部环境在脚本结束时销毁，`pixi shell-hook` 输出的 PATH 等修改全部丢失
- **正确做法**: 移除 `setlocal`（如 pixi-init.bat），或使用 `endlocal &` 模式保留变量
- **详见**: scripts/pixi-init.bat:4（setlocal 仍在，待 Phase 1a Windows 环境测试后处理）

### pixi-shell.bat 无法修改父进程环境
- **问题**: `.bat` 中 `pixi shell` 启动新 shell 子进程，无法像 `.sh` 的 `eval "$(pixi shell-hook ...)"` 那样修改调用者的环境变量
- **正确做法**: .bat 版本改用 `pixi shell-hook` 输出 + 逐行执行，或文档说明只能用于打开新的子 shell
- **详见**: scripts/pixi-shell.bat（已改用 `pixi shell`）

### pixi.toml `platforms` 排除 win-64
- **问题**: pixi.toml `platforms` 列表为 `["osx-64", "osx-arm64", "linux-64", "linux-aarch64"]`，不包含 `win-64`。Windows 用户运行 `pixi install` 时会报 `win-64 is not supported` 错误
- **正确做法**: Phase 1a Windows 环境就绪时，将 `win-64` 添加到 platforms 列表并运行 `pixi lock` 重新生成锁文件。当前仅支持 macOS/Linux 开发
## 行业安全教训

从 15 份竞品参考文档中提取的关键安全 CVE/漏洞，AUDEBase 应在 Phase 1 设计中主动防范：

| CVE / 漏洞 | 项目 | 严重度 | 类型 | AUDEBase 防范措施 |
|------------|------|:------:|------|-------------------|
| CVE-2025-13877 | NocoBase | 9.8 | 默认 JWT 密钥 | D8.1: 启动校验 ≥32 字符，拒绝默认值 |
| GHSA-v8vm-cqh8-q87q | NocoBase | - | DB 直连绕过权限 | D12: Core 数据 API 代理，禁止插件直连 DB |
| CVE-2026-41641 | NocoBase | 7.2 | SQL 注入 via sqlCollection:update | D9: Drizzle 参数化查询 + D12: Core 数据 API 代理 |
| CVE-2026-34825 | NocoBase | - | 工作流 SQL 节点模板变量注入 | D9: Drizzle 参数化查询（Phase 1b+ 工作流引擎） |
| CVE-2025-50341 | Axelor | 7.5 | SQL 注入 via _domain 参数 | D9: Drizzle 自动参数化查询 |
| CVE-2026-39356 | Drizzle ORM | 7.5 | 依赖注入漏洞（已修复于 v0.42+） | D9: 锁定 0.45.x LTS + DatabaseProvider 接口抽象 |
| 多个 XSS | Odoo/Strapi | - | 未净化用户输入渲染 | D6: React 默认转义 + CSP 头 |
| 沙箱绕过 | Axelor/Directus | - | Groovy/JS 沙箱（AsyncFunction/GeneratorFunction 构造器绕过、原型链污染） | D1.1: Container 隔离 + sandbox CSP；Phase 4 禁用 eval/Function 构造器 |
| 默认密码/密钥 | Strapi/Directus | - | 默认 admin:admin | D1.6: admin 默认密码强制首次修改 |
| IDOR（不安全的直接对象引用） | Strapi | - | 缺乏行级权限检查 | D10: Record Rules 自动注入 WHERE 条件 |
| CVE-2026-44442 | ERPNext | - | CWE-862 缺失授权检查 | D10: Record Rules + D19: ACLProvider/ACLGuard 声明式权限控制 |

**通用防范原则**：
- 所有外部输入使用 Zod 验证（D8）
- 所有 DB 操作通过 Drizzle ORM 参数化查询（D9）
- 所有 DB 操作通过 Core API 代理（D12）
- 所有密钥通过环境变量注入，启动校验（D8.1）
- 保持依赖更新（D6.1: Renovate + npm audit）
- 安全设计评审纳入 Phase 1 编码前流程
