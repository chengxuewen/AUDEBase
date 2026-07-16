import type { ReactNode } from 'react'
import { Button, Empty, Space, Spin, Switch, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useUsers } from './hooks/useUsers.js'

interface UserItem {
  id: string
  username: string
  is_active: boolean
  tenant_id: string | null
  created_at: string
}

interface PaginatedData<T> {
  data: T[]
  meta: { count: number; page: number; pageSize: number; totalPages: number }
}

export function UserListPage(): ReactNode {
  const { data, isLoading, isError } = useUsers()

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

  const paginated = data as PaginatedData<UserItem> | undefined
  const list = paginated?.data ?? []

  if (list.length === 0) {
    return <Empty description="暂无用户" />
  }

  const columns: ColumnsType<UserItem> = [
    { title: '用户名', dataIndex: 'username', key: 'username' },
    {
      title: '状态',
      dataIndex: 'is_active',
      key: 'is_active',
      render: (active: boolean) => <Switch checked={active} />,
    },
    { title: '租户', dataIndex: 'tenant_id', key: 'tenant_id' },
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
        <Button type="primary" autoInsertSpace={false}>新建用户</Button>
      </div>
      <Table<UserItem> rowKey="id" columns={columns} dataSource={list} pagination={false} />
    </div>
  )
}
