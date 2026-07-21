import { useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Button, message } from 'antd'
import { useTranslation } from 'react-i18next'
import { getToken, clearTokens, apiGet } from './api/client.js'
import { AdminLayout } from './layout/AdminLayout.js'
import { PluginListPage } from './pages/plugins/PluginListPage.js'
import { UserListPage } from './pages/users/UserListPage.js'
import { RoleListPage } from './pages/roles/RoleListPage.js'
import { AuditLogPage } from './pages/audit/AuditLogPage.js'
import { ExtensionListPage } from './pages/extensions/ExtensionListPage.js'

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

  // Guard: don't render AdminApp if token was cleared (e.g., stale token during auth check)
  if (!getToken()) {
    return <LoginPage onLogin={handleLogin} />
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
  const [isAuthed, setIsAuthed] = useState<boolean>(() => getToken() !== null)
  useEffect(() => {
    const handler = (): void => {
      setIsAuthed(false)
      void message.error(t('login.expired'))
    }
    window.addEventListener('aude:unauthorized', handler)
    return () => window.removeEventListener('aude:unauthorized', handler)
  }, [t])
  // Non-blocking: verify token with a protected endpoint in background.
  // Stale tokens trigger 401, which the request handler already clears
  // and dispatches aude:unauthorized — handled by the listener below.
  useEffect(() => {
    const token = getToken()
    if (token && !isTokenExpired(token)) {
      void apiGet('/api/plugins').catch(() => {
        clearTokens()
        setIsAuthed(false)
      })
    }
  }, [])

  const handleLogin = (): void => {
    setIsAuthed(true)
  }

  if (!isAuthed) {
    return <LoginPage onLogin={handleLogin} />
  }

  return (
    <QueryClientProvider client={queryClient}>
      <AdminApp />
    </QueryClientProvider>
  )
}
