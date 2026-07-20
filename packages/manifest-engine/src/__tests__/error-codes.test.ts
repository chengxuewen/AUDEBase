// RED PHASE: imports will resolve once implementation is created
import { describe, it, expect } from 'vitest'
import { validateManifest, registerManifests } from '../index.js'

const VALID_MINIMAL_MANIFEST = {
  name: '@audebase/plugin-test',
  version: '1.0.0',
  display_name: 'Test Plugin',
  application: {
    entry: 'src/index.ts',
  },
  runtime: {
    mode: 'inline',
    partition: 'SYSTEM',
  },
}

describe('Manifest Engine 错误码覆盖', () => {
  // PARSE_ERROR - YAML 解析失败 (tested in yaml-parse.test.ts via parseManifestYaml)

  // VALIDATION_ERROR - Zod schema 验证失败
  it('缺少必填字段应抛出 VALIDATION_ERROR', () => {
    // Arrange
    const incomplete = { name: '@audebase/plugin-test' }

    // Act & Assert
    expect(() => validateManifest(incomplete)).toThrow('VALIDATION_ERROR')
  })

  // NAME_FORMAT_ERROR - 插件名不符合 @scope/plugin- 规范
  it('非法插件名格式应抛出 NAME_FORMAT_ERROR', () => {
    // Arrange
    const badManifest = JSON.parse(JSON.stringify(VALID_MINIMAL_MANIFEST))
    badManifest.name = 'no-scope-plugin'

    // Act & Assert
    expect(() => validateManifest(badManifest)).toThrow('NAME_FORMAT_ERROR')
  })

  // VERSION_FORMAT_ERROR - SemVer 格式错误
  it('非法版本号应抛出 VERSION_FORMAT_ERROR', () => {
    // Arrange
    const badManifest = JSON.parse(JSON.stringify(VALID_MINIMAL_MANIFEST))
    badManifest.version = 'latest'

    // Act & Assert
    expect(() => validateManifest(badManifest)).toThrow('VERSION_FORMAT_ERROR')
  })

  // MODE_ERROR - runtime.mode 非法（Phase 1a 仅 inline）
  it('非 inline mode 应抛出 MODE_ERROR', () => {
    // Arrange
    const badManifest = JSON.parse(JSON.stringify(VALID_MINIMAL_MANIFEST))
    badManifest.runtime.mode = 'container'

    // Act & Assert
    expect(() => validateManifest(badManifest)).toThrow('MODE_ERROR')
  })

  // PARTITION_ERROR - 非法 partition 值
  it('非法 partition 应抛出 PARTITION_ERROR', () => {
    // Arrange
    const badManifest = JSON.parse(JSON.stringify(VALID_MINIMAL_MANIFEST))
    badManifest.runtime.partition = 'INVALID'

    // Act & Assert
    expect(() => validateManifest(badManifest)).toThrow('PARTITION_ERROR')
  })

  // DUPLICATE_NAME - 插件名重复
  it('同名插件应抛出 DUPLICATE_NAME', () => {
    // Arrange
    const manifests = [
      { ...VALID_MINIMAL_MANIFEST, name: '@audebase/plugin-same' },
      { ...VALID_MINIMAL_MANIFEST, name: '@audebase/plugin-same' },
    ]

    // Act & Assert
    expect(() => registerManifests(manifests)).toThrow('DUPLICATE_NAME')
  })
})
