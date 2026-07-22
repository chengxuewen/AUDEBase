# AUDEBase 竞品/对标产品调研报告

> **生成日期**: 2026-07-13 | **最后更新**: 2026-07-19
> **目的**: 市场竞品分析、架构学习参考、差异化定位依据  
> **调研范围**: 国际开源 ERP/低代码平台 + 国内低代码平台 + 新兴 AI-Native 平台

---

## 一、产品分类框架

基于架构理念和核心定位，将市面产品分为五大类：

| 类别 | 核心特征 | 代表产品 | AUDEBase 相关度 |
|------|----------|----------|:---:|
| **A. 全功能 ERP 平台** | 开箱即用的业务模块（财务、库存、制造、HR等），模块化但非插件化 | Odoo, ERPNext, Axelor | ⭐⭐⭐⭐⭐ |
| **B. 插件化应用平台** | 微内核 + 插件架构，数据模型驱动，可扩展构建任意企业应用 | NocoBase, Corteza, AuraBoot | ⭐⭐⭐⭐⭐ |
| **C. Headless CMS / BaaS** | API 优先，数据库即后端，内容/数据管理为核心 | Directus, Strapi, Payload | ⭐⭐⭐ |
| **D. 内部工具构建器** | 拖拽式 UI + 数据库/API 连接，快速搭建后台面板 | Appsmith, ToolJet, Budibase | ⭐⭐ |
| **E. 国内低代码平台** | 表单/流程驱动，深度集成国内办公生态（钉钉/企微/飞书） | 简道云, 明道云, 云表 | ⭐⭐⭐ |

---

## 二、A 类：全功能 ERP 平台

### 2.1 Odoo（标杆参照物 #1）

| 维度 | 详情 |
|------|------|
| **定位** | 全球最流行的开源 ERP，模块化企业应用套件 |
| **技术栈** | Python + PostgreSQL + OWL (自有前端框架) |
| **GitHub Stars** | ~41.5K |
| **许可** | LGPL (Community) + 商业许可 (Enterprise) |
| **架构特点** | 单体 Python 进程 + ORM + 模块系统（`__manifest__.py`）；Community 版功能受限（无 Studio、无移动端 App） |
| **核心优势** | 40+ 官方模块覆盖全部业务；5,000+ 全球合作伙伴；成熟生态（40,000+ App Store 模块）；50+ 国家本地化 |
| **核心劣势** | 单体架构难以水平扩展；Enterprise 版本锁定；定制化后的升级困难；Python GIL 性能瓶颈 |
| **定价** | Community 免费；Enterprise $24-$70/用户/月 |
| **AUDEBase 参考价值** | 模块发现机制、`ir.module.module` 数据库注册表、Kahn 算法拓扑排序、`base` 内核模块设计、Record Rules 权限表达式、`ir.attachment` 文件存储模式、模块安装→菜单→视图管线 |

### 2.2 ERPNext（Frappe）

| 维度 | 详情 |
|------|------|
| **定位** | 第二大开源 ERP，基于 Frappe 全栈框架 |
| **技术栈** | Python + MariaDB + Vue.js (Frappe UI) |
| **GitHub Stars** | ~36K |
| **许可** | GPLv3 |
| **架构特点** | Frappe Framework（类似 Django 的全栈框架）+ ERPNext 作为上层应用；元数据驱动 + Desk UI |
| **核心优势** | 完全免费无用户限制；内建 Website Builder；活跃社区（印度/中东/南亚强势）；Frappe Cloud 托管 |
| **核心劣势** | 模块生态远小于 Odoo；无原生 Studio；非 Python 技术栈集成困难；国际化主要服务印度市场 |
| **定价** | 完全免费（自托管）；Frappe Cloud $10/月起 |
| **AUDEBase 参考价值** | Frappe 框架的全栈设计、DocType 元数据建模、Desk UI 自动生成表单/列表 |

### 2.3 Axelor

