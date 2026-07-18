import { Suspense, type ReactNode } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import ProLayout, { PageContainer } from "@ant-design/pro-layout";
import { ErrorBoundary } from "react-error-boundary";
import { Button, Result } from "antd";
import {
  DashboardOutlined,
  UserOutlined,
  AppstoreOutlined,
  LogoutOutlined,
} from "@ant-design/icons";
import { useAuth } from "../auth/AuthContext";

interface MenuItem {
  path: string;
  name: string;
  icon: ReactNode;
}

const menuData: MenuItem[] = [
  { path: "/", name: "仪表盘", icon: <DashboardOutlined /> },
  { path: "/users", name: "用户管理", icon: <UserOutlined /> },
  { path: "/plugins", name: "插件管理", icon: <AppstoreOutlined /> },
];

function PageErrorFallback({
  error,
  resetErrorBoundary,
}: {
  error: Error;
  resetErrorBoundary: () => void;
}) {
  return (
    <Result
      status="error"
      title="页面加载失败"
      subTitle={error.message}
      extra={
        <Button type="primary" onClick={resetErrorBoundary}>
          重试
        </Button>
      }
    />
  );
}

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();

  const handleMenuClick = (path: string) => {
    void navigate(path);
  };

  const handleLogout = () => {
    void logout();
    void navigate("/login", { replace: true });
  };

  return (
    <ProLayout
      title="AUDEBase"
      logo={null}
      location={{ pathname: location.pathname }}
      menuDataRender={() =>
        menuData.map((item) => ({
          ...item,
          key: item.path,
        }))
      }
      menuItemRender={(item, dom) => <a onClick={() => handleMenuClick(item.path ?? "/")}>{dom}</a>}
      rightContentRender={() => (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span>{user?.display_name ?? user?.username}</span>
          <Button type="text" icon={<LogoutOutlined />} onClick={handleLogout}>
            退出
          </Button>
        </div>
      )}
    >
      <PageContainer>
        <ErrorBoundary FallbackComponent={PageErrorFallback} key={location.pathname}>
          <Suspense fallback={<div>加载中...</div>}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </PageContainer>
    </ProLayout>
  );
}
