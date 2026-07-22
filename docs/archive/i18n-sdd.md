# i18n SDD — Phase 1a

> **创建日期**: 2026-07-13  
> **目的**: 为 Phase 1a #11 模块（国际化骨架）提供 Core t() 函数 + react-i18next 双命名空间的完整接口定义。  
> **前置阅读**: D14, D15; architecture.md §6.6; conventions.md §i18n  
> **责任人**: Person C（安全/基础模块）

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  i18n 模块 (packages/i18n/src/)                                │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                    Core i18n                           │   │
│  │                                                      │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌───────────┐  │   │
│  │  │ TranslationMgr│  │ LocaleLoader │  │ t()注入    │  │   │
│  │  │ · 聚合翻译表  │  │ · 按需加载   │  │ PluginHost │  │   │
│  │  │ · t() 函数    │  │ · 缓存       │  │ · 后端模板 │  │   │
│  │  │ · 命名空间隔离 │  │ · manifest   │  │ · 错误翻译 │  │   │
│  │  └──────────────┘  └──────────────┘  └───────────┘  │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                  前端 i18n                            │   │
│  │                                                      │   │
│  │  ┌──────────────┐  ┌────────────────────────────┐   │   │
│  │  │ I18nextProvider│  │ useTranslation(namespace) │   │   │
│  │  │ · 初始化配置   │  │ · 插件包名 namespace      │   │   │
│  │  │ · 双命名空间   │  │ · 'client' 全局 namespace │   │   │
│  │  │ · 资源后端     │  │ · ICU 消息格式            │   │   │
│  │  └──────────────┘  └────────────────────────────┘   │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

**核心原则（D14/D15）**:
- 后端: NocoBase 式命名空间隔离，插件通过 `locale/{lang}.json` 组织翻译
- 前端: react-i18next 双命名空间（插件包名 + `'client'` 全局共享）
- Phase 1a: 仅 zh-CN + 预加载（eager loading），无语言切换器
- 翻译 key 为 dot-separated 路径（如 `'errors.unauthorized'`、`'users.create.title'`）

---

## 2. 文件约定

### 2.1 插件翻译文件

```
packages/plugin-rbac/
├── manifest.yaml          # locale.path: "locale"
├── locale/
│   ├── zh-CN.json         # 中文翻译（Phase 1a 必需）
│   └── en-US.json         # 英文翻译（Phase 1b）
└── src/
    └── ...

packages/plugin-core/
├── manifest.yaml          # locale.path: "locale"
├── locale/
│   └── zh-CN.json         # 内核通用 UI 翻译
└── src/
    └── ...
```

### 2.2 翻译 JSON 格式

```json
{
  "errors": {
    "unauthorized": "未授权访问",
    "forbidden": "权限不足",
    "not_found": "资源不存在",
    "validation_error": "请求参数校验失败",
    "internal_error": "服务器内部错误",
    "rate_limit_exceeded": "请求过于频繁，请稍后再试"
  },
  "users": {
    "create": {
      "title": "创建用户",
      "success": "用户创建成功",
      "error": "用户创建失败"
    },
    "update": {
      "title": "编辑用户",
      "success": "用户更新成功",
      "error": "用户更新失败"
    },
    "delete": {
      "confirm": "确认删除用户 {username}？",
      "success": "用户已删除",
      "error": "用户删除失败"
    }
  },
  "plugins": {
    "enable": "启用插件",
    "disable": "禁用插件",
    "install": "安装插件",
    "enable_success": "插件 {name} 已启用",
    "disable_success": "插件 {name} 已禁用",
    "migration_failed": "插件迁移失败，无法启用"
  },
  "common": {
    "save": "保存",
    "cancel": "取消",
    "confirm": "确认",
    "delete": "删除",
    "edit": "编辑",
    "create": "新建",
    "search": "搜索",
    "reset": "重置",
    "loading": "加载中...",
    "no_data": "暂无数据",
    "actions": "操作",
    "back": "返回"
  }
}
```

**语法规则**:
- ICU 消息格式：参数使用 `{paramName}`
- 复数：`"item_count": "共 {count} 条记录"`
- key 命名：dot-separated 小写路径，层级 ≤ 4 层

