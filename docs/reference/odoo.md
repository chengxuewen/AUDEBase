# Odoo — 产品画像

> **分析日期**: 2026-07-10 | **分类**: 全功能 ERP 平台 | **AUDEBase 相关度**: ⭐⭐⭐⭐⭐

---

## 1. 产品概述

### 1.1 一句话定位

**Odoo 是全球最流行的开源 ERP 平台**，提供 40+ 官方业务模块（CRM、销售、采购、库存、制造、财务、HR、电商等），以「模块叠加」模式覆盖企业全业务链。它既是一个开箱即用的 ERP 套件，也是一个可深度定制的企业应用框架。

### 1.2 基本信息

| 维度 | 详情 |
|------|------|
| **创始年份** | 2005 年（原名 TinyERP） |
| **公司** | Odoo S.A.（比利时，CEO: Fabien Pinckaers） |
| **许可** | LGPLv3（Community）+ 商业许可（Enterprise） |
| **社区规模** | GitHub ~42K stars, 1,500+ 贡献者, 7M+ 用户, 5,000+ 全球合作伙伴 |
| **当前版本** | Odoo 18 (2025 年发布) |
| **维护策略** | 每版维护 3 个 LTS，当前 LTS: Odoo 17, 发布周期约 12 个月/版 |

### 1.3 发展历程关键节点

| 年份 | 版本 | 里程碑 |
|------|------|--------|
| 2005 | TinyERP 1.0 | 首次发布，由 Fabien Pinckaers 创立 |
| 2008 | OpenERP 5 | 改名 OpenERP，引入模块化架构 |
| 2011 | OpenERP 6.1 | 发布 SaaS 版（OpenERP Online），引入 Web 客户端 |
| 2014 | Odoo 8 | 再次改名 Odoo，Community/Enterprise 双版本分化 |
| 2015 | Odoo 9 | 引入 Odoo Studio（Enterprise），拖拽式自定义 |
| 2019 | Odoo 13 | 引入 IoT Box、Odoo.sh 平台即服务 |
| 2021 | Odoo 15 | 重大 UX 重设计，全新网站构建器 |
| 2022 | Odoo 16 | 知识管理、文档审批、电子签名 |
| 2023 | Odoo 17 | **前端全面重写**：OWL 2.0 自研框架正式替代旧 JS 框架 |
| 2024-25 | Odoo 18 | Odoo AI 集成、仪表板看板、HR 全面增强 |

**关键决策节点**：
- **2014 年（v8）** — Community/Enterprise 裂变，决定了 Odoo 此后十年的商业模式格局
- **2023 年（v17）** — 前端全面迁移到 OWL，标志着 Odoo 放弃 JS 混用策略，统一技术栈
- **2025 年（v18）** — 开始重注 AI 集成，对标 Salesforce Einstein 等 AI-ERP 趋势

---

## 2. 技术架构

### 2.1 总体架构

```
┌──────────────────────────────────────────────────────┐
│  前端层                                                │
│  ┌──────────┐  ┌──────────────┐  ┌─────────────────┐ │
│  │ Web UI   │  │ 移动端 App   │  │ POS 终端         │ │
│  │ (OWL/JS) │  │ (OWL Mobile) │  │ (OWL + IoT Box) │ │
│  └────┬─────┘  └──────┬───────┘  └───────┬─────────┘ │
├───────┼────────────────┼──────────────────┼───────────┤
│       │     XML-RPC / JSON-RPC / REST API             │
├───────┼────────────────┼──────────────────┼───────────┤
│  服务层（单个 Python 进程）                             │
│  ┌──────────────────────────────────────────────────┐ │
│  │  ORM 层（自研）                                    │ │
│  │  ├─ Model Registry（模型注册表）                   │ │
│  │  ├─ 自动 SQL 生成（DDL/DML）                       │ │
│  │  ├─ Record Rules 注入（domain filter）             │ │
│  │  ├─ 字段追踪 / 计算字段 / 关联字段                  │ │
│  │  └─ 缓存层（ORM Cache + prefetch）                 │ │
│  ├──────────────────────────────────────────────────┤ │
│  │  Modules 层                                        │ │
│  │  ├─ module_loader（发现/加载/安装/升级/卸载）       │ │
│  │  ├─ ir.module.module 注册表（DB 持久化）            │ │
│  │  └─ 依赖解析（拓扑排序）                            │ │
│  ├──────────────────────────────────────────────────┤ │
│  │  ir.* 基础数据层                                    │ │
│  │  ├─ ir.model / ir.model.fields（元模型）           │ │
│  │  ├─ ir.ui.view / ir.ui.menu（视图/菜单）           │ │
│  │  ├─ ir.attachment（文件存储元数据）                 │ │
│  │  └─ res.users / res.groups / ir.model.access       │ │
│  ├──────────────────────────────────────────────────┤ │
│  │  Web 控制器 (odoo.http) / QWeb 模板引擎             │ │
│  └──────────────────────────────────────────────────┘ │
├───────────────────────────────────────────────────────┤
│  数据层                                                │
│  ┌───────────────┐  ┌──────────────┐                 │
│  │ PostgreSQL    │  │ Filestore    │                  │
│  │ (强依赖，唯一  │  │ (ir.attach.  │                  │
│  │  支持的数据库)  │  │  sha256 寻址) │                  │
│  └───────────────┘  └──────────────┘                 │
└──────────────────────────────────────────────────────┘
```

