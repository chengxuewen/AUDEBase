import { defineWorkspace } from 'vitest/config'

export default defineWorkspace([
  {
    test: {
      name: 'unit',
      include: ['packages/*/src/**/*.test.ts'],
      exclude: ['packages/*/src/**/*.integration.test.ts', 'packages/*/src/**/*.contract.test.ts'],
      environment: 'node',
    },
  },
  {
    test: {
      name: 'ui',
      include: ['packages/*/src/**/*.test.tsx'],
      environment: 'jsdom',
      setupFiles: ['packages/admin-ui/src/__tests__/setup.ts'],
    },
  },
  {
    test: {
      name: 'integration',
      include: ['packages/*/src/**/*.integration.test.ts'],
      environment: 'node',
    },
  },
  {
    test: {
      name: 'contract',
      include: ['packages/*/src/**/*.contract.test.ts'],
      environment: 'node',
    },
  },
])
