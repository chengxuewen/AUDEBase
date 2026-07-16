// RED PHASE: imports will resolve once implementation is created
import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactNode } from 'react'
import { usePlugins } from '../usePlugins'

describe('usePlugins (TanStack Query integration)', () => {
  it('should include plugin name prefix in queryKey', async () => {
    // Arrange
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })

    // Act
    renderHook(() => usePlugins(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    })

    // Assert
    await waitFor(() => {
      const queries = queryClient.getQueryCache().getAll()
      expect(queries.length).toBeGreaterThan(0)
      // D18: queryKey must include plugin name prefix
      expect(queries[0].queryKey[0]).toBe('@audebase/admin-ui')
    })
  })

  it('should cache API response data automatically', async () => {
    // Arrange
    const queryClient = new QueryClient()

    // Act
    const { result } = renderHook(() => usePlugins(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      ),
    })

    // Assert
    await waitFor(() => {
      expect(result.current.data).toBeDefined()
    })
  })
})
