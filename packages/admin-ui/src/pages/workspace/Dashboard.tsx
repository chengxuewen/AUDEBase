import { useList } from '@refinedev/core'
import { Card, Row, Col, Statistic, Table, Badge } from 'antd'
import {
  PrinterOutlined,
  CheckCircleOutlined,
  DesktopOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import type { ReactNode } from 'react'

type Row = Record<string, unknown>

export function Dashboard(): ReactNode {
  const { result: jobsResult } = useList<Row>({ resource: 'print_jobs' })
  const { result: devicesResult } = useList<Row>({ resource: 'devices' })

  const jobs = (jobsResult?.data as Row[]) ?? []
  const devices = (devicesResult?.data as Row[]) ?? []

  const printing = jobs.filter((j: Row) => j.status === 'printing').length
  const doneToday = jobs.filter((j: Row) => j.status === 'done').length
  const onlineDevices = devices.filter((d: Row) => d.status === 'online').length
  const failedCount = jobs.filter((j: Row) => j.status === 'failed').length

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col span={6}>
          <Card>
            <Statistic
              title="打印中"
              value={printing}
              prefix={<PrinterOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="今日完成"
              value={doneToday}
              prefix={<CheckCircleOutlined />}
              suffix="件"
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="在线设备"
              value={onlineDevices}
              prefix={<DesktopOutlined />}
              suffix={`/ ${devices.length}`}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="异常任务"
              value={failedCount}
              prefix={<WarningOutlined />}
              valueStyle={{ color: failedCount > 0 ? '#ff4d4f' : undefined }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={12}>
          <Card title="打印机状态">
            <Table<Row>
              dataSource={devices}
              rowKey="id"
              pagination={false}
              size="small"
              columns={[
                {
                  dataIndex: 'name',
                  title: '设备',
                  render: (name: string, record: Row) => (
                    <span>
                      <Badge
                        status={record.status === 'online' ? 'success' : 'error'}
                        style={{ marginRight: 8 }}
                      />
                      {name}
                    </span>
                  ),
                },
                { dataIndex: 'model', title: '型号' },
                {
                  dataIndex: 'status',
                  title: '状态',
                  render: (s: string) => {
                    const map: Record<string, { status: 'success' | 'processing' | 'error' | 'default'; text: string }> = {
                      online: { status: 'success', text: '在线' },
                      printing: { status: 'processing', text: '打印中' },
                      error: { status: 'error', text: '异常' },
                    }
                    const item = map[s] || { status: 'default' as const, text: s }
                    return <Badge status={item.status} text={item.text} />
                  },
                },
              ]}
            />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="最近任务">
            <Table<Row>
              dataSource={jobs.slice(0, 10)}
              rowKey="id"
              pagination={false}
              size="small"
              columns={[
                { dataIndex: 'name', title: '任务', ellipsis: true },
                {
                  dataIndex: 'status',
                  title: '状态',
                  width: 100,
                  render: (s: string) => {
                    const map: Record<string, { status: 'success' | 'processing' | 'error' | 'default'; text: string }> = {
                      printing: { status: 'processing', text: '打印中' },
                      done: { status: 'success', text: '完成' },
                      failed: { status: 'error', text: '失败' },
                      queued: { status: 'default', text: '排队中' },
                    }
                    const item = map[s] || { status: 'default' as const, text: s }
                    return <Badge status={item.status} text={item.text} />
                  },
                },
              ]}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}
