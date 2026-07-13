# i18n TDD 测试策略

> **模块**: `@audebase/i18n`  
> **依赖**: `@audebase/core`, `@audebase/shared-types`, `react-i18next` (前端), `i18next` (后端)  
> **更新日期**: 2026-07-13  
> **参考**: D14 (i18n 国际化)、D15 (react-i18next)、architecture.md §6.6

---

## 1. 测试范围

i18n 模块提供 Core `t()` 翻译函数（注入 PluginHost context）和前端 `useTranslation(namespace)` Hook。Phase 1a 仅实现骨架：zh-CN 默认 + en-US 基础翻译 + eager loading。

| 测试类型 | 最低用例数 | 环境 |
|---------|:---:|------|
| 单元测试 | 10+ | Node.js（i18next） |
| 组件测试 (RTL) | 4+ | jsdom (react-i18next) |
| 集成测试 | 4+ | 真实 Fastify app |
| E2E 测试 | 2+ | Playwright |

---

## 2. 模块结构

```
packages/i18n/
├── src/
│   ├── index.ts              # I18n Plugin 入口
│   ├── i18n.ts               # Core t() 工厂函数
│   ├── locale-loader.ts      # 语言文件加载器
│   └── __tests__/
│       ├── unit/
│       │   ├── i18n.test.ts
│       │   └── locale-loader.test.ts
│       ├── integration/
│       │   └── i18n.integration.test.ts
│       └── seeds/
│           └── translations.ts

packages/admin-ui/src/
├── i18n/
│   ├── client.ts             # react-i18next 初始化
│   └── __tests__/
│       └── i18n-ui.test.tsx
```

---

## 3. 单元测试 — 后端 Core t()

### 3.1 翻译函数单元测试

```
测试文件: packages/i18n/src/__tests__/unit/i18n.test.ts
```

```typescript
import { describe, test, expect, beforeEach } from 'vitest'
import { createTranslator } from '../../i18n'

const zhCNTranslations = {
  'plugin-core': {
    'menu.plugins': '插件管理',
    'menu.users': '用户管理',
    'button.save': '保存',
    'button.cancel': '取消',
    'validation.required': '{{field}} 为必填项',
  },
  client: {
    'error.unknown': '未知错误',
    'loading': '加载中...',
    'confirm.title': '确认操作',
  },
}

const enUSTranslations = {
  'plugin-core': {
    'menu.plugins': 'Plugins',
    'menu.users': 'Users',
    'button.save': 'Save',
    'button.cancel': 'Cancel',
    'validation.required': '{{field}} is required',
  },
  client: {
    'error.unknown': 'Unknown error',
    'loading': 'Loading...',
    'confirm.title': 'Confirm',
  },
}

describe('createTranslator (Core t())', () => {
  let tZh: (key: string, params?: Record<string, unknown>) => string
  let tEn: (key: string, params?: Record<string, unknown>) => string

  beforeEach(() => {
    tZh = createTranslator({ translations: zhCNTranslations, defaultLang: 'zh-CN' })
    tEn = createTranslator({ translations: enUSTranslations, defaultLang: 'en-US' })
  })

  test('解析简单键', () => {
    // Arrange & Act
    expect(tZh('plugin-core:menu.plugins')).toBe('插件管理')
    expect(tEn('plugin-core:menu.plugins')).toBe('Plugins')
  })

  test('解析带参数的 ICU 键', () => {
    // Arrange & Act
    expect(tZh('plugin-core:validation.required', { field: '用户名' })).toBe('用户名 为必填项')
  })

  test('解析 client 全局命名空间', () => {
    // Arrange & Act
    expect(tZh('client:loading')).toBe('加载中...')
    expect(tEn('client:loading')).toBe('Loading...')
  })

  test('缺失键回退到键名', () => {
    // Arrange & Act
    const result = tZh('plugin-core:nonexistent.key')
    expect(result).toBe('plugin-core:nonexistent.key')
  })

  test('缺失命名空间回退到键名', () => {
    // Arrange & Act
    const result = tZh('nonexistent-ns:some.key')
    expect(result).toBe('nonexistent-ns:some.key')
  })

  test('namespace 隔离：不同插件的同名键不冲突', () => {
    const translations = {
      'plugin-a': { 'menu.title': 'Plugin A Menu' },
      'plugin-b': { 'menu.title': 'Plugin B Menu' },
    }
    const t = createTranslator({ translations, defaultLang: 'en-US' })
    expect(t('plugin-a:menu.title')).toBe('Plugin A Menu')
    expect(t('plugin-b:menu.title')).toBe('Plugin B Menu')
  })

  test('无 namespace 前缀的键在 client 命名空间查找', () => {
    // Arrange & Act
    expect(tZh('error.unknown')).toBe('未知错误')
  })

  test('复数 ICU 消息', () => {
    // Arrange & Act
    const translations = {
      client: {
        'items.count': '{count, plural, =0 {没有项目} one {# 个项目} other {# 个项目}}',
      },
    }
    const t = createTranslator({ translations, defaultLang: 'zh-CN' })
    expect(t('client:items.count', { count: 0 })).toBe('没有项目')
    expect(t('client:items.count', { count: 1 })).toBe('1 个项目')
    expect(t('client:items.count', { count: 5 })).toBe('5 个项目')
  })
})
```

