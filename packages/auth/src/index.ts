/**
 * @audebase/auth - Public API
 */

export { AuthService } from './auth-service.js'
export {
  signToken,
  verifyToken,
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  assertJwtSecret,
  REFRESH_TOKEN_TTL_MS,
  ACCESS_TOKEN_EXPIRY_SECONDS,
} from './token.js'
export type {
  DatabaseProvider,
  UserRecord,
  RefreshTokenRecord,
  LoginInput,
  TokenResult,
} from './types.js'
