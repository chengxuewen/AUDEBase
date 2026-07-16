import { render, type RenderOptions } from '@testing-library/react'
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
  // Will be expanded to provide ACLContext when ACLProvider is implemented
  return <>{children}</>
}

export function renderWithProviders(
  ui: ReactElement,
  options: MockACLWrapperOptions & RenderOptions = {},
) {
  const { aclPermissions = new Set<string>(), ...renderOptions } = options
  return render(ui, {
    wrapper: ({ children }) => (
      <MockACLWrapper permissions={aclPermissions}>{children}</MockACLWrapper>
    ),
    ...renderOptions,
  })
}
