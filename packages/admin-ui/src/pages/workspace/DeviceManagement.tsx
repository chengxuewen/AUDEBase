import { useList } from '@refinedev/core'
import { useState } from 'react'
import { Table, Card } from 'antd'
import { toProTableColumn } from '../../mapper/field-mapping.js'
import { devicesCollection } from '../../collections/devices.js'
import { DeviceStatusPanel } from './DeviceStatusPanel.js'
import type { ReactNode } from 'react'

// ponytail: Row alias avoids shadowing built-in Record<K,V>
type Row = Record<string, unknown>

export function DeviceManagement(): ReactNode {
  const { result } = useList<Row>({ resource: 'devices' })
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const columns = (devicesCollection.fields ?? []).map(toProTableColumn)

  return (
    <div style={{ display: 'flex', gap: 16, minHeight: 'calc(100vh - 160px)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Card title="设备列表" size="small">
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
      <div style={{ flex: 1, minWidth: 0 }}>
        {selectedId !== null ? (
          <DeviceStatusPanel deviceId={selectedId} />
        ) : (
          <Card size="small">
            <div style={{ textAlign: 'center', color: '#999', paddingTop: 80 }}>
              点击设备查看实时状态
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