| 维度 | 详情 |
|------|------|
| **定位** | 法国开源 ERP，低代码优先 + BPMN 2.0 工作流引擎 |
| **技术栈** | Java + Angular/React + PostgreSQL/MySQL |
| **GitHub Stars** | ~1K（Open Suite） |
| **许可** | GPLv3 |
| **架构特点** | Java 框架 + Visual Studio（拖拽建模）+ 内嵌 BPMN 2.0（基于 Activiti）+ 低代码/全代码双模式 |
| **核心优势** | Visual Studio 拖拽式建模（数据模型→表单→工作流）；原生 BPMN 2.0 设计器；低代码优先 + Java 逃生舱；免费自托管 |
| **核心劣势** | 生态极小（~30 合作伙伴）；Java 内存占用高（4GB 基线）；国际化弱（法语区为主）；移动端仅响应式无原生 App |
| **定价** | Open Suite 免费；SaaS €25/用户/月 |
| **AUDEBase 参考价值** | Visual Studio 建模器设计、BPMN 2.0 与 ERP 的深度集成、低代码与全代码的协同模式 |

### 2.4 其他 ERP 平台一览

| 产品 | 技术栈 | 定位 | Stars | 备注 |
|------|--------|------|:-----:|------|
| **Dolibarr** | PHP + MySQL | 轻量 ERP，小微/自由职业 | ~6K | 简单易用，功能有限 |
| **Apache OFBiz** | Java | 老牌企业 ERP 框架 | ~1K | Apache 基金会维护，架构老旧 |
| **Metasfresh** | Java + PostgreSQL | 工业/供应链 ERP | ~900 | 德国制造，专注复杂业务流程 |
| **Metis ERP** | Laravel + FilamentPHP | 新锐 PHP ERP | 新项目 | Laravel 13 + 模块化插件系统 |
| **ERPClaw** | Python | AI-Native ERP | 新项目 | 实验性，"自我改进 ERP"，聊天优先 |

---

## 三、B 类：插件化应用平台（AUDEBase 最直接对标）

### 3.1 NocoBase（标杆参照物 #2，最核心对标）

| 维度 | 详情 |
|------|------|
| **定位** | 开源 AI 无代码/低代码开发平台，微内核 + 插件架构 |
| **技术栈** | TypeScript + Node.js (Koa) + React + Ant Design + Sequelize/Formily(v1) / FlowEngine(v2) |
| **GitHub Stars** | ~22K |
| **许可** | Apache 2.0（核心开源）+ 商业 License 授权（v2.0 起部分商业插件已转开源，不再单独销售） |
| **架构特点** | 微内核（插件管理器）+ 数据模型驱动（数据结构与 UI 解耦）+ 插件即功能（WordPress 模式）；v2 引入 FlowEngine 替代 Formily、AI 员工、多应用/多空间 |
| **核心优势** | 界面与数据彻底解耦（同一数据可有多视图）；插件市场 100+ 插件；字段级/行级权限；多数据源（MySQL/PG/SQLite + 外部 API）；AI 员工 + 工作流 |
| **核心劣势** | v2.0 正式版已发布（2026-02-15），稳定性显著改善；FlowEngine 替代 Formily 仍处于早期；百万级数据性能待验证 |
| **定价** | 核心免费开源；商业 License 授权（不再按插件买断） |
| **v1→v2 关键变化** | FlowEngine 替代 Formily（自研前端低代码引擎）；多应用（独立进程/DB 的子应用）+ 多空间（逻辑隔离）；基于 ECharts 的数据可视化插件；AI 员工（翻译/分析/调研角色） |

**AUDEBase 直接对比：**

| 维度 | NocoBase | AUDEBase |
|------|----------|----------|
| 插件架构 | 微内核，所有功能皆为插件 | 微内核 + 四层信任分组（SYSTEM/Domain/Isolated/Container） |
| 数据层 | Sequelize ORM，单数据库 | Drizzle ORM + DatabaseProvider 抽象 |
| 前端 | Ant Design 5 + Formily/FlowEngine | Ant Design 5 + ProLayout，自研 Schema→antd 映射器 |
| 后端框架 | Koa | Fastify |
| 权限模型 | 字段/行级 ACL | Record Rules（Odoo 模式）+ 字段级权限 |
| 多租户 | v2 多应用/多空间 | 四阶段演进（tenant_id→PG Schema→Database-per-tenant） |
| 插件安全 | 无信任分级，同一进程 | 四层信任分组，组间 JSON-RPC 隔离 |
| i18n | 20+ 语言 | NocoBase 命名空间 + react-i18next 双命名空间 |
| 商业化 | License 授权模式 | 待定 |

### 3.2 Corteza

