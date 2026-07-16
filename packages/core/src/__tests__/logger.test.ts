// RED PHASE: imports will resolve once implementation is created
import { describe, it, expect, beforeEach } from 'vitest'
import { Writable } from 'node:stream'
import { createLogger, type Logger } from '../index'

function createCaptureStream(): { output: string[]; stream: Writable } {
  const output: string[] = []
  const stream = new Writable({
    write(chunk: Buffer, _encoding: string, callback: () => void): void {
      output.push(chunk.toString().trim())
      callback()
    },
  })
  return { output, stream }
}

describe('Logger', () => {
  let logger: Logger
  let capture: { output: string[]; stream: Writable }

  beforeEach(() => {
    capture = createCaptureStream()
    logger = createLogger({ level: 'debug', stream: capture.stream })
  })

  it('should output JSON format at info level with context fields', () => {
    // Arrange & Act
    logger.info({ userId: 'u1' }, '用户登录')

    // Assert
    const parsed = JSON.parse(capture.output[0])
    expect(parsed.level).toBe(30) // pino info level = 30
    expect(parsed.msg).toBe('用户登录')
    expect(parsed.userId).toBe('u1')
  })

  it('should output error level with error information', () => {
    // Arrange & Act
    logger.error({ err: new Error('timeout') }, '数据库连接失败')

    // Assert
    const parsed = JSON.parse(capture.output[0])
    expect(parsed.level).toBe(50) // pino error level = 50
    expect(parsed.msg).toBe('数据库连接失败')
    expect(parsed.err).toBeDefined()
  })

  it('should output warn level with context', () => {
    // Arrange & Act
    logger.warn({ currentRate: 95 }, '速率限制接近阈值')

    // Assert
    const parsed = JSON.parse(capture.output[0])
    expect(parsed.level).toBe(40) // pino warn level = 40
    expect(parsed.currentRate).toBe(95)
  })

  it('should output debug level when debug mode is enabled', () => {
    // Arrange & Act
    logger.debug({ query: 'SELECT *' }, '详细调试信息')

    // Assert
    const parsed = JSON.parse(capture.output[0])
    expect(parsed.level).toBe(20) // pino debug level = 20
  })

  it('should not output debug messages when level is info', () => {
    // Arrange
    const infoLogger = createLogger({ level: 'info', stream: capture.stream })

    // Act
    infoLogger.debug({}, 'should not appear')

    // Assert
    expect(capture.output).toHaveLength(0)
  })

  it('should only output error messages when level is error', () => {
    // Arrange
    const errorLogger = createLogger({ level: 'error', stream: capture.stream })

    // Act
    errorLogger.info({}, 'should not appear')
    errorLogger.warn({}, 'should not appear')
    errorLogger.error({}, 'should appear')

    // Assert
    expect(capture.output).toHaveLength(1)
  })

  it('should create child logger that inherits context bindings', () => {
    // Arrange & Act
    const child = logger.child({ plugin: 'rbac', tenantId: 't-uuid' })
    child.info({}, '权限检查')

    // Assert
    const parsed = JSON.parse(capture.output[0])
    expect(parsed.plugin).toBe('rbac')
    expect(parsed.tenantId).toBe('t-uuid')
  })

  it('should include a valid ISO 8601 timestamp on every log entry', () => {
    // Arrange & Act
    logger.info({}, 'test')

    // Assert
    const parsed = JSON.parse(capture.output[0])
    expect(parsed.time).toBeDefined()
    expect(new Date(parsed.time).getTime()).not.toBeNaN()
  })
})
