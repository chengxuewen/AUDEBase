// RED PHASE: imports will resolve once implementation is created
import { describe, it, expect } from 'vitest'
import { compareVersions, isVersionGt, semverSort } from '../index'

describe('版本比较工具', () => {
  describe('compareVersions', () => {
    it('相同版本返回 0', () => {
      // Arrange & Act & Assert
      expect(compareVersions('1.0.0', '1.0.0')).toBe(0)
    })

    it('a > b 返回正数', () => {
      // Arrange & Act & Assert
      expect(compareVersions('2.0.0', '1.0.0')).toBeGreaterThan(0)
      expect(compareVersions('1.1.0', '1.0.0')).toBeGreaterThan(0)
      expect(compareVersions('1.0.1', '1.0.0')).toBeGreaterThan(0)
    })

    it('a < b 返回负数', () => {
      // Arrange & Act & Assert
      expect(compareVersions('1.0.0', '2.0.0')).toBeLessThan(0)
      expect(compareVersions('1.0.0', '1.1.0')).toBeLessThan(0)
      expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0)
    })

    it('pre-release 版本排序', () => {
      // Arrange & Act & Assert
      // 根据 SemVer: 1.0.0-alpha < 1.0.0
      expect(compareVersions('1.0.0-alpha', '1.0.0')).toBeLessThan(0)
      expect(compareVersions('1.0.0-alpha.1', '1.0.0-alpha.2')).toBeLessThan(0)
      expect(compareVersions('1.0.0-beta', '1.0.0')).toBeLessThan(0)
    })

    it('应处理多位数版本号', () => {
      // Arrange & Act & Assert
      expect(compareVersions('10.0.0', '2.0.0')).toBeGreaterThan(0)
      expect(compareVersions('1.20.0', '1.3.0')).toBeGreaterThan(0)
    })
  })

  describe('isVersionGt', () => {
    it('新版本 > 已安装版本返回 true', () => {
      // Arrange & Act & Assert
      // manifest version 2.0.0, 已安装 version 1.0.0
      expect(isVersionGt('2.0.0', '1.0.0')).toBe(true)
    })

    it('新版本 ≤ 已安装版本返回 false', () => {
      // Arrange & Act & Assert
      expect(isVersionGt('1.0.0', '1.0.0')).toBe(false)
      expect(isVersionGt('0.9.0', '1.0.0')).toBe(false)
    })
  })

  describe('semverSort', () => {
    it('应按版本升序排列', () => {
      // Arrange
      const versions = ['2.0.0', '1.0.0', '1.5.0', '1.0.1', '1.0.0-alpha']

      // Act
      const sorted = semverSort(versions)

      // Assert
      expect(sorted[0]).toBe('1.0.0-alpha')
      expect(sorted[1]).toBe('1.0.0')
      expect(sorted[2]).toBe('1.0.1')
      expect(sorted[3]).toBe('1.5.0')
      expect(sorted[4]).toBe('2.0.0')
    })
  })
})
