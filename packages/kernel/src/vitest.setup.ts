/**
 * vitest.setup.ts — Test environment configuration for kernel tests.
 *
 * Sets database connection and JWT secret defaults so E2E tests
 * can run without manual env var configuration.
 *
 * ponytail: one file, one purpose. Env override via process.env still works.
 */
process.env.AUDE_JWT_SECRET ??= "test-jwt-secret-minimum-32-characters-long-string!!";
process.env.DATABASE_URL ??= "postgresql://aude:aude@localhost:5432/audebase_test";
