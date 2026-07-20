import { describe, it, expect } from 'vitest'
import type { DatabaseProvider, RedisClient } from '../types.js'

describe('health-check types — structural validation', () => {
  describe('DatabaseProvider', () => {
    it('accepts an implementation with execute(sql) method', async () => {
      // Arrange
      const db: DatabaseProvider = {
        execute: async (sql: string, params?: unknown[]) => {
          return [{ '?column?': 1 }]
        },
      }

      // Act
      const result = await db.execute('SELECT 1')

      // Assert
      expect(result).toBeDefined()
    })

    it('supports parameterized query execution', async () => {
      let capturedParams: unknown[] | undefined
      const db: DatabaseProvider = {
        execute: async (sql: string, params?: unknown[]) => {
          capturedParams = params
          return [{ result: 'ok' }]
        },
      }

      // Act
      await db.execute('SELECT * FROM users WHERE id = $1', ['user-123'])

      // Assert
      expect(capturedParams).toEqual(['user-123'])
    })

    it('execute with no params works', async () => {
      const db: DatabaseProvider = {
        execute: async (_sql: string) => {
          return [{ ok: true }]
        },
      }

      const result = await db.execute('SELECT 1')
      expect(result).toBeDefined()
    })
  })

  describe('RedisClient', () => {
    it('accepts an implementation with ping() returning PONG', async () => {
      // Arrange
      const redis: RedisClient = {
        ping: async () => 'PONG',
      }

      // Act
      const response = await redis.ping()

      // Assert
      expect(response).toBe('PONG')
    })

    it('supports ping returning custom string (ioredis compatibility)', async () => {
      const redis: RedisClient = {
        ping: async () => '+PONG',
      }

      const response = await redis.ping()
      expect(typeof response).toBe('string')
    })
  })
})
