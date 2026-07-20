/**
 * @audebase/logging-infra - Edge case and redaction tests (AAA pattern)
 */

import { describe, test, expect } from 'vitest'
import { Writable } from 'node:stream'
import { createLogger, DEFAULT_REDACT_PATHS } from '../index.js'

function createCaptureStream(): { stream: Writable; lines: () => unknown[] } {
  const captured: unknown[] = []
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      const text = chunk.toString().trim()
      if (text.length > 0) {
        for (const line of text.split('\n')) {
          try {
            captured.push(JSON.parse(line))
          } catch {
            captured.push(line)
          }
        }
      }
      callback()
    },
  })
  return { stream, lines: () => captured }
}

describe('DEFAULT_REDACT_PATHS', () => {
  test('should contain standard sensitive paths', () => {
    // Arrange & Act & Assert
    expect(DEFAULT_REDACT_PATHS).toContain('req.headers.authorization')
    expect(DEFAULT_REDACT_PATHS).toContain('req.body.password')
    expect(DEFAULT_REDACT_PATHS).toContain('req.body.secret')
    expect(DEFAULT_REDACT_PATHS).toContain('req.body.token')
    expect(DEFAULT_REDACT_PATHS).toContain('req.headers.cookie')
  })

  test('should be an array of strings', () => {
    // Arrange & Act & Assert
    expect(Array.isArray(DEFAULT_REDACT_PATHS)).toBe(true)
    expect(DEFAULT_REDACT_PATHS.every((p) => typeof p === 'string')).toBe(true)
  })
})

describe('createLogger — redaction edge cases', () => {
  test('should redact nested secrets in deep objects', () => {
    // Arrange
    const { stream, lines } = createCaptureStream()
    const logger = createLogger({
      level: 'info',
      redact: ['nested.secret'],
      stream,
    })

    // Act
    logger.info({
      nested: { secret: 'hidden', public: 'visible' },
    }, 'deep redaction')

    // Assert
    const log = lines().find(
      (l: unknown) => (l as Record<string, unknown>)?.msg === 'deep redaction',
    ) as Record<string, unknown> | undefined
    expect(log).toBeDefined()
    expect(log?.nested).toBeDefined()
    expect((log?.nested as Record<string, unknown>)?.secret).toBe('[REDACTED]')
    expect((log?.nested as Record<string, unknown>)?.public).toBe('visible')
  })

  test('should not redact when redact array is empty', () => {
    // Arrange
    const { stream, lines } = createCaptureStream()
    const logger = createLogger({
      level: 'info',
      redact: [],
      stream,
    })

    // Act
    logger.info({ password: '123456', name: 'visible' }, 'no redaction')

    // Assert
    const log = lines().find(
      (l: unknown) => (l as Record<string, unknown>)?.msg === 'no redaction',
    ) as Record<string, unknown> | undefined
    expect(log).toBeDefined()
    expect(log?.password).toBe('123456')
  })

  test('should log normally when redact is undefined', () => {
    // Arrange
    const { stream, lines } = createCaptureStream()
    const logger = createLogger({ level: 'info', stream })

    // Act
    logger.info({ data: 'sensitive' }, 'no redact config')

    // Assert
    const log = lines().find(
      (l: unknown) => (l as Record<string, unknown>)?.msg === 'no redact config',
    ) as Record<string, unknown> | undefined
    expect(log).toBeDefined()
    expect(log?.data).toBe('sensitive')
  })
})

describe('createLogger — custom name', () => {
  test('should include custom name in log output', () => {
    // Arrange
    const { stream, lines } = createCaptureStream()
    const logger = createLogger({ level: 'info', name: 'my-app', stream })

    // Act
    logger.info('named logger')

    // Assert
    const log = lines().find(
      (l: unknown) => (l as Record<string, unknown>)?.msg === 'named logger',
    ) as Record<string, unknown> | undefined
    expect(log).toBeDefined()
    expect(log?.name).toBe('my-app')
  })
})

describe('createLogger — child logger with redaction', () => {
  test('should inherit redaction from parent child logger', () => {
    // Arrange
    const { stream, lines } = createCaptureStream()
    const logger = createLogger({
      level: 'info',
      redact: ['apiKey'],
      stream,
    })

    // Act
    const child = logger.child({ plugin: 'test' })
    child.info({ apiKey: 'sk-secret', user: 'john' }, 'child redaction')

    // Assert
    const log = lines().find(
      (l: unknown) => (l as Record<string, unknown>)?.msg === 'child redaction',
    ) as Record<string, unknown> | undefined
    expect(log).toBeDefined()
    expect(log?.apiKey).toBe('[REDACTED]')
    expect(log?.user).toBe('john')
    expect(log?.plugin).toBe('test')
  })
})

describe('createLogger — all levels', () => {
  test('should support all 6 log levels', () => {
    // Arrange
    const { stream, lines } = createCaptureStream()
    const logger = createLogger({ level: 'trace', stream })

    // Act
    logger.trace({ l: 'trace' }, 'trace msg')
    logger.debug({ l: 'debug' }, 'debug msg')
    logger.info({ l: 'info' }, 'info msg')
    logger.warn({ l: 'warn' }, 'warn msg')
    logger.error({ l: 'error' }, 'error msg')
    logger.fatal({ l: 'fatal' }, 'fatal msg')

    // Assert
    const all = lines()
    const levels = all.map((l: unknown) => (l as Record<string, unknown>)?.level)
    expect(levels).toContain(10)  // trace
    expect(levels).toContain(20)  // debug
    expect(levels).toContain(30)  // info
    expect(levels).toContain(40)  // warn
    expect(levels).toContain(50)  // error
    expect(levels).toContain(60)  // fatal
  })
})
