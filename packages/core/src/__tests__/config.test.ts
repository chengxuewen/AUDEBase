import { describe, it, expect } from 'vitest'
import { loadConfig, type AppConfig } from '../config.js'

function validEnv(): Record<string, string> {
  return {
    AUDE_JWT_SECRET: 'super-secret-key-that-is-at-least-32-chars!!',
    DATABASE_URL: 'postgres://localhost:5432/test',
    NODE_ENV: 'development',
  }
}

describe('loadConfig', () => {
  // --- success path ---

  it('parses valid env with all required fields', () => {
    // Arrange
    const env = validEnv()

    // Act
    const config = loadConfig(env)

    // Assert
    expect(config.NODE_ENV).toBe('development')
    expect(config.AUDE_JWT_SECRET).toBe('super-secret-key-that-is-at-least-32-chars!!')
    expect(config.DATABASE_URL).toBe('postgres://localhost:5432/test')
  })

  it('applies defaults for optional fields', () => {
    // Arrange
    const env = validEnv()

    // Act
    const config = loadConfig(env)

    // Assert
    expect(config.PORT).toBe(3000)
    expect(config.AUDE_LOG_LEVEL).toBe('info')
    expect(config.AUDE_SLOW_QUERY_THRESHOLD_MS).toBe(100)
    expect(config.AUDE_JWT_ACCESS_TTL).toBe(900)
    expect(config.AUDE_JWT_REFRESH_TTL).toBe(604800)
    expect(config.AUDE_BCRYPT_COST).toBe(12)
    expect(config.AUDE_DB_POOL_MAX).toBe(10)
  })

  it('overrides defaults with provided values', () => {
    // Arrange
    const env = {
      ...validEnv(),
      PORT: '8080',
      AUDE_LOG_LEVEL: 'debug',
      AUDE_SLOW_QUERY_THRESHOLD_MS: '200',
      AUDE_BCRYPT_COST: '14',
      AUDE_DB_POOL_MAX: '20',
    }

    // Act
    const config = loadConfig(env)

    // Assert
    expect(config.PORT).toBe(8080)
    expect(config.AUDE_LOG_LEVEL).toBe('debug')
    expect(config.AUDE_SLOW_QUERY_THRESHOLD_MS).toBe(200)
    expect(config.AUDE_BCRYPT_COST).toBe(14)
    expect(config.AUDE_DB_POOL_MAX).toBe(20)
  })

  it('parses optional REDIS_URL when provided', () => {
    // Arrange
    const env = { ...validEnv(), REDIS_URL: 'redis://localhost:6379' }

    // Act
    const config = loadConfig(env)

    // Assert
    expect(config.REDIS_URL).toBe('redis://localhost:6379')
  })

  it('REDIS_URL is undefined when omitted', () => {
    // Arrange
    const env = validEnv()

    // Act
    const config = loadConfig(env)

    // Assert
    expect(config.REDIS_URL).toBeUndefined()
  })

  it('parses AUDE_CORS_ORIGINS when provided', () => {
    // Arrange
    const env = { ...validEnv(), AUDE_CORS_ORIGINS: 'http://localhost:5173' }

    // Act
    const config = loadConfig(env)

    // Assert
    expect(config.AUDE_CORS_ORIGINS).toBe('http://localhost:5173')
  })

  it('AUDE_CORS_ORIGINS is undefined when omitted', () => {
    // Arrange
    const env = validEnv()

    // Act
    const config = loadConfig(env)

    // Assert
    expect(config.AUDE_CORS_ORIGINS).toBeUndefined()
  })

  // --- failure paths ---

  it('throws when AUDE_JWT_SECRET is missing', () => {
    // Arrange
    const env = { ...validEnv() }
    delete (env as Record<string, string | undefined>).AUDE_JWT_SECRET

    // Act & Assert
    expect(() => loadConfig(env)).toThrow('Configuration validation failed')
  })

  it('throws when AUDE_JWT_SECRET is shorter than 32 characters', () => {
    // Arrange
    const env = { ...validEnv(), AUDE_JWT_SECRET: 'short' }

    // Act & Assert
    expect(() => loadConfig(env)).toThrow('Configuration validation failed')
    expect(() => loadConfig(env)).toThrow('at least 32 characters')
  })

  it('throws when DATABASE_URL is missing', () => {
    // Arrange
    const env = { ...validEnv() }
    delete (env as Record<string, string | undefined>).DATABASE_URL

    // Act & Assert
    expect(() => loadConfig(env)).toThrow('Configuration validation failed')
  })

  it('throws when DATABASE_URL is not a postgres:// URL', () => {
    // Arrange
    const env = { ...validEnv(), DATABASE_URL: 'mysql://localhost:3306/db' }

    // Act & Assert
    expect(() => loadConfig(env)).toThrow('must be a postgres:// URL')
  })

  it('throws when DATABASE_URL is not a valid URL', () => {
    // Arrange
    const env = { ...validEnv(), DATABASE_URL: 'not-a-url' }

    // Act & Assert
    expect(() => loadConfig(env)).toThrow()
  })

  it('throws when PORT is out of range', () => {
    // Arrange
    const env = { ...validEnv(), PORT: '99999' }

    // Act & Assert
    expect(() => loadConfig(env)).toThrow()
  })

  it('throws when NODE_ENV is invalid', () => {
    // Arrange
    const env = { ...validEnv(), NODE_ENV: 'staging' }

    // Act & Assert
    expect(() => loadConfig(env)).toThrow()
  })

  it('lists all validation issues in error message', () => {
    // Arrange
    const env = { NODE_ENV: 'production' }

    // Act & Assert
    expect(() => loadConfig(env)).toThrow('Configuration validation failed')
  })

  it('AUDE_LOG_LEVEL defaults to info when omitted', () => {
    const env = validEnv()
    const config = loadConfig(env)
    expect(config.AUDE_LOG_LEVEL).toBe('info')
  })

  it('rejects invalid AUDE_LOG_LEVEL', () => {
    const env = { ...validEnv(), AUDE_LOG_LEVEL: 'verbose' }
    expect(() => loadConfig(env)).toThrow()
  })

  it('rejects AUDE_BCRYPT_COST below minimum', () => {
    const env = { ...validEnv(), AUDE_BCRYPT_COST: '5' }
    expect(() => loadConfig(env)).toThrow()
  })

  it('coerces string numbers correctly', () => {
    const env = {
      ...validEnv(),
      AUDE_JWT_ACCESS_TTL: '1800',
      AUDE_JWT_REFRESH_TTL: '2592000',
    }
    const config = loadConfig(env)
    expect(config.AUDE_JWT_ACCESS_TTL).toBe(1800)
    expect(typeof config.AUDE_JWT_REFRESH_TTL).toBe('number')
  })

  it('produces correct AppConfig type shape', () => {
    // Arrange
    const env = validEnv()
    const config: AppConfig = loadConfig(env)

    // Assert — compile-time: AppConfig has all expected keys
    expect(typeof config.PORT).toBe('number')
    expect(typeof config.NODE_ENV).toBe('string')
    expect(typeof config.AUDE_JWT_SECRET).toBe('string')
    expect(typeof config.DATABASE_URL).toBe('string')
  })
})
