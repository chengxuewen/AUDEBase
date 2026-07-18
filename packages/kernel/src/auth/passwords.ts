import bcrypt from "bcrypt";

/** bcrypt 哈希轮数 */
const BCRYPT_ROUNDS = 12;

/**
 * 对明文密码进行 bcrypt 哈希
 *
 * @param password — 明文密码
 * @returns bcrypt 哈希字符串
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * 验证明文密码是否匹配 bcrypt 哈希
 *
 * @param password — 明文密码
 * @param hash — bcrypt 哈希字符串
 * @returns 是否匹配
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