| 维度 | 详情 |
|------|------|
| **定位** | 开源 Salesforce 替代品，企业级低代码平台 |
| **技术栈** | Go 后端 + Vue.js 前端 + PostgreSQL/MySQL + Docker |
| **GitHub Stars** | ~1.5K |
| **许可** | Apache 2.0 |
| **架构特点** | API 优先 + 微服务（Corteza Server / Corredor 自动化执行器 / Discovery 搜索）；Low Code 配置（模块→字段→页面→图表）；自动化（BPMN 工作流 + JS 脚本） |
| **核心优势** | Go 语言高性能后端；内建 Federation（跨实例联邦数据共享）；BPMN 2.0 工作流 + JavaScript 脚本双自动化模式；RBAC + MFA + OpenID Connect/SAML/LDAP 完善认证；Data Privacy Console（GDPR 合规） |
| **核心劣势** | 社区小，生态弱；Vue.js 2 前端（迁移缓慢）；商业支持依赖 Crust Technology |
| **AUDEBase 参考价值** | Federation 架构设计、Data Privacy Console（字段级敏感数据标记）、Corredor 自动化执行器隔离设计 |

### 3.3 AuraBoot

| 维度 | 详情 |
|------|------|
| **定位** | AI-Native 企业业务平台，DSL 引擎 + 插件架构 |
| **技术栈** | Java 21 (Spring Boot 3.5) + TypeScript (React 19 + Tailwind CSS 4) + PostgreSQL + Redis |
| **GitHub Stars** | ~2（新项目） |
| **许可** | 源码可用（AuraBoot License v1.3，基于 Apache 2.0 + 补充条款） |
| **架构特点** | PF4J 插件框架 + 六大声明概念（Model/Page/Command/Permission/Process/Plugin）+ DSL 引擎（JSON 声明→DB Schema + REST API + UI）+ BPMN 2.0 工作流（SmartEngine） |
| **核心优势** | DSL 驱动（一个 Model 声明 = DB 表 + REST API + 表单 + 列表页）；五层权限（RBAC + ReBAC + 组织范围 + ABAC + 字段级）；BPMN 2.0 长流程编排；AI Agent 安全调用表面；~20 个内置插件（CRM/HR/BPM/资产管理等） |
| **核心劣势** | 极新（2026-03 创建），生产就绪度未知；Java 栈学习曲线；社区几乎为零 |
| **AUDEBase 参考价值** | DSL 引擎设计、五层权限模型、PF4J 插件框架集成方式、BPMN 2.0 与 Command 概念的融合 |

### 3.4 其他插件化平台一览

| 产品 | 技术栈 | 定位 | 备注 |
|------|--------|------|------|
| **AUSUS Framework** | Laravel + React + PostgreSQL | 元数据优先、插件可组合的企业应用平台 | 四重安全保证（租户/权限/审计/工作流），PHP 生态 |
| **CBAP OSS** | Java 21 (Spring Boot) + React/MUI | 元数据驱动的可组合业务应用平台 | Schema 版本化、工作流引擎、实体/属性级权限，早期开发 |
| **Shesha** | .NET (ASP.NET Core + ABP.io) + React/Next.js | .NET 低代码框架 | 表单拖拽构建器、动态 CRUD API、App Themer |
| **Zeroplat** | .NET 9 (ABP.io) + React 18 | 低代码/无代码平台 | 多租户、BPM 引擎、Marketplace、完整源码交付 |
| **NovaBuilder** | 未公开 | 模块化、自托管企业平台 | 强调"系统优先"而非工具，仍处于开发中 |

---

## 四、C 类：Headless CMS / Backend-as-a-Service

这类产品以"内容/数据管理 + API 自动生成"为核心，是 AUDEBase Schema Engine 的重要参考。

### 4.1 Directus

| 维度 | 详情 |
|------|------|
| **定位** | 数据库优先的开放数据平台，将任何 SQL 数据库变为 API 和管理后台 |
| **技术栈** | TypeScript + Node.js + Vue.js |
| **GitHub Stars** | ~28K |
| **许可** | BSL（源码可用，非 OSI 开源） |
| **架构特点** | 数据库优先（连接现有数据库，不绑架 schema）+ Flows（可视化自动化）+ Insights（仪表盘）+ AI Assistant + MCP Server + WebSocket/GraphQL Subscriptions 实时 API |
| **核心优势** | 连接任何 SQL DB（PG/MySQL/MariaDB/MSSQL/SQLite/Oracle/CockroachDB）；自动生成 REST + GraphQL API；字段级 RBAC；Flows + Hooks 可视化自动化；AI Assistant 可操作数据 |
| **核心劣势** | 非 OSI 开源（BSL 许可）；"数据库优先"模型不适合需要自定义业务逻辑的场景 |
| **AUDEBase 参考价值** | 数据库优先的 schema 感知、Flows 自动化设计、多数据库适配器模式、实时 API（WebSocket + GraphQL Subscriptions） |

