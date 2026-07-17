import type { ReactNode } from 'react'
import { Empty, Spin, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import { useTranslation } from 'react-i18next'
import { useAuditLogs } from './hooks/useAuditLogs.js'

interface AuditLogItem {
  id: string
  tenant_id: string | null
  actor_id: string
  action: string
  resource_type: string
  resource_id: string
  old_values: unknown
  new_values: unknown
  ip: string
  user_agent: string
  created_at: string
}

interface PaginatedData<T> {
  data: T[]
  meta: { count: number; page: number; pageSize: number; totalPages: number }
}

export function AuditLogPage(): ReactNode {
  const { t } = useTranslation('client')
  const { data, isLoading, isError } = useAuditLogs()

  if (isLoading) {
    return <Spin />
  }

  if (isError) {
    return <div>{t('common.loadFailed')}</div>
  }

  const paginated = data as PaginatedData<AuditLogItem> | undefined
  const list = paginated?.data ?? []

  if (list.length === 0) {
    return <Empty description={t('audit.noData')} />
  }

  const columns: ColumnsType<AuditLogItem> = [
    { title: t('audit.action'), dataIndex: 'action', key: 'action' },
    { title: t('audit.resourceType'), dataIndex: 'resource_type', key: 'resource_type' },
    { title: t('audit.resourceId'), dataIndex: 'resource_id', key: 'resource_id' },
    { title: t('audit.actorId'), dataIndex: 'actor_id', key: 'actor_id' },
    { title: t('audit.ip'), dataIndex: 'ip', key: 'ip' },
    { title: t('audit.createdAt'), dataIndex: 'created_at', key: 'created_at' },
  ]

  return <Table<AuditLogItem> rowKey="id" columns={columns} dataSource={list} pagination={false} />
}
