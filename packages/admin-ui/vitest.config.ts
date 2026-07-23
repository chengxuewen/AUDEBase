import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { viMockAutoWrapPlugin } from './vi-mock-auto-wrap.ts'

export default defineConfig({
  plugins: [react(), viMockAutoWrapPlugin()],
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.tsx', 'src/**/*.test.ts'],
    setupFiles: ['src/__tests__/setup.ts'],
    restoreMocks: true,
    clearMocks: true,
  },
})