### 2.2 关键技术节点

| 层次 | 技术 | 说明 |
|------|------|------|
| **后端语言** | Python 3.10+ | 单体进程，全局解释器锁（GIL）为水平扩展主要瓶颈 |
| **ORM** | 自研 ORM | 灵活动态，非传统 Django ORM。强依赖 PostgreSQL 特性 |
| **数据库** | PostgreSQL（唯一） | 深度使用 PG 特有功能：递归 CTE、窗口函数、特定索引类型 |
| **前端框架** | OWL (Odoo Web Library) | v17 起自研前端框架，组件化+响应式，替代旧 jQuery+QWeb.js 混用 |
| **模板引擎** | QWeb (服务端) + OWL (客户端) | QWeb 用于服务端（报表/邮件/网页），OWL 渲染客户端动态 UI |
| **API 协议** | XML-RPC / JSON-RPC | 传统 XML-RPC 为主，逐步向 JSON-RPC 和 REST API 迁移 |
| **Web 服务器** | Werkzeug (内置) | 开发环境内置，生产通常通过 Nginx + gevent/gthread 反向代理 |
| **进程模型** | 多线程 (gevent/gthread) | 非异步原生，通过 gevent 协程实现 pseudo-async |

### 2.3 关键架构模式

**ORM 代理所有数据访问**：Odoo 中不存在「手写 SQL」的业务代码（少数性能优化除外）。所有 CRUD 操作通过 ORM 方法（`create()/write()/search()/unlink()`），ORM 自动注入安全检查（Record Rules、字段级权限、多公司过滤）。

**ir.\* 基础数据模型**：Odoo 一切皆模型。菜单、视图、权限、模块状态、附件元数据均存储于 `ir.*` 前缀数据表中。这使 Odoo 的配置数据与业务数据统一管理，支持导入/导出/版本控制。

**单体多模块**：所有模块运行在单一 Python 进程中。模块通过 Python 类继承机制扩展或覆写核心行为，模块间通信通过 Python 函数调用（无进程边界）。这种设计的优势是零序列化开销、简单的开发模型；劣势是任一模块的 Bug 可能影响整个系统。

**QWeb + OWL 双引擎共存**：服务端渲染（报表 PDF、邮件模板、静态网页）仍使用 QWeb；客户端交互（表单视图、列表视图、看板视图）由 OWL 组件驱动。v17 后 OWL 成为主推方向。

---

## 3. 核心功能

### 3.1 官方业务模块矩阵

Odoo 提供 40+ 官方模块，分为以下业务域：

| 业务域 | 核心模块 | Enterprise 专属 |
|--------|----------|:---:|
| **销售** | CRM、销售、销售报价单模板、订阅 | ✓ 高级订阅 |
| **采购** | 采购、供应商管理、采购招标 | |
| **库存/制造** | 仓库管理（WMS）、制造（MRP）、产品生命周期（PLM）、质量管理、维护 | |
| **财务** | 会计、发票、费用、预算、资产折旧 | ✓ 高级会计（多币种重估、递延收入） |
| **人力资源** | 员工、招聘、休假、评估、工时表 | ✓ 招聘 App、在线协作 |
| **项目管理** | 项目、任务、甘特图 | ✓ 企业版甘特图 |
| **电商/网站** | 网站构建器、eCommerce、博客、论坛、在线客服 | |
| **营销** | Email 营销、短信营销、社媒营销、活动管理 | |
| **POS** | 零售 POS、餐厅 POS | ✓ IoT Box 集成 |
| **办公自动化** | 审批流（Enterprise）、文档管理、电子签名、知识管理 | ✓ 审批流、Studio |
| **平台** | 多公司、多币种、50+ 国家本地化、API/Webhook | ✓ Studio、Odoo.sh |

