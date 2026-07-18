import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import type { JwtPayload } from "@audebase/shared-types";

/** Access token 过期时间（15 分钟） */
const ACCESS_TOKEN_EXPIRY_SECONDS = 900;

/** 用于签名的 payload（不含 iat/exp，由 jwt.sign 自动添加） */
export interface SignPayload {
  sub: string;
  tenant_id: string;
  username: string;
  roles: string[];
}

/**
 * 创建 JWT Access Token
 *
 * 使用 HS512 算法签名，15 分钟过期。
 */
export function createAccessToken(payload: SignPayload, secret: string): string {
  return jwt.sign(payload, secret, {
    algorithm: "HS512",
    expiresIn: ACCESS_TOKEN_EXPIRY_SECONDS,
  });
}

/**
 * 验证并解码 JWT Access Token
 *
 * 返回 JwtPayload。token 无效/过期时抛出 jsonwebtoken 错误。
 */
export function verifyAccessToken(token: string, secret: string): JwtPayload {
  const decoded = jwt.verify(token, secret, {
    algorithms: ["HS512"],
  }) as Record<string, unknown>;

  return {
    sub: String(decoded.sub),
    tenant_id: String(decoded.tenant_id),
    username: String(decoded.username),
    roles: decoded.roles as string[],
    iat: Number(decoded.iat),
    exp: Number(decoded.exp),
  };
}

/**
 * 生成 Refresh Token（原始字符串）
 *
 * 使用 crypto.randomBytes(48)，返回 hex 字符串。
 * 生成的字符串未经哈希，发送给前端。
 * 存储到数据库前使用 hashRefreshToken() 计算 SHA-256 哈希。
 */
export function createRefreshToken(): string {
  return randomBytes(48).toString("hex");
}

/**
 * 对 Refresh Token 进行 SHA-256 哈希
 *
 * 数据库存储哈希值，不存储原始 token。
 */
export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Access token 过期时间（秒）
 */
export { ACCESS_TOKEN_EXPIRY_SECONDS };
