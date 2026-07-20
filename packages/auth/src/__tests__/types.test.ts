import { describe, it, expect } from 'vitest'
import type {
  DatabaseProvider,
  UserRecord,
  RefreshTokenRecord,
  LoginInput,
  TokenResult,
} from '../types.js'

describe('auth types — structural validation', () => {
  // These tests validate that the type interfaces enforce the expected
  // shapes at runtime when values are constructed in a type-safe way.

  describe('UserRecord', () => {
    it('accepts minimal UserRecord fields', () => {
      // Arrange & Act
      const user: UserRecord = {
        id: 'usr-001',
        username: 'admin',
        password_hash: '$2b$12$...',
        token_version: 0,
        is_active: true,
        must_change_password: false,
        tenant_id: null,
      }

      // Assert
      expect(user.id).toBe('usr-001')
      expect(user.username).toBe('admin')
      expect(user.is_active).toBe(true)
      expect(user.tenant_id).toBeNull()
    })

    it('UserRecord allows last_login_at Date', () => {
      const now = new Date()
      const user: UserRecord = {
        id: 'u1',
        username: 'test',
        password_hash: 'hash',
        token_version: 1,
        is_active: true,
        must_change_password: false,
        tenant_id: 't-1',
        last_login_at: now,
      }

      expect(user.last_login_at).toBe(now)
    })

    it('UserRecord allows last_login_at as null', () => {
      const user: UserRecord = {
        id: 'u1',
        username: 'test',
        password_hash: 'hash',
        token_version: 0,
        is_active: false,
        must_change_password: true,
        tenant_id: null,
        last_login_at: null,
      }

      expect(user.last_login_at).toBeNull()
    })
  })

  describe('RefreshTokenRecord', () => {
    it('accepts an active (non-revoked) token record', () => {
      // Arrange
      const expiresAt = new Date(Date.now() + 7 * 24 * 3600_000)

      // Act
      const record: RefreshTokenRecord = {
        id: 'rt-001',
        user_id: 'usr-001',
        token_hash: 'sha256-hash-hex',
        revoked_at: null,
        expires_at: expiresAt,
      }

      // Assert
      expect(record.revoked_at).toBeNull()
      expect(record.expires_at.getTime()).toBeGreaterThan(Date.now())
    })

    it('accepts a revoked token record', () => {
      const record: RefreshTokenRecord = {
        id: 'rt-002',
        user_id: 'usr-001',
        token_hash: 'sha256-hash-hex',
        revoked_at: new Date(),
        expires_at: new Date(),
      }

      expect(record.revoked_at).toBeInstanceOf(Date)
    })
  })

  describe('LoginInput', () => {
    it('accepts required username + password', () => {
      const input: LoginInput = { username: 'admin', password: 'secret' }

      expect(input.username).toBe('admin')
      expect(input.password).toBe('secret')
    })

    it('optional ip and userAgent default to undefined', () => {
      const input: LoginInput = { username: 'u', password: 'p' }

      expect(input.ip).toBeUndefined()
      expect(input.userAgent).toBeUndefined()
    })

    it('accepts ip and userAgent when provided', () => {
      const input: LoginInput = {
        username: 'u',
        password: 'p',
        ip: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
      }

      expect(input.ip).toBe('192.168.1.1')
      expect(input.userAgent).toBe('Mozilla/5.0')
    })
  })

  describe('TokenResult', () => {
    it('has correct shape for Bearer token', () => {
      const result: TokenResult = {
        access_token: 'eyJhbG...',
        refresh_token: 'dGhpcy...',
        expires_in: 900,
        token_type: 'Bearer',
      }

      expect(result.token_type).toBe('Bearer')
      expect(result.expires_in).toBe(900)
      expect(typeof result.access_token).toBe('string')
      expect(typeof result.refresh_token).toBe('string')
    })
  })

  describe('DatabaseProvider', () => {
    it('supports findFirst on users table', async () => {
      const db: DatabaseProvider = {
        query: {
          users: {
            findFirst: async () => ({
              id: 'u1',
              username: 'admin',
              password_hash: 'hash',
              token_version: 0,
              is_active: true,
              must_change_password: false,
              tenant_id: null,
            }),
          },
          refresh_tokens: {
            findFirst: async () => ({
              id: 'rt1',
              user_id: 'u1',
              token_hash: 'hash',
              revoked_at: null,
              expires_at: new Date(),
            }),
          },
        },
        insert: async () => undefined,
        update: async () => undefined,
        delete: async () => undefined,
      }

      const user = await db.query.users.findFirst()
      expect(user).not.toBeNull()
    })

    it('supports insert/update/delete operations', async () => {
      const db: DatabaseProvider = {
        query: {
          users: { findFirst: async () => null },
          refresh_tokens: { findFirst: async () => null },
        },
        insert: async () => ({ id: 'new-id' }),
        update: async () => undefined,
        delete: async () => undefined,
      }

      const result = await db.insert({ table: 'users' })
      expect(result).toBeDefined()
      await db.update({ table: 'users' })
      await db.delete({ table: 'refresh_tokens' })
    })
  })
})