### 3.2 Odoo Studio（Enterprise 专属）

Odoo Studio 是 Enterprise 版的核心差异化功能，允许非开发人员通过拖拽式 UI 完成以下操作：

- **添加/修改字段**：拖入字段类型（文本、数字、关联、计算等）到表单
- **创建视图**：从已有模型创建新的列表/表单/看板/日历视图
- **自动化规则**：配置「当 X 发生，执行 Y」的自动化流程
- **自定义菜单**：创建新菜单项，关联视图或动作
- **导出/导入**：Studio 修改可导出为模块（便于迁移到其他数据库）

Studio 背后的核心原理是 Odoo 的「一切皆模型」架构——Studio 的拖拽操作本质上是向 `ir.model.fields`、`ir.ui.view` 等表写入记录，而非生成代码。

### 3.3 多公司 & 多币种

- **多公司**：单实例支持多法人实体，数据通过 `company_id` 字段隔离。用户可切换工作公司，视图数据自动过滤。
- **多币种**：支持 170+ 货币，自动汇率更新（通过在线服务），多币种会计处理。

---

## 4. 模块体系详解

Odoo 的模块系统是其最核心的架构特征。下面从发现、加载、安装到运行全链路展开。

### 4.1 模块发现机制

**核心入口**：`odoo-bin server --addons-path=<paths>`

```
启动流程：
1. odoo-bin 解析 --addons-path 参数
2. 调用 initialize_sys_path()，将 --addons-path 中的目录追加到 sys.path
3. 扫描 odoo.addons.__path__ 中的所有目录
4. 调用 Manifest.all_addon_manifests() 扫描每个目录下的 __manifest__.py
5. 构建完整模块清单（含名称、版本、依赖、安装状态）
```

**模块搜索路径层级**（按优先级从低到高）：
1. `odoo/addons/` — Odoo 内置模块（`base`, `web`, `mail` 等核心模块）
2. `--addons-path` 指定的自定义目录 — 第三方模块和自定义模块
3. `odoo/addons` 的 Odoo Community Association (OCA) 模块（通常单独管理）

**同名模块冲突策略**：路径中后出现的模块覆盖先出现的同名片（Python 标准导入机制）。这就是为什么自定义 addons-path 可以覆写内置模块行为而不修改源码。

### 4.2 最小模块结构

Odoo 的最小模块仅需 2 个文件：

```
my_module/
├── __manifest__.py    # 模块声明（name 必填，其余可选）
└── __init__.py         # Python 包声明，通常导入 models/
```

**`__manifest__.py` 完整字段**：

```python
{
    'name': '模块显示名称',
    'version': '18.0.1.0.0',
    'category': 'Sales',
    'summary': '模块简短描述',
    'description': '模块详细描述',
    'author': '作者',
    'website': 'https://example.com',
    'license': 'LGPL-3',
    'depends': ['base', 'mail'],          # 依赖模块
    'data': [                             # 数据文件（按依赖顺序）
        'security/ir.model.access.csv',   #   - 安全规则（最先加载）
        'views/menu_views.xml',           #   - 视图/菜单定义
        'data/initial_data.xml',          #   - 初始数据
    ],
    'demo': ['demo/demo_data.xml'],       # 演示数据
    'assets': {                           # 前端资源
        'web.assets_backend': [
            'my_module/static/src/**/*',
        ],
    },
    'installable': True,                  # 是否可安装
    'application': True,                  # 是否为主应用（显示在 App 菜单）
    'auto_install': False,                # 依赖满足时自动安装
    'bootstrap': False,                   # web 模块使用：启动时预加载
    'sequence': 10,                       # 应用列表中排序
    'external_dependencies': {            # Python 外部依赖
        'python': ['pandas', 'numpy'],
        'bin': ['wkhtmltopdf'],
    },
}
```

**关键字段说明**：
- `bootstrap: True` — 仅 `web` 模块使用，标记为启动时预加载的前端模块
- `auto_install: True` — 当所有 `depends` 中模块均已安装时，自动安装本模块
- `application: True` — 模块出现在「应用」列表中（而非仅出现在「已安装模块」）
- `data: []` — 数据文件按顺序加载：安全规则 → 视图定义 → 业务数据

### 4.3 依赖解析与安装管线

**第一步：拓扑排序 (Kahn 算法)**

