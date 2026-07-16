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
