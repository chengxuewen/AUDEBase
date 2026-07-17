import type { ReactNode } from 'react'
import { Button, Empty, Space, Spin, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useTranslation } from 'react-i18next'
import { usePlugins } from './hooks/usePlugins.js'

interface PluginItem {
  id: string
  name: string
  display_name: string
  version: string
  state: string
  category: string
}

interface PluginsResponse {
  data: PluginItem[]
}

export function PluginListPage(): ReactNode {
  const { t } = useTranslation('client')
  const { data, isLoading, isError } = usePlugins()

  if (isLoading) {
    return <Spin />
  }

  if (isError) {
    return (
      <div>
        <p>{t('common.loadFailed')}</p>
        <Button autoInsertSpace={false}>{t('common.retry')}</Button>
      </div>
    )
  }

  const paginated = data as PluginsResponse | undefined
  const list = paginated?.data ?? []

  if (list.length === 0) {
    return <Empty description={t('plugins.noData')} />
  }

  const columns: ColumnsType<PluginItem> = [
    { title: t('plugins.name'), dataIndex: 'name', key: 'name' },
    { title: t('plugins.displayName'), dataIndex: 'display_name', key: 'display_name' },
    { title: t('plugins.version'), dataIndex: 'version', key: 'version' },
    {
      title: t('plugins.state'),
      dataIndex: 'state',
      key: 'state',
      render: (state: string) => <Tag color={state === 'enabled' ? 'green' : 'default'}>{state}</Tag>,
    },
    { title: t('plugins.category'), dataIndex: 'category', key: 'category' },
    {
      title: t('common.actions'),
      key: 'action',
      render: () => (
        <Space>
          <Button size="small" autoInsertSpace={false}>{t('common.enable')}</Button>
          <Button size="small" autoInsertSpace={false}>{t('common.disable')}</Button>
        </Space>
      ),
    },
  ]

  return <Table<PluginItem> rowKey="id" columns={columns} dataSource={list} pagination={false} />
}
