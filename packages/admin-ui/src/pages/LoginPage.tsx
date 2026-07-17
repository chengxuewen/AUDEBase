import { useState } from 'react'
import type { ReactNode } from 'react'
import { Button, Card, Form, Input, message } from 'antd'
import { apiPost, setTokens } from '../api/client.js'

interface LoginPageProps {
  onLogin?: () => void
}

interface LoginResponse {
  access_token: string
  refresh_token: string
}

export function LoginPage({ onLogin }: LoginPageProps): ReactNode {
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (values: { username: string; password: string }): Promise<void> => {
    setLoading(true)
    try {
      const result = await apiPost<LoginResponse>('/api/auth/login', values)
      setTokens(result.access_token, result.refresh_token)
      onLogin?.()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed'
      void message.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <Card title="登录" style={{ width: 400 }}>
        <Form onFinish={handleSubmit}>
          <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input placeholder="用户名" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password placeholder="密码" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>
              登录
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}
