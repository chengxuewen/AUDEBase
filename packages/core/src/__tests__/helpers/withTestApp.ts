import { createTestApp, type TestApp } from './createTestApp'

export async function withTestApp(
  fn: (app: TestApp) => Promise<void>,
): Promise<void> {
  const app = await createTestApp()
  try {
    await fn(app)
  } finally {
    // Cleanup will be implemented when createTestApp is real
  }
}