### 4.2 Strapi

| 维度 | 详情 |
|------|------|
| **定位** | 最流行的开源 Headless CMS |
| **技术栈** | TypeScript + Node.js (Koa) + React |
| **GitHub Stars** | ~64K |
| **许可** | MIT |
| **架构特点** | 内容类型优先（代码定义 schema）+ 自动生成 REST/GraphQL API + Admin Panel + 插件市场 + Lifecycle Hooks |
| **核心优势** | MIT 真正开源；最大社区和插件生态（150K+ 用户）；内容建模灵活（Dynamic Zones）；版本化迁移 |
| **核心劣势** | 期望拥有 DB schema（不支持"数据库优先"）；无原生实时 API；v4→v5 迁移成本高 |
| **AUDEBase 参考价值** | 插件市场生态设计、Dynamic Zones 概念、Lifecycle Hooks 模式 |

### 4.3 其他 Headless CMS/BaaS

| 产品 | 技术栈 | 定位 | Stars | 备注 |
|------|--------|------|:-----:|------|
| **Payload** | TypeScript + Next.js | 代码优先 Headless CMS | ~32K | 类型安全，与 Next.js 深度集成 |
| **KeystoneJS** | TypeScript + Next.js + Prisma | 可编程 CMS | ~9K | GraphQL 优先，高度可定制 |
| **Supabase** | TypeScript + PostgreSQL | Firebase 替代品/BaaS | ~75K | 实时数据库 + Auth + Storage + Edge Functions |
| **NocoDB** | TypeScript + Node.js | 开源 Airtable | ~50K | 将数据库变为智能表格，非应用构建器 |

---

## 五、D 类：内部工具构建器

这类产品面向"快速搭建后台面板"，架构灵活度有限，但开发者体验和生态值得参考。

### 5.1 Appsmith

| 维度 | 详情 |
|------|------|
| **定位** | 开发者优先的低代码内部工具构建器 |
| **技术栈** | Java 后端 + React 前端 (TypeScript) |
| **GitHub Stars** | ~37K |
| **许可** | Apache 2.0 |
| **核心特征** | 45+ Widget 拖拽 + JavaScript 逻辑 + 20+ 数据源 + Git 版本控制 |
| **适合场景** | 快速后台面板、数据仪表盘、CRUD 管理界面 |
| **局限** | 无工作流引擎、无插件体系、UI 定制有限、企业治理弱 |

### 5.2 ToolJet

| 维度 | 详情 |
|------|------|
| **定位** | AI-Native 开源低代码内部工具平台 |
| **技术栈** | TypeScript + React + Node.js |
| **GitHub Stars** | ~38K |
| **许可** | AGPLv3 |
| **核心特征** | 60+ 组件 + 80+ 集成 + JavaScript/Python 双语言 + AI Agents (LangChain) + 工作流引擎 |
| **适合场景** | AI 增强的内部工具、企业级安全（SOC 2 Type II）、自动化工作流 |

### 5.3 Budibase

| 维度 | 详情 |
|------|------|
| **定位** | 面向非技术团队的内部工具构建器 |
| **技术栈** | TypeScript + Svelte + Node.js |
| **GitHub Stars** | ~25K |
| **许可** | GPLv3 |
| **核心特征** | 内建数据库 + 自动 UI 生成 + RBAC + 自动化 + 30+ 数据源 |
| **适用场景** | 轻量 CRUD 应用、快速原型、小团队内部工具 |

### 5.4 内部工具构建器对比

| 维度 | Appsmith | ToolJet | Budibase |
|------|:---:|:---:|:---:|
| GitHub Stars | 37K | 38K | 25K |
| 开源许可 | Apache 2.0 | AGPLv3 | GPLv3 |
| UI 组件数 | 45+ | 60+ | 有限 |
| 数据源集成 | 20+ | 80+ | 30+ |
| 自定义代码 | JavaScript | JS + Python | 脚本 |
| AI 能力 | 基础 GPT 插件 | AI Agents + LangChain | GPT 功能 |
| 工作流 | 基础 | 内建引擎 | 基础自动化 |
| 企业治理 | 基础 | 高级（SOC 2, RBAC, 审计） | 基础 RBAC |
| 适合团队 | 开发者主导的初创 | 企业级 + AI 需求 | 小团队快速搭建 |

