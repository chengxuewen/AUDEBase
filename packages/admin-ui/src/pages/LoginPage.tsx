import { useState } from 'react'
import type { ReactNode } from 'react'
import { Button, Card, Form, Input, message } from 'antd'
import { useTranslation } from 'react-i18next'
import { apiPost, setTokens } from '../api/client.js'

interface LoginPageProps {
  onLogin?: () => void
}

interface LoginResponse {
  access_token: string
  refresh_token: string
}

export function LoginPage({ onLogin }: LoginPageProps): ReactNode {
  const { t } = useTranslation('client')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (values: { username: string; password: string }): Promise<void> => {
    setLoading(true)
    try {
      const result = await apiPost<LoginResponse>('/api/auth/login', values)
      setTokens(result.access_token, result.refresh_token)
      onLogin?.()
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('login.failed')
      void message.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <Card title={t('login.title')} style={{ width: 400 }}>
        <Form onFinish={handleSubmit}>
          <Form.Item name="username" rules={[{ required: true, message: t('login.usernameRequired') }]}>
            <Input placeholder={t('login.username')} data-testid="login-username-input" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: t('login.passwordRequired') }]}>
            <Input.Password placeholder={t('login.password')} data-testid="login-password-input" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading} data-testid="login-submit-btn">
              {t('login.submit')}
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}
