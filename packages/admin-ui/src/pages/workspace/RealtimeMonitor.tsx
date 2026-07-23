import { useState, useEffect, useRef, useCallback } from 'react'
import { Card, Descriptions, Progress, Tag, Badge, Space } from 'antd'
import type { ReactNode } from 'react'

interface JobStatus {
  status: string
  progress: number
  nozzleTemp: number
  bedTemp: number
  elapsed: number
  errors: string[]
}

export function RealtimeMonitor({ jobId }: { jobId: string }): ReactNode {
  const [status, setStatus] = useState<JobStatus | null>(null)
  // ponytail: undefined init satisfies exactOptionalPropertyTypes (useRef() with no arg is ambiguous)
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  const poll = useCallback(async (active: boolean) => {
    if (!active) return
    try {
      const res = await fetch(`/api/v1/print_jobs/${jobId}/status`)
      if (!active) return
      const json = await res.json()
      setStatus((json.data ?? json) as JobStatus)
    } catch {
      // ponytail: polling is best-effort, silent on network errors
    }
  }, [jobId])

  useEffect(() => {
    let active = true

    poll(active)
    intervalRef.current = setInterval(() => { void poll(active) }, 5000)

    // ① Cleanup on unmount
    return () => {
      active = false
      clearInterval(intervalRef.current)
    }
  }, [poll])

  // ② Pause polling when tab is hidden
  useEffect(() => {
    let wasPaused = false
    const onVisibility = () => {
      if (document.hidden) {
        wasPaused = true
        clearInterval(intervalRef.current)
      } else if (wasPaused) {
        wasPaused = false
        void poll(true)
        intervalRef.current = setInterval(() => { void poll(true) }, 5000)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [poll])

  if (!status) return <Card loading size="small" />

  const badgeStatus =
    status.status === 'printing' ? 'processing' as const
    : status.status === 'done' ? 'success' as const
    : status.status === 'failed' ? 'error' as const
    : 'default' as const

  return (
    <Card title="实时监控" size="small">
      <Space direction="vertical" style={{ width: '100%' }}>
        <Descriptions column={1} size="small">
          <Descriptions.Item label="状态">
            <Badge status={badgeStatus} text={status.status} />
          </Descriptions.Item>
          <Descriptions.Item label="喷头温度">{status.nozzleTemp}°C</Descriptions.Item>
          <Descriptions.Item label="热床温度">{status.bedTemp}°C</Descriptions.Item>
          <Descriptions.Item label="已耗时">
            {Math.floor(status.elapsed / 60)}min {status.elapsed % 60}s
          </Descriptions.Item>
        </Descriptions>
        <Progress
          percent={status.progress}
          {...(status.status === 'failed' ? { status: 'exception' } : {})}
        />
        {status.errors.length > 0 && (
          <div style={{ color: 'red' }}>
            <span>⚠️ 异常: </span>
            {status.errors.map((e: string, i: number) => (
              <Tag key={i} color="red">{e}</Tag>
            ))}
          </div>
        )}
      </Space>
    </Card>
  )
}