```
├── 读取所有待安装模块的 'depends' 声明
├── 构建有向无环图 (DAG)
├── Kahn 算法生成拓扑排序序列
│   入度为 0 的模块优先 → 依赖最少的模块最先加载
└── 输出 install_order: [base, web, mail, ..., my_module]
```

- `base` 依赖为空 → 入度 0 → 第一位
- `web` 依赖 `base` → 入度 1 → 排在 `base` 后
- 循环依赖被检测并报错

**第二步：load_module_graph() 逐模块加载**

对拓扑排序后的每个模块，执行以下阶段：

```
Phase 1: import_module
  ├── Python import（__init__.py → models/）
  ├── 注册 Model 类到 Model Registry
  └── 解析 _inherit / _inherits 继承关系

Phase 2: setup_models（全模块完成后统一执行）
  ├── 解析字段定义（创建数据库列映射）
  ├── 解析字段继承链
  ├── 验证 _constraints / _sql_constraints
  └── 建立模型间关联（many2one/one2many/many2many）

Phase 3: init_models
  ├── 对每个 Model._auto=True 的模型创建数据库表
  ├── 添加缺失的列（ALTER TABLE ADD COLUMN）
  ├── ORM → DDL 自动转换
  └── 不删除多余列（需手动处理或通过升级脚本）

Phase 4: load_data
  ├── 按 manifest.data 定义顺序加载 XML/CSV 文件
  ├── 优先级：ir.model.access → ir.rule → ir.ui.view → 业务数据
  ├── XML ID 解析与冲突处理（noupdate 标记的数据不覆盖已有记录）
  └── 视图继承（inherit_id XPath 定位 → 插入/替换节点）

Phase 5: post_init_hook（可选）
  ├── 模块定义的 init 钩子函数
  ├── 用于复杂数据初始化、索引创建等
  └── 仅在模块首次安装时调用
```

**第一阶段**（import_module）逐模块顺序执行，确保后续模块可以 `_inherit` 前置模块的类。

**第二阶段**（setup_models）在所有模块 import 完成后统一执行，因为此时完整的类继承链才可见。例如模块 A 可能继承模块 C 的模型，而模块 C 在依赖图中排在模块 A 之后。

### 4.4 `base` 内核模块

`base` 模块是 Odoo 的操作系统内核，具有以下特征：

| 特征 | 说明 |
|------|------|
| **零依赖** | `depends: []`，系统中唯一无依赖的模块 |
| **auto_install: True** | 数据库首次初始化时自动安装 |
| **预置核心模型** | `ir.model`, `ir.model.fields`, `ir.ui.view`, `ir.ui.menu`, `res.users`, `res.groups`, `ir.model.access`, `ir.rule`, `ir.attachment`, `ir.module.module`, `res.company`, `res.partner` 等 |
| **ORM 基础设施** | 提供 Model/TransientModel/AbstractModel 基类、字段类型系统、domain filter 表达式引擎 |
| **Web 基础** | 定义登录页面、主菜单骨架、QWeb 引擎 |
| **安全基础** | 定义 admin 用户、基础权限组（base.group_user, base.group_system 等） |
| **4,000+ 行** | 纯代码量很大，但作为「内核」，所有其他模块都继承其数据模型 |

**首次运行流程**：
1. 启动 Odoo，连接 PostgreSQL
2. 检测到数据库为空 → 调用 `base` 模块安装管线
3. 创建 `ir_module_module` 表（模块注册表）
4. 执行 base 模块的 `load_module_graph()`
5. 创建所有 `ir.*` 和 `res.*` 基础数据表
6. 创建 admin 用户（默认密码 admin）
7. base 标记为 `installed`，状态写入 `ir.module.module`
8. 如果命令行指定 `--init <modules>` 或有 `auto_install: True` 的模块，继续安装

### 4.5 数据库模块注册表：`ir.module.module`

`ir.module.module` 是 Odoo 模块系统的核心元数据表：

| 字段 | 说明 |
|------|------|
| `name` | 模块的唯一标识（如 `sale`, `account`） |
| `state` | 安装状态：`uninstalled` → `to install` → `to upgrade` → `to remove` → `installed` |
| `latest_version` | 当前文件系统中的版本号 |
| `installed_version` | 已安装到数据库中的版本号（用于判断是否需要升级） |
| `dependencies_id` | 依赖关系 many2many |
| `demo` | 是否已加载演示数据 |
| `auto_install` | 是否标记为自动安装 |
| `application` | 是否为 Application（出现在 App 列表） |
| `sequence` | 排序值 |

