// Dangerous SQL operation detection

const DANGEROUS_PATTERNS = [
  /\bDROP\s+TABLE\b/i,
  /\bDROP\s+DATABASE\b/i,
  /\bDROP\s+SCHEMA\b/i,
  /\bTRUNCATE\b/i,
]

export function containsDangerousOperation(sql: string): boolean {
  return DANGEROUS_PATTERNS.some(pattern => pattern.test(sql))
}
