// RED PHASE: imports will resolve once implementation is created
import { describe, it, expect } from 'vitest'
import { manifestSchema } from '../manifest-schema.js'

describe('manifestSchema - 合法 manifest', () => {
  it('应通过合法的完整 manifest', () => {
    // Arrange
    const validManifest = {
      name: '@audebase/plugin-core',
      version: '1.0.0',
      display_name: '内核插件',
      description: '平台核心引导插件',
      category: 'SYSTEM',
      license: 'Apache-2.0',
      application: {
        entry: 'src/index.ts',
        author: 'aude-team',
      },
      dependencies: ['@audebase/plugin-rbac'],
      assets: ['dist/admin.js'],
      runtime: {
        mode: 'inline' as const,
        partition: 'SYSTEM',
        crash_policy: 'restart' as const,
      },
      security: {},
      models: [{ name: 'user', table: 'users' }],
      permissions: [{ action: 'manage', resource: 'plugin' }],
      locale: { path: 'locale' },
      data: [],
      cron: [],
    }

    // Act
    const result = manifestSchema.safeParse(validManifest)

    // Assert
    expect(result.success).toBe(true)
  })

  it('应通过仅含必填字段的最小 manifest', () => {
    // Arrange
    const minimalManifest = {
      name: '@audebase/plugin-minimal',
      version: '0.1.0',
      display_name: '最小插件',
      application: { entry: 'src/index.ts' },
      runtime: { mode: 'inline' as const, partition: 'SYSTEM' },
    }

    // Act
    const result = manifestSchema.safeParse(minimalManifest)

    // Assert
    expect(result.success).toBe(true)
  })
})

describe('manifestSchema - 非法 manifest', () => {
  it('name 不符合 @scope/plugin- 格式应拒绝', () => {
    // Arrange
    const badNames = ['my-plugin', '@audebase/my-plugin', 'plugin-hello', '']

    // Act & Assert
    for (const name of badNames) {
      const manifest = {
        name,
        version: '1.0.0',
        display_name: 'Test',
        application: { entry: 'src/index.ts' },
        runtime: { mode: 'inline' as const, partition: 'SYSTEM' },
      }

      const result = manifestSchema.safeParse(manifest)
      expect(result.success).toBe(false)
    }
  })

  it('version 不符合 SemVer 应拒绝', () => {
    // Arrange
    const badVersions = ['1.0', 'v1.0.0', 'latest', '1.0.0.0', '']

    // Act & Assert
    for (const version of badVersions) {
      const manifest = {
        name: '@audebase/plugin-test',
        version,
        display_name: 'Test',
        application: { entry: 'src/index.ts' },
        runtime: { mode: 'inline' as const, partition: 'SYSTEM' },
      }

      const result = manifestSchema.safeParse(manifest)
      expect(result.success).toBe(false)
    }
  })

  it('缺少必填字段应返回 ZodError', () => {
    // Arrange
    const incompleteManifest = {
      name: '@audebase/plugin-test',
      // 缺少 version, display_name, application, runtime
    }

    // Act
    const result = manifestSchema.safeParse(incompleteManifest)

    // Assert
    expect(result.success).toBe(false)
    if (!result.success) {
      const missingFields = result.error.issues.map(i => i.path.join('.'))
      expect(missingFields).toContain('version')
      expect(missingFields).toContain('display_name')
      expect(missingFields).toContain('application')
      expect(missingFields).toContain('runtime')
    }
  })

  it('runtime.mode 非 inline 应拒绝（Phase 1a 仅支持 inline）', () => {
    // Arrange
    const manifest = {
      name: '@audebase/plugin-test',
      version: '1.0.0',
      display_name: 'Test',
      application: { entry: 'src/index.ts' },
      runtime: { mode: 'process', partition: 'SYSTEM' },
    }

    // Act
    const result = manifestSchema.safeParse(manifest)

    // Assert
    expect(result.success).toBe(false)
  })

  it('display_name 空字符串应拒绝', () => {
    // Arrange
    const manifest = {
      name: '@audebase/plugin-test',
      version: '1.0.0',
      display_name: '',
      application: { entry: 'src/index.ts' },
      runtime: { mode: 'inline' as const, partition: 'SYSTEM' },
    }

    // Act
    const result = manifestSchema.safeParse(manifest)

    // Assert
    expect(result.success).toBe(false)
  })
})