---

## 六、E 类：国内低代码平台

### 6.1 核心玩家对比

| 平台 | 所属公司 | 核心定位 | 架构类型 | 部署方式 | 50人年费 |
|------|----------|----------|----------|----------|:---:|
| **简道云** | 帆软 | 表单驱动、通用型零代码 | 组件编排型 | SaaS + 私有 | ~¥8,360 |
| **明道云** | 明道 | APaaS、私有部署强 | 组件编排型 | SaaS + 私有 | ~¥20,900 |
| **云表** | 云表科技 | 工业级复杂应用、"画表格"编程 | 模型驱动型 | 私有为主 | 定制报价 |
| **氚云** | 奥哲/钉钉 | 钉钉原生低代码 | 组件编排型 | SaaS | ~¥1,980 |
| **宜搭** | 阿里云 | 开发者友好 | 代码生成型 | SaaS + 专有云 | ~¥4,388 |
| **轻流** | 轻流科技 | 无代码、业务人员搭建 | 组件编排型 | SaaS | ~¥9,600 |
| **织信Informat** | 织信 | 强定制、代码生成 | 代码生成型 | SaaS + 私有 | 定制报价 |
| **用友YonBuilder** | 用友 | 企业级、ERP 延伸 | 模型驱动型 | 私有为主 | 面议 |
| **金蝶苍穹** | 金蝶 | 企业级、财务为核心 | 模型驱动型 | 私有为主 | 面议 |
| **钉钉宜搭** | 阿里 | 钉钉生态、中小企业 | 代码生成型 | SaaS + 专有云 | ~¥4,388 |
| **黑湖小工单** | 黑湖科技 | 制造业 MES 轻量 | 组件编排型 | SaaS | 按产线 |

### 6.2 架构流派分析

国内低代码平台底层架构分三大流派：

| 架构类型 | 核心机制 | 适用场景 | 扩展上限 | 代表 |
|----------|----------|----------|:---:|------|
| **模型驱动型** | 元数据映射 + 自动代码生成 | 复杂 ERP/CRM/供应链 | 高（支持二次开发） | JNPF, 用友, 金蝶, 云表 |
| **组件编排型** | 可视化拖拽 + 预设逻辑块 | 轻量审批/数据看板 | 中（受限于官方组件） | 明道云, 简道云, 氚云, 轻流 |
| **代码生成型** | 模板引擎 + 标准工程输出 | 强定制/遗留系统迁移 | 极高（全栈可控） | 织信, 钉钉宜搭 |

### 6.3 关键洞察

1. **简道云 vs 明道云** 是两大代表：简道云（表单驱动 + 帆软 BI 基因）适合数据采集→审批→报表场景；明道云（APaaS + 业务对象建模）适合复杂多表关联业务。
2. **云表** 是国内少有的支持 MES/WMS/ERP 等工业级复杂应用的平台，独创"画表格"编程 + 业务公式功能。
3. **国内平台普遍特点**：深度集成钉钉/企微/飞书；SaaS 优先（私有部署成本 2-3×）；按人头/按年收费；支持等保三级认证。
4. **NocoBase 在国内的独特定位**：是唯一同时具备"开源 + 插件架构 + 自托管 + 国际化"的平台，简道云/明道云为 SaaS 为主的闭源产品。

---

## 七、AI-Native 新兴平台

| 产品 | 定位 | 核心特征 | 成熟度 |
|------|------|----------|:---:|
| **Nocco** | "一句话造 CRM/ERP" | 自然语言→完整全栈应用（DB + API + 前端 + 权限 + 审批流），源码可导出，支持企微/飞书/钉钉 | 商用 Beta |
| **Zenku** | AI 优先 No-Code 引擎 | 多 Agent 架构（Schema/UI/Logic/Query/Testing Agents）+ 动态 UI 渲染 + 内建撤销/时间机器 | 早期开源 |
| **ERPClaw** | AI-Native ERP | 聊天优先 + 自学习 + 自我改进 OS + 18 条宪法约束 AI 生成 | 实验性 |
| **Synapse** | AI 驱动的 Laravel 应用构建器 | Laravel + Filament 包，视觉页面构建 + n8n 风格流程引擎 + AI 生成 | MIT 开源 |

