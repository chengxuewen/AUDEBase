import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { Button, Spin, message } from 'antd'
import { useTranslation } from 'react-i18next'
import { getToken, clearTokens, apiGet } from './api/client.js'
import { LoginPage } from './pages/LoginPage.js'
import { AdminLayout } from './layout/AdminLayout.js'
import { PluginListPage } from './pages/plugins/PluginListPage.js'
import { UserListPage } from './pages/users/UserListPage.js'
import { RoleListPage } from './pages/roles/RoleListPage.js'
import { AuditLogPage } from './pages/audit/AuditLogPage.js'
import { ExtensionListPage } from './pages/extensions/ExtensionListPage.js'
import { RefineProvider } from './providers/refine.js'
  interface JwtPayload {
  exp?: number
}

// ponytail: base64-decode JWT payload (no jwt-decode dep). Only checks expiry, not signature.
function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return true
    const payload = JSON.parse(atob(parts[1] as string)) as JwtPayload
    if (typeof payload.exp !== 'number') return false
    return Date.now() >= payload.exp * 1000
  } catch {
    return true
  }
}

const queryClient = new QueryClient()

function AdminApp(): ReactNode {
  const { t } = useTranslation('client')
  const [activePage, setActivePage] = useState('plugins')

  const handleLogout = (): void => {
    clearTokens()
    queryClient.clear()
    window.location.reload()
  }

  const pages: Record<string, ReactNode> = {
    plugins: <PluginListPage />,
    users: <UserListPage />,
    roles: <RoleListPage />,
    audit: <AuditLogPage />,
    extensions: <ExtensionListPage />,
  }


  return (
    <AdminLayout activeKey={activePage} onMenuClick={setActivePage}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <Button onClick={handleLogout}>{t('common.logout')}</Button>
      </div>
      {pages[activePage] ?? <PluginListPage />}
    </AdminLayout>
  )
}

export function App(): ReactNode {
  const { t } = useTranslation('client')
  // null = verifying token, true = authed, false = unauthed
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null)

  useEffect(() => {
    const token = getToken()
    if (!token) {
      setIsAuthed(false)
      return
    }

    // Quick client-side expiry check first
    if (isTokenExpired(token)) {
      clearTokens()
      setIsAuthed(false)
      return
    }

    // Blocking: verify token with backend before rendering anything
    apiGet<{ user: unknown }>('/api/auth/me')
      .then(() => {
        setIsAuthed(true)
      })
      .catch(() => {
        clearTokens()
        setIsAuthed(false)
        void message.error(t('login.expired'))
      })
  }, [t])

  useEffect(() => {
    const handler = (): void => {
      setIsAuthed(false)
      void message.error(t('login.expired'))
    }
    window.addEventListener('aude:unauthorized', handler)
    return () => window.removeEventListener('aude:unauthorized', handler)
  }, [t])

  const handleLogin = (): void => {
    setIsAuthed(true)
  }

  // Loading: show spinner while verifying token
  if (isAuthed === null) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    )
  }

  if (!isAuthed) {
    return <LoginPage onLogin={handleLogin} />
  }

  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <RefineProvider>
          <AdminApp />
        </RefineProvider>
      </QueryClientProvider>
    </BrowserRouter>
  )
}