### 3.2 语言文件加载器单元测试

```
测试文件: packages/i18n/src/__tests__/unit/locale-loader.test.ts
```

```typescript
import { describe, test, expect } from 'vitest'
import { loadLocaleFile, validateLocaleFile } from '../../locale-loader'

describe('validateLocaleFile', () => {
  test('有效 zh-CN.json 验证通过', () => {
    // Arrange & Act
    const valid = {
      'menu.plugins': '插件管理',
      'menu.users': '用户管理',
    }
    expect(() => validateLocaleFile(valid)).not.toThrow()
  })

  test('值非 string 类型拒绝', () => {
    // Arrange & Act
    const invalid = { 'menu.plugins': 123 }
    expect(() => validateLocaleFile(invalid)).toThrow()
  })

  test('嵌套对象拒绝（仅支持 flat key）', () => {
    // Arrange & Act
    const invalid = { menu: { plugins: '插件管理' } }
    expect(() => validateLocaleFile(invalid)).toThrow()
  })
})

describe('loadLocaleFile', () => {
  test('从文件系统加载 zh-CN.json', async () => {
    // Arrange & Act
    const translations = await loadLocaleFile('/fake/path/locale/zh-CN.json')
    expect(translations).toHaveProperty('menu.plugins')
  })

  test('文件不存在时返回空对象 + 警告', async () => {
    // Arrange & Act
    const translations = await loadLocaleFile('/nonexistent/path.json')
    expect(translations).toEqual({})
  })

  test('JSON 格式错误时抛出', async () => {
    // Arrange & Act
    // 模拟 JSON.parse 错误
    await expect(loadLocaleFile('/path/to/invalid.json')).rejects.toThrow()
  })
})
```

---

## 4. 组件测试 — 前端 react-i18next (RTL)

```
测试文件: packages/admin-ui/src/i18n/__tests__/i18n-ui.test.tsx
```

