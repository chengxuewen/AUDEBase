import { Routes, Route, Navigate } from "react-router-dom";
import { ErrorBoundary } from "react-error-boundary";
import { Button, Result } from "antd";
import { AuthProvider, AclProvider } from "./auth/AuthContext";
import AdminLayout from "./layout/AdminLayout";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import PluginManagementPage from "./pages/PluginManagementPage";
import RoleManagementPage from "./pages/RoleManagementPage";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem("aude_access_token");
  if (token === null || token.length === 0) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function TopLevelErrorFallback({
  error,
  resetErrorBoundary,
}: {
  error: Error;
  resetErrorBoundary: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
      }}
    >
      <Result
        status="error"
        title="应用错误"
        subTitle={error.message}
        extra={
          <Button type="primary" onClick={resetErrorBoundary}>
            重试
          </Button>
        }
      />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary FallbackComponent={TopLevelErrorFallback}>
      <AuthProvider>
        <AclProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/admin/*"
              element={
                <ProtectedRoute>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<DashboardPage />} />
              <Route path="users" element={<div>用户管理（待实现）</div>} />
              <Route path="plugins" element={<PluginManagementPage />} />
              <Route path="roles" element={<RoleManagementPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </AclProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