**启示**：AI-Native 是确定趋势，但当前阶段普遍处于实验/早期阶段。AUDEBase 可将 AI 能力作为插件生态的增量特性（参考 NocoBase v2 AI 员工），而非核心卖点。

---

## 八、综合对比矩阵

### 8.1 核心技术维度

| 产品 | 后端语言 | 前端框架 | 数据库 | 插件/扩展系统 | 开源许可 | 成熟度 |
|------|:---:|:---:|:---:|:---:|------|:---:|
| **Odoo** | Python | OWL (自研) | PostgreSQL | 模块系统 | LGPL/商业 | ⭐⭐⭐⭐⭐ |
| **NocoBase** | TypeScript/Node.js | React | PG/MySQL/SQLite | 微内核插件 | Apache 2.0 | ⭐⭐⭐ |
| **ERPNext** | Python | Vue.js | MariaDB | Frappe App | GPLv3 | ⭐⭐⭐⭐ |
| **Axelor** | Java | Angular/React | PG/MySQL | Low-code Studio | GPLv3 | ⭐⭐⭐ |
| **Corteza** | Go | Vue.js | PG/MySQL | Low Code 配置 | Apache 2.0 | ⭐⭐⭐ |
| **AuraBoot** | Java | React | PostgreSQL | PF4J 插件 | 源码可用 | ⭐ |
| **Directus** | TypeScript/Node.js | Vue.js | 多 SQL DB | Extensions | BSL | ⭐⭐⭐⭐ |
| **Strapi** | TypeScript/Node.js | React | PG/MySQL等 | 插件市场 | MIT | ⭐⭐⭐⭐ |
| **Appsmith** | Java | React | 多数据源 | Widget | Apache 2.0 | ⭐⭐⭐⭐ |
| **ToolJet** | TypeScript/Node.js | React | 多数据源 | 组件 | AGPLv3 | ⭐⭐⭐⭐ |
| **简道云** | 未公开 | 未公开 | 未公开 | 模板生态 | 闭源 | ⭐⭐⭐⭐ |
| **AUDEBase** | TypeScript | React/antd 5 | PostgreSQL | **四层信任分组插件** | 待定 | 🔲 Phase 0 |

### 8.2 架构理念维度

| 产品 | 数据模型 | 架构范式 | 安全隔离 | 多租户 | 工作流 |
|------|----------|----------|:---:|:---:|:---:|
| **Odoo** | ORM 模型 | 单体模块化 | 模块级/Record Rules | tenant_id 字段 | 审批流（有限） |
| **NocoBase** | Collection + Field（元数据） | 微内核 | 字段/行级 ACL | v2 多应用/多空间 | 可视化工作流 |
| **ERPNext** | DocType（元数据） | 全栈框架 | 角色权限 | 无原生 | 基础 |
| **Axelor** | XML/Visual 建模 | Java 单体 | RBAC | 无原生 | BPMN 2.0（强） |
| **Corteza** | Module + Field 配置 | 微服务 | RBAC + 联邦 | 无原生 | BPMN + JS 脚本 |
| **AuraBoot** | JSON DSL 声明 | 单体 | 五层权限模型 | RBAC 多租户 | BPMN 2.0 |
| **Directus** | DB Schema 感知 | 数据库优先 | 字段级 RBAC | 无原生 | Flows 可视化 |
|| **AUDEBase** | Schema Engine 动态模型 | 微内核 + 四级分组 | **进程隔离 + ACL 矩阵**（Phase 2 设计目标） | **四阶段演进** | Saga（Phase 4） |

### 8.3 AUDEBase 差异化定位

