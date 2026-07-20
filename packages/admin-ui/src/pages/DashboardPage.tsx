import { useQuery } from "@tanstack/react-query";
import { Card, Col, Row, Statistic, Typography, Skeleton, Result, Button, Tag } from "antd";
import {
  UserOutlined,
  AppstoreOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DatabaseOutlined,
  CloseCircleOutlined,
} from "@ant-design/icons";
import { apiClient } from "../api/client";
import type { ApiListResponse, User } from "@audebase/shared-types";

/** GET /health response shape (ponytail: inline type, no shared-types export yet) */
interface HealthResponse {
  status: string;
  db: boolean;
  redis?: boolean;
  uptime: number;
  timestamp?: string;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${seconds}s`;
}

export default function DashboardPage() {
  const usersQuery = useQuery({
    queryKey: ["admin-ui", "users", "count"],
    queryFn: () =>
      apiClient.get<ApiListResponse<User>>("/users", {
        page: "1",
        pageSize: "1",
      }),
  });

  const pluginsQuery = useQuery({
    queryKey: ["admin-ui", "plugins", "count"],
    queryFn: () =>
      apiClient.get<ApiListResponse<unknown>>("/plugins", {
        page: "1",
        pageSize: "1",
      }),
  });

  const healthQuery = useQuery({
    queryKey: ["admin-ui", "health"],
    queryFn: () => apiClient.get<HealthResponse>("/health"),
    refetchInterval: 30_000,
  });

  const userCount = usersQuery.data?.meta.count;
  const pluginCount = pluginsQuery.data?.meta.count;
  const health = healthQuery.data;

  // Error state: show Result only if all queries failed
  if (usersQuery.isError && pluginsQuery.isError && healthQuery.isError) {
    return (
      <Result
        status="error"
        title="无法加载系统概览"
        subTitle={usersQuery.error?.message ?? "请检查网络连接后重试"}
        extra={
          <Button
            type="primary"
            onClick={() => {
              void usersQuery.refetch();
              void pluginsQuery.refetch();
              void healthQuery.refetch();
            }}
          >
            重试
          </Button>
        }
      />
    );
  }

  const isLoading = usersQuery.isLoading || healthQuery.isLoading;

  return (
    <div data-testid="dashboard-sidebar-menu">
      <Typography.Title level={4} data-testid="dashboard-welcome-text">系统概览</Typography.Title>
      <Row gutter={[16, 16]} data-testid="dashboard-stats-cards">
        <Col xs={24} sm={12} md={6}>
          <Card>
            {usersQuery.isLoading ? (
              <Skeleton active paragraph={{ rows: 1 }} title={false} />
            ) : (
              <Statistic title="用户总数" value={userCount ?? 0} prefix={<UserOutlined />} />
            )}
          </Card>
        </Col>

        <Col xs={24} sm={12} md={6}>
          <Card>
            {pluginsQuery.isLoading ? (
              <Skeleton active paragraph={{ rows: 1 }} title={false} />
            ) : (
              <Statistic title="活跃插件" value={pluginCount ?? 0} prefix={<AppstoreOutlined />} />
            )}
          </Card>
        </Col>

        <Col xs={24} sm={12} md={6}>
          <Card>
            {healthQuery.isLoading ? (
              <Skeleton active paragraph={{ rows: 1 }} title={false} />
            ) : health !== undefined ? (
              <Statistic
                title="系统状态"
                value={health.status === "ok" ? "正常" : "异常"}
                prefix={health.status === "ok" ? <CheckCircleOutlined /> : <CloseCircleOutlined />}
                valueStyle={{
                  color: health.status === "ok" ? "#52c41a" : "#ff4d4f",
                }}
              />
            ) : null}
          </Card>
        </Col>

        <Col xs={24} sm={12} md={6}>
          <Card>
            {healthQuery.isLoading ? (
              <Skeleton active paragraph={{ rows: 1 }} title={false} />
            ) : health !== undefined ? (
              <Statistic
                title="运行时间"
                value={formatUptime(health.uptime)}
                prefix={<ClockCircleOutlined />}
              />
            ) : null}
          </Card>
        </Col>
      </Row>

      {!isLoading && health !== undefined && (
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={24} sm={12} md={6}>
            <Card size="small">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>
                  <DatabaseOutlined style={{ marginRight: 8 }} />
                  数据库
                </span>
                <Tag color={health.db ? "green" : "red"}>{health.db ? "正常" : "异常"}</Tag>
              </div>
            </Card>
          </Col>
          {health.redis !== undefined && (
            <Col xs={24} sm={12} md={6}>
              <Card size="small">
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span>
                    <DatabaseOutlined style={{ marginRight: 8 }} />
                    Redis
                  </span>
                  <Tag color={health.redis ? "green" : "red"}>{health.redis ? "正常" : "异常"}</Tag>
                </div>
              </Card>
            </Col>
          )}
        </Row>
      )}
    </div>
  );
}
