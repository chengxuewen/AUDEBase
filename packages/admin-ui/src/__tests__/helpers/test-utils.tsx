import { render, type RenderOptions } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { type ReactElement, type ReactNode } from 'react'

interface MockACLWrapperOptions {
  aclPermissions?: Set<string>
}

function MockACLWrapper({
  children,
}: {
  children: ReactNode
  permissions: Set<string>
}) {
  // ponytail: minimal mock - returns children as-is
  return <>{children}</>
}

export function renderWithProviders(
  ui: ReactElement,
  options: MockACLWrapperOptions & RenderOptions = {},
) {
  const { aclPermissions = new Set<string>(), ...renderOptions } = options
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>
        <MockACLWrapper permissions={aclPermissions}>{children}</MockACLWrapper>
      </QueryClientProvider>
    ),
    ...renderOptions,
  })
}
