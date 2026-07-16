import type { ReactNode } from 'react'
import { Layout, Menu } from 'antd'

const { Sider, Header, Content } = Layout

interface AdminLayoutProps {
  canRoute?: (snippet: string) => boolean
  children?: ReactNode
}

interface MenuItem {
  key: string
  label: string
  snippet: string
}

const defaultMenuItems: MenuItem[] = [
  { key: 'plugins', label: '插件管理', snippet: 'plugin' },
  { key: 'users', label: '用户管理', snippet: 'user' },
]

export function AdminLayout({ canRoute, children }: AdminLayoutProps): ReactNode {
  const items = canRoute
    ? defaultMenuItems.filter((item) => canRoute(item.snippet))
    : defaultMenuItems

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider>
        <Menu theme="dark" mode="inline" items={items.map((i) => ({ key: i.key, label: i.label }))} />
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', padding: '0 16px' }} />
        <Content style={{ padding: '24px' }}>{children}</Content>
      </Layout>
    </Layout>
  )
}