| 维度 | 市面产品普遍做法 | AUDEBase 差异化 |
|------|-----------------|-----------------|
|| **插件安全** | 同一进程、信任所有插件 | **四层信任分组**（SYSTEM/Domain/Isolated/Container）+ 组间 JSON-RPC 隔离（Phase 2 设计目标） |
|| **插件隔离** | 无隔离或全隔离（每插件独立进程，资源开销大） | 渐进式分组（Phase 2 设计目标：50 插件从 50 进程/2.5-4GB 降至 8-12 进程/0.4-0.7GB） |
| **权限模型** | 简单 RBAC 或 ACL | **Record Rules**（Odoo domain filter 表达式，Odoo 自 2005 年验证）+ 字段级 + 租户级三层权限 |
| **多租户** | 大多无原生支持或简单的 tenant_id | **四阶段演进路径**（tenant_id→PG Schema→Database-per-tenant→混合），Phase 1 可跑，Phase 2 可合规 |
| **ORM 抽象** | 强绑定特定 ORM | **DatabaseProvider 接口抽象**（Drizzle 0.45.x LTS 锁定，可零成本切换 ORM） |
| **前端** | Formily/自研框架/原生代码 | **Anti Design 5 + ProLayout**（NocoBase 验证路径）+ 自研 Schema→antd 映射器 |
| **扩展模型** | 插件即功能（NocoBase/WordPress） | **manifest.exports 契约**（API 声明 + Zod Schema 校验 + ServiceRegistry 服务发现） |
| **文件存储** | 本地文件系统或 DB 存储 | **SHA-256 content-addressed 去重存储**（行业标准模式：MinIO/S3 + DB 元数据，Odoo ir.attachment 同款） |

---

## 九、关键学习要点（按优先级）

### 9.1 从 Odoo 学习

- **模块发现与注册**：`ir.module.module` 数据库表 + `__manifest__.py` 文件扫描模式
- **`base` 内核模块**：零依赖、auto_install、预置基础模型（用户/角色/菜单/视图）
- **安装管线**：拓扑排序 → 导入模块 → 建表 → 加载安全规则 → 加载视图 → 加载数据
- **Record Rules**：domain filter 表达式，自动注入 WHERE 条件
- **Record Rules**：domain filter 表达式，自动注入 WHERE 条件

> **落地**: D1.6 (内核插件 Bootstrap)、D1.4 (生命周期)、D1.7 (迁移管理)、D10 (Record Rules)
### 9.2 从 NocoBase 学习

- **插件管理器生命周期**：afterAdd→beforeLoad→load→install→afterEnable 钩子链
- **数据模型驱动 UI**：Collection→Field→Block 三层抽象
- **插件市场生态**：插件即功能 + 一次性买断 + 100+ 内置插件
- **AI 员工模式**：角色化 AI（翻译员/分析员/调研员），集成到业务流程和界面
- **AI 员工模式**：角色化 AI（翻译员/分析员/调研员），集成到业务流程和界面

> **落地**: D1.4 (插件生命周期)、D3/D7 (Schema→UI 映射)、D25 (NocoBase 迁移)
### 9.3 从 Axelor/Corteza 学习

- **BPMN 2.0 与 ERP 深度集成**（Axelor）：工作流直接操作业务对象
- **低代码 Studio + 代码逃生舱**（Axelor）：80% 拖拽 + 20% Java/Groovy
- **Federation 联邦架构**（Corteza）：跨实例数据共享 + RBAC 控制
- **Federation 联邦架构**（Corteza）：跨实例数据共享 + RBAC 控制

> **落地**: D13 (Saga 跨插件事务)、D10 (Record Rules)
### 9.4 从 AuraBoot 学习

- **DSL 引擎设计**：JSON 声明→DB Schema + REST API + UI 一体化
- **五层权限模型**：RBAC + ReBAC + 组织范围 + ABAC + 字段级
- **AI Agent 安全调用**：声明操作的风险等级和幂等性
- **AI Agent 安全调用**：声明操作的风险等级和幂等性

> **落地**: D10+D19 (RBAC)、D11 (字段级权限)；ReBAC/ABAC 超出 MVP 范围
### 9.5 从国内平台学习

- **生态集成深度**：钉钉/企微/飞书的组织架构同步、审批流程、消息推送
- **实施门槛**：简道云 3 天上手 → 业务人员可自主搭建

> **落地**: D6 (Ant Design 5)、D16 (ProLayout)、D24 (多租户 UI)
- **定价模式**：按人头/年计费为主，一次性买断为辅

---

## 十、附录：数据来源

- GitHub 仓库及社区数据
- 各平台官方文档及官网
- NocoBase 官方博客及对比文章
- Odoo vs Axelor/ERPNext 等对比报告
- 国内低代码平台测评报告（算数科技、Worktile、华为云社区、腾讯云社区）
- 各开源平台技术架构文档（Context7, DeepWiki）

---

> **文档维护**: 建议随市场变化每季度更新一次。重点跟踪 NocoBase v2 稳定版发布、AuraBoot 生态成长、AI-Native 平台成熟度。
