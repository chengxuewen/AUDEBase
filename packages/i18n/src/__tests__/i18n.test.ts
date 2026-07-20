// RED PHASE: imports will resolve once implementation is created
import { describe, it, expect, beforeEach } from 'vitest'
import { createTranslator } from '../index.js'

const zhCNTranslations: Record<string, Record<string, string>> = {
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

const enUSTranslations: Record<string, Record<string, string>> = {
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
  let tZh: (key: string, params?: Record<string, string>) => string
  let tEn: (key: string, params?: Record<string, string>) => string

  beforeEach(() => {
    tZh = createTranslator({ translations: zhCNTranslations, defaultLang: 'zh-CN' })
    tEn = createTranslator({ translations: enUSTranslations, defaultLang: 'en-US' })
  })

  it('should resolve a simple key', () => {
    // Arrange & Act
    const zhResult = tZh('plugin-core:menu.plugins')
    const enResult = tEn('plugin-core:menu.plugins')

    // Assert
    expect(zhResult).toBe('插件管理')
    expect(enResult).toBe('Plugins')
  })

  it('should resolve ICU key with parameters', () => {
    // Arrange & Act
    const result = tZh('plugin-core:validation.required', { field: '用户名' })

    // Assert
    expect(result).toBe('用户名 为必填项')
  })

  it('should resolve client global namespace', () => {
    // Arrange & Act
    const zhResult = tZh('client:loading')
    const enResult = tEn('client:loading')

    // Assert
    expect(zhResult).toBe('加载中...')
    expect(enResult).toBe('Loading...')
  })

  it('should fall back to key name when key is missing', () => {
    // Arrange & Act
    const result = tZh('plugin-core:nonexistent.key')

    // Assert
    expect(result).toBe('plugin-core:nonexistent.key')
  })

  it('should fall back to key name when namespace is missing', () => {
    // Arrange & Act
    const result = tZh('nonexistent-ns:some.key')

    // Assert
    expect(result).toBe('nonexistent-ns:some.key')
  })

  it('should isolate namespaces: same key in different plugins does not conflict', () => {
    // Arrange
    const translations: Record<string, Record<string, string>> = {
      'plugin-a': { 'menu.title': 'Plugin A Menu' },
      'plugin-b': { 'menu.title': 'Plugin B Menu' },
    }

    // Act
    const t = createTranslator({ translations, defaultLang: 'en-US' })

    // Assert
    expect(t('plugin-a:menu.title')).toBe('Plugin A Menu')
    expect(t('plugin-b:menu.title')).toBe('Plugin B Menu')
  })

  it('should look up keys without namespace prefix in client namespace', () => {
    // Arrange & Act
    const result = tZh('error.unknown')

    // Assert
    expect(result).toBe('未知错误')
  })

  it('should handle ICU plural messages', () => {
    // Arrange
    const translations: Record<string, Record<string, string>> = {
      client: {
        'items.count': '{count, plural, =0 {没有项目} one {# 个项目} other {# 个项目}}',
      },
    }
    const t = createTranslator({ translations, defaultLang: 'zh-CN' })

    // Act & Assert
    expect(t('client:items.count', { count: '0' })).toBe('没有项目')
    expect(t('client:items.count', { count: '1' })).toBe('1 个项目')
    expect(t('client:items.count', { count: '5' })).toBe('5 个项目')
  })
})
