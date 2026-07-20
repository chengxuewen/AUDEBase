// RED PHASE: imports will resolve once implementation is created
import { describe, it, expect } from 'vitest'
import { ErrorCode, UserError, SystemError, AssertionError } from '../errors.js'

describe('ErrorCode 枚举', () => {
  it('所有错误码唯一且无重复值', () => {
    // Arrange
    const codes = Object.values(ErrorCode)
    const unique = new Set(codes)

    // Act & Assert
    expect(unique.size).toBe(codes.length)
  })

  it('错误码命名使用 UPPER_SNAKE_CASE 格式', () => {
    // Arrange
    const codes = Object.values(ErrorCode) as string[]

    // Act & Assert
    for (const code of codes) {
      expect(code).toMatch(/^[A-Z][A-Z_]+[A-Z]$/)
    }
  })

  it('包含所有 api-conventions.md 定义的错误码', () => {
    // Arrange
    const expectedCodes = [
      'VALIDATION_ERROR',
      'AUTH_REQUIRED',
      'AUTH_INVALID_CREDENTIALS',
      'AUTH_TOKEN_EXPIRED',
      'AUTH_TOKEN_INVALID',
      'AUTH_MUST_CHANGE_PASSWORD',
      'FORBIDDEN',
      'NOT_FOUND',
      'CONFLICT',
      'RATE_LIMIT_EXCEEDED',
      'INTERNAL_ERROR',
      'DB_UNAVAILABLE',
      'REDIS_UNAVAILABLE',
    ]

    // Act & Assert
    for (const ec of expectedCodes) {
      expect(ErrorCode[ec as keyof typeof ErrorCode]).toBeDefined()
    }
  })

  it('所有错误码均有 string 值（非数字）', () => {
    // Arrange
    const codes = Object.values(ErrorCode)

    // Act & Assert
    for (const code of codes) {
      expect(typeof code).toBe('string')
    }
  })

  it('包含插件相关错误码', () => {
    // Arrange
    const pluginCodes = [
      'PLUGIN_MIGRATION_FAILED',
      'PLUGIN_NOT_FOUND',
      'PLUGIN_DEPENDENCY_MISSING',
      'PLUGIN_ALREADY_INSTALLED',
      'PLUGIN_CIRCULAR_DEPENDENCY',
      'PLUGIN_LIFECYCLE_ERROR',
      'PLUGIN_MANIFEST_INVALID',
    ]

    // Act & Assert
    for (const ec of pluginCodes) {
      expect(ErrorCode[ec as keyof typeof ErrorCode]).toBeDefined()
    }
  })

  it('包含 RBAC 相关错误码', () => {
    // Arrange
    const rbacCodes = [
      'RBAC_ROLE_NOT_FOUND',
      'RBAC_PERMISSION_DENIED',
      'RBAC_CANNOT_DELETE_SYSTEM_ROLE',
    ]

    // Act & Assert
    for (const ec of rbacCodes) {
      expect(ErrorCode[ec as keyof typeof ErrorCode]).toBeDefined()
    }
  })
})

describe('UserError', () => {
  it('构造中包含 code + message + details', () => {
    // Arrange & Act
    const err = new UserError(
      ErrorCode.VALIDATION_ERROR,
      '用户名必填',
      { field: 'username' },
    )

    // Assert
    expect(err.code).toBe(ErrorCode.VALIDATION_ERROR)
    expect(err.message).toBe('用户名必填')
    expect(err.details).toEqual({ field: 'username' })
  })

  it('details 可选', () => {
    // Arrange & Act
    const err = new UserError(ErrorCode.NOT_FOUND, '资源不存在')

    // Assert
    expect(err.details).toBeUndefined()
  })

  it('继承自 Error', () => {
    // Arrange & Act
    const err = new UserError(ErrorCode.FORBIDDEN, '无权限')

    // Assert
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(UserError)
  })

  it('toJSON 返回序列化格式', () => {
    // Arrange & Act
    const err = new UserError(ErrorCode.VALIDATION_ERROR, 'msg', { k: 'v' })
    const json = err.toJSON()

    // Assert
    expect(json).toEqual({
      code: ErrorCode.VALIDATION_ERROR,
      message: 'msg',
      details: { k: 'v' },
    })
  })

  it('name 属性为 UserError', () => {
    // Arrange & Act
    const err = new UserError(ErrorCode.CONFLICT, '冲突')

    // Assert
    expect(err.name).toBe('UserError')
  })
})

describe('SystemError', () => {
  it('构造中包含 code + message + 原始错误', () => {
    // Arrange & Act
    const cause = new Error('db timeout')
    const err = new SystemError(ErrorCode.DB_UNAVAILABLE, '数据库连接超时', cause)

    // Assert
    expect(err.code).toBe(ErrorCode.DB_UNAVAILABLE)
    expect(err.message).toBe('数据库连接超时')
    expect(err.cause).toBe(cause)
  })

  it('继承自 Error', () => {
    // Arrange & Act
    const err = new SystemError(ErrorCode.INTERNAL_ERROR, '内部错误')

    // Assert
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(SystemError)
  })

  it('toJSON 不暴露 cause 详情', () => {
    // Arrange & Act
    const cause = new Error('sensitive')
    const err = new SystemError(ErrorCode.DB_UNAVAILABLE, '数据库不可用', cause)
    const json = err.toJSON()

    // Assert
    expect(json).toEqual({
      code: ErrorCode.DB_UNAVAILABLE,
      message: '数据库不可用',
    })
    expect(json).not.toHaveProperty('cause')
  })

  it('name 属性为 SystemError', () => {
    // Arrange & Act
    const err = new SystemError(ErrorCode.REDIS_UNAVAILABLE, 'Redis 不可用')

    // Assert
    expect(err.name).toBe('SystemError')
  })
})

describe('AssertionError', () => {
  it('继承自 Error', () => {
    // Arrange & Act
    const err = new AssertionError('断言失败')

    // Assert
    expect(err).toBeInstanceOf(Error)
    expect(err).toBeInstanceOf(AssertionError)
  })

  it('name 属性为 AssertionError', () => {
    // Arrange & Act
    const err = new AssertionError('断言失败')

    // Assert
    expect(err.name).toBe('AssertionError')
  })
})