**工作原理**：
- Odoo 启动时对比文件系统 manifest 的 `version` 与数据库中的 `installed_version`
- 若不一致且模块为 `installed` → 自动标记为 `to upgrade`
- 用户通过 UI 或 CLI 触发安装/升级/卸载 → 操作系统模块状态

---

## 5. 权限模型

Odoo 的权限系统是 AUDEBase 最重要的学习参考（D10 Record Rules 和 D11 字段级权限直接借鉴自 Odoo）。

### 5.1 三层权限体系

```
用户 (res.users)
  │
  ├── 属于一个或多个安全组 (res.groups)
  │     │
  │     ├── 控制：菜单可见性、视图可见性、字段可见性
  │     │
  │     └── 映射到：
  │           ├── 访问权限 (ir.model.access) — CRUD 模型级
  │           └── 记录规则 (ir.rule) — Record Rules 行级过滤
  │
  └── 所属公司 (res.company) — 多公司数据隔离基础
```

### 5.2 ir.model.access（模型级访问控制）

定义在 `security/ir.model.access.csv`：

```csv
id,name,model_id:id,group_id:id,perm_read,perm_write,perm_create,perm_unlink
access_sale_order_user,sale.order.user,model_sale_order,base.group_user,1,0,0,0
access_sale_order_manager,sale.order.manager,model_sale_order,sales_team.group_sale_manager,1,1,1,1
```

- **粒度**：模型级别（CRUD 四项独立控制）
- **叠加策略**：用户若属于多个组，权限取「并集」（最宽）
- **默认**：无显式 ACL 时拒绝所有访问
- **加载顺序**：数据文件中最先加载（比视图和业务数据优先）

### 5.3 Record Rules（行级过滤 — AUDEBase D10 参考源）

定义在 `security/*.xml` 的 `<record id="..." model="ir.rule">` 中：

```xml
<record id="sale_order_personal_rule" model="ir.rule">
    <field name="name">Personal sales orders</field>
    <field name="model_id" ref="model_sale_order"/>
    <field name="domain_force">[('user_id', '=', user.id)]</field>
    <field name="groups" eval="[(4, ref('base.group_user'))]"/>
    <field name="perm_read" eval="True"/>
    <field name="perm_write" eval="False"/>
    <field name="perm_create" eval="False"/>
    <field name="perm_unlink" eval="False"/>
</record>
```

**核心机制**：
- `domain_force` 字段定义 domain filter 表达式
- ORM 在执行 `search()/read()/write()/unlink()` 时**自动将 domain_force 注入 WHERE 条件**
- 多个 record rules 取 「OR」 联合（非 admin 用户）
- **Global rules**（`groups` 为空的规则）对所有用户生效
- **Group rules** 对指定安全组生效

**domain filter 表达式语法**：

```python
# 基础比较
[('state', '=', 'draft')]                # state = 'draft'
[('amount_total', '>', 1000)]            # amount > 1000

# 逻辑组合
['|', ('state', '=', 'draft'), ('state', '=', 'sent')]  # state = 'draft' OR 'sent'
['&', ('active', '=', True), ('company_id', '=', user.company_id.id)]

# 字段引用
[('company_id', 'in', user.company_ids.ids)]  # 多公司
[('user_id', '=', user.id)]                    # 当前用户
```

**AUDEBase 借鉴（D10）**：AUDEBase 将实现同样的 domain filter 自动注入机制——Core ORM 层（通过 DatabaseProvider 封装 Drizzle）在执行查询前自动注入 `tenant_id + record_rule` WHERE 条件。

### 5.4 字段级权限（Enterprise，AUDEBase D11 参考源）

Odoo Enterprise 通过 `groups` 属性控制字段可见性：

```python
class SaleOrder(models.Model):
    _inherit = 'sale.order'

    margin = fields.Monetary(groups='sales_team.group_sale_manager')
    internal_note = fields.Text(groups='base.group_system')
```

- 用户不属指定安全组时：字段在 API 响应中隐藏、在 UI 中隐藏
- 后端实现：`fields_get()` 方法根据用户组过滤返回字段列表
- 前端实现：OWL 组件渲染时自动跳过用户无权查看的字段

**AUDEBase 借鉴（D11）**：AUDEBase 的 `manifest.exports` 中 `visible_to` 字段声明，Core API 代理自动过滤不可见字段，前端 Schema→UI 映射器自动隐藏。

### 5.5 多公司隔离

```python
# 自动过滤当前公司的数据
[('company_id', 'in', user.company_ids.ids)]

# ORM 自动行为：
# 1. _check_company_auto=True 的模型自动添加 company_id 过滤
# 2. 关联字段 check_company=True 时跨公司关联被阻止
```

