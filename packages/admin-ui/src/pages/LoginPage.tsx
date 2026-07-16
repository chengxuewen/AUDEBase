import type { ReactNode } from 'react'
import { Button, Card, Form, Input } from 'antd'

interface LoginPageProps {
  onSubmit?: (values: { username: string; password: string }) => void
}

export function LoginPage({ onSubmit }: LoginPageProps): ReactNode {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <Card title="登录" style={{ width: 400 }}>
        <Form onFinish={onSubmit}>
          <Form.Item name="username" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input placeholder="用户名" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '请输入密码' }]}>
            <Input.Password placeholder="密码" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block>
              登录
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}
