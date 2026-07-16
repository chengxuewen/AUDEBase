// RED PHASE: imports will resolve once implementation is created
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { aclMiddleware, requireAuth } from '../index'

const mockAuthService = {
  verifyAccessToken: vi.fn(),
}

const mockRbacService = {
  can: vi.fn(),
}

describe('aclMiddleware', () => {
  let mockRequest: Record<string, unknown>
  let mockReply: Record<string, unknown>

  beforeEach(() => {
    vi.clearAllMocks()
    mockReply = {
      code: vi.fn().mockReturnThis(),
      send: vi.fn(),
    }
  })

  it('无 Authorization 头返回 401', async () => {
    // Arrange
    mockRequest = {
      headers: {},
      routeConfig: { acl: { action: 'read', resource: 'user' } },
    }

    // Act
    await aclMiddleware(mockRequest, mockReply, mockAuthService as never, mockRbacService as never)

    // Assert
    expect(mockReply.code).toHaveBeenCalledWith(401)
    expect(mockReply.send).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'AUTH_REQUIRED' }) }),
    )
  })

  it('无效 token 返回 401', async () => {
    // Arrange
    mockRequest = {
      headers: { authorization: 'Bearer invalid-token' },
      routeConfig: { acl: { action: 'read', resource: 'user' } },
    }
    mockAuthService.verifyAccessToken.mockRejectedValue({ code: 'AUTH_TOKEN_INVALID' })

    // Act
    await aclMiddleware(mockRequest, mockReply, mockAuthService as never, mockRbacService as never)

    // Assert
    expect(mockReply.code).toHaveBeenCalledWith(401)
  })

  it('过期 token 返回 401', async () => {
    // Arrange
    mockRequest = {
      headers: { authorization: 'Bearer expired-token' },
      routeConfig: { acl: { action: 'read', resource: 'user' } },
    }
    mockAuthService.verifyAccessToken.mockRejectedValue({ code: 'AUTH_TOKEN_EXPIRED' })

    // Act
    await aclMiddleware(mockRequest, mockReply, mockAuthService as never, mockRbacService as never)

    // Assert
    expect(mockReply.code).toHaveBeenCalledWith(401)
    expect(mockReply.send).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'AUTH_TOKEN_EXPIRED' }) }),
    )
  })

  it('有 token 但无权限返回 403', async () => {
    // Arrange
    mockRequest = {
      headers: { authorization: 'Bearer valid-member-token' },
      routeConfig: { acl: { action: 'delete', resource: 'user' } },
      user: { id: 'user-uuid-member' },
    }
    mockAuthService.verifyAccessToken.mockResolvedValue({
      sub: 'user-uuid-member',
      tenant_id: null,
      username: 'member',
    })
    mockRbacService.can.mockResolvedValue(false)

    // Act
    await aclMiddleware(mockRequest, mockReply, mockAuthService as never, mockRbacService as never)

    // Assert
    expect(mockReply.code).toHaveBeenCalledWith(403)
    expect(mockReply.send).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'FORBIDDEN' }) }),
    )
  })

  it('有效 token + 有权限 -> next() 被调用', async () => {
    // Arrange
    const next = vi.fn()
    mockRequest = {
      headers: { authorization: 'Bearer valid-admin-token' },
      routeConfig: { acl: { action: 'manage', resource: 'plugin' } },
      user: { id: 'user-uuid-admin' },
    }
    mockAuthService.verifyAccessToken.mockResolvedValue({
      sub: 'user-uuid-admin',
      tenant_id: null,
      username: 'admin',
    })
    mockRbacService.can.mockResolvedValue(true)

    // Act
    await aclMiddleware(mockRequest, mockReply, mockAuthService as never, mockRbacService as never, next)

    // Assert - should call next() not reply.code()
    expect(next).toHaveBeenCalled()
    expect(mockReply.code).not.toHaveBeenCalled()
  })
})

describe('requireAuth', () => {
  let mockReply: Record<string, unknown>

  beforeEach(() => {
    vi.clearAllMocks()
    mockReply = {
      code: vi.fn().mockReturnThis(),
      send: vi.fn(),
    }
  })

  it('无 Authorization 头返回 401 AUTH_REQUIRED', async () => {
    // Arrange
    const mockRequest = { headers: {} }

    // Act
    await requireAuth(mockRequest, mockReply, mockAuthService as never)

    // Assert
    expect(mockReply.code).toHaveBeenCalledWith(401)
  })

  it('Authorization 格式错误（无 Bearer 前缀）返回 401', async () => {
    // Arrange
    const mockRequest = { headers: { authorization: 'Basic sometoken' } }

    // Act
    await requireAuth(mockRequest, mockReply, mockAuthService as never)

    // Assert
    expect(mockReply.code).toHaveBeenCalledWith(401)
  })

  it('有效 token 注入 req.user', async () => {
    // Arrange
    const mockRequest = {
      headers: { authorization: 'Bearer valid-token' },
    }
    mockAuthService.verifyAccessToken.mockResolvedValue({
      sub: 'user-uuid-1',
      tenant_id: null,
      username: 'admin',
      roles: ['admin'],
    })

    // Act
    await requireAuth(mockRequest, mockReply, mockAuthService as never)

    // Assert
    expect(mockRequest.user).toBeDefined()
    expect((mockRequest.user as { sub: string }).sub).toBe('user-uuid-1')
  })
})
