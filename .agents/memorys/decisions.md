# AUDEBase 架构决策记录

**更新日期**: 2026-07-09

## 架构决策 (D1-D9)

### D1: 微内核 + 插件热插拔架构
- **决策**: 采用 NocoBase 式微内核架构，每个业务系统（OA/ERP/MES 等）作为独立插件套件运行
- **替代方案**: Odoo 单体模式（所有业务逻辑在同一进程中）、纯微服务（运维成本高）
- **理由**: 故障隔离、独立开发/部署、插件市场支持、业务灵活性
- **参考**: NocoBase 微内核设计、Odoo 模块化思想
- **状态**: 已决策，Phase 1 MVP 实现插件框架。Phase 2 采用四层信任分组模型（见 D1.1）。

### D1.1: 四层信任分组模型
- **决策**: 插件不采用「每插件独立进程」，而采用基于信任度的四层进程分组
- **层级**: SYSTEM（平台插件共享进程）→ Domain（业务域共享进程）→ Isolated（第三方每插件进程）→ Container（不可信容器隔离）
- **组内通信**: 直接函数调用（0ms延迟，无需序列化）
- **组间通信**: JSON-RPC over stdin/stdout + Core 路由（同步 RPC） + Redis Pub/Sub（异步事件）
- **资源**: 50 插件由原方案 50 进程/2.5-4GB 降为 8-12 进程/0.4-0.7GB
- **manifest 命名**: `runtime.mode`（inline | process | container）和 `runtime.partition`（SYSTEM | oa | erp | mes | ...）
- **信任边界**: 组间通信受访问控制矩阵约束（SYSTEM→全部、Domain→同域直调+RPC、Isolated→白名单、Container→全禁），详见 docs/plugin-architecture-analysis.md §4.2 信任边界表
- **参考**: VS Code Extension Host 组内共享模型、Chrome site isolation 信任分级、Erlang OTP 应用组
- **详情**: 见 docs/plugin-architecture-analysis.md
- **状态**: 已决策

### D1.2: PluginHost 接口抽象
- **决策**: Phase 1 实现 InlinePluginHost，但接口从 Day 1 支持跨进程语义
- **mock 约束**: async Promise、JSON 序列化/反序列化、30s 超时、1-5ms 延迟注入
- **状态**: 已决策，Phase 1 实现

### D1.3: 插件通信架构
- **决策**: 组内直接函数调用（0ms）；组间 JSON-RPC over stdin/stdout（同步 RPC）+ Redis Pub/Sub（异步事件）
- **安全**: 启动握手 token + nonce 防重放 + 帧级认证 + content-length 帧协议（1MB 上限）
- **契约**: manifest.exports 声明 API 契约 + Zod schema 类型校验 + ServiceRegistry 服务发现
- **参考**: VS Code Extension Host（同进程）、gRPC（契约）、NATS（pub/sub）
- **状态**: 已决策

### D1.4: 插件生命周期
- **决策**: 7 个生命周期钩子（afterAdd/beforeLoad/load/install/afterEnable/afterDisable/pre_uninstall + 升级钩子）
- **迁移**: NocoBase 3 阶段迁移（beforeLoad→afterSync→afterLoad）+ version_gated
- **状态机**: Phase 1 2 状态（loaded/disabled），Phase 2 NocoBase 5 状态
- **参考**: NocoBase PluginManager、Odoo module lifecycle
- **状态**: 已决策

### D1.5: manifest.yaml 规范
- **决策**: Phase 1 包含字段：name/version/display_name/description/category/license/application/entry/author/dependencies/assets/lifecycle/runtime(mode+partition+crash_policy)/security(db_namespace)/exports/provides/permissions/models/locale/data
- **Phase 2 增加**: external_dependencies/demo/sequence/auto_install
- **状态**: 已决策
### D2: manifest.yaml 插件声明系统
- **决策**: 每个插件通过 manifest.yaml 声明元数据、依赖、版本、权限、数据模型
- **替代方案**: package.json 声明（信息不足）、数据库注册（耦合运行态）
- **理由**: Odoo 式声明模式成熟；文件即接口，不依赖运行时；CI/CD 友好
- **参考**: Odoo `__manifest__.py`、NocoBase plugin package.json
- **状态**: 已决策

