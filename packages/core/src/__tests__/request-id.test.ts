// RED PHASE: imports will resolve once implementation is created
import { describe, it, expect, vi } from 'vitest'
import { createRequestIdMiddleware } from '../index.js'

describe('RequestIdMiddleware', () => {
  it('should reuse client-provided X-Request-ID', async () => {
    // Arrange
    const mockRequest = {
      headers: { 'x-request-id': 'client-req-123' },
    }
    const mockReply = {
      header: vi.fn(),
    }

    // Act
    const middleware = createRequestIdMiddleware()
    await middleware(mockRequest as never, mockReply as never)

    // Assert
    expect(mockRequest.requestId).toBe('client-req-123')
    expect(mockReply.header).toHaveBeenCalledWith('X-Request-ID', 'client-req-123')
  })

  it('should auto-generate a UUID when client does not provide X-Request-ID', async () => {
    // Arrange
    const mockRequest = { headers: {} }
    const mockReply = { header: vi.fn() }

    // Act
    const middleware = createRequestIdMiddleware()
    await middleware(mockRequest as never, mockReply as never)

    // Assert
    expect(mockRequest.requestId).toBeDefined()
    expect(mockRequest.requestId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    )
    expect(mockReply.header).toHaveBeenCalled()
  })

  it('should inject X-Request-ID into logger child context', async () => {
    // Arrange
    const childLogger = { info: vi.fn() }
    const mockRequest = {
      headers: { 'x-request-id': 'req-456' },
      log: { child: vi.fn().mockReturnValue(childLogger) },
    }

    // Act
    const middleware = createRequestIdMiddleware()
    await middleware(mockRequest as never, {} as never)

    // Assert
    expect(mockRequest.log.child).toHaveBeenCalledWith({ requestId: 'req-456' })
  })
})
