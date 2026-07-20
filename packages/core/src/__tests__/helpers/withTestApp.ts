import { createTestApp } from './createTestApp.js'
import type { FastifyInstance } from 'fastify'

export async function withTestApp(
  fn: (app: FastifyInstance) => Promise<void>,
): Promise<void> {
  const testApp = await createTestApp()
  try {
    await fn(testApp.app)
  } finally {
    await testApp.cleanup()
  }
}
