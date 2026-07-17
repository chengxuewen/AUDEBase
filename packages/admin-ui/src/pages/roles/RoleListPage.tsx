import type { ReactNode } from 'react'
import { Button, Empty, Space, Spin, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation('client')
  const { data, isLoading, isError } = useRoles()

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

  const paginated = data as PaginatedData<RoleItem> | undefined
  const list = paginated?.data ?? []

  if (list.length === 0) {
    return <Empty description={t('roles.noData')} />
  }

  const columns: ColumnsType<RoleItem> = [
    { title: t('roles.name'), dataIndex: 'name', key: 'name' },
    { title: t('roles.displayName'), dataIndex: 'display_name', key: 'display_name' },
    { title: t('roles.userCount'), dataIndex: 'user_count', key: 'user_count' },
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
        <Button type="primary" autoInsertSpace={false}>{t('common.createRole')}</Button>
      </div>
      <Table<RoleItem> rowKey="id" columns={columns} dataSource={list} pagination={false} />
    </div>
  )
}
