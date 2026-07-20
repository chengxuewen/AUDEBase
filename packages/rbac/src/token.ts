/**
 * JWT Token utilities
 *
 * @audebase/rbac
 */

import { createHash, randomBytes } from 'node:crypto'
import type { JwtPayload } from '@audebase/shared-types'

/** Minimum JWT secret length (D8.1) */
const MIN_SECRET_LENGTH = 32

/**
 * Validate JWT secret meets minimum length requirement.
 * @throws Error if secret is too short
 */
function validateSecret(secret: string): void {
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`密钥长度不足: 需要至少 ${MIN_SECRET_LENGTH} 字符`)
  }
}

/**
 * Sign a JWT token with the given payload, secret, and expiration.
 *
 * @returns Signed JWT string
 * @throws Error if secret is < 32 chars
 */
export function signToken(
  payload: Record<string, unknown>,
  secret: string,
  expiresIn: string,
): string {
  validateSecret(secret)


  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const exp = computeExpiry(now, expiresIn)

  const fullPayload: Record<string, unknown> = {
    ...payload,
    iat: now,
    exp,
  }

  const encodedHeader = base64Url(JSON.stringify(header))
  const encodedPayload = base64Url(JSON.stringify(fullPayload))
  const data = `${encodedHeader}.${encodedPayload}`

  const signature = createHash('sha256')
    .update(data)
    .update(secret)
    .digest('base64url')

  return `${data}.${signature}`
}

/**
 * Verify a JWT token and return the decoded payload.
 *
 * @throws Error if token is invalid, expired, or signature doesn't match
 */
export function verifyToken(token: string, secret: string): JwtPayload & { iat: number; exp: number } {
  validateSecret(secret)

  const parts = token.split('.')
  if (parts.length !== 3) {
    throw new Error('Invalid token format')
  }

  const encodedHeader = parts[0]
  const encodedPayload = parts[1]
  const signature = parts[2]
  if (!encodedHeader || !encodedPayload || !signature) {
    throw new Error('Invalid token format')
  }
  const data = `${encodedHeader}.${encodedPayload}`

  const expectedSignature = createHash('sha256')
    .update(data)
    .update(secret)
    .digest('base64url')

  if (signature !== expectedSignature) {
    throw new Error('Invalid token signature')
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload)) as JwtPayload & {
    iat: number
    exp: number
  }

  const now = Math.floor(Date.now() / 1000)
  if (payload.exp <= now) {
    throw new Error('Token expired')
  }

  return payload
}

/**
 * Generate an access token for a user.
 */
export function generateAccessToken(
  user: {
    id: string
    username: string
    token_version: number
    tenant_id: string | null
    roles?: string[]
  },
  jwtSecret: string,
): string {
  const payload: Record<string, unknown> = {
    sub: user.id,
    tenant_id: user.tenant_id ?? '',
    username: user.username,
    roles: user.roles ?? [],
    token_version: user.token_version,
  }
  return signToken(payload, jwtSecret, '15m')
}

/**
 * Generate a refresh token (opaque, 96-char hex string).
 */
export function generateRefreshToken(): string {
  return randomBytes(48).toString('hex')
}

/**
 * SHA-256 hash a token for storage.
 * @returns 64-char hex string
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Assert that AUDE_JWT_SECRET environment variable is set and >= 32 chars.
 * @throws Error if missing or too short
 */
export function assertJwtSecret(): void {
  const secret = process.env.AUDE_JWT_SECRET
  if (!secret) {
    throw new Error('AUDE_JWT_SECRET 未设置')
  }
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`AUDE_JWT_SECRET 长度不足: 需要至少 ${MIN_SECRET_LENGTH} 字符`)
  }
}

// --- Helpers ---

function computeExpiry(issuedAt: number, expiresIn: string): number {
  const match = /^(\d+)([smhd])$/.exec(expiresIn)
  if (!match) {
    throw new Error(`Invalid expiresIn format: ${expiresIn}`)
  }
  const value = parseInt(match[1]!, 10)
  const unit = match[2]

  const multipliers: Record<string, number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
  }

  return issuedAt + value * multipliers[unit!]!
}

function base64Url(str: string): string {
  return Buffer.from(str, 'utf8').toString('base64url')
}

function base64UrlDecode(str: string): string {
  return Buffer.from(str, 'base64url').toString('utf8')
}
