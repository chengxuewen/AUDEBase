// RED PHASE: imports will resolve once implementation is created
import { describe, it, expect, vi } from 'vitest'
import { loadLocaleFile, validateLocaleFile } from '../index'

describe('validateLocaleFile', () => {
  it('should pass validation for a valid flat-key zh-CN.json', () => {
    // Arrange
    const valid: Record<string, string> = {
      'menu.plugins': '插件管理',
      'menu.users': '用户管理',
    }

    // Act & Assert
    expect(() => validateLocaleFile(valid)).not.toThrow()
  })

  it('should reject values that are not strings', () => {
    // Arrange
    const invalid: Record<string, unknown> = { 'menu.plugins': 123 }

    // Act & Assert
    expect(() => validateLocaleFile(invalid)).toThrow()
  })

  it('should reject nested objects (only flat keys supported)', () => {
    // Arrange
    const invalid: Record<string, unknown> = {
      menu: { plugins: '插件管理' },
    }

    // Act & Assert
    expect(() => validateLocaleFile(invalid)).toThrow()
  })
})

describe('loadLocaleFile', () => {
  it('should load a zh-CN.json file from filesystem', async () => {
    // Arrange
    const mockFs = {
      readFile: vi.fn().mockResolvedValue(
        JSON.stringify({ 'menu.plugins': '插件管理' }),
      ),
    }

    // Act
    const translations = await loadLocaleFile('/fake/path/locale/zh-CN.json', mockFs)

    // Assert
    expect(translations).toHaveProperty('menu.plugins', '插件管理')
  })

  it('should return empty object when file does not exist', async () => {
    // Arrange
    const mockFs = {
      readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
    }

    // Act
    const translations = await loadLocaleFile('/nonexistent/path.json', mockFs)

    // Assert
    expect(translations).toEqual({})
  })

  it('should throw when JSON format is invalid', async () => {
    // Arrange
    const mockFs = {
      readFile: vi.fn().mockResolvedValue('{ invalid json }'),
    }

    // Act & Assert
    await expect(
      loadLocaleFile('/path/to/invalid.json', mockFs),
    ).rejects.toThrow()
  })
})