---

## 3. Public API Surface

### 3.1 TranslationManager（Core 后端）

```typescript
// packages/i18n/src/translation-manager.ts

interface TranslationManager {
  /**
   * 加载所有已发现插件的翻译文件
   * 
   * 流程:
   * 1. 遍历所有已 discover 的插件
   * 2. 定位 manifest.locale.path 目录
   * 3. 加载当前 locale（如 zh-CN.json）文件
   * 4. 以插件包名为 namespace 注册到翻译表
   * 5. 内核插件（plugin-core）同时注册到 'client' namespace
   * 
   * Phase 1a: eager loading — 启动时一次性加载所有翻译
   * Phase 1b: lazy loading — 按需加载
   */
  loadAll(): Promise<void>

  /**
   * 翻译函数（注入 PluginHost context）
   * 
   * 查找顺序:
   *   1. 当前插件 namespace
   *   2. 'client' 全局 namespace（通用 UI 字符串）
   *   3. 返回 key 本身（降级，不抛异常）
   * 
   * ICU 消息格式:
   *   t('users.delete.confirm', { username: 'admin' })
   *   → "确认删除用户 admin？"
   * 
   * @param key dot-separated 翻译路径
   * @param params ICU 插值参数
   * @returns 翻译后文本，或 key 本身（未找到翻译时）
   */
  t(key: string, params?: Record<string, string>): string

  /**
   * 带命名空间前缀的翻译（PluginHost 内部使用）
   * 
   * @param namespace 插件包名
   * @param key 翻译路径
   * @param params ICU 插值参数
   */
  translate(namespace: string, key: string, params?: Record<string, string>): string

  /**
   * 获取指定语言的所有翻译（前端 API 暴露）
   */
  getResources(locale: string): Record<string, LocaleMap>

  /**
   * 设置当前语言
   * Phase 1a: 固定为 'zh-CN'，无语言切换器
   * Phase 1b: 支持运行时切换
   */
  setLocale(locale: LocaleCode): void

  /**
   * 获取当前语言
   */
  getLocale(): LocaleCode
}
```

### 3.2 Core i18n 中间件（Fastify）

```typescript
// packages/i18n/src/i18n-fastify-plugin.ts

/**
 * Fastify i18n 插件
 * 
 * 功能:
 * 1. 解析请求头 Accept-Language（Phase 1b）
 * 2. 注入 req.t 翻译函数到 Request 对象
 * 3. 全局错误处理中间件使用 t() 翻译错误消息
 * 
 * Phase 1a: 忽略 Accept-Language，固定 zh-CN
 */
interface FastifyI18nOptions {
  /** 默认语言 */
  defaultLocale: LocaleCode  // 'zh-CN'
  /** 翻译管理器实例 */
  translationManager: TranslationManager
}
```

### 3.3 t() 函数注入 PluginHost

```typescript
// PluginHost 中的 t() 使用示例:

class RbacPlugin {
  async load() {
    // 使用注入的 t() 函数
    this.app.t('rbac.role_created')  // 自动使用当前插件的 namespace
    this.app.t('common.save')        // 回退到 'client' namespace
  }
}
```

---

## 4. 前端 i18n（D15）

### 4.1 I18nextProvider 配置

```typescript
// packages/admin-ui/src/i18n.ts

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

/**
 * i18next 初始化配置
 * 
 * 双命名空间模式 (D15):
 * 1. 插件专属命名空间 — 包名，如 '@audebase/plugin-rbac'
 * 2. 全局共享命名空间 — 'client'（通用 UI 字符串）
 */
async function initI18n(pluginManifests: PluginDescriptor[]): Promise<typeof i18n> {
  await i18n
    .use(initReactI18next)
    .init({
      // Phase 1a: 固定 zh-CN
      lng: 'zh-CN',
      fallbackLng: 'zh-CN',

      // 双命名空间
      ns: ['client', ...pluginManifests.map(p => p.name)],
      defaultNS: 'client',

      // Phase 1a: eager loading（预加载）
      // Phase 1b: backend plugin (i18next-resources-to-backend)
      resources: {
        'zh-CN': {
          client: { /* Core 提供的通用 UI 字符串 */ },
          '@audebase/plugin-core': { /* 内核插件翻译 */ },
          // ... 其他插件
        },
      },

      // ICU 消息格式
      interpolation: {
        escapeValue: false,  // React 已内置 XSS 防护
      },
    })

  return i18n
}
```