```typescript
import { describe, test, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { I18nextProvider } from 'react-i18next'
import i18n from '../client'
import { TranslatableButton } from '../components/TranslatableButton'

// MockACLWrapper + I18nextProvider 包裹被测组件
function renderWithI18n(ui: React.ReactElement) {
  return render(
    <I18nextProvider i18n={i18n}>
      {ui}
    </I18nextProvider>
  )
}

describe('react-i18next 集成', () => {
  test('useTranslation 返回正确翻译', () => {
    // Arrange & Act
    function TestComponent() {
      const { t } = useTranslation('client')
      return <button>{t('loading')}</button>
    }
    renderWithI18n(<TestComponent />)
    expect(screen.getByRole('button')).toHaveTextContent('加载中...')  // zh-CN
  })

  test('插件 namespace 翻译', () => {
    // Arrange & Act
    function PluginComponent() {
      const { t } = useTranslation('@audebase/plugin-core')
      return <span>{t('menu.plugins')}</span>
    }
    renderWithI18n(<PluginComponent />)
    expect(screen.getByText('插件管理')).toBeTruthy()
  })

  test('缺失键显示键名', () => {
    // Arrange & Act
    function MissingKeyComponent() {
      const { t } = useTranslation('client')
      return <span>{t('nonexistent.key')}</span>
    }
    renderWithI18n(<MissingKeyComponent />)
    expect(screen.getByText('nonexistent.key')).toBeTruthy()
  })

  test('双命名空间（useTranslation 多 namespace）', () => {
    // Arrange & Act
    function DualNamespaceComponent() {
      const { t } = useTranslation(['@audebase/plugin-core', 'client'])
      return (
        <>
          <span data-testid="plugin-t">{t('@audebase/plugin-core:menu.plugins')}</span>
          <span data-testid="client-t">{t('client:loading')}</span>
        </>
      )
    }
    renderWithI18n(<DualNamespaceComponent />)
    expect(screen.getByTestId('plugin-t')).toHaveTextContent('插件管理')
    expect(screen.getByTestId('client-t')).toHaveTextContent('加载中...')
  })
})
```

---

## 5. 集成测试

```
测试文件: packages/i18n/src/__tests__/integration/i18n.integration.test.ts
```

```typescript
import { describe, test, expect } from 'vitest'
import { withTestApp } from '../../../core/src/__tests__/helpers/db-lifecycle'

describe('i18n 集成测试', () => {
  test('Core 聚合多个插件翻译', async () => {
    // Arrange & Act
    const { app } = await createTestApp({
      plugins: [
        { name: 'plugin-a', locale: { 'zh-CN': { 'menu.title': '插件A菜单' } } },
        { name: 'plugin-b', locale: { 'zh-CN': { 'menu.title': '插件B菜单' } } },
      ],
    })

    const t = app.getTranslator('zh-CN')
    expect(t('plugin-a:menu.title')).toBe('插件A菜单')
    expect(t('plugin-b:menu.title')).toBe('插件B菜单')
  })

  test('插件无 locale 文件不阻塞加载', async () => {
    // Arrange & Act
    const { app } = await createTestApp({
      plugins: [{ name: 'no-locale-plugin' }],
    })
    // 应用正常启动，不报错
    expect(app.isReady).toBe(true)
  })

  test('locale 文件格式错误时降级并记录错误', async () => {
    // Arrange & Act
    const { app } = await createTestApp({
      plugins: [{
        name: 'bad-locale-plugin',
        locale: { 'zh-CN': 'invalid json' as any },
      }],
    })
    // 不崩溃
    expect(app.isReady).toBe(true)
  })

  test('zh-CN 为默认语言', async () => {
    // Arrange & Act
    const { app } = await createTestApp()
    const t = app.getTranslator()
    // 验证默认是 zh-CN
    expect(t('client:loading')).toBe('加载中...')
  })
})
```

---

## 6. E2E 测试 (Playwright)

```
packages/admin-ui/__e2e__/i18n.e2e.ts
preSeed: { admin: true }
```

| 用例 | 描述 |
|------|------|
| 默认中文显示 | 登录后 → 页面菜单/按钮显示中文 |
| 缺失翻译降级 | 故意缺少某键 → 显示键名而非崩溃 |
| (Phase 1b) 语言切换 | 切换为 en-US → 菜单/按钮变英文 |

---

## 7. 种子数据

```
packages/i18n/src/__tests__/seeds/translations.ts
```

