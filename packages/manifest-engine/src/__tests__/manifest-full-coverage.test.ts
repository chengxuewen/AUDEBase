// RED PHASE: imports will resolve once implementation is created
import { describe, it, expect } from 'vitest'
import { manifestSchema } from '../index'

// 合法全量 manifest 作为基线
const FULL_VALID_MANIFEST = {
  name: '@audebase/plugin-test',
  version: '1.0.0',
  display_name: '测试插件',
  description: '用于测试的示例插件',
  category: 'business' as const,
  license: 'Apache-2.0',
  application: {
    entry: 'src/index.ts',
    author: 'aude-team',
  },
  dependencies: ['@audebase/plugin-rbac'],
  assets: ['dist/admin.js', 'dist/admin.css'],
  runtime: {
    mode: 'inline' as const,
    partition: 'SYSTEM',
    crash_policy: 'restart' as const,
  },
  security: { db_namespace: 'test_ns' },
  models: [{ name: 'order', table: 'orders' }],
  permissions: [
    { action: 'create', resource: 'order', description: '创建订单' },
    { action: 'read', resource: 'order' },
  ],
  locale: { path: 'locale' },
  data: ['seeds/init.sql'],
  cron: [{ name: 'cleanup', schedule: '0 3 * * *', handler: 'cleanupHandler' }],
}

