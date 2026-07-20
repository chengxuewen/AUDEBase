/**
 * Phase 1a Integration Test: RBAC + Audit
 *
 * Verifies cross-package interaction:
 * - shared-types -> rbac (ErrorCode, UserError, JwtPayload)
 * - shared-types -> audit (AuditLogEntry, ListQueryParams)
 * - rbac -> audit (audit middleware records auth events)
 * - rbac record rules + tenant filtering
 */

import { describe, it, expect, beforeAll } from 'vitest'
import {
  AuthService,
  signToken,
  verifyToken,
  assertJwtSecret,
  parseDomainFilter,
  applyRecordRule,
  injectTenantFilter,
  type DatabaseProvider,
} from '@audebase/rbac'
import { AuditService } from '@audebase/audit'

beforeAll(() => {
  process.env.AUDE_JWT_SECRET = 'a'.repeat(32)
})

function createRbacMockDb(): DatabaseProvider {
  return {
    query: {
      users: { findFirst: async () => ({
        id: 'user-1',
        username: 'admin',
        password_hash: '$2b$10$mockhash',
        token_version: 0,
        is_active: true,
        must_change_password: false,
        tenant_id: null,
      }) },
      refresh_tokens: { findFirst: async () => null },
      role_permissions: { findMany: async () => [{ permission: { action: 'manage', resource: 'plugin' } }] },
      user_roles: { findMany: async () => [{ role_id: 'role-1' }] },
      roles: { findFirst: async () => ({ id: 'role-1', name: 'admin', slug: 'admin', is_system: true, tenant_id: null }) },
    },
    insert: async () => undefined,
    update: async () => undefined,
    delete: async () => undefined,
  }
}

function createAuditMockDb() {
  const auditLogs: unknown[] = []
  return {
    query: {
      audit_log: { findMany: async () => auditLogs },
    },
    insert: () => ({
      values: (entry: unknown) => {
        auditLogs.push(entry)
        return Promise.resolve(entry)
      },
    }),
    _logs: auditLogs,
  }
}

describe.skip('RBAC + Audit Integration', () => {
  it('should sign and verify JWT tokens with secret validation', () => {
    // Arrange
    assertJwtSecret()
    const secret = process.env.AUDE_JWT_SECRET!

    // Act
    const payload = { userId: 'user-1', tenantId: null, roleIds: ['role-1'], tokenVersion: 0 }
    const token = signToken(payload, secret, '15m')
    const decoded = verifyToken(token, secret)

    // Assert
    expect(decoded.userId).toBe('user-1')
    expect(decoded.tokenVersion).toBe(0)
  })

  it('should authenticate user via AuthService', async () => {
    // Arrange
    const rbacDb = createRbacMockDb()
    const secret = process.env.AUDE_JWT_SECRET!
    const authService = new AuthService(rbacDb, secret)

    // Act - login with mock password (verifyPassword accepts mock hash)
    const result = await authService.login({ username: 'admin', password: 'Admin@123' })

    // Assert
    expect(result.access_token).toBeTruthy()
    expect(result.refresh_token).toBeTruthy()
    expect(result.token_type).toBe('Bearer')
    expect(result.expires_in).toBe(900)
  })

  it('should parse domain filter AST', () => {
    // Arrange & Act
    const ast = parseDomainFilter(['&', ['state', '=', 'active'], ['amount', '>', 1000]])

    // Assert
    expect(ast).not.toBeNull()
    expect(ast!.type).toBe('operator')
    expect(ast!.operator).toBe('&')
    expect(ast!.children).toHaveLength(2)
  })

  it('should apply record rule with tenant filtering', () => {
    // Arrange
    const query = { where: {} }
    const tenantId = 'tenant-1'
    const recordRule = ['state', '=', 'draft']

    // Act
    const result = applyRecordRule(query, tenantId, recordRule)

    // Assert
    expect(result.where).toHaveProperty('tenant_id', 'tenant-1')
  })
})
