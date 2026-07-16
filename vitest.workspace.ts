import { defineWorkspace } from 'vitest/config'
import { resolve } from 'path'

const pkgs = [
  'shared-types',
  'core',
  'rbac',
  'audit',
  'migration',
  'plugin-core',
  'plugin-framework',
  'manifest-engine',
  'i18n',
  'admin-ui',
]

const alias = Object.fromEntries(
  pkgs.map((name) => [`@audebase/${name}`, resolve(__dirname, `packages/${name}/src/index.ts`)]),
)

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
    resolve: { alias },
    test: {
      name: 'integration',
      include: ['tests/integration/**/*.integration.test.ts'],
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
