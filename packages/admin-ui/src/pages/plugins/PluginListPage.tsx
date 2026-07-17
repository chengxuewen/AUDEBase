import type { ReactNode } from 'react'
import { Button, Empty, Space, Spin, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
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
  const { data, isLoading, isError } = usePlugins()

  if (isLoading) {
    return <Spin />
  }

  if (isError) {
    return (
      <div>
        <p>加载失败</p>
        <Button autoInsertSpace={false}>重试</Button>
      </div>
    )
  }

  const paginated = data as PluginsResponse | undefined
  const list = paginated?.data ?? []

  if (list.length === 0) {
    return <Empty description="暂无插件" />
  }

  const columns: ColumnsType<PluginItem> = [
    { title: '插件名称', dataIndex: 'name', key: 'name' },
    { title: '显示名称', dataIndex: 'display_name', key: 'display_name' },
    { title: '版本', dataIndex: 'version', key: 'version' },
    {
      title: '状态',
      dataIndex: 'state',
      key: 'state',
      render: (state: string) => <Tag color={state === 'enabled' ? 'green' : 'default'}>{state}</Tag>,
    },
    { title: '分类', dataIndex: 'category', key: 'category' },
    {
      title: '操作',
      key: 'action',
      render: () => (
        <Space>
          <Button size="small" autoInsertSpace={false}>启用</Button>
          <Button size="small" autoInsertSpace={false}>禁用</Button>
        </Space>
      ),
    },
  ]

  return <Table<PluginItem> rowKey="id" columns={columns} dataSource={list} pagination={false} />
}
