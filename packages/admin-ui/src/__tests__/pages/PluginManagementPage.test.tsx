import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PluginManagementPage from "../../pages/PluginManagementPage";
import { AuthProvider } from "../../auth/AuthContext";
import { apiClient } from "../../api/client";

// --- Mock apiClient ---
vi.mock("../../api/client", () => {
  const getMock = vi.fn();

  class MockApiClient {
    get = getMock;
    post = vi.fn();
    patch = vi.fn();
    delete = vi.fn();
    setToken = vi.fn();
    getToken = vi.fn(() => "test-token");
  }

  return {
    apiClient: new MockApiClient(),
    ApiClient: MockApiClient,
    __mocks: { getMock },
  };
});

const mockPlugins = [
  {
    id: "00000000-0000-0000-0000-000000000001",
    name: "plugin-core",
    version: "0.1.0",
    display_name: "内核插件",
    state: "enabled",
    category: "SYSTEM",
    description: "平台核心引导插件",
    author: "AUDEBase",
    license: "Apache-2.0",
    dependencies: [],
    runtime_mode: "inline",
    runtime_partition: "SYSTEM",
    auto_install: true,
    installed_at: "2026-07-14T00:00:00Z",
  },
  {
    id: "00000000-0000-0000-0000-000000000002",
    name: "plugin-rbac",
    version: "0.1.0",
    display_name: "RBAC 权限引擎",
    state: "enabled",
    category: "SYSTEM",
    description: "基于角色的访问控制",
    author: "AUDEBase",
    license: "Apache-2.0",
    dependencies: ["plugin-core"],
    runtime_mode: "inline",
    runtime_partition: "SYSTEM",
    auto_install: true,
    installed_at: "2026-07-14T00:00:00Z",
  },
  {
    id: "00000000-0000-0000-0000-000000000003",
    name: "plugin-audit",
    version: "0.1.0",
    display_name: "审计日志",
    state: "loaded",
    category: "SYSTEM",
    description: "自动记录 API 写操作审计日志",
    author: "AUDEBase",
    license: "Apache-2.0",
    dependencies: ["plugin-core"],
    runtime_mode: "inline",
    runtime_partition: "SYSTEM",
    auto_install: false,
    installed_at: "2026-07-14T00:00:00Z",
  },
  {
    id: "00000000-0000-0000-0000-000000000004",
    name: "plugin-health-check",
    version: "0.1.0",
    display_name: "健康检查",
    state: "enabled",
    category: "SYSTEM",
    description: "提供 GET /health 和 /health/ready 端点",
    author: "AUDEBase",
    license: "Apache-2.0",
    dependencies: [],
    runtime_mode: "inline",
    runtime_partition: "SYSTEM",
    auto_install: true,
    installed_at: "2026-07-14T00:00:00Z",
  },
  {
    id: "00000000-0000-0000-0000-000000000005",
    name: "plugin-i18n",
    version: "0.1.0",
    display_name: "国际化",
    state: "disabled",
    category: "SYSTEM",
    description: "多语言支持",
    author: "AUDEBase",
    license: "Apache-2.0",
    dependencies: ["plugin-core"],
    runtime_mode: "inline",
    runtime_partition: "SYSTEM",
    auto_install: false,
    installed_at: null,
  },
];

const mockApiResponse = {
  data: mockPlugins,
  meta: { count: 5, page: 1, pageSize: 20, totalPages: 1 },
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  localStorage.setItem("aude_access_token", "test-token");
  localStorage.setItem(
    "aude_user",
    JSON.stringify({
      id: "u1",
      tenant_id: "t1",
      username: "admin",
      display_name: "管理员",
      must_change_password: false,
      roles: ["admin"],
    }),
  );

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AuthProvider>
          <PluginManagementPage />
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const mocks = apiClient as unknown as { get: ReturnType<typeof vi.fn> };

describe("PluginManagementPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockResolvedValue(mockApiResponse);
  });

  it("renders table with mock data from API", async () => {
    // Act
    renderPage();

    // Assert — ProTable renders asynchronously
    await waitFor(() => {
      expect(screen.getByText("内核插件")).toBeDefined();
    });
    await waitFor(() => {
      expect(screen.getByText("RBAC 权限引擎")).toBeDefined();
    });
    expect(screen.getByText("审计日志")).toBeDefined();
    expect(screen.getByText("健康检查")).toBeDefined();
    expect(screen.getByText("国际化")).toBeDefined();
  });

  it("shows version column", async () => {
    // Act
    renderPage();

    // Assert
    await waitFor(() => {
      const versionCells = screen.getAllByText("0.1.0");
      expect(versionCells.length).toBeGreaterThanOrEqual(5);
    });
  });

  it("shows category tags", async () => {
    // Act
    renderPage();

    // Assert
    await waitFor(() => {
      const systemTags = screen.getAllByText("SYSTEM");
      expect(systemTags.length).toBeGreaterThanOrEqual(5);
    });
  });

  it("shows status badges", async () => {
    // Act
    renderPage();

    // Assert
    await waitFor(() => {
      const badges = screen.getAllByText("运行中");
      expect(badges.length).toBeGreaterThanOrEqual(2);
    });
    expect(screen.getByText("已禁用")).toBeDefined();
  });

  it("opens detail modal when clicking view button", async () => {
    // Act
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("内核插件")).toBeDefined();
    });

    const detailButtons = screen.getAllByText("详情");
    fireEvent.click(detailButtons[0]!);

    // Assert
    await waitFor(() => {
      expect(screen.getByText("插件详情")).toBeDefined();
    });
    const pkgNameEls = screen.getAllByText("plugin-core");
    expect(pkgNameEls.length).toBeGreaterThanOrEqual(1);
  });

  it("calls API with correct params", async () => {
    // Act
    renderPage();

    // Assert
    await waitFor(() => {
      expect(mocks.get).toHaveBeenCalledWith(
        "/plugins",
        expect.objectContaining({ page: expect.any(Number), pageSize: expect.any(Number) }),
      );
    });
  });
});