### 4.2 useTranslation Hook 使用约定

```typescript
// 插件内使用专属命名空间
function PurchasePage() {
  const { t } = useTranslation('@audebase/plugin-erp')

  return (
    <div>
      <h1>{t('purchase.title')}</h1>
      <Button>{t('common.save')}</Button>  {/* 自动回退到 'client' namespace */}
    </div>
  )
}

// 通用组件使用 'client' namespace
function DeleteButton() {
  const { t } = useTranslation('client')

  return <Button danger>{t('common.delete')}</Button>
}
```

### 4.3 Provider Stack 中的位置

```typescript
// I18nextProvider 在最外层，确保所有组件都能访问翻译
<I18nextProvider i18n={i18nInstance}>
  <QueryClientProvider>
    <TenantProvider>
      <UserProvider>
        <ACLProvider>
          <ProLayout>
            <Outlet />
          </ProLayout>
        </ACLProvider>
      </UserProvider>
    </TenantProvider>
  </QueryClientProvider>
</I18nextProvider>
```

---

## 5. TranslationManager 实现细节

### 5.1 翻译表聚合

```typescript
// 内部数据结构
type TranslationTable = Map<string, LocaleMap>
// namespace (插件包名或 'client') → LocaleMap

// 聚合流程:
// 1. plugin-core 的 locale/zh-CN.json → 注册到两个 namespace:
//    - '@audebase/plugin-core' (插件专属)
//    - 'client' (全局共享，仅 common.* 部分)
// 2. plugin-rbac 的 locale/zh-CN.json → 注册到:
//    - '@audebase/plugin-rbac' (插件专属)
// 3. 其他插件同理
```

### 5.2 命名空间冲突策略

```
同名 key 在不同 namespace 中不冲突 — 每个 namespace 是独立的 LocaleMap
同 namespace 内同名 key:
  - 后加载的插件覆盖先加载的（常见于 'client' namespace）
  - Core 插件（plugin-core）的 'client' namespace 具有最高优先级
  - 冲突时记录 logger.warn
```

### 5.3 翻译查找降级链

```
t(key, params) 查找顺序:
  1. 当前插件 namespace (从 PluginHost.name 推导)
  2. 'client' namespace（全局共享）
  3. 返回 key 本身（如 'missing.translation.key'）
     — 不抛异常，确保 UI 不崩溃
     — 记录 logger.debug('missing translation', { key })
```

---

## 6. 错误处理

### 6.1 翻译文件加载失败

```
locale/{lang}.json 文件不存在:
  → logger.warn('locale file not found', { plugin, path })
  → 该插件的翻译为空白（t() 降级返回 key）
  → 不阻塞插件加载

locale/{lang}.json 格式无效（非合法 JSON）:
  → logger.error('locale file parse error', { plugin, path, error })
  → 跳过该文件
  → 该插件的翻译为空白
```

### 6.2 翻译缺失处理

```
翻译 key 未找到:
  - 开发环境: logger.debug('missing translation', { namespace, key })
  - 生产环境: 静默降级（返回 key 本身）
  - UI 不崩溃（降级文本可能显示英文 key，但功能正常）
```

---

## 7. 测试边界

| 测试层级 | 范围 | 策略 | 文件位置 |
|---------|------|------|---------|
| 单元测试 | TranslationManager.loadAll(), t() 查找降级, ICU 插值 | mock 文件系统 | `src/__tests__/unit/` |
| 集成测试 | 完整加载 → 翻译查找 | 真实 locale JSON 文件 | `src/__tests__/integration/` |
| 前端测试 | useTranslation Hook, namespace 回退 | RTL + mock i18n | `packages/admin-ui/src/__tests__/` |

### 最小测试用例集