### D3: Schema Engine 动态模型
- **决策**: 借鉴 NocoBase Schema Engine，运行时动态定义数据模型（Collection + Field），无需代码生成
- **替代方案**: 静态 Prisma/Drizzle schema 编译期定义、纯配置文件
- **理由**: 支持非开发人员通过 UI 配置模型；Schema → DB DDL 自动迁移；Schema → UI Form/Table 自动渲染
- **参考**: NocoBase Collection System
- **状态**: 已决策，Phase 2 实现

### D4: 多租户数据库级隔离
- **决策**: Phase 1 采用单数据库 + tenant_id 字段隔离；Phase 2 支持 Database-per-tenant
- **替代方案**: Schema-per-tenant（PostgreSQL schema 隔离）、Shared-table（行级安全 RLS）
- **理由**: Phase 1 简单高效验证架构；Phase 2 完整数据隔离满足合规需求；混合模式支持灵活部署
- **参考**: Odoo Multi-Company、NocoBase 多租户
- **状态**: 已决策

### D5: TypeScript 全栈 + Node.js + Fastify 后端
- **决策**: 平台全栈 TypeScript；后端运行时 Node.js + Fastify
- **替代方案**: Python/Django（Odoo 栈）、Java Spring Boot（企业传统选型）、Go（高性能）
- **理由**: TS 全栈统一降低团队技能门槛；Fastify 原生插件系统与 AUDEBase 插件框架深度契合；JSON Schema 验证内置；Node.js v22 worker_threads 解决 CPU 密集型；Odoo 替代方案 Python 单体架构增加了全栈复杂度
- **参考**: Fastify 官方文档、NocoBase 技术栈
- **状态**: 已决策

### D6: React + Tailwind CSS v4 + shadcn/ui + Ant Design 5
- **决策**: React 19 + Tailwind v4 作为基础框架；shadcn/ui 处理通用组件；Ant Design 5 处理数据密集型页面
- **替代方案**: Vue 3 + Element Plus（国内流行但生态略小）、纯 shadcn/ui（Table/Form 不够强）、纯 antd（定制主题不便）
- **理由**: React 生态最大；shadcn/ui 可复制不捆绑；antd 企业级组件成熟；两者共存互补。shadcn/ui 依赖 Tailwind v4（硬依赖），两者绑定选择
- **参考**: React 官方、shadcn/ui、Ant Design
- **状态**: 已决策

### D6.1: shadcn/ui 版本锁定与供应链安全
- **决策**: 锁定shadcn/ui组件版本（不自动更新），registry URL指向项目私有fork
- **理由**: shadcn/ui的copy-model将组件源码直接加入项目（非npm依赖），registry注入攻击可被Git diff直接审计
- **审计**: 组件更新通过PR review + diff审查（与npm audit互补）
- **状态**: 已决策

### D7: Schema 驱动 UI
- **决策**: 页面结构通过 JSON Schema 描述，运行时动态渲染，无需前端代码
- **替代方案**: 纯代码组件（灵活但不低代码）、完全拖拽（复杂度高）
- **理由**: NocoBase 验证过的模式；非开发者可配置页面；Schema 可存储/版本化/共享
- **参考**: NocoBase Schema UI、Formily（阿里开源 Schema 表单方案）
- **状态**: 已决策，Phase 2 实现

### D8: Zod 边界验证
- **决策**: Zod schema 用于所有系统边界输入验证，自动推导 TypeScript 类型
- **理由**: TypeScript 类型推导、运行时验证、声明式 schema 定义、与 Fastify JSON Schema 互补
- **状态**: 已决策

### D8.1: JWT密钥管理
- **决策**: JWT密钥通过环境变量注入（AUDE_JWT_SECRET），启动时校验非空且≥32字符
- **理由**: NocoBase CVE-2025-13877(CVSS 9.8)默认JWT密钥导致任意用户冒充
- **实现**: Fastify启动时 assert(process.env.AUDE_JWT_SECRET.length >= 32)，拒绝默认值
- **参考**: OWASP JWT Cheat Sheet
- **状态**: 已决策

### D9: Drizzle ORM 数据库操作
- **决策**: Drizzle ORM 作为数据库访问层（锁定 0.45.x LTS），通过 DatabaseProvider 抽象层封装
- **理由**: Type-safe、SQL-like API适合schema-engine、自动参数化防注入、PlanetScale收购背书；pre-1.0风险通过DatabaseProvider接口抽象（未来可零成本切换ORM）
- **风险**: pre-1.0（v1.0 预计2026 Q3-Q4），CVE-2026-39356(7.5)已修复于v0.42+
- **缓解**: DatabaseProvider接口隔离所有业务代码，CI集成测试验证迁移兼容性
- **状态**: 已决策

