import type { ReactNode } from 'react'
import { Empty, Spin, Table } from 'antd'
import type { ColumnsType } from 'antd/es/table'
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
  const { data, isLoading, isError } = useAuditLogs()

  if (isLoading) {
    return <Spin />
  }

  if (isError) {
    return <div>加载失败</div>
  }

  const paginated = data as PaginatedData<AuditLogItem> | undefined
  const list = paginated?.data ?? []

  if (list.length === 0) {
    return <Empty description="暂无日志" />
  }

  const columns: ColumnsType<AuditLogItem> = [
    { title: '操作', dataIndex: 'action', key: 'action' },
    { title: '资源类型', dataIndex: 'resource_type', key: 'resource_type' },
    { title: '资源ID', dataIndex: 'resource_id', key: 'resource_id' },
    { title: '操作人', dataIndex: 'actor_id', key: 'actor_id' },
    { title: 'IP', dataIndex: 'ip', key: 'ip' },
    { title: '时间', dataIndex: 'created_at', key: 'created_at' },
  ]

  return <Table<AuditLogItem> rowKey="id" columns={columns} dataSource={list} pagination={false} />
}
