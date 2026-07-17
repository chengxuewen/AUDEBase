import { useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Button, message } from 'antd'
import { useTranslation } from 'react-i18next'
import { getToken, clearTokens } from './api/client.js'
import { LoginPage } from './pages/LoginPage.js'
import { AdminLayout } from './layout/AdminLayout.js'
import { PluginListPage } from './pages/plugins/PluginListPage.js'


const queryClient = new QueryClient()

function AdminApp(): ReactNode {
  const { t } = useTranslation('client')
  const handleLogout = (): void => {
    clearTokens()
    queryClient.clear()
    window.location.reload()
  }

  return (
    <AdminLayout>
      <div style={{ marginBottom: 16 }}>
        <Button onClick={handleLogout}>{t('common.logout')}</Button>
      </div>
      <PluginListPage />
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