---

## 6. 市场与社区

### 6.1 社区指标

| 维度 | 数据 |
|------|------|
| **GitHub Stars** | ~42,000 |
| **GitHub 贡献者** | 1,500+ |
| **全球用户** | 700 万+ |
| **合作伙伴** | 5,000+（全球约 120 个国家） |
| **App Store 模块** | 40,000+（第三方） |
| **年度大会** | Odoo Experience（10,000+ 参与者/年） |
| **仓库语言** | Python (~78%), JavaScript (~14.5%), TypeScript (~5.2%), XML/HTML (~1.5%), SCSS (~0.8%) |
| **社区组织** | Odoo Community Association (OCA)，维护 1,000+ 高质量开源模块 |

### 6.2 商业模式

```
Community (LGPLv3, 免费)
  ├── 基础 CRM / 销售 / 采购 / 库存 / 制造 / 项目
  ├── 财务（基础）/ 网站构建器 / eCommerce
  ├── 50+ 国家本地化合规包
  └── 限制：无 Studio、无审批流、无移动 App、无高级财务功能

Enterprise ($24-$70/用户/月，按模块组合定价)
  ├── 全部 Community 功能
  ├── Odoo Studio（拖拽自定义）
  ├── 审批流引擎
  ├── 高级会计（多币种重估、递延收入、预算控制）
  ├── 移动端 App
  ├── IoT Box 支持
  ├── E-Learning / 知识管理
  ├── Odoo.sh 平台托管
  └── 商业支持与 SLA

Odoo.sh（PaaS 托管，按需定价）
  ├── 自动备份 / 测试 / 部署
  ├── GitHub 集成（分支 → 自动构建测试环境）
  └── 弹性伸缩
```

### 6.3 生态分析

**优势**：
- 成熟的合作伙伴网络：5,000+ 合作伙伴覆盖实施、定制、本地化
- App Store 长尾效应：40,000+ 模块，从「AI 发票识别」到「养猪场管理」
- 年度大会驱动社区凝聚力：Odoo Experience 发布年度路线图，合作伙伴展示案例
- 多语言/多国家本地化：50+ 国家合规包（税法、会计科目表、发票格式）

**劣势**：
- Enterprise 锁定效应：关键企业功能仅 Enterprise 可用，Community 版被持续“瘦身”
- 生态碎片化：40,000+ 模块质量参差不齐，兼容性和升级路径不明确
- 中心化治理：Odoo S.A. 对平台方向拥有绝对话语权，社区贡献的进入门槛高
- 合作伙伴竞争：Odoo S.A. 直接与合作伙伴竞争（Odoo.sh 托管、直接销售）

---

## 7. 历史教训与已知问题

### 7.1 定制化后升级困难（⚠️ AUDEBase 警示）

**问题描述**：Odoo 允许通过 `_inherit` 机制深度定制任何模块的行为。但定制化程度越高，跨大版本升级代价越大。

**根因**：
- ORM 模型字段/方法被改动的内在耦合
- 视图 XML 的 XPath 继承在父模板大改后失效
- ORM API 在不同版本间无后向兼容保证
- 数据库 Schema 升级脚本需人工审查和适配

**AUDEBase 教训**：
- 插件需通过**显式 API 契约**（`manifest.exports`）而非内部实现继承来扩展 Core
- 视图/UI 用代码 API 注册（`router.add()`, `slot.add()`）而非 XML 模板继承
- 数据库迁移通过 Schema Engine 声明的增量迁移 + 版本门控（`version_gated`）

### 7.2 Enterprise 功能锁定（⚠️ AUDEBase 警示）

**问题**：Odoo 社区版功能持续缩减，核心企业功能（Studio、审批流、高级财务、移动 App）仅 Enterprise 可用。这导致开源用户要使用完整平台必须付费。

**趋势**：新功能越来越倾向于 Enterprise 版首发或独占。部分第三方模块仅兼容 Enterprise。

**AUDEBase 教训**：
- 避免「开源版功能阉割」模式
- 差异化收费应基于「实施/托管/支持服务」而非核心功能锁定
- Manifest `security` 字段声明分级能力，但核心平台功能不应按许可分级

### 7.3 Python GIL 性能瓶颈（⚠️ AUDEBase 架构决策依据）

**问题**：Odoo 单进程模型受 Python GIL 限制，高并发场景（电商大促、月末批量结账）时 CPU 利用率低，响应延迟飙升。

