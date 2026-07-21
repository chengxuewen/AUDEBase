import type { ReactNode } from 'react'
import { Layout, Menu, Dropdown, Space } from 'antd'
import { DownOutlined } from '@ant-design/icons'
import { useTenant } from '../providers/TenantProvider.js'
import { useTranslation } from 'react-i18next'

const { Sider, Header, Content } = Layout

interface AdminLayoutProps {
  canRoute?: (snippet: string) => boolean
  activeKey?: string
  onMenuClick?: (key: string) => void
  children?: ReactNode
}

interface MenuItem {
  key: string
  labelKey: string
  snippet: string
}

const defaultMenuItems: MenuItem[] = [
  { key: 'plugins', labelKey: 'menu.plugins', snippet: 'plugin' },
  { key: 'users', labelKey: 'menu.users', snippet: 'user' },
  { key: 'roles', labelKey: 'menu.roles', snippet: 'role' },
  { key: 'audit', labelKey: 'menu.audit', snippet: 'audit_log' },
  { key: 'extensions', labelKey: 'menu.extensions', snippet: 'extension' },
]


function TenantSwitcher(): ReactNode {
  const tenantCtx = useTenant()

  if (!tenantCtx || tenantCtx.availableTenants.length === 0) {
    return null
  }

  const current = tenantCtx.availableTenants.find((t) => t.id === tenantCtx.tenantId)
  const currentName = current?.name ?? tenantCtx.tenantId

  const items = tenantCtx.availableTenants.map((t) => ({
    key: t.id,
    label: t.name,
  }))

  return (
    <Dropdown
      menu={{
        items,
        onClick: ({ key }) => tenantCtx.switchTenant(key),
      }}
    >
      <Space style={{ cursor: 'pointer' }} data-testid="tenant-switcher">
        {currentName}
        <DownOutlined />
      </Space>
    </Dropdown>
  )
}

export function AdminLayout({ canRoute, activeKey, onMenuClick, children }: AdminLayoutProps): ReactNode {
  const { t } = useTranslation('client')
  // Guard: defaultMenuItems is always an array, but belt-and-suspenders in case canRoute throws or returns unexpected values
  const items = (canRoute ? defaultMenuItems.filter((item) => canRoute(item.snippet)) : defaultMenuItems) ?? defaultMenuItems

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider>
        <Menu theme="dark" mode="inline" selectedKeys={activeKey !== undefined ? [activeKey] : []} onClick={({ key }: { key: string }) => onMenuClick?.(key)} items={(items ?? []).map((i: MenuItem) => ({ key: i.key, label: t(i.labelKey) }))} />
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', padding: '0 16px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
          <TenantSwitcher />
        </Header>
        <Content style={{ padding: '24px' }}>{children}</Content>
      </Layout>
    </Layout>
  )
}
