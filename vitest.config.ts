import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/*/src/**/*.test.ts'],
    exclude: [
      'packages/*/src/**/*.integration.test.ts',
      'packages/*/src/**/*.contract.test.ts',
      'packages/admin-ui/**',
      'node_modules/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['packages/*/src/**/*.ts'],
      exclude: ['packages/*/src/**/*.test.ts', 'packages/*/src/**/__tests__/**', 'packages/*/src/**/index.ts'],
      thresholds: {
        lines: process.env.AUDE_PHASE_1A ? 60 : 80,
      },
    },
  },
})
