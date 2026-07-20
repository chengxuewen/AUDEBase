import { randomUUID } from 'node:crypto'

interface FastifyRequestLike {
  headers: Record<string, string | string[] | undefined>
  requestId?: string
  log?: { child: (bindings: Record<string, unknown>) => unknown }
}

interface FastifyReplyLike {
  header?: (name: string, value: string) => void
}

export function createRequestIdMiddleware(): (
  request: FastifyRequestLike,
  reply: FastifyReplyLike,
) => Promise<void> {
  return async (request: FastifyRequestLike, reply: FastifyReplyLike): Promise<void> => {
    const headerValue = request.headers['x-request-id']
    const id =
      typeof headerValue === 'string' && headerValue.length > 0
        ? headerValue
        : randomUUID()

    request.requestId = id
    if (reply.header) {
      reply.header('X-Request-ID', id)
    }

    if (request.log && typeof request.log.child === 'function') {
      request.log.child({ requestId: id })
    }
  }
}