describe('manifestSchema - 全字段覆盖', () => {
  // ============================================================
  // 基础元数据
  // ============================================================

  describe('name', () => {
    it('合法 name: @scope/plugin-name', () => {
      // Arrange
      const validNames = [
        '@audebase/plugin-core',
        '@audebase/plugin-rbac',
        '@my/plugin-hello',
        '@a/plugin-b',
      ]

      // Act & Assert
      for (const name of validNames) {
        const manifest = { ...FULL_VALID_MANIFEST, name }
        expect(manifestSchema.safeParse(manifest).success).toBe(true)
      }
    })

    it('非法 name: 无 scope', () => {
      // Arrange
      const manifest = { ...FULL_VALID_MANIFEST, name: 'my-plugin' }

      // Act & Assert
      expect(manifestSchema.safeParse(manifest).success).toBe(false)
    })

    it('非法 name: 空字符串', () => {
      // Arrange
      const manifest = { ...FULL_VALID_MANIFEST, name: '' }

      // Act & Assert
      expect(manifestSchema.safeParse(manifest).success).toBe(false)
    })

    it('非法 name: 大写字母', () => {
      // Arrange
      const manifest = { ...FULL_VALID_MANIFEST, name: '@Audebase/Plugin-Test' }

      // Act & Assert
      expect(manifestSchema.safeParse(manifest).success).toBe(false)
    })
  })

  describe('version', () => {
    it('合法 SemVer', () => {
      // Arrange
      const validVersions = ['0.1.0', '1.0.0', '2.3.4', '1.0.0-alpha.1', '1.0.0-beta.2']

      // Act & Assert
      for (const version of validVersions) {
        const manifest = { ...FULL_VALID_MANIFEST, version }
        expect(manifestSchema.safeParse(manifest).success).toBe(true)
      }
    })

    it('非法 version: 缺少 patch', () => {
      // Arrange
      const manifest = { ...FULL_VALID_MANIFEST, version: '1.0' }

      // Act & Assert
      expect(manifestSchema.safeParse(manifest).success).toBe(false)
    })

    it('非法 version: v 前缀', () => {
      // Arrange
      const manifest = { ...FULL_VALID_MANIFEST, version: 'v1.0.0' }

      // Act & Assert
      expect(manifestSchema.safeParse(manifest).success).toBe(false)
    })
  })

  describe('display_name', () => {
    it('应在 1-255 字符范围内', () => {
      // Arrange
      const shortName = { ...FULL_VALID_MANIFEST, display_name: 'A' }
      const longName = { ...FULL_VALID_MANIFEST, display_name: 'A'.repeat(255) }
      const tooLong = { ...FULL_VALID_MANIFEST, display_name: 'A'.repeat(256) }
      const empty = { ...FULL_VALID_MANIFEST, display_name: '' }

      // Act & Assert
      expect(manifestSchema.safeParse(shortName).success).toBe(true)
      expect(manifestSchema.safeParse(longName).success).toBe(true)
      expect(manifestSchema.safeParse(tooLong).success).toBe(false)
      expect(manifestSchema.safeParse(empty).success).toBe(false)
    })
  })

  describe('category', () => {
    it('合法值: SYSTEM, business, integration, theme', () => {
      // Arrange
      const validCategories = ['SYSTEM', 'business', 'integration', 'theme'] as const

      // Act & Assert
      for (const category of validCategories) {
        const manifest = { ...FULL_VALID_MANIFEST, category }
        expect(manifestSchema.safeParse(manifest).success).toBe(true)
      }
    })

    it('非法 category: 不在枚举中', () => {
      // Arrange
      const manifest = { ...FULL_VALID_MANIFEST, category: 'unknown' }

      // Act & Assert
      expect(manifestSchema.safeParse(manifest).success).toBe(false)
    })

    it('category 可选 - 缺失应通过', () => {
      // Arrange
      const { category, ...rest } = FULL_VALID_MANIFEST

      // Act & Assert
      expect(manifestSchema.safeParse(rest).success).toBe(true)
    })
  })

  // ============================================================
  // 运行时配置
  // ============================================================

  describe('runtime', () => {
    it('mode 必须为 inline（Phase 1a）', () => {
      // Arrange
      const manifest = {
        ...FULL_VALID_MANIFEST,
        runtime: { ...FULL_VALID_MANIFEST.runtime, mode: 'process' },
      }

      // Act & Assert
      expect(manifestSchema.safeParse(manifest).success).toBe(false)
    })

    it('partition 可为任意字符串', () => {
      // Arrange
      const partitions = ['SYSTEM', 'oa', 'erp', 'mes', 'isolated', 'custom-domain']

      // Act & Assert
      for (const partition of partitions) {
        const manifest = {
          ...FULL_VALID_MANIFEST,
          runtime: { ...FULL_VALID_MANIFEST.runtime, partition },
        }
        expect(manifestSchema.safeParse(manifest).success).toBe(true)
      }
    })

    it('crash_policy 默认值为 restart', () => {
      // Arrange
      const { crash_policy, ...runtime } = FULL_VALID_MANIFEST.runtime
      const manifest = { ...FULL_VALID_MANIFEST, runtime }

      // Act
      const parsed = manifestSchema.parse(manifest)

      // Assert
      expect(parsed.runtime.crash_policy).toBe('restart')
    })

    it('crash_policy: restart 或 ignore', () => {
      // Arrange
      const validManifest = {
        ...FULL_VALID_MANIFEST,
        runtime: { ...FULL_VALID_MANIFEST.runtime, crash_policy: 'ignore' },
      }
      const invalidManifest = {
        ...FULL_VALID_MANIFEST,
        runtime: { ...FULL_VALID_MANIFEST.runtime, crash_policy: 'kill' },
      }

      // Act & Assert
      expect(manifestSchema.safeParse(validManifest).success).toBe(true)
      expect(manifestSchema.safeParse(invalidManifest).success).toBe(false)
    })
  })

  // ============================================================
  // 依赖声明
  // ============================================================

  describe('dependencies', () => {
    it('默认值为空数组', () => {
      // Arrange
      const { dependencies, ...rest } = FULL_VALID_MANIFEST

      // Act
      const parsed = manifestSchema.parse(rest)

      // Assert
      expect(parsed.dependencies).toEqual([])
    })

    it('依赖应为字符串数组', () => {
      // Arrange
      const manifest = {
        ...FULL_VALID_MANIFEST,
        dependencies: ['@audebase/plugin-rbac', '@audebase/plugin-audit'],
      }

      // Act & Assert
      expect(manifestSchema.safeParse(manifest).success).toBe(true)
    })

    it('依赖不能为非字符串类型', () => {
      // Arrange
      const manifest = {
        ...FULL_VALID_MANIFEST,
        dependencies: [{ name: '@audebase/plugin-rbac' }],
      }

      // Act & Assert
      expect(manifestSchema.safeParse(manifest).success).toBe(false)
    })
  })

  // ============================================================
  // 权限声明
  // ============================================================

  describe('permissions', () => {
    it('默认值为空数组', () => {
      // Arrange
      const { permissions, ...rest } = FULL_VALID_MANIFEST

      // Act
      const parsed = manifestSchema.parse(rest)

      // Assert
      expect(parsed.permissions).toEqual([])
    })

    it('action 和 resource 必填', () => {
      // Arrange
      const manifest = {
        ...FULL_VALID_MANIFEST,
        permissions: [{ action: 'read' }],
      }

      // Act & Assert
      expect(manifestSchema.safeParse(manifest).success).toBe(false)
    })

    it('description 可选', () => {
      // Arrange
      const manifest = {
        ...FULL_VALID_MANIFEST,
        permissions: [{ action: 'read', resource: 'order' }],
      }

      // Act & Assert
      expect(manifestSchema.safeParse(manifest).success).toBe(true)
    })
  })

  // ============================================================
  // 默认值
  // ============================================================

  describe('默认值', () => {
    it('license 默认为 Apache-2.0', () => {
      // Arrange
      const { license, ...rest } = FULL_VALID_MANIFEST

      // Act
      const parsed = manifestSchema.parse(rest)

      // Assert
      expect(parsed.license).toBe('Apache-2.0')
    })

    it('assets 默认为空数组', () => {
      // Arrange
      const { assets, ...rest } = FULL_VALID_MANIFEST

      // Act
      const parsed = manifestSchema.parse(rest)

      // Assert
      expect(parsed.assets).toEqual([])
    })

    it('security 默认为 {}', () => {
      // Arrange
      const { security, ...rest } = FULL_VALID_MANIFEST

      // Act
      const parsed = manifestSchema.parse(rest)

      // Assert
      expect(parsed.security).toEqual({})
    })

    it('models 默认为空数组', () => {
      // Arrange
      const { models, ...rest } = FULL_VALID_MANIFEST

      // Act
      const parsed = manifestSchema.parse(rest)

      // Assert
      expect(parsed.models).toEqual([])
    })

    it('data 默认为空数组', () => {
      // Arrange
      const { data, ...rest } = FULL_VALID_MANIFEST

      // Act
      const parsed = manifestSchema.parse(rest)

      // Assert
      expect(parsed.data).toEqual([])
    })

    it('cron 默认为空数组', () => {
      // Arrange
      const { cron, ...rest } = FULL_VALID_MANIFEST

      // Act
      const parsed = manifestSchema.parse(rest)

      // Assert
      expect(parsed.cron).toEqual([])
    })
  })
})
