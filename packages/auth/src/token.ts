/**
 * JWT Token utilities
 *
 * @audebase/auth
 */

import { createHash, randomBytes } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'
import type { JwtPayload } from '@audebase/shared-types'

/** Minimum JWT secret length (D8.1) */
const MIN_SECRET_LENGTH = 32

/** Refresh token expiry: 7 days in milliseconds */
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000

/** Access token expiry: 15 minutes in seconds */
const ACCESS_TOKEN_EXPIRY_SECONDS = 900

function validateSecret(secret: string): void {
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`密钥长度不足: 需要至少 ${MIN_SECRET_LENGTH} 字符`)
  }
}

function secretToKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret)
}

function parseExpiresInSeconds(expiresIn: string): number {
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
  return value * multipliers[unit!]!
}

/**
 * Sign a JWT token with the given payload, secret, and expiration.
 *
 * @returns Signed JWT string
 * @throws Error if secret is < 32 chars
 */
export async function signToken(
  payload: Record<string, unknown>,
  secret: string,
  expiresIn: string,
): Promise<string> {
  validateSecret(secret)
  const seconds = parseExpiresInSeconds(expiresIn)
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime(`${seconds}s`)
    .sign(secretToKey(secret))
}

/**
 * Verify a JWT token and return the decoded payload.
 *
 * @throws Error if token is invalid, expired, or signature doesn't match
 */
export async function verifyToken(
  token: string,
  secret: string,
): Promise<JwtPayload & { iat: number; exp: number }> {
  validateSecret(secret)
  try {
    const { payload } = await jwtVerify(token, secretToKey(secret))
    return payload as unknown as JwtPayload & { iat: number; exp: number }
  } catch (err) {
    if (err instanceof Error && ('code' in err && err.code === 'ERR_JWT_EXPIRED')) {
      throw new Error('Token expired')
    }
    throw new Error('Invalid token signature')
  }
}

/**
 * Generate an access token for a user.
 */
export async function generateAccessToken(
  user: {
    id: string
    username: string
    token_version: number
    tenant_id: string | null
    roles?: string[]
  },
  jwtSecret: string,
): Promise<string> {
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
 * Generate a refresh token (opaque, 64-char hex string).
 */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('hex')
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

export {
  REFRESH_TOKEN_TTL_MS,
  ACCESS_TOKEN_EXPIRY_SECONDS,
}
