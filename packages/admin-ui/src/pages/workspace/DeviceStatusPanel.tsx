import { useState, useEffect, useRef, useCallback } from 'react'
import { Card, Descriptions, Badge, Space } from 'antd'
import type { ReactNode } from 'react'

interface DeviceStatus {
  name?: string
  state?: string
  uptime?: number
  envTemp?: number
  envHumidity?: number
  airPressure?: number
  lastHeartbeat?: string
}

export function DeviceStatusPanel({ deviceId }: { deviceId: string }): ReactNode {
  const [status, setStatus] = useState<DeviceStatus | null>(null)
  const [online, setOnline] = useState(true)
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  const poll = useCallback(async (active: boolean) => {
    if (!active) return
    try {
      const res = await fetch(`/api/v1/devices/${deviceId}/status`)
      if (!active) return
      const json = await res.json()
      const deviceData = (json.data ?? json) as DeviceStatus
      setOnline(Date.now() - new Date(deviceData.lastHeartbeat ?? 0).getTime() < 30000)
      setStatus(deviceData)
    } catch {
      setOnline(false)
    }
  }, [deviceId])

  useEffect(() => {
    let active = true

    poll(active)
    intervalRef.current = setInterval(() => { void poll(active) }, 5000)

    return () => {
      active = false
      clearInterval(intervalRef.current)
    }
  }, [poll])

  if (!status) return <Card loading size="small" />

  return (
    <Card
      size="small"
      title={
        <Space>
          <Badge status={online ? 'success' : 'error'} />
          {status.name ?? deviceId}
        </Space>
      }
    >
      <Descriptions column={1} size="small">
        <Descriptions.Item label="在线状态">
          {online ? '🟢 在线' : '🔴 离线'}
        </Descriptions.Item>
        <Descriptions.Item label="运行状态">{status.state ?? '-'}</Descriptions.Item>
        <Descriptions.Item label="运行时长">
          {status.uptime ? `${Math.floor(status.uptime / 3600)}h` : '-'}
        </Descriptions.Item>
        <Descriptions.Item label="环境温度">{status.envTemp ?? '-'}°C</Descriptions.Item>
        <Descriptions.Item label="环境湿度">{status.envHumidity ?? '-'}%</Descriptions.Item>
        <Descriptions.Item label="气压">{status.airPressure ?? '-'} kPa</Descriptions.Item>
        <Descriptions.Item label="上次心跳">
          {status.lastHeartbeat ? new Date(status.lastHeartbeat).toLocaleString() : '-'}
        </Descriptions.Item>
      </Descriptions>
    </Card>
  )
}