```typescript
export function seedPluginTranslations(): Record<string, Record<string, string>> {
  return {
    'plugin-core': {
      'menu.plugins': '插件管理',
      'menu.users': '用户管理',
      'button.save': '保存',
      'button.cancel': '取消',
    },
    client: {
      'loading': '加载中...',
      'error.unknown': '未知错误',
      'confirm.ok': '确定',
      'confirm.cancel': '取消',
    },
  }
}

export function seedEnTranslations(): Record<string, Record<string, string>> {
  return {
    'plugin-core': {
      'menu.plugins': 'Plugins',
      'menu.users': 'Users',
      'button.save': 'Save',
      'button.cancel': 'Cancel',
    },
    client: {
      'loading': 'Loading...',
      'error.unknown': 'Unknown error',
      'confirm.ok': 'OK',
      'confirm.cancel': 'Cancel',
    },
  }
}
```

---

## 8. Mock 策略

| 依赖 | 单元测试 | 组件测试 | 集成测试 |
|------|---------|---------|---------|
| i18next | 真实 i18next | 真实 react-i18next | 真实 |
| 文件系统 | memfs (mock fs) | 不涉及 | 真实 |
| react-i18next | 不涉及 | I18nextProvider wrapper | 不涉及 |

---

## 9. 覆盖率目标

| 指标 | 目标 | 关键路径 |
|------|:---:|------|
| 行覆盖率 | **80%+** | |
| 分支覆盖率 | **75%+** | 键查找、回退逻辑、参数替换 |
| 函数覆盖率 | **90%+** | t() / validateLocaleFile / loadLocaleFile |
| ICU 格式 | 3+ | 简单键 / 参数插值 / 复数 |

---

## 10. 用例汇总

| 测试层 | 文件 | 用例数 |
|--------|------|:---:|
| 单元 | `i18n.test.ts` | 8 |
| 单元 | `locale-loader.test.ts` | 5 |
| 组件 | `i18n-ui.test.tsx` | 4 |
| 集成 | `i18n.integration.test.ts` | 4 |
| E2E | `i18n.e2e.ts` | 2 |
| **合计** | | **23** |

---

## 11. 参考

---

## 11. 契约测试

**测试文件**: `packages/i18n/src/__tests__/contracts/i18n.contract.test.ts`

```typescript
import { describe, test, expect } from 'vitest'
import { withTestApp } from '../../../core/src/__tests__/helpers/db-lifecycle'
import { validateContract } from '../helpers/contract'
import { z } from 'zod'

const translationResponseSchema = z.object({
  namespace: z.string(),
  keys: z.record(z.string(), z.string()),
  defaultLang: z.string(),
})

describe('i18n 契约测试', () => {
  test('插件翻译端点返回正确 JSON 形状', async () => {
    // Arrange & Act
    await withTestApp(async (app) => {
      await validateContract('GET', '/api/i18n/plugin-core/zh-CN', {
        response: translationResponseSchema,
        status: 200,
      })
    })
  })

  test('缺失翻译文件返回 404', async () => {
    // Arrange & Act
    await withTestApp(async (app) => {
      await validateContract('GET', '/api/i18n/nonexistent-plugin/zh-CN', {
        response: errorResponseSchema,
        status: 404,
      })
    })
  })

  test('不存在的语言代码返回 400', async () => {
    // Arrange & Act
    await withTestApp(async (app) => {
      await validateContract('GET', '/api/i18n/plugin-core/xx-XX', {
        response: errorResponseSchema,
        status: 400,
      })
    })
  })
})
```

---

- [architecture.md](../architecture.md) §6.6 — 前端国际化 (react-i18next)
- [frontend-spec.md](frontend-spec.md) §1 — Admin UI 路由结构
- [../../.agents/memorys/decisions.md](../../.agents/memorys/decisions.md) — D14 (i18n 后端)、D15 (react-i18next 前端)