**应对**：
- 多 worker 进程（gevent/gthread）+ Nginx 负载均衡
- PostgreSQL 连接池（PgBouncer）
- 异步处理（`ir.cron` 定时任务、`queue.job` 后台任务）

**根因**：架构设计之初未考虑水平扩展，后续补丁式改进无法根本解决单体瓶颈。

**AUDEBase 教训（D1.1）**：采用四层信任分组 + 组间进程隔离。Node.js worker_threads + JSON-RPC 组间通信从根本上避免了单体进程瓶颈。

### 7.4 默认密钥安全风险（⚠️ AUDEBase 已提前缓解）

**NocoBase 类比（CVE-2025-13877，CVSS 9.8）**：NocoBase 默认 JWT 密钥导致任意用户冒充。

**Odoo 类似风险**：
- 默认 admin 密码 `admin`（首次安装后强制修改，但不彻底）
- Odoo.sh 默认数据库密码凭据暴露风险
- `--dev` 模式暴露 full traceback 到前端

**AUDEBase 缓解（D8.1）**：
- JWT 密钥通过环境变量强制注入（`AUDE_JWT_SECRET`）
- 启动时校验密钥长度 ≥ 32 字符
- 拒绝默认值

### 7.5 XML 定义 UI 的复杂性与维护成本（⚠️ AUDEBase 设计参考）

**问题**：Odoo 的视图（表单、列表、看板、搜索）通过 XML 定义，并使用 XPath 进行继承修改。随着模块叠加，视图定义变得难以追踪和调试。

**示例**：一个 Sale Order 表单视图可能被 15+ 个模块通过 XPath 修改，最终渲染结果难以预测。

**AUDEBase 对策**：
- 使用 React/antd 组件 + 代码 API 定义 UI（而非声明式 XML）
- 插件通过 `router.add()` 和 `slot.add()` 注册 UI，操作可追踪、可调试
- Schema→UI 映射器基于 JSON Schema（而非 XPath 继承）

---

## 8. 未来发展

### 8.1 Odoo 18+ 路线图

| 方向 | 说明 |
|------|------|
| **Odoo AI** | AI 助手内嵌（类似 Salesforce Einstein），智能数据录入、异常检测、预测分析 |
| **仪表板看板** | 交互式实时仪表板（拖拽式 widget），数据可视化增强 |
| **知识管理增强** | AI 驱动的知识库搜索、自动文章推荐 |
| **供应链深化** | 更多 WMS 自动化规则、批次/序列号全程追踪 |
| **低代码/无代码** | Studio 功能持续增强，降低实施门槛 |
| **Odoo.sh Plus** | 增强 PaaS（自动伸缩、全球多区域部署） |

### 8.2 战略趋势

1. **SaaS/Cloud 优先**：Odoo 逐步将核心体验向云迁移，Odoo.sh 为旗舰部署模式
2. **AI 普惠**：将 AI 从 Enterprise 专属扩展到 Community（至少基础功能）
3. **移动原生**：OWL Mobile 框架（React Native 桥接）推动移动端统一
4. **平台化**：App Store + Studio + Odoo.sh 构成「模块开发→分发→部署」平台生态

---

## 9. AUDEBase 可借鉴点

### 9.1 应当借鉴 ✅

| Odoo 机制 | AUDEBase 借鉴 | 对应决策/设计 |
|-----------|--------------|:---:|
| **模块发现**：`addons.__path__` 多路径扫描 + `Manifest.all_addon_manifests()` | AUDEBase 插件发现：从 `packages/` 目录扫描 `manifest.yaml`，注册到 PluginRegistry | 插件框架 Phase 1 |
| **`base` 内核模块**：零依赖 + auto_install + 预置基础设施 | AUDEBase SYSTEM 层：零依赖的 Core 插件，预置用户/权限/日志/菜单基础设施 | D1.1 |
| **Record Rules**：domain filter 表达式，ORM 自动注入 WHERE 条件 | Core ORM 层自动注入 `tenant_id + record_rule` WHERE 条件 | D10 |
| **字段级权限**：`groups` 属性控制字段可见性 | `manifest.exports` 中 `visible_to` 字段声明 + Core API 代理自动过滤 | D11 |
| **ir.attachment 文件存储**：DB 元数据（sha256 + tenant_id）+ content-addressed filestore 去重 | Phase 2：MinIO/S3 content-addressed 去重存储，DB 仅存元数据 | D4.1 |
| **模块注册表**：`ir.module.module` 表追踪模块状态 | AUDEBase plugin_registry 表（PostgreSQL）追踪插件状态/版本/依赖 | 插件框架 |
| **安装管线**：拓扑排序 → import → setup_models → init → load_data → hooks | 插件安装管线：依赖解析（拓扑排序）→ import → init → data → hooks（7 生命周期钩子） | D1.4 |
| **多公司数据隔离**：`company_id` 字段 + ORM 自动过滤 | 多租户数据隔离：`tenant_id` 字段 + DatabaseProvider 自动注入 | D4 |
| **`bootstrap` 标记**：web 模块预加载前端资源 | manifest `assets` 字段区分「预加载」与「懒加载」前端资源 | D17 |
| **数据文件加载顺序**：安全规则 → 视图 → 业务数据 | manifest `data` 字段按约定顺序加载（先 RBAC 配置，后视图/数据） | D1.5 |

