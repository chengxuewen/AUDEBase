import { createContext, useContext, type ReactNode } from 'react'
import { Spin } from 'antd'

interface User {
  id: string
  username: string
  is_active: boolean
  token_version: number
  must_change_password: boolean
  tenant_id: string | null
}

interface UserContextValue {
  user: User | null
  isLoading: boolean
  onLogout?: () => void
}

const UserContext = createContext<UserContextValue | null>(null)

interface UserProviderProps {
  user: User | null
  isLoading?: boolean
  onLogout?: () => void
  children: ReactNode
}

export function UserProvider({ user, isLoading = false, onLogout, children }: UserProviderProps): ReactNode {
  const value: UserContextValue = { user, isLoading, ...(onLogout !== undefined ? { onLogout } : {}) }

  if (isLoading && user === null) {
    return <Spin />
  }

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>
}

export function useUser(): UserContextValue | null {
  return useContext(UserContext)
}
