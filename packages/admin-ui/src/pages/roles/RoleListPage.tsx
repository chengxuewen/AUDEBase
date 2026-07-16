import type { ReactNode } from 'react'
import { Button, Empty, Space, Spin, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useRoles } from './hooks/useRoles.js'

interface RoleItem {
  id: string
  name: string
  display_name: string
  permissions: unknown[]
  user_count: number
}

interface PaginatedData<T> {
  data: T[]
  meta: { count: number; page: number; pageSize: number; totalPages: number }
}

export function RoleListPage(): ReactNode {
  const { data, isLoading, isError } = useRoles()

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

  const paginated = data as PaginatedData<RoleItem> | undefined
  const list = paginated?.data ?? []

  if (list.length === 0) {
    return <Empty description="暂无角色" />
  }

  const columns: ColumnsType<RoleItem> = [
    { title: '角色名称', dataIndex: 'name', key: 'name' },
    { title: '显示名称', dataIndex: 'display_name', key: 'display_name' },
    { title: '用户数', dataIndex: 'user_count', key: 'user_count' },
    {
      title: '操作',
      key: 'action',
      render: () => (
        <Space>
          <Button size="small" autoInsertSpace={false}>编辑</Button>
          <Button size="small" autoInsertSpace={false}>删除</Button>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Button type="primary" autoInsertSpace={false}>新建角色</Button>
      </div>
      <Table<RoleItem> rowKey="id" columns={columns} dataSource={list} pagination={false} />
    </div>
  )
}
