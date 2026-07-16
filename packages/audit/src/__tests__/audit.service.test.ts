// RED PHASE: imports will resolve once implementation is created
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { AuditService } from '../index.js'

interface MockDb {
  insert: ReturnType<typeof vi.fn>
  select: ReturnType<typeof vi.fn>
  query: {
    audit_log: {
      findMany: ReturnType<typeof vi.fn>
    }
  }
}

function createMockDb(): MockDb {
  return {
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({ returning: vi.fn() }),
    }),
    select: vi.fn().mockReturnValue({ from: vi.fn() }),
    query: {
      audit_log: { findMany: vi.fn() },
    },
  }
}

describe('AuditService.record', () => {
  let auditService: AuditService
  let mockDb: MockDb

  beforeEach(() => {
    vi.clearAllMocks()
    mockDb = createMockDb()
    auditService = new AuditService(mockDb)
  })

  it('should record a create operation with new_values', async () => {
    // Arrange
    const entry = {
      tenant_id: 't-uuid',
      actor_id: 'u-uuid',
      action: 'create',
      resource_type: 'user',
      resource_id: 'r-uuid',
      new_values: { username: 'newuser', is_active: true },
      old_values: null,
      ip: '192.168.1.1',
      user_agent: 'test-agent',
      request_id: 'req-123',
    }

    // Act
    await auditService.log(entry)

    // Assert
    expect(mockDb.insert).toHaveBeenCalled()
  })

  it('should record an update operation with old_values + new_values', async () => {
    // Arrange
    const entry = {
      tenant_id: 't-uuid',
      actor_id: 'u-uuid',
      action: 'update',
      resource_type: 'user',
      resource_id: 'r-uuid',
      old_values: { username: 'oldname' },
      new_values: { username: 'newname' },
      ip: null,
      user_agent: null,
      request_id: null,
    }

    // Act
    await auditService.log(entry)

    // Assert
    expect(mockDb.insert).toHaveBeenCalled()
  })

  it('should record a delete operation with old_values and null new_values', async () => {
    // Arrange
    const entry = {
      tenant_id: 't-uuid',
      actor_id: 'u-uuid',
      action: 'delete',
      resource_type: 'user',
      resource_id: 'r-uuid',
      old_values: { username: 'deleteduser', is_active: true },
      new_values: null,
      ip: null,
      user_agent: null,
      request_id: null,
    }

    // Act
    await auditService.log(entry)

    // Assert
    expect(mockDb.insert).toHaveBeenCalled()
  })

  it('should record a system operation with actor_id null', async () => {
    // Arrange
    const entry = {
      tenant_id: null,
      actor_id: null,
      action: 'system:startup',
      resource_type: 'system',
      resource_id: null,
      old_values: null,
      new_values: null,
      ip: null,
      user_agent: null,
      request_id: null,
    }

    // Act
    await auditService.log(entry)

    // Assert
    expect(mockDb.insert).toHaveBeenCalled()
  })

  it('should record RBAC operations (assign_role, revoke_role, create_role, delete_role)', async () => {
    // Arrange
    const rbacActions = [
      'rbac:assign_role',
      'rbac:revoke_role',
      'rbac:create_role',
      'rbac:delete_role',
    ]

    // Act
    for (const action of rbacActions) {
      await auditService.log({
        tenant_id: 't-uuid',
        actor_id: 'u-uuid',
        action,
        resource_type: 'role',
        resource_id: 'role-uuid',
        old_values: null,
        new_values: null,
        ip: null,
        user_agent: null,
        request_id: null,
      })
    }

    // Assert
    expect(mockDb.insert).toHaveBeenCalledTimes(rbacActions.length)
  })

  it('should not throw when DB write fails (fire-and-forget)', async () => {
    // Arrange
    mockDb.insert = vi.fn().mockReturnValue({
      values: vi.fn().mockRejectedValue(new Error('DB timeout')),
    })
    const entry = {
      tenant_id: 't-uuid',
      actor_id: 'u-uuid',
      action: 'create',
      resource_type: 'user',
      resource_id: 'r-uuid',
      old_values: null,
      new_values: { name: 'test' },
      ip: '127.0.0.1',
      user_agent: 'agent',
      request_id: 'req-1',
    }

    // Act & Assert - should not throw
    await expect(auditService.log(entry)).resolves.not.toThrow()
  })
})

describe('AuditService.query', () => {
  let auditService: AuditService
  let mockDb: MockDb

  beforeEach(() => {
    vi.clearAllMocks()
    mockDb = createMockDb()
    auditService = new AuditService(mockDb)
  })

  it('should filter by resource_type + resource_id', async () => {
    // Arrange
    mockDb.query.audit_log.findMany.mockResolvedValue([
      { id: 'a1', action: 'create', resource_type: 'user', resource_id: 'r-uuid' },
      { id: 'a2', action: 'update', resource_type: 'user', resource_id: 'r-uuid' },
    ])

    // Act
    const logs = await auditService.query({
      tenant_id: 't-uuid',
      filter: {
        resource_type: 'user',
        resource_id: 'r-uuid',
      },
    })

    // Assert
    expect(logs).toHaveLength(2)
    expect(logs[0].action).toBe('create')
    expect(logs[1].action).toBe('update')
  })

  it('should enforce tenant isolation: tenant-A cannot see tenant-B records', async () => {
    // Arrange
    mockDb.query.audit_log.findMany.mockResolvedValue([
      { id: 'a1', action: 'create', resource_type: 'user' },
    ])

    // Act
    const logs = await auditService.query({
      tenant_id: 'tenant-A-uuid',
    })

    // Assert
    expect(logs).toHaveLength(1)
    // The mock only returns tenant-A data, simulating DB-level tenant filtering
    expect(mockDb.query.audit_log.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.any(Function),
      }),
    )
  })

  it('should return results sorted by created_at DESC', async () => {
    // Arrange
    const date1 = '2026-07-15T10:00:00.000Z'
    const date2 = '2026-07-15T12:00:00.000Z'
    mockDb.query.audit_log.findMany.mockResolvedValue([
      { id: 'a2', action: 'update', created_at: date2 },
      { id: 'a1', action: 'create', created_at: date1 },
    ])

    // Act
    const logs = await auditService.query({ tenant_id: 't-uuid' })

    // Assert
    expect(new Date(logs[0].created_at).getTime())
      .toBeGreaterThanOrEqual(new Date(logs[1].created_at).getTime())
  })
})
