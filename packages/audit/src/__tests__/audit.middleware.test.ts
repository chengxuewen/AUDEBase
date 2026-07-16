// RED PHASE: imports will resolve once implementation is created
import { describe, it, expect, vi } from 'vitest'
import { createAuditMiddleware } from '../index.js'

describe('AuditMiddleware', () => {
  it('should not record audit for GET requests', async () => {
    // Arrange
    const mockRequest = {
      method: 'GET',
      url: '/api/users',
      headers: {},
    }
    const mockReply = { statusCode: 200 }
    const auditSpy = vi.fn()

    // Act
    const middleware = createAuditMiddleware({ auditService: { log: auditSpy } })
    await middleware(mockRequest as never, mockReply as never)

    // Assert
    expect(auditSpy).not.toHaveBeenCalled()
  })

  it('should automatically record audit on POST request', async () => {
    // Arrange
    const mockRequest = {
      method: 'POST',
      url: '/api/users',
      body: { username: 'newuser' },
      user: { id: 'u-uuid', tenant_id: 't-uuid' },
      headers: { 'user-agent': 'test-agent', 'x-request-id': 'req-1' },
      ip: '192.168.1.1',
    }
    const mockReply = { statusCode: 201 }
    const auditSpy = vi.fn()

    // Act
    const middleware = createAuditMiddleware({ auditService: { log: auditSpy } })
    await middleware(mockRequest as never, mockReply as never)

    // Assert
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'create',
        actor_id: 'u-uuid',
        tenant_id: 't-uuid',
      }),
    )
  })

  it('should automatically record audit on PUT request', async () => {
    // Arrange
    const mockRequest = {
      method: 'PUT',
      url: '/api/users/uuid-1',
      body: { username: 'updated' },
      user: { id: 'u-uuid', tenant_id: 't-uuid' },
      headers: {},
      ip: '10.0.0.1',
    }
    const mockReply = { statusCode: 200 }
    const auditSpy = vi.fn()

    // Act
    const middleware = createAuditMiddleware({ auditService: { log: auditSpy } })
    await middleware(mockRequest as never, mockReply as never)

    // Assert
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'update' }),
    )
  })

  it('should automatically record audit on DELETE request', async () => {
    // Arrange
    const mockRequest = {
      method: 'DELETE',
      url: '/api/users/uuid-1',
      body: undefined,
      user: { id: 'u-uuid', tenant_id: 't-uuid' },
      headers: {},
      ip: '10.0.0.1',
    }
    const mockReply = { statusCode: 200 }
    const auditSpy = vi.fn()

    // Act
    const middleware = createAuditMiddleware({ auditService: { log: auditSpy } })
    await middleware(mockRequest as never, mockReply as never)

    // Assert
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'delete' }),
    )
  })

  it('should not throw when audit write fails (non-blocking)', async () => {
    // Arrange
    const mockRequest = {
      method: 'POST',
      url: '/api/users',
      body: { username: 'newuser' },
      user: { id: 'u-uuid' },
      headers: {},
      ip: '127.0.0.1',
    }
    const mockReply = { statusCode: 201 }
    const failingAudit = vi.fn().mockRejectedValue(new Error('DB timeout'))

    // Act & Assert - should not throw
    const middleware = createAuditMiddleware({ auditService: { log: failingAudit } })
    await expect(
      middleware(mockRequest as never, mockReply as never),
    ).resolves.not.toThrow()
  })

  it('should set actor_id to null for unauthenticated requests', async () => {
    // Arrange
    const mockRequest = {
      method: 'POST',
      url: '/api/auth/login',
      body: { username: 'admin', password: 'xxx' },
      user: undefined,
      headers: { 'x-request-id': 'req-noauth' },
      ip: '127.0.0.1',
    }
    const mockReply = { statusCode: 200 }
    const auditSpy = vi.fn()

    // Act
    const middleware = createAuditMiddleware({ auditService: { log: auditSpy } })
    await middleware(mockRequest as never, mockReply as never)

    // Assert
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({ actor_id: null }),
    )
  })

  it('should redact sensitive fields from new_values', async () => {
    // Arrange
    const mockRequest = {
      method: 'POST',
      url: '/api/users',
      body: { username: 'newuser', password: 'SecretPass1!' },
      user: { id: 'u-uuid', tenant_id: 't-uuid' },
      headers: {},
      ip: '127.0.0.1',
    }
    const mockReply = { statusCode: 201 }
    const auditSpy = vi.fn()

    // Act
    const middleware = createAuditMiddleware({
      auditService: { log: auditSpy },
      sensitiveFields: ['password', 'password_hash', 'token'],
    })
    await middleware(mockRequest as never, mockReply as never)

    // Assert
    const recordedEntry = auditSpy.mock.calls[0][0]
    expect(recordedEntry.new_values.password).toBe('[REDACTED]')
    expect(recordedEntry.new_values.username).toBe('newuser')
  })
})
