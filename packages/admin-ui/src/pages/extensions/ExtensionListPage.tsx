import type { ReactNode } from 'react'
import { Empty, Spin, Table, Tag } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useExtensions, type Extension } from './hooks/useExtensions.js'

export function ExtensionListPage(): ReactNode {
  const { data, isLoading, isError } = useExtensions()

  if (isLoading) {
    return <Spin />
  }

  if (isError) {
    return <p>加载失败</p>
  }

  const list = data ?? []

  if (list.length === 0) {
    return <Empty description="暂无扩展" />
  }

  const columns: ColumnsType<Extension> = [
    { title: 'Collection', dataIndex: 'collection', key: 'collection' },
    { title: '插件', dataIndex: 'pluginName', key: 'pluginName' },
    {
      title: '字段数量',
      key: 'fieldCount',
      render: (_: unknown, record: Extension) => record.fields.length,
    },
    {
      title: '字段详情',
      key: 'fields',
      render: (_: unknown, record: Extension) => (
        <span>
          {record.fields.map((f) => (
            <Tag key={f.name}>{f.name}: {f.type}</Tag>
          ))}
        </span>
      ),
    },
  ]

  return (
    <Table<Extension>
      rowKey={(record) => `${record.collection}-${record.pluginName}`}
      columns={columns}
      dataSource={list}
      pagination={false}
    />
  )
}
