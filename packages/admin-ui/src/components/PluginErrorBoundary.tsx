import type { ReactNode } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import { Button, Result } from 'antd'

interface PluginErrorBoundaryProps {
  pluginName: string
  children: ReactNode
}

function FallbackUI({ pluginName, resetErrorBoundary }: { pluginName: string; resetErrorBoundary: () => void }): ReactNode {
  return (
    <Result
      status="error"
      title={`${pluginName} 异常`}
      subTitle={`插件 ${pluginName} 发生崩溃`}
      extra={[
        <Button key="retry" type="primary" autoInsertSpace={false} onClick={resetErrorBoundary}>
          重试
        </Button>,
        <a key="home" href="/">
          <Button autoInsertSpace={false}>返回首页</Button>
        </a>,
      ]}
    />
  )
}

export function PluginErrorBoundary({ pluginName, children }: PluginErrorBoundaryProps): ReactNode {
  return (
    <ErrorBoundary fallbackRender={({ resetErrorBoundary }) => <FallbackUI pluginName={pluginName} resetErrorBoundary={resetErrorBoundary} />}>
      {children}
    </ErrorBoundary>
  )
}