1. **基础翻译**: `t('errors.unauthorized')` → "未授权访问"
2. **ICU 插值**: `t('users.delete.confirm', { username: 'admin' })` → "确认删除用户 admin？"
3. **命名空间回退**: 在 plugin-rbac context 中调用 `t('common.save')` → 从 'client' namespace 获取"保存"
4. **缺失 key 降级**: `t('nonexistent.key')` → "nonexistent.key"（不抛异常）
5. **加载 zh-CN.json**: TranslationManager.loadAll() → 所有插件翻译已加载
6. **manifest locale.path 缺失**: 插件无 locale.path → 跳过，不阻塞
7. **无效 JSON**: locale/zh-CN.json 含语法错误 → 跳过，记录 error
8. **前端 useTranslation**: `useTranslation('@audebase/plugin-core')` 返回插件专属 t()
9. **前端 'client' namespace**: `useTranslation('client')` → 返回全局通用 t()
10. **Provider 顺序**: I18nextProvider 在最外层，子组件可正常调用 useTranslation

---

## 8. 与其他模块的交互

| 消费方 | 接口 | 调用方式 |
|--------|------|---------|
| #1 内核骨架 | `TranslationManager` | 启动时加载所有翻译 |
| #6 插件框架 | `PluginHost.t()` | 注入翻译函数到每个插件 |
| #8 RBAC | `t('errors.*')` | 错误消息翻译 |
| #10 审计日志 | `t()` | 审计事件描述翻译 |
| #12 管理 UI | `I18nextProvider` + `useTranslation` | 前端 UI 翻译 |
| 全局错误中间件 | `req.t()` | Fastify 错误响应翻译 |

---

## 9. Phase 1b 扩展预留

| 能力 | Phase 1a 状态 | Phase 1b 计划 |
|------|:---:|------|
| 多语言切换器 | 无，固定 zh-CN | UI 语言选择器 + 用户偏好存储 |
| en-US 翻译 | 无 | 所有模块提供 en-US.json |
| 懒加载翻译 | eager loading | i18next-resources-to-backend 按需加载 |
| Accept-Language 解析 | 忽略 | 自动检测浏览器语言 |
| ICU 复数/日期/数字格式化 | 基础插值 | 完整 ICU MessageFormat |
| 翻译编辑器 | 无 | Admin UI 内翻译管理（Phase 3） |

---

## 10. 生命周期

### 10.1 启动 (startup)

```
Core 启动
  │
  └─ TranslationManager.loadAll()
       │
       ├─ 遍历所有已 discover 的插件
       ├─ 定位 manifest.locale.path 目录
       ├─ 加载 zh-CN.json 文件
       ├─ 以插件包名为 namespace 注册到翻译表
       └─ plugin-core 同时注册 'client' namespace
```

**前置条件**: 插件已 discover 完成，PluginManager 已发现所有插件。

**失败处理**:
- locale 文件不存在 → logger.warn → 该插件翻译为空白 → 不阻塞启动
- locale 文件格式无效 → logger.error → 跳过该文件 → 不阻塞启动
- TranslationManager 自身崩溃 → Core 启动失败（退出码 1）

### 10.2 运行时 (runtime)

- `t(key, params)`: 插件通过 PluginHost.t() 调用，Core 通过 TranslationManager.t() 调用
- `setLocale(locale)`: Phase 1a 固定 zh-CN，不提供运行时切换
- Fastify i18n 中间件: Phase 1a 忽略 Accept-Language，固定 zh-CN

### 10.3 关闭 (shutdown)

- i18n 模块为无状态，无需特殊清理
- Phase 1b 语言切换器: 用户偏好可能需要持久化到 DB

---

## 11. Open Questions (Phase 1a 期间解决)

- [ ] `'client'` namespace 的通用 UI 字符串是否需要覆盖 Ant Design 内置组件的中文翻译（antd 自带 ConfigProvider.locale = zhCN）
- [ ] 翻译 key 是否需要枚举常量定义（`export const I18N_KEYS = {...}`），避免散落的 magic string
- [ ] TranslationManager 是否需要热重载（修改 locale JSON 后无需重启）
- [ ] 前后端翻译是否需要共享同一个 JSON 文件（当前分别维护：插件 locale/ 目录 + 前端 i18n resources）

---

## 12. 变更记录

| 版本 | 日期 | 变更内容 |
|------|------|---------|
| v0.1.0 | 2026-07-13 | 初始版本 |
