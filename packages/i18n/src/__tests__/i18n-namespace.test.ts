/**
 * @audebase/i18n - Namespace conflict and resolution tests (AAA pattern)
 *
 * SDD Ref: D14 — NocoBase namespace isolation
 *
 * Tests namespace conflict resolution, same-key isolation,
 * and fallback chain behavior.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { createTranslator } from '../index.js'
import type { TranslatorConfig } from '../index.js'

describe('i18n — namespace conflicts and resolution', () => {
  // ─── Same key in different namespaces ───────────────────

  it('should resolve same key independently across namespaces', () => {
    // Arrange
    const translations: Record<string, Record<string, string>> = {
      'plugin-a': { 'menu.title': 'Plugin A Title' },
      'plugin-b': { 'menu.title': 'Plugin B Title' },
    }
    const t = createTranslator({ translations, defaultLang: 'en-US' })

    // Act & Assert
    expect(t('plugin-a:menu.title')).toBe('Plugin A Title')
    expect(t('plugin-b:menu.title')).toBe('Plugin B Title')
  })

  // ─── Default namespace (no prefix) lookup ───────────────

  it('should look up keys without namespace prefix in client namespace', () => {
    // Arrange
    const translations: Record<string, Record<string, string>> = {
      client: { 'common.save': 'Save', 'common.cancel': 'Cancel' },
      'plugin-a': { 'common.save': 'Custom Save' },
    }
    const t = createTranslator({ translations, defaultLang: 'en-US' })

    // Act & Assert
    expect(t('common.save')).toBe('Save')
    expect(t('common.cancel')).toBe('Cancel')
  })

  it('should NOT resolve unprefixed key from non-client namespace', () => {
    // Arrange
    const translations: Record<string, Record<string, string>> = {
      client: {},
      'plugin-a': { 'hello': 'Hello from A' },
    }
    const t = createTranslator({ translations, defaultLang: 'en-US' })

    // Act & Assert
    // unprefixed key should only look in client, not plugin namespaces
    expect(t('hello')).toBe('hello')
  })

  // ─── Missing namespace ──────────────────────────────────

  it('should return key as-is when namespace does not exist', () => {
    // Arrange
    const translations: Record<string, Record<string, string>> = {
      client: { 'loading': 'Loading...' },
    }
    const t = createTranslator({ translations, defaultLang: 'en-US' })

    // Act
    const result = t('nonexistent-ns:some.key')

    // Assert
    expect(result).toBe('nonexistent-ns:some.key')
  })

  it('should return key as-is when key does not exist in namespace', () => {
    // Arrange
    const translations: Record<string, Record<string, string>> = {
      'plugin-a': { 'menu.title': 'Title' },
    }
    const t = createTranslator({ translations, defaultLang: 'en-US' })

    // Act
    const result = t('plugin-a:missing.key')

    // Assert
    expect(result).toBe('plugin-a:missing.key')
  })

  // ─── ICU interpolation edge cases ────────────────────────

  describe('ICU interpolation', () => {
    it('should handle missing params gracefully', () => {
      // Arrange
      const translations: Record<string, Record<string, string>> = {
        client: { 'greeting': 'Hello, {{name}}!' },
      }
      const t = createTranslator({ translations, defaultLang: 'en-US' })

      // Act
      const result = t('client:greeting')

      // Assert
      // Should render with placeholder or partial text — not crash
      expect(typeof result).toBe('string')
    })

    it('should handle extra params not in template', () => {
      // Arrange
      const translations: Record<string, Record<string, string>> = {
        client: { 'greeting': 'Hello!' },
      }
      const t = createTranslator({ translations, defaultLang: 'en-US' })

      // Act
      const result = t('client:greeting', { extra: 'unused' })

      // Assert
      expect(typeof result).toBe('string')
    })

    it('should handle multiple params in one template', () => {
      // Arrange
      const translations: Record<string, Record<string, string>> = {
        client: {
          'invite': '{{sender}} invited you to {{group}}',
        },
      }
      const t = createTranslator({ translations, defaultLang: 'en-US' })

      // Act
      const result = t('client:invite', { sender: 'Alice', group: 'DevTeam' })

      // Assert
      expect(result).toContain('Alice')
      expect(result).toContain('DevTeam')
    })
  })

  // ─── Special characters in keys ─────────────────────────

  describe('special characters in keys', () => {
    it('should handle keys with dots and special chars', () => {
      // Arrange
      const translations: Record<string, Record<string, string>> = {
        client: {
          'error.404': 'Not Found',
          'error.500': 'Server Error',
        },
      }
      const t = createTranslator({ translations, defaultLang: 'en-US' })

      // Act & Assert
      expect(t('client:error.404')).toBe('Not Found')
      expect(t('client:error.500')).toBe('Server Error')
    })

    it('should handle deeply nested dot-separated keys', () => {
      // Arrange
      const translations: Record<string, Record<string, string>> = {
        client: {
          'users.create.form.title': 'Create User',
          'users.create.form.submit': 'Submit',
        },
      }
      const t = createTranslator({ translations, defaultLang: 'en-US' })

      // Act & Assert
      expect(t('client:users.create.form.title')).toBe('Create User')
      expect(t('client:users.create.form.submit')).toBe('Submit')
    })
  })

  // ─── Empty translations ─────────────────────────────────

  it('should handle empty translations gracefully', () => {
    // Arrange
    const t = createTranslator({ translations: {}, defaultLang: 'en-US' })

    // Act
    const result = t('any.key')

    // Assert
    expect(result).toBe('any.key')
  })

  it('should handle empty namespace map', () => {
    // Arrange
    const translations: Record<string, Record<string, string>> = {
      'plugin-a': {},
    }
    const t = createTranslator({ translations, defaultLang: 'en-US' })

    // Act
    const result = t('plugin-a:anything')

    // Assert
    expect(result).toBe('plugin-a:anything')
  })

  // ─── Configuration edge cases ────────────────────────────

  it('should accept TranslatorConfig with only required fields', () => {
    // Arrange & Act
    const t = createTranslator({
      translations: { client: { 'ok': 'OK' } },
      defaultLang: 'fr',
    })

    // Assert
    expect(t('client:ok')).toBe('OK')
  })

  it('should not mutate the original translations object', () => {
    // Arrange
    const translations: Record<string, Record<string, string>> = {
      client: { 'key': 'value' },
    }
    const original = JSON.stringify(translations)
    const t = createTranslator({ translations, defaultLang: 'en-US' })

    // Act
    t('client:key')

    // Assert
    expect(JSON.stringify(translations)).toBe(original)
  })
})