### 9.2 应当避免 ❌

| Odoo 问题 | AUDEBase 对策 | 对应决策 |
|-----------|--------------|:---:|
| **单体架构性能瓶颈** | 四层信任分组 + 独立进程隔离（50 插件从 50 进程/2.5-4GB 降至 8-12 进程/0.4-0.7GB） | D1.1 |
| **Community/Enterprise 功能分化** | 不采用功能阉割模式；差异化收费基于实施/支持，核心功能全部开源 | 商业策略 |
| **XML 定义视图 + XPath 继承的复杂性** | React/antd 组件 + 代码 API 注册（`router.add()`, `slot.add()`），可调试可追踪 | D16, D23 |
| **升级困难（定制化后大版本不兼容）** | 插件通过 `manifest.exports` API 契约与 Core 交互，不直接继承内部实现 | D1.3 契约 |
| **默认密钥风险** | 启动时强制校验环境变量（`AUDE_JWT_SECRET` ≥ 32 字符），拒绝默认值 | D8.1 |
| **ORM 与数据库强绑定（PostgreSQL 唯一）** | DatabaseProvider 抽象层 + Drizzle ORM，可切换数据库后端 | D9 |
| **依赖 Python 全局解释器锁** | Node.js worker_threads + 事件驱动，天然适合高并发 | D5 |

---

## 10. 关键数据

| 维度 | 数据 |
|------|------|
| **官方仓库** | [github.com/odoo/odoo](https://github.com/odoo/odoo) |
| **许可** | LGPLv3（Community）/ 商业许可（Enterprise） |
| **首次发布** | 2005 年（TinyERP 1.0） |
| **当前版本** | Odoo 18 (2025) |
| **LTS 版本** | Odoo 17 (当前活跃 LTS) |
| **后端语言** | Python (~78%) |
| **前端框架** | OWL 2.0 (Odoo Web Library) |
| **数据库** | PostgreSQL（唯一支持） |
| **ORM** | 自研 ORM（非 Django/SQLAlchemy） |
| **依赖管理** | pip + `requirements.txt`（无现代 lock 文件） |
| **测试框架** | unittest + `odoo.tests.common` |
| **最低 Python** | 3.10+ |
| **代码规模** | ~200 万行（社区版所有模块） |
| **工作进程模型** | worker + gevent/gthread |
| **官方模块数** | 40+ |
| **App Store 模块数** | 40,000+ |
| **定价** | Community 免费 / Enterprise $24-$70/用户/月 |
| **Odoo.sh 托管** | 按需定价，$20/月起 |

---

## 附录：Odoo 启动序列速查

```
odoo-bin server --addons-path=/custom/addons -d mydb

1. 解析命令行参数
2. initialize_sys_path() → 将 addons-path 加入 sys.path
3. 连接 PostgreSQL (mydb)
4. 检查数据库是否已初始化
   ├── [否] → 首次启动
   │   ├── 创建 ir_module_module 表
   │   ├── 安装 base 模块（唯一无依赖模块）
   │   └── 继续安装命令行指定的其他模块
   └── [是] → 常规启动
       ├── 扫描所有 __manifest__.py
       ├── 对比文件系统版本 vs ir.module.module.installed_version
       ├── 标记需要升级的模块
       └── 执行升级管线

5. load_module_graph()
   ├── 拓扑排序（Kahn 算法）
   ├── 逐模块 import → setup_models → init_models → load_data
   └── post_init_hook

6. 启动 HTTP 服务（Werkzeug / gevent）
7. 加载前端资源（OWL bundles）
8. 就绪
```

---

> **文档维护**：随 Odoo 新大版本发布（~12 个月/版）更新版本号和新技术细节。
> **关联文档**：[竞品调研报告](../competitive-landscape.md)、[架构决策记录](../../.agents/memorys/decisions.md)
