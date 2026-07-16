// RED PHASE: imports will resolve once implementation is created
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { RBACService } from '../index'

const mockDb = {
  query: {
    role_permissions: {
      findMany: vi.fn(),
    },
    user_roles: {
      findMany: vi.fn(),
    },
    roles: {
      findFirst: vi.fn(),
    },
  },
  insert: vi.fn(),
  delete: vi.fn(),
}

describe('RBACService.can', () => {
  let rbacService: RBACService

  beforeEach(() => {
    vi.clearAllMocks()
    rbacService = new RBACService(mockDb as never)
  })

  it('admin 角色拥有所有权限', async () => {
    // Arrange
    mockDb.query.role_permissions.findMany.mockResolvedValue([
      { permission: { action: 'manage', resource: '*' } },
    ])

    // Act
    const result = await rbacService.can('user-uuid-1', 'manage', 'plugin')

    // Assert
    expect(result).toBe(true)
  })

  it('member 角色仅拥有 read 权限', async () => {
    // Arrange
    mockDb.query.role_permissions.findMany.mockResolvedValue([
      { permission: { action: 'read', resource: 'user' } },
    ])

    // Act
    const result = await rbacService.can('user-uuid-2', 'create', 'user')

    // Assert
    expect(result).toBe(false)
  })

  it('多角色权限取并集', async () => {
    // Arrange
    mockDb.query.role_permissions.findMany.mockResolvedValue([
      { permission: { action: 'read', resource: 'audit_log' } },
      { permission: { action: 'read', resource: 'user' } },
    ])

    // Act
    const canReadUser = await rbacService.can('user-uuid-3', 'read', 'user')
    const canReadAudit = await rbacService.can('user-uuid-3', 'read', 'audit_log')
    const canDelete = await rbacService.can('user-uuid-3', 'delete', 'user')

    // Assert
    expect(canReadUser).toBe(true)
    expect(canReadAudit).toBe(true)
    expect(canDelete).toBe(false)
  })

  it('无角色的用户无任何权限', async () => {
    // Arrange
    mockDb.query.role_permissions.findMany.mockResolvedValue([])

    // Act
    const result = await rbacService.can('user-uuid-4', 'read', 'user')

    // Assert
    expect(result).toBe(false)
  })

  it('manage 权限包含所有 CRUD 权限', async () => {
    // Arrange
    mockDb.query.role_permissions.findMany.mockResolvedValue([
      { permission: { action: 'manage', resource: 'user' } },
    ])

    // Act
    const canCreate = await rbacService.can('user-uuid-5', 'create', 'user')
    const canRead = await rbacService.can('user-uuid-5', 'read', 'user')
    const canUpdate = await rbacService.can('user-uuid-5', 'update', 'user')
    const canDelete = await rbacService.can('user-uuid-5', 'delete', 'user')

    // Assert
    expect(canCreate).toBe(true)
    expect(canRead).toBe(true)
    expect(canUpdate).toBe(true)
    expect(canDelete).toBe(true)
  })
})

describe('RBACService.assignRole', () => {
  let rbacService: RBACService

  beforeEach(() => {
    vi.clearAllMocks()
    rbacService = new RBACService(mockDb as never)
  })

  it('为用户分配角色', async () => {
    // Arrange
    mockDb.query.roles.findFirst.mockResolvedValue({
      id: 'role-uuid-1',
      name: 'editor',
      is_system: false,
      tenant_id: null,
    })

    // Act
    await rbacService.assignRole('user-uuid-1', 'role-uuid-1')

    // Assert
    expect(mockDb.insert).toHaveBeenCalled()
  })

  it('重复分配同一角色幂等', async () => {
    // Arrange
    mockDb.query.roles.findFirst.mockResolvedValue({
      id: 'role-uuid-1',
      name: 'editor',
      is_system: false,
    })

    // Act - assign twice
    await rbacService.assignRole('user-uuid-1', 'role-uuid-1')
    await rbacService.assignRole('user-uuid-1', 'role-uuid-1')

    // Assert - should not throw, insert may be called twice but idempotent
    expect(mockDb.insert).toHaveBeenCalled()
  })

  it('写入 rbac:assign_role 审计日志', async () => {
    // Arrange
    mockDb.query.roles.findFirst.mockResolvedValue({
      id: 'role-uuid-1',
      name: 'editor',
      is_system: false,
    })
    const auditSpy = vi.fn()
    rbacService.setAuditLogger(auditSpy)

    // Act
    await rbacService.assignRole('user-uuid-1', 'role-uuid-1')

    // Assert
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({
      action: 'rbac:assign_role',
      resource_type: 'user',
      resource_id: 'user-uuid-1',
    }))
  })
})

describe('RBACService.revokeRole', () => {
  let rbacService: RBACService

  beforeEach(() => {
    vi.clearAllMocks()
    rbacService = new RBACService(mockDb as never)
  })

  it('撤销用户角色', async () => {
    // Arrange
    mockDb.query.roles.findFirst.mockResolvedValue({
      id: 'role-uuid-1',
      name: 'editor',
      is_system: false,
    })
    mockDb.query.user_roles.findMany.mockResolvedValue([
      { role_id: 'role-uuid-1' },
      { role_id: 'role-uuid-2' }, // user has another role, so revoking is OK
    ])

    // Act
    await rbacService.revokeRole('user-uuid-1', 'role-uuid-1')

    // Assert
    expect(mockDb.delete).toHaveBeenCalled()
  })

  it('撤销不存在角色不报错', async () => {
    // Arrange
    mockDb.query.roles.findFirst.mockResolvedValue(undefined)

    // Act & Assert - should not throw
    await rbacService.revokeRole('user-uuid-1', 'nonexistent-role')
  })

  it('is_system 角色不可撤销（admin/member）', async () => {
    // Arrange
    mockDb.query.roles.findFirst.mockResolvedValue({
      id: 'role-uuid-admin',
      name: 'admin',
      is_system: true,
    })

    // Act & Assert
    await expect(
      rbacService.revokeRole('user-uuid-1', 'role-uuid-admin'),
    ).rejects.toMatchObject({ code: 'RBAC_CANNOT_DELETE_SYSTEM_ROLE' })
  })

  it('不能撤销用户的最后一个角色', async () => {
    // Arrange
    mockDb.query.roles.findFirst.mockResolvedValue({
      id: 'role-uuid-1',
      name: 'editor',
      is_system: false,
    })
    mockDb.query.user_roles.findMany.mockResolvedValue([
      { role_id: 'role-uuid-1' }, // only one role
    ])

    // Act & Assert
    await expect(
      rbacService.revokeRole('user-uuid-1', 'role-uuid-1'),
    ).rejects.toThrow(/至少保留一个角色/i)
  })
})
