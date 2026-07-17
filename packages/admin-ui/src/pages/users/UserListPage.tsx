import type { ReactNode } from 'react'
import { Button, Empty, Space, Spin, Switch, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation('client')
  const { data, isLoading, isError } = useUsers()

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

  const paginated = data as PaginatedData<UserItem> | undefined
  const list = paginated?.data ?? []

  if (list.length === 0) {
    return <Empty description={t('users.noData')} />
  }

  const columns: ColumnsType<UserItem> = [
    { title: t('users.username'), dataIndex: 'username', key: 'username' },
    {
      title: t('users.status'),
      dataIndex: 'is_active',
      key: 'is_active',
      render: (active: boolean) => <Switch checked={active} />,
    },
    { title: t('users.tenantId'), dataIndex: 'tenant_id', key: 'tenant_id' },
    {
      title: t('common.actions'),
      key: 'action',
      render: () => (
        <Space>
          <Button size="small" autoInsertSpace={false}>{t('common.edit')}</Button>
          <Button size="small" autoInsertSpace={false}>{t('common.delete')}</Button>
        </Space>
      ),
    },
  ]

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Button type="primary" autoInsertSpace={false}>{t('common.createUser')}</Button>
      </div>
      <Table<UserItem> rowKey="id" columns={columns} dataSource={list} pagination={false} />
    </div>
  )
}