### D9.1: Drizzle连接池与监控
- **决策**: 使用pg-pool连接池（默认10连接），pino记录慢查询（>100ms）
- **监控**: Phase 1通过Core日志聚合查看连接池状态；Phase 2引入PgBouncer统一连接管理
- **索引**: 所有包含tenant_id的查询必须以tenant_id为首列索引（避免全表扫描）
- **状态**: 已决策

### D10: Record Rules（记录级权限）
- **决策**: 借鉴 Odoo domain filter 表达式，manifest.permissions 中声明 record_rule
- **实现**: Core ORM 层自动注入 WHERE 条件（tenant_id + record_rule）
- **参考**: Odoo ACL + Record Rules
- **状态**: 已决策

### D11: 字段级权限
- **决策**: manifest.exports 中 visible_to 声明字段可见角色
- **实现**: Core API 响应时自动过滤不可见字段；Schema UI 自动隐藏不可见输入框
- **参考**: NocoBase field-level ACL
- **状态**: 已决策

### D12: Core 数据 API 代理
- **决策**: 插件默认不直连数据库。所有 DB 操作通过 Core 数据 API 代理（JSON-RPC）
- **例外**: manifest 中声明 security.db_direct: true 的 Isolated 插件可获得独立 PG 连接
- **理由**: 统一注入 tenant_id + record_rules + 字段过滤；防止插件绕过权限
- **参考**: Odoo ORM 单一数据访问路径、NocoBase CVE GHSA-v8vm-cqh8-q87q
- **状态**: 已决策

### D13: Saga 跨插件事务
- **决策**: 跨插件工作流采用 Saga 补偿模式
- **实现**: execute() + compensate() + 持久化日志（saga_log 表）+ 幂等性（idempotency_key）
- **限制**: Core 崩溃后未完成 Saga 悬挂（已知限制，Phase 4 解决）
- **参考**: NocoBase workflow engine
- **状态**: 已决策

### D14: i18n 国际化
- **决策**: 采用 NocoBase 命名空间隔离模式，插件 locale/{lang}.json 组织翻译
- **实现**: Core 聚合翻译表 + t() 函数注入 PluginHost context
- **Phase 1**: 预加载所有翻译（eager loading）
- **参考**: NocoBase @nocobase/i18n、Odoo .po 文件
- **状态**: 已决策
## 通用决策 (G1-G4)

### G1: 不可变性优先
- **决策**: 始终创建新副本，不就地修改
- **理由**: 防止副作用、简化调试、支持安全并发

### G2: 小文件原则
- **决策**: 200-400 行典型，800 行最大
- **理由**: 高内聚低耦合、易理解、易审查

### G3: 零 as any / @ts-ignore
- **决策**: 禁止类型断言绕过，使用 unknown + 类型收窄
- **理由**: 保持类型安全、避免运行时错误

### G4: interface 优先于 type
- **决策**: 对象形状使用 interface，联合类型/映射类型使用 type
- **理由**: interface 可扩展、更好的错误提示

## 已废弃决策（旧 MODACS 架构）

以下决策原为 MODACS 工业控制平台制定，因 AUDEBase 定位变更已废弃。
更新后的架构决策见 `docs/plugin-architecture-analysis.md`。所有新决策（D1.1-D1.5、D10-D14）详见 docs/plugin-architecture-analysis.md：

| 决策 | 原内容 | 废弃原因 |
|------|--------|----------|
| D1 (旧) | 多进程插件隔离架构 | AUDEBase 采用渐进式隔离：Phase 1 inline + Phase 2 process。插件架构详情见 docs/plugin-architecture-analysis.md |
| D2 (旧) | UDS JSON-RPC 进程间通信 | Phase 2+ 采用 JSON-RPC over stdin/stdout。Phase 1 所有插件 inline 运行，通过 PluginHost 接口抽象支持未来跨进程通信 |
| D5 (旧) | TypeScript + Rust 实时控制 | AUDEBase 不需要硬实时控制模块 |
| D7 (旧) | 三层 UI 隔离架构 | 架构变更，不再需要 UIAdapter 抽象层 |
