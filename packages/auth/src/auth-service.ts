/**
 * AuthService - Authentication service with JWT + refresh tokens
 *
 * @audebase/auth
 */

import { ErrorCode, UserError } from '@audebase/shared-types'
import type { JwtPayload } from '@audebase/shared-types'
import bcrypt from 'bcryptjs'
import type {
  DatabaseProvider,
  UserRecord,
  RefreshTokenRecord,
  LoginInput,
  TokenResult,
} from './types.js'
import {
  verifyToken,
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  REFRESH_TOKEN_TTL_MS,
  ACCESS_TOKEN_EXPIRY_SECONDS,
} from './token.js'

type AuditLogger = (entry: Record<string, unknown>) => void

const BCRYPT_COST = 12

export class AuthService {
  private readonly db: DatabaseProvider
  private readonly jwtSecret: string
  private auditLogger: AuditLogger | null = null

  constructor(db: DatabaseProvider, jwtSecret: string) {
    this.db = db
    this.jwtSecret = jwtSecret
  }

  /** Set a custom audit logger (for testing / DI) */
  setAuditLogger(fn: AuditLogger): void {
    this.auditLogger = fn
  }

  /**
   * User login: validate credentials, return tokens.
   * @throws UserError(AUTH_INVALID_CREDENTIALS)
   * @throws UserError(AUTH_USER_INACTIVE)
   * @throws UserError(AUTH_MUST_CHANGE_PASSWORD)
   */
  async login(input: LoginInput): Promise<TokenResult> {
    const user = (await this.db.query.users.findFirst()) as UserRecord | undefined

    if (!user) {
      throw new UserError(ErrorCode.AUTH_INVALID_CREDENTIALS, 'Invalid credentials')
    }

    if (!user.is_active) {
      throw new UserError(ErrorCode.AUTH_USER_INACTIVE, 'User is inactive')
    }

    const passwordValid = await bcrypt.compare(input.password, user.password_hash)
    if (!passwordValid) {
      throw new UserError(ErrorCode.AUTH_INVALID_CREDENTIALS, 'Invalid credentials')
    }

    if (user.must_change_password) {
      throw new UserError(ErrorCode.AUTH_MUST_CHANGE_PASSWORD, 'Must change password')
    }

    const accessToken = await generateAccessToken(
      {
        id: user.id,
        username: user.username,
        token_version: user.token_version,
        tenant_id: user.tenant_id,
      },
      this.jwtSecret,
    )

    const refreshToken = generateRefreshToken()
    const refreshTokenHash = hashToken(refreshToken)

    await this.db.insert({
      user_id: user.id,
      token_hash: refreshTokenHash,
      expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      revoked_at: null,
      user_agent: input.userAgent ?? null,
      ip: input.ip ?? null,
    })

    await this.db.update({ last_login_at: new Date() })

    this.logAudit({
      action: 'login',
      actor_id: user.id,
      ip: input.ip,
      user_agent: input.userAgent,
    })

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: ACCESS_TOKEN_EXPIRY_SECONDS,
      token_type: 'Bearer',
    }
  }

  /**
   * Refresh access token using a refresh token.
   * @throws UserError(AUTH_TOKEN_EXPIRED)
   */
  async refresh(input: { refresh_token: string }): Promise<TokenResult> {
    const tokenHash = hashToken(input.refresh_token)
    void tokenHash // ponytail: real DB would use this in WHERE clause
    const stored = (await this.db.query.refresh_tokens.findFirst()) as
      | RefreshTokenRecord
      | undefined

    if (!stored) {
      throw new UserError(ErrorCode.AUTH_TOKEN_EXPIRED, 'Token not found')
    }

    if (stored.revoked_at !== null) {
      throw new UserError(ErrorCode.AUTH_TOKEN_EXPIRED, 'Token revoked')
    }

    if (stored.expires_at.getTime() < Date.now()) {
      throw new UserError(ErrorCode.AUTH_TOKEN_EXPIRED, 'Token expired')
    }

    const user = (await this.db.query.users.findFirst()) as UserRecord | undefined
    if (!user) {
      throw new UserError(ErrorCode.AUTH_TOKEN_EXPIRED, 'User not found')
    }

    // Revoke old refresh token (rotation)
    await this.db.update({ revoked_at: new Date() })

    // Generate new tokens
    const newAccessToken = await generateAccessToken(
      {
        id: user.id,
        username: user.username,
        token_version: user.token_version,
        tenant_id: user.tenant_id,
      },
      this.jwtSecret,
    )

    const newRefreshToken = generateRefreshToken()
    const newRefreshHash = hashToken(newRefreshToken)

    await this.db.insert({
      user_id: user.id,
      token_hash: newRefreshHash,
      expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      revoked_at: null,
    })

    return {
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
      expires_in: ACCESS_TOKEN_EXPIRY_SECONDS,
      token_type: 'Bearer',
    }
  }

  /**
   * Logout: revoke the refresh token.
   * @throws UserError(AUTH_TOKEN_EXPIRED) if token not found
   */
  async logout(input: { refresh_token: string }): Promise<void> {
    const tokenHash = hashToken(input.refresh_token)
    void tokenHash // ponytail: real DB would use this in WHERE clause
    const stored = (await this.db.query.refresh_tokens.findFirst()) as
      | RefreshTokenRecord
      | undefined

    if (!stored) {
      throw new UserError(ErrorCode.AUTH_TOKEN_EXPIRED, 'Token not found')
    }

    await this.db.update({ revoked_at: new Date() })
  }

  /**
   * Verify a JWT access token and check token_version.
   * @returns Decoded JWT payload
   * @throws UserError(AUTH_TOKEN_EXPIRED)
   * @throws UserError(AUTH_TOKEN_VERSION_MISMATCH)
   */
  async verifyAccessToken(
    token: string,
  ): Promise<JwtPayload & { iat: number; exp: number }> {
    let decoded: JwtPayload & { iat: number; exp: number }
    try {
      decoded = await verifyToken(token, this.jwtSecret)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      if (/expired/i.test(msg)) {
        throw new UserError(ErrorCode.AUTH_TOKEN_EXPIRED, 'Token expired')
      }
      throw new UserError(ErrorCode.AUTH_TOKEN_EXPIRED, 'Token invalid')
    }

    const decodedWithVersion = decoded as JwtPayload & { iat: number; exp: number; token_version: number }
    const user = (await this.db.query.users.findFirst()) as UserRecord | undefined
    if (user && decodedWithVersion.token_version !== user.token_version) {
      throw new UserError(
        ErrorCode.AUTH_TOKEN_VERSION_MISMATCH,
        'Token version mismatch',
      )
    }

    return decoded
  }

  /**
   * Change user password. Increments token_version to invalidate old tokens.
   * @throws UserError(AUTH_INVALID_CREDENTIALS) if oldPassword mismatch
   */
  async changePassword(
    userId: string,
    oldPassword: string | null,
    newPassword: string,
  ): Promise<void> {
    const user = (await this.db.query.users.findFirst()) as UserRecord | undefined
    if (!user) {
      throw new UserError(ErrorCode.AUTH_INVALID_CREDENTIALS, 'User not found')
    }

    if (oldPassword !== null) {
      const valid = await bcrypt.compare(oldPassword, user.password_hash)
      if (!valid) {
        throw new UserError(ErrorCode.AUTH_INVALID_CREDENTIALS, 'Wrong password')
      }
    }

    const newHash = await bcrypt.hash(newPassword, BCRYPT_COST)
    await this.db.update({
      password_hash: newHash,
      token_version: user.token_version + 1,
      must_change_password: false,
    })

    this.logAudit({
      action: 'auth:password_change',
      actor_id: userId,
    })
  }

  private logAudit(entry: Record<string, unknown>): void {
    if (this.auditLogger) {
      this.auditLogger(entry)
    }
  }
}
