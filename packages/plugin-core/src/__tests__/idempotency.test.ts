// RED PHASE: imports will resolve once implementation is created
import { describe, it, expect, vi } from 'vitest'
import { isBootstrapComplete } from '../bootstrap-check.js'

describe('Bootstrap 幂等性', () => {
  it('数据库中已有 admin 时应跳过创建', async () => {
    // Arrange - mock DB 返回已有 admin
    const mockDb = {
      query: {
        users: {
          findFirst: vi.fn().mockResolvedValue({ id: 'existing-admin', username: 'admin' }),
        },
      },
    }

    // Act
    const complete = await isBootstrapComplete(mockDb as never)

    // Assert
    expect(complete).toBe(true)
  })

  it('数据库中无 admin 时应返回未完成', async () => {
    // Arrange - mock DB 返回 null
    const mockDb = {
      query: {
        users: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      },
    }

    // Act
    const complete = await isBootstrapComplete(mockDb as never)

    // Assert
    expect(complete).toBe(false)
  })

  it('模块注册表中已有 plugin-core 记录时应跳过', async () => {
    // Arrange
    const mockDb = {
      query: {
        users: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
        modules: {
          findFirst: vi.fn().mockResolvedValue({
            name: '@audebase/plugin-core',
            state: 'enabled',
          }),
        },
      },
    }

    // Act
    const complete = await isBootstrapComplete(mockDb as never)

    // Assert
    expect(complete).toBe(true)
  })
})
