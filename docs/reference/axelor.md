# Axelor — 产品画像

> **分析日期**: 2026-07-10 | **分类**: 全功能 ERP + Low-Code BPM 平台 | **AUDEBase 相关度**: ⭐⭐⭐⭐
>
> **分析目的**: 作为欧洲开源 ERP 市场 Odoo 的主要竞争者，Axelor 在低代码建模、BPMN 2.0 深度集成方面有独特优势。本画像重点剖析其技术架构、Visual Studio 建模器设计哲学、BPM 引擎与 ERP 的耦合模式，为 AUDEBase Phase 2 的 Schema Engine 和 Phase 4 的工作流引擎提供设计参考。

---

## 目录

1. [产品概述](#1-产品概述)
2. [技术架构深度分析](#2-技术架构深度分析)
3. [核心功能](#3-核心功能)
4. [应用/模块系统](#4-应用模块系统)
5. [权限与安全](#5-权限与安全)
6. [部署与运维](#6-部署与运维)
7. [市场与社区](#7-市场与社区)
8. [历史教训与已知问题](#8-历史教训与已知问题)
9. [AUDEBase 可借鉴点](#9-audebase-可借鉴点)
10. [关键数据速查](#10-关键数据速查)

---

## 1. 产品概述

### 1.1 一句话定位

**Axelor 是法国开源低代码 ERP 平台**，以 BPMN 2.0 工作流引擎 + Visual Studio 拖拽建模为核心差异化能力，提供 50+ 业务模块覆盖 ERP、CRM、HR、财务、制造等企业全业务链。它的核心竞争力在于"低代码优先"——业务分析师无需编码即可通过拖拽完成数据建模、表单设计和工作流编排，同时保留 Java/Groovy 代码逃生舱供开发者深度扩展。

### 1.2 基本信息

| 维度 | 详情 |
|------|------|
| **创始年份** | 2005 年（法国巴黎） |
| **公司** | Axelor Group（CEO 未公开，总部巴黎） |
| **许可** | AGPLv3（Open Suite 社区版）+ 商业许可（Pro/Enterprise） |
| **社区规模** | GitHub ~455 stars (Open Platform) + ~937 stars (Open Suite)，~110 贡献者，~30 合作伙伴，~1M 用户 |
| **当前版本** | Open Platform v8.2.2 (2026-06)，Open Suite v9.0.4 (2026-03) |
| **维护策略** | 频繁小版本发布（v8.0→v8.1→v8.2 均在 2025-2026），重大版本迁移需手动 SQL 脚本 |

### 1.3 发展历程关键节点

| 年份 | 版本 | 里程碑 |
|------|------|--------|
| 2005 | 早期 | 公司成立于巴黎，开始 Java 企业应用开发 |
| 2014 | — | GitHub 首次公开（axelor-open-suite），开源社区起步 |
| 2016 | AOP 5.x | Axelor Open Platform 框架发布，独立于业务模块 |
| 2021 | AOP 6.x | Java 8 → Java 11 迁移，Hibernate 5.4，Groovy 2.5，JUnit 5 |
| 2023 | AOP 7.x | JDK 11 稳定期，引入 React 前端组件，Studio 模块成熟 |
| 2025 | AOP 8.0 | **历史性架构升级**：Java 11→21 (LTS)，Java EE→Jakarta EE 10+（javax.*→jakarta.* 全命名空间迁移），代码生成器从 Groovy 重写为纯 Java，Nashorn JS 引擎→GraalVM JavaScript，引入 Valkey 替代 Redis |
| 2025 | AOS 9.0 | Open Suite 主版本升级，50+ 模块全面适配 Jakarta EE |
| 2026 | AOP 8.2 | 安全加固（沙箱逃逸修复、文件上传内容校验）、审计系统异步化、Pac4j/Shiro 依赖升级 |

**关键决策节点**：

- **2025 年（AOP 8.0）** — Java EE → Jakarta EE 10+ 全命名空间迁移是 Axelor 史上最大的 Breaking Change。这要求所有模块、所有第三方依赖同步升级，迁移脚本需要 Eclipse Transformer 批量处理。这一决策反映了 Axelor 对 Java 生态长期演进的紧跟策略，但也增加了下游用户的升级成本。
- **2025 年代码生成器 Java 化** — 放弃 Groovy 编写的代码生成器，用纯 Java 重写。原因：Groovy 动态特性导致生成器行为难以预测，IDE 支持差。这反映了动态语言在基础设施层的长期维护成本。
- **2026 年审计系统异步化** — 将审计日志从同步事务内写入改为异步后处理，引入 `AuditLog` 持久化表、重试机制和自适应背压控制。这是 Java 单体架构在高负载下必要的性能优化路径。

### 1.4 核心设计哲学

Axelor 的设计哲学可概括为"**低代码优先，代码不缺席**"：

- **XML 定义一切**：数据模型（`domain-models.xml`）、视图（`views.xml`）、菜单（`menus.xml`）、动作（`actions.xml`）均以 XML 声明式定义。代码生成器将 XML 编译为 Java POJO + JPA Repository，框架层自动提供 CRUD UI。
- **Visual Studio 作为"零代码加速器"**：在 XML 之上提供拖拽式表单设计器，生成的定制以 `MetaJsonModel`/`MetaJsonField` 存储在数据库中，不触发数据库 Schema 迁移。这实现了"业务分析师可配置"与"DBA 可控"的平衡。
- **BPMN 2.0 作为编排主线**：工作流不是插件，而是平台原生能力。BPM 引擎（基于 Activiti 分支）与数据模型、表单、权限系统深度耦合。业务分析师在 BPM Studio 中设计流程，直接引用业务对象和表单。
- **Guice 依赖注入实现模块化**：每个业务模块通过 `AxelorModule`（继承自 Google Guice `AbstractModule`）声明服务绑定。模块间通过接口注入解耦，支持链式绑定（chain binding）实现模块对默认行为的覆盖。

### 1.5 对标关系

在开源 ERP 赛道中，Axelor 的定位介于：

- **Odoo**（Python 单体，生态庞大）→ Axelor 在 BPMN 工作流和低代码建模上显著领先，但在模块广度、社区生态、国际化上差距明显
- **ERPNext**（Python + Frappe 框架）→ Axelor 的 Java 技术栈在企业 IT 部门中更受欢迎，但 Frappe 的 DocType 元数据建模更成熟
- **NocoBase**（TypeScript 微内核）→ Axelor 的 BPM 能力远超 NocoBase，但插件架构和前端现代化程度不如
- **Camunda / Flowable**（独立 BPM 引擎）→ Axelor 的 BPM 与 ERP 深度耦合，零集成成本，但独立部署和横向扩展能力弱于专业 BPM 引擎

---

## 2. 技术架构深度分析

### 2.1 总体架构

```
┌──────────────────────────────────────────────────────────────────┐
│                        前端层 (Browser)                            │
│  ┌──────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │  View Builder     │  │  BPM Studio       │  │  Standard UI   │  │
│  │  (React 拖拽表单)  │  │  (BPMN 2.0 建模器) │  │  (JSP + jQuery │  │
│  │  HTML5 内嵌视图    │  │  bpmn-js 渲染     │  │  / Angular)    │  │
│  └────────┬─────────┘  └────────┬─────────┘  └───────┬───────┘  │
├───────────┼─────────────────────┼─────────────────────┼──────────┤
│           │        JAX-RS REST API / JSON-RPC          │          │
├───────────┼─────────────────────┼─────────────────────┼──────────┤
│                    服务层 (Java 单体进程内)                         │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │  Guice 依赖注入容器                                         │  │
│  │  ├─ AxelorModule 模块注册（每个业务模块声明绑定）             │  │
│  │  ├─ 服务层 (Service + ServiceImpl，Guice 管理生命周期)       │  │
│  │  └─ 控制器层 (@RequestScoped JAX-RS 资源类)                  │  │
│  ├────────────────────────────────────────────────────────────┤  │
│  │  ORM 层 (Hibernate 6.6 + JPA 3.2)                          │  │
│  │  ├─ XML → 代码生成器 → JPA Entity + Repository             │  │
│  │  ├─ Hibernate 二级缓存 (Caffeine / Redisson / JCache)       │  │
│  │  ├─ 字段加密 (AES-256 + PBKDF2WithHmacSHA256)              │  │
│  │  └─ 审计追踪 (AuditTracker → AuditLog 异步持久化)           │  │
│  ├────────────────────────────────────────────────────────────┤  │
│  │  安全层 (Apache Shiro 2.1 + PAC4J 6.5)                      │  │
│  │  ├─ AuthRealm（认证 + 授权 Realm）                           │  │
│  │  ├─ Permission/Role/Group/User 权限模型                     │  │
│  │  ├─ Argon2id 密码哈希                                        │  │
│  │  └─ SSO: CAS/OAuth2/SAML/OpenID Connect (PAC4J)            │  │
│  ├────────────────────────────────────────────────────────────┤  │
│  │  BPM 引擎 (Activiti 分支，内嵌)                              │  │
│  │  ├─ BPMN 2.0 流程定义 + 实例管理                             │  │
│  │  ├─ DMN 决策表编辑器 + 引擎                                  │  │
│  │  ├─ 表达式构建器 / 查询构建器 / Mapper / Web Service 脚本     │  │
│  │  └─ 流程实例监控 + 运行时 YAML 修改 + Token 模拟              │  │
│  ├────────────────────────────────────────────────────────────┤  │
│  │  Studio 引擎                                                │  │
│  │  ├─ MetaJsonModel / MetaJsonField (JSON 存储自定义模型)     │  │
│  │  ├─ View Extension (XPath 注入到标准 XML 视图)               │  │
│  │  └─ Studio App 打包/导出/导入 (环境间迁移)                   │  │
│  └────────────────────────────────────────────────────────────┘  │
├──────────────────────────────────────────────────────────────────┤
│                    基础设施层                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ Tomcat   │  │PostgreSQL │  │  Redis/   │  │  Apache/Nginx │   │
│  │ 10.1     │  │   (主库)   │  │  Valkey   │  │  (反向代理)    │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 关键技术决策分析

#### 2.2.1 XML 驱动代码生成

Axelor 最核心的技术特征。所有实体模型定义在 `src/main/resources/domains/` 目录下以 XML 描述，代码生成器（`./gradlew generateCode`）生成：

- **JPA Entity 类**：标准 POJO + Hibernate 注解，附带计算字段、集合字段处理逻辑
- **JPA Repository 类**：提供 `save()`、`find()`、`all()` 等 CRUD 方法 + Finder 方法
- **元数据**：框架在运行时通过反射 + 注解提取字段的 `title`、`help`、`required`、`search` 等属性，自动生成表单 UI

**优势**：声明式建模，一处定义多处使用（数据库→Java→UI）；XML Schema 校验避免手写代码错误；`allocationSize` 等性能参数声明式控制。

**劣势**：XML 与生成的 Java 代码之间存在"同步断裂"风险——修改生成的 Java 代码会被下次 `generateCode` 覆盖；复杂计算逻辑嵌入 XML 的 `<![CDATA[...]]>` 块中，无 IDE 支持，难以调试。

#### 2.2.2 Java 单体 + Guice DI

与 Odoo 的 Python 单体类似，Axelor 所有业务模块在同一 JVM 进程内运行。Google Guice 作为 DI 容器管理所有 Service 和 Controller 的生命周期：

- `@RequestScoped` 控制器：每个 HTTP 请求创建 Controller 实例，注入 Service
- 链式绑定（Chain Binding）：`bind(HelloServiceImpl.class).to(HelloServiceSaleImpl.class)` 实现模块对默认实现的覆盖，而不需要修改接口绑定
- 模块间解耦：通过接口注入而非具体类，模块可替换任何一个 Service 实现

**与 AUDEBase D1.1（四层信任分组）对比**：Axelor 无任何插件隔离。所有模块共享同一 JVM 堆、同一数据库连接池、同一安全上下文。一个模块的 OOM 或死锁会拖垮整个系统。这是 Java 单体 ERP 的典型架构，与 Odoo 类似，但 AUDEBase 的四层信任分组从根本上解决了这个问题。

#### 2.2.3 前端技术栈演进

Axelor 的前端呈现显著的"技术过渡期"特征：

- **历史层**：JSP + jQuery UI + Bootstrap + AngularJS（遗留页面）
- **现代层**：React（View Builder Studio、BPM Studio 等新组件）
- **混合渲染**：View Builder 作为 React 应用以 HTML 内嵌视图形式运行在主应用中，通过 JAX-RS API 与后端通信

这种"前后端不分离又逐步分离"的状态，与 NocoBase 的 AMD→ESM 迁移类似，反映了老牌企业软件的现代化困境。Axelor 没有 Odoo 的 OWL 那样自研统一前端框架，而是选择渐进式引入 React。

#### 2.2.4 BPMN 2.0 引擎

Axelor 的 BPM 引擎基于 Activiti 分支，但做了深度定制：

- **BPMN 2.0 完整元素支持**：事件（开始/结束/中间/边界）、任务（用户/服务/脚本/手动）、网关（排他/并行/包容/事件）、子流程
- **Groovy 脚本集成**：服务任务可直接编写 Groovy 脚本，通过表达式构建器（Expression Builder）、查询构建器（Query Builder）等 GUI 工具辅助生成
- **DMN 决策表**：独立的 Decision Model and Notation 编辑器，用于业务规则管理
- **运行时管理**：流程实例监控、变量可视化、YAML 脚本修改运行中实例、Token 模拟执行
- **版本迁移**：支持 BPM 模型版本间的实例迁移

**关键限制**：BPM 引擎与 Axelor 主应用捆绑在同一进程内，无法独立部署。在大规模流程场景下，BPM 引擎的工作负载直接影响 ERP 系统的响应性能。

#### 2.2.5 字段加密机制

Axelor 提供了内建的字段级 AES-256 加密：

- 密钥通过 PBKDF2WithHmacSHA256 从密码派生（600,000 次迭代）
- 加密字段在数据库中以密文存储，Hibernate 层透明加解密
- v8.1.2 引入了加密字段迁移工具：支持密钥轮换、算法切换、JDBC 批处理迁移
- 迁移时自动推断旧加密参数——若仅轮换算法而密码不变，无需配置 `old-password`

**与 AUDEBase D8.1 + D12 对比**：AUDEBase 采用 Core 数据 API 代理架构，所有 DB 操作经过 Core 统一注入权限过滤，天然的集中加密点。而 Axelor 的加密在 JPA Entity 层实现，需要每个关注加密的实体自行声明。

### 2.3 技术栈总览

| 层级 | 技术 | 版本（当前） |
|------|------|-------------|
| **语言** | Java | 21 LTS |
| **企业规范** | Jakarta EE | 10+ |
| **Servlet 容器** | Apache Tomcat | 10.1.x |
| **Web 服务器** | Apache/Nginx | 反向代理 |
| **DI 框架** | Google Guice | 7.0 |
| **ORM** | Hibernate (JPA 3.2) | 6.6.x |
| **数据库** | PostgreSQL | 14+ (也支持 MySQL) |
| **缓存** | Redis / Valkey / Caffeine | — |
| **安全框架** | Apache Shiro + PAC4J | 2.1 + 6.5 |
| **BPM 引擎** | Activiti (定制分支) | 内嵌 |
| **脚本语言** | Groovy 4.0 | GraalVM JavaScript |
| **前端（旧）** | JSP + jQuery + Bootstrap | — |
| **前端（新）** | React + bpmn-js | — |
| **构建工具** | Gradle | 8.x |
| **测试框架** | JUnit 5 | 5.x |
| **密码哈希** | Argon2id (Shiro) | — |
| **文件类型检测** | Apache Tika | — |

---

## 3. 核心功能

### 3.1 业务模块全景

Axelor Open Suite 提供 50+ 业务应用，覆盖以下领域：

| 领域 | 模块 | 成熟度 |
|------|------|--------|
| **CRM** | 客户管理、商机跟踪、营销活动 | ⭐⭐⭐ |
| **销售** | 报价、订单、合同、价格表 | ⭐⭐⭐⭐ |
| **采购** | 供应商管理、采购订单、收货 | ⭐⭐⭐⭐ |
| **库存** | 多仓库、批次/序列号追踪、库存移动 | ⭐⭐⭐⭐ |
| **财务** | 总账、应收应付、银行对账、多币种 | ⭐⭐⭐⭐ |
| **会计** | 法国会计标准（PCG），国际化较弱 | ⭐⭐⭐ |
| **制造** | MRP、生产订单、BOM、APS 高级排程 | ⭐⭐⭐⭐ |
| **HR** | 员工管理、考勤、休假、轻量薪资 | ⭐⭐⭐ |
| **项目管理** | 任务、甘特图、里程碑、工时 | ⭐⭐⭐ |
| **文档管理** | 附件、版本管理、DMS | ⭐⭐⭐ |
| **多公司** | 多实体、多币种、跨公司交易 | ⭐⭐⭐ |
| **电商** | 有限（无内置 POS，无原生电商前端） | ⭐⭐ |
| **Helpdesk** | 工单管理 | ⭐⭐⭐ |

### 3.2 低代码能力：Visual Studio

Axelor Studio 是平台的低代码核心，包含三个层次：

**第一层：Visual View Builder（拖拽表单设计器）**

- 基于 React 的拖拽表单设计器，以 HTML 视图内嵌于主应用中
- 组件面板：Panel（Tab/Group/Notebook）、基础字段（String/Integer/Date/Boolean/Select）、关联字段（Many-to-One/One-to-Many/Many-to-Many）
- 属性面板：右侧边栏配置选中字段的 `title`、`required`、`readonly`、`min/max`、`default` 等
- 两种模式：
  - **Custom Model 模式**：创建全新数据模型，存储为 `MetaJsonModel`/`MetaJsonField`（JSON），不触发数据库 Schema 变更
  - **View Extension 模式**：扩展现有标准模型视图，通过 XPath 注入自定义字段到标准 XML 视图
- **条件表达式**：`showIf`/`hideIf`/`requiredIf`/`readonlyIf` 控制字段动态行为

**第二层：Studio Components（后端组件管理）**

- 通过标准 Grid/Form 界面管理 Studio 组件（模型、字段、菜单、动作、选择列表）
- 五种动作类型：创建记录、更新数据、执行脚本、打开视图、发送邮件
- 选择列表（Selections）：管理下拉选项，支持颜色和图标

**第三层：Studio App 打包**

- 将 Studio 创建的所有组件（模型、字段、菜单、动作、图表、仪表板）打包为可安装应用
- 跨环境导出/导入（通过 App Loader → JSON 文件）
- 生命周期管理：安装、卸载、删除

**关键设计决策**：Studio 创建的自定义模型使用 JSON 存储而非 DDL——这意味着无需数据库迁移、不会锁表、不依赖 DBA。但代价是：JSON 字段无法利用数据库索引优化查询，复杂关联查询性能较差。

### 3.3 BPM 工作流引擎

Axelor 的 BPM 能力是其在开源 ERP 市场的最大差异化优势：

**BPM Studio（BPMN 建模器）**

- 基于 bpmn-js 的 Web 建模器，完全在浏览器中运行
- 支持 BPMN 2.0 完整元素（事件、任务、网关、子流程）
- 拖拽调色板 + 属性面板 + 工具栏
- DMN 编辑器：创建和管理决策表
- 辅助构建器：表达式构建器、查询构建器、Mapper、Web Service 脚本——这些是 GUI 工具，帮助非开发人员生成 Groovy 脚本

**运行时能力**

- 流程实例监控：查看运行中/已完成实例的状态、变量、错误
- 运行时修改：通过 YAML 脚本手动修改运行中流程实例的变量和节点
- Token 模拟：在设计模式下模拟流程执行，用于培训和新流程测试
- 版本迁移：BPM 模型升级时，可将旧版本实例迁移到新版本
- 无限循环检测：可配置任务评估上限，防止死循环流程耗尽资源

**关键限制**

- BPM 引擎与主应用捆绑，无法独立扩展
- 大规模并行流程（1000+ 实例同时运行）性能未公开验证
- Groovy 脚本的执行沙箱曾多次被绕过（v8.1.1 修复了 `AsyncFunction`/`GeneratorFunction` 等构造函数逃逸）
- 无原生的跨系统 Saga 事务编排能力

### 3.4 BI 与报表

- 11 种图表类型：柱状图、折线图、饼图、环形图、雷达图、仪表盘等
- 仪表板：组装图表、Grid 视图、自定义视图
- 报表基于 JasperReports（Java 生态标准报表引擎）
- Enterprise 版提供高级 BI 功能

### 3.5 AI 集成

- Enterprise 版提供集成 AI 模块（v9 阶段逐步推出）
- 具体 AI 功能（LLM 集成、智能助手、预测分析）细节公开有限
- 与 Odoo 18 的 AI 集成相比，Axelor 的 AI 策略更为低调

---

## 4. 应用/模块系统

### 4.1 模块结构

Axelor 的模块系统围绕 Gradle 多项目构建和 Guice Module 组织：

```
axelor-contact-module/
├── build.gradle                # Gradle 构建配置
├── src/
│   ├── main/
│   │   ├── java/
│   │   │   └── com/axelor/contact/
│   │   │       ├── service/    # Service + ServiceImpl
│   │   │       ├── controller/ # JAX-RS Controller
│   │   │       └── ContactModule.java  # Guice 模块注册
│   │   ├── resources/
│   │   │   ├── domains/        # 实体 XML 定义（代码生成源）
│   │   │   │   ├── contact.xml
│   │   │   │   └── address.xml
│   │   │   ├── views/          # UI 视图 XML
│   │   │   │   ├── contact-form.xml
│   │   │   │   └── contact-grid.xml
│   │   │   └── i18n/           # 国际化消息
│   │   └── webapp/             # 静态资源（JSP, JS, CSS）
│   └── test/
```

### 4.2 模块依赖与加载

- **依赖声明**：通过 Gradle `build.gradle` 的 `dependencies` 声明对其他模块的依赖
- **加载机制**：Guice 扫描 classpath 中所有 `AxelorModule` 子类，构建依赖注入图
- **链式绑定**：`bind(DefaultService.class).to(CustomService.class)` 实现模块间行为覆盖，不需修改上游模块代码

### 4.3 模块版本管理

- 模块版本与 Open Suite 主版本绑定（无独立版本号）
- Add-on 模块通过 `axelor-addons` 仓库单独管理
- 无类似 Odoo 的模块商店或 NocoBase 的插件市场
- 模块安装通过 Admin UI 的"应用管理"面板手动激活

### 4.4 与 AUDEBase 插件架构对比

| 维度 | Axelor 模块 | AUDEBase 插件（规划） |
|------|------------|---------------------|
| **定义方式** | Gradle 模块 + XML 实体 + Guice Module | manifest.yaml 声明（D2） |
| **隔离级别** | 无隔离，共享 JVM | 四层信任分组（D1.1） |
| **安装方式** | 构建时编译，运行时激活 | 运行时热加载（D1.4） |
| **版本管理** | 与主版本绑定 | 独立 SemVer 版本号 |
| **依赖解析** | Gradle 构建依赖 | Core 拓扑排序运行时解析 |
| **服务注册** | Guice DI 容器 | ServiceRegistry + exports 契约（D1.3） |
| **前端加载** | JSP/React 打包进 WAR | 动态 import() ESM + Vite (D17) |

---

## 5. 权限与安全

### 5.1 认证机制

Axelor 的认证基于 **Apache Shiro 2.1** + **PAC4J 6.5** 双层架构：

- **Shiro 层**：`AuthRealm`（继承自 `AuthorizingRealm`）负责用户名/密码认证和权限信息查询。密码使用 Argon2id 哈希（通过 `shiro-tools-hasher` 命令行工具生成）
- **PAC4J 层**：提供多协议 SSO 支持——CAS、OAuth2、SAML、OpenID Connect、LDAP。`AuthPac4jModule` 继承 `ShiroWebModule` 并配置 PAC4J 安全过滤器链
- **Session 管理**：支持 Shiro 原生 Session（`DefaultWebSessionManager`），可配置超时时间和缓存策略

### 5.2 授权模型（RBAC + 细粒度权限）

Axelor 的权限体系是标准的 RBAC 模型，包含四个核心元素：

```
User ──→ Role ──→ Permission ──→ 对象/字段级访问控制
  │                    │
  └──→ Group ──→ Role ┘
```

**Permission 对象属性**：

| 属性 | 说明 |
|------|------|
| `object` | 完全限定类名或通配包名（如 `com.axelor.sale.db.*`） |
| `canRead` | 授予读取权限 |
| `canWrite` | 授予更新权限 |
| `canCreate` | 授予创建权限 |
| `canRemove` | 授予删除权限 |
| `canExport` | 授予导出权限 |
| `canImport` | 授予导入权限 |
| `condition` | JPQL WHERE 子句（位置参数），实现**行级数据过滤** |
| `conditionParams` | 逗号分隔的条件参数列表（对应当前上下文求值） |

**权限解析顺序**（由近到远）：

1. 用户直接分配的 Permission
2. 用户角色的 Permission
3. 用户所在 Group 的 Permission
4. 用户所在 Group 的角色 Permission

**策略**：Deny all → Grant selectively（默认全部拒绝，显式授权）。这是 Apache Shiro 推荐的最安全策略。

**权限生效机制**：Shiro 的 `AuthorizingRealm.doGetAuthorizationInfo()` 方法从数据库加载权限并缓存。通过 `@RequiresPermissions`、`@RequiresRoles` 注解进行声明式权限检查，或在 JSP 模板中使用 `<shiro:hasPermission>` 标签。

### 5.3 条件权限（Record Rules 等价物）

Axelor 的 `condition` + `conditionParams` 机制本质上等价于 Odoo 的 Record Rules：

```
Permission:
  object: com.axelor.sale.db.Order
  canRead: true
  canWrite: true
  condition: "self.saleOrder.salesPerson.id = ?1"
  conditionParams: "__user__.id"
```

上述规则限制用户只能查看和编辑自己作为销售人员的订单。这种机制比单纯的 CRUD 权限更强大，但在 Axelor 的实际使用中远不如 Odoo 的 Record Rules 那样普及和文档化。

### 5.4 安全事件与 CVE

| CVE / 事件 | 严重度 | 描述 |
|-----------|--------|------|
| CVE-2025-50341 | 高 | Boolean-based SQL 注入（`_domain` 参数），影响 v5.2.4 |
| 沙箱逃逸 (v8.1.1 修复) | 高 | `AsyncFunction`/`GeneratorFunction`/`AsyncGeneratorFunction` 构造函数绕过表达式沙箱 |
| 原型污染 (v8.1.1 修复) | 中 | `this`、`__proto__`、`prototype`、`constructor` 属性未拦截，允许沙箱逃逸 |
| XSS (v8.1.2 修复) | 中 | 下载文件名使用 `innerHTML` 而非 `textContent`，允许脚本注入 |
| 文件上传绕过 (v8.1.2 修复) | 中 | 文件扩展名校验被绕过——声明 `.pdf` 但实际内容为 `.exe`；修复后使用 Apache Tika magic bytes 检测 |
| 文件上传二次绕过 (v8.1.2 修复) | 中 | Tika 的 filename hint 参数影响了内容类型推断，攻击者可通过伪造扩展名绕过 |

**安全设计的核心问题**：Axelor 的安全策略属于"防守-修复"模式。表达式沙箱反复被绕过（黑名单式安全），文件上传也是从仅检查声明类型→检查 magic bytes→移除 filename hint 逐步加固。这与 AUDEBase 的 D12（Core 数据 API 代理白名单模式）和 D8.1（JWT 密钥强制校验）的事前设计哲学形成对比。

### 5.5 脚本安全策略（v8.0 引入）

AOP 8.0 引入了 `ScriptingPolicy`——限制 Groovy 和 Expression Language 脚本对应用类的访问。默认情况下，大多数应用类对脚本不可见。这一策略是为了防止低代码场景下业务用户编写的脚本访问敏感 API。但在 v8.1.1 之前，该策略存在多个沙箱逃逸路径。

---

## 6. 部署与运维

### 6.1 部署架构

标准部署架构：

```
Client (HTTPS/443)
       │
       ▼
Apache/Nginx (反向代理 + SSL 终结)
       │ HTTP/AJP
       ▼
Apache Tomcat 10.1 (Servlet 容器，内嵌 Axelor WAR)
       │ JDBC
       ▼
PostgreSQL 14+ (主数据库)
```

可选组件：Redis/Valkey（Hibernate 二级缓存、Shiro Session 共享、Redisson 分布式缓存）。

### 6.2 部署方式

| 方式 | 说明 |
|------|------|
| **传统 WAR 部署** | `./gradlew build` → 拷贝 WAR 到 Tomcat `webapps/` 目录 |
| **Gradle 分发包** | `./gradlew installDist` → 生成包含 Tomcat + WAR 的自包含目录 |
| **Docker** | 官方提供 `axelor/aio-erp` 一体化镜像（含 PostgreSQL + Tomcat + Nginx） |
| **Docker Compose** | 第三方社区方案（Monogramm/pmoscode），分离 PostgreSQL 和 Tomcat 容器 |

### 6.3 资源需求

| 环境 | 最低配置 | 推荐配置 |
|------|---------|---------|
| **开发** | 2 CPU, 4GB RAM, 10GB 磁盘 | 4 CPU, 8GB RAM |
| **生产（小型）** | 4 CPU, 8GB RAM, SSD | 8 CPU, 16GB RAM |
| **生产（中型）** | 8 CPU, 16GB RAM, SSD | 16 CPU, 32GB RAM |

Java 单体架构的一个天然问题是内存占用高。JVM 堆 + Hibernate 缓存 + Tomcat 连接池 + BPM 引擎的基线内存消耗通常为 2-4GB，50 并发用户场景建议 8GB RAM 起步。

### 6.4 扩展特性

- **水平扩展**：由于是单体架构，扩展方式为部署多个 Tomcat 实例 + 负载均衡器（如 Nginx）。所有实例共享同一 PostgreSQL 数据库
- **Session 共享**：通过 Redis/Valkey 集中存储 Shiro Session，实现无状态水平扩展
- **缓存一致性**：使用 Redisson 分布式缓存实现集群环境下的 Hibernate 二级缓存一致性
- **已知问题**：v8.1.2 之前，连接池耗尽可能导致 Redisson MapLoader 死锁；多租户缓存在集群环境中会过早驱逐

### 6.5 与 AUDEBase D5/D21 对比

| 维度 | Axelor | AUDEBase |
|------|--------|----------|
| **运行时** | Java 21 + Tomcat 10.1 | Node.js v22 + Fastify |
| **并发模型** | 线程池（Tomcat worker threads） | 事件循环 + worker_threads |
| **内存基线** | 2-4GB（单实例） | < 256MB（单实例，8-12 进程） |
| **扩展方式** | 水平复制单体 | 四层分组天然支持多进程（D1.1） |
| **前端构建** | Gradle 打包 WAR，无现代 HMR | Vite HMR + Vendor 分组（D21） |
| **容器化** | 官方一体化 Docker 镜像 | 预期每层独立容器 |

---

## 7. 市场与社区

### 7.1 GitHub 统计

| 仓库 | Stars | Forks | 贡献者 | 发布数 |
|------|:-----:|:-----:|:------:|:-----:|
| [axelor/axelor-open-platform](https://github.com/axelor/axelor-open-platform) | ~455 | ~332 | ~20 | 136 |
| [axelor/axelor-open-suite](https://github.com/axelor/axelor-open-suite) | ~937 | ~726 | ~110 | 631 |
| [axelor/open-suite-webapp](https://github.com/axelor/open-suite-webapp) | ~214 | ~186 | — | — |
| [axelor/axelor-addons](https://github.com/axelor/axelor-addons) | ~47 | ~28 | — | — |
| [axelor/axelor-docker](https://github.com/axelor/axelor-docker) | ~39 | ~28 | — | — |

**总代码量**：Open Suite 仓库中 Java 占比 98.8%，可见业务代码主要集中在 Java 后端。TypeScript 仅出现在 Open Platform 框架仓库中（34.9%），对应 React 前端组件。

### 7.2 生态规模

| 维度 | 数据 |
|------|------|
| **合作伙伴** | ~30 家（主要集中在法国/法语欧洲） |
| **活跃开发者** | ~200（估算） |
| **活跃部署** | ~50K 用户（社区版 + 商业版） |
| **全球用户** | > 100 万（含间接用户，官方声称） |
| **本地化国家** | 20+（法国/比利时/瑞士最强，德国/西班牙/意大利可用，英美/印度/沙特需额外本地化工作） |
| **年度大会** | Axelor Days (~500 参与者) |
| **公司规模** | 100+ 员工，7 个办事处（4 大洲），30+ 国家业务 |

### 7.3 商业模式

Axelor 采用经典的 Open Core 模式：

| 版本 | 许可 | 定价 | 包含内容 |
|------|------|------|---------|
| **Community** | AGPLv3 | 免费 | 核心模块（基础 ERP/CRM/HR/库存/销售），社区支持 |
| **Pro** | 商业许可 | €35/用户/月 | 全部 50+ 业务模块 + 更新 + 电子发票 + 标准支持 |
| **Enterprise** | 商业许可 | €55/用户/月 | Pro 全部 + CAS/SSO + 模板 + 高级 BI + 高级 Studio + 高级导入导出 + AI 模块 + 优先支持 |
| **SaaS** | 商业许可 | €25/用户/月 | 云托管版本，无需自建基础设施 |

**最低用户数**：Community 10 用户起，Pro 20 用户起。

### 7.4 与 Odoo 市场对比

| 维度 | Odoo | Axelor |
|------|------|--------|
| **合作伙伴** | 5,000+ 全球 | ~30，EU/France 为主 |
| **活跃开发者** | ~5,000 | ~200 |
| **部署用户** | 7M+ | ~50K-100K (活跃) |
| **本地化国家** | 50+ | 20+ |
| **年度大会** | Odoo Experience (10K+) | Axelor Days (~500) |
| **App 市场** | 40,000+ 应用 | 无公开市场 |
| **连接器** | ~200（Odoo 原生）+ 生态 | 1,500+（官方声称）|
| **TCO 50用户/年** | $35K-$60K | $15K-$45K |

Axelor 的主要市场是**法语区中型企业**（50-200 员工），在这些场景中其 BPM 能力和低代码 Studio 具有明显优势。对非法语区企业，Axelor 的吸引力受限于生态规模和本地化深度。

---

## 8. 历史教训与已知问题

### 8.1 架构债务

#### Java EE → Jakarta EE 迁移（v8.0）

**教训**：这是 Axelor 史上最大的 Breaking Change。`javax.*` → `jakarta.*` 命名空间迁移影响了所有模块和所有第三方依赖。迁移必须使用 Eclipse Transformer 批量处理字节码。虽然这是 Java 生态的必然演进，但集中在一个大版本中完成（而非渐进式），导致下游用户的升级风险高度集中。

**对 AUDEBase 的启示**：Node.js / TypeScript 生态没有如此大范围的命名空间迁移问题，但 npm 的依赖深度是潜在风险。D9 的 DatabaseProvider 抽象层设计——隔离 ORM 实现以便零成本替换——是应对类似生态变迁的正确模式。

#### 代码生成器 Java 化（v8.0）

**教训**：原 Groovy 编写的代码生成器在长期维护中暴露了 IDE 支持差、行为难预测的问题。用 Java 重写是正确决策，但反映了早期技术选型时对动态语言在基础设施层长期维护成本的低估。

**对 AUDEBase 的启示**：基础设施层应使用 TypeScript（类型安全 + IDE 友好），而非 JavaScript。D5 的 TypeScript 全栈决策正是基于此考虑。

#### flush() 行为的依赖回滚（v8.0.2 → v8.1.0）

**教训**：v8.0.2 为了恢复 JDBC 批处理性能，移除了 `JPA.persist()` 和 `JPA.merge()` 中的自动 `flush()`。但大量现有业务流程依赖"persist 后立即可见"的行为（包括 AuditInterceptor 在 persist 时设置 `createdBy`）。v8.1.0 不得不回滚此变更。Release note 中写道："This requires more preparation and details before we can get rid of this anti-pattern strategy"。

这是典型的"为了性能打破隐式契约"——虽然 JPA 规范不保证 persist 后立即可见，但框架代码长期依赖这一行为。任何性能优化都不能改变开发者已知的服务行为。

**对 AUDEBase 的启示**：D13 的 Saga 补偿模式设计须注意——一旦发布，隐式事务语义将构成契约。后续优化不能破坏显式或隐式的行为预期。

### 8.2 安全问题模式

#### 沙箱逃逸的连续性（黑名单式安全）

Axelor 的表达式沙箱采用黑名单模式——拦截已知危险构造函数和属性。v8.1.1 之前，攻击者可以通过 `AsyncFunction`、`GeneratorFunction` 等较少见的构造函数绕过拦截。修复方式也是追加黑名单（增加 `this`、`__proto__`、`prototype`、`constructor`）。

**对 AUDEBase 的启示**：D12 的 Core 数据 API 代理采用**白名单模式**——只允许访问已注册的 Collection。白名单从根本上消除了绕过可能。这是 Axelor 沙箱反复被绕过的反面教材。

#### 文件上传验证的逐步加固

文件上传的安全校验经历了三步演进：声明类型校验 → magic bytes 检测 → 移除 filename hint 避免 Tika 误导。每一步都是在发现前一步被绕过后的加固。

**对 AUDEBase 的启示**：安全设计应从一开始就做到位。文件上传应默认使用内容检测（magic bytes）+ 严格白名单扩展名 + 独立文件存储域（D4.1）。

### 8.3 已知限制

| 限制 | 描述 | 影响 |
|------|------|------|
| **Java 单体** | 所有模块共享 JVM，无故障隔离 | OOM/死锁影响全局 |
| **内存占用高** | JVM 基线 2-4GB（含 Hibernate 缓存） | 小规模部署成本高 |
| **无插件市场** | 无公共应用商店或模块发现机制 | 生态增长受限 |
| **前端技术过渡** | JSP + React 混合，无统一前端框架 | 开发体验不连贯 |
| **国际化弱** | 深度本地化主要集中在法语区 | 全球化部署困难 |
| **移动端** | 仅响应式 Web，无原生 App | 移动场景受限 |
| **电商能力** | 无内置 POS、无原生电商前端 | 零售场景需第三方 |
| **多租户** | 无原生多租户（需部署多实例） | SaaS 提供商需自行实现 |
| **连接池死锁** | Redisson MapLoader 与 JDBC 连接池可能死锁 | v8.1.2 才修复 |
| **缓存一致性** | 多租户缓存集群环境下过早驱逐 | v8.1.2 才修复 |
| **乐观锁错误** | `transactional` 缓存策略导致 stale version | v8.1.2 统一为 `read-write` |
| **无现代 DevOps** | 无 Helm Chart 官方支持、无 K8s Operator | 云原生部署复杂 |

### 8.4 升级痛点

从 v7.x 到 v8.x 的升级路径是所有用户的最大痛点：

1. **Java 11 → 21**：必须同时升级 JDK
2. **Java EE → Jakarta EE**：所有 `javax.*` import 和配置需迁移，官方推荐使用 Eclipse Transformer
3. **Nashorn → GraalVM JS**：所有内嵌 JavaScript 脚本需验证兼容性
4. **Groovy 版本升级**：4.0.x 引入的 breaking changes 可能影响现有脚本
5. **Shiro 版本升级**：2.1.0 的 API 变动
6. **代码生成器输出变化**：生成的 Java 代码可能与手动修改冲突
7. **数据库迁移 SQL**：每个大版本都附带大量 DDL 变更脚本

单个大版本跨越 5+ 项基础设施变更，迁移风险高度集中。

---

## 9. AUDEBase 可借鉴点

### 9.1 应当借鉴（Axelor 的成功模式）

#### ✅ Visual Studio 建模器的分层设计

**Axelor 的做法**：Studio 通过 `MetaJsonModel`/`MetaJsonField` 存储自定义模型（JSON 格式，不触发 DDL），同时通过 View Extension（XPath 注入）扩展标准视图。两种模式互不干扰。

**AUDEBase 如何借鉴**：Phase 2 Schema Engine（D3/D7）应借鉴这种"JSON 原型存储"模式——

- 业务用户通过 UI 创建的模型先以 JSON Schema 格式存储在 `schema_definitions` 表中，不立即生成 DDL
- 管理员"发布"时触发 DDL 迁移（Drizzle `pgSchema` API）
- "未发布"状态允许用户在无数据库锁定的情况下反复迭代模型设计

**对应决策**：D3（Schema Engine 动态模型）、D7（Schema→Ant Design 映射器）

#### ✅ BPMN 2.0 与业务对象的深度耦合

**Axelor 的做法**：BPM Studio 的工作流节点可以直接引用业务模型（"当订单状态变为已确认时触发审批流程"），Groovy 脚本通过表达式构建器 GUI 减少手写代码。

**AUDEBase 如何借鉴**：Phase 4 工作流引擎（D13 Saga）设计时——

- 流程定义中的 `task` 节点应能引用 `manifest.exports` 中声明的 API 作为服务任务
- 提供类似 Axelor "查询构建器"的 GUI 工具辅助非开发人员配置条件网关
- DMN 决策表模式可作为 AUDEBase 商业规则引擎的参考

**对应决策**：D1.3（插件通信契约 exports）、D13（Saga 补偿模式）

#### ✅ 链式绑定覆盖模式

**Axelor 的做法**：`bind(DefaultServiceImpl.class).to(CustomServiceImpl.class)` 允许模块在不修改上游代码的情况下覆盖默认 Service 实现。

**AUDEBase 如何借鉴**：D1.3 的 ServiceRegistry 服务发现应支持类似"优先级覆盖"——多个插件注册同名服务时，高优先级插件可覆盖低优先级实现。这比 NocoBase 的单插件注册模式更灵活。

**对应决策**：D1.3（插件通信契约）、D2（manifest.yaml 声明系统）

#### ✅ 字段级加密的透明化

**Axelor 的做法**：加密在 JPA Entity 层实现，数据库存储密文，应用层自动加解密。支持密钥轮换和算法切换。

**AUDEBase 如何借鉴**：D12 的 Core 数据 API 代理是天然的加密点——所有写操作经过 Core 时自动加密标记字段，读操作自动解密。比 Axelor 的 Entity 层加密更集中、更易审计。

**对应决策**：D12（Core 数据 API 代理）、D8.1（JWT 密钥管理）

#### ✅ 低代码 + 全代码双模式逃生舱

**Axelor 的做法**：80% 拖拽配置 + 20% Java/Groovy 代码扩展。Studio 不限制用户编写自定义 Service。

**AUDEBase 如何借鉴**：Phase 2 Schema Engine 需确保同一功能既可通过 Schema 配置实现，也可通过手写代码覆盖。参考 D7："映射器是对 Ant Design 组件的轻量声明式包装，不是对某个引擎的深度集成"。开发者始终可以使用原生 antd 组件。

**对应决策**：D7（Schema→Ant Design 映射器）、D22（lazy 注册渐进式支持）

### 9.2 应当避免（Axelor 的反面教训）

#### ❌ 黑名单式安全沙箱

**Axelor 的问题**：表达式沙箱依赖黑名单，被反复绕过（`AsyncFunction` → `GeneratorFunction` → `__proto__` → `constructor`）。

**AUDEBase 的对策**：D12 的 Core 数据 API 代理采用白名单模式——只允许访问已注册的 Collection。从根本上消除绕过可能。

#### ❌ 单调升级路径的风险集中

**Axelor 的问题**：Java 11→21 + Java EE→Jakarta EE + Groovy 升级 + 代码生成器重写全部集中在 AOP 8.0 一个版本。

**AUDEBase 的对策**：遵循渐进式升级策略。D9 的 DatabaseProvider 抽象确保 ORM 更替零成本。每个 Phase 独立完成，不累积 Breaking Changes。

#### ❌ 前端技术过渡期的分裂体验

**Axelor 的问题**：JSP + jQuery + AngularJS + React 共存，开发者在不同页面使用完全不同的技术栈。

**AUDEBase 的对策**：D6 决策从 Day 1 统一使用 Ant Design 5 + D16 的 ProLayout 布局系统。D17 按信任层级渐进加载——无历史包袱。

#### ❌ 隐式行为契约的反向不兼容

**Axelor 的问题**：v8.0.2 移除 flush 为了性能，但破坏了依赖"persist 后立即可见"的现有代码，v8.1.0 被迫回滚。

**AUDEBase 的对策**：所有 API 行为变更必须通过 manifest.yaml 的 `version` 字段声明 breaking changes（SemVer）。D13 Saga 日志的幂等性设计确保事务行为可预测。

#### ❌ 单体架构的无隔离风险

**Axelor 的问题**：一个模块的 OOM 或数据库连接池耗尽拖垮整个系统。无故障隔离。

**AUDEBase 的对策**：D1.1 四层信任分组是 AUDEBase 与 Axelor/Odoo 类单体 ERP 最大的架构差异化优势。

#### ❌ 生态锁定于单一语言栈

**Axelor 的问题**：Java 单体架构限制了前端和后端独立演进的能力。前端团队必须理解 Gradle 构建、JSP 模板和 Java 打包流程。

**AUDEBase 的对策**：TypeScript 全栈统一语言（D5），但通过 D1.3 的 JSON-RPC 组间通信 + D17 的 ESM 动态加载，前后端可独立部署和演进。

### 9.3 差异化机会

| 维度 | Axelor | AUDEBase | AUDEBase 优势 |
|------|--------|----------|--------------|
| **插件安全隔离** | 无（共享 JVM） | 四层信任分组（D1.1） | 故障隔离、第三方插件安全 |
| **运行时开销** | Java 单体 2-4GB 基线 | Node.js < 256MB 基线 | 低成本中小规模部署 |
| **API 安全** | 黑名单沙箱，反复绕过 | Core 代理白名单模式（D12） | 从根本上杜绝绕过 |
| **架构演进** | 一次性集中 Breaking Change | 渐进式升级，DatabaseProvider 抽象（D9） | 降低升级风险 |
| **前端一致性** | JSP + React 过渡期 | 统一 Ant Design 5 + ProLayout（D6/D16） | 一致开发体验 |
| **多租户** | 无原生支持 | 四阶段设计内建（D4） | Day 1 多租户 |
| **插件生态** | 无市场/商店 | 规划插件市场（Phase 2） | 生态可扩展性 |
| **BPM 集成** | 深度耦合但无法独立扩展 | Phase 4 规划，Saga 补偿模式（D13） | 跨插件事务编排 |
| **现代工具链** | Gradle + JSP + WAR | Vite + ESM + HMR（D21） | 开发效率 |
| **云原生** | WAR 部署 + Docker 包装 | 按层独立容器化（D1.1） | K8s 友好 |

---

## 10. 关键数据速查

| 类别 | 数据 |
|------|------|
| **官方仓库** | [github.com/axelor/axelor-open-platform](https://github.com/axelor/axelor-open-platform) |
| **业务套件仓库** | [github.com/axelor/axelor-open-suite](https://github.com/axelor/axelor-open-suite) |
| **GitHub Stars** | ~455 (Open Platform) / ~937 (Open Suite) |
| **主要语言** | Java 98.8% (Open Suite)，Java 61.1% + TypeScript 34.9% (Open Platform) |
| **许可** | AGPLv3 (Community) / 商业许可 (Pro/Enterprise) |
| **技术栈** | Java 21 + Jakarta EE 10+ + Tomcat 10.1 + Hibernate 6.6 + Guice 7.0 |
| **安全框架** | Apache Shiro 2.1 + PAC4J 6.5 + Argon2id |
| **BPM 引擎** | Activiti 定制分支（BPMN 2.0 + DMN） |
| **数据库** | PostgreSQL 14+（也支持 MySQL） |
| **缓存** | Caffeine / Redisson (Redis/Valkey) / JCache |
| **脚本语言** | Groovy 4.0 + GraalVM JavaScript |
| **构建工具** | Gradle 8.x |
| **前端（新）** | React (View Builder + BPM Studio) |
| **前端（旧）** | JSP + jQuery + Bootstrap + AngularJS |
| **代码规模** | 未公开（Java 为主，Open Suite 为主仓库） |
| **官方模块数** | 50+ |
| **连接器** | 1,500+（官方声称） |
| **社区合作伙伴** | ~30（法国/欧洲为主） |
| **公司规模** | 100+ 员工，7 办事处，4 大洲 |
| **全球用户** | > 100 万（官方声称），活跃部署 ~50K |
| **定价** | Community 免费 / Pro €35/用户/月 / Enterprise €55/用户/月 / SaaS €25/用户/月 |
| **首次发布** | 2005 年（公司成立），2014 年（GitHub 开源） |
| **最新版本** | Open Platform v8.2.2 (2026-06-18) / Open Suite v9.0.4 (2026-03-05) |
| **已知 CVE** | CVE-2025-50341 (SQL 注入，v5.2.4) |
| **关键架构迁移** | v8.0: Java EE→Jakarta EE, Java 11→21, Groovy→Java 代码生成器, Nashorn→GraalVM |
| **商业模式** | Open Core：免费社区版 + 付费商业版 + 云托管 |
| **创始团队** | 法国巴黎，2005 年创立 |

---

> **文档维护**：随 Axelor Open Platform 大版本发布（~12-18 个月/版）更新版本号和新技术细节。
> **关联文档**：[竞品调研报告](../competitive-landscape.md)、[架构决策记录](../../.agents/memorys/decisions.md)、[Odoo 产品画像](./odoo.md)、[NocoBase 产品画像](./nocobase.md)
