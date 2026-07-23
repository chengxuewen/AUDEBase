import { useList } from '@refinedev/core'
import { useState } from 'react'
import { Table, Card } from 'antd'
import { toProTableColumn } from '../../mapper/field-mapping.js'
import { printJobsCollection } from '../../collections/print_jobs.js'
import { RealtimeMonitor } from './RealtimeMonitor.js'
import type { ReactNode } from 'react'

// ponytail: Row alias avoids shadowing built-in Record<K,V>
type Row = Record<string, unknown>

export function PrintJobsPage(): ReactNode {
  const { result } = useList<Row>({ resource: 'print_jobs' })
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const columns = (printJobsCollection.fields ?? []).map(toProTableColumn)

  return (
    <div style={{ display: 'flex', gap: 16, minHeight: 'calc(100vh - 160px)' }}>
      {/* Left: Task List */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <Card title="打印任务" size="small">
          <Table<Row>
            columns={columns}
            dataSource={(result?.data as Row[]) ?? []}
            rowKey="id"
            size="small"
            onRow={(record: Row) => ({
              onClick: () => setSelectedId(record.id as string),
              style: {
                background: record.id === selectedId ? '#e6f7ff' : undefined,
                cursor: 'pointer',
              },
            })}
          />
        </Card>
      </div>

      {/* Right: Real-time Monitor */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {selectedId !== null ? (
          <RealtimeMonitor jobId={selectedId} />
        ) : (
          <Card size="small">
            <div style={{ textAlign: 'center', color: '#999', paddingTop: 80 }}>
              点击左侧任务查看实时监控
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
